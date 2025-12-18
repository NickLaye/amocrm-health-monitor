/**
 * HTTP Client with Retry Logic
 * Provides pre-configured axios instance with automatic retry for transient failures
 */

const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const { createLogger } = require('./logger');

const logger = createLogger('HttpClient');

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG = {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
        // Retry on network errors
        if (axiosRetry.isNetworkError(error)) {
            return true;
        }
        // Retry on idempotent request errors (5xx)
        if (axiosRetry.isRetryableError(error)) {
            return true;
        }
        // Retry on rate limiting (429)
        if (error.response?.status === 429) {
            return true;
        }
        // Retry on specific network error codes
        const retryCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ENETUNREACH'];
        if (error.code && retryCodes.includes(error.code)) {
            return true;
        }
        return false;
    },
    onRetry: (retryCount, error, requestConfig) => {
        logger.warn(`Retry attempt ${retryCount} for ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`, {
            error: error.message,
            code: error.code,
            status: error.response?.status
        });
    }
};

/**
 * Create a new axios instance with retry logic
 * @param {Object} options - Configuration options
 * @param {number} [options.retries=3] - Number of retry attempts
 * @param {number} [options.timeout=10000] - Request timeout in ms
 * @param {Function} [options.retryCondition] - Custom retry condition
 * @param {Function} [options.retryDelay] - Custom retry delay function
 * @returns {AxiosInstance} Configured axios instance
 */
function createHttpClient(options = {}) {
    const instance = axios.create({
        timeout: options.timeout || 10000,
        ...options.axiosOptions
    });

    const retryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        retries: options.retries ?? DEFAULT_RETRY_CONFIG.retries,
        ...(options.retryCondition && { retryCondition: options.retryCondition }),
        ...(options.retryDelay && { retryDelay: options.retryDelay })
    };

    axiosRetry(instance, retryConfig);

    // Add request interceptor for logging
    instance.interceptors.request.use(
        (config) => {
            logger.debug(`HTTP Request: ${config.method?.toUpperCase()} ${config.url}`);
            return config;
        },
        (error) => {
            logger.error('HTTP Request Error', { error: error.message });
            return Promise.reject(error);
        }
    );

    // Add response interceptor for logging
    instance.interceptors.response.use(
        (response) => {
            logger.debug(`HTTP Response: ${response.status} ${response.config.url}`);
            return response;
        },
        (error) => {
            if (error.response) {
                logger.debug(`HTTP Error Response: ${error.response.status} ${error.config?.url}`);
            }
            return Promise.reject(error);
        }
    );

    return instance;
}

/**
 * Pre-configured client for amoCRM API requests
 * - 3 retries with exponential backoff
 * - 15 second timeout
 * - Retries on network errors, 5xx, and 429
 */
const amoCRMClient = createHttpClient({
    timeout: 15000,
    retries: 3
});

/**
 * Pre-configured client for webhook/external requests
 * - 2 retries with exponential backoff  
 * - 30 second timeout (for slower endpoints)
 */
const webhookClient = createHttpClient({
    timeout: 30000,
    retries: 2
});

/**
 * Get retry count from axios config (for testing/debugging)
 * @param {Object} config - Axios request config with retry metadata
 * @returns {number} Number of retries executed
 */
function getRetryCount(config) {
    return config['axios-retry']?.retryCount ?? 0;
}

module.exports = {
    createHttpClient,
    amoCRMClient,
    webhookClient,
    getRetryCount,
    DEFAULT_RETRY_CONFIG
};
