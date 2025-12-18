const express = require('express');
const { authenticateSSE, asyncHandler, issueSseToken, getSseTokenTtl } = require('../../middleware/auth');
const monitor = require('../../monitor-orchestrator');
const { createLogger } = require('../../utils/logger');
const { resolveClientId, resolveSseOrigin } = require('../../utils/api-helpers');
const { DEFAULT_CLIENT_ID } = require('../../config/constants');

const router = express.Router();
const logger = createLogger('API:SSE');

// SSE clients storage
const sseClients = [];

// SSE heartbeat interval (30 seconds)
const SSE_HEARTBEAT_INTERVAL = 30000;
let heartbeatIntervalId = null;

// Get public configuration for frontend
router.get('/config', asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: {
            checkInterval: parseInt(process.env.CHECK_INTERVAL) || 60000,
            domain: process.env.AMOCRM_DOMAIN || '',
            sse: {
                tokenEndpoint: '/api/stream/token',
                tokenTtlMs: getSseTokenTtl()
            }
        },
        timestamp: Date.now()
    });
}));

router.post('/stream/token', asyncHandler(async (req, res) => {
    const rawClientId = req.body?.clientId;
    const { clientId, error } = resolveClientId(rawClientId);
    if (error) {
        res.status(400).json({ success: false, error });
        return;
    }

    const tokenPayload = issueSseToken(clientId);
    res.json({
        success: true,
        data: {
            token: tokenPayload.token,
            expiresAt: tokenPayload.expiresAt,
            ttlMs: tokenPayload.ttlMs
        }
    });
}));

/**
 * Start SSE heartbeat to keep connections alive and detect dead clients
 */
function startHeartbeat() {
    if (heartbeatIntervalId) return;

    heartbeatIntervalId = setInterval(() => {
        const now = Date.now();
        const deadClients = [];

        sseClients.forEach((client, index) => {
            try {
                client.res.write(': heartbeat\n\n');
                client.lastHeartbeat = now;
            } catch (error) {
                logger.warn(`Dead SSE client detected: ${client.id}`);
                deadClients.push(index);
            }
        });

        // Remove dead clients in reverse order to maintain correct indices
        deadClients.reverse().forEach(index => {
            const client = sseClients[index];
            logger.info(`Removing dead SSE client ${client.id}`);
            sseClients.splice(index, 1);
        });

        if (sseClients.length > 0) {
            logger.debug(`SSE heartbeat sent to ${sseClients.length} clients`);
        }
    }, SSE_HEARTBEAT_INTERVAL);

    logger.info('SSE heartbeat started');
}

// Server-Sent Events for real-time updates (with authentication)
router.get('/stream', authenticateSSE, (req, res) => {
    const requestedClientId = req.query.clientId || req.sseAuth?.clientId;
    const { clientId, error } = resolveClientId(requestedClientId);
    if (error) {
        res.status(400).json({ success: false, error });
        return;
    }

    if (req.sseAuth?.clientId && req.sseAuth.clientId !== clientId) {
        res.status(403).json({ success: false, error: 'Token does not match requested clientId' });
        return;
    }

    const origin = req.headers.origin;
    if (origin) {
        const allowedOrigin = resolveSseOrigin(origin);
        if (!allowedOrigin) {
            res.status(403).json({ success: false, error: 'Origin not allowed for SSE' });
            return;
        }
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection message
    res.write(`data: ${JSON.stringify({
        type: 'connected',
        message: 'Connected to health monitor stream',
        clientId
    })}\n\n`);

    // Add client to list
    const connectionId = `${clientId}:${Date.now()}`;
    const client = { id: connectionId, clientId, res, lastHeartbeat: Date.now() };
    sseClients.push(client);

    logger.info(`SSE client ${connectionId} connected for ${clientId}. Total: ${sseClients.length}`);

    // Start heartbeat if not already running
    if (!heartbeatIntervalId && sseClients.length > 0) {
        startHeartbeat();
    }

    // Remove client on disconnect
    req.on('close', () => {
        const index = sseClients.findIndex(c => c.id === connectionId);
        if (index !== -1) {
            sseClients.splice(index, 1);
        }
        logger.info(`SSE client ${connectionId} (${clientId}) disconnected. Total: ${sseClients.length}`);

        // Stop heartbeat if no clients
        if (sseClients.length === 0 && heartbeatIntervalId) {
            clearInterval(heartbeatIntervalId);
            heartbeatIntervalId = null;
            logger.debug('SSE heartbeat stopped - no clients');
        }
    });
});

/**
 * Broadcast updates to all SSE clients
 */
function broadcastUpdate(checkType, data, context = {}) {
    if (sseClients.length === 0) return;

    const targetClientId = context.clientId || DEFAULT_CLIENT_ID;
    const message = JSON.stringify({
        type: 'status_update',
        checkType,
        data,
        clientId: targetClientId,
        timestamp: Date.now()
    });

    const deadClients = [];
    sseClients.forEach((client, index) => {
        if (client.clientId !== targetClientId) {
            return;
        }
        try {
            client.res.write(`data: ${message}\n\n`);
        } catch (error) {
            logger.error(`Error broadcasting to SSE client ${client.id}:`, error);
            deadClients.push(index);
        }
    });

    // Clean up dead clients
    deadClients.reverse().forEach(index => {
        logger.warn(`Removing failed SSE client during broadcast`);
        sseClients.splice(index, 1);
    });
}

// Register monitor listener for real-time updates
monitor.addListener((checkType, data, context) => {
    broadcastUpdate(checkType, data, context);
});

// Export a getter for current SSE clients count if needed for metrics (metrics uses it)
// But metrics module is separate. 
// We need to export a way to get client count or let metrics access it.
// In api.js original, metrics.updateSSEClients was called in /health.
// So we need to expose the count.
module.exports = router;
module.exports.getSseClientCount = () => sseClients.length;
