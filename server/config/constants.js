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
  DOWN: 'down',
  UNKNOWN: 'unknown'
};

/**
 * Default configuration values
 */
const DEFAULTS = {
  CHECK_INTERVAL: 60000,        // 1 minute
  TIMEOUT_THRESHOLD: 10000,     // 10 seconds
  PORT: 3001,
  TOKEN_REFRESH_INTERVAL: 3600000, // 1 hour
  NOTIFICATION_DEBOUNCE: 300000    // 5 minutes
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

module.exports = {
  CHECK_TYPES,
  CHECK_TYPE_LABELS,
  STATUS,
  DEFAULTS,
  HTTP_STATUS
};

