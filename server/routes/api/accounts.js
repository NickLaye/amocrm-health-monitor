const express = require('express');
const { asyncHandler } = require('../../middleware/auth');
const { validateAccountPayload } = require('../../middleware/validation');
const { persistClientConfig } = require('../../services/account-writer');
const clientRegistry = require('../../config/client-registry');
const monitor = require('../../monitor-orchestrator');
const { createLogger } = require('../../utils/logger');

const logger = createLogger('API:Accounts');

const router = express.Router();

function toPublicClient(client) {
    if (!client) return null;
    return {
        id: client.id,
        label: client.label,
        environment: client.environment,
        tags: client.tags || [],
        amo: {
            domain: client.amo?.domain || '',
            clientId: client.amo?.clientId || ''
        },
        notifications: {
            mattermost: {
                channel: client.notifications?.mattermost?.channel || ''
            },
            email: {
                recipients: client.notifications?.email?.recipients || []
            }
        },
        metadata: {
            notes: client.metadata?.notes || ''
        }
    };
}

// Register new account (client)
router.post('/', validateAccountPayload, asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const clientId = payload.clientId.trim();

    if (clientRegistry.hasClient(clientId)) {
        res.status(409).json({
            success: false,
            error: `Клиент "${clientId}" уже существует`
        });
        return;
    }

    await persistClientConfig(payload);

    // Reload client registry
    clientRegistry.load();

    const createdClient = clientRegistry.getClient(clientId);
    if (!createdClient) {
        res.status(500).json({
            success: false,
            error: 'Не удалось загрузить созданную конфигурацию клиента'
        });
        return;
    }

    // Begin monitoring the newly added client immediately.
    // Boot-time monitor.start() only covers clients present at startup, so a
    // runtime-added account would otherwise stay in `unknown` until restart.
    try {
        monitor.startClient(clientId);
    } catch (err) {
        logger.error(`Failed to start monitoring for new client ${clientId}`, { error: err.message });
    }

    res.status(201).json({
        success: true,
        data: toPublicClient(createdClient)
    });
}));

module.exports = router;
module.exports.toPublicClient = toPublicClient;
