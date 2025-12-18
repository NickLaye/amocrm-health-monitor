const { CHECK_TYPES, STATUS, DEFAULTS, DEFAULT_CLIENT_ID, LATENCY_THRESHOLDS } = require('../config/constants');
const { createLogger } = require('../utils/logger');
const database = require('../database');
const notifications = require('../notifications');
const TokenManager = require('../token-manager');
const metrics = require('../metrics');

// Import mixins directly to avoid circular dependency with index.js
const DPHandler = require('./dp-handler');
const HealthChecks = require('./health-checks');
const StatusManager = require('./status-manager');

/**
 * Apply mixin properties to a target class
 * @param {Function} targetClass - The class to apply mixins to
 * @param {Function} mixinClass - The source mixin class
 */
function applyMixin(targetClass, mixinClass) {
    Object.getOwnPropertyNames(mixinClass.prototype).forEach(name => {
        if (name !== 'constructor') {
            Object.defineProperty(
                targetClass.prototype,
                name,
                Object.getOwnPropertyDescriptor(mixinClass.prototype, name) ||
                Object.create(null)
            );
        }
    });
}

const logger = createLogger('Monitor');

/**
 * Main monitoring class for amoCRM integration.
 * Orchestrates health checks, status management, and notifications.
 * Uses mixins for modular functionality.
 * 
 * @mixes DPHandler
 * @mixes HealthChecks
 * @mixes StatusManager
 */
class AmoCRMMonitor {
    /**
     * @param {Object} [clientConfig] - Client configuration object
     * @param {string} [clientConfig.id] - Client ID
     * @param {Object} [clientConfig.amo] - amoCRM credentials
     * @param {string} [clientConfig.amo.domain] - amoCRM domain
     * @param {Object} [clientConfig.monitoring] - Monitoring settings
     * @param {number} [clientConfig.monitoring.checkInterval] - Interval between checks in ms
     * @param {number} [clientConfig.monitoring.requestTimeout] - Request timeout in ms
     * @param {number} [clientConfig.monitoring.notificationDebounce] - Debounce time for notifications
     * @param {Object} [clientConfig.tokenManager] - Optional injected TokenManager instance
     */
    constructor(clientConfig = {}) {
        this.clientConfig = clientConfig;

        // Helper to pick values
        const pickMs = (value, envKey, fallback) => {
            if (value !== undefined) return value;
            const envVal = process.env[envKey];
            return envVal ? parseInt(envVal, 10) : fallback;
        };
        const pickInt = (value, fallbackEnvValue) => {
            return value !== undefined ? value : fallbackEnvValue;
        };

        // Configuration
        this.clientId = clientConfig.id || (process.env.AMOCRM_CLIENT_ID || DEFAULT_CLIENT_ID);
        this.domain = clientConfig.amo?.domain || process.env.AMOCRM_DOMAIN;

        // Timeouts and Intervals
        this.checkInterval = pickMs(clientConfig.monitoring?.checkInterval, 'CHECK_INTERVAL', DEFAULTS.CHECK_INTERVAL);
        this.timeoutThreshold = pickMs(clientConfig.monitoring?.requestTimeout, 'TIMEOUT_THRESHOLD', DEFAULTS.TIMEOUT_THRESHOLD);
        this.notificationDebounceMs = pickMs(clientConfig.monitoring?.notificationDebounce, 'NOTIFICATION_DEBOUNCE_MS', 5 * 60 * 1000); // 5 min default

        // Dependencies
        this.database = database;
        this.notifications = notifications;
        this.metrics = metrics;

        // Token Manager
        if (clientConfig.tokenManager) {
            this.tokenManager = clientConfig.tokenManager;
        } else {
            // Fallback for legacy single-tenant mode
            this.tokenManager = new TokenManager();
        }

        // State
        /**
         * @type {Object.<string, {status: string, responseTime: number|null, lastCheck: number|null, errorMessage: string|null, since: number}>}
         */
        this.currentStatus = {};
        Object.values(CHECK_TYPES).forEach(type => {
            this.currentStatus[type] = {
                status: STATUS.UNKNOWN,
                responseTime: null,
                lastCheck: null,
                errorMessage: null,
                since: Date.now()
            };
        });

        this.statusWindows = {};
        Object.values(CHECK_TYPES).forEach(type => {
            this.statusWindows[type] = {
                warningEvents: [],
                lastDownAt: 0,
                upRecoveryCount: 0
            };
        });

        // Escalation Config
        this.warningEscalationThreshold = 3;
        this.warningEscalationWindowMs = 15 * 60 * 1000;
        this.recoverySuccessThreshold = 2;

        this.lastNotificationTime = new Map();
        this.intervalId = null;
        this.listeners = [];

        // Digital Pipeline Config defaults (will be overridden by mixin init if used)
        this.dpCheckInterval = pickMs(clientConfig.monitoring?.dpCheckInterval, 'DP_CHECK_INTERVAL', 60000); // 1 min
        this.testEntity = {
            dealId: parseInt(clientConfig.entities?.dealId || process.env.AMOCRM_TEST_DEAL_ID || 0, 10),
            fieldId: parseInt(clientConfig.entities?.fieldId || process.env.AMOCRM_TEST_FIELD_ID || 0, 10)
        };

        // Initialize Mixins
        if (this.initializeDPHandler) {
            this.initializeDPHandler({
                contactName: clientConfig.entities?.contactName || process.env.AMOCRM_DP_CONTACT_NAME,
                responsibleUserId: parseInt(clientConfig.entities?.responsibleUserId || process.env.AMOCRM_DP_RESPONSIBLE_USER_ID, 10),
                customFieldId: parseInt(clientConfig.entities?.contactFieldId || process.env.AMOCRM_DP_CONTACT_FIELD_ID, 10),
                webhookTimeoutMs: pickMs(clientConfig.monitoring?.dpWebhookTimeout, 'DP_WEBHOOK_TIMEOUT_MS', 30000),
                checkIntervalMs: this.dpCheckInterval,
                requestTimeoutMs: this.timeoutThreshold,
                workerTimeoutMs: 120000
            });
        }
    }

