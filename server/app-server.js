const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const basicAuth = require('express-basic-auth');

const { DEFAULTS } = require('./config/constants');
const { getIntEnvOrDefault } = require('./config/env-validator');
const { createLogger } = require('./utils/logger');
const authLimiter = require('./middleware/auth-limiter');
const apiRouter = require('./api');

class AppServer {
    constructor() {
        this.app = express();
        this.logger = createLogger('AppServer');
        this.adminUser = process.env.ADMIN_USER;
        this.adminPassword = process.env.ADMIN_PASSWORD;

        // Rate limit defaults
        this.FALLBACK_RATE_LIMIT = {
            WINDOW_MS: 60 * 1000,
            LIMIT: 100,
            IPV6_SUBNET: 64
        };
        this.RATE_LIMIT_DEFAULTS = (DEFAULTS && DEFAULTS.RATE_LIMIT) ? DEFAULTS.RATE_LIMIT : this.FALLBACK_RATE_LIMIT;
    }

    initialize() {
        this.validateAuthCredentials();
        this.setupTrustProxy();
        this.setupSecurityMiddleware();
        this.setupBasicMiddleware();
        
        // Health check MUST be registered FIRST, before auth, routes, static files, and catch-all
        // This ensures it's never intercepted by any middleware or routes
        this.setupHealthCheck();
        
        this.setupAuthMiddleware();
        this.setupRateLimiting();
        this.setupRoutes();
        this.setupStaticServing();
        this.setupSPACatchAll();
        this.setupErrorHandling();

        return this.app;
    }

    validateAuthCredentials() {
        if (!this.adminUser || !this.adminPassword) {
            this.logger.error('ADMIN_USER and ADMIN_PASSWORD are required for Basic Auth.');
            // In a real class we might throw, but to match previous behavior we exit, 
            // though throwing is better for testing.
            throw new Error('Missing Admin Credentials');
        }
    }

    setupTrustProxy() {
        this.app.set('trust proxy', 1);
    }

