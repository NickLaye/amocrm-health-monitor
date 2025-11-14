/**
 * Logging utility
 * Provides consistent logging format across the application
 */

/**
 * Log levels
 */
const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG'
};

/**
 * Formats timestamp for logs
 * @returns {string} Formatted timestamp
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Formats log message
 * @param {string} level - Log level
 * @param {string} context - Context/module name
 * @param {string} message - Log message
 * @returns {string} Formatted log message
 */
function formatMessage(level, context, message) {
  return `[${getTimestamp()}] [${level}] [${context}] ${message}`;
}

/**
 * Logger class for consistent logging
 */
class Logger {
  constructor(context) {
    this.context = context;
  }

  /**
   * Log info message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to log
   */
  info(message, data = null) {
    console.log(formatMessage(LOG_LEVELS.INFO, this.context, message));
    if (data) console.log(data);
  }

  /**
   * Log warning message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to log
   */
  warn(message, data = null) {
    console.warn(formatMessage(LOG_LEVELS.WARN, this.context, message));
    if (data) console.warn(data);
  }

  /**
   * Log error message
   * @param {string} message - Message to log
   * @param {Error|*} error - Error object or data
   */
  error(message, error = null) {
    console.error(formatMessage(LOG_LEVELS.ERROR, this.context, message));
    if (error) {
      if (error instanceof Error) {
        console.error(`  Error: ${error.message}`);
        if (error.stack) console.error(error.stack);
      } else {
        console.error(error);
      }
    }
  }

  /**
   * Log debug message (only in development)
   * @param {string} message - Message to log
   * @param {*} data - Optional data to log
   */
  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      console.log(formatMessage(LOG_LEVELS.DEBUG, this.context, message));
      if (data) console.log(data);
    }
  }
}

/**
 * Creates a logger instance for a specific context
 * @param {string} context - Context/module name
 * @returns {Logger} Logger instance
 */
function createLogger(context) {
  return new Logger(context);
}

module.exports = {
  createLogger,
  Logger
};

