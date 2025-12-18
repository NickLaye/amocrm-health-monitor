const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const monitor = require('./monitor-orchestrator');
const metrics = require('./metrics');
const { createLogger } = require('./utils/logger');
const healthRoutes = require('./routes/health');

// Import new route modules
const clientsRouter = require('./routes/api/clients');
const accountsRouter = require('./routes/api/accounts');
const statusRouter = require('./routes/api/status');
const historyRouter = require('./routes/api/history');
const incidentsRouter = require('./routes/api/incidents');
const statsRouter = require('./routes/api/stats');
const webhooksRouter = require('./routes/api/webhooks');
const exportRouter = require('./routes/api/export');
const sseRouter = require('./routes/api/sse');

const router = express.Router();
const logger = createLogger('API');

// Load OpenAPI specification
const openApiPath = path.join(__dirname, 'docs', 'openapi.yaml');
const swaggerDocument = YAML.load(openApiPath);

// Swagger UI options
const swaggerOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'amoCRM Health Monitor API',
  customfavIcon: '/favicon.ico'
};

// Serve Swagger UI
router.use('/docs', swaggerUi.serve);
router.get('/docs', swaggerUi.setup(swaggerDocument, swaggerOptions));

// Mount routes
router.use('/health', healthRoutes);
router.use('/clients', clientsRouter);
router.use('/accounts', accountsRouter);
router.use('/status', statusRouter);
router.use('/history', historyRouter);
router.use('/incidents', incidentsRouter);
router.use('/stats', statsRouter);
router.use('/webhook', webhooksRouter); // /webhook/callback
router.use('/webhooks', webhooksRouter); // /webhooks/mattermail - handled by same router file
router.use('/export', exportRouter);
// Mount SSE and config routes
// sseRouter creates /stream, /stream/token, /config
router.use('/', sseRouter);
// Note: sseRouter is mounted at root of /api because it contains /config and /stream
// If we mounted at /sse, endpoints would be /api/sse/config etc.
// Check original api.js: /config, /stream were at root of router. So mounting at '/' is correct.

// Health check for the monitoring service itself
router.get('/health', (req, res) => {
  const lastCheck = monitor.getLastCheckTime();
  const isHealthy = monitor.isHealthy();
  const uptime = process.uptime();

  const timeSinceLastCheck = lastCheck ? Date.now() - lastCheck : null;

  // Update SSE clients metric using the exported getter
  metrics.updateSSEClients(sseRouter.getSseClientCount());

  const health = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    lastCheck: lastCheck,
    timeSinceLastCheck: timeSinceLastCheck,
    uptimeSeconds: Math.floor(uptime),
    timestamp: Date.now(),
    sseClients: sseRouter.getSseClientCount()
  };

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json({
    success: isHealthy,
    data: health
  });

  if (!isHealthy) {
    logger.warn('Health check failed - monitoring may not be functioning properly');
  }
});

// Prometheus metrics endpoint
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metrics.getContentType());
    const metricsData = await metrics.getMetrics();
    res.end(metricsData);
  } catch (error) {
    logger.error('Error serving metrics', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
