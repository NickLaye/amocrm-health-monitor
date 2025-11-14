require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Import utilities and config
const { validateEnv, getIntEnvOrDefault, logConfiguration } = require('./config/env-validator');
const { DEFAULTS } = require('./config/constants');
const { createLogger } = require('./utils/logger');

// Import application modules
const database = require('./database');
const monitor = require('./monitor');
const apiRouter = require('./api');

// Initialize logger
const logger = createLogger('Server');

const app = express();
const PORT = getIntEnvOrDefault('PORT', DEFAULTS.PORT);

// Security middleware - Helmet.js
app.use(helmet({
  contentSecurityPolicy: false, // Для совместимости с React
  crossOriginEmbedderPolicy: false
}));

// Middleware
// Compression for all responses
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Compression level (0-9)
}));

// CORS with configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['*'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health check
    return req.path === '/api/health';
  }
});

app.use('/api/', apiLimiter);

app.use(express.json());

// API routes
app.use('/api', apiRouter);

// Serve static files from React build (in production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Health check endpoint for the server itself
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Request error', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

/**
 * Initialize and start server
 */
async function start() {
  try {
    // Validate environment variables
    logger.info('Validating environment variables...');
    validateEnv();
    logConfiguration();
    
    // Initialize database
    logger.info('Initializing database...');
    await database.initialize();
    logger.info('Database initialized successfully');
    
    // Start monitoring
    logger.info('Starting amoCRM monitoring...');
    monitor.start();
    logger.info('Health monitoring started');
    
    // Setup database cleanup cron job (runs every day at 3:00 AM)
    logger.info('Setting up database cleanup cron job...');
    cron.schedule('0 3 * * *', async () => {
      logger.info('Starting scheduled database cleanup...');
      try {
        await database.cleanOldRecords();
        logger.info('Scheduled database cleanup completed successfully');
      } catch (error) {
        logger.error('Scheduled database cleanup failed', error);
      }
    });
    logger.info('Database cleanup cron job scheduled (daily at 3:00 AM)');
    
    // Start server
    app.listen(PORT, () => {
      logger.info(`
========================================
🚀 amoCRM Health Monitor started
📊 Server running on port ${PORT}
🔍 Monitoring: ${process.env.AMOCRM_DOMAIN}
⏱️  Check interval: ${getIntEnvOrDefault('CHECK_INTERVAL', DEFAULTS.CHECK_INTERVAL)}ms
🧹 Database cleanup: Daily at 3:00 AM
========================================
`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal) {
  logger.info(`\nReceived ${signal}. Shutting down gracefully...`);
  try {
    monitor.stop();
    await database.close();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the application
start();

