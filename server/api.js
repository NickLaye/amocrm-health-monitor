const express = require('express');
const database = require('./database');
const monitor = require('./monitor');
const { authenticateSSE, asyncHandler } = require('./middleware/auth');
const { validateHistory, validateStats, validateIncidents } = require('./middleware/validation');
const { createLogger } = require('./utils/logger');
const { CHECK_TYPES } = require('./config/constants');
const metrics = require('./metrics');

const router = express.Router();
const logger = createLogger('API');

// SSE clients storage
const sseClients = [];

// SSE heartbeat interval (30 seconds)
const SSE_HEARTBEAT_INTERVAL = 30000;
let heartbeatIntervalId = null;

// Get current status of all services
router.get('/status', asyncHandler(async (req, res) => {
  const status = monitor.getStatus();
  res.json({
    success: true,
    data: status,
    timestamp: Date.now()
  });
}));

// Get historical data for charts
router.get('/history', validateHistory, asyncHandler(async (req, res) => {
  const { checkType, hours = 24 } = req.query;
  
  const data = await database.getHealthChecks(checkType || null, hours);
  
  res.json({
    success: true,
    data,
    count: data.length
  });
}));

// Get incidents
router.get('/incidents', validateIncidents, asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  const incidents = await database.getIncidents(limit);
  
  res.json({
    success: true,
    data: incidents,
    count: incidents.length
  });
}));

// Get statistics
router.get('/stats', validateStats, asyncHandler(async (req, res) => {
  const { hours = 24 } = req.query;
  
  const checkTypes = Object.values(CHECK_TYPES);
  const stats = {};
  
  for (const checkType of checkTypes) {
    const [avgResponseTime, uptime, percentile95, responseStats, mttr, mtbf] = await Promise.all([
      database.getAverageResponseTime(checkType, hours),
      database.getUptimePercentage(checkType, hours),
      database.getPercentileResponseTime(checkType, hours, 95),
      database.getResponseTimeStats(checkType, hours),
      database.getMTTR(checkType, hours),
      database.getMTBF(checkType, hours)
    ]);
    
    // Calculate Error Rate and Success Rate
    const errorRate = uptime.total > 0 ? 
      ((uptime.down / uptime.total) * 100).toFixed(2) : 0;
    const successRate = uptime.percentage; // Already calculated
    
    // Calculate Apdex Score (T = 500ms, 4T = 2000ms)
    const satisfied = await database.getChecksUnderThreshold(checkType, hours, 500);
    const tolerating = await database.getChecksInRange(checkType, hours, 500, 2000);
    const apdex = uptime.total > 0 ?
      ((satisfied + tolerating / 2) / uptime.total).toFixed(3) : null;
    
    stats[checkType] = {
      // Existing metrics
      averageResponseTime: avgResponseTime.average,
      checkCount: avgResponseTime.count,
      uptime: uptime.percentage,
      totalChecks: uptime.total,
      upChecks: uptime.up,
      downChecks: uptime.down,
      
      // New critical metrics
      errorRate: parseFloat(errorRate),
      successRate: successRate,
      percentile95: percentile95.value,
      
      // Response time stats
      minResponseTime: responseStats.min,
      maxResponseTime: responseStats.max,
      medianResponseTime: responseStats.median,
      
      // Reliability metrics
      mttr: mttr.mttr,
      mtbf: mtbf.mtbf,
      
      // User satisfaction
      apdex: parseFloat(apdex)
    };
  }
  
  res.json({
    success: true,
    data: stats,
    period: `${hours} hours`
  });
}));

// Health check for the monitoring service itself
router.get('/health', (req, res) => {
  const lastCheck = monitor.getLastCheckTime();
  const isHealthy = monitor.isHealthy();
  const uptime = process.uptime();
  
  const timeSinceLastCheck = lastCheck ? Date.now() - lastCheck : null;
  
  // Update SSE clients metric
  metrics.updateSSEClients(sseClients.length);
  
  const health = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    lastCheck: lastCheck,
    timeSinceLastCheck: timeSinceLastCheck,
    uptimeSeconds: Math.floor(uptime),
    timestamp: Date.now(),
    sseClients: sseClients.length
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
router.get('/metrics', asyncHandler(async (req, res) => {
  res.set('Content-Type', metrics.getContentType());
  const metricsData = await metrics.getMetrics();
  res.end(metricsData);
}));

// Server-Sent Events for real-time updates (with authentication)
router.get('/stream', authenticateSSE, (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Send initial connection message
  res.write('data: {"type":"connected","message":"Connected to health monitor stream"}\n\n');
  
  // Add client to list
  const clientId = Date.now();
  const client = { id: clientId, res, lastHeartbeat: Date.now() };
  sseClients.push(client);
  
  logger.info(`SSE client ${clientId} connected. Total: ${sseClients.length}`);
  
  // Start heartbeat if not already running
  if (!heartbeatIntervalId && sseClients.length > 0) {
    startHeartbeat();
  }
  
  // Remove client on disconnect
  req.on('close', () => {
    const index = sseClients.findIndex(c => c.id === clientId);
    if (index !== -1) {
      sseClients.splice(index, 1);
    }
    logger.info(`SSE client ${clientId} disconnected. Total: ${sseClients.length}`);
    
    // Stop heartbeat if no clients
    if (sseClients.length === 0 && heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
      heartbeatIntervalId = null;
      logger.debug('SSE heartbeat stopped - no clients');
    }
  });
});

/**
 * Start SSE heartbeat to keep connections alive and detect dead clients
 */
function startHeartbeat() {
  heartbeatIntervalId = setInterval(() => {
    const now = Date.now();
    const deadClients = [];
    
    sseClients.forEach((client, index) => {
      try {
        client.res.write(': heartbeat\n\n');
        client.lastHeartbeat = now;
      } catch (error) {
        logger.warn(`Dead SSE client detected: ${client.id}`);
        deadClients.push(index);
      }
    });
    
    // Remove dead clients in reverse order to maintain correct indices
    deadClients.reverse().forEach(index => {
      const client = sseClients[index];
      logger.info(`Removing dead SSE client ${client.id}`);
      sseClients.splice(index, 1);
    });
    
    if (sseClients.length > 0) {
      logger.debug(`SSE heartbeat sent to ${sseClients.length} clients`);
    }
  }, SSE_HEARTBEAT_INTERVAL);
  
  logger.info('SSE heartbeat started');
}

/**
 * Broadcast updates to all SSE clients
 */
function broadcastUpdate(checkType, data) {
  if (sseClients.length === 0) return;
  
  const message = JSON.stringify({
    type: 'status_update',
    checkType,
    data,
    timestamp: Date.now()
  });
  
  const deadClients = [];
  sseClients.forEach((client, index) => {
    try {
      client.res.write(`data: ${message}\n\n`);
    } catch (error) {
      logger.error(`Error broadcasting to SSE client ${client.id}:`, error);
      deadClients.push(index);
    }
  });
  
  // Clean up dead clients
  deadClients.reverse().forEach(index => {
    logger.warn(`Removing failed SSE client during broadcast`);
    sseClients.splice(index, 1);
  });
}

// Register monitor listener for real-time updates
monitor.addListener((checkType, data) => {
  broadcastUpdate(checkType, data);
});

module.exports = router;

