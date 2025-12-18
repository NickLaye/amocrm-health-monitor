/**
 * Edge Case Tests
 * Tests for handling exceptional situations, errors, and boundary conditions
 */

const { STATUS, CHECK_TYPES, DEFAULT_CLIENT_ID } = require('../config/constants');

// Mock dependencies
jest.mock('../database');
jest.mock('../notifications');
jest.mock('../token-manager');
jest.mock('../metrics');
jest.mock('axios');
jest.mock('../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    })
}));

describe('Edge Case Tests', () => {
    let database;
    let monitor;
    let tokenManager;
    let TokenManagerClass;
    let axios;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();

        database = require('../database');
        TokenManagerClass = require('../token-manager');
        tokenManager = {
            loadTokens: jest.fn(),
            initializeFromEnv: jest.fn(),
            startAutoRefresh: jest.fn(),
            getAccessToken: jest.fn().mockResolvedValue('test_token'),
            refreshToken: jest.fn()
        };
        TokenManagerClass.mockImplementation(() => tokenManager);
        axios = require('axios');

        // Setup default mocks
        database.insertHealthCheck = jest.fn().mockResolvedValue({ id: 1 });
        database.insertIncident = jest.fn().mockResolvedValue(1);
        database.getOpenIncident = jest.fn().mockResolvedValue(null);
        axios.get = jest.fn().mockResolvedValue({
            status: 200,
            data: {
                _embedded: {
                    contacts: [{ id: 123 }]
                }
            }
        });
        axios.post = jest.fn().mockResolvedValue({
            data: {
                _embedded: {
                    contacts: [{ id: 123 }]
                }
            }
        });
        axios.patch = jest.fn().mockResolvedValue({ status: 200, data: {} });

        process.env.AMOCRM_DOMAIN = 'test.amocrm.ru';
        process.env.CHECK_INTERVAL = '30000';
        process.env.TIMEOUT_THRESHOLD = '10000';
        process.env.AMOCRM_DP_CONTACT_FIELD_ID = '55555';
        process.env.DP_WEBHOOK_TIMEOUT_MS = '5';
        // TEST_ENTITY for POST API checks
        process.env.AMOCRM_TEST_DEAL_ID = '12345678';
        process.env.AMOCRM_TEST_FIELD_ID = '1234567';

        monitor = require('../monitor');
    });

    describe('Database Edge Cases', () => {
        test('should handle concurrent write conflicts', async () => {
            const conflictError = new Error('UNIQUE constraint failed');
            database.insertIncident.mockRejectedValueOnce(conflictError);

            await monitor.updateStatus(CHECK_TYPES.GET, STATUS.DOWN, 5000, 'Error');

            // Should log error but not crash
            expect(database.insertIncident).toHaveBeenCalled();
        });

        test('should handle getOpenIncident returning null', async () => {
            database.getOpenIncident.mockResolvedValue(null);

            // Set status to down first
            monitor.currentStatus[CHECK_TYPES.GET].status = STATUS.DOWN;

            // Then try to go up - should handle missing incident gracefully
            await monitor.updateStatus(CHECK_TYPES.GET, STATUS.UP, 250, null);

            expect(database.getOpenIncident).toHaveBeenCalled();
        });
    });

    describe('Network Edge Cases', () => {
        test('should handle connection timeout (ETIMEDOUT)', async () => {
            const timeoutError = new Error('connect ETIMEDOUT');
            timeoutError.code = 'ETIMEDOUT';

            axios.get = jest.fn().mockRejectedValue(timeoutError);

            const result = await monitor.checkGetAPI();

            expect(result.status).toBe('down');
            expect(result.error).toContain('ETIMEDOUT');
            expect(database.insertHealthCheck).toHaveBeenCalledWith(
                CHECK_TYPES.GET,
                STATUS.DOWN,
                expect.any(Number),
                expect.objectContaining({
                    clientId: DEFAULT_CLIENT_ID,
                    errorMessage: expect.stringContaining('ETIMEDOUT')
                })
            );
        });

        test('should handle DNS resolution failure (ENOTFOUND)', async () => {
            const dnsError = new Error('getaddrinfo ENOTFOUND');
            dnsError.code = 'ENOTFOUND';

            axios.patch = jest.fn().mockRejectedValue(dnsError);

            const result = await monitor.checkPostAPI();

            expect(result.status).toBe('down');
            expect(result.error).toContain('ENOTFOUND');
        });

        test('should handle connection refused (ECONNREFUSED)', async () => {
            const connError = new Error('connect ECONNREFUSED');
            connError.code = 'ECONNREFUSED';

            axios.get = jest.fn().mockRejectedValue(connError);

            const result = await monitor.checkWeb();

            expect(result.status).toBe('down');
            expect(result.error).toContain('ECONNREFUSED');
        });

        test('should handle SSL/TLS errors', async () => {
            const sslError = new Error('unable to verify the first certificate');
            sslError.code = 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';

            axios.get = jest.fn().mockRejectedValue(sslError);

            const result = await monitor.checkHook();

            expect(result.status).toBe('down');
            expect(result.error).toBeTruthy();
        });

        test('should handle HTTP 429 (Rate Limiting)', async () => {
            axios.patch = jest.fn().mockResolvedValue({
                status: 429,
                data: { error: 'Too Many Requests' }
            });

            const result = await monitor.checkPostAPI();

            // 429 is < 500, so should be treated as 'warning'
            expect(result.status).toBe('warning');
        });

        test('should handle HTTP 503 (Service Unavailable)', async () => {
            axios.get = jest.fn().mockResolvedValue({
                status: 503,
                data: { error: 'Service Unavailable' }
            });

            const result = await monitor.checkGetAPI();

            // 503 is >= 500, so should be treated as 'down'
            expect(result.status).toBe('down');
        });

        test('should handle network socket hang up', async () => {
            const hangupError = new Error('socket hang up');
            hangupError.code = 'ECONNRESET';

            axios.get = jest.fn().mockRejectedValue(hangupError);

            const result = await monitor.checkDigitalPipeline();

            expect(result.status).toBe('down');
            expect(result.error).toContain('socket hang up');
        });

        test('should expose original DP error payload', async () => {
            const dpError = new Error('Bad Request');
            dpError.response = {
                status: 422,
                data: { detail: 'Stage not found' }
            };

            axios.patch = jest.fn().mockRejectedValue(dpError);
            monitor.waitForDpWebhook = jest.fn().mockResolvedValue({});

            const result = await monitor.checkDigitalPipeline();

            expect(result.status).toBe('down');
            expect(result.details.payload).toEqual({ detail: 'Stage not found' });
        });
    });

    describe('Monitor Edge Cases', () => {
        test('should handle rapid status changes (flapping)', async () => {
            // Simulate rapid down -> up -> down -> up changes
            await monitor.updateStatus(CHECK_TYPES.GET, STATUS.DOWN, 5000, 'Error 1');
            await monitor.updateStatus(CHECK_TYPES.GET, STATUS.UP, 250, null);
            await monitor.updateStatus(CHECK_TYPES.GET, STATUS.DOWN, 5000, 'Error 2');
            await monitor.updateStatus(CHECK_TYPES.GET, STATUS.UP, 250, null);

            // Should create 2 incidents
            expect(database.insertIncident).toHaveBeenCalledTimes(2);
        });

        test('should handle token expiration during check', async () => {
            const expiredError = new Error('Unauthorized');
            expiredError.response = { status: 401 };

            axios.get = jest.fn().mockRejectedValue(expiredError);

            const result = await monitor.checkGetAPI();

            expect(result.status).toBe('down');
            expect(result.error).toContain('Unauthorized');
        });

        test('should handle invalid token refresh', async () => {
            tokenManager.getAccessToken.mockRejectedValue(new Error('Token refresh failed'));
            const authError = new Error('Unauthorized');
            authError.response = { status: 401 };
            axios.get = jest.fn().mockRejectedValue(authError);

            const result = await monitor.checkGetAPI();

            // Should fallback to env token but still fail the request
            expect(result.status).toBe('down');
            expect(result.error).toContain('Token refresh failed');
        });

        test('should handle concurrent health checks', async () => {
            axios.get = jest.fn().mockResolvedValue({ status: 200, data: {} });
            axios.patch = jest.fn().mockResolvedValue({ status: 200, data: {} });
            monitor.waitForDpWebhook = jest.fn().mockResolvedValue({});

            // Run multiple checks concurrently
            const results = await Promise.all([
                monitor.checkGetAPI(),
                monitor.checkPostAPI(),
                monitor.checkWeb(),
                monitor.checkHook()
            ]);

            results.forEach(result => {
                expect(result.status).toBe('up');
            });

            const dpResult = await monitor.checkDigitalPipeline();
            expect(dpResult.status).toBe('up');
        });

        test('should mark DP worker timeout as down', async () => {
            jest.useFakeTimers();

            monitor.dpWorkerTimeout = 5;
            monitor.checkDigitalPipeline = jest.fn(() => new Promise(() => { }));

            const cyclePromise = monitor.runDigitalPipelineCycle('timeout-test');
            jest.advanceTimersByTime(10);
            await cyclePromise;

            jest.useRealTimers();

            expect(database.insertHealthCheck).toHaveBeenCalledWith(
                CHECK_TYPES.DP,
                STATUS.DOWN,
                monitor.dpWorkerTimeout,
                expect.objectContaining({
                    clientId: DEFAULT_CLIENT_ID,
                    errorMessage: expect.stringContaining('timed out')
                })
            );
        });
    });

    describe('Status Update Edge Cases', () => {
        test('should not create duplicate incidents for same down status', async () => {
            // Set to down
            await monitor.updateStatus(CHECK_TYPES.GET, STATUS.DOWN, 5000, 'Error');

            // Try to set to down again
            await monitor.updateStatus(CHECK_TYPES.GET, STATUS.DOWN, 5000, 'Error');

            // Should only create one incident
            expect(database.insertIncident).toHaveBeenCalledTimes(1);
        });

        test('should handle missing error message gracefully', async () => {
            await monitor.updateStatus(CHECK_TYPES.GET, STATUS.DOWN, 5000, null);

            expect(database.insertIncident).toHaveBeenCalledWith(
                CHECK_TYPES.GET,
                expect.any(Number),
                'Service is down',
                DEFAULT_CLIENT_ID
            );
        });

        test('should handle very long error messages', async () => {
            const longError = 'Error: '.repeat(1000);

            await monitor.updateStatus(CHECK_TYPES.GET, STATUS.DOWN, 5000, longError);

            expect(database.insertIncident).toHaveBeenCalledWith(
                CHECK_TYPES.GET,
                expect.any(Number),
                longError,
                DEFAULT_CLIENT_ID
            );
        });

        test('should handle status transition from unknown to down', async () => {
            // Initial status is unknown
            expect(monitor.currentStatus[CHECK_TYPES.GET].status).toBe(STATUS.UNKNOWN);

            // Transition to down
            await monitor.updateStatus(CHECK_TYPES.GET, STATUS.DOWN, 5000, 'Error');

            // Should create incident
            expect(database.insertIncident).toHaveBeenCalled();
        });
    });

    describe('Listener Edge Cases', () => {
        test('should handle listener callback errors gracefully', async () => {
            const errorListener = jest.fn().mockImplementation(() => {
                throw new Error('Listener error');
            });

            monitor.addListener(errorListener);

            // Should not throw even if listener throws
            await expect(
                monitor.updateStatus(CHECK_TYPES.GET, STATUS.UP, 250, null)
            ).resolves.not.toThrow();

            expect(errorListener).toHaveBeenCalled();
        });

        test('should notify all listeners even if one fails', async () => {
            const listener1 = jest.fn().mockImplementation(() => {
                throw new Error('Listener 1 error');
            });
            const listener2 = jest.fn();

            monitor.addListener(listener1);
            monitor.addListener(listener2);

            await monitor.updateStatus(CHECK_TYPES.GET, STATUS.UP, 250, null);

            expect(listener1).toHaveBeenCalled();
            expect(listener2).toHaveBeenCalled();
        });
    });

    describe('Orphaned Incidents Edge Cases', () => {
        test('should handle errors when resolving orphaned incidents', async () => {
            database.getAllOpenIncidents.mockRejectedValue(new Error('DB error'));

            // Should not throw
            await expect(monitor.resolveOrphanedIncidents()).resolves.not.toThrow();
        });

        test('should handle errors when updating incident end time', async () => {
            database.getAllOpenIncidents.mockResolvedValue([
                { id: 1, check_type: CHECK_TYPES.GET, start_time: Date.now() - 10000 }
            ]);
            database.updateIncidentEndTime.mockRejectedValue(new Error('Update failed'));

            monitor.currentStatus[CHECK_TYPES.GET].status = STATUS.UP;

            // Should not throw
            await expect(monitor.resolveOrphanedIncidents()).resolves.not.toThrow();
        });
    });
});
