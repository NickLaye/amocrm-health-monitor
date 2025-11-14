/**
 * HTTP helper utilities
 * Common functions for HTTP operations
 */

const { HTTP_STATUS } = require('../config/constants');

/**
 * Checks if HTTP status code indicates success
 * @param {number} statusCode - HTTP status code
 * @returns {boolean} True if status is successful
 */
function isSuccessStatus(statusCode) {
  return statusCode >= HTTP_STATUS.SUCCESS_MIN && statusCode <= HTTP_STATUS.SUCCESS_MAX;
}

/**
 * Checks if HTTP status code indicates client error
 * @param {number} statusCode - HTTP status code
 * @returns {boolean} True if status is client error
 */
function isClientError(statusCode) {
  return statusCode >= HTTP_STATUS.CLIENT_ERROR_MIN && statusCode < HTTP_STATUS.SERVER_ERROR_MIN;
}

/**
 * Checks if HTTP status code indicates server error
 * @param {number} statusCode - HTTP status code
 * @returns {boolean} True if status is server error
 */
function isServerError(statusCode) {
  return statusCode >= HTTP_STATUS.SERVER_ERROR_MIN;
}

/**
 * Builds amoCRM API URL
 * @param {string} domain - amoCRM domain
 * @param {string} path - API path
 * @returns {string} Complete URL
 */
function buildAmoCRMUrl(domain, path) {
  const basePath = path.startsWith('/') ? path : `/${path}`;
  return `https://${domain}${basePath}`;
}

/**
 * Creates axios config with authentication
 * @param {string} accessToken - Access token
 * @param {number} timeout - Request timeout in ms
 * @returns {Object} Axios config object
 */
function createAuthConfig(accessToken, timeout = 10000) {
  return {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    timeout,
    validateStatus: () => true // Don't throw on any status
  };
}

/**
 * Extracts error message from axios error
 * @param {Error} error - Axios error object
 * @returns {string} Error message
 */
function extractErrorMessage(error) {
  if (error.response) {
    return `HTTP ${error.response.status}: ${error.response.statusText}`;
  }
  if (error.code === 'ECONNABORTED') {
    return 'Request timeout';
  }
  if (error.code === 'ENOTFOUND') {
    return 'Domain not found';
  }
  return error.message || 'Unknown error';
}

module.exports = {
  isSuccessStatus,
  isClientError,
  isServerError,
  buildAmoCRMUrl,
  createAuthConfig,
  extractErrorMessage
};

