const request = require('supertest');
const express = require('express');
const helmet = require('helmet');
const basicAuth = require('express-basic-auth');
process.env.AUTH_RATE_LIMIT = '10';
jest.resetModules();
const authLimiter = require('../middleware/auth-limiter');

describe('Security Integration Tests', () => {
    let app;

    beforeAll(() => {
        app = express();

        // Mimic index.js security setup
        app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    connectSrc: ["'self'"],
                    // minimalist CSP for testing
                },
            },
            crossOriginEmbedderPolicy: false
        }));

        const basicAuthMiddleware = basicAuth({
            users: { 'admin': 'secret' },
            challenge: true
        });

        // Protected route with limiter and auth
        app.get('/protected',
            authLimiter,
            (req, res, next) => basicAuthMiddleware(req, res, next),
            (req, res) => res.json({ secret: 'data' })
        );

        // Public route
        app.get('/public', (req, res) => res.json({ public: 'data' }));
    });

    describe('CSP Headers', () => {
        test('should set Content-Security-Policy header', async () => {
            const res = await request(app).get('/public');
            expect(res.headers['content-security-policy']).toBeDefined();
            expect(res.headers['content-security-policy']).toContain("default-src 'self'");
        });
    });

    describe('Auth Rate Limiting', () => {
        test('should limit repeated failed requests', async () => {
            // NOTE: express-rate-limit keeps state in memory by default.
            // We need to trigger enough requests to hit limit (10).

            // Sending 10 requests
            const promises = [];
            for (let i = 0; i < 11; i++) {
                promises.push(
                    request(app)
                        .get('/protected')
                        .set('Authorization', 'Basic invalid') // Invalid auth
                );
            }

            const responses = await Promise.all(promises);
            const lastResponse = responses[responses.length - 1];

            // With default store, it should increment even on 401 if we didn't skip failed.
            // But we set skipSuccessfulRequests: true.
            // Wait, logic: skipSuccessfulRequests means only FAILED count.
            // So 401s SHOULD count.

            // If the last one is blocked, it should be 429.
            // Check if 429 was hit.
            const tooManyRequests = responses.find(r => r.status === 429);

            // Note: If we run tests in parallel/watch mode, state might persist or be flaky.
            // But here we create fresh 'app' but authLimiter is imported singleton?
            // Middleware instance is created at import time in auth-limiter.js!
            // So state persists across tests if not reset.

            // Since we test 10 limit, finding at least one 429 confirms it works.
            expect(tooManyRequests).toBeDefined();
            expect(tooManyRequests.text).toContain('Too many login attempts');
        });
    });
});
