/**
 * Digital Pipeline Handler Module
 * Manages Digital Pipeline checks and webhook interactions for amoCRM
 */

const axios = require('axios');
const { createLogger } = require('../utils/logger');
const { extractErrorMessage } = require('../utils/http-helpers');

const logger = createLogger('DPHandler');

/**
 * Mixin class for Digital Pipeline functionality
 * To be used with AmoCRMMonitor class
 */
class DPHandler {
    /**
     * Initialize DP Handler properties
     * @param {Object} config - DP configuration
     */
    initializeDPHandler(config) {
        this.dpContactName = config.contactName || 'AmoPulse System Check';
        this.dpWebhookTimeoutMs = config.webhookTimeoutMs;
        this.dpContactId = null;
        this.dpResponsibleUserId = config.responsibleUserId;
        this.dpCustomFieldId = config.customFieldId;
        this.dpWebhookWaiters = new Map();
        this.dpCheckInterval = config.checkIntervalMs;
        this.dpRequestTimeout = config.requestTimeoutMs;
        this.dpWorkerActive = false;
        this.dpWorkerTimeout = config.workerTimeoutMs;
    }

    /**
     * Ensure Digital Pipeline contact exists (cached)
     * @param {string} accessToken
     * @returns {Promise<{id:number}>}
     */
    async ensureDpContact(accessToken) {
        if (this.dpContactId) {
            return { id: this.dpContactId };
        }

        const existing = await this.findDpContact(accessToken, this.dpContactName);
        if (existing && existing.id) {
            this.dpContactId = existing.id;
            return existing;
        }

        const created = await this.createDpContact(accessToken);
        this.dpContactId = created.id;
        return created;
    }

    /**
     * Find contact by name
     * @param {string} accessToken
     * @param {string} name
     * @returns {Promise<Object|null>}
     */
    async findDpContact(accessToken, name) {
        try {
            const response = await this.request({
                method: 'get',
                url: `https://${this.domain}/api/v4/contacts`,
                params: {
                    query: name,
                    limit: 1
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                timeout: this.dpRequestTimeout,
                validateStatus: status => status < 500
            });

            const contacts = response?.data?._embedded?.contacts || [];
            return contacts.length > 0 ? contacts[0] : null;
        } catch (error) {
            logger.error('Failed to search DP contact', { error: extractErrorMessage(error) });
            throw error;
        }
    }

    /**
     * Create system contact for DP checks
     * @param {string} accessToken
     * @returns {Promise<Object>}
     */
    async createDpContact(accessToken) {
        try {
            const contactPayload = {
                name: this.dpContactName
            };

            if (this.dpResponsibleUserId) {
                contactPayload.responsible_user_id = this.dpResponsibleUserId;
            }

            if (this.dpCustomFieldId) {
                contactPayload.custom_fields_values = [
                    {
                        field_id: this.dpCustomFieldId,
                        values: [{ value: 'DP bootstrap' }]
                    }
                ];
            }

            const response = await this.request({
                method: 'post',
                url: `https://${this.domain}/api/v4/contacts`,
                data: [contactPayload],
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: this.dpRequestTimeout,
                validateStatus: status => status < 500
            });

            const created = response?.data?._embedded?.contacts?.[0];
            if (!created || !created.id) {
                throw new Error('DP contact creation returned no contact');
            }

            logger.info(`Created DP system contact "${this.dpContactName}" (id=${created.id})`);
            return created;
        } catch (error) {
            logger.error('Failed to create DP contact', { error: extractErrorMessage(error) });
            throw error;
        }
    }

    /**
     * Update DP contact custom field
     * @param {string} accessToken
     * @param {number} contactId
     * @param {string} marker
     * @returns {Promise<void>}
     */
    async updateDpContact(accessToken, contactId, marker) {
        if (!this.dpCustomFieldId) {
            const message = 'AMOCRM_DP_CONTACT_FIELD_ID is not configured';
            logger.error(message);
            throw new Error(message);
        }

        const payload = {
            custom_fields_values: [
                {
                    field_id: this.dpCustomFieldId,
                    values: [{ value: marker }]
                }
            ]
        };

        await this.request({
            method: 'patch',
            url: `https://${this.domain}/api/v4/contacts/${contactId}`,
            data: payload,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            timeout: this.dpRequestTimeout,
            validateStatus: status => status < 500
        });
    }

    /**
     * Register waiter for DP webhook
     * @param {number} contactId
     * @returns {Promise<void>}
     */
    waitForDpWebhook(contactId) {
        const key = String(contactId);

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.rejectDpWebhookWaiters(contactId, new Error('Digital Pipeline webhook timeout'));
            }, this.dpWebhookTimeoutMs);

