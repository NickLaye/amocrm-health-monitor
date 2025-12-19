/**
 * Application constants
 * Centralizes all constant values used across the application
 */

/**
 * Check types for amoCRM monitoring
 * @enum {string}
 */
const CHECK_TYPES = {
  GET: 'GET',
  POST: 'POST',
  WEB: 'WEB',
  HOOK: 'HOOK',
  DP: 'DP'
};

/**
 * Human-readable labels for check types
 * @type {Object.<string, string>}
 */
const CHECK_TYPE_LABELS = {
  GET: 'API (GET)',
  POST: 'API (POST)',
  WEB: 'Веб-интерфейс',
  HOOK: 'Вебхуки',
  DP: 'Digital Pipeline'
};

/**
 * Status types
 * @enum {string}
 */
const STATUS = {
  UP: 'up',
  WARNING: 'warning',
  DOWN: 'down',
  UNKNOWN: 'unknown'
};

/**
 * Latency thresholds per check type (milliseconds).
 * warningMs — деградация, downMs — критическое превышение.
 */
const LATENCY_THRESHOLDS = {
  GET: { warningMs: 10000, downMs: 15000 },
  POST: { warningMs: 10000, downMs: 15000 },
  WEB: { warningMs: 10000, downMs: 15000 },
  HOOK: { warningMs: 10000, downMs: 15000 },
  DP: { warningMs: 10000, downMs: 15000 }
};

/**
 * Supported aggregate resolutions
 */
const RESOLUTIONS = {
  RAW: 'raw',
  HOUR: 'hour',
  DAY: 'day'
};

const DEFAULT_CLIENT_ID = process.env.AMOCRM_CLIENT_ID || 'default';
const CLIENT_ID_PATTERN = /^[A-Za-z0-9#._-]{1,64}$/;

/**
 * Default configuration values
 */
const DEFAULTS = {
  CHECK_INTERVAL: 60000,        // 1 minute
  TIMEOUT_THRESHOLD: 30000,     // 30 seconds
  PORT: 3001,
  TOKEN_REFRESH_INTERVAL: 3600000, // 1 hour
  NOTIFICATION_DEBOUNCE: 300000,   // 5 minutes
  WARNING_ESCALATION_THRESHOLD: 3,
  WARNING_ESCALATION_WINDOW_MS: 5 * 60 * 1000,
  RECOVERY_SUCCESS_THRESHOLD: 2,
  SSE_TOKEN_TTL_MS: 5 * 60 * 1000, // 5 minutes
  DP_CHECK_INTERVAL_MS: 120000,    // 2 minutes
  DP_REQUEST_TIMEOUT_MS: 15000,    // 15 seconds
  DP_WEBHOOK_TIMEOUT_MS: 60000,    // 60 seconds
  DP_WORKER_TIMEOUT_MS: 90000,     // 90 seconds overall guard
  RATE_LIMIT: {
    WINDOW_MS: 60 * 1000,
    LIMIT: 100,
    IPV6_SUBNET: 56
  }
};

/**
 * HTTP status code ranges
 */
const HTTP_STATUS = {
  SUCCESS_MIN: 200,
  SUCCESS_MAX: 299,
  CLIENT_ERROR_MIN: 400,
  SERVER_ERROR_MIN: 500
};

/**
 * Test entity configuration for POST API health checks
 * These IDs MUST be configured via environment variables
 * The test deal and field are used to verify write access to amoCRM API
 * 
 * IMPORTANT: Do not use production data as test entities
 * Create a dedicated test deal with a text field for health checks
 */
const TEST_ENTITY = {
  // Must be set via AMOCRM_TEST_DEAL_ID environment variable
  DEAL_ID: process.env.AMOCRM_TEST_DEAL_ID ? parseInt(process.env.AMOCRM_TEST_DEAL_ID, 10) : null,
  // Must be set via AMOCRM_TEST_FIELD_ID environment variable
  FIELD_ID: process.env.AMOCRM_TEST_FIELD_ID ? parseInt(process.env.AMOCRM_TEST_FIELD_ID, 10) : null
};

module.exports = {
  CHECK_TYPES,
  CHECK_TYPE_LABELS,
  STATUS,
  RESOLUTIONS,
  DEFAULTS,
  HTTP_STATUS,
  TEST_ENTITY,
  LATENCY_THRESHOLDS,
  DEFAULT_CLIENT_ID,
  CLIENT_ID_PATTERN
};


