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

// Get public configuration for frontend
router.get('/config', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      apiSecret: process.env.API_SECRET || '',
      checkInterval: parseInt(process.env.CHECK_INTERVAL) || 60000,
      domain: process.env.AMOCRM_DOMAIN || ''
    },
    timestamp: Date.now()
  });
}));

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

// Get statistics (15 performance metrics)
router.get('/stats', validateStats, asyncHandler(async (req, res) => {
  const { hours = 24 } = req.query;
  
  const checkTypes = Object.values(CHECK_TYPES);
  const stats = {};
  
  for (const checkType of checkTypes) {
    // Use new getDetailedStatistics method that returns all 15 metrics
    const detailedStats = await database.getDetailedStatistics(checkType, hours);
    
    // Handle case where getDetailedStatistics returns undefined/null (return default values)
    if (!detailedStats) {
      logger.warn(`getDetailedStatistics returned null/undefined for ${checkType}, using defaults`);
      stats[checkType] = {
        uptime: 100,
        totalChecks: 0,
        mttr: 0,
        mtbf: hours,
        apdexScore: 1.0,
        successRate: 100,
        failureCount: 0,
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        lastIncident: null,
        incidentCount: 0,
        availability: 100,
        averageResponseTime: 0,
        checkCount: 0,
        percentile95: 0,
        apdex: 1.0,
        errorRate: 0,
        upChecks: 0,
        downChecks: 0
      };
      continue;
    }
    
    stats[checkType] = {
      // Basic metrics (1-2)
      uptime: detailedStats.uptime,
      totalChecks: detailedStats.totalChecks,
      
      // Reliability metrics (3-4)
      mttr: detailedStats.mttr, // Mean Time To Repair (minutes)
      mtbf: detailedStats.mtbf, // Mean Time Between Failures (hours)
      
      // User satisfaction (5)
      apdexScore: detailedStats.apdexScore,
      
      // Success/failure metrics (6-7)
      successRate: detailedStats.successRate,
      failureCount: detailedStats.failureCount,
      
      // Response time metrics (8-12)
      avgResponseTime: detailedStats.avgResponseTime,
      minResponseTime: detailedStats.minResponseTime,
      maxResponseTime: detailedStats.maxResponseTime,
      p95ResponseTime: detailedStats.p95ResponseTime,
      p99ResponseTime: detailedStats.p99ResponseTime,
      
      // Incident metrics (13-14)
      lastIncident: detailedStats.lastIncident,
      incidentCount: detailedStats.incidentCount,
      
      // Availability (15)
      availability: detailedStats.availability,
      
      // Legacy fields for backwards compatibility
      averageResponseTime: detailedStats.avgResponseTime,
      checkCount: detailedStats.totalChecks,
      percentile95: detailedStats.p95ResponseTime,
      apdex: detailedStats.apdexScore,
      errorRate: detailedStats.failureCount > 0 
        ? parseFloat(((detailedStats.failureCount / detailedStats.totalChecks) * 100).toFixed(2)) 
        : 0,
      upChecks: detailedStats.totalChecks - detailedStats.failureCount,
      downChecks: detailedStats.failureCount
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

// Export endpoints for reports
const { exportHealthChecksToCSV, exportIncidentsToCSV, exportStatsToCSV, toJSON, generateReport } = require('./utils/export-helpers');

router.get('/export/health-checks', validateHistory, asyncHandler(async (req, res) => {
  const { checkType, hours = 24, format = 'csv' } = req.query;
  
  const data = await database.getHealthChecks(checkType || null, hours);
  
  if (format === 'csv') {
    const csv = exportHealthChecksToCSV(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="health-checks-${Date.now()}.csv"`);
    res.send(csv);
  } else {
    res.json({ success: true, data });
  }
}));

router.get('/export/incidents', validateIncidents, asyncHandler(async (req, res) => {
  const { limit = 100, format = 'csv' } = req.query;
  
  const data = await database.getIncidents(limit);
  
  if (format === 'csv') {
    const csv = exportIncidentsToCSV(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="incidents-${Date.now()}.csv"`);
    res.send(csv);
  } else {
    res.json({ success: true, data });
  }
}));

router.get('/export/stats', validateStats, asyncHandler(async (req, res) => {
  const { hours = 24, format = 'csv' } = req.query;
  
  const checkTypes = Object.values(CHECK_TYPES);
  const statsPromises = checkTypes.map(async (checkType) => {
    const uptime = await database.getUptime(checkType, hours);
    const avgTime = await database.getAverageResponseTime(checkType, hours);
    const healthChecks = await database.getHealthChecks(checkType, hours);
    
    return {
      checkType,
      uptime,
      avgResponseTime: avgTime,
      totalChecks: healthChecks.length,
      successfulChecks: healthChecks.filter(c => c.status === 'up').length,
      failedChecks: healthChecks.filter(c => c.status === 'down').length
    };
  });
  
  const statsArray = await Promise.all(statsPromises);
  const stats = statsArray.reduce((acc, stat) => {
    acc[stat.checkType] = stat;
    return acc;
  }, {});
  
  if (format === 'csv') {
    const csv = exportStatsToCSV(stats);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="stats-${Date.now()}.csv"`);
    res.send(csv);
  } else {
    res.json({ success: true, data: stats });
  }
}));

router.get('/export/report', asyncHandler(async (req, res) => {
  const { hours = 24 } = req.query;
  
  const healthChecks = await database.getHealthChecks(null, hours);
  const incidents = await database.getIncidents(100);
  
  const checkTypes = Object.values(CHECK_TYPES);
  const statsPromises = checkTypes.map(async (checkType) => {
    const uptime = await database.getUptime(checkType, hours);
    const avgTime = await database.getAverageResponseTime(checkType, hours);
    const checks = healthChecks.filter(c => c.check_type === checkType);
    
    return {
      checkType,
      uptime,
      avgResponseTime: avgTime,
      totalChecks: checks.length,
      successfulChecks: checks.filter(c => c.status === 'up').length,
      failedChecks: checks.filter(c => c.status === 'down').length
    };
  });
  
  const statsArray = await Promise.all(statsPromises);
  const stats = statsArray.reduce((acc, stat) => {
    acc[stat.checkType] = stat;
    return acc;
  }, {});
  
  const report = generateReport({
    healthChecks,
    incidents,
    stats,
    period: `${hours} hours`
  });
  
  res.json({ success: true, data: report });
}));

module.exports = router;