            const waiter = {
                resolve: (payload) => {
                    clearTimeout(timeoutId);
                    resolve(payload);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            };

            if (!this.dpWebhookWaiters.has(key)) {
                this.dpWebhookWaiters.set(key, []);
            }

            this.dpWebhookWaiters.get(key).push(waiter);
        });
    }

    /**
     * Resolve pending webhook waiters
     * @param {number} contactId
     * @param {Object} payload
     * @returns {boolean}
     */
    resolveDpWebhookWaiters(contactId, payload) {
        const key = String(contactId);
        const waiters = this.dpWebhookWaiters.get(key);

        if (!waiters || waiters.length === 0) {
            return false;
        }

        this.dpWebhookWaiters.delete(key);
        waiters.forEach(waiter => {
            try {
                waiter.resolve(payload);
            } catch (error) {
                logger.error('Failed to resolve DP webhook waiter', { error: error.message });
            }
        });
        return true;
    }

    /**
     * Reject pending waiters (cleanup)
     * @param {number} contactId
     * @param {Error} error
     */
    rejectDpWebhookWaiters(contactId, error) {
        const key = String(contactId);
        const waiters = this.dpWebhookWaiters.get(key);

        if (!waiters || waiters.length === 0) {
            return;
        }

        this.dpWebhookWaiters.delete(key);
        waiters.forEach(waiter => {
            try {
                waiter.reject(error);
            } catch (err) {
                logger.error('Failed to reject DP webhook waiter', { error: err.message });
            }
        });
    }

    /**
     * Extract contact IDs from webhook payload
     * @param {Object} payload
     * @returns {number[]}
     */
    extractContactIdsFromPayload(payload) {
        if (!payload || typeof payload !== 'object') {
            return [];
        }

        const ids = new Set();
        const tryAdd = (value) => {
            const parsed = Number(value);
            if (!Number.isNaN(parsed)) {
                ids.add(parsed);
            }
        };

        const traverse = (node, parentKey = '') => {
            if (!node) return;

            if (Array.isArray(node)) {
                node.forEach(item => traverse(item, parentKey));
                return;
            }

            if (typeof node === 'object') {
                Object.entries(node).forEach(([key, value]) => {
                    const lowerKey = key.toLowerCase();

                    if (lowerKey === 'contact_id' || lowerKey === 'contactid') {
                        tryAdd(value);
                    } else if (lowerKey === 'id' && parentKey.toLowerCase().includes('contact')) {
                        tryAdd(value);
                    }

                    const nextParent = lowerKey.includes('contact') ? key : parentKey;
                    traverse(value, nextParent);
                });
            }
        };

        traverse(payload, '');
        return Array.from(ids);
    }

    /**
     * Handle incoming webhook payload
     * @param {Object} payload
     * @returns {boolean} true if matched DP contact
     */
    handleWebhookEvent(payload) {
        const targetContactId = this.dpContactId;
        if (!targetContactId) {
            logger.warn('Received webhook before DP contact was initialized');
            return false;
        }

        const contactIds = this.extractContactIdsFromPayload(payload);
        if (!contactIds.includes(targetContactId)) {
            logger.debug('Webhook received for unrelated contact');
            return false;
        }

        const resolved = this.resolveDpWebhookWaiters(targetContactId, payload);
        if (!resolved) {
            logger.debug('Webhook received but no pending DP checks');
        } else {
            logger.debug('DP webhook acknowledged', { contactId: targetContactId });
        }
        return resolved;
    }
}

module.exports = DPHandler;
