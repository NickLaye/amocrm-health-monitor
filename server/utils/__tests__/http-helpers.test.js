/**
 * Unit tests for HTTP helpers
 */

const {
  buildAmoCRMUrl,
  createAuthConfig,
  extractErrorMessage,
  isServerError
} = require('../http-helpers');

describe('HTTP Helpers', () => {
  describe('buildAmoCRMUrl', () => {
    test('should build correct URL', () => {
      const url = buildAmoCRMUrl('test.amocrm.ru', '/api/v4/account');
      expect(url).toBe('https://test.amocrm.ru/api/v4/account');
    });

    test('should handle paths without leading slash', () => {
      const url = buildAmoCRMUrl('test.amocrm.ru', 'api/v4/account');
      expect(url).toBe('https://test.amocrm.ru/api/v4/account');
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
        request: {},
        message: 'Network Error'
      };
      const message = extractErrorMessage(error);
      expect(message).toBe('Network Error');
    });

    test('should handle timeout errors', () => {
      const error = {
        code: 'ECONNABORTED',
        config: { timeout: 5000 }
      };
      const message = extractErrorMessage(error);
      expect(message).toBe('Request timeout');
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
});

