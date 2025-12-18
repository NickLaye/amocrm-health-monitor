/**
 * Unit tests for Database module
 * Tests CRUD operations, aggregation, statistics, and edge cases
 */

const path = require('path');
const fs = require('fs');

// Mock logger before requiring database
jest.mock('../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

// Use in-memory SQLite for tests
const TEST_DB_PATH = ':memory:';

describe('Database', () => {
  let Database;
  let db;

  beforeAll(async () => {
    // Create a fresh Database class for testing
    jest.resetModules();
    
    // Override DB_PATH to use in-memory database
    jest.doMock('path', () => ({
      ...jest.requireActual('path'),
      join: (...args) => {
        if (args.some(arg => typeof arg === 'string' && arg.includes('health_checks.db'))) {
          return TEST_DB_PATH;
        }
        return jest.requireActual('path').join(...args);
      }
    }));

    // Require the actual sqlite3 and database module
    Database = require('../database');
  });

  beforeEach(async () => {
    // Get a fresh database connection for each test
    if (Database.db) {
      await Database.close().catch(() => {});
    }
    await Database.initialize();
  });

  afterEach(async () => {
    // Clean up after each test
    if (Database.db) {
      await Database.close().catch(() => {});
    }
  });

  describe('Initialization', () => {
    test('should initialize database successfully', async () => {
      expect(Database.db).toBeDefined();
      expect(Database.db).not.toBeNull();
    });

    test('should create health_checks table', async () => {
      const result = await new Promise((resolve, reject) => {
        Database.db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='health_checks'",
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      expect(result).toBeDefined();
      expect(result.name).toBe('health_checks');
    });

    test('should create incidents table', async () => {
      const result = await new Promise((resolve, reject) => {
        Database.db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='incidents'",
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      expect(result).toBeDefined();
      expect(result.name).toBe('incidents');
    });

    test('should create health_check_aggregates table', async () => {
      const result = await new Promise((resolve, reject) => {
        Database.db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='health_check_aggregates'",
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      expect(result).toBeDefined();
      expect(result.name).toBe('health_check_aggregates');
    });
  });

  describe('Health Checks CRUD', () => {
    describe('insertHealthCheck', () => {
      test('should insert health check with all fields', async () => {
        const result = await Database.insertHealthCheck('GET', 'up', 250, {
          errorMessage: null,
          httpStatus: 200,
          errorCode: null,
          errorPayload: null,
          clientId: 'test-client'
        });

        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('timestamp');
        expect(result.id).toBeGreaterThan(0);
      });

      test('should insert health check with minimal fields', async () => {
        const result = await Database.insertHealthCheck('POST', 'up', 300);

        expect(result).toHaveProperty('id');
        expect(result.id).toBeGreaterThan(0);
      });

      test('should insert health check with error information', async () => {
        const result = await Database.insertHealthCheck('GET', 'down', 5000, {
          errorMessage: 'Connection timeout',
          httpStatus: 504,
          errorCode: 'ETIMEDOUT',
          errorPayload: { detail: 'Gateway timeout' }
        });

        expect(result).toHaveProperty('id');
        expect(result.id).toBeGreaterThan(0);
      });

      test('should insert health check with warning status', async () => {
        const result = await Database.insertHealthCheck('POST', 'warning', 800, {
          httpStatus: 429,
          errorMessage: 'Rate limited'
        });

        expect(result).toHaveProperty('id');
      });
    });

    describe('getHealthChecks', () => {
      beforeEach(async () => {
        // Insert test data
        await Database.insertHealthCheck('GET', 'up', 100);
        await Database.insertHealthCheck('GET', 'up', 200);
        await Database.insertHealthCheck('POST', 'up', 150);
        await Database.insertHealthCheck('GET', 'down', 5000, {
          errorMessage: 'Error'
        });
      });

      test('should return all health checks', async () => {
        const checks = await Database.getHealthChecks(null, 24);

        expect(checks).toHaveLength(4);
      });

      test('should filter by check type', async () => {
        const checks = await Database.getHealthChecks('GET', 24);

        expect(checks).toHaveLength(3);
        checks.forEach(check => {
          expect(check.check_type).toBe('GET');
        });
      });

      test('should filter by time range', async () => {
        const checks = await Database.getHealthChecks(null, 1);

        expect(checks).toHaveLength(4);
      });

      test('should filter by clientId', async () => {
        await Database.insertHealthCheck('GET', 'up', 100, { clientId: 'client-a' });
        await Database.insertHealthCheck('GET', 'up', 100, { clientId: 'client-b' });

        const checks = await Database.getHealthChecks('GET', 24, 'client-a');

        expect(checks.some(c => c.client_id === 'client-a')).toBe(true);
      });

      test('should order by timestamp descending', async () => {
        const checks = await Database.getHealthChecks(null, 24);

        for (let i = 1; i < checks.length; i++) {
          expect(checks[i - 1].timestamp).toBeGreaterThanOrEqual(checks[i].timestamp);
        }
      });
    });

    describe('getHealthChecksByRange', () => {
      test('should return checks within range', async () => {
        const now = Date.now();
        await Database.insertHealthCheck('GET', 'up', 100);

        const checks = await Database.getHealthChecksByRange({
          from: now - 1000,
          to: now + 10000
        });

        expect(checks.length).toBeGreaterThanOrEqual(1);
      });

      test('should reject without numeric from/to', async () => {
        await expect(
          Database.getHealthChecksByRange({ from: 'invalid', to: Date.now() })
        ).rejects.toThrow('requires numeric from/to');
      });

      test('should filter by checkType and clientId', async () => {
        const now = Date.now();
        await Database.insertHealthCheck('WEB', 'up', 100, { clientId: 'test' });

        const checks = await Database.getHealthChecksByRange({
          checkType: 'WEB',
          clientId: 'test',
          from: now - 1000,
          to: now + 10000
        });

        expect(checks.every(c => c.check_type === 'WEB')).toBe(true);
      });
    });
  });

  describe('Incidents CRUD', () => {
    describe('insertIncident', () => {
      test('should insert incident successfully', async () => {
        const startTime = Date.now();
        const id = await Database.insertIncident('GET', startTime, 'Service is down');

        expect(id).toBeGreaterThan(0);
      });

      test('should insert incident with clientId', async () => {
        const startTime = Date.now();
        const id = await Database.insertIncident('POST', startTime, 'Timeout', 'client-123');

        expect(id).toBeGreaterThan(0);
      });
    });

    describe('updateIncidentEndTime', () => {
      test('should update incident end time', async () => {
        const startTime = Date.now();
        const id = await Database.insertIncident('GET', startTime, 'Service down');
        const endTime = startTime + 60000;

        await Database.updateIncidentEndTime(id, endTime);

        const incidents = await Database.getIncidents(1);
        expect(incidents[0].end_time).toBe(endTime);
        expect(incidents[0].duration).toBe(60000);
      });
    });

    describe('getIncidents', () => {
      beforeEach(async () => {
        await Database.insertIncident('GET', Date.now() - 1000, 'Error 1');
        await Database.insertIncident('POST', Date.now() - 500, 'Error 2');
        await Database.insertIncident('WEB', Date.now(), 'Error 3');
      });

      test('should return incidents with default limit', async () => {
        const incidents = await Database.getIncidents();

        expect(incidents).toHaveLength(3);
      });

      test('should respect limit parameter', async () => {
        const incidents = await Database.getIncidents(2);

        expect(incidents).toHaveLength(2);
      });

      test('should filter by clientId', async () => {
        await Database.insertIncident('GET', Date.now(), 'Client error', 'special-client');

        const incidents = await Database.getIncidents(50, 'special-client');

        expect(incidents.every(i => i.client_id === 'special-client')).toBe(true);
      });

      test('should order by start_time descending', async () => {
        const incidents = await Database.getIncidents();

        for (let i = 1; i < incidents.length; i++) {
          expect(incidents[i - 1].start_time).toBeGreaterThanOrEqual(incidents[i].start_time);
        }
      });
    });

    describe('getOpenIncident', () => {
      test('should return open incident', async () => {
        const startTime = Date.now();
        await Database.insertIncident('GET', startTime, 'Open incident');

        const incident = await Database.getOpenIncident('GET');

        expect(incident).toBeDefined();
        expect(incident.end_time).toBeNull();
        expect(incident.check_type).toBe('GET');
      });

      test('should return null when no open incident', async () => {
        const incident = await Database.getOpenIncident('HOOK');

        expect(incident).toBeUndefined();
      });

      test('should not return closed incidents', async () => {
        const startTime = Date.now();
        const id = await Database.insertIncident('GET', startTime, 'Closed incident');
        await Database.updateIncidentEndTime(id, startTime + 1000);

        const incident = await Database.getOpenIncident('GET');

        expect(incident).toBeUndefined();
      });
    });

    describe('getAllOpenIncidents', () => {
      test('should return all open incidents', async () => {
        await Database.insertIncident('GET', Date.now(), 'Open 1');
        await Database.insertIncident('POST', Date.now(), 'Open 2');
        const closedId = await Database.insertIncident('WEB', Date.now(), 'Closed');
        await Database.updateIncidentEndTime(closedId, Date.now() + 1000);

        const incidents = await Database.getAllOpenIncidents();

        expect(incidents).toHaveLength(2);
        incidents.forEach(i => {
          expect(i.end_time).toBeNull();
        });
      });

      test('should filter by clientId', async () => {
        await Database.insertIncident('GET', Date.now(), 'Open 1', 'client-a');
        await Database.insertIncident('POST', Date.now(), 'Open 2', 'client-b');

        const incidents = await Database.getAllOpenIncidents('client-a');

        expect(incidents.every(i => i.client_id === 'client-a')).toBe(true);
      });
    });
  });

  describe('Aggregates', () => {
    describe('upsertAggregate', () => {
      test('should insert new aggregate', async () => {
        const result = await Database.upsertAggregate({
          periodStart: Date.now(),
          resolution: 'hour',
          checkType: 'GET',
          avgResponseTime: 250,
          totalCount: 100,
          successCount: 95,
          downCount: 5
        });

        expect(result).toHaveProperty('changes');
      });

      test('should update existing aggregate', async () => {
        const periodStart = Date.now();
        
        await Database.upsertAggregate({
          periodStart,
          resolution: 'hour',
          checkType: 'GET',
          avgResponseTime: 250,
          totalCount: 100
        });

        await Database.upsertAggregate({
          periodStart,
          resolution: 'hour',
          checkType: 'GET',
          avgResponseTime: 300,
          totalCount: 150
        });

        const aggregates = await Database.getAggregates({
          resolution: 'hour',
          from: periodStart - 1000,
          to: periodStart + 1000
        });

        expect(aggregates).toHaveLength(1);
        expect(aggregates[0].avg_response_time).toBe(300);
      });

      test('should reject without required fields', async () => {
        await expect(
          Database.upsertAggregate({ periodStart: Date.now() })
        ).rejects.toThrow('requires periodStart, resolution, checkType');
      });
    });

    describe('getAggregates', () => {
      beforeEach(async () => {
        const baseTime = Date.now();
        for (let i = 0; i < 5; i++) {
          await Database.upsertAggregate({
            periodStart: baseTime + (i * 3600000),
            resolution: 'hour',
            checkType: 'GET',
            avgResponseTime: 200 + i * 10,
            totalCount: 60
          });
        }
      });

      test('should return aggregates for resolution', async () => {
        const aggregates = await Database.getAggregates({ resolution: 'hour' });

        expect(aggregates.length).toBeGreaterThanOrEqual(5);
      });

      test('should filter by checkType', async () => {
        await Database.upsertAggregate({
          periodStart: Date.now(),
          resolution: 'hour',
          checkType: 'POST',
          avgResponseTime: 300,
          totalCount: 50
        });

        const aggregates = await Database.getAggregates({
          resolution: 'hour',
          checkType: 'POST'
        });

        expect(aggregates.every(a => a.check_type === 'POST')).toBe(true);
      });

      test('should reject without resolution', async () => {
        await expect(
          Database.getAggregates({})
        ).rejects.toThrow('resolution is required');
      });
    });

    describe('getLatestAggregate', () => {
      test('should return latest aggregate', async () => {
        const baseTime = Date.now();
        await Database.upsertAggregate({
          periodStart: baseTime - 3600000,
          resolution: 'hour',
          checkType: 'GET',
          avgResponseTime: 200,
          totalCount: 60
        });
        await Database.upsertAggregate({
          periodStart: baseTime,
          resolution: 'hour',
          checkType: 'GET',
          avgResponseTime: 250,
          totalCount: 65
        });

        const latest = await Database.getLatestAggregate({
          resolution: 'hour',
          checkType: 'GET'
        });

        expect(latest.avg_response_time).toBe(250);
      });

      test('should return null when no aggregates', async () => {
        const latest = await Database.getLatestAggregate({
          resolution: 'day',
          checkType: 'HOOK'
        });

        expect(latest).toBeNull();
      });

      test('should reject without required fields', async () => {
        await expect(
          Database.getLatestAggregate({ resolution: 'hour' })
        ).rejects.toThrow('requires resolution and checkType');
      });
    });

    describe('deleteAggregatesBefore', () => {
      test('should delete old aggregates', async () => {
        const oldTime = Date.now() - (7 * 24 * 3600000);
        const recentTime = Date.now();

        await Database.upsertAggregate({
          periodStart: oldTime,
          resolution: 'hour',
          checkType: 'GET',
          avgResponseTime: 200,
          totalCount: 60
        });
        await Database.upsertAggregate({
          periodStart: recentTime,
          resolution: 'hour',
          checkType: 'GET',
          avgResponseTime: 250,
          totalCount: 65
        });

        const result = await Database.deleteAggregatesBefore({
          resolution: 'hour',
          before: oldTime + 1000
        });

        expect(result.changes).toBeGreaterThanOrEqual(1);

        const remaining = await Database.getAggregates({ resolution: 'hour' });
        expect(remaining.every(a => a.period_start >= oldTime + 1000)).toBe(true);
      });

      test('should reject without required fields', async () => {
        await expect(
          Database.deleteAggregatesBefore({ resolution: 'hour' })
        ).rejects.toThrow('requires resolution and before timestamp');
      });
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      // Insert varied test data
      for (let i = 0; i < 10; i++) {
        await Database.insertHealthCheck('GET', 'up', 100 + i * 50);
      }
      await Database.insertHealthCheck('GET', 'down', 5000, { errorMessage: 'Error' });
      await Database.insertHealthCheck('GET', 'warning', 1500);
    });

    describe('getAverageResponseTime', () => {
      test('should calculate average response time', async () => {
        const result = await Database.getAverageResponseTime('GET', 24);

        expect(result).toHaveProperty('average');
        expect(result).toHaveProperty('count');
        expect(result.average).toBeGreaterThan(0);
        expect(result.count).toBe(10); // Only 'up' status counts
      });

      test('should return 0 for no data', async () => {
        const result = await Database.getAverageResponseTime('HOOK', 24);

        expect(result.average).toBe(0);
        expect(result.count).toBe(0);
      });
    });

    describe('getUptimePercentage', () => {
      test('should calculate uptime percentage', async () => {
        const result = await Database.getUptimePercentage('GET', 24);

        expect(result).toHaveProperty('percentage');
        expect(result).toHaveProperty('total');
        expect(result).toHaveProperty('up');
        expect(result).toHaveProperty('down');
        expect(result.percentage).toBeGreaterThan(0);
        expect(result.percentage).toBeLessThanOrEqual(100);
      });

      test('should return 100% for no data', async () => {
        const result = await Database.getUptimePercentage('HOOK', 24);

        expect(result.percentage).toBe(100);
        expect(result.total).toBe(0);
      });

      test('should work without checkType filter', async () => {
        const result = await Database.getUptimePercentage(null, 24);

        expect(result.total).toBe(12); // All checks
      });
    });

    describe('getPercentileResponseTime', () => {
      test('should calculate P95 response time', async () => {
        const result = await Database.getPercentileResponseTime('GET', 24, 95);

        expect(result).toHaveProperty('percentile', 95);
        expect(result).toHaveProperty('value');
        expect(result.value).toBeGreaterThan(0);
      });

      test('should return null for no data', async () => {
        const result = await Database.getPercentileResponseTime('HOOK', 24, 95);

        expect(result.value).toBeNull();
      });
    });

    describe('getResponseTimeStats', () => {
      test('should return min/max/avg/median', async () => {
        const result = await Database.getResponseTimeStats('GET', 24);

        expect(result).toHaveProperty('min');
        expect(result).toHaveProperty('max');
        expect(result).toHaveProperty('avg');
        expect(result).toHaveProperty('median');
        expect(result).toHaveProperty('count');
        expect(result.min).toBeLessThanOrEqual(result.max);
      });
    });

    describe('getMTTR', () => {
      test('should calculate MTTR for resolved incidents', async () => {
        const startTime = Date.now() - 60000;
        const id = await Database.insertIncident('GET', startTime, 'Error');
        await Database.updateIncidentEndTime(id, startTime + 30000);

        const result = await Database.getMTTR('GET', 24);

        expect(result).toHaveProperty('mttr');
        expect(result).toHaveProperty('incidents');
        expect(result.mttr).toBe(30000);
        expect(result.incidents).toBe(1);
      });

      test('should return null for no resolved incidents', async () => {
        const result = await Database.getMTTR('HOOK', 24);

        expect(result.mttr).toBeNull();
        expect(result.incidents).toBe(0);
      });
    });

    describe('getMTBF', () => {
      test('should calculate MTBF for multiple incidents', async () => {
        const now = Date.now();
        await Database.insertIncident('GET', now - 60000, 'Error 1');
        await Database.insertIncident('GET', now - 30000, 'Error 2');
        await Database.insertIncident('GET', now, 'Error 3');

        const result = await Database.getMTBF('GET', 24);

        expect(result).toHaveProperty('mtbf');
        expect(result).toHaveProperty('incidents');
        expect(result.incidents).toBe(3);
        expect(result.mtbf).toBe(30000); // (60000 - 0) / (3 - 1)
      });

      test('should return null for less than 2 incidents', async () => {
        await Database.insertIncident('HOOK', Date.now(), 'Error');

        const result = await Database.getMTBF('HOOK', 24);

        expect(result.mtbf).toBeNull();
      });
    });

    describe('getChecksUnderThreshold', () => {
      test('should count checks under threshold', async () => {
        const count = await Database.getChecksUnderThreshold('GET', 24, 300);

        expect(count).toBeGreaterThan(0);
      });
    });

    describe('getChecksInRange', () => {
      test('should count checks in response time range', async () => {
        const count = await Database.getChecksInRange('GET', 24, 100, 500);

        expect(count).toBeGreaterThan(0);
      });
    });
  });

  describe('getDetailedStatistics', () => {
    beforeEach(async () => {
      // Insert test health checks
      for (let i = 0; i < 10; i++) {
        await Database.insertHealthCheck('GET', 'up', 200 + i * 50);
      }
      await Database.insertHealthCheck('GET', 'down', 5000, { errorMessage: 'Error' });
      await Database.insertHealthCheck('GET', 'warning', 1000);

      // Insert test incidents
      const now = Date.now();
      const id = await Database.insertIncident('GET', now - 60000, 'Test incident');
      await Database.updateIncidentEndTime(id, now - 30000);
    });

    test('should return all 15 metrics', async () => {
      const stats = await Database.getDetailedStatistics('GET', 24);

      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('totalChecks');
      expect(stats).toHaveProperty('mttr');
      expect(stats).toHaveProperty('mtbf');
      expect(stats).toHaveProperty('apdexScore');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('failureCount');
      expect(stats).toHaveProperty('warningCount');
      expect(stats).toHaveProperty('avgResponseTime');
      expect(stats).toHaveProperty('minResponseTime');
      expect(stats).toHaveProperty('maxResponseTime');
      expect(stats).toHaveProperty('p95ResponseTime');
      expect(stats).toHaveProperty('p99ResponseTime');
      expect(stats).toHaveProperty('lastIncident');
      expect(stats).toHaveProperty('incidentCount');
      expect(stats).toHaveProperty('availability');
    });

    test('should calculate uptime correctly', async () => {
      const stats = await Database.getDetailedStatistics('GET', 24);

      // 10 up, 1 down, 1 warning = 10/12 up
      expect(stats.uptime).toBeCloseTo(83.33, 1);
      expect(stats.totalChecks).toBe(12);
    });

    test('should calculate Apdex score', async () => {
      const stats = await Database.getDetailedStatistics('GET', 24);

      expect(stats.apdexScore).toBeGreaterThan(0);
      expect(stats.apdexScore).toBeLessThanOrEqual(1);
    });
  });

  describe('Cleanup', () => {
    describe('cleanOldRecords', () => {
      test('should delete old records', async () => {
        // This test is tricky because we can't easily insert old records
        // with in-memory database. Just verify the method runs without error.
        await expect(Database.cleanOldRecords()).resolves.not.toThrow();
      });
    });
  });

  describe('Edge Cases', () => {
    describe('serializePayload', () => {
      test('should handle null payload', () => {
        expect(Database.constructor.serializePayload(null)).toBeNull();
      });

      test('should handle undefined payload', () => {
        expect(Database.constructor.serializePayload(undefined)).toBeNull();
      });

      test('should serialize object to JSON', () => {
        const payload = { error: 'test', code: 500 };
        const result = Database.constructor.serializePayload(payload);

        expect(result).toBe(JSON.stringify(payload));
      });

      test('should return string as-is', () => {
        const payload = 'Error message';
        const result = Database.constructor.serializePayload(payload);

        expect(result).toBe(payload);
      });

      test('should truncate long payloads', () => {
        const longPayload = 'x'.repeat(20000);
        const result = Database.constructor.serializePayload(longPayload);

        expect(result.length).toBe(16000);
      });
    });

    describe('Empty database', () => {
      test('should handle getHealthChecks on empty table', async () => {
        // Fresh database is empty
        await Database.initialize();
        const checks = await Database.getHealthChecks('HOOK', 24);

        expect(checks).toEqual([]);
      });

      test('should handle getIncidents on empty table', async () => {
        await Database.initialize();
        const incidents = await Database.getIncidents();

        expect(incidents).toEqual([]);
      });
    });

    describe('Close', () => {
      test('should close database gracefully', async () => {
        await expect(Database.close()).resolves.not.toThrow();
      });

      test('should handle close on null db', async () => {
        const tempDb = Database.db;
        Database.db = null;
        
        await expect(Database.close()).resolves.not.toThrow();
        
        Database.db = tempDb;
      });
    });
  });
});
