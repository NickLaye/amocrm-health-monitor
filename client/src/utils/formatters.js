/**
 * Formatting utility functions
 */

/**
 * Formats response time from milliseconds to seconds
 * @param {number} milliseconds - Time in milliseconds
 * @param {number} decimals - Number of decimal places (default: 3)
 * @returns {string} Formatted time string
 */
export function formatResponseTime(milliseconds, decimals = 3) {
  if (milliseconds === null || milliseconds === undefined || isNaN(milliseconds)) {
    return '0.000';
  }
  const seconds = milliseconds / 1000;
  return seconds.toFixed(decimals);
}

/**
 * Formats uptime percentage
 * @param {number} uptime - Uptime percentage (0-100)
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted uptime string with % sign
 */
export function formatUptime(uptime, decimals = 1) {
  if (uptime === null || uptime === undefined || isNaN(uptime)) {
    return '0.0%';
  }
  return `${uptime.toFixed(decimals)}%`;
}

/**
 * Formats percentage (alias for formatUptime)
 * @param {number} percentage - Percentage value (0-100)
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted percentage string with % sign
 */
export function formatPercentage(percentage, decimals = 1) {
  return formatUptime(percentage, decimals);
}

/**
 * Formats timestamp to localized string
 * @param {Date|string|number} timestamp - Timestamp to format
 * @param {string} locale - Locale string (default: 'ru-RU')
 * @returns {string} Formatted date/time string
 */
export function formatTimestamp(timestamp, locale = 'ru-RU') {
  if (!timestamp) {
    return '';
  }
  const date = new Date(timestamp);
  return date.toLocaleString(locale);
}

/**
 * Formats time to HH:MM:SS
 * @param {Date|string|number} timestamp - Timestamp to format
 * @param {string} locale - Locale string (default: 'ru-RU')
 * @returns {string} Formatted time string
 */
export function formatTime(timestamp, locale = 'ru-RU') {
  if (!timestamp) {
    return '';
  }
  const date = new Date(timestamp);
  return date.toLocaleTimeString(locale);
}

/**
 * Formats duration in milliseconds to human-readable string
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "5 мин 30 сек")
 */
export function formatDuration(milliseconds) {
  if (!milliseconds || milliseconds < 0) {
    return '0 сек';
  }
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} дн ${hours % 24} ч`;
  }
  if (hours > 0) {
    return `${hours} ч ${minutes % 60} мин`;
  }
  if (minutes > 0) {
    return `${minutes} мин ${seconds % 60} сек`;
  }
  return `${seconds} сек`;
}

/**
 * Formats large numbers with separators
 * @param {number} num - Number to format
 * @param {string} locale - Locale string (default: 'ru-RU')
 * @returns {string} Formatted number string
 */
export function formatNumber(num, locale = 'ru-RU') {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }
  return num.toLocaleString(locale);
}

/**
 * Gets status badge text
 * @param {string} status - Status value ('up', 'down', 'unknown')
 * @returns {string} Human-readable status
 */
export function getStatusText(status) {
  const statusMap = {
    'up': 'UP',
    'down': 'DOWN',
    'unknown': 'N/A'
  };
  return statusMap[status] || 'N/A';
}

/**
 * Gets CSS class for status
 * @param {string} status - Status value ('up', 'down', 'unknown')
 * @returns {string} CSS class name
 */
export function getStatusClass(status) {
  return `status-${status || 'unknown'}`;
}

