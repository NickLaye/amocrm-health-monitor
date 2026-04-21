/**
 * Unit tests for Extended Health Check Routes
 */

const request = require('supertest');
const express = require('express');
const { spawnSync } = require('child_process');

function canListenOnSocket() {
    const probe = "const http=require('http');const s=http.createServer();s.listen(0,'127.0.0.1',()=>s.close(()=>process.exit(0)));s.on('error',()=>process.exit(1));";
    const result = spawnSync(process.execPath, ['-e', probe], { stdio: 'ignore' });
    return result.status === 0;
}
const CAN_LISTEN_ON_SOCKET = canListenOnSocket();
const REQUIRE_SOCKET_TESTS = process.env.CI === 'true' || process.env.REQUIRE_SOCKET_TESTS === 'true';
if (REQUIRE_SOCKET_TESTS && !CAN_LISTEN_ON_SOCKET) {
    throw new Error('Socket-based integration tests require bind permissions');
}
if (!REQUIRE_SOCKET_TESTS && !CAN_LISTEN_ON_SOCKET) {
    console.warn('[integration] Skipping socket-based integration tests. Set REQUIRE_SOCKET_TESTS=true to enforce.');
}
const describeWithSockets = CAN_LISTEN_ON_SOCKET ? describe : describe.skip;

// Mock logger
jest.mock('../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    })
}));

// Mock database
jest.mock('../database', () => ({
    getHealthChecks: jest.fn(),
    getTableRowCount: jest.fn()
}));

// Mock client registry
jest.mock('../config/client-registry', () => ({
    getClientIds: jest.fn(),
    getClient: jest.fn(),
    getClients: jest.fn()
}));

// Mock auth middleware
jest.mock('../middleware/auth', () => ({
    asyncHandler: (fn) => (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    }
}));

const database = require('../database');
const clientRegistry = require('../config/client-registry');
const healthRoutes = require('../routes/health');

describeWithSockets('Health Routes', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use('/health', healthRoutes);
    });

    describe('GET /health/db', () => {
        test('should return healthy when database is working', async () => {
            database.getHealthChecks.mockResolvedValue([{ id: 1 }]);
            database.getTableRowCount.mockResolvedValue(100);

            const response = await request(app).get('/health/db');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.component).toBe('database');
            expect(response.body.status).toBe('healthy');
            expect(response.body.checks.connection).toBe(true);
            expect(response.body.checks.read).toBe(true);
        });

        test('should return unhealthy when database fails', async () => {
            database.getHealthChecks.mockRejectedValue(new Error('DB Error'));

            const response = await request(app).get('/health/db');

            expect(response.status).toBe(503);
            expect(response.body.success).toBe(false);
            expect(response.body.status).toBe('unhealthy');
        });
    });

    describe('GET /health/amo', () => {
        test('should return healthy when clients are configured', async () => {
            clientRegistry.getClientIds.mockReturnValue(['client1', 'client2']);
            clientRegistry.getClient.mockReturnValue({
                amo: {
                    domain: 'test.amocrm.ru',
                    accessToken: 'token',
                    refreshToken: 'refresh'
                }
            });

            const response = await request(app).get('/health/amo');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.component).toBe('amoCRM');
            expect(response.body.clients.length).toBe(2);
        });

        test('should return unhealthy when no clients configured', async () => {
            clientRegistry.getClientIds.mockReturnValue([]);

            const response = await request(app).get('/health/amo');

            expect(response.status).toBe(503);
            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /health/notifications', () => {
        test('should return healthy when Mattermost is configured', async () => {
            process.env.MATTERMOST_WEBHOOK_URL = 'https://mattermost.example.com/hooks/xxx';

            const response = await request(app).get('/health/notifications');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.component).toBe('notifications');
            expect(response.body.checks.mattermost.configured).toBe(true);
        });

        test('should return unhealthy when Mattermost not configured', async () => {
            delete process.env.MATTERMOST_WEBHOOK_URL;

            const response = await request(app).get('/health/notifications');

            expect(response.status).toBe(503);
            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /health/all', () => {
        test('should return aggregate health status', async () => {
            database.getHealthChecks.mockResolvedValue([]);
            clientRegistry.getClientIds.mockReturnValue(['client1']);
            clientRegistry.getClient.mockReturnValue({
                amo: { accessToken: 'token', refreshToken: 'refresh' }
            });
            process.env.MATTERMOST_WEBHOOK_URL = 'https://mattermost.example.com/hooks/xxx';

            const response = await request(app).get('/health/all');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.components).toBeDefined();
            expect(response.body.components.database).toBeDefined();
            expect(response.body.components.amoCRM).toBeDefined();
            expect(response.body.components.notifications).toBeDefined();
            expect(response.body.components.memory).toBeDefined();
            expect(response.body.uptime).toBeDefined();
        });

        test('should return degraded when some components fail', async () => {
            database.getHealthChecks.mockRejectedValue(new Error('DB Error'));
            clientRegistry.getClientIds.mockReturnValue(['client1']);
            clientRegistry.getClient.mockReturnValue({
                amo: { accessToken: 'token', refreshToken: 'refresh' }
            });
            process.env.MATTERMOST_WEBHOOK_URL = 'https://mattermost.example.com/hooks/xxx';

            const response = await request(app).get('/health/all');

            expect(response.status).toBe(503);
            expect(response.body.status).toBe('degraded');
            expect(response.body.components.database.status).toBe('unhealthy');
        });
    });
});
