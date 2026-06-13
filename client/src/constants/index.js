/**
 * Frontend application constants
 */

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

