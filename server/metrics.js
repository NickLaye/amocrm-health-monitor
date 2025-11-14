/**
 * Prometheus metrics for monitoring
 */

const client = require('prom-client');
const { createLogger } = require('./utils/logger');

const logger = createLogger('Metrics');

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics

/**
 * Counter for total health checks performed
 */
const healthChecksTotal = new client.Counter({
  name: 'amocrm_health_checks_total',
  help: 'Total number of health checks performed',
  labelNames: ['check_type', 'status'],
  registers: [register]
});

/**
 * Gauge for current service status (1 = up, 0 = down)
 */
const serviceStatus = new client.Gauge({
  name: 'amocrm_service_status',
  help: 'Current status of amoCRM services (1 = up, 0 = down)',
  labelNames: ['check_type'],
  registers: [register]
});

/**
 * Histogram for response times
 */
const responseTimeHistogram = new client.Histogram({
  name: 'amocrm_response_time_seconds',
  help: 'Response time of amoCRM services in seconds',
  labelNames: ['check_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10], // Buckets in seconds
  registers: [register]
});

/**
 * Gauge for uptime percentage
 */
const uptimeGauge = new client.Gauge({
  name: 'amocrm_uptime_percentage',
  help: 'Uptime percentage for amoCRM services',
  labelNames: ['check_type'],
  registers: [register]
});

/**
 * Counter for incidents
 */
const incidentsTotal = new client.Counter({
  name: 'amocrm_incidents_total',
  help: 'Total number of incidents detected',
  labelNames: ['check_type'],
  registers: [register]
});

/**
 * Gauge for active SSE clients
 */
const sseClientsGauge = new client.Gauge({
  name: 'amocrm_sse_clients_active',
  help: 'Number of active SSE client connections',
  registers: [register]
});

/**
 * Record a health check
 * @param {string} checkType - Type of check
 * @param {string} status - Status (up/down)
 * @param {number} responseTime - Response time in milliseconds
 */
function recordHealthCheck(checkType, status, responseTime) {
  // Increment counter
  healthChecksTotal.inc({ check_type: checkType, status });
  
  // Update service status gauge
  serviceStatus.set({ check_type: checkType }, status === 'up' ? 1 : 0);
  
  // Record response time (convert ms to seconds)
  if (responseTime) {
    responseTimeHistogram.observe({ check_type: checkType }, responseTime / 1000);
  }
  
  logger.debug(`Recorded health check: ${checkType} - ${status}`);
}

/**
 * Update uptime metric
 * @param {string} checkType - Type of check
 * @param {number} percentage - Uptime percentage (0-100)
 */
function updateUptime(checkType, percentage) {
  uptimeGauge.set({ check_type: checkType }, percentage);
}

/**
 * Record an incident
 * @param {string} checkType - Type of check
 */
function recordIncident(checkType) {
  incidentsTotal.inc({ check_type: checkType });
  logger.debug(`Recorded incident: ${checkType}`);
}

/**
 * Update SSE clients count
 * @param {number} count - Number of active SSE clients
 */
function updateSSEClients(count) {
  sseClientsGauge.set(count);
}

/**
 * Get metrics in Prometheus format
 * @returns {Promise<string>} Metrics in Prometheus format
 */
async function getMetrics() {
  return register.metrics();
}

/**
 * Get content type for Prometheus metrics
 * @returns {string} Content type
 */
function getContentType() {
  return register.contentType;
}

logger.info('Prometheus metrics initialized');

module.exports = {
  recordHealthCheck,
  updateUptime,
  recordIncident,
  updateSSEClients,
  getMetrics,
  getContentType,
  register
};

