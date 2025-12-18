const express = require('express');
const { asyncHandler } = require('../../middleware/auth');
const clientRegistry = require('../../config/client-registry');

const router = express.Router();

// Get list of configured clients
router.get('/', asyncHandler(async (req, res) => {
    const clients = clientRegistry.getClients().map(client => ({
        id: client.id,
        label: client.label,
        environment: client.environment,
        tags: client.tags,
        domain: client.amo?.domain || ''
    }));

    res.json({
        success: true,
        data: clients,
        count: clients.length
    });
}));

module.exports = router;
