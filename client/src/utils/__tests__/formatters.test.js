/**
 * Unit tests for formatter utilities
 */

import {
  formatDateTime,
  formatDuration,
  formatResponseTime,
  formatPercentage,
  formatNumber
} from '../formatters';

describe('Formatters', () => {
  describe('formatDateTime', () => {
    test('should format timestamp correctly', () => {
      const timestamp = new Date('2025-11-14T10:30:00Z').getTime();
      const result = formatDateTime(timestamp);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    test('should handle null timestamp', () => {
      expect(formatDateTime(null)).toBe('N/A');
    });

    test('should handle undefined timestamp', () => {
      expect(formatDateTime(undefined)).toBe('N/A');
    });
  });

  describe('formatDuration', () => {
    test('should format seconds only', () => {
      const result = formatDuration(5000); // 5 seconds
      expect(result).toBe('5 сек');
    });

    test('should format minutes and seconds', () => {
      const result = formatDuration(125000); // 2 min 5 sec
      expect(result).toContain('мин');
      expect(result).toContain('сек');
    });

    test('should handle null duration', () => {
      expect(formatDuration(null)).toBe('N/A');
    });
  });

  describe('formatResponseTime', () => {
    test('should convert ms to seconds with 3 decimals', () => {
      expect(formatResponseTime(1234)).toBe('1.234');
      expect(formatResponseTime(500)).toBe('0.500');
      expect(formatResponseTime(50)).toBe('0.050');
    });

    test('should handle null', () => {
      expect(formatResponseTime(null)).toBe('N/A');
    });

    test('should handle undefined', () => {
      expect(formatResponseTime(undefined)).toBe('N/A');
    });
  });

  describe('formatPercentage', () => {
    test('should format percentage with 1 decimal', () => {
      expect(formatPercentage(99.567)).toBe('99.6%');
      expect(formatPercentage(100)).toBe('100.0%');
      expect(formatPercentage(0)).toBe('0.0%');
    });

    test('should handle null', () => {
      expect(formatPercentage(null)).toBe('N/A');
    });
  });

  describe('formatNumber', () => {
    test('should format with thousands separator', () => {
      expect(formatNumber(1000)).toMatch(/\s/); // Contains space or comma
      expect(formatNumber(1000000)).toBeDefined();
    });

    test('should handle small numbers', () => {
      expect(formatNumber(100)).toBe('100');
      expect(formatNumber(0)).toBe('0');
    });

    test('should handle null', () => {
      expect(formatNumber(null)).toBe('N/A');
    });
  });
});

