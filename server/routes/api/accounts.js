const express = require('express');
const { asyncHandler } = require('../../middleware/auth');
const { validateAccountPayload } = require('../../middleware/validation');
const { persistClientConfig } = require('../../services/account-writer');
const clientRegistry = require('../../config/client-registry');

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

    res.status(201).json({
        success: true,
        data: toPublicClient(createdClient)
    });
}));

module.exports = router;
module.exports.toPublicClient = toPublicClient;
