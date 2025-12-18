const express = require('express');
const { asyncHandler } = require('../../middleware/auth');
const { validateHistory } = require('../../middleware/validation');
const database = require('../../database');
const aggregator = require('../../aggregator');
const { CHECK_TYPES, RESOLUTIONS } = require('../../config/constants');
const {
    toNumber,
    normalizeResolution,
    resolveClientId,
    getWindowBounds,
    mapAggregateRow
} = require('../../utils/api-helpers');

const router = express.Router();

// Get historical data for charts
router.get('/', validateHistory, asyncHandler(async (req, res) => {
    const { checkType } = req.query;
    const hours = toNumber(req.query.hours, 24);
    const resolution = normalizeResolution(req.query.resolution, RESOLUTIONS.RAW);
    const { clientId, error } = resolveClientId(req.query.clientId);
    if (error) {
        res.status(400).json({ success: false, error });
        return;
    }

    if (resolution === RESOLUTIONS.RAW) {
        const data = await database.getHealthChecks(checkType || null, hours, clientId);
        res.json({
            success: true,
            data,
            count: data.length,
            meta: { resolution, clientId, hours }
        });
        return;
    }

    const bucketSize = aggregator.getBucketSize(resolution);
    const { from, to } = getWindowBounds(hours, bucketSize);

    await aggregator.ensureAggregates({
        resolution,
        clientId,
        from,
        to,
        checkTypes: checkType ? [checkType] : Object.values(CHECK_TYPES)
    });

    const aggregates = await database.getAggregates({
        resolution,
        clientId,
        checkType: checkType || null,
        from,
        to
    });
    const mapped = aggregates.map(mapAggregateRow);

    res.json({
        success: true,
        data: mapped,
        count: mapped.length,
        meta: { resolution, clientId, hours, from, to }
    });
}));

module.exports = router;
