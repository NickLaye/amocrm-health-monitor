const express = require('express');
const { asyncHandler } = require('../../middleware/auth');
const { validateExternalIncident } = require('../../middleware/validation');
const monitor = require('../../monitor-orchestrator');
const notificationService = require('../../notifications');
const { createLogger } = require('../../utils/logger');
const { resolveClientId } = require('../../utils/api-helpers');

const router = express.Router();
const logger = createLogger('API:Webhooks');

// amoCRM webhook callback for Digital Pipeline monitoring
router.post('/callback', asyncHandler(async (req, res) => {
    const { clientId, error } = resolveClientId(req.query.clientId);
    if (error) {
        res.status(400).json({ success: false, error });
        return;
    }

    logger.debug('Incoming webhook:', {
        clientId,
        query: req.query,
        body: req.body,
        headers: req.headers['content-type']
    });

    const handled = monitor.handleWebhookEvent(req.body || {}, clientId);

    if (!handled) {
        logger.debug('Webhook callback received but no pending DP checks or match failed');
    }

    res.json({
        success: true,
        handled
    });
}));

router.post('/mattermail', validateExternalIncident, asyncHandler(async (req, res) => {
    const token = req.headers['x-webhook-token'] || req.query.token;
    const expectedToken = process.env.EXTERNAL_WEBHOOK_TOKEN;

    if (!expectedToken) {
        res.status(503).json({ success: false, error: 'EXTERNAL_WEBHOOK_TOKEN не задан' });
        return;
    }

    if (!token || token !== expectedToken) {
        res.status(401).json({ success: false, error: 'Недействительный webhook token' });
        return;
    }

    await notificationService.sendExternalIncident(req.body || {});

    res.status(202).json({
        success: true,
        message: 'Уведомление поставлено в очередь'
    });
}));

module.exports = router;
