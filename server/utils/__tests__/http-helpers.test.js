/**
 * Unit tests for HTTP helpers
 */

const {
  buildAmoCRMUrl,
  createAuthConfig,
  extractErrorMessage,
  isServerError,
  determineStatus
} = require('../http-helpers');
const { STATUS } = require('../../config/constants');

describe('HTTP Helpers', () => {
  describe('buildAmoCRMUrl', () => {
    test('should build correct URL', () => {
      const url = buildAmoCRMUrl('test.amocrm.ru', '/api/v4/account');
      expect(url).toBe('https://test.amocrm.ru/api/v4/account');
    });

    test('should handle paths without leading slash', () => {
      const url = buildAmoCRMUrl('test.amocrm.ru', 'api/v4/account');
      expect(url).toBe('https://test.amocrm.ruapi/v4/account');
    });
  });

  describe('createAuthConfig', () => {
    test('should create config with auth headers', () => {
      const config = createAuthConfig('test_token', 5000);
      expect(config).toHaveProperty('headers');
      expect(config.headers.Authorization).toBe('Bearer test_token');
      expect(config.headers['Content-Type']).toBe('application/json');
      expect(config.timeout).toBe(5000);
    });
  });

  describe('extractErrorMessage', () => {
    test('should extract message from response error', () => {
      const error = {
        response: {
          status: 404,
          statusText: 'Not Found',
          data: { error: 'Resource not found' }
        }
      };
      const message = extractErrorMessage(error);
      expect(message).toContain('404');
      expect(message).toContain('Not Found');
    });

    test('should handle request errors', () => {
      const error = {
        request: {}
      };
      const message = extractErrorMessage(error);
      expect(message).toContain('No response received');
    });

    test('should handle timeout errors', () => {
      const error = {
        code: 'ECONNABORTED',
        config: { timeout: 5000 }
      };
      const message = extractErrorMessage(error);
      expect(message).toContain('timed out');
      expect(message).toContain('5000');
    });
  });

  describe('isServerError', () => {
    test('should detect 5xx errors', () => {
      expect(isServerError(500)).toBe(true);
      expect(isServerError(503)).toBe(true);
      expect(isServerError(599)).toBe(true);
    });

    test('should not detect non-5xx as server errors', () => {
      expect(isServerError(200)).toBe(false);
      expect(isServerError(404)).toBe(false);
      expect(isServerError(400)).toBe(false);
    });
  });

  describe('determineStatus', () => {
    test('should return UP for 2xx codes', () => {
      expect(determineStatus(200)).toBe(STATUS.UP);
      expect(determineStatus(201)).toBe(STATUS.UP);
      expect(determineStatus(204)).toBe(STATUS.UP);
    });

    test('should return UP for 3xx/4xx codes in web check', () => {
      expect(determineStatus(301, true)).toBe(STATUS.UP);
      expect(determineStatus(401, true)).toBe(STATUS.UP);
      expect(determineStatus(404, true)).toBe(STATUS.UP);
    });

    test('should return DOWN for 5xx codes', () => {
      expect(determineStatus(500)).toBe(STATUS.DOWN);
      expect(determineStatus(503)).toBe(STATUS.DOWN);
    });
  });
});

