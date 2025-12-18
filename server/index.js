require('dotenv').config({ quiet: true });
const cron = require('node-cron');

// Import utilities and config
const { validateEnv, getIntEnvOrDefault, logConfiguration } = require('./config/env-validator');
const { DEFAULTS } = require('./config/constants');
const { createLogger } = require('./utils/logger');

// Import application modules
const database = require('./database');
const monitor = require('./monitor-orchestrator');
const aggregator = require('./aggregator');
const AppServer = require('./app-server');

// Initialize logger
const logger = createLogger('Server');

const PORT = getIntEnvOrDefault('PORT', DEFAULTS.PORT);

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

    // Initialize Express App through AppServer
    const appServer = new AppServer();
    const app = appServer.initialize();

    // Start monitoring
    logger.info('Starting amoCRM monitoring...');
    monitor.start();
    logger.info('Health monitoring started');

    // Start aggregator after initial DB seed to ensure background rollups
    logger.info('Starting aggregate scheduler...');
    aggregator.start();

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
    app.listen(PORT, '0.0.0.0', () => {
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
    aggregator.stop();
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

