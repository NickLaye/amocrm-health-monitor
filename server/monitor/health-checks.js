/**
 * Health Checks Module
 * Contains individual health check implementations for amoCRM endpoints
 */

const axios = require('axios');
const { CHECK_TYPES, STATUS } = require('../config/constants');
const { createLogger } = require('../utils/logger');
const { extractErrorMessage } = require('../utils/http-helpers');

const logger = createLogger('HealthChecks');

/**
 * Mixin class for health check methods
 * To be used with AmoCRMMonitor class
 */
class HealthChecks {
    /**
     * Perform health check on GET API endpoint
     * @returns {Promise<{status: string, responseTime: number, error: string|null}>}
     */
    async checkGetAPI() {
        const startTime = Date.now();
        let httpStatus = null;
        try {
            const accessToken = await this.getAccessToken();
            const response = await this.request({
                method: 'get',
                url: `https://${this.domain}/api/v4/leads?page=1&limit=1`,
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                timeout: this.timeoutThreshold,
                validateStatus: (status) => status < 500
            });

            httpStatus = response.status;
            const responseTime = Date.now() - startTime;
            const baseResult = this.evaluateBaseStatus(CHECK_TYPES.GET, { responseTime, httpStatus });
            const status = await this.finalizeCheckResult(CHECK_TYPES.GET, baseResult, responseTime, { httpStatus });

            return { status, responseTime, error: null, httpStatus };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            httpStatus = error?.response?.status || null;
            const errorMessage = extractErrorMessage(error);
            const baseResult = this.evaluateBaseStatus(CHECK_TYPES.GET, { responseTime, httpStatus, errorMessage });
            const status = await this.finalizeCheckResult(CHECK_TYPES.GET, baseResult, responseTime, {
                httpStatus,
                errorMessage,
                errorCode: error?.code,
                errorPayload: error?.response?.data
            });

            return { status, responseTime, error: errorMessage, httpStatus };
        }
    }

