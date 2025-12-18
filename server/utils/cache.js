/**
 * In-memory Cache with TTL
 * Simple caching utility for expensive API responses
 */

const { createLogger } = require('./logger');
const logger = createLogger('Cache');

class MemoryCache {
    constructor(options = {}) {
        this.cache = new Map();
        this.defaultTTL = options.defaultTTL || 60000; // 60 seconds default
        this.maxSize = options.maxSize || 100;
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * Generate cache key from object
     * @param {Object} params - Parameters to hash
     * @returns {string} Cache key
     */
    generateKey(params) {
        return JSON.stringify(params);
    }

    /**
     * Get value from cache
     * @param {string} key - Cache key
     * @returns {*} Cached value or undefined
     */
    get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            this.misses++;
            return undefined;
        }

        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.misses++;
            return undefined;
        }

        this.hits++;
        return entry.value;
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} [ttl] - Time to live in ms
     */
    set(key, value, ttl = this.defaultTTL) {
        // Evict oldest entries if at max size
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            value,
            expiresAt: Date.now() + ttl,
            createdAt: Date.now()
        });
    }

    /**
     * Delete entry from cache
     * @param {string} key - Cache key
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Invalidate all entries matching a pattern
     * @param {RegExp|Function} matcher - Pattern or function to match keys
     */
    invalidate(matcher) {
        let count = 0;
        for (const key of this.cache.keys()) {
            const match = typeof matcher === 'function'
                ? matcher(key)
                : matcher.test(key);
            if (match) {
                this.cache.delete(key);
                count++;
            }
        }
        if (count > 0) {
            logger.debug(`Invalidated ${count} cache entries`);
        }
    }

    /**
     * Clear all entries
     */
    clear() {
        this.cache.clear();
        logger.debug('Cache cleared');
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getStats() {
        const total = this.hits + this.misses;
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Cleanup expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, entry] of this.cache) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            logger.debug(`Cleaned up ${cleaned} expired cache entries`);
        }
    }
}

// Pre-configured cache instances
const statsCache = new MemoryCache({
    defaultTTL: 60000, // 1 minute for stats
    maxSize: 50
});

const historyCache = new MemoryCache({
    defaultTTL: 30000, // 30 seconds for history
    maxSize: 100
});

module.exports = {
    MemoryCache,
    statsCache,
    historyCache
};
