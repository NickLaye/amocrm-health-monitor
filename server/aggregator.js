const { CHECK_TYPES, RESOLUTIONS, DEFAULT_CLIENT_ID } = require('./config/constants');
const clientRegistry = require('./config/client-registry');
const database = require('./database');
const { createLogger } = require('./utils/logger');

const logger = createLogger('Aggregator');

const RESOLUTION_WINDOW_MS = {
  [RESOLUTIONS.HOUR]: 60 * 60 * 1000,
  [RESOLUTIONS.DAY]: 24 * 60 * 60 * 1000
};

class HealthCheckAggregator {
  constructor() {
    this.timers = [];
    this.running = false;
  }

  start() {
    if (this.running) {
      this.stop();
    }

    const runHourlyJob = () => this.runForAllClients(clientId =>
      this.ensureAggregates({
        resolution: RESOLUTIONS.HOUR,
        lookbackWindows: 2,
        clientId
      })
    ).catch(err => logger.error('Hourly aggregate job failed', err));

    const runDailyJob = () => this.runForAllClients(clientId =>
      this.ensureAggregates({
        resolution: RESOLUTIONS.DAY,
        lookbackWindows: 2,
        clientId
      })
    ).catch(err => logger.error('Daily aggregate job failed', err));

    // Hourly aggregates: recompute last 2 hours every 5 minutes
    this.timers.push(setInterval(runHourlyJob, 5 * 60 * 1000));

    // Daily aggregates: recompute last 2 days every 30 minutes
    this.timers.push(setInterval(runDailyJob, 30 * 60 * 1000));

    Promise.all([
      this.runForAllClients(clientId =>
        this.ensureAggregates({ resolution: RESOLUTIONS.HOUR, lookbackWindows: 6, clientId })
      ),
      this.runForAllClients(clientId =>
        this.ensureAggregates({ resolution: RESOLUTIONS.DAY, lookbackWindows: 2, clientId })
      )
    ]).catch(err => logger.error('Initial aggregate warm-up failed', err));

    this.running = true;
    logger.info('Health check aggregator started');
  }

  stop() {
    this.timers.forEach(timer => clearInterval(timer));
    this.timers = [];
    this.running = false;
    logger.info('Health check aggregator stopped');
  }

  runForAllClients(handler) {
    const clientIds = clientRegistry.getClientIds();
    if (!clientIds.length) {
      return Promise.resolve();
    }
    return Promise.all(clientIds.map(clientId => handler(clientId)));
  }

  /**
    * Ensures aggregates exist for the provided window.
    * @param {Object} options
    */
  async ensureAggregates({
    resolution,
    clientId = DEFAULT_CLIENT_ID,
    from = null,
    to = null,
    lookbackWindows = 1,
    checkTypes = Object.values(CHECK_TYPES)
  }) {
    if (!resolution || !RESOLUTION_WINDOW_MS[resolution]) {
      throw new Error(`Unsupported resolution: ${resolution}`);
    }

    const bucketSize = RESOLUTION_WINDOW_MS[resolution];
    const now = Date.now();
    const windowEnd = to ?? now;
    const windowStart = from ?? (windowEnd - lookbackWindows * bucketSize);

    const alignedStart = this.alignToBucket(windowStart, bucketSize);
    const alignedEnd = this.alignToBucket(windowEnd, bucketSize) + bucketSize;

    for (let bucketStart = alignedStart; bucketStart < alignedEnd; bucketStart += bucketSize) {
      const bucketEnd = bucketStart + bucketSize;
      for (const checkType of checkTypes) {
        await this.computeBucket({
          resolution,
          clientId,
          checkType,
          bucketStart,
          bucketEnd
        });
      }
    }
  }

  async computeBucket({ resolution, clientId, checkType, bucketStart, bucketEnd }) {
    const rows = await database.getHealthChecksByRange({
      checkType,
      clientId,
      from: bucketStart,
      to: bucketEnd
    });

    const stats = this.calculateStats(rows);

    await database.upsertAggregate({
      periodStart: bucketStart,
      resolution,
      clientId,
      checkType,
      avgResponseTime: stats.avgResponseTime,
      p50: stats.p50,
      p95: stats.p95,
      p99: stats.p99,
      minResponseTime: stats.min,
      maxResponseTime: stats.max,
      successCount: stats.successCount,
      warningCount: stats.warningCount,
      downCount: stats.downCount,
      totalCount: stats.totalCount
    });
  }

  calculateStats(rows) {
    if (!rows || rows.length === 0) {
      return {
        avgResponseTime: null,
        p50: null,
        p95: null,
        p99: null,
        min: null,
        max: null,
        successCount: 0,
        warningCount: 0,
        downCount: 0,
        totalCount: 0
      };
    }

    const latencyValues = rows
      .map(row => Number(row.response_time))
      .filter(value => Number.isFinite(value))
      .sort((a, b) => a - b);

    const sumLatency = latencyValues.reduce((acc, value) => acc + value, 0);

    const statusCounts = rows.reduce((acc, row) => {
      const status = row.status || 'unknown';
      if (status === 'up') {
        acc.successCount += 1;
      } else if (status === 'warning') {
        acc.warningCount += 1;
      } else if (status === 'down') {
        acc.downCount += 1;
      }
      return acc;
    }, { successCount: 0, warningCount: 0, downCount: 0 });

    return {
      avgResponseTime: latencyValues.length ? Math.round(sumLatency / latencyValues.length) : null,
      p50: this.computePercentile(latencyValues, 50),
      p95: this.computePercentile(latencyValues, 95),
      p99: this.computePercentile(latencyValues, 99),
      min: latencyValues.length ? latencyValues[0] : null,
      max: latencyValues.length ? latencyValues[latencyValues.length - 1] : null,
      successCount: statusCounts.successCount,
      warningCount: statusCounts.warningCount,
      downCount: statusCounts.downCount,
      totalCount: rows.length
    };
  }

  computePercentile(sortedValues, percentile) {
    if (!sortedValues.length) {
      return null;
    }
    const index = Math.min(
      sortedValues.length - 1,
      Math.max(0, Math.ceil((percentile / 100) * sortedValues.length) - 1)
    );
    return sortedValues[index];
  }

  alignToBucket(timestamp, bucketSize) {
    return Math.floor(timestamp / bucketSize) * bucketSize;
  }

  getBucketSize(resolution) {
    if (!RESOLUTION_WINDOW_MS[resolution]) {
      throw new Error(`Unsupported resolution: ${resolution}`);
    }
    return RESOLUTION_WINDOW_MS[resolution];
  }
}

module.exports = new HealthCheckAggregator();