    // --- Core Methods ---

    /**
     * Add a status change listener
     * @param {Function} callback - (checkType, data, context) => void
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * Notify all listeners of a status update
     * @param {string} checkType 
     * @param {Object} data 
     */
    notifyListeners(checkType, data) {
        this.listeners.forEach(cb => {
            try {
                cb(checkType, data);
            } catch (error) {
                logger.error('Error in status listener', { error: error.message, checkType });
            }
        });
    }

    /**
     * Get valid access token
     * @returns {Promise<string>}
     */
    async getAccessToken() {
        return this.tokenManager.getAccessToken();
    }

    /**
     * Update internal status and trigger notifications
     * @param {string} checkType 
     * @param {string} status 
     * @param {number} responseTime 
     * @param {string} errorMessage 
     * @param {Object} [details] 
     */
    async updateStatus(checkType, status, responseTime, errorMessage, details = {}) {
        const previousStatus = this.currentStatus[checkType].status;
        const now = Date.now();

        if (previousStatus !== status) {
            logger.debug(`Status change for ${checkType}: ${previousStatus} -> ${status}`, {
                checkType, previousStatus, newStatus: status
            });
        }

        const since = previousStatus === status ? this.currentStatus[checkType].since : now;

        this.currentStatus[checkType] = {
            status,
            responseTime,
            lastCheck: now,
            errorMessage,
            httpStatus: details.httpStatus || null,
            reason: details.reason || null,
            since,
            meta: details.meta || null
        };

        this.notifyListeners(checkType, this.currentStatus[checkType]);

        // Warning Notifications logic
        if (status === STATUS.WARNING && previousStatus !== STATUS.WARNING) {
            // Send warning
            await this.notifications.sendWarningNotification(checkType, {
                clientId: this.clientId,
                reason: details.reason,
                httpStatus: details.httpStatus,
                responseTime
            });
        } else if (previousStatus === STATUS.WARNING && status !== STATUS.WARNING) {
            if (status === STATUS.UP) {
                await this.notifications.sendWarningResolved(checkType, { clientId: this.clientId, resolvedAt: now });
            } else {
                this.notifications.dismissWarning(checkType, { clientId: this.clientId });
            }
        }

        // Incident Logic (Down / Up)
        if (status === STATUS.DOWN && previousStatus !== STATUS.DOWN) {
            await this.handleDownTransition(checkType, errorMessage, previousStatus);
        } else if (status === STATUS.UP && previousStatus === STATUS.DOWN) {
            await this.handleUpTransition(checkType);
        }
    }

