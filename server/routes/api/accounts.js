const express = require('express');
const { asyncHandler } = require('../../middleware/auth');
const { validateAccountPayload } = require('../../middleware/validation');
const { persistClientConfig } = require('../../services/account-writer');
const clientRegistry = require('../../config/client-registry');

const router = express.Router();

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

    // Reload env vars from .env files
    require('dotenv').config({ override: true });

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
        data: createdClient
    });
}));

module.exports = router;
