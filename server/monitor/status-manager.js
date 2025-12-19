/**
 * Status Manager Module
 * Handles status evaluation, escalation logic, and incident management
 */

const { STATUS, LATENCY_THRESHOLDS } = require('../config/constants');
const { createLogger } = require('../utils/logger');

const logger = createLogger('StatusManager');

/**
 * Mixin class for status management functionality
 * To be used with AmoCRMMonitor class
 */
class StatusManager {
    /**
     * Get latency thresholds for a check type
     * @param {string} checkType
     * @returns {{warningMs: number, downMs: number}}
     */
    getLatencyThresholds(checkType) {
        return LATENCY_THRESHOLDS[checkType] || { warningMs: 750, downMs: 1500 };
    }

    /**
     * Evaluate base status based on response time and HTTP status
     * @param {string} checkType
     * @param {Object} params
     * @returns {{status: string, reason: string, message: string|null}}
     */
    evaluateBaseStatus(checkType, { responseTime, httpStatus = null, errorMessage = null }) {
        const thresholds = this.getLatencyThresholds(checkType);

        // Special handling for authentication errors (401)
        // These should be WARNING, not DOWN, as they can be recovered by token refresh
        if (httpStatus === 401) {
            // Specialized handling for WEB check: 401 is expected on the login page
            if (checkType === 'WEB') {
                return {
                    status: STATUS.UP,
                    reason: 'ok',
                    message: `HTTP ${httpStatus} (Login Page)`
                };
            }
            // For API checks, 401 means authentication issue - should be WARNING
            return {
                status: STATUS.WARNING,
                reason: 'auth_error',
                message: `HTTP 401: Unauthorized`
            };
        }

        if (errorMessage) {
            // Check if error message indicates authentication issue
            if (errorMessage.toLowerCase().includes('unauthorized') || 
                errorMessage.toLowerCase().includes('401') ||
                errorMessage.toLowerCase().includes('token')) {
                return {
                    status: STATUS.WARNING,
                    reason: 'auth_error',
                    message: errorMessage
                };
            }
            return {
                status: STATUS.DOWN,
                reason: 'runtime_error',
                message: errorMessage
            };
        }

        if (typeof httpStatus === 'number') {
            if (httpStatus >= 500) {
                return {
                    status: STATUS.DOWN,
                    reason: 'http_5xx',
                    message: `HTTP ${httpStatus}`
                };
            }
            if (httpStatus >= 400) {
                return {
                    status: STATUS.WARNING,
                    reason: 'http_4xx',
                    message: `HTTP ${httpStatus}`
                };
            }
        }

        if (Number.isFinite(responseTime)) {
            if (responseTime >= thresholds.downMs) {
                return {
                    status: STATUS.DOWN,
                    reason: 'latency_down',
                    message: `Latency ${responseTime}ms ≥ ${thresholds.downMs}ms`
                };
            }
            if (responseTime >= thresholds.warningMs) {
                return {
                    status: STATUS.WARNING,
                    reason: 'latency_warning',
                    message: `Latency ${responseTime}ms ≥ ${thresholds.warningMs}ms`
                };
            }
        }

        return {
            status: STATUS.UP,
            reason: 'ok',
            message: null
        };
    }

    /**
     * Apply escalation logic for status transitions
     * @param {string} checkType
     * @param {string} candidateStatus
     * @returns {string} Final status after escalation
     */
    applyEscalation(checkType, candidateStatus) {
        const state = this.statusWindows[checkType];
        const previousStatus = this.currentStatus[checkType]?.status || STATUS.UNKNOWN;
        const now = Date.now();

        if (!state) {
            return candidateStatus;
        }

        if (candidateStatus === STATUS.DOWN) {
            state.warningEvents = [];
            state.upRecoveryCount = 0;
            state.lastDownAt = now;
            return STATUS.DOWN;
        }

        if (candidateStatus === STATUS.WARNING) {
            state.warningEvents = state.warningEvents.filter(timestamp => now - timestamp <= this.warningEscalationWindowMs);
            state.warningEvents.push(now);
            state.upRecoveryCount = 0;

            if (state.warningEvents.length >= this.warningEscalationThreshold) {
                state.warningEvents = [];
                state.lastDownAt = now;
                return STATUS.DOWN;
            }

            return STATUS.WARNING;
        }

        if (candidateStatus === STATUS.UP) {
            state.warningEvents = [];
            if (previousStatus === STATUS.DOWN) {
                state.upRecoveryCount = (state.upRecoveryCount || 0) + 1;
                if (state.upRecoveryCount < this.recoverySuccessThreshold) {
                    return STATUS.WARNING;
                }
                state.upRecoveryCount = 0;
            } else {
                state.upRecoveryCount = 0;
            }
            return STATUS.UP;
        }

        return candidateStatus;
    }

    /**
     * Finalize check result and record in database
     * @param {string} checkType
     * @param {Object} baseResult
     * @param {number} responseTime
     * @param {Object} options
     * @returns {Promise<string>} Final status
     */
    async finalizeCheckResult(checkType, baseResult, responseTime, {
        httpStatus = null,
        errorMessage = null,
        errorCode = null,
        errorPayload = null,
        meta = null
    } = {}) {
        const finalStatus = this.applyEscalation(checkType, baseResult.status);
        let storedErrorMessage = finalStatus === STATUS.UP ? null : (errorMessage || baseResult.message);
        if (!storedErrorMessage && finalStatus === STATUS.WARNING) {
            storedErrorMessage = 'Сервис в состоянии предупреждения';
        }

        await this.database.insertHealthCheck(checkType, finalStatus, responseTime, {
            clientId: this.clientId,
            httpStatus,
            errorMessage: storedErrorMessage,
            errorCode,
            errorPayload
        });

        await this.updateStatus(checkType, finalStatus, responseTime, storedErrorMessage, {
            httpStatus,
            reason: baseResult.reason,
            errorCode,
            meta
        });

        try {
            this.metrics.recordHealthCheck(checkType, finalStatus, responseTime, this.clientId);
        } catch (metricError) {
            logger.debug('Failed to record metrics', { error: metricError.message });
        }

        this.notifications.trackLatency(checkType, responseTime, finalStatus, this.clientId);
        return finalStatus;
    }
}

module.exports = StatusManager;
