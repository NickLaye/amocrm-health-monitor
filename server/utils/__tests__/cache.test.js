/**
 * Unit tests for Memory Cache
 */

// Mock logger before requiring cache
jest.mock('../logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    })
}));

const { MemoryCache, statsCache, historyCache } = require('../cache');

describe('MemoryCache', () => {
    let cache;

    beforeEach(() => {
        cache = new MemoryCache({ defaultTTL: 1000, maxSize: 5 });
    });

    describe('get/set', () => {
        test('should store and retrieve values', () => {
            cache.set('key1', { data: 'test' });
            expect(cache.get('key1')).toEqual({ data: 'test' });
        });

        test('should return undefined for missing keys', () => {
            expect(cache.get('nonexistent')).toBeUndefined();
        });

        test('should return undefined for expired entries', async () => {
            cache.set('key1', 'value', 10); // 10ms TTL
            expect(cache.get('key1')).toBe('value');

            await new Promise(resolve => setTimeout(resolve, 20));
            expect(cache.get('key1')).toBeUndefined();
        });
    });

    describe('generateKey', () => {
        test('should generate consistent keys', () => {
            const key1 = cache.generateKey({ hours: 24, clientId: 'test' });
            const key2 = cache.generateKey({ hours: 24, clientId: 'test' });
            expect(key1).toBe(key2);
        });

        test('should generate different keys for different params', () => {
            const key1 = cache.generateKey({ hours: 24 });
            const key2 = cache.generateKey({ hours: 48 });
            expect(key1).not.toBe(key2);
        });
    });

    describe('eviction', () => {
        test('should evict oldest entry when at max size', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            cache.set('key3', 'value3');
            cache.set('key4', 'value4');
            cache.set('key5', 'value5');
            cache.set('key6', 'value6'); // Should evict key1

            expect(cache.get('key1')).toBeUndefined();
            expect(cache.get('key6')).toBe('value6');
        });
    });

    describe('delete', () => {
        test('should delete specific entry', () => {
            cache.set('key1', 'value1');
            cache.delete('key1');
            expect(cache.get('key1')).toBeUndefined();
        });
    });

    describe('invalidate', () => {
        test('should invalidate entries matching pattern', () => {
            cache.set('stats:client1', 'data1');
            cache.set('stats:client2', 'data2');
            cache.set('history:client1', 'data3');

            cache.invalidate(/^stats:/);

            expect(cache.get('stats:client1')).toBeUndefined();
            expect(cache.get('stats:client2')).toBeUndefined();
            expect(cache.get('history:client1')).toBe('data3');
        });

        test('should invalidate entries using function matcher', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');

            cache.invalidate(key => key === 'key1');

            expect(cache.get('key1')).toBeUndefined();
            expect(cache.get('key2')).toBe('value2');
        });
    });

    describe('clear', () => {
        test('should clear all entries', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');

            cache.clear();

            expect(cache.get('key1')).toBeUndefined();
            expect(cache.get('key2')).toBeUndefined();
        });
    });

    describe('getStats', () => {
        test('should track hits and misses', () => {
            cache.set('key1', 'value1');

            cache.get('key1'); // hit
            cache.get('key1'); // hit
            cache.get('nonexistent'); // miss

            const stats = cache.getStats();
            expect(stats.hits).toBe(2);
            expect(stats.misses).toBe(1);
            expect(stats.size).toBe(1);
        });
    });

    describe('cleanup', () => {
        test('should remove expired entries', async () => {
            cache.set('key1', 'value1', 10);
            cache.set('key2', 'value2', 10000);

            await new Promise(resolve => setTimeout(resolve, 20));
            cache.cleanup();

            expect(cache.get('key1')).toBeUndefined();
            expect(cache.get('key2')).toBe('value2');
        });
    });
});

describe('Pre-configured caches', () => {
    test('statsCache should be configured', () => {
        expect(statsCache).toBeInstanceOf(MemoryCache);
        expect(statsCache.defaultTTL).toBe(60000);
    });

    test('historyCache should be configured', () => {
        expect(historyCache).toBeInstanceOf(MemoryCache);
        expect(historyCache.defaultTTL).toBe(30000);
    });
});