    /**
     * Handle transition to DOWN status
     * @private
     */
    async handleDownTransition(checkType, errorMessage, previousStatus) {
        try {
            const existingIncident = await this.database.getOpenIncident(checkType, this.clientId);
            if (existingIncident) return; // Already tracking

            const incidentStart = Date.now();
            const incidentId = await this.database.insertIncident(
                checkType, incidentStart, errorMessage || 'Service is down', this.clientId
            );

            // Debounced Notification
            const downKey = `${this.clientId}:${checkType}:down`;
            const lastNotification = this.lastNotificationTime.get(downKey) || 0;
            if (Date.now() - lastNotification >= this.notificationDebounceMs) {
                await this.notifications.sendDownNotification(checkType, errorMessage, {
                    downSince: incidentStart, clientId: this.clientId
                });
                this.lastNotificationTime.set(downKey, Date.now());
                this.metrics.recordIncident(checkType, this.clientId);
            }
            logger.info(`Incident #${incidentId} created for ${checkType}`);
        } catch (err) {
            logger.error(`Error handling DOWN transition for ${checkType}`, err);
        }
    }

    /**
     * Handle transition to UP status
     * @private
     */
    async handleUpTransition(checkType) {
        try {
            const openIncident = await this.database.getOpenIncident(checkType, this.clientId);
            if (openIncident) {
                await this.database.updateIncidentEndTime(openIncident.id, Date.now());

                // Debounced Notification
                const upKey = `${this.clientId}:${checkType}:up`;
                const lastNotification = this.lastNotificationTime.get(upKey) || 0;
                if (Date.now() - lastNotification >= this.notificationDebounceMs) {
                    await this.notifications.sendUpNotification(checkType, openIncident.start_time, {
                        clientId: this.clientId
                    });
                    this.lastNotificationTime.set(upKey, Date.now());
                }
                logger.info(`Incident #${openIncident.id} resolved for ${checkType}`);
            }
        } catch (err) {
            logger.error(`Error handling UP transition for ${checkType}`, err);
        }
    }

    /**
     * Run all configured health checks
     */
    async runAllChecks() {
        logger.debug('Running health checks');
        try {
            await Promise.all([
                this.checkGetAPI(),
                this.checkPostAPI(), // Note: these come from HealthChecks mixin
                this.checkWeb(),
                this.checkHook()
            ]);
        } catch (error) {
            logger.error('Error running health checks', error);
        }
    }

