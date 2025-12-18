const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { createLogger } = require('./utils/logger');
const { DEFAULT_CLIENT_ID } = require('./config/constants');

const DB_PATH = path.join(__dirname, '..', 'health_checks.db');
const logger = createLogger('Database');

// Enable query logging in development mode
const ENABLE_QUERY_LOGGING = process.env.NODE_ENV === 'development';

class Database {
  constructor() {
    this.db = null;
  }

  /**
   * Upsert aggregate row (hour/day)
   * @param {Object} payload
   */
  upsertAggregate(payload) {
    const {
      periodStart,
      resolution,
      clientId = DEFAULT_CLIENT_ID,
      checkType,
      avgResponseTime = null,
      p50 = null,
      p95 = null,
      p99 = null,
      minResponseTime = null,
      maxResponseTime = null,
      successCount = 0,
      warningCount = 0,
      downCount = 0,
      totalCount = 0
    } = payload;

    if (!periodStart || !resolution || !checkType) {
      return Promise.reject(new Error('upsertAggregate requires periodStart, resolution, checkType'));
    }

    const query = `
      INSERT INTO health_check_aggregates (
        period_start,
        resolution,
        client_id,
        check_type,
        avg_response_time,
        p50_response_time,
        p95_response_time,
        p99_response_time,
        min_response_time,
        max_response_time,
        success_count,
        warning_count,
        down_count,
        total_count,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(resolution, client_id, check_type, period_start)
      DO UPDATE SET
        avg_response_time = excluded.avg_response_time,
        p50_response_time = excluded.p50_response_time,
        p95_response_time = excluded.p95_response_time,
        p99_response_time = excluded.p99_response_time,
        min_response_time = excluded.min_response_time,
        max_response_time = excluded.max_response_time,
        success_count = excluded.success_count,
        warning_count = excluded.warning_count,
        down_count = excluded.down_count,
        total_count = excluded.total_count,
        updated_at = CURRENT_TIMESTAMP
    `;

    const params = [
      periodStart,
      resolution,
      clientId,
      checkType,
      avgResponseTime,
      p50,
      p95,
      p99,
      minResponseTime,
      maxResponseTime,
      successCount,
      warningCount,
      downCount,
      totalCount
    ];

    this.logQuery(query, params);

    return new Promise((resolve, reject) => {
      this.db.run(query, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  /**
   * Fetch aggregates for interval
   */
  getAggregates({ resolution, clientId = DEFAULT_CLIENT_ID, checkType = null, from, to }) {
    return new Promise((resolve, reject) => {
      if (!resolution) {
        reject(new Error('resolution is required'));
        return;
      }

      const params = [resolution, clientId];
      let query = `
        SELECT * FROM health_check_aggregates
        WHERE resolution = ? AND client_id = ?
      `;

      if (checkType) {
        query += ' AND check_type = ?';
        params.push(checkType);
      }

      if (typeof from === 'number') {
        query += ' AND period_start >= ?';
        params.push(from);
      }

      if (typeof to === 'number') {
        query += ' AND period_start < ?';
        params.push(to);
      }

      query += ' ORDER BY period_start ASC';
      this.logQuery(query, params);

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Fetch the latest aggregate point for given resolution/check/client.
   */
  getLatestAggregate({ resolution, clientId = DEFAULT_CLIENT_ID, checkType }) {
    return new Promise((resolve, reject) => {
      if (!resolution || !checkType) {
        reject(new Error('getLatestAggregate requires resolution and checkType'));
        return;
      }

      const query = `
        SELECT * FROM health_check_aggregates
        WHERE resolution = ? AND client_id = ? AND check_type = ?
        ORDER BY period_start DESC
        LIMIT 1
      `;
      const params = [resolution, clientId, checkType];
      this.logQuery(query, params);

      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  /**
   * Delete aggregates older than timestamp
   */
  deleteAggregatesBefore({ resolution, before }) {
    if (!resolution || typeof before !== 'number') {
      return Promise.reject(new Error('deleteAggregatesBefore requires resolution and before timestamp'));
    }

    const query = `
      DELETE FROM health_check_aggregates
      WHERE resolution = ? AND period_start < ?
    `;
    const params = [resolution, before];
    this.logQuery(query, params);

    return new Promise((resolve, reject) => {
      this.db.run(query, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  /**
   * Serializes payloads (e.g. axios error body) into truncated JSON-safe string.
   * @param {unknown} payload
   * @returns {string|null}
   */
  static serializePayload(payload) {
    if (payload === undefined || payload === null) {
      return null;
    }

    try {
      const raw = typeof payload === 'string'
        ? payload
        : JSON.stringify(payload);
      const MAX_LENGTH = 16000;
      return raw.length > MAX_LENGTH ? raw.slice(0, MAX_LENGTH) : raw;
    } catch (error) {
      logger.warn('Failed to serialize payload', { error: error.message });
      return null;
    }
  }

  /**
   * Logs SQL query for debugging (development mode only)
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   */
  logQuery(query, params = []) {
    if (ENABLE_QUERY_LOGGING) {
      logger.debug(`SQL Query: ${query}`, { params });
    }
  }

  initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
          logger.error('Error opening database', err);
          reject(err);
          return;
        }
        logger.info('Connected to SQLite database');

        // Enable WAL mode for better concurrency
        this.db.run('PRAGMA journal_mode=WAL', (walErr) => {
          if (walErr) {
            logger.warn('Failed to enable WAL mode:', walErr.message);
          } else {
            logger.debug('SQLite WAL mode enabled');
          }

          this.createTables()
            .then(resolve)
            .catch(reject);
        });
      });
    });
  }

  createTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Health checks table - stores individual check results
        this.db.run(`
          CREATE TABLE IF NOT EXISTS health_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            check_type TEXT NOT NULL,
            client_id TEXT NOT NULL DEFAULT '${DEFAULT_CLIENT_ID}',
            status TEXT NOT NULL,
            response_time INTEGER,
            http_status INTEGER,
            error_code TEXT,
            error_message TEXT,
            error_payload TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            logger.error('Error creating health_checks table', err);
            reject(err);
            return;
          }
        });

        // Incidents table - stores downtime incidents
        this.db.run(`
          CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            check_type TEXT NOT NULL,
            client_id TEXT NOT NULL DEFAULT '${DEFAULT_CLIENT_ID}',
            start_time INTEGER NOT NULL,
            end_time INTEGER,
            duration INTEGER,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            logger.error('Error creating incidents table', err);
            reject(err);
            return;
          }
        });

        // Create indices for better query performance
        // Basic indices
        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp 
          ON health_checks(timestamp)
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS health_check_aggregates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_start INTEGER NOT NULL,
            resolution TEXT NOT NULL,
            client_id TEXT NOT NULL DEFAULT '${DEFAULT_CLIENT_ID}',
            check_type TEXT NOT NULL,
            avg_response_time REAL,
            p50_response_time REAL,
            p95_response_time REAL,
            p99_response_time REAL,
            min_response_time REAL,
            max_response_time REAL,
            success_count INTEGER DEFAULT 0,
            warning_count INTEGER DEFAULT 0,
            down_count INTEGER DEFAULT 0,
            total_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            logger.error('Error creating health_check_aggregates table', err);
            reject(err);
            return;
          }
        });

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_health_checks_type 
          ON health_checks(check_type, timestamp)
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_health_checks_client 
          ON health_checks(client_id, check_type, timestamp)
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_incidents_type 
          ON incidents(check_type, start_time)
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_incidents_client 
          ON incidents(client_id, check_type, start_time)
        `);

        // Composite indices for complex queries
        // Optimize queries that filter by type, timestamp and status
        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_health_checks_type_timestamp_status 
          ON health_checks(check_type, timestamp, status)
        `);

        // Optimize queries for open incidents
        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_incidents_open 
          ON incidents(check_type, end_time, start_time)
        `);

        // Optimize response time percentile queries
        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_health_checks_response_time 
          ON health_checks(check_type, timestamp, response_time)
        `);

        this.db.run(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_health_check_aggregates_unique
          ON health_check_aggregates(resolution, client_id, check_type, period_start)
        `, (err) => {
          if (err) {
            logger.error('Error creating indices', err);
            reject(err);
          } else {
            this.ensureIncidentClientColumn()
              .then(() => {
                logger.info('Database tables and indices created successfully');
                resolve();
              })
              .catch(err => {
                logger.error('Failed to ensure incidents.client_id column', err);
                reject(err);
              });
          }
        });
      });
    });
  }

  ensureIncidentClientColumn() {
    return new Promise((resolve, reject) => {
      this.db.all('PRAGMA table_info(incidents)', (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        const hasColumn = Array.isArray(rows) && rows.some(row => row.name === 'client_id');
        if (hasColumn) {
          resolve();
          return;
        }

        const alterQuery = `
          ALTER TABLE incidents
          ADD COLUMN client_id TEXT NOT NULL DEFAULT '${DEFAULT_CLIENT_ID}'
        `;
        this.db.run(alterQuery, (alterErr) => {
          if (alterErr) {
            if (alterErr.message && alterErr.message.includes('duplicate column')) {
              resolve();
            } else {
              reject(alterErr);
            }
          } else {
            resolve();
          }
        });
      });
    });
  }

  // Insert a health check result
  insertHealthCheck(checkType, status, responseTime, options = {}) {
    const {
      errorMessage = null,
      httpStatus = null,
      errorCode = null,
      errorPayload = null,
      clientId = DEFAULT_CLIENT_ID
    } = options;

    return new Promise((resolve, reject) => {
      const timestamp = Date.now();
      const query = `INSERT INTO health_checks (
          timestamp, 
          check_type, 
          client_id,
          status, 
          response_time, 
          http_status, 
          error_code, 
          error_message,
          error_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const serializedPayload = Database.serializePayload(errorPayload);
      const params = [
        timestamp,
        checkType,
        clientId,
        status,
        responseTime,
        httpStatus,
        errorCode,
        errorMessage,
        serializedPayload
      ];

      this.logQuery(query, params);

      this.db.run(query, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, timestamp });
        }
      });
    });
  }

  // Get health checks for a specific time range
  // Note: Uses idx_health_checks_type index for optimal performance
  getHealthChecks(checkType = null, hoursBack = 24, clientId = null) {
    return new Promise((resolve, reject) => {
      const timeThreshold = Date.now() - (hoursBack * 60 * 60 * 1000);
      let query = `
        SELECT * FROM health_checks 
        WHERE timestamp > ?
      `;
      const params = [timeThreshold];

      if (checkType) {
        query += ' AND check_type = ?';
        params.push(checkType);
      }

      if (clientId) {
        query += ' AND client_id = ?';
        params.push(clientId);
      }

      query += ' ORDER BY timestamp DESC';

      this.logQuery(query, params);

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get health checks between timestamps (inclusive of start, exclusive of end)
   * @param {Object} filters
   * @param {string|null} filters.checkType
   * @param {string|null} filters.clientId
   * @param {number} filters.from - epoch ms
   * @param {number} filters.to - epoch ms
   * @returns {Promise<Array>}
   */
  getHealthChecksByRange({ checkType = null, clientId = null, from, to }) {
    return new Promise((resolve, reject) => {
      if (typeof from !== 'number' || typeof to !== 'number') {
        reject(new Error('getHealthChecksByRange requires numeric from/to'));
        return;
      }

      const params = [from, to];
      let query = `
        SELECT * FROM health_checks
        WHERE timestamp >= ? AND timestamp < ?
      `;

      if (checkType) {
        query += ' AND check_type = ?';
        params.push(checkType);
      }

      if (clientId) {
        query += ' AND client_id = ?';
        params.push(clientId);
      }

      query += ' ORDER BY timestamp ASC';
      this.logQuery(query, params);

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  // Get average response time for a check type
  getAverageResponseTime(checkType, hoursBack = 24) {
    return new Promise((resolve, reject) => {
      const timeThreshold = Date.now() - (hoursBack * 60 * 60 * 1000);
      this.db.get(
        `SELECT AVG(response_time) as avg_time, COUNT(*) as count
         FROM health_checks 
         WHERE check_type = ? AND timestamp > ? AND status = 'up'`,
        [checkType, timeThreshold],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            // Convert milliseconds to seconds
            const avgTimeMs = row.avg_time ? parseFloat(row.avg_time) : 0;
            const avgTimeSec = avgTimeMs / 1000;
            resolve({
              average: parseFloat(avgTimeSec.toFixed(3)),
              count: row.count
            });
          }
        }
      );
    });
  }

  // Calculate uptime percentage
  getUptimePercentage(checkType = null, hoursBack = 24) {
    return new Promise((resolve, reject) => {
      const timeThreshold = Date.now() - (hoursBack * 60 * 60 * 1000);
      let query = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) as up_count
        FROM health_checks 
        WHERE timestamp > ?
      `;
      const params = [timeThreshold];

      if (checkType) {
        query += ' AND check_type = ?';
        params.push(checkType);
      }

      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          const percentage = row.total > 0 ? (row.up_count / row.total) * 100 : 100;
          resolve({
            percentage: parseFloat(percentage.toFixed(2)),
            total: row.total,
            up: row.up_count,
            down: row.total - row.up_count
          });
        }
      });
    });
  }

  // Insert an incident
  insertIncident(checkType, startTime, details, clientId = DEFAULT_CLIENT_ID) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO incidents (check_type, client_id, start_time, details) 
         VALUES (?, ?, ?, ?)`,
        [checkType, clientId, startTime, details],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  // Update incident end time
  updateIncidentEndTime(id, endTime) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE incidents 
         SET end_time = ?, duration = ? - start_time
         WHERE id = ?`,
        [endTime, endTime, id],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  // Get recent incidents
  getIncidents(limit = 50, clientId = null) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT * FROM incidents 
        ORDER BY start_time DESC 
        LIMIT ?
      `;
      const params = [limit];

      if (clientId) {
        query = `
          SELECT * FROM incidents 
          WHERE client_id = ?
          ORDER BY start_time DESC 
          LIMIT ?
        `;
        params.unshift(clientId);
      }

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Get open (ongoing) incident for a check type
  getOpenIncident(checkType, clientId = DEFAULT_CLIENT_ID) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM incidents 
         WHERE check_type = ? AND client_id = ? AND end_time IS NULL
         ORDER BY start_time DESC 
         LIMIT 1`,
        [checkType, clientId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  // Get all open incidents
  getAllOpenIncidents(clientId = null) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT * FROM incidents 
        WHERE end_time IS NULL
        ORDER BY start_time DESC
      `;
      const params = [];

      if (clientId) {
        query = `
          SELECT * FROM incidents 
          WHERE end_time IS NULL AND client_id = ?
          ORDER BY start_time DESC
        `;
        params.push(clientId);
      }

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  // Clean old records (older than 30 days)
  cleanOldRecords() {
    return new Promise((resolve, reject) => {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      this.db.serialize(() => {
        this.db.run(
          'DELETE FROM health_checks WHERE timestamp < ?',
          [thirtyDaysAgo]
        );
        this.db.run(
          'DELETE FROM incidents WHERE start_time < ?',
          [thirtyDaysAgo],
          (err) => {
            if (err) {
              logger.error('Error cleaning old records', err);
              reject(err);
            } else {
              logger.info('Cleaned old records (older than 30 days)');
              resolve();
            }
          }
        );
      });
    });
  }

  // Get percentile response time
  getPercentileResponseTime(checkType, hours, percentile = 95) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - (hours * 60 * 60 * 1000);

      this.db.all(`
        SELECT response_time
        FROM health_checks
        WHERE check_type = ? AND timestamp >= ? AND response_time IS NOT NULL
        ORDER BY response_time ASC
      `, [checkType, since], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        if (rows.length === 0) {
          resolve({ percentile: percentile, value: null });
          return;
        }

        const index = Math.ceil((percentile / 100) * rows.length) - 1;
        resolve({
          percentile: percentile,
          value: rows[index].response_time
        });
      });
    });
  }

  // Get min/max/median response time
  getResponseTimeStats(checkType, hours) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - (hours * 60 * 60 * 1000);

      this.db.all(`
        SELECT 
          MIN(response_time) as min,
          MAX(response_time) as max,
          AVG(response_time) as avg,
          COUNT(*) as count
        FROM health_checks
        WHERE check_type = ? AND timestamp >= ? AND response_time IS NOT NULL
      `, [checkType, since], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        // Get median separately
        this.db.get(`
          SELECT response_time as median
          FROM health_checks
          WHERE check_type = ? AND timestamp >= ? AND response_time IS NOT NULL
          ORDER BY response_time
          LIMIT 1 OFFSET (
            SELECT COUNT(*) / 2 FROM health_checks
            WHERE check_type = ? AND timestamp >= ? AND response_time IS NOT NULL
          )
        `, [checkType, since, checkType, since], (err2, medianRow) => {
          if (err2) {
            reject(err2);
            return;
          }
          resolve({
            min: rows[0]?.min || null,
            max: rows[0]?.max || null,
            avg: rows[0]?.avg || null,
            median: medianRow?.median || null,
            count: rows[0]?.count || 0
          });
        });
      });
    });
  }

  // Get MTTR (Mean Time To Recovery)
  getMTTR(checkType, hours) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - (hours * 60 * 60 * 1000);

      this.db.get(`
        SELECT AVG(duration) as mttr, COUNT(*) as incidents
        FROM incidents
        WHERE check_type = ? AND start_time >= ? AND end_time IS NOT NULL
      `, [checkType, since], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          mttr: row?.mttr || null,
          incidents: row?.incidents || 0
        });
      });
    });
  }

  // Get MTBF (Mean Time Between Failures)
  getMTBF(checkType, hours) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - (hours * 60 * 60 * 1000);

      this.db.all(`
        SELECT COUNT(*) as totalIncidents,
               MIN(start_time) as firstIncident,
               MAX(start_time) as lastIncident
        FROM incidents
        WHERE check_type = ? AND start_time >= ?
      `, [checkType, since], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        const totalIncidents = rows[0]?.totalIncidents || 0;
        if (totalIncidents < 2) {
          resolve({ mtbf: null, incidents: totalIncidents });
          return;
        }

        const timeSpan = rows[0].lastIncident - rows[0].firstIncident;
        const mtbf = timeSpan / (totalIncidents - 1);

        resolve({
          mtbf: mtbf,
          incidents: totalIncidents
        });
      });
    });
  }

  // Get checks under threshold
  getChecksUnderThreshold(checkType, hours, threshold) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - (hours * 60 * 60 * 1000);

      this.db.get(`
        SELECT COUNT(*) as count
        FROM health_checks
        WHERE check_type = ? AND timestamp >= ? 
          AND response_time < ? AND status = 'up'
      `, [checkType, since, threshold], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row?.count || 0);
      });
    });
  }

  // Get checks in range
  getChecksInRange(checkType, hours, min, max) {
    return new Promise((resolve, reject) => {
      const since = Date.now() - (hours * 60 * 60 * 1000);

      this.db.get(`
        SELECT COUNT(*) as count
        FROM health_checks
        WHERE check_type = ? AND timestamp >= ? 
          AND response_time >= ? AND response_time < ? AND status = 'up'
      `, [checkType, since, min, max], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row?.count || 0);
      });
    });
  }

  /**
   * Get detailed performance statistics for a check type
   * @param {string} checkType - Check type (GET, POST, WEB, HOOK, DP)
   * @param {number} hoursBack - Hours to look back (default: 24)
   * @returns {Promise<object>} Detailed statistics including MTTR, MTBF, Apdex, etc.
   */
  getDetailedStatistics(checkType, hoursBack = 24) {
    return new Promise(async (resolve, reject) => {
      try {
        const timeThreshold = Date.now() - (hoursBack * 60 * 60 * 1000);

        // 1. Basic metrics: uptime, total checks, success rate
        const basicStats = await new Promise((res, rej) => {
          this.db.get(
            `SELECT 
              COUNT(*) as totalChecks,
              SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) as successCount,
              SUM(CASE WHEN status = 'down' THEN 1 ELSE 0 END) as failureCount,
              SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warningCount
            FROM health_checks 
            WHERE check_type = ? AND timestamp > ?`,
            [checkType, timeThreshold],
            (err, row) => err ? rej(err) : res(row)
          );
        });

        // 2. Response time statistics
        const responseStats = await new Promise((res, rej) => {
          this.db.get(
            `SELECT 
              AVG(response_time) as avgResponseTime,
              MIN(response_time) as minResponseTime,
              MAX(response_time) as maxResponseTime
            FROM health_checks 
            WHERE check_type = ? AND timestamp > ? AND response_time IS NOT NULL`,
            [checkType, timeThreshold],
            (err, row) => err ? rej(err) : res(row)
          );
        });

        // 3. Percentile response times (P95, P99)
        const allResponses = await new Promise((res, rej) => {
          this.db.all(
            `SELECT response_time 
            FROM health_checks 
            WHERE check_type = ? AND timestamp > ? AND response_time IS NOT NULL
            ORDER BY response_time ASC`,
            [checkType, timeThreshold],
            (err, rows) => err ? rej(err) : res(rows)
          );
        });

        const p95 = allResponses.length > 0
          ? allResponses[Math.floor(allResponses.length * 0.95)]?.response_time || 0
          : 0;
        const p99 = allResponses.length > 0
          ? allResponses[Math.floor(allResponses.length * 0.99)]?.response_time || 0
          : 0;

        // 4. Incident statistics
        const incidentStats = await new Promise((res, rej) => {
          this.db.get(
            `SELECT 
              COUNT(*) as incidentCount,
              MAX(start_time) as lastIncidentTime,
              AVG(CASE WHEN end_time IS NOT NULL THEN (end_time - start_time) ELSE NULL END) as avgRecoveryTime
            FROM incidents 
            WHERE check_type = ? AND start_time > ?`,
            [checkType, timeThreshold],
            (err, row) => err ? rej(err) : res(row)
          );
        });

        // 5. Calculate MTTR (Mean Time To Repair) - in minutes
        const mttr = incidentStats && incidentStats.avgRecoveryTime
          ? Math.round(incidentStats.avgRecoveryTime / (60 * 1000))
          : 0;

        // 6. Calculate MTBF (Mean Time Between Failures) - in hours
        // Must be calculated before we redefine totalChecks/successCount
        const totalChecksForMTBF = basicStats.totalChecks || 0;
        const successCountForMTBF = basicStats.successCount || 0;
        const totalUptime = totalChecksForMTBF > 0
          ? (successCountForMTBF / totalChecksForMTBF) * hoursBack
          : hoursBack;
        const incidentCount = (incidentStats && incidentStats.incidentCount) || 0;
        const mtbf = incidentCount > 0
          ? parseFloat((totalUptime / incidentCount).toFixed(2))
          : hoursBack;

        // 7. Calculate Apdex Score (T=500ms, 4T=2000ms)
        const apdexData = await new Promise((res, rej) => {
          this.db.get(
            `SELECT 
              SUM(CASE WHEN response_time <= 500 THEN 1 ELSE 0 END) as satisfied,
              SUM(CASE WHEN response_time > 500 AND response_time <= 2000 THEN 1 ELSE 0 END) as tolerating,
              SUM(CASE WHEN response_time > 2000 THEN 1 ELSE 0 END) as frustrated,
              COUNT(*) as total
            FROM health_checks 
            WHERE check_type = ? AND timestamp > ? AND response_time IS NOT NULL AND status = 'up'`,
            [checkType, timeThreshold],
            (err, row) => err ? rej(err) : res(row)
          );
        });

        const apdexScore = apdexData && apdexData.total > 0
          ? parseFloat((((apdexData.satisfied || 0) + ((apdexData.tolerating || 0) * 0.5)) / apdexData.total).toFixed(3))
          : 1.0;

        // 8. Calculate uptime and availability percentages
        const totalChecks = basicStats.totalChecks || 0;
        const successCount = basicStats.successCount || 0;
        const failureCount = basicStats.failureCount || 0;

        const uptime = totalChecks > 0
          ? parseFloat(((successCount / totalChecks) * 100).toFixed(2))
          : 100;

        const availability = uptime; // Same as uptime for our purposes

        // 9. Success rate
        const successRate = totalChecks > 0
          ? parseFloat(((successCount / totalChecks) * 100).toFixed(2))
          : 100;

        // Return all 15 metrics
        resolve({
          // Basic metrics (1-2)
          uptime,
          totalChecks,

          // Reliability metrics (3-4)
          mttr, // in minutes
          mtbf, // in hours

          // User satisfaction (5)
          apdexScore,

          // Success/failure metrics (6-7)
          successRate,
          failureCount,
          warningCount: basicStats.warningCount || 0,

          // Response time metrics (8-12)
          avgResponseTime: responseStats.avgResponseTime
            ? Math.round(responseStats.avgResponseTime)
            : 0,
          minResponseTime: responseStats.minResponseTime || 0,
          maxResponseTime: responseStats.maxResponseTime || 0,
          p95ResponseTime: Math.round(p95),
          p99ResponseTime: Math.round(p99),

          // Incident metrics (13-14)
          lastIncident: (incidentStats && incidentStats.lastIncidentTime) || null,
          incidentCount,

          // Availability (15)
          availability
        });
      } catch (error) {
        logger.error('Error calculating detailed statistics', error);
        reject(error);
      }
    });
  }

  /**
   * Get row count for a table (for health checks)
   * @param {string} tableName - Name of table
   * @returns {Promise<number>} Row count
   */
  getTableRowCount(tableName) {
    const allowedTables = ['health_checks', 'incidents', 'health_check_aggregates'];
    if (!allowedTables.includes(tableName)) {
      return Promise.reject(new Error(`Invalid table name: ${tableName}`));
    }

    return new Promise((resolve, reject) => {
      const query = `SELECT COUNT(*) as count FROM ${tableName}`;
      this.db.get(query, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row?.count || 0);
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            logger.error('Error closing database', err);
            reject(err);
          } else {
            logger.info('Database connection closed');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = new Database();

