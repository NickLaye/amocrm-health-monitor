/**
 * Request validation middleware
 * Provides validation rules for API endpoints
 */

const { query, param, validationResult } = require('express-validator');
const { CHECK_TYPES } = require('../config/constants');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Validation');

/**
 * Middleware to check validation results
 * Returns 400 if validation fails
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation failed:', { 
      path: req.path, 
      errors: errors.array() 
    });
    
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  
  next();
}

/**
 * Validation rules for /history endpoint
 */
const validateHistory = [
  query('hours')
    .optional()
    .isInt({ min: 1, max: 720 })
    .withMessage('Hours must be between 1 and 720 (30 days)')
    .toInt(),
  
  query('checkType')
    .optional()
    .isIn(Object.values(CHECK_TYPES))
    .withMessage(`Check type must be one of: ${Object.values(CHECK_TYPES).join(', ')}`),
  
  validate
];

/**
 * Validation rules for /stats endpoint
 */
const validateStats = [
  query('hours')
    .optional()
    .isInt({ min: 1, max: 720 })
    .withMessage('Hours must be between 1 and 720 (30 days)')
    .toInt(),
  
  validate
];

/**
 * Validation rules for /incidents endpoint
 */
const validateIncidents = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000')
    .toInt(),
  
  validate
];

module.exports = {
  validate,
  validateHistory,
  validateStats,
  validateIncidents
};

