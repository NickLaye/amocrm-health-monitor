/**
 * Logging utility with Winston
 * Provides consistent logging format with file rotation
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
    let log = `[${timestamp}] [${level.toUpperCase()}]`;
    if (context) {
      log += ` [${context}]`;
    }
    log += ` ${message}`;
    
    // Add metadata if present
    const metaKeys = Object.keys(meta);
    if (metaKeys.length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// Transport for error logs
const errorTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat
});

// Transport for combined logs
const combinedTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: logFormat
});

// Transport for console output
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    logFormat
  )
});

// Create base logger
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  transports: [
    errorTransport,
    combinedTransport
  ],
  // Don't exit on handled exceptions
  exitOnError: false
});

// Add console transport in development or if explicitly enabled
if (process.env.NODE_ENV !== 'production' || process.env.CONSOLE_LOGS === 'true') {
  baseLogger.add(consoleTransport);
}

// Handle uncaught exceptions
baseLogger.exceptions.handle(
  new DailyRotateFile({
    filename: path.join(logsDir, 'exceptions-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: logFormat
  })
);

// Handle unhandled promise rejections
baseLogger.rejections.handle(
  new DailyRotateFile({
    filename: path.join(logsDir, 'rejections-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: logFormat
  })
);

/**
 * Logger class for consistent logging with context
 */
class Logger {
  constructor(context) {
    this.context = context;
  }

  /**
   * Log info message
   * @param {string} message - Message to log
   * @param {*} meta - Optional metadata
   */
  info(message, meta = {}) {
    baseLogger.info(message, { context: this.context, ...meta });
  }

  /**
   * Log warning message
   * @param {string} message - Message to log
   * @param {*} meta - Optional metadata
   */
  warn(message, meta = {}) {
    baseLogger.warn(message, { context: this.context, ...meta });
  }

  /**
   * Log error message
   * @param {string} message - Message to log
   * @param {Error|*} error - Error object or metadata
   */
  error(message, error = null) {
    if (error instanceof Error) {
      baseLogger.error(message, {
        context: this.context,
        error: error.message,
        stack: error.stack
      });
    } else if (error) {
      baseLogger.error(message, { context: this.context, ...error });
    } else {
      baseLogger.error(message, { context: this.context });
    }
  }

  /**
   * Log debug message
   * @param {string} message - Message to log
   * @param {*} meta - Optional metadata
   */
  debug(message, meta = {}) {
    baseLogger.debug(message, { context: this.context, ...meta });
  }

  /**
   * Log HTTP request
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   * @param {number} statusCode - Response status code
   * @param {number} responseTime - Response time in ms
   */
  http(method, url, statusCode, responseTime) {
    baseLogger.info(`${method} ${url} ${statusCode} ${responseTime}ms`, {
      context: this.context,
      method,
      url,
      statusCode,
      responseTime
    });
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

/**
 * Get the base Winston logger instance
 * Useful for advanced logging scenarios
 * @returns {winston.Logger} Winston logger instance
 */
function getWinstonLogger() {
  return baseLogger;
}

module.exports = {
  createLogger,
  Logger,
  getWinstonLogger
};
