/**
 * Export Helpers for generating reports in various formats
 */

/**
 * Convert data to CSV format
 * @param {Array<Object>} data - Array of objects to convert
 * @param {Array<string>} headers - Column headers
 * @returns {string} CSV formatted string
 */
function toCSV(data, headers) {
  if (!data || data.length === 0) {
    return '';
  }

  // Create header row
  const csvHeaders = headers.join(',');
  
  // Create data rows
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      // Handle values with commas or quotes
      if (value && (value.toString().includes(',') || value.toString().includes('"'))) {
        return `"${value.toString().replace(/"/g, '""')}"`;
      }
      return value || '';
    }).join(',');
  });

  return [csvHeaders, ...csvRows].join('\n');
}

/**
 * Export health checks to CSV
 * @param {Array<Object>} healthChecks - Health check records
 * @returns {string} CSV formatted string
 */
function exportHealthChecksToCSV(healthChecks) {
  const headers = ['timestamp', 'check_type', 'status', 'response_time', 'error_message'];
  
  const formatted = healthChecks.map(check => ({
    timestamp: new Date(check.timestamp).toISOString(),
    check_type: check.check_type,
    status: check.status,
    response_time: check.response_time,
    error_message: check.error_message || ''
  }));

  return toCSV(formatted, headers);
}

/**
 * Export incidents to CSV
 * @param {Array<Object>} incidents - Incident records
 * @returns {string} CSV formatted string
 */
function exportIncidentsToCSV(incidents) {
  const headers = ['id', 'check_type', 'start_time', 'end_time', 'duration', 'error_message'];
  
  const formatted = incidents.map(incident => ({
    id: incident.id,
    check_type: incident.check_type,
    start_time: new Date(incident.start_time).toISOString(),
    end_time: incident.end_time ? new Date(incident.end_time).toISOString() : 'Ongoing',
    duration: incident.duration ? `${Math.round(incident.duration / 1000)} seconds` : 'Ongoing',
    error_message: incident.error_message || ''
  }));

  return toCSV(formatted, headers);
}

/**
 * Export statistics to CSV
 * @param {Object} stats - Statistics object
 * @returns {string} CSV formatted string
 */
function exportStatsToCSV(stats) {
  const headers = [
    'check_type',
    'uptime',
    'availability',
    'avg_response_time',
    'p95_response_time',
    'p99_response_time',
    'total_checks',
    'up_checks',
    'warning_checks',
    'down_checks',
    'error_rate'
  ];
  
  const formatted = Object.entries(stats).map(([checkType, data]) => ({
    check_type: checkType,
    uptime: data.uptime !== undefined ? `${data.uptime.toFixed(2)}%` : '0%',
    availability: data.availability !== undefined ? `${data.availability.toFixed(2)}%` : '0%',
    avg_response_time: `${Math.round(data.avgResponseTime || 0)}ms`,
    p95_response_time: `${Math.round(data.p95ResponseTime || 0)}ms`,
    p99_response_time: `${Math.round(data.p99ResponseTime || 0)}ms`,
    total_checks: data.totalChecks ?? data.checkCount ?? 0,
    up_checks: data.upChecks ?? data.successfulChecks ?? 0,
    warning_checks: data.warningChecks ?? 0,
    down_checks: data.downChecks ?? data.failedChecks ?? 0,
    error_rate: data.errorRate !== undefined ? `${data.errorRate.toFixed(2)}%` : '0%'
  }));

  return toCSV(formatted, headers);
}

/**
 * Generate report in JSON format
 * @param {Object} data - Data to export
 * @param {boolean} pretty - Whether to pretty-print JSON
 * @returns {string} JSON formatted string
 */
function toJSON(data, pretty = true) {
  return JSON.stringify(data, null, pretty ? 2 : 0);
}

/**
 * Generate comprehensive report
 * @param {Object} params - Report parameters
 * @param {Array} params.healthChecks - Health check records
 * @param {Array} params.incidents - Incident records
 * @param {Object} params.stats - Statistics
 * @param {string} params.period - Time period
 * @returns {Object} Comprehensive report
 */
function generateReport(params) {
  const { healthChecks, incidents, stats, period } = params;
  
  return {
    metadata: {
      generated_at: new Date().toISOString(),
      period,
      total_checks: healthChecks.length,
      total_incidents: incidents.length
    },
    summary: {
      overall_uptime: calculateOverallUptime(stats),
      avg_response_time: calculateAvgResponseTime(stats),
      services: Object.keys(stats).length
    },
    statistics: stats,
    recent_incidents: incidents.slice(0, 10),
    health_checks_sample: healthChecks.slice(0, 100)
  };
}

/**
 * Calculate overall uptime from stats
 * @param {Object} stats - Statistics object
 * @returns {number} Overall uptime percentage
 */
function calculateOverallUptime(stats) {
  const uptimes = Object.values(stats).map(s => s.uptime || 0);
  return uptimes.length > 0 
    ? uptimes.reduce((a, b) => a + b, 0) / uptimes.length 
    : 0;
}

/**
 * Calculate average response time from stats
 * @param {Object} stats - Statistics object
 * @returns {number} Average response time in milliseconds
 */
function calculateAvgResponseTime(stats) {
  const times = Object.values(stats).map(s => s.avgResponseTime || 0);
  return times.length > 0 
    ? times.reduce((a, b) => a + b, 0) / times.length 
    : 0;
}

module.exports = {
  toCSV,
  toJSON,
  exportHealthChecksToCSV,
  exportIncidentsToCSV,
  exportStatsToCSV,
  generateReport,
  calculateOverallUptime,
  calculateAvgResponseTime
};

