/**
 * Integration tests for API endpoints
 */

const request = require('supertest');
const express = require('express');

// Mock dependencies before requiring modules
jest.mock('../database');
jest.mock('../monitor');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

const database = require('../database');
const monitor = require('../monitor');
const apiRouter = require('../api');

describe('API Integration Tests', () => {
  let app;

  beforeAll(() => {
    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api', apiRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mocks
    monitor.getStatus = jest.fn().mockReturnValue({
      GET: {
        status: 'up',
        responseTime: 250,
        lastCheck: Date.now(),
        errorMessage: null
      },
      POST: {
        status: 'up',
        responseTime: 300,
        lastCheck: Date.now(),
        errorMessage: null
      },
      WEB: {
        status: 'up',
        responseTime: 200,
        lastCheck: Date.now(),
        errorMessage: null
      },
      HOOK: {
        status: 'up',
        responseTime: 150,
        lastCheck: Date.now(),
        errorMessage: null
      },
      DP: {
        status: 'up',
        responseTime: 500,
        lastCheck: Date.now(),
        errorMessage: null
      }
    });

    monitor.getLastCheckTime = jest.fn().mockReturnValue(Date.now());
    monitor.isHealthy = jest.fn().mockReturnValue(true);
  });

  describe('GET /api/status', () => {
    test('should return current status of all services', async () => {
      const response = await request(app)
        .get('/api/status')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('GET');
      expect(response.body.data).toHaveProperty('POST');
      expect(response.body.data.GET).toHaveProperty('status', 'up');
    });
  });

  describe('GET /api/history', () => {
    beforeEach(() => {
      database.getHealthChecks = jest.fn().mockResolvedValue([
        {
          id: 1,
          timestamp: Date.now(),
          check_type: 'GET',
          status: 'up',
          response_time: 250
        },
        {
          id: 2,
          timestamp: Date.now(),
          check_type: 'POST',
          status: 'up',
          response_time: 300
        }
      ]);
    });

    test('should return health check history', async () => {
      const response = await request(app)
        .get('/api/history')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should accept hours parameter', async () => {
      const response = await request(app)
        .get('/api/history?hours=12')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(database.getHealthChecks).toHaveBeenCalledWith(null, 12);
    });

    test('should accept checkType parameter', async () => {
      const response = await request(app)
        .get('/api/history?checkType=GET')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(database.getHealthChecks).toHaveBeenCalledWith('GET', 24);
    });

    test('should reject invalid hours parameter', async () => {
      const response = await request(app)
        .get('/api/history?hours=9999')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    });

    test('should reject invalid checkType parameter', async () => {
      const response = await request(app)
        .get('/api/history?checkType=INVALID')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/incidents', () => {
    beforeEach(() => {
      database.getIncidents = jest.fn().mockResolvedValue([
        {
          id: 1,
          check_type: 'GET',
          start_time: Date.now() - 10000,
          end_time: Date.now(),
          duration: 10000,
          details: 'Timeout error'
        }
      ]);
    });

    test('should return incidents', async () => {
      const response = await request(app)
        .get('/api/incidents')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should accept limit parameter', async () => {
      const response = await request(app)
        .get('/api/incidents?limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(database.getIncidents).toHaveBeenCalledWith(10);
    });

    test('should reject invalid limit', async () => {
      const response = await request(app)
        .get('/api/incidents?limit=9999')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/stats', () => {
    beforeEach(() => {
      database.getAverageResponseTime = jest.fn().mockResolvedValue({
        average: 0.25,
        count: 100
      });
      
      database.getUptimePercentage = jest.fn().mockResolvedValue({
        percentage: 99.5,
        total: 100,
        up: 99,
        down: 1
      });
      
      database.getPercentileResponseTime = jest.fn().mockResolvedValue({
        value: 0.5
      });
      
      database.getResponseTimeStats = jest.fn().mockResolvedValue({
        min: 0.1,
        max: 1.0,
        median: 0.3
      });
      
      database.getMTTR = jest.fn().mockResolvedValue({
        mttr: 300
      });
      
      database.getMTBF = jest.fn().mockResolvedValue({
        mtbf: 7200
      });
      
      database.getChecksUnderThreshold = jest.fn().mockResolvedValue(80);
      database.getChecksInRange = jest.fn().mockResolvedValue(15);
    });

    test('should return statistics for all check types', async () => {
      const response = await request(app)
        .get('/api/stats')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('period');
      
      const data = response.body.data;
      expect(data).toHaveProperty('GET');
      expect(data).toHaveProperty('POST');
      
      // Check that GET stats have all required fields
      expect(data.GET).toHaveProperty('averageResponseTime');
      expect(data.GET).toHaveProperty('uptime');
      expect(data.GET).toHaveProperty('errorRate');
      expect(data.GET).toHaveProperty('percentile95');
      expect(data.GET).toHaveProperty('mttr');
      expect(data.GET).toHaveProperty('mtbf');
      expect(data.GET).toHaveProperty('apdex');
    });

    test('should accept hours parameter', async () => {
      const response = await request(app)
        .get('/api/stats?hours=12')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.period).toBe('12 hours');
    });

    test('should reject invalid hours parameter', async () => {
      const response = await request(app)
        .get('/api/stats?hours=9999')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/health', () => {
    test('should return healthy status when monitoring is functioning', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('status', 'healthy');
      expect(response.body.data).toHaveProperty('lastCheck');
      expect(response.body.data).toHaveProperty('uptimeSeconds');
    });

    test('should return unhealthy status when monitoring is not functioning', async () => {
      monitor.isHealthy.mockReturnValue(false);
      monitor.getLastCheckTime.mockReturnValue(null);

      const response = await request(app)
        .get('/api/health')
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.data.status).toBe('unhealthy');
    });
  });

  describe('Error handling', () => {
    test('should handle database errors gracefully', async () => {
      database.getHealthChecks.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/history')
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    test('should handle missing parameters', async () => {
      const response = await request(app)
        .get('/api/history?hours=invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    });
  });
});

