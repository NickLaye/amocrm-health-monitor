const clientRegistry = require('../config/client-registry');
const { DEFAULT_CLIENT_ID, CLIENT_ID_PATTERN, RESOLUTIONS } = require('../config/constants');
const aggregator = require('../aggregator');

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
    : ['*'];

/**
 * Convert query param to number while keeping defaults.
 * @param {string|number} value - Input value
 * @param {number} [defaultValue=null] - Fallback value
 * @returns {number|null}
 */
function toNumber(value, defaultValue = null) {
    if (typeof value === 'number' && !Number.isNaN(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    return defaultValue;
}

/**
 * Normalize resolution string to enum value
 * @param {string} rawValue 
 * @param {string} [fallback=RESOLUTIONS.RAW] 
 * @returns {string}
 */
function normalizeResolution(rawValue, fallback = RESOLUTIONS.RAW) {
    if (!rawValue) {
        return fallback;
    }
    const value = String(rawValue).toLowerCase();
    const match = Object.values(RESOLUTIONS).find(res => res === value);
    return match || fallback;
}

/**
 * Resolve client ID from input or environment
 * @param {string} rawValue 
 * @param {Object} options 
 * @param {boolean} [options.optional=false] 
 * @returns {{clientId?: string, error?: string}}
 */
function resolveClientId(rawValue, { optional = false } = {}) {
    const availableIds = clientRegistry.getClientIds();
    if (!availableIds.length) {
        return { error: 'No amoCRM clients configured' };
    }

    const candidate = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (candidate) {
        if (!CLIENT_ID_PATTERN.test(candidate)) {
            return { error: `Invalid clientId format: "${candidate}"` };
        }
        if (!clientRegistry.hasClient(candidate)) {
            return { error: `Unknown clientId "${candidate}"` };
        }
        return { clientId: candidate };
    }

    if (clientRegistry.isMultiTenant() && !optional) {
        return { error: 'clientId query parameter is required in multi-tenant mode' };
    }

    return { clientId: availableIds[0] || DEFAULT_CLIENT_ID };
}

/**
 * Validate and resolve SSE Origin header
 * @param {string} originHeader 
 * @returns {string|null}
 */
function resolveSseOrigin(originHeader) {
    if (!originHeader) {
        return null;
    }
    if (allowedOrigins.includes('*')) {
        return originHeader;
    }
    return allowedOrigins.includes(originHeader) ? originHeader : null;
}

// Stats helper functions

/**
 * Convert milliseconds to seconds (floats)
 * @param {number} value 
 * @returns {number|null}
 */
function msToSeconds(value) {
    if (value === null || value === undefined) {
        return null;
    }
    return parseFloat((Number(value) / 1000).toFixed(3));
}

/**
 * Align timestamp to the start of a bucket
 * @param {number} timestamp 
 * @param {number} bucketSize 
 * @returns {number}
 */
function alignToBucket(timestamp, bucketSize) {
    return Math.floor(timestamp / bucketSize) * bucketSize;
}

/**
 * Calculate window boundaries for aggregation
 * @param {number} hours 
 * @param {number} bucketSize 
 * @returns {{from: number, to: number}}
 */
function getWindowBounds(hours, bucketSize) {
    const durationMs = Math.max(bucketSize, hours * 60 * 60 * 1000);
    const now = Date.now();
    const end = alignToBucket(now, bucketSize) + bucketSize;
    const buckets = Math.ceil(durationMs / bucketSize);
    const start = end - (buckets * bucketSize);
    return { from: start, to: end };
}

/**
 * Map database aggregate row to API response format
 * @param {Object} row 
 * @returns {Object}
 */
function mapAggregateRow(row) {
    const bucketSize = aggregator.getBucketSize(row.resolution);
    return {
        id: row.id,
        periodStart: row.period_start,
        periodEnd: row.period_start + bucketSize,
        resolution: row.resolution,
        clientId: row.client_id,
        checkType: row.check_type,
        avgResponseTimeMs: row.avg_response_time,
        avgResponseTimeSeconds: msToSeconds(row.avg_response_time),
        p50Ms: row.p50_response_time,
        p50Seconds: msToSeconds(row.p50_response_time),
        p95Ms: row.p95_response_time,
        p95Seconds: msToSeconds(row.p95_response_time),
        p99Ms: row.p99_response_time,
        p99Seconds: msToSeconds(row.p99_response_time),
        minResponseTimeMs: row.min_response_time,
        maxResponseTimeMs: row.max_response_time,
        counts: {
            success: row.success_count || 0,
            warning: row.warning_count || 0,
            down: row.down_count || 0,
            total: row.total_count || 0
        }
    };
}

/**
 * Build default/empty statistics object
 * @param {number} hours 
 * @returns {Object}
 */
function buildDefaultStats(hours) {
    return {
        uptime: 100,
        totalChecks: 0,
        mttr: null,
        mtbf: null,
        apdexScore: 1.0,
        successRate: 100,
        failureCount: 0,
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        lastIncident: null,
        incidentCount: 0,
        availability: 100,
        averageResponseTime: 0,
        checkCount: 0,
        percentile95: 0,
        apdex: 1.0,
        errorRate: 0,
        upChecks: 0,
        downChecks: 0,
        warningChecks: 0
    };
}

/**
 * Summarize list of aggregate rows into a single statistics object
 * @param {Array<Object>} rows 
 * @param {number} hours 
 * @returns {Object}
 */
function summarizeAggregatedStats(rows, hours) {
    const stats = buildDefaultStats(hours);
    if (!rows || rows.length === 0) {
        return stats;
    }

    const totals = rows.reduce((acc, row) => {
        acc.total += row.total_count || 0;
        acc.success += row.success_count || 0;
        acc.warning += row.warning_count || 0;
        acc.down += row.down_count || 0;
        if (row.avg_response_time !== null && row.avg_response_time !== undefined && row.total_count) {
            acc.latencySum += row.avg_response_time * row.total_count;
            acc.latencyCount += row.total_count;
        }
        if (row.min_response_time !== null && row.min_response_time !== undefined) {
            acc.min = acc.min === null ? row.min_response_time : Math.min(acc.min, row.min_response_time);
        }
        if (row.max_response_time !== null && row.max_response_time !== undefined) {
            acc.max = acc.max === null ? row.max_response_time : Math.max(acc.max, row.max_response_time);
        }
        return acc;
    }, { total: 0, success: 0, warning: 0, down: 0, latencySum: 0, latencyCount: 0, min: null, max: null });

    const uptime = totals.total > 0 ? (totals.success / totals.total) * 100 : 100;
    const avgResponseTime = totals.latencyCount > 0
        ? Math.round(totals.latencySum / totals.latencyCount)
        : 0;
    const latest = rows[rows.length - 1];

    stats.uptime = parseFloat(uptime.toFixed(2));
    stats.totalChecks = totals.total;
    stats.successRate = stats.uptime;
    stats.failureCount = totals.down;
    stats.avgResponseTime = avgResponseTime;
    stats.minResponseTime = totals.min || 0;
    stats.maxResponseTime = totals.max || 0;
    stats.p95ResponseTime = latest?.p95_response_time || 0;
    stats.p99ResponseTime = latest?.p99_response_time || 0;
    stats.averageResponseTime = stats.avgResponseTime;
    stats.checkCount = stats.totalChecks;
    stats.percentile95 = stats.p95ResponseTime;
    stats.apdexScore = parseFloat((stats.uptime / 100).toFixed(3));
    stats.apdex = stats.apdexScore;
    stats.errorRate = totals.total > 0 ? parseFloat(((totals.down / totals.total) * 100).toFixed(2)) : 0;
    stats.upChecks = totals.success;
    stats.downChecks = totals.down;
    stats.warningChecks = totals.warning;
    stats.availability = stats.uptime;

    const total = stats.upChecks + stats.downChecks + stats.warningChecks;
    stats.errorRate = total > 0 ? parseFloat(((stats.downChecks / total) * 100).toFixed(2)) : 0;
    return stats;
}

module.exports = {
    toNumber,
    normalizeResolution,
    resolveClientId,
    resolveSseOrigin,
    getWindowBounds,
    mapAggregateRow,
    buildDefaultStats,
    summarizeAggregatedStats
};
