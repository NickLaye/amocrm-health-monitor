/**
 * Frontend application constants
 */

/**
 * Check types for amoCRM monitoring
 * @enum {string}
 */
export const CHECK_TYPES = {
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
export const CHECK_TYPE_LABELS = {
  GET: 'API (GET)',
  POST: 'API (POST)',
  WEB: 'Веб-интерфейс',
  HOOK: 'Вебхуки',
  DP: 'Digital Pipeline'
};

/**
 * Colors for each check type (used in charts and UI)
 * @type {Object.<string, string>}
 */
export const CHECK_TYPE_COLORS = {
  GET: '#0EA5E9',    // sky-500
  POST: '#14B8A6',   // teal-500
  WEB: '#6366F1',    // indigo-500
  HOOK: '#F97316',   // orange-500
  DP: '#EAB308'      // amber-500
};

/**
 * Status types
 * @enum {string}
 */
export const STATUS = {
  UP: 'up',
  WARNING: 'warning',
  DOWN: 'down',
  UNKNOWN: 'unknown'
};

/**
 * Period options for time range selector (in hours)
 */
export const PERIOD_OPTIONS = [
  { value: 1, label: '1 час' },
  { value: 6, label: '6 часов' },
  { value: 24, label: '24 часа' },
  { value: 168, label: '7 дней' }
];

/**
 * API endpoint paths
 */
export const API_ENDPOINTS = {
  STATUS: '/status',
  STATS: '/stats',
  HISTORY: '/history',
  INCIDENTS: '/incidents',
  SSE: '/events'
};

/**
 * Update intervals (in milliseconds)
 */
export const INTERVALS = {
  STATUS_UPDATE: 60000,    // 1 minute
  RECONNECT_SSE: 5000      // 5 seconds
};