    /**
     * Execute helper with timeout
     * @param {Function} operation - Async function
     * @param {number} timeoutMs 
     * @param {string} label 
     * @returns {Promise<any>}
     */
    async runWithTimeout(operation, timeoutMs, label) {
        if (!timeoutMs || timeoutMs <= 0) return operation();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
            operation().then(res => { clearTimeout(timer); resolve(res); })
                .catch(err => { clearTimeout(timer); reject(err); });
        });
    }

    /**
     * Execute one cycle of Digital Pipeline checks
     * @param {string} trigger - 'manual' or 'scheduled'
     */
    async runDigitalPipelineCycle(trigger = 'manual') {
        if (this.dpWorkerActive) return;
        this.dpWorkerActive = true;
        try {
            const result = await this.runWithTimeout(
                () => this.checkDigitalPipeline(),
                this.dpWorkerTimeout,
                'Digital Pipeline worker'
            );
            logger.debug('DP cycle finished', { status: result.status });
        } catch (error) {
            logger.error('DP cycle failed', { error: error.message });

            await this.database.insertHealthCheck(
                CHECK_TYPES.DP,
                STATUS.DOWN,
                this.dpWorkerTimeout,
                {
                    clientId: this.clientId,
                    errorMessage: error.message
                }
            );

            await this.updateStatus(CHECK_TYPES.DP, STATUS.DOWN, this.dpWorkerTimeout, error.message, {
                reason: 'DP Worker Timeout'
            });
        } finally {
            this.dpWorkerActive = false;
        }
    }

    /**
     * Start the Digital Pipeline background worker
     */
    startDpWorker() {
        if (this.dpIntervalId) this.stopDpWorker();
        const execute = (trigger) => {
            this.runDigitalPipelineCycle(trigger).catch(err => logger.error('DP uncaught', err));
        };
        execute('bootstrap');
        this.dpIntervalId = setInterval(() => execute('scheduled'), this.dpCheckInterval);
    }

    /**
     * Stop the Digital Pipeline background worker
     */
    stopDpWorker() {
        if (this.dpIntervalId) {
            clearInterval(this.dpIntervalId);
            this.dpIntervalId = null;
        }
    }

    /**
     * Clean up incidents that were left open due to crashes
     */
    async resolveOrphanedIncidents() {
        try {
            const openIncidents = await this.database.getAllOpenIncidents(this.clientId);
            if (!openIncidents?.length) return;

            for (const incident of openIncidents) {
                if (this.currentStatus[incident.check_type]?.status === STATUS.UP) {
                    await this.database.updateIncidentEndTime(incident.id, Date.now());
                    await this.notifications.sendUpNotification(incident.check_type, incident.start_time, { clientId: this.clientId });
                    logger.info(`Closed orphaned incident #${incident.id}`);
                }
            }
        } catch (err) {
            logger.error('Error resolving orphans', err);
        }
    }

    /**
     * Start the monitoring service
     */
    async start() {
        logger.info(`Starting monitoring for ${this.clientId}`);

        try {
            // Token Manager Init
            this.tokenManager.loadTokens();
            if (!this.tokenManager.currentTokens) {
                await this.tokenManager.initializeFromEnv();
            }
            this.tokenManager.startAutoRefresh();
        } catch (e) { logger.error('Token manager init failed', e); }

        await this.runAllChecks();
        this.startDpWorker();

        setTimeout(() => this.resolveOrphanedIncidents(), 2000);

        this.intervalId = setInterval(() => this.runAllChecks(), this.checkInterval);

        // Database cleanup interval
        // Note: Data cleanup is handled centrally by server/index.js
    }

    /**
     * Stop the monitoring service
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.stopDpWorker();
    }

    /**
     * Get current status of all checks
     * @returns {Object}
     */
    getStatus() { return this.currentStatus; }

    /**
     * Get timestamp of the last successful check
     * @returns {number|null}
     */
    getLastCheckTime() {
        const times = Object.values(this.currentStatus).map(s => s.lastCheck).filter(Boolean);
        return times.length ? Math.max(...times) : null;
    }

    /**
     * Check if the monitor is healthy (fresh data)
     * @returns {boolean}
     */
    isHealthy() {
        const last = this.getLastCheckTime();
        if (!last) return false;
        return (Date.now() - last) < (this.checkInterval * 2);
    }
}

// Apply mixins
applyMixin(AmoCRMMonitor, DPHandler);
applyMixin(AmoCRMMonitor, HealthChecks);
applyMixin(AmoCRMMonitor, StatusManager);

module.exports = AmoCRMMonitor;
