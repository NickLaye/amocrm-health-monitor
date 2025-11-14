/**
 * Unit tests for Database
 */

const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

// Mock logger
jest.mock('../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

describe('Database', () => {
  let database;
  const TEST_DB_PATH = path.join(__dirname, 'test_health_checks.db');

  beforeAll(async () => {
    // Override DB_PATH for testing
    jest.resetModules();
    jest.mock('path', () => {
      const actualPath = jest.requireActual('path');
      return {
        ...actualPath,
        join: jest.fn((...args) => {
          if (args.includes('health_checks.db')) {
            return TEST_DB_PATH;
          }
          return actualPath.join(...args);
        })
      };
    });
    
    database = require('../database');
    await database.initialize();
  });

  afterAll(async () => {
    // Clean up test database
    if (database.db) {
      database.db.close();
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(async () => {
    // Clear tables before each test
    await new Promise((resolve, reject) => {
      database.db.run('DELETE FROM health_checks', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      database.db.run('DELETE FROM incidents', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe('insertHealthCheck', () => {
    test('should insert health check successfully', async () => {
      const result = await database.insertHealthCheck('GET', 'up', 250, null);
      
      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
    });

    test('should insert health check with error message', async () => {
      const result = await database.insertHealthCheck('POST', 'down', 5000, 'Timeout error');
      
      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
    });
  });

  describe('getHealthChecks', () => {
    beforeEach(async () => {
      // Insert test data
      await database.insertHealthCheck('GET', 'up', 200);
      await database.insertHealthCheck('POST', 'up', 300);
      await database.insertHealthCheck('WEB', 'down', 5000, 'Error');
    });

    test('should get all health checks', async () => {
      const checks = await database.getHealthChecks(null, 24);
      
      expect(checks.length).toBeGreaterThan(0);
      expect(checks[0]).toHaveProperty('check_type');
      expect(checks[0]).toHaveProperty('status');
      expect(checks[0]).toHaveProperty('response_time');
    });

    test('should filter by check type', async () => {
      const checks = await database.getHealthChecks('GET', 24);
      
      expect(checks.every(c => c.check_type === 'GET')).toBe(true);
    });

    test('should return empty array for non-existent check type', async () => {
      const checks = await database.getHealthChecks('NONEXISTENT', 24);
      
      expect(checks).toEqual([]);
    });
  });

  describe('getAverageResponseTime', () => {
    beforeEach(async () => {
      // Insert test data
      await database.insertHealthCheck('GET', 'up', 200);
      await database.insertHealthCheck('GET', 'up', 300);
      await database.insertHealthCheck('GET', 'up', 400);
    });

    test('should calculate average response time', async () => {
      const result = await database.getAverageResponseTime('GET', 24);
      
      expect(result).toHaveProperty('average');
      expect(result).toHaveProperty('count');
      expect(result.average).toBeCloseTo(0.3, 1); // seconds
      expect(result.count).toBe(3);
    });

    test('should return 0 for no data', async () => {
      const result = await database.getAverageResponseTime('NONEXISTENT', 24);
      
      expect(result.average).toBe(0);
      expect(result.count).toBe(0);
    });
  });

  describe('getUptimePercentage', () => {
    beforeEach(async () => {
      // Insert test data: 8 up, 2 down = 80% uptime
      for (let i = 0; i < 8; i++) {
        await database.insertHealthCheck('GET', 'up', 200);
      }
      for (let i = 0; i < 2; i++) {
        await database.insertHealthCheck('GET', 'down', 5000, 'Error');
      }
    });

    test('should calculate uptime percentage', async () => {
      const result = await database.getUptimePercentage('GET', 24);
      
      expect(result).toHaveProperty('percentage');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('up');
      expect(result).toHaveProperty('down');
      expect(result.percentage).toBe(80);
      expect(result.total).toBe(10);
      expect(result.up).toBe(8);
      expect(result.down).toBe(2);
    });

    test('should return 100% for all up checks', async () => {
      const result = await database.getUptimePercentage('POST', 24);
      await database.insertHealthCheck('POST', 'up', 200);
      const result2 = await database.getUptimePercentage('POST', 24);
      
      expect(result2.percentage).toBe(100);
    });
  });

  describe('insertIncident', () => {
    test('should insert incident successfully', async () => {
      const now = Date.now();
      const result = await database.insertIncident('GET', now, 'Service is down');
      
      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
    });
  });

  describe('getOpenIncident', () => {
    test('should return null if no open incident', async () => {
      const incident = await database.getOpenIncident('GET');
      
      expect(incident).toBeNull();
    });

    test('should return open incident', async () => {
      const now = Date.now();
      await database.insertIncident('GET', now, 'Service down');
      
      const incident = await database.getOpenIncident('GET');
      
      expect(incident).toBeDefined();
      expect(incident.check_type).toBe('GET');
      expect(incident.end_time).toBeNull();
    });

    test('should not return closed incident', async () => {
      const now = Date.now();
      const result = await database.insertIncident('GET', now, 'Service down');
      await database.updateIncidentEndTime(result.id, now + 1000);
      
      const incident = await database.getOpenIncident('GET');
      
      expect(incident).toBeNull();
    });
  });

  describe('updateIncidentEndTime', () => {
    test('should update incident end time', async () => {
      const startTime = Date.now();
      const result = await database.insertIncident('GET', startTime, 'Service down');
      const endTime = startTime + 5000;
      
      await database.updateIncidentEndTime(result.id, endTime);
      
      const incident = await database.getOpenIncident('GET');
      expect(incident).toBeNull(); // Should be closed now
    });
  });

  describe('getIncidents', () => {
    beforeEach(async () => {
      // Insert test incidents
      const now = Date.now();
      await database.insertIncident('GET', now - 10000, 'Error 1');
      await database.insertIncident('POST', now - 5000, 'Error 2');
      await database.insertIncident('WEB', now, 'Error 3');
    });

    test('should get all incidents', async () => {
      const incidents = await database.getIncidents(100);
      
      expect(incidents.length).toBeGreaterThanOrEqual(3);
      expect(incidents[0]).toHaveProperty('check_type');
      expect(incidents[0]).toHaveProperty('start_time');
    });

    test('should respect limit', async () => {
      const incidents = await database.getIncidents(2);
      
      expect(incidents.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getAllOpenIncidents', () => {
    test('should return empty array if no open incidents', async () => {
      const incidents = await database.getAllOpenIncidents();
      
      expect(incidents).toEqual([]);
    });

    test('should return all open incidents', async () => {
      const now = Date.now();
      await database.insertIncident('GET', now, 'Error 1');
      await database.insertIncident('POST', now, 'Error 2');
      
      const incidents = await database.getAllOpenIncidents();
      
      expect(incidents.length).toBe(2);
      expect(incidents.every(i => i.end_time === null)).toBe(true);
    });

    test('should not return closed incidents', async () => {
      const now = Date.now();
      const result1 = await database.insertIncident('GET', now, 'Error 1');
      await database.insertIncident('POST', now, 'Error 2');
      
      // Close first incident
      await database.updateIncidentEndTime(result1.id, now + 1000);
      
      const incidents = await database.getAllOpenIncidents();
      
      expect(incidents.length).toBe(1);
      expect(incidents[0].check_type).toBe('POST');
    });
  });
});

