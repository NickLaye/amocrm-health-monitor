const express = require('express');
const { asyncHandler } = require('../../middleware/auth');
const { validateStats } = require('../../middleware/validation');
const database = require('../../database');
const aggregator = require('../../aggregator');
const { CHECK_TYPES, RESOLUTIONS } = require('../../config/constants');
const { statsCache } = require('../../utils/cache');
const {
    toNumber,
    normalizeResolution,
    resolveClientId,
    getWindowBounds,
    buildDefaultStats,
    summarizeAggregatedStats
} = require('../../utils/api-helpers');

const router = express.Router();

// Get statistics (15 performance metrics) with caching
router.get('/', validateStats, asyncHandler(async (req, res) => {
    const hours = toNumber(req.query.hours, 24);
    const resolution = normalizeResolution(req.query.resolution, RESOLUTIONS.HOUR);
    const { clientId, error } = resolveClientId(req.query.clientId);
    if (error) {
        res.status(400).json({ success: false, error });
        return;
    }
    const checkTypes = Object.values(CHECK_TYPES);

    // Check cache first
    const cacheKey = statsCache.generateKey({ hours, resolution, clientId });
    const cachedStats = statsCache.get(cacheKey);
    if (cachedStats) {
        res.json({
            success: true,
            data: cachedStats.data,
            meta: { ...cachedStats.meta, cached: true }
        });
        return;
    }

    if (resolution === RESOLUTIONS.RAW) {
        const stats = {};
        for (const checkType of checkTypes) {
            const detailedStats = await database.getDetailedStatistics(checkType, hours);
            if (!detailedStats) {
                stats[checkType] = buildDefaultStats(hours);
                continue;
            }
            stats[checkType] = {
                uptime: detailedStats.uptime,
                totalChecks: detailedStats.totalChecks,
                mttr: detailedStats.mttr,
                mtbf: detailedStats.mtbf,
                apdexScore: detailedStats.apdexScore,
                successRate: detailedStats.successRate,
                failureCount: detailedStats.failureCount,
                avgResponseTime: detailedStats.avgResponseTime,
                minResponseTime: detailedStats.minResponseTime,
                maxResponseTime: detailedStats.maxResponseTime,
                p95ResponseTime: detailedStats.p95ResponseTime,
                p99ResponseTime: detailedStats.p99ResponseTime,
                lastIncident: detailedStats.lastIncident,
                incidentCount: detailedStats.incidentCount,
                availability: detailedStats.availability,
                averageResponseTime: detailedStats.avgResponseTime,
                checkCount: detailedStats.totalChecks,
                percentile95: detailedStats.p95ResponseTime,
                apdex: detailedStats.apdexScore,
                errorRate: detailedStats.failureCount > 0
                    ? parseFloat(((detailedStats.failureCount / detailedStats.totalChecks) * 100).toFixed(2))
                    : 0,
                upChecks: detailedStats.totalChecks - detailedStats.failureCount - (detailedStats.warningCount || 0),
                downChecks: detailedStats.failureCount,
                warningChecks: detailedStats.warningCount || 0
            };
        }

        const meta = { resolution, clientId, hours };
        statsCache.set(cacheKey, { data: stats, meta }, 60000); // Cache for 60 seconds

        res.json({
            success: true,
            data: stats,
            meta
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
        checkTypes
    });

    const stats = {};
    for (const checkType of checkTypes) {
        const rows = await database.getAggregates({
            resolution,
            clientId,
            checkType,
            from,
            to
        });
        stats[checkType] = summarizeAggregatedStats(rows, hours);
    }

    const meta = { resolution, clientId, hours, from, to };
    statsCache.set(cacheKey, { data: stats, meta }, 60000); // Cache for 60 seconds

    res.json({
        success: true,
        data: stats,
        meta
    });
}));

module.exports = router;
