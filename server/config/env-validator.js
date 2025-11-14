/**
 * Environment variables validator
 * Ensures all required environment variables are present and valid
 */

const { DEFAULTS } = require('./constants');

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  'AMOCRM_DOMAIN',
  'AMOCRM_CLIENT_ID',
  'AMOCRM_CLIENT_SECRET',
  'AMOCRM_REDIRECT_URI',
  'AMOCRM_REFRESH_TOKEN',
  'MATTERMOST_WEBHOOK_URL'
];

/**
 * Optional environment variables with defaults
 */
const OPTIONAL_ENV_VARS = {
  CHECK_INTERVAL: DEFAULTS.CHECK_INTERVAL,
  TIMEOUT_THRESHOLD: DEFAULTS.TIMEOUT_THRESHOLD,
  PORT: DEFAULTS.PORT
};

/**
 * Validates that all required environment variables are set
 * @throws {Error} If any required variable is missing
 */
function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file.'
    );
  }
  
  console.log('✓ All required environment variables are set');
}

/**
 * Gets environment variable value or default
 * @param {string} key - Environment variable name
 * @param {*} defaultValue - Default value if not set
 * @returns {*} Environment variable value or default
 */
function getEnvOrDefault(key, defaultValue) {
  return process.env[key] || defaultValue;
}

/**
 * Gets integer environment variable value or default
 * @param {string} key - Environment variable name
 * @param {number} defaultValue - Default value if not set
 * @returns {number} Parsed integer value or default
 */
function getIntEnvOrDefault(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(`Warning: Invalid integer value for ${key}, using default: ${defaultValue}`);
    return defaultValue;
  }
  
  return parsed;
}

/**
 * Logs current configuration
 */
function logConfiguration() {
  console.log('\n📋 Current Configuration:');
  console.log(`  • amoCRM Domain: ${process.env.AMOCRM_DOMAIN}`);
  console.log(`  • Check Interval: ${getIntEnvOrDefault('CHECK_INTERVAL', DEFAULTS.CHECK_INTERVAL)}ms`);
  console.log(`  • Timeout Threshold: ${getIntEnvOrDefault('TIMEOUT_THRESHOLD', DEFAULTS.TIMEOUT_THRESHOLD)}ms`);
  console.log(`  • Server Port: ${getIntEnvOrDefault('PORT', DEFAULTS.PORT)}`);
  console.log('');
}

module.exports = {
  validateEnv,
  getEnvOrDefault,
  getIntEnvOrDefault,
  logConfiguration
};

