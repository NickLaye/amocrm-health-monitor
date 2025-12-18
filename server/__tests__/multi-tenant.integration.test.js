const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Mock dependencies
jest.mock('../config/client-registry', () => ({
    hasClient: jest.fn(),
    getClient: jest.fn(),
    isMultiTenant: jest.fn(() => true),
    getClientIds: jest.fn(() => ['clientA', 'clientB']),
}));

jest.mock('../monitor-orchestrator', () => ({
    getStatus: jest.fn(),
    addListener: jest.fn(),
    handleWebhookEvent: jest.fn(),
    getLastCheckTime: jest.fn(),
    isHealthy: jest.fn(() => true),
}));

jest.mock('../database', () => ({
    getIncidents: jest.fn(),
    getDetailedStatistics: jest.fn(),
}));

jest.mock('../aggregator', () => ({
    start: jest.fn(),
    stop: jest.fn(),
}));

jest.mock('../metrics', () => ({
    register: { contentType: 'text/plain' },
}));

jest.mock('../token-manager', () => ({
    getAccessToken: jest.fn(),
}));

jest.mock('../notifications', () => ({
    sendDownNotification: jest.fn(),
    sendUpNotification: jest.fn(),
}));

jest.mock('../config/env-validator', () => ({
    getSseTokenTtl: jest.fn(() => 3600),
}));

jest.mock('../utils/logger', () => ({
    createLogger: jest.fn(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    })),
}));

jest.mock('../middleware/validation', () => ({
    validateAccountPayload: (req, res, next) => next(),
    validateHistory: (req, res, next) => next(),
    validateStats: (req, res, next) => next(),
    validateIncidents: (req, res, next) => next(),
    validateExternalIncident: (req, res, next) => next(),
}));

jest.mock('../services/account-writer', () => ({
    persistClientConfig: jest.fn(),
}));

jest.mock('../utils/cache', () => ({
    statsCache: {
        get: jest.fn(),
        set: jest.fn(),
        generateKey: jest.fn(() => 'key'),
    },
}));



jest.mock('../middleware/auth', () => ({
    authenticateSSE: (req, res, next) => next(),
    asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    issueSseToken: jest.fn(() => ({ token: 't', expiresAt: 1, ttlMs: 1 })),
    getSseTokenTtl: jest.fn(() => 3600),
}));

jest.mock('../routes/health', () => {
    const express = require('express');
    return express.Router();
});

jest.mock('../utils/export-helpers', () => ({
    exportHealthChecksToCSV: jest.fn(),
    exportIncidentsToCSV: jest.fn(),
    exportStatsToCSV: jest.fn(),
}));

const clientRegistry = require('../config/client-registry');
const monitor = require('../monitor-orchestrator');
const database = require('../database');
const apiRouter = require('../api');

describe('Multi-tenant Integration Tests', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api', apiRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup default mock behaviors
        clientRegistry.hasClient.mockImplementation((id) => ['clientA', 'clientB'].includes(id));
        clientRegistry.getClient.mockImplementation((id) => {
            if (['clientA', 'clientB'].includes(id)) {
                return { id, label: `Label for ${id}` };
            }
            return null;
        });
    });

    describe('Data Isolation', () => {
        test('should return status only for requested clientA', async () => {
            monitor.getStatus.mockReturnValue({
                GET: { status: 'up', responseTime: 100 },
            });

            const response = await request(app)
                .post('/api/accounts')
                .send({ clientId: 'clientA' }); // Using accounts endpoint as a proxy to check status retrieval logic or direct status endpoint if available

            // Ideally we check /api/status?clientId=clientA, but let's check what endpoints are available.
            // Based on api.js: router.get('/status', ...)

            monitor.getStatus.mockImplementation((clientId) => {
                if (clientId === 'clientA') return { GET: { status: 'up', client: 'A' } };
                if (clientId === 'clientB') return { GET: { status: 'down', client: 'B' } };
                return {};
            });

            const resA = await request(app).get('/api/status?clientId=clientA');
            expect(resA.status).toBe(200);
            expect(resA.body.data.GET.client).toBe('A');

            const resB = await request(app).get('/api/status?clientId=clientB');
            expect(resB.status).toBe(200);
            expect(resB.body.data.GET.client).toBe('B');
        });

        test('should return incidents only for requested client', async () => {
            database.getIncidents.mockImplementation((limit, clientId) => {
                if (clientId === 'clientA') return [{ id: 1, client_id: 'clientA' }];
                if (clientId === 'clientB') return [{ id: 2, client_id: 'clientB' }];
                return [];
            });

            const res = await request(app).get('/api/incidents?clientId=clientA');
            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].client_id).toBe('clientA');
            expect(database.getIncidents).toHaveBeenCalledWith(expect.any(Number), 'clientA');
        });
    });

    describe('Cross-Access Security', () => {
        test('should not allow checking status of invalid client', async () => {
            clientRegistry.hasClient.mockReturnValue(false);

            const res = await request(app).get('/api/status?clientId=invalidClient');

            // Depending on implementation, it might fallback to default or return error. 
            // Looking at api.js: const { clientId, error } = resolveClientId(...)
            // If error, returns 400.

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    describe('Client ID Validation', () => {
        test('should return 400 if clientId is missing in multi-tenant mode', async () => {
            // In multi-tenant mode, clientId is required if not optional.
            // api.js resolveClientId enforces this.

            const res = await request(app).get('/api/status?clientId=');

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toMatch(/query parameter is required/);
        });

        test('should reject malicious clientId', async () => {
            // Checking for directory traversal attempts or weird chars if logic handles it
            const res = await request(app).get('/api/status?clientId=../../etc/passwd');

            // ClientRegistry.hasClient should return false
            expect(res.status).toBe(400);
        });
    });
});
