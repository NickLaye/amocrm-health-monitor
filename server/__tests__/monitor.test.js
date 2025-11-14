/**
 * Unit tests for Monitor
 */

const { STATUS, CHECK_TYPES } = require('../config/constants');

// Mock dependencies
jest.mock('../database');
jest.mock('../notifications');
jest.mock('../token-manager');
jest.mock('../metrics');
jest.mock('../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })
}));

const database = require('../database');
const notifications = require('../notifications');
const tokenManager = require('../token-manager');

describe('Monitor', () => {
  let monitor;

  beforeEach(() => {
    // Reset modules and mocks
    jest.resetModules();
    jest.clearAllMocks();
    
    // Setup default mocks
    database.insertHealthCheck = jest.fn().mockResolvedValue({ id: 1 });
    database.insertIncident = jest.fn().mockResolvedValue({ id: 1 });
    database.updateIncidentEndTime = jest.fn().mockResolvedValue();
    database.getOpenIncident = jest.fn().mockResolvedValue(null);
    database.getAllOpenIncidents = jest.fn().mockResolvedValue([]);
    
    notifications.sendDownNotification = jest.fn().mockResolvedValue();
    notifications.sendUpNotification = jest.fn().mockResolvedValue();
    
    tokenManager.getAccessToken = jest.fn().mockResolvedValue('test_token');
    
    // Set required environment variables
    process.env.AMOCRM_DOMAIN = 'test.amocrm.ru';
    process.env.CHECK_INTERVAL = '30000';
    process.env.TIMEOUT_THRESHOLD = '10000';
    
    // Require monitor after mocks are set up
    monitor = require('../monitor');
  });

  afterEach(() => {
    if (monitor.intervalId) {
      monitor.stop();
    }
  });

  describe('Initialization', () => {
    test('should initialize with correct default values', () => {
      expect(monitor.domain).toBe('test.amocrm.ru');
      expect(monitor.checkInterval).toBe(30000);
      expect(monitor.timeoutThreshold).toBe(10000);
    });

    test('should initialize status for all check types', () => {
      const status = monitor.getStatus();
      
      expect(status).toHaveProperty(CHECK_TYPES.GET);
      expect(status).toHaveProperty(CHECK_TYPES.POST);
      expect(status).toHaveProperty(CHECK_TYPES.WEB);
      expect(status).toHaveProperty(CHECK_TYPES.HOOK);
      expect(status).toHaveProperty(CHECK_TYPES.DP);
      
      Object.values(status).forEach(s => {
        expect(s.status).toBe(STATUS.UNKNOWN);
        expect(s.responseTime).toBeNull();
        expect(s.lastCheck).toBeNull();
      });
    });
  });

  describe('updateStatus', () => {
    test('should update status correctly', async () => {
      await monitor.updateStatus(CHECK_TYPES.GET, STATUS.UP, 250, null);
      
      const status = monitor.getStatus();
      expect(status.GET.status).toBe(STATUS.UP);
      expect(status.GET.responseTime).toBe(250);
      expect(status.GET.lastCheck).toBeDefined();
      expect(status.GET.errorMessage).toBeNull();
    });

    test('should create incident when status goes down', async () => {
      // First set to unknown (initial state)
      monitor.currentStatus[CHECK_TYPES.GET].status = STATUS.UNKNOWN;
      
      // Then go down
      await monitor.updateStatus(CHECK_TYPES.GET, STATUS.DOWN, 5000, 'Timeout');
      
      expect(database.insertIncident).toHaveBeenCalledWith(
        CHECK_TYPES.GET,
        expect.any(Number),
        'Timeout'
      );
      expect(notifications.sendDownNotification).toHaveBeenCalledWith(
        CHECK_TYPES.GET,
        'Timeout'
      );
    });

    test('should not create incident if already down', async () => {
      // Set to down
      monitor.currentStatus[CHECK_TYPES.GET].status = STATUS.DOWN;
      
      // Stay down
      await monitor.updateStatus(CHECK_TYPES.GET, STATUS.DOWN, 5000, 'Timeout');
      
      expect(database.insertIncident).not.toHaveBeenCalled();
      expect(notifications.sendDownNotification).not.toHaveBeenCalled();
    });

    test('should close incident when status goes up after down', async () => {
      const openIncident = {
        id: 123,
        check_type: CHECK_TYPES.GET,
        start_time: Date.now() - 5000,
        end_time: null
      };
      
      database.getOpenIncident.mockResolvedValue(openIncident);
      
      // Set to down first
      monitor.currentStatus[CHECK_TYPES.GET].status = STATUS.DOWN;
      
      // Then go up
      await monitor.updateStatus(CHECK_TYPES.GET, STATUS.UP, 250, null);
      
      expect(database.updateIncidentEndTime).toHaveBeenCalledWith(
        123,
        expect.any(Number)
      );
      expect(notifications.sendUpNotification).toHaveBeenCalledWith(
        CHECK_TYPES.GET,
        openIncident.start_time
      );
    });

    test('should not close incident if there is no open incident', async () => {
      database.getOpenIncident.mockResolvedValue(null);
      
      // Set to down first
      monitor.currentStatus[CHECK_TYPES.GET].status = STATUS.DOWN;
      
      // Then go up
      await monitor.updateStatus(CHECK_TYPES.GET, STATUS.UP, 250, null);
      
      expect(database.updateIncidentEndTime).not.toHaveBeenCalled();
    });
  });

  describe('resolveOrphanedIncidents', () => {
    test('should close orphaned incidents if service is up', async () => {
      const openIncidents = [
        {
          id: 1,
          check_type: CHECK_TYPES.GET,
          start_time: Date.now() - 10000
        },
        {
          id: 2,
          check_type: CHECK_TYPES.POST,
          start_time: Date.now() - 5000
        }
      ];
      
      database.getAllOpenIncidents.mockResolvedValue(openIncidents);
      
      // Set services to up
      monitor.currentStatus[CHECK_TYPES.GET].status = STATUS.UP;
      monitor.currentStatus[CHECK_TYPES.POST].status = STATUS.UP;
      
      await monitor.resolveOrphanedIncidents();
      
      expect(database.updateIncidentEndTime).toHaveBeenCalledTimes(2);
      expect(notifications.sendUpNotification).toHaveBeenCalledTimes(2);
    });

    test('should not close orphaned incidents if service is still down', async () => {
      const openIncidents = [
        {
          id: 1,
          check_type: CHECK_TYPES.GET,
          start_time: Date.now() - 10000
        }
      ];
      
      database.getAllOpenIncidents.mockResolvedValue(openIncidents);
      
      // Service is still down
      monitor.currentStatus[CHECK_TYPES.GET].status = STATUS.DOWN;
      
      await monitor.resolveOrphanedIncidents();
      
      expect(database.updateIncidentEndTime).not.toHaveBeenCalled();
      expect(notifications.sendUpNotification).not.toHaveBeenCalled();
    });

    test('should do nothing if no orphaned incidents', async () => {
      database.getAllOpenIncidents.mockResolvedValue([]);
      
      await monitor.resolveOrphanedIncidents();
      
      expect(database.updateIncidentEndTime).not.toHaveBeenCalled();
      expect(notifications.sendUpNotification).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully', async () => {
      database.getAllOpenIncidents.mockRejectedValue(new Error('DB error'));
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await monitor.resolveOrphanedIncidents();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error resolving orphaned incidents:',
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getStatus', () => {
    test('should return current status for all check types', () => {
      const status = monitor.getStatus();
      
      expect(Object.keys(status)).toHaveLength(5);
      expect(status).toHaveProperty('GET');
      expect(status).toHaveProperty('POST');
      expect(status).toHaveProperty('WEB');
      expect(status).toHaveProperty('HOOK');
      expect(status).toHaveProperty('DP');
    });
  });

  describe('getLastCheckTime', () => {
    test('should return null if no checks performed', () => {
      const lastCheck = monitor.getLastCheckTime();
      
      expect(lastCheck).toBeNull();
    });

    test('should return most recent check time', async () => {
      const now = Date.now();
      
      await monitor.updateStatus(CHECK_TYPES.GET, STATUS.UP, 250, null);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await monitor.updateStatus(CHECK_TYPES.POST, STATUS.UP, 300, null);
      
      const lastCheck = monitor.getLastCheckTime();
      
      expect(lastCheck).toBeGreaterThanOrEqual(now);
    });
  });

  describe('isHealthy', () => {
    test('should return false if no checks performed', () => {
      expect(monitor.isHealthy()).toBe(false);
    });

    test('should return true if checks are recent', async () => {
      await monitor.updateStatus(CHECK_TYPES.GET, STATUS.UP, 250, null);
      
      expect(monitor.isHealthy()).toBe(true);
    });

    test('should return false if checks are old', async () => {
      // Manually set an old check time
      monitor.currentStatus[CHECK_TYPES.GET].lastCheck = Date.now() - 100000; // 100 seconds ago
      
      expect(monitor.isHealthy()).toBe(false);
    });
  });

  describe('addListener', () => {
    test('should add listener successfully', () => {
      const listener = jest.fn();
      
      monitor.addListener(listener);
      
      expect(monitor.listeners).toContain(listener);
    });

    test('should notify listeners on status update', async () => {
      const listener = jest.fn();
      monitor.addListener(listener);
      
      await monitor.updateStatus(CHECK_TYPES.GET, STATUS.UP, 250, null);
      
      expect(listener).toHaveBeenCalledWith(
        CHECK_TYPES.GET,
        expect.objectContaining({
          status: STATUS.UP,
          responseTime: 250
        })
      );
    });
  });
});

