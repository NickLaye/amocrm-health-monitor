/**
 * Unit tests for formatters utility functions
 */
import { describe, it, expect } from 'vitest';
import {
    formatResponseTime,
    formatUptime,
    formatPercentage,
    formatTimestamp,
    formatTime,
    formatDuration,
    formatNumber,
    getStatusText,
    getStatusClass,
    formatMTTR,
    formatMTBF,
    formatApdex,
    getApdexStatus
} from '../formatters.js';

describe('Formatters', () => {
    describe('formatResponseTime', () => {
        it('formats milliseconds to seconds with default decimals', () => {
            expect(formatResponseTime(1500)).toBe('1.500');
            expect(formatResponseTime(250)).toBe('0.250');
        });

        it('handles custom decimals', () => {
            expect(formatResponseTime(1500, 2)).toBe('1.50');
            expect(formatResponseTime(1500, 1)).toBe('1.5');
        });

        it('returns 0.000 for invalid values', () => {
            expect(formatResponseTime(null)).toBe('0.000');
            expect(formatResponseTime(undefined)).toBe('0.000');
            expect(formatResponseTime(NaN)).toBe('0.000');
        });
    });

    describe('formatUptime', () => {
        it('formats uptime percentage', () => {
            expect(formatUptime(99.5)).toBe('99.5%');
            expect(formatUptime(100)).toBe('100.0%');
        });

        it('handles custom decimals', () => {
            expect(formatUptime(99.567, 2)).toBe('99.57%');
        });

        it('returns 0.0% for invalid values', () => {
            expect(formatUptime(null)).toBe('0.0%');
            expect(formatUptime(undefined)).toBe('0.0%');
            expect(formatUptime(NaN)).toBe('0.0%');
        });
    });

    describe('formatPercentage', () => {
        it('is alias for formatUptime', () => {
            expect(formatPercentage(50)).toBe('50.0%');
        });
    });

    describe('formatTimestamp', () => {
        it('formats date to localized string', () => {
            const date = new Date('2024-01-15T10:30:00Z');
            const result = formatTimestamp(date);
            expect(result).toContain('15');
            expect(result).toContain('2024');
        });

        it('returns empty string for invalid values', () => {
            expect(formatTimestamp(null)).toBe('');
            expect(formatTimestamp(undefined)).toBe('');
        });
    });

    describe('formatTime', () => {
        it('formats time string', () => {
            const date = new Date('2024-01-15T10:30:00Z');
            const result = formatTime(date);
            expect(result).toBeDefined();
        });

        it('returns empty string for invalid values', () => {
            expect(formatTime(null)).toBe('');
            expect(formatTime(undefined)).toBe('');
        });
    });

    describe('formatDuration', () => {
        it('formats seconds', () => {
            expect(formatDuration(5000)).toBe('5 сек');
            expect(formatDuration(45000)).toBe('45 сек');
        });

        it('formats minutes and seconds', () => {
            expect(formatDuration(90000)).toBe('1 мин 30 сек');
            expect(formatDuration(300000)).toBe('5 мин 0 сек');
        });

        it('formats hours and minutes', () => {
            expect(formatDuration(3900000)).toBe('1 ч 5 мин');
        });

        it('formats days and hours', () => {
            expect(formatDuration(90000000)).toBe('1 дн 1 ч');
        });

        it('returns 0 сек for invalid values', () => {
            expect(formatDuration(null)).toBe('0 сек');
            expect(formatDuration(-100)).toBe('0 сек');
            expect(formatDuration(0)).toBe('0 сек');
        });
    });

    describe('formatNumber', () => {
        it('formats number with locale separators', () => {
            const result = formatNumber(1000000);
            expect(result).toMatch(/1.*000.*000/);
        });

        it('returns 0 for invalid values', () => {
            expect(formatNumber(null)).toBe('0');
            expect(formatNumber(undefined)).toBe('0');
            expect(formatNumber(NaN)).toBe('0');
        });
    });

    describe('getStatusText', () => {
        it('returns correct text for each status', () => {
            expect(getStatusText('up')).toBe('ОК');
            expect(getStatusText('warning')).toBe('ВНИМ');
            expect(getStatusText('down')).toBe('СБОЙ');
            expect(getStatusText('unknown')).toBe('Н/Д');
        });

        it('returns Н/Д for unknown status', () => {
            expect(getStatusText('invalid')).toBe('Н/Д');
            expect(getStatusText(null)).toBe('Н/Д');
        });
    });

    describe('getStatusClass', () => {
        it('returns correct CSS class', () => {
            expect(getStatusClass('up')).toBe('status-up');
            expect(getStatusClass('down')).toBe('status-down');
        });

        it('returns status-unknown for missing status', () => {
            expect(getStatusClass(null)).toBe('status-unknown');
            expect(getStatusClass(undefined)).toBe('status-unknown');
        });
    });

    describe('formatMTTR', () => {
        it('formats minutes', () => {
            expect(formatMTTR(30)).toBe('30 мин');
            expect(formatMTTR(5)).toBe('5 мин');
        });

        it('formats hours and minutes', () => {
            expect(formatMTTR(90)).toBe('1 ч 30 мин');
            expect(formatMTTR(60)).toBe('1 ч');
        });

        it('returns 0 мин for invalid values', () => {
            expect(formatMTTR(0)).toBe('0 мин');
            expect(formatMTTR(null)).toBe('0 мин');
        });
    });

    describe('formatMTBF', () => {
        it('formats hours', () => {
            expect(formatMTBF(12)).toBe('12.0 ч');
        });

        it('formats days and hours', () => {
            expect(formatMTBF(36)).toBe('1 дн 12 ч');
            expect(formatMTBF(24)).toBe('1 дн');
        });

        it('returns 0 ч for invalid values', () => {
            expect(formatMTBF(0)).toBe('0 ч');
            expect(formatMTBF(null)).toBe('0 ч');
        });
    });

    describe('formatApdex', () => {
        it('formats Apdex score', () => {
            expect(formatApdex(0.995)).toBe('0.995');
            expect(formatApdex(1)).toBe('1.000');
        });

        it('returns 0.000 for invalid values', () => {
            expect(formatApdex(null)).toBe('0.000');
            expect(formatApdex(NaN)).toBe('0.000');
        });
    });

    describe('getApdexStatus', () => {
        it('returns Отлично for scores >= 0.94', () => {
            const result = getApdexStatus(0.95);
            expect(result.label).toBe('Отлично');
            expect(result.emoji).toBe('🟢');
        });

        it('returns Хорошо for scores >= 0.85', () => {
            const result = getApdexStatus(0.90);
            expect(result.label).toBe('Хорошо');
            expect(result.emoji).toBe('🟡');
        });

        it('returns Нормально for scores >= 0.70', () => {
            const result = getApdexStatus(0.75);
            expect(result.label).toBe('Нормально');
        });

        it('returns Плохо for scores >= 0.50', () => {
            const result = getApdexStatus(0.55);
            expect(result.label).toBe('Плохо');
        });

        it('returns Критично for scores < 0.50', () => {
            const result = getApdexStatus(0.3);
            expect(result.label).toBe('Критично');
        });

        it('returns N/A for invalid values', () => {
            const result = getApdexStatus(null);
            expect(result.label).toBe('N/A');
        });
    });
});