    setupSecurityMiddleware() {
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", process.env.AMOCRM_DOMAIN || ""].filter(Boolean),
                    fontSrc: ["'self'", "https:", "data:"],
                    objectSrc: ["'none'"],
                    upgradeInsecureRequests: [],
                },
            },
            crossOriginEmbedderPolicy: false
        }));
    }

    setupBasicMiddleware() {
        this.app.use(cors());
        this.app.use(compression());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
    }

    setupAuthMiddleware() {
        const basicAuthMiddleware = basicAuth({
            users: { [this.adminUser]: this.adminPassword },
            challenge: true
        });

        // Determine paths that bypass auth
        this.authBypassPaths = new Set([
            '/health',
            '/api/health',
            '/api/metrics',
            '/api/webhooks/mattermail',
            '/api/webhook/callback',
            '/api/webhooks/callback',
            '/api/stream',
            '/api/stream/token',
            '/api/config'
        ]);

        this.app.use((req, res, next) => {
            const url = req.originalUrl || req.url;
            const path = url.split('?')[0];

            // Check for exact path match or if it's one of the bypass routes
            if (this.authBypassPaths.has(path)) {
                return next();
            }

            // Fallback checking for common patterns
            const isBypass = Array.from(this.authBypassPaths).some(bp =>
                path === bp || path.endsWith(bp) || (path.startsWith(bp) && (path[bp.length] === '/' || path[bp.length] === undefined))
            );

            if (isBypass) {
                this.logger.debug(`Bypassing auth for: ${path}`);
                return next();
            }

            this.logger.debug(`Checking auth for: ${path}`);

            // Apply brute-force protection before authentication check
            authLimiter(req, res, (err) => {
                if (err) return next(err);
                basicAuthMiddleware(req, res, next);
            });
        });
    }

    resolveIpv6Subnet(rawValue, fallback) {
        if (!rawValue) {
            return fallback;
        }

        const normalized = rawValue.trim().toLowerCase();
        if (['false', 'off', 'disable', 'none'].includes(normalized)) {
            return false;
        }

        const parsed = parseInt(rawValue, 10);
        if (Number.isNaN(parsed)) {
            this.logger.warn(`Invalid RATE_LIMIT_IPV6_SUBNET="${rawValue}", falling back to ${fallback}`);
            return fallback;
        }

        return parsed;
    }

    setupRateLimiting() {
        const rateLimitWindowMs = getIntEnvOrDefault('RATE_LIMIT_WINDOW_MS', this.RATE_LIMIT_DEFAULTS.WINDOW_MS);
        const rateLimitLimit = getIntEnvOrDefault('RATE_LIMIT_LIMIT', this.RATE_LIMIT_DEFAULTS.LIMIT);
        const rateLimitIpv6Subnet = this.resolveIpv6Subnet(
            process.env.RATE_LIMIT_IPV6_SUBNET,
            this.RATE_LIMIT_DEFAULTS.IPV6_SUBNET
        );

        const apiLimiter = rateLimit({
            windowMs: rateLimitWindowMs,
            limit: rateLimitLimit,
            message: {
                success: false,
                error: 'Too many requests from this IP, please try again later.'
            },
            standardHeaders: 'draft-8',
            legacyHeaders: false,
            ipv6Subnet: rateLimitIpv6Subnet
        });

        // Apply rate limiter only to API routes (exclude health, stream, and webhooks)
        this.app.use('/api/', (req, res, next) => {
            const isHealth = req.path === '/health';
            const isSSE = req.path.includes('stream') || req.path.includes('config');
            const isWebhook = req.path.includes('webhook');

            if (isHealth || isSSE || isWebhook) {
                return next();
            }
            apiLimiter(req, res, next);
        });
    }

    setupRoutes() {
        this.app.use('/api', apiRouter);
    }

    setupStaticServing() {
        if (process.env.NODE_ENV === 'production') {
            const candidatePaths = [
                path.join(__dirname, '../client/dist'),
                path.join(__dirname, '../client-build'),
                path.join(__dirname, '../client/build'),
            ];

            const buildPath = candidatePaths.find((candidate) => fs.existsSync(candidate));

            if (buildPath) {
                this.logger.info(`Serving static files from: ${buildPath}`);
                // Use a function to skip /health endpoint explicitly
                this.app.use((req, res, next) => {
                    // Skip /health endpoint - it's handled by setupHealthCheck
                    if (req.path === '/health' || req.originalUrl === '/health') {
                        return next();
                    }
                    // Use express.static for all other requests
                    express.static(buildPath)(req, res, next);
                });
            } else {
                this.logger.warn('No client build directory found; skipping static asset hosting.');
            }
        }
    }

    setupHealthCheck() {
        // Health check endpoint - MUST be registered FIRST, before ALL middleware and routes
        // Express processes routes in registration order, so this ensures /health is handled first
        this.app.get('/health', (req, res) => {
            this.logger.info('Health check endpoint called', { 
                url: req.url, 
                method: req.method,
                ip: req.ip,
                originalUrl: req.originalUrl,
                path: req.path
            });
            res.json({ 
                status: 'ok', 
                timestamp: Date.now(),
                uptime: process.uptime(),
                nodeVersion: process.version
            });
        });
        this.logger.info('Health check endpoint registered at /health (FIRST route, before all middleware)');
    }

    setupSPACatchAll() {
        // SPA catch-all route - must be last, after health check
        // Explicitly exclude /health to prevent it from being caught
        if (process.env.NODE_ENV === 'production') {
            const candidatePaths = [
                path.join(__dirname, '../client/dist'),
                path.join(__dirname, '../client-build'),
                path.join(__dirname, '../client/build'),
            ];

            const buildPath = candidatePaths.find((candidate) => fs.existsSync(candidate));

            if (buildPath) {
                this.app.get(/.*/, (req, res, next) => {
                    // Explicitly skip /health endpoint - it should be handled by setupHealthCheck
                    if (req.path === '/health' || req.originalUrl === '/health') {
                        return next();
                    }
                    res.sendFile(path.join(buildPath, 'index.html'));
                });
            }
        }
    }

    setupErrorHandling() {
        this.app.use((err, req, res, next) => {
            this.logger.error('Request error', err);
            res.status(500).json({
                success: false,
                error: err.message || 'Internal server error'
            });
        });
    }
}

module.exports = AppServer;
