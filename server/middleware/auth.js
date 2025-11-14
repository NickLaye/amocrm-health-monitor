/**
 * Authentication middleware
 * Provides security for API endpoints
 */

const { createLogger } = require('../utils/logger');
const logger = createLogger('Auth');

/**
 * Authenticate SSE connections
 * Checks for API key in headers or query params
 */
function authenticateSSE(req, res, next) {
  const token = req.headers['x-api-key'] || req.query.token;
  const apiSecret = process.env.API_SECRET;
  
  // If no API_SECRET set in env, allow all (backward compatibility)
  if (!apiSecret) {
    logger.warn('API_SECRET not set - SSE endpoint is unprotected!');
    return next();
  }
  
  if (token === apiSecret) {
    logger.debug('SSE authentication successful');
    next();
  } else {
    logger.warn(`SSE authentication failed from IP: ${req.ip}`);
    res.status(401).json({ 
      success: false,
      error: 'Unauthorized - Invalid or missing API key' 
    });
  }
}

/**
 * Basic API authentication (optional)
 * Can be used to protect other endpoints
 */
function authenticateAPI(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const apiSecret = process.env.API_SECRET;
  
  // If no API_SECRET set, allow all
  if (!apiSecret) {
    return next();
  }
  
  if (apiKey === apiSecret) {
    next();
  } else {
    logger.warn(`API authentication failed from IP: ${req.ip}`);
    res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }
}

/**
 * Async error handler wrapper
 * Catches async errors and passes them to Express error handler
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  authenticateSSE,
  authenticateAPI,
  asyncHandler
};

