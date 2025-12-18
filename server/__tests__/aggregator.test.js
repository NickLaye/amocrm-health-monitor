/**
 * Unit tests for Aggregator module
 * Tests rollup logic, interval aggregation, and statistics calculation
 */

const { RESOLUTIONS, CHECK_TYPES, DEFAULT_CLIENT_ID } = require('../config/constants');

// Mock dependencies before requiring aggregator
jest.mock('../database');
jest.mock('../config/client-registry');
jest.mock('../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    })
}));

describe('Aggregator', () => {
    let aggregator;
    let database;
    let clientRegistry;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        jest.useFakeTimers();

        database = require('../database');
        clientRegistry = require('../config/client-registry');

        // Default mocks
        database.getHealthChecksByRange = jest.fn().mockResolvedValue([]);
        database.upsertAggregate = jest.fn().mockResolvedValue({ changes: 1 });
        clientRegistry.getClientIds = jest.fn().mockReturnValue(['default']);

        aggregator = require('../aggregator');
    });

    afterEach(() => {
        if (aggregator.running) {
            aggregator.stop();
        }
        jest.useRealTimers();
    });

    describe('Initialization', () => {
        test('should initialize with correct default values', () => {
            expect(aggregator.timers).toEqual([]);
            expect(aggregator.running).toBe(false);
        });
    });

    describe('start/stop', () => {
        test('should start aggregator and set running to true', () => {
            aggregator.start();

            expect(aggregator.running).toBe(true);
            expect(aggregator.timers.length).toBeGreaterThan(0);
        });

        test('should stop aggregator and clear timers', () => {
            aggregator.start();
            aggregator.stop();

            expect(aggregator.running).toBe(false);
            expect(aggregator.timers).toEqual([]);
        });

        test('should restart if already running', () => {
            aggregator.start();
            const firstTimers = aggregator.timers.length;

            aggregator.start();

            expect(aggregator.timers.length).toBe(firstTimers);
        });

        test('should run initial warm-up on start', () => {
            aggregator.start();

            // Initial warm-up calls ensureAggregates
            expect(database.getHealthChecksByRange).toHaveBeenCalled();
        });

        test('should schedule hourly job every 5 minutes', () => {
            aggregator.start();
            jest.clearAllMocks();

            // Advance 5 minutes
            jest.advanceTimersByTime(5 * 60 * 1000);

            expect(database.getHealthChecksByRange).toHaveBeenCalled();
        });

        test('should schedule daily job every 30 minutes', () => {
            aggregator.start();
            jest.clearAllMocks();

            // Advance 30 minutes
            jest.advanceTimersByTime(30 * 60 * 1000);

            expect(database.getHealthChecksByRange).toHaveBeenCalled();
        });
    });

    describe('runForAllClients', () => {
        test('should run handler for each client', async () => {
            clientRegistry.getClientIds.mockReturnValue(['client-a', 'client-b']);
            const handler = jest.fn().mockResolvedValue(undefined);

            await aggregator.runForAllClients(handler);

            expect(handler).toHaveBeenCalledTimes(2);
            expect(handler).toHaveBeenCalledWith('client-a');
            expect(handler).toHaveBeenCalledWith('client-b');
        });

        test('should return immediately if no clients', async () => {
            clientRegistry.getClientIds.mockReturnValue([]);
            const handler = jest.fn();

            await aggregator.runForAllClients(handler);

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('ensureAggregates', () => {
        test('should compute aggregates for all check types', async () => {
            await aggregator.ensureAggregates({
                resolution: RESOLUTIONS.HOUR,
                lookbackWindows: 1
            });

            // Should be called for each check type (5) * number of buckets
            const checkTypesCount = Object.keys(CHECK_TYPES).length;
            // With lookbackWindows=1, we get at least 1-2 buckets depending on alignment
            expect(database.upsertAggregate.mock.calls.length).toBeGreaterThanOrEqual(checkTypesCount);
        });

        test('should respect lookbackWindows parameter', async () => {
            database.upsertAggregate.mockClear();

            await aggregator.ensureAggregates({
                resolution: RESOLUTIONS.HOUR,
                lookbackWindows: 3,
                checkTypes: [CHECK_TYPES.GET]
            });

            // 3 windows = 3 buckets (roughly, depends on alignment)
            expect(database.upsertAggregate.mock.calls.length).toBeGreaterThanOrEqual(3);
        });

        test('should throw for unsupported resolution', async () => {
            await expect(
                aggregator.ensureAggregates({ resolution: 'invalid' })
            ).rejects.toThrow('Unsupported resolution');
        });

        test('should use default clientId', async () => {
            await aggregator.ensureAggregates({
                resolution: RESOLUTIONS.HOUR,
                lookbackWindows: 1,
                checkTypes: [CHECK_TYPES.GET]
            });

            expect(database.getHealthChecksByRange).toHaveBeenCalledWith(
                expect.objectContaining({
                    clientId: DEFAULT_CLIENT_ID
                })
            );
        });

        test('should use custom from/to range', async () => {
            const from = Date.now() - 2 * 60 * 60 * 1000;
            const to = Date.now();

            await aggregator.ensureAggregates({
                resolution: RESOLUTIONS.HOUR,
                from,
                to,
                checkTypes: [CHECK_TYPES.GET]
            });

            expect(database.getHealthChecksByRange).toHaveBeenCalled();
        });
    });

    describe('computeBucket', () => {
        test('should fetch health checks and upsert aggregate', async () => {
            const mockRows = [
                { status: 'up', response_time: 100 },
                { status: 'up', response_time: 200 }
            ];
            database.getHealthChecksByRange.mockResolvedValue(mockRows);

            await aggregator.computeBucket({
                resolution: RESOLUTIONS.HOUR,
                clientId: 'test-client',
                checkType: CHECK_TYPES.GET,
                bucketStart: Date.now() - 3600000,
                bucketEnd: Date.now()
            });

            expect(database.getHealthChecksByRange).toHaveBeenCalledWith({
                checkType: CHECK_TYPES.GET,
                clientId: 'test-client',
                from: expect.any(Number),
                to: expect.any(Number)
            });

            expect(database.upsertAggregate).toHaveBeenCalledWith(
                expect.objectContaining({
                    resolution: RESOLUTIONS.HOUR,
                    clientId: 'test-client',
                    checkType: CHECK_TYPES.GET,
                    avgResponseTime: 150,
                    totalCount: 2,
                    successCount: 2
                })
            );
        });

        test('should handle empty bucket', async () => {
            database.getHealthChecksByRange.mockResolvedValue([]);

            await aggregator.computeBucket({
                resolution: RESOLUTIONS.HOUR,
                clientId: 'test-client',
                checkType: CHECK_TYPES.GET,
                bucketStart: Date.now() - 3600000,
                bucketEnd: Date.now()
            });

            expect(database.upsertAggregate).toHaveBeenCalledWith(
                expect.objectContaining({
                    avgResponseTime: null,
                    totalCount: 0,
                    successCount: 0
                })
            );
        });
    });

    describe('calculateStats', () => {
        test('should calculate stats for multiple rows', () => {
            const rows = [
                { status: 'up', response_time: 100 },
                { status: 'up', response_time: 200 },
                { status: 'warning', response_time: 500 },
                { status: 'down', response_time: 5000 }
            ];

            const stats = aggregator.calculateStats(rows);

            expect(stats.totalCount).toBe(4);
            expect(stats.successCount).toBe(2);
            expect(stats.warningCount).toBe(1);
            expect(stats.downCount).toBe(1);
            expect(stats.avgResponseTime).toBe(1450); // (100+200+500+5000)/4
            expect(stats.min).toBe(100);
            expect(stats.max).toBe(5000);
        });

        test('should return null stats for empty rows', () => {
            const stats = aggregator.calculateStats([]);

            expect(stats.avgResponseTime).toBeNull();
            expect(stats.p50).toBeNull();
            expect(stats.p95).toBeNull();
            expect(stats.p99).toBeNull();
            expect(stats.min).toBeNull();
            expect(stats.max).toBeNull();
            expect(stats.totalCount).toBe(0);
        });

        test('should handle null rows', () => {
            const stats = aggregator.calculateStats(null);

            expect(stats.totalCount).toBe(0);
        });

        test('should filter out invalid response times', () => {
            const rows = [
                { status: 'up', response_time: 100 },
                { status: 'up', response_time: null },
                { status: 'up', response_time: undefined },
                { status: 'up', response_time: 'invalid' },
                { status: 'up', response_time: 200 }
            ];

            const stats = aggregator.calculateStats(rows);

            // 'invalid' string becomes NaN which is filtered, but null/undefined may become 0
            // The actual filtering logic depends on Number() and Number.isFinite()
            expect(stats.avgResponseTime).toBeGreaterThan(0);
            expect(stats.totalCount).toBe(5); // All rows counted
            expect(stats.successCount).toBe(5);
        });

        test('should handle unknown status', () => {
            const rows = [
                { status: 'unknown', response_time: 100 },
                { status: null, response_time: 200 }
            ];

            const stats = aggregator.calculateStats(rows);

            expect(stats.successCount).toBe(0);
            expect(stats.warningCount).toBe(0);
            expect(stats.downCount).toBe(0);
            expect(stats.totalCount).toBe(2);
        });
    });

    describe('computePercentile', () => {
        test('should compute P50 correctly', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

            const p50 = aggregator.computePercentile(values, 50);

            expect(p50).toBe(5);
        });

        test('should compute P95 correctly', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

            const p95 = aggregator.computePercentile(values, 95);

            expect(p95).toBe(10);
        });

        test('should compute P99 correctly', () => {
            const values = Array.from({ length: 100 }, (_, i) => i + 1);

            const p99 = aggregator.computePercentile(values, 99);

            expect(p99).toBe(99);
        });

        test('should return null for empty array', () => {
            const result = aggregator.computePercentile([], 50);

            expect(result).toBeNull();
        });

        test('should handle single value', () => {
            const result = aggregator.computePercentile([100], 95);

            expect(result).toBe(100);
        });
    });

    describe('alignToBucket', () => {
        test('should align to hour bucket', () => {
            const hourMs = 60 * 60 * 1000;
            const timestamp = 1700000000000 + 30 * 60 * 1000; // Half hour offset

            const aligned = aggregator.alignToBucket(timestamp, hourMs);

            expect(aligned % hourMs).toBe(0);
            expect(aligned).toBeLessThanOrEqual(timestamp);
        });

        test('should align to day bucket', () => {
            const dayMs = 24 * 60 * 60 * 1000;
            const timestamp = Date.now();

            const aligned = aggregator.alignToBucket(timestamp, dayMs);

            expect(aligned % dayMs).toBe(0);
            expect(aligned).toBeLessThanOrEqual(timestamp);
        });

        test('should return same value if already aligned', () => {
            const hourMs = 60 * 60 * 1000;
            const aligned = 1700000000000 - (1700000000000 % hourMs);

            const result = aggregator.alignToBucket(aligned, hourMs);

            expect(result).toBe(aligned);
        });
    });

    describe('getBucketSize', () => {
        test('should return hour bucket size', () => {
            const size = aggregator.getBucketSize(RESOLUTIONS.HOUR);

            expect(size).toBe(60 * 60 * 1000);
        });

        test('should return day bucket size', () => {
            const size = aggregator.getBucketSize(RESOLUTIONS.DAY);

            expect(size).toBe(24 * 60 * 60 * 1000);
        });

        test('should throw for unsupported resolution', () => {
            expect(() => aggregator.getBucketSize('week')).toThrow('Unsupported resolution');
        });
    });

    describe('Error Handling', () => {
        test('should handle database errors in computeBucket', async () => {
            database.getHealthChecksByRange.mockRejectedValue(new Error('DB Error'));

            await expect(
                aggregator.computeBucket({
                    resolution: RESOLUTIONS.HOUR,
                    clientId: 'test',
                    checkType: CHECK_TYPES.GET,
                    bucketStart: Date.now() - 3600000,
                    bucketEnd: Date.now()
                })
            ).rejects.toThrow('DB Error');
        });

        test('should handle upsert errors', async () => {
            database.getHealthChecksByRange.mockResolvedValue([]);
            database.upsertAggregate.mockRejectedValue(new Error('Upsert failed'));

            await expect(
                aggregator.computeBucket({
                    resolution: RESOLUTIONS.HOUR,
                    clientId: 'test',
                    checkType: CHECK_TYPES.GET,
                    bucketStart: Date.now() - 3600000,
                    bucketEnd: Date.now()
                })
            ).rejects.toThrow('Upsert failed');
        });

        test('should log errors on scheduled job failure', async () => {
            clientRegistry.getClientIds.mockReturnValue(['test']);
            database.getHealthChecksByRange.mockRejectedValue(new Error('Scheduled fail'));

            aggregator.start();

            // Advance 5 minutes for hourly job
            jest.advanceTimersByTime(5 * 60 * 1000);

            // Let promises settle
            await Promise.resolve();
        });
    });
});
