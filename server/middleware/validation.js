/**
 * Request validation middleware
 * Provides validation rules for API endpoints
 */

const { query, body, validationResult } = require('express-validator');
const { CHECK_TYPES, RESOLUTIONS, CLIENT_ID_PATTERN } = require('../config/constants');
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

  query('resolution')
    .optional()
    .isIn(Object.values(RESOLUTIONS))
    .withMessage(`Resolution must be one of: ${Object.values(RESOLUTIONS).join(', ')}`),

  query('clientId')
    .optional()
    .trim()
    .matches(CLIENT_ID_PATTERN)
    .withMessage('clientId may contain letters, numbers, # . _ - (max 64 chars)'),
  
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

  query('resolution')
    .optional()
    .isIn(Object.values(RESOLUTIONS))
    .withMessage(`Resolution must be one of: ${Object.values(RESOLUTIONS).join(', ')}`),

  query('clientId')
    .optional()
    .trim()
    .matches(CLIENT_ID_PATTERN)
    .withMessage('clientId may contain letters, numbers, # . _ - (max 64 chars)'),
  
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

const validateAccountPayload = [
  body('clientId')
    .exists().withMessage('clientId is required')
    .bail()
    .trim()
    .matches(CLIENT_ID_PATTERN)
    .withMessage('clientId may contain letters, numbers, # . _ - (max 64 chars)'),

  body('label')
    .exists().withMessage('label is required')
    .bail()
    .isLength({ min: 1, max: 100 }),

  body('amoDomain')
    .exists().withMessage('amoDomain is required')
    .bail()
    .isString(),

  body('amoClientId').notEmpty(),
  body('amoClientSecret').notEmpty(),
  body('amoRedirectUri').notEmpty().isURL().withMessage('amoRedirectUri must be a valid URL'),
  body('amoAccessToken').notEmpty(),
  body('amoRefreshToken').notEmpty(),

  body('mattermostWebhookUrl')
    .exists().withMessage('mattermostWebhookUrl is required')
    .bail()
    .isURL().withMessage('mattermostWebhookUrl must be a valid URL'),

  body('mattermostChannel')
    .exists().withMessage('mattermostChannel is required')
    .bail()
    .isLength({ min: 1, max: 100 }),

  body('responsibleEmail')
    .optional({ nullable: true })
    .isEmail()
    .withMessage('responsibleEmail must be a valid email'),

  body('emailRecipients')
    .optional({ nullable: true })
    .isArray()
    .withMessage('emailRecipients must be an array'),

  body('emailRecipients.*')
    .optional()
    .isEmail()
    .withMessage('emailRecipients must contain valid emails'),

  validate
];

const validateExternalIncident = [
  body('clientId')
    .optional()
    .trim()
    .matches(CLIENT_ID_PATTERN)
    .withMessage('clientId may contain letters, numbers, # . _ - (max 64 chars)'),

  body('status')
    .optional()
    .isIn(['down', 'up', 'warning'])
    .withMessage('status must be one of: down, up, warning'),

  body('checkType')
    .optional()
    .isString()
    .isLength({ min: 2, max: 32 }),

  body('message')
    .optional()
    .isString()
    .isLength({ min: 3, max: 500 }),

  validate
];

module.exports = {
  validate,
  validateHistory,
  validateStats,
  validateIncidents,
  validateAccountPayload,
  validateExternalIncident
};

