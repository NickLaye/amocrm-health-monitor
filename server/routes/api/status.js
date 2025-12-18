const express = require('express');
const { asyncHandler } = require('../../middleware/auth');
const monitor = require('../../monitor-orchestrator');
const { resolveClientId } = require('../../utils/api-helpers');

const router = express.Router();

// Get current status of all services
router.get('/', asyncHandler(async (req, res) => {
    const { clientId, error } = resolveClientId(req.query.clientId);
    if (error) {
        res.status(400).json({ success: false, error });
        return;
    }

    const status = monitor.getStatus(clientId);
    res.json({
        success: true,
        data: status,
        clientId,
        timestamp: Date.now()
    });
}));

module.exports = router;
