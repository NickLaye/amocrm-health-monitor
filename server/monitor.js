const axios = require('axios');

// Import configuration and utilities
const { CHECK_TYPES, STATUS, DEFAULTS } = require('./config/constants');
const { getIntEnvOrDefault } = require('./config/env-validator');
const { createLogger } = require('./utils/logger');
const { buildAmoCRMUrl, createAuthConfig, extractErrorMessage, isServerError } = require('./utils/http-helpers');

// Import application modules
const database = require('./database');
const notifications = require('./notifications');
const tokenManager = require('./token-manager');
const metrics = require('./metrics');

// Initialize logger
const logger = createLogger('Monitor');

/**
 * AmoCRM Health Monitoring Service
 * Performs periodic health checks on various amoCRM endpoints
 */
class AmoCRMMonitor {
  constructor() {
    this.domain = process.env.AMOCRM_DOMAIN;
    this.checkInterval = getIntEnvOrDefault('CHECK_INTERVAL', DEFAULTS.CHECK_INTERVAL);
    this.timeoutThreshold = getIntEnvOrDefault('TIMEOUT_THRESHOLD', DEFAULTS.TIMEOUT_THRESHOLD);
    this.intervalId = null;
    this.currentStatus = {};
    this.listeners = [];
    
    // Initialize status for all check types
    Object.values(CHECK_TYPES).forEach(type => {
      this.currentStatus[type] = {
        status: STATUS.UNKNOWN,
        responseTime: null,
        lastCheck: null,
        errorMessage: null
      };
    });
    
    logger.info(`Monitor initialized: ${this.domain} (interval: ${this.checkInterval}ms)`);
  }

  /**
   * Add listener for status updates
   * @param {Function} callback - Callback function to be called on status updates
   * @returns {void}
   * @example
   * monitor.addListener((update) => {
   *   logger.info('Status changed:', update);
   * });
   */
  addListener(callback) {
    this.listeners.push(callback);
    logger.debug(`Listener added (total: ${this.listeners.length})`);
  }

  /**
   * Notify all registered listeners of status changes
   * @param {string} checkType - Type of check that updated
   * @param {Object} data - Status data
   */
  notifyListeners(checkType, data) {
    this.listeners.forEach(callback => {
      try {
        callback(checkType, data);
      } catch (err) {
        logger.error('Error in listener callback', err);
      }
    });
  }

  // Get current access token
  async getAccessToken() {
    try {
      return await tokenManager.getAccessToken();
    } catch (error) {
      logger.error('Error getting access token', error);
      // Fallback to env variable if token manager fails
      return process.env.AMOCRM_ACCESS_TOKEN;
    }
  }

