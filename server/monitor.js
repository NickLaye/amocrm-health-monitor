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
      console.error('Error getting access token:', error);
      // Fallback to env variable if token manager fails
      return process.env.AMOCRM_ACCESS_TOKEN;
    }
  }

  // Perform GET API check
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
  async checkPostAPI() {
    const startTime = Date.now();
    try {
      const accessToken = await this.getAccessToken();
      // We'll do a lightweight check - just validate the endpoint without actually creating a lead
      const response = await axios.post(
        `https://${this.domain}/api/v4/leads`,
        {
          name: 'Health Check Test Lead',
          _embedded: {
            tags: [{ name: 'health-check' }]
          }
        },
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

  // Perform WEB check
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
      
      console.log(`[${checkType}] Service went DOWN - Incident #${incidentId} created`);
    } else if (status === 'up' && previousStatus === 'down') {
      // Incident resolved
      const openIncident = await database.getOpenIncident(checkType);
      if (openIncident) {
        await database.updateIncidentEndTime(openIncident.id, Date.now());
        await notifications.sendUpNotification(checkType, openIncident.start_time);
        console.log(`[${checkType}] Service is back UP - Incident #${openIncident.id} resolved`);
      }
    }
  }

  // Run all checks
  async runAllChecks() {
    console.log(`Running health checks at ${new Date().toISOString()}`);
    
    try {
      await Promise.all([
        this.checkGetAPI(),
        this.checkPostAPI(),
        this.checkWeb(),
        this.checkHook(),
        this.checkDigitalPipeline()
      ]);
    } catch (error) {
      console.error('Error running health checks:', error);
    }
  }

  // Start monitoring
  async start() {
    console.log(`Starting amoCRM health monitoring every ${this.checkInterval}ms`);
    
    // Initialize token manager
    try {
      tokenManager.loadTokens();
      if (!tokenManager.currentTokens) {
        console.log('Initializing tokens from environment...');
        tokenManager.initializeFromEnv();
      }
      // Start auto-refresh
      tokenManager.startAutoRefresh();
    } catch (error) {
      console.error('Error initializing token manager:', error);
    }
    
    // Run initial check immediately
    this.runAllChecks();
    
    // Then run periodically
    this.intervalId = setInterval(() => {
      this.runAllChecks();
    }, this.checkInterval);

    // Clean old records daily
    setInterval(() => {
      database.cleanOldRecords().catch(err => {
        console.error('Error cleaning old records:', err);
      });
    }, 24 * 60 * 60 * 1000);
  }

  // Stop monitoring
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Health monitoring stopped');
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

