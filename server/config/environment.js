/**
 * Environment-specific configuration
 * Different settings for development and production
 */

const { createLogger } = require('../utils/logger');
const logger = createLogger('Config');

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Development configuration
 */
const development = {
  name: 'development',
  logLevel: 'debug',
  checkInterval: 30000,        // 30 seconds for faster testing
  timeoutThreshold: 5000,      // 5 seconds
  cleanupSchedule: '*/30 * * * *', // Every 30 minutes for testing
  rateLimit: {
    windowMs: 1 * 60 * 1000,   // 1 minute
    max: 1000                   // More lenient in dev
  },
  compression: {
    enabled: false,              // Easier debugging without compression
    level: 1
  },
  cors: {
    origins: ['*'],              // Allow all in development
    credentials: true
  }
};

/**
 * Production configuration
 */
const production = {
  name: 'production',
  logLevel: 'info',
  checkInterval: 60000,         // 1 minute
  timeoutThreshold: 10000,      // 10 seconds
  cleanupSchedule: '0 3 * * *', // Daily at 3:00 AM
  rateLimit: {
    windowMs: 1 * 60 * 1000,    // 1 minute
    max: 100                     // Strict in production
  },
  compression: {
    enabled: true,
    level: 6
  },
  cors: {
    origins: process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['*'],
    credentials: true
  }
};

/**
 * Test configuration
 */
const test = {
  name: 'test',
  logLevel: 'error',            // Only errors in tests
  checkInterval: 5000,          // 5 seconds for fast tests
  timeoutThreshold: 2000,       // 2 seconds
  cleanupSchedule: '0 0 * * *', // Once a day
  rateLimit: {
    windowMs: 1 * 60 * 1000,
    max: 10000                  // Very lenient in tests
  },
  compression: {
    enabled: false,
    level: 1
  },
  cors: {
    origins: ['*'],
    credentials: true
  }
};

/**
 * Get configuration for current environment
 */
const configs = {
  development,
  production,
  test
};

const config = configs[NODE_ENV] || development;

logger.info(`Environment: ${config.name}`);

module.exports = config;

