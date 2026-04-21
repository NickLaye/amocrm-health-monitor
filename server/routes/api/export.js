const express = require('express');
const { asyncHandler } = require('../../middleware/auth');
const { validateHistory, validateIncidents, validateStats } = require('../../middleware/validation');
const database = require('../../database');
const aggregator = require('../../aggregator');
const { CHECK_TYPES, RESOLUTIONS } = require('../../config/constants');
const { exportHealthChecksToCSV, exportIncidentsToCSV, exportStatsToCSV } = require('../../utils/export-helpers');
const {
    toNumber,
    normalizeResolution,
    resolveClientId,
    getWindowBounds,
    summarizeAggregatedStats,
    buildDefaultStats
} = require('../../utils/api-helpers');

const router = express.Router();

router.get('/health-checks', validateHistory, asyncHandler(async (req, res) => {
    const { checkType, format = 'csv' } = req.query;
    const hours = toNumber(req.query.hours, 24);
    const { clientId, error } = resolveClientId(req.query.clientId);
    if (error) {
        res.status(400).json({ success: false, error });
        return;
    }

    const data = await database.getHealthChecks(checkType || null, hours, clientId);

    if (format === 'csv') {
        const csv = exportHealthChecksToCSV(data);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="health-checks-${Date.now()}.csv"`);
        res.send(csv);
    } else {
        res.json({ success: true, data });
    }
}));

router.get('/incidents', validateIncidents, asyncHandler(async (req, res) => {
    const { format = 'csv' } = req.query;
    const limit = toNumber(req.query.limit, 100);
    const { clientId, error } = resolveClientId(req.query.clientId);
    if (error) {
        res.status(400).json({ success: false, error });
        return;
    }

    const data = await database.getIncidents(limit, clientId);

    if (format === 'csv') {
        const csv = exportIncidentsToCSV(data);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="incidents-${Date.now()}.csv"`);
        res.send(csv);
    } else {
        res.json({ success: true, data });
    }
}));

router.get('/stats', validateStats, asyncHandler(async (req, res) => {
    const { format = 'csv' } = req.query;
    const hours = toNumber(req.query.hours, 24);
    const resolution = normalizeResolution(req.query.resolution, RESOLUTIONS.HOUR);
    const { clientId, error } = resolveClientId(req.query.clientId);
    if (error) {
        res.status(400).json({ success: false, error });
        return;
    }

    let stats;
    if (resolution === RESOLUTIONS.RAW) {
        const checkTypes = Object.values(CHECK_TYPES);
        stats = {};
        for (const checkType of checkTypes) {
            const detailedStats = await database.getDetailedStatistics(checkType, hours);
            if (!detailedStats) {
                stats[checkType] = buildDefaultStats(hours);
            } else {
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
        }
    } else {
        const bucketSize = aggregator.getBucketSize(resolution);
        const { from, to } = getWindowBounds(hours, bucketSize);
        const checkTypes = Object.values(CHECK_TYPES);

        await aggregator.ensureAggregates({
            resolution,
            clientId,
            from,
            to,
            checkTypes
        });

        stats = {};
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
    }

    if (format === 'csv') {
        const csv = exportStatsToCSV(stats);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="stats-${Date.now()}.csv"`);
        res.send(csv);
    } else {
        res.json({ success: true, data: stats });
    }
}));

module.exports = router;
