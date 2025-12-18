const express = require('express');
const { asyncHandler } = require('../../middleware/auth');
const { validateIncidents } = require('../../middleware/validation');
const database = require('../../database');
const { toNumber, resolveClientId } = require('../../utils/api-helpers');

const router = express.Router();

// Get incidents
router.get('/', validateIncidents, asyncHandler(async (req, res) => {
    const limit = toNumber(req.query.limit, 50);
    const { clientId, error } = resolveClientId(req.query.clientId);
    if (error) {
        res.status(400).json({ success: false, error });
        return;
    }
    const incidents = await database.getIncidents(limit, clientId);

    res.json({
        success: true,
        data: incidents,
        count: incidents.length,
        clientId
    });
}));

module.exports = router;
