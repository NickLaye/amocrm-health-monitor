/**
 * Authentication middleware
 * Provides security for API endpoints
 */

const crypto = require('crypto');
const { createLogger } = require('../utils/logger');
const { getIntEnvOrDefault } = require('../config/env-validator');
const { DEFAULTS } = require('../config/constants');

const logger = createLogger('Auth');

const SSE_TOKEN_TTL_MS = getIntEnvOrDefault('SSE_TOKEN_TTL_MS', DEFAULTS.SSE_TOKEN_TTL_MS || (5 * 60 * 1000));
const SSE_TOKEN_CACHE_SIZE = getIntEnvOrDefault('SSE_TOKEN_CACHE_SIZE', 2048);
const sseTokens = new Map();

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [token, payload] of sseTokens.entries()) {
    if (!payload || payload.expiresAt <= now) {
      sseTokens.delete(token);
    }
  }
}

function pruneTokenCache() {
  if (sseTokens.size <= SSE_TOKEN_CACHE_SIZE) {
    return;
  }
  const excess = sseTokens.size - SSE_TOKEN_CACHE_SIZE;
  const keys = Array.from(sseTokens.keys()).slice(0, excess);
  keys.forEach(key => sseTokens.delete(key));
}

function issueSseToken(clientId) {
  if (!clientId) {
    throw new Error('clientId is required to issue SSE token');
  }
  cleanupExpiredTokens();
  pruneTokenCache();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SSE_TOKEN_TTL_MS;
  sseTokens.set(token, { clientId, expiresAt });
  logger.debug(`Issued SSE token for ${clientId}, ttl=${SSE_TOKEN_TTL_MS}ms`);
  return { token, expiresAt, ttlMs: SSE_TOKEN_TTL_MS };
}

function validateSseToken(token, expectedClientId) {
  cleanupExpiredTokens();
  if (!token) {
    return { valid: false, reason: 'missing_token' };
  }
  const payload = sseTokens.get(token);
  if (!payload) {
    return { valid: false, reason: 'invalid_token' };
  }
  if (payload.expiresAt <= Date.now()) {
    sseTokens.delete(token);
    return { valid: false, reason: 'expired' };
  }
  if (expectedClientId && payload.clientId !== expectedClientId) {
    return { valid: false, reason: 'client_mismatch' };
  }
  return { valid: true, clientId: payload.clientId, expiresAt: payload.expiresAt };
}

/**
 * Authenticate SSE connections using short-lived tokens.
 * Token must correspond to the requested clientId.
 */
function authenticateSSE(req, res, next) {
  const token = req.headers['x-sse-token'] || req.query.token;
  const requestedClientId = req.query.clientId || req.headers['x-client-id'];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - SSE token is required'
    });
  }

  if (!requestedClientId) {
    return res.status(400).json({
      success: false,
      error: 'clientId is required for SSE connections'
    });
  }

  const verification = validateSseToken(token, requestedClientId);
  if (!verification.valid) {
    const status = verification.reason === 'client_mismatch' ? 403 : 401;
    logger.warn(`SSE authentication failed (${verification.reason}) for client ${requestedClientId} from IP ${req.ip}. Token: ${token ? token.substring(0, 8) + '...' : 'null'}`);
    return res.status(status).json({
      success: false,
      error: 'Unauthorized - Invalid or expired SSE token'
    });
  }

  req.sseAuth = { clientId: verification.clientId, expiresAt: verification.expiresAt };
  return next();
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
  asyncHandler,
  issueSseToken,
  getSseTokenTtl: () => SSE_TOKEN_TTL_MS
};

