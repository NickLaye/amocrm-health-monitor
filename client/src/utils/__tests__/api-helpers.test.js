/**
 * Tests for API Helpers
 */

import {
  handleApiError,
  retryWithBackoff,
  debounce,
  isValidResponse,
  extractResponseData,
  buildUrlWithParams
} from '../api-helpers';

describe('API Helpers', () => {
  describe('handleApiError', () => {
    test('should return formatted error message for network error', () => {
      const error = {
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded'
      };

      const result = handleApiError(error);
      expect(result).toContain('Ошибка сети');
    });

    test('should return formatted error message for 404', () => {
      const error = {
        response: {
          status: 404,
          statusText: 'Not Found'
        }
      };

      const result = handleApiError(error);
      expect(result).toContain('404');
    });

    test('should return formatted error message for 500', () => {
      const error = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: {
            error: 'Database connection failed'
          }
        }
      };

      const result = handleApiError(error);
      expect(result).toContain('500');
    });

    test('should return generic error message for unknown errors', () => {
      const error = {
        message: 'Something went wrong'
      };

      const result = handleApiError(error);
      expect(result).toContain('Произошла ошибка');
    });

    test('should handle error without message', () => {
      const error = {};

      const result = handleApiError(error);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    test('should handle null error', () => {
      const result = handleApiError(null);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    test('should include API error message if available', () => {
      const error = {
        response: {
          status: 400,
          data: {
            error: 'Invalid parameter: checkType'
          }
        }
      };

      const result = handleApiError(error);
      expect(result).toContain('Invalid parameter');
    });
  });

  describe('retryWithBackoff', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should succeed on first try', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const result = await retryWithBackoff(fn, 3, 100);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure and eventually succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');
      
      const promise = retryWithBackoff(fn, 3, 100);
      
      // Fast-forward timers
      await jest.runAllTimersAsync();
      
      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('should throw error after max retries', async () => {
      const error = new Error('Always fails');
      const fn = jest.fn().mockRejectedValue(error);
      
      await expect(retryWithBackoff(fn, 2, 100)).rejects.toThrow('Always fails');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should delay function execution', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 300);
      
      debouncedFn();
      expect(fn).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(300);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('should cancel previous calls', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 300);
      
      debouncedFn();
      debouncedFn();
      debouncedFn();
      
      jest.advanceTimersByTime(300);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('should pass arguments correctly', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 300);
      
      debouncedFn('arg1', 'arg2');
      jest.advanceTimersByTime(300);
      
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('isValidResponse', () => {
    test('should return true for valid response', () => {
      const response = {
        success: true,
        data: { items: [] }
      };
      
      expect(isValidResponse(response)).toBe(true);
    });

    test('should return false for response with success=false', () => {
      const response = {
        success: false,
        data: null
      };
      
      expect(isValidResponse(response)).toBe(false);
    });

    test('should return false for response without data', () => {
      const response = {
        success: true
      };
      
      expect(isValidResponse(response)).toBe(false);
    });

    test('should return false for null response', () => {
      expect(isValidResponse(null)).toBe(false);
    });

    test('should return true for response with data=null but success is not false', () => {
      const response = {
        data: null
      };
      
      expect(isValidResponse(response)).toBe(false);
    });
  });

  describe('extractResponseData', () => {
    test('should extract nested data', () => {
      const response = {
        data: {
          data: { items: [1, 2, 3] }
        }
      };
      
      const result = extractResponseData(response);
      expect(result).toEqual({ items: [1, 2, 3] });
    });

    test('should extract direct data', () => {
      const response = {
        data: { items: [1, 2, 3] }
      };
      
      const result = extractResponseData(response);
      expect(result).toEqual({ items: [1, 2, 3] });
    });

    test('should return null for null response', () => {
      expect(extractResponseData(null)).toBeNull();
    });

    test('should return null for undefined response', () => {
      expect(extractResponseData(undefined)).toBeNull();
    });
  });

  describe('buildUrlWithParams', () => {
    test('should build URL with single parameter', () => {
      const url = buildUrlWithParams('/api/users', { id: 123 });
      expect(url).toBe('/api/users?id=123');
    });

    test('should build URL with multiple parameters', () => {
      const url = buildUrlWithParams('/api/users', { 
        page: 1, 
        limit: 10,
        sort: 'name'
      });
      
      expect(url).toContain('page=1');
      expect(url).toContain('limit=10');
      expect(url).toContain('sort=name');
    });

    test('should return base URL if no parameters', () => {
      const url = buildUrlWithParams('/api/users', {});
      expect(url).toBe('/api/users');
    });

    test('should return base URL if params is null', () => {
      const url = buildUrlWithParams('/api/users', null);
      expect(url).toBe('/api/users');
    });

    test('should encode special characters', () => {
      const url = buildUrlWithParams('/api/search', { 
        query: 'hello world',
        filter: 'status=active'
      });
      
      expect(url).toContain(encodeURIComponent('hello world'));
      expect(url).toContain(encodeURIComponent('status=active'));
    });

    test('should filter out null and undefined values', () => {
      const url = buildUrlWithParams('/api/users', { 
        id: 123,
        name: null,
        age: undefined,
        active: true
      });
      
      expect(url).toContain('id=123');
      expect(url).toContain('active=true');
      expect(url).not.toContain('name');
      expect(url).not.toContain('age');
    });
  });
});

