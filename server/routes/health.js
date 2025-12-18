/**
 * Extended Health Check Routes
 * Provides detailed health status for individual components
 */

const express = require('express');
const { createLogger } = require('../utils/logger');
const database = require('../database');
const clientRegistry = require('../config/client-registry');
const { asyncHandler } = require('../middleware/auth');

const router = express.Router();
const logger = createLogger('HealthRoutes');

/**
 * GET /api/health/db
 * Check SQLite database connectivity and basic operations
 */
router.get('/db', asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const checks = {
        connection: false,
        read: false,
        write: false,
        tables: []
    };

    try {
        // Test read operation
        const recentChecks = await database.getHealthChecks(null, 1);
        checks.read = true;
        checks.connection = true;

        // Get table info
        const tableNames = ['health_checks', 'incidents', 'health_check_aggregates'];
        for (const table of tableNames) {
            try {
                const count = await database.getTableRowCount(table);
                checks.tables.push({ name: table, rowCount: count, status: 'ok' });
            } catch {
                checks.tables.push({ name: table, rowCount: null, status: 'error' });
            }
        }

        // Test write operation (dry run - just verify capability)
        checks.write = typeof database.insertHealthCheck === 'function';

        const responseTime = Date.now() - startTime;
        const isHealthy = checks.connection && checks.read;

        res.status(isHealthy ? 200 : 503).json({
            success: isHealthy,
            component: 'database',
            status: isHealthy ? 'healthy' : 'unhealthy',
            checks,
            responseTimeMs: responseTime,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Database health check failed:', error);
        res.status(503).json({
            success: false,
            component: 'database',
            status: 'unhealthy',
            error: error.message,
            checks,
            responseTimeMs: Date.now() - startTime,
            timestamp: Date.now()
        });
    }
}));

/**
 * GET /api/health/amo
 * Check amoCRM API connectivity for configured clients
 */
router.get('/amo', asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const clientIds = clientRegistry.getClientIds();
    const results = [];

    for (const clientId of clientIds) {
        const clientConfig = clientRegistry.getClient(clientId);
        const check = {
            clientId,
            domain: clientConfig?.amo?.domain || 'unknown',
            hasAccessToken: !!clientConfig?.amo?.accessToken,
            hasRefreshToken: !!clientConfig?.amo?.refreshToken,
            status: 'unknown'
        };

        if (check.hasAccessToken && check.hasRefreshToken) {
            check.status = 'configured';
        } else if (check.hasAccessToken || check.hasRefreshToken) {
            check.status = 'partial';
        } else {
            check.status = 'missing_tokens';
        }

        results.push(check);
    }

    const allConfigured = results.length > 0 && results.every(r => r.status === 'configured');
    const isHealthy = results.length > 0 && results.some(r => r.status === 'configured');

    res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        component: 'amoCRM',
        status: allConfigured ? 'healthy' : (isHealthy ? 'partial' : 'unhealthy'),
        clients: results,
        clientCount: results.length,
        responseTimeMs: Date.now() - startTime,
        timestamp: Date.now()
    });
}));

/**
 * GET /api/health/notifications
 * Check notification service configuration (Mattermost, Email)
 */
router.get('/notifications', asyncHandler(async (req, res) => {
    const startTime = Date.now();

    const checks = {
        mattermost: {
            configured: !!process.env.MATTERMOST_WEBHOOK_URL,
            webhookUrl: process.env.MATTERMOST_WEBHOOK_URL ?
                process.env.MATTERMOST_WEBHOOK_URL.substring(0, 50) + '...' : null,
            mentions: process.env.MATTERMOST_MENTIONS || ''
        },
        email: {
            enabled: process.env.EMAIL_ENABLED === 'true',
            smtpHost: process.env.SMTP_HOST || null,
            smtpPort: process.env.SMTP_PORT || null,
            from: process.env.EMAIL_FROM || null,
            to: process.env.EMAIL_TO || null
        }
    };

    const mattermostOk = checks.mattermost.configured;
    const emailOk = !checks.email.enabled ||
        (checks.email.smtpHost && checks.email.from && checks.email.to);
    const isHealthy = mattermostOk;

    res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        component: 'notifications',
        status: isHealthy ? 'healthy' : 'unhealthy',
        checks,
        responseTimeMs: Date.now() - startTime,
        timestamp: Date.now()
    });
}));

/**
 * GET /api/health/all
 * Aggregate health check for all components
 */
router.get('/all', asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const components = {};
    let overallHealthy = true;

    // Database check
    try {
        await database.getHealthChecks(null, 1);
        components.database = { status: 'healthy', message: 'Connection OK' };
    } catch (error) {
        components.database = { status: 'unhealthy', message: error.message };
        overallHealthy = false;
    }

    // amoCRM check
    const clientIds = clientRegistry.getClientIds();
    const configuredClients = clientIds.filter(id => {
        const client = clientRegistry.getClient(id);
        return client?.amo?.accessToken && client?.amo?.refreshToken;
    });
    if (configuredClients.length > 0) {
        components.amoCRM = {
            status: 'healthy',
            message: `${configuredClients.length}/${clientIds.length} clients configured`
        };
    } else {
        components.amoCRM = { status: 'unhealthy', message: 'No clients configured' };
        overallHealthy = false;
    }

    // Notifications check
    if (process.env.MATTERMOST_WEBHOOK_URL) {
        components.notifications = { status: 'healthy', message: 'Mattermost configured' };
    } else {
        components.notifications = { status: 'unhealthy', message: 'Mattermost not configured' };
        overallHealthy = false;
    }

    // Memory usage
    const memUsage = process.memoryUsage();
    components.memory = {
        status: 'healthy',
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memUsage.rss / 1024 / 1024)
    };

    res.status(overallHealthy ? 200 : 503).json({
        success: overallHealthy,
        status: overallHealthy ? 'healthy' : 'degraded',
        components,
        uptime: Math.floor(process.uptime()),
        nodeVersion: process.version,
        responseTimeMs: Date.now() - startTime,
        timestamp: Date.now()
    });
}));

module.exports = router;
