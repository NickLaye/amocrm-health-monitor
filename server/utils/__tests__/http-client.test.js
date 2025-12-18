/**
 * Unit tests for HTTP Client with Retry Logic
 */

const nock = require('nock');

// Mock logger before requiring http-client
jest.mock('../logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    })
}));

describe('HttpClient', () => {
    let httpClient;
    const baseUrl = 'https://test.amocrm.ru';

    beforeAll(() => {
        // Disable real network connections
        nock.disableNetConnect();
    });

    afterAll(() => {
        nock.enableNetConnect();
    });

    beforeEach(() => {
        jest.resetModules();
        nock.cleanAll();
        httpClient = require('../http-client');
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('createHttpClient', () => {
        test('should create axios instance with default config', () => {
            const client = httpClient.createHttpClient();
            expect(client).toBeDefined();
            expect(typeof client.get).toBe('function');
            expect(typeof client.post).toBe('function');
        });

        test('should create axios instance with custom timeout', () => {
            const client = httpClient.createHttpClient({ timeout: 5000 });
            expect(client.defaults.timeout).toBe(5000);
        });
    });

    describe('amoCRMClient', () => {
        test('should be pre-configured axios instance', () => {
            expect(httpClient.amoCRMClient).toBeDefined();
            expect(typeof httpClient.amoCRMClient.get).toBe('function');
        });

        test('should have 15 second timeout', () => {
            expect(httpClient.amoCRMClient.defaults.timeout).toBe(15000);
        });
    });

    describe('webhookClient', () => {
        test('should be pre-configured axios instance', () => {
            expect(httpClient.webhookClient).toBeDefined();
            expect(typeof httpClient.webhookClient.get).toBe('function');
        });

        test('should have 30 second timeout', () => {
            expect(httpClient.webhookClient.defaults.timeout).toBe(30000);
        });
    });

    describe('Retry Logic', () => {
        // Note: Integration tests with actual retries are skipped due to 
        // nock/@mswjs/interceptors compatibility issues.
        // The retry logic is verified via retryCondition unit tests below.

        test('should retry on 500 error', async () => {
            nock(baseUrl)
                .get('/api/v4/test')
                .reply(500, { error: 'Internal Server Error' });

            nock(baseUrl)
                .get('/api/v4/test')
                .reply(200, { success: true });

            const client = httpClient.createHttpClient({ retries: 3 });

            const response = await client.get(`${baseUrl}/api/v4/test`);

            expect(response.status).toBe(200);
        });

        test('should retry on 429 rate limit', async () => {
            nock(baseUrl)
                .get('/api/v4/test')
                .reply(429, { error: 'Too Many Requests' });

            nock(baseUrl)
                .get('/api/v4/test')
                .reply(200, { success: true });

            const client = httpClient.createHttpClient({ retries: 3 });

            const response = await client.get(`${baseUrl}/api/v4/test`);

            expect(response.status).toBe(200);
        });

        test('should not retry on 400 client error', async () => {
            nock(baseUrl)
                .get('/api/v4/test')
                .reply(400, { error: 'Bad Request' });

            const client = httpClient.createHttpClient({ retries: 3 });

            await expect(client.get(`${baseUrl}/api/v4/test`)).rejects.toThrow();
        });
    });

    describe('getRetryCount', () => {
        test('should return 0 for fresh config', () => {
            const config = {};
            expect(httpClient.getRetryCount(config)).toBe(0);
        });

        test('should return retry count from config', () => {
            const config = {
                'axios-retry': { retryCount: 2 }
            };
            expect(httpClient.getRetryCount(config)).toBe(2);
        });
    });

    describe('DEFAULT_RETRY_CONFIG', () => {
        test('should have 3 retries', () => {
            expect(httpClient.DEFAULT_RETRY_CONFIG.retries).toBe(3);
        });

        test('should have retryDelay function', () => {
            expect(typeof httpClient.DEFAULT_RETRY_CONFIG.retryDelay).toBe('function');
        });

        test('should have retryCondition function', () => {
            expect(typeof httpClient.DEFAULT_RETRY_CONFIG.retryCondition).toBe('function');
        });

        test('retryCondition should return true for network errors', () => {
            const error = { code: 'ECONNRESET' };
            expect(httpClient.DEFAULT_RETRY_CONFIG.retryCondition(error)).toBe(true);
        });

        test('retryCondition should return true for 429 status', () => {
            const error = { response: { status: 429 } };
            expect(httpClient.DEFAULT_RETRY_CONFIG.retryCondition(error)).toBe(true);
        });

        test('retryCondition should return false for 400 status', () => {
            const error = { response: { status: 400 } };
            expect(httpClient.DEFAULT_RETRY_CONFIG.retryCondition(error)).toBe(false);
        });
    });
});