    /**
     * Perform POST API check
     * Updates a specific field in an existing test deal to verify write access
     * @returns {Promise<{status: string, responseTime: number, error: string|null}>}
     */
    async checkPostAPI() {
        const startTime = Date.now();
        let httpStatus = null;
        
        // Check if test entity is configured
        const testEntity = this.testEntity;
        if (!testEntity || !testEntity.dealId || !testEntity.fieldId || 
            testEntity.dealId === 0 || testEntity.fieldId === 0) {
            logger.warn('POST API check skipped: AMOCRM_TEST_DEAL_ID or AMOCRM_TEST_FIELD_ID not configured');
            const responseTime = Date.now() - startTime;
            const baseResult = {
                status: STATUS.UNKNOWN,
                reason: 'not_configured',
                message: 'Test entity not configured (AMOCRM_TEST_DEAL_ID or AMOCRM_TEST_FIELD_ID missing)'
            };
            const status = await this.finalizeCheckResult(CHECK_TYPES.POST, baseResult, responseTime, {
                httpStatus: null,
                errorMessage: 'Test entity not configured'
            });
            return { status, responseTime, error: 'Test entity not configured', httpStatus: null };
        }
        
        try {
            const accessToken = await this.getAccessToken();
            const timestamp = Math.floor(Date.now() / 1000);

            logger.debug(`POST API check: updating deal ${testEntity.dealId}, field ${testEntity.fieldId}`);

            const response = await this.request({
                method: 'patch',
                url: `https://${this.domain}/api/v4/leads/${testEntity.dealId}`,
                data: {
                    custom_fields_values: [
                        {
                            field_id: testEntity.fieldId,
                            values: [
                                {
                                    value: `Health Check: ${timestamp}`
                                }
                            ]
                        }
                    ]
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: this.timeoutThreshold,
                validateStatus: (status) => status < 500
            });

            httpStatus = response.status;
            const responseTime = Date.now() - startTime;
            const baseResult = this.evaluateBaseStatus(CHECK_TYPES.POST, { responseTime, httpStatus });
            const status = await this.finalizeCheckResult(CHECK_TYPES.POST, baseResult, responseTime, { httpStatus });

            logger.debug(`POST API check completed: ${status} (${responseTime}ms)`);

            return { status, responseTime, error: null, httpStatus };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            httpStatus = error?.response?.status || null;
            let errorMessage = extractErrorMessage(error);
            
            // Special handling for HTTP 400 - likely invalid dealId or fieldId
            if (httpStatus === 400) {
                const errorData = error?.response?.data;
                if (errorData && (typeof errorData === 'object')) {
                    const detail = errorData.detail || errorData.title || errorData.message || '';
                    if (detail.includes('не найден') || detail.includes('not found') || 
                        detail.includes('не существует') || detail.includes('does not exist')) {
                        errorMessage = `HTTP 400: Test entity not found (dealId: ${testEntity.dealId}, fieldId: ${testEntity.fieldId}). Please configure valid AMOCRM_TEST_DEAL_ID and AMOCRM_TEST_FIELD_ID`;
                    } else {
                        errorMessage = `HTTP 400: ${detail || 'Bad Request'}`;
                    }
                } else {
                    errorMessage = `HTTP 400: Bad Request (dealId: ${testEntity.dealId}, fieldId: ${testEntity.fieldId})`;
                }
            }
            
            const baseResult = this.evaluateBaseStatus(CHECK_TYPES.POST, { responseTime, httpStatus, errorMessage });
            const status = await this.finalizeCheckResult(CHECK_TYPES.POST, baseResult, responseTime, {
                httpStatus,
                errorMessage,
                errorCode: error?.code,
                errorPayload: error?.response?.data
            });

            logger.error(`POST API check failed: ${errorMessage}`, { responseTime, httpStatus, dealId: testEntity.dealId, fieldId: testEntity.fieldId });

            return { status, responseTime, error: errorMessage, httpStatus };
        }
    }

    /**
     * Perform health check on web interface
     * @returns {Promise<{status: string, responseTime: number, error: string|null}>}
     */
    async checkWeb() {
        const startTime = Date.now();
        let httpStatus = null;
        try {
            const response = await this.request({
                method: 'get',
                url: `https://${this.domain}`,
                timeout: this.timeoutThreshold,
                maxRedirects: 5,
                validateStatus: (status) => status < 500
            });

            httpStatus = response.status;
            const responseTime = Date.now() - startTime;
            const baseResult = this.evaluateBaseStatus(CHECK_TYPES.WEB, { responseTime, httpStatus });
            const status = await this.finalizeCheckResult(CHECK_TYPES.WEB, baseResult, responseTime, { httpStatus });

            return { status, responseTime, error: null, httpStatus };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            httpStatus = error?.response?.status || null;
            const errorMessage = extractErrorMessage(error);
            const baseResult = this.evaluateBaseStatus(CHECK_TYPES.WEB, { responseTime, httpStatus, errorMessage });
            const status = await this.finalizeCheckResult(CHECK_TYPES.WEB, baseResult, responseTime, {
                httpStatus,
                errorMessage,
                errorCode: error?.code,
                errorPayload: error?.response?.data
            });

            return { status, responseTime, error: errorMessage, httpStatus };
        }
    }

    /**
     * Perform HOOK check
     * @returns {Promise<{status: string, responseTime: number, error: string|null}>}
     */
    async checkHook() {
        const startTime = Date.now();
        let httpStatus = null;
        try {
            const accessToken = await this.getAccessToken();
            const response = await this.request({
                method: 'get',
                url: `https://${this.domain}/api/v4/webhooks`,
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                timeout: this.timeoutThreshold,
                validateStatus: (status) => status < 500
            });

            httpStatus = response.status;
            const responseTime = Date.now() - startTime;
            const baseResult = this.evaluateBaseStatus(CHECK_TYPES.HOOK, { responseTime, httpStatus });
            const status = await this.finalizeCheckResult(CHECK_TYPES.HOOK, baseResult, responseTime, { httpStatus });

            return { status, responseTime, error: null, httpStatus };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            httpStatus = error?.response?.status || null;
            const errorMessage = extractErrorMessage(error);
            const baseResult = this.evaluateBaseStatus(CHECK_TYPES.HOOK, { responseTime, httpStatus, errorMessage });
            const status = await this.finalizeCheckResult(CHECK_TYPES.HOOK, baseResult, responseTime, {
                httpStatus,
                errorMessage,
                errorCode: error?.code,
                errorPayload: error?.response?.data
            });

            return { status, responseTime, error: errorMessage, httpStatus };
        }
    }

    /**
     * Perform Digital Pipeline check
     * @returns {Promise<{status: string, responseTime: number, error: string|null, details: Object}>}
     */
    async checkDigitalPipeline() {
        const startTime = Date.now();
        let httpStatus = null;
        const details = {};

        try {
            const accessToken = await this.getAccessToken();
            const contact = await this.ensureDpContact(accessToken);
            details.contactId = contact.id;

            const marker = `dp-check-${Date.now()}`;
            details.marker = marker;

            await this.updateDpContact(accessToken, contact.id, marker);

            const webhookPromise = this.waitForDpWebhook(contact.id);
            const webhookPayload = await webhookPromise;
            details.webhookReceived = true;
            details.payload = webhookPayload;

            const responseTime = Date.now() - startTime;
            const baseResult = this.evaluateBaseStatus(CHECK_TYPES.DP, { responseTime, httpStatus: 200 });
            const status = await this.finalizeCheckResult(CHECK_TYPES.DP, baseResult, responseTime, { httpStatus: 200 });

            return { status, responseTime, error: null, httpStatus: 200, details };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            httpStatus = error?.response?.status || null;
            const errorMessage = extractErrorMessage(error);
            details.error = errorMessage;
            details.payload = error?.response?.data || null;

            const baseResult = this.evaluateBaseStatus(CHECK_TYPES.DP, { responseTime, httpStatus, errorMessage });
            const status = await this.finalizeCheckResult(CHECK_TYPES.DP, baseResult, responseTime, {
                httpStatus,
                errorMessage,
                errorCode: error?.code,
                errorPayload: error?.response?.data
            });

            return { status, responseTime, error: errorMessage, httpStatus, details };
        }
    }
}

module.exports = HealthChecks;