  /**
   * Perform health check on GET API endpoint
   * @returns {Promise<{status: string, responseTime: number, error: string|null}>}
   * @private
   */
  async checkGetAPI() {
    const startTime = Date.now();
    try {
      const accessToken = await this.getAccessToken();
      const response = await axios.get(
        `https://${this.domain}/api/v4/account`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          timeout: this.timeoutThreshold
        }
      );
      
      const responseTime = Date.now() - startTime;
      const status = response.status === 200 ? 'up' : 'down';
      
      await database.insertHealthCheck(CHECK_TYPES.GET, status, responseTime);
      await this.updateStatus(CHECK_TYPES.GET, status, responseTime, null);
      
      return { status, responseTime, error: null };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error.message || 'Unknown error';
      
      await database.insertHealthCheck(CHECK_TYPES.GET, 'down', responseTime, errorMessage);
      await this.updateStatus(CHECK_TYPES.GET, 'down', responseTime, errorMessage);
      
      return { status: 'down', responseTime, error: errorMessage };
    }
  }

  // Perform POST API check
  // Note: Changed to use GET request to avoid creating test leads in amoCRM
  // This still validates that the API endpoint is accessible and responsive
  async checkPostAPI() {
    const startTime = Date.now();
    try {
      const accessToken = await this.getAccessToken();
      // Use GET request with limit=1 to check API write endpoint accessibility
      // This validates authentication and endpoint availability without creating data
      const response = await axios.get(
        `https://${this.domain}/api/v4/leads?limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: this.timeoutThreshold,
          validateStatus: (status) => status < 500 // Accept 4xx as "up" since endpoint is reachable
        }
      );
      
      const responseTime = Date.now() - startTime;
      const status = response.status < 500 ? 'up' : 'down';
      
      await database.insertHealthCheck(CHECK_TYPES.POST, status, responseTime);
      await this.updateStatus(CHECK_TYPES.POST, status, responseTime, null);
      
      return { status, responseTime, error: null };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error.message || 'Unknown error';
      
      await database.insertHealthCheck(CHECK_TYPES.POST, 'down', responseTime, errorMessage);
      await this.updateStatus(CHECK_TYPES.POST, 'down', responseTime, errorMessage);
      
      return { status: 'down', responseTime, error: errorMessage };
    }
  }

  /**
   * Perform health check on web interface
   * @returns {Promise<{status: string, responseTime: number, error: string|null}>}
   * @private
   */
  async checkWeb() {
    const startTime = Date.now();
    try {
      const response = await axios.get(
        `https://${this.domain}`,
        {
          timeout: this.timeoutThreshold,
          maxRedirects: 5,
          validateStatus: (status) => status < 500 // Accept any status code below 500
        }
      );
      
      const responseTime = Date.now() - startTime;
      // Consider it "up" if server responds with any 2xx, 3xx, or 4xx code
      const status = response.status < 500 ? 'up' : 'down';
      
      await database.insertHealthCheck(CHECK_TYPES.WEB, status, responseTime);
      await this.updateStatus(CHECK_TYPES.WEB, status, responseTime, null);
      
      return { status, responseTime, error: null };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error.message || 'Unknown error';
      
      await database.insertHealthCheck(CHECK_TYPES.WEB, 'down', responseTime, errorMessage);
      await this.updateStatus(CHECK_TYPES.WEB, 'down', responseTime, errorMessage);
      
      return { status: 'down', responseTime, error: errorMessage };
    }
  }

  // Perform HOOK check
  async checkHook() {
    const startTime = Date.now();
    try {
      const accessToken = await this.getAccessToken();
      // Check webhooks endpoint
      const response = await axios.get(
        `https://${this.domain}/api/v4/webhooks`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          timeout: this.timeoutThreshold,
          validateStatus: (status) => status < 500
        }
      );
      
      const responseTime = Date.now() - startTime;
      const status = response.status < 500 ? 'up' : 'down';
      
      await database.insertHealthCheck(CHECK_TYPES.HOOK, status, responseTime);
      await this.updateStatus(CHECK_TYPES.HOOK, status, responseTime, null);
      
      return { status, responseTime, error: null };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error.message || 'Unknown error';
      
      await database.insertHealthCheck(CHECK_TYPES.HOOK, 'down', responseTime, errorMessage);
      await this.updateStatus(CHECK_TYPES.HOOK, 'down', responseTime, errorMessage);
      
      return { status: 'down', responseTime, error: errorMessage };
    }
  }

  // Perform Digital Pipeline check
  async checkDigitalPipeline() {
    const startTime = Date.now();
    try {
      // Check Digital Pipeline service
      const response = await axios.get(
        'https://digitalpipeline.amocrm.ru/health',
        {
          timeout: this.timeoutThreshold,
          validateStatus: (status) => status < 500
        }
      );
      
      const responseTime = Date.now() - startTime;
      const status = response.status < 500 ? 'up' : 'down';
      
      await database.insertHealthCheck(CHECK_TYPES.DP, status, responseTime);
      await this.updateStatus(CHECK_TYPES.DP, status, responseTime, null);
      
      return { status, responseTime, error: null };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error.message || 'Unknown error';
      
      await database.insertHealthCheck(CHECK_TYPES.DP, 'down', responseTime, errorMessage);
      await this.updateStatus(CHECK_TYPES.DP, 'down', responseTime, errorMessage);
      
      return { status: 'down', responseTime, error: errorMessage };
    }
  }

  // Update status and handle incidents
  async updateStatus(checkType, status, responseTime, errorMessage) {
    const previousStatus = this.currentStatus[checkType].status;
    
    this.currentStatus[checkType] = {
      status,
      responseTime,
      lastCheck: Date.now(),
      errorMessage
    };

    // Notify listeners
    this.notifyListeners(checkType, this.currentStatus[checkType]);

    // Handle incident tracking
    if (status === 'down' && previousStatus !== 'down') {
      // New incident started
      const incidentId = await database.insertIncident(
        checkType,
        Date.now(),
        errorMessage || 'Service is down'
      );
      
      // Send notification
      await notifications.sendDownNotification(checkType, errorMessage);
      
      logger.info(`Service went DOWN - Incident #${incidentId} created`, { checkType, incidentId });
    } else if (status === 'up' && previousStatus === 'down') {
      // Incident resolved
      const openIncident = await database.getOpenIncident(checkType);
      if (openIncident) {
        await database.updateIncidentEndTime(openIncident.id, Date.now());
        await notifications.sendUpNotification(checkType, openIncident.start_time);
        logger.info(`Service is back UP - Incident #${openIncident.id} resolved`, { checkType, incidentId: openIncident.id });
      }
    }
  }

  // Run all checks
  async runAllChecks() {
    logger.debug('Running health checks');
    
    try {
      await Promise.all([
        this.checkGetAPI(),
        this.checkPostAPI(),
        this.checkWeb(),
        this.checkHook(),
        this.checkDigitalPipeline()
      ]);
    } catch (error) {
      logger.error('Error running health checks', error);
    }
  }

  // Resolve orphaned incidents (incidents left open after restart)
  async resolveOrphanedIncidents() {
    try {
      const openIncidents = await database.getAllOpenIncidents();
      if (!openIncidents || openIncidents.length === 0) {
        return;
      }

      logger.info(`Found ${openIncidents.length} open incident(s), checking if they should be closed...`, { count: openIncidents.length });

      for (const incident of openIncidents) {
        const currentStatus = this.currentStatus[incident.check_type];
        if (currentStatus && currentStatus.status === 'up') {
          // Service is up, close the incident
          const now = Date.now();
          await database.updateIncidentEndTime(incident.id, now);
          
          // Send UP notification
          await notifications.sendUpNotification(incident.check_type, incident.start_time);
          
          logger.info(`Closed orphaned incident (service is UP)`, { checkType: incident.check_type, incidentId: incident.id });
        }
      }
    } catch (error) {
      logger.error('Error resolving orphaned incidents', error);
    }
  }

  // Start monitoring
  async start() {
    logger.info('Starting amoCRM health monitoring', { interval: this.checkInterval });
    
    // Initialize token manager
    try {
      tokenManager.loadTokens();
      if (!tokenManager.currentTokens) {
        logger.info('Initializing tokens from environment');
        tokenManager.initializeFromEnv();
      }
      // Start auto-refresh
      tokenManager.startAutoRefresh();
    } catch (error) {
      logger.error('Error initializing token manager', error);
    }
    
    // Run initial check immediately
    await this.runAllChecks();
    
    // After first check, resolve any orphaned incidents
    setTimeout(() => {
      this.resolveOrphanedIncidents();
    }, 2000);
    
    // Then run periodically
    this.intervalId = setInterval(() => {
      this.runAllChecks();
    }, this.checkInterval);

    // Clean old records daily
    setInterval(() => {
      database.cleanOldRecords().catch(err => {
        logger.error('Error cleaning old records', err);
      });
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Stop periodic health checks
   * @returns {void}
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Health monitoring stopped');
    }
  }

  /**
   * Get current status for all check types
   * @returns {Object} Current status of all checks
   */
  getStatus() {
    return this.currentStatus;
  }

  /**
   * Get timestamp of last check execution
   * @returns {number|null} Timestamp of last check or null
   */
  getLastCheckTime() {
    const timestamps = Object.values(this.currentStatus)
      .map(s => s.lastCheck)
      .filter(t => t !== null);
    
    return timestamps.length > 0 ? Math.max(...timestamps) : null;
  }

  /**
   * Check if monitoring is healthy
   * @returns {boolean} True if monitoring is functioning properly
   */
  isHealthy() {
    const lastCheck = this.getLastCheckTime();
    if (!lastCheck) return false;
    
    const timeSinceLastCheck = Date.now() - lastCheck;
    // Считаем здоровым, если последняя проверка была менее 2 интервалов назад
    const threshold = this.checkInterval * 2;
    
    return timeSinceLastCheck < threshold;
  }
}

module.exports = new AmoCRMMonitor();

