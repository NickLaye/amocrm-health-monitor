/**
 * Simple Rate Limiter
 * Enforces a minimum interval between request executions to comply with API quotas.
 * Does not limit concurrency of in-flight requests, only the rate of dispatch.
 */
class RateLimiter {
    /**
     * @param {number} rps - Requests per second limit (default: 6)
     */
    constructor(rps = 6) {
        this.minInterval = Math.ceil(1000 / rps); // e.g., 167ms
        this.queue = [];
        this.processing = false;
        this.lastRun = 0;
    }

    /**
     * Execute a function with rate limiting
     * @param {Function} fn - Async function to execute
     * @returns {Promise<any>}
     */
    async execute(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            this.process();
        });
    }

    /**
     * Process the queue
     * @private
     */
    async process() {
        if (this.processing) return;
        this.processing = true;

        while (this.queue.length > 0) {
            const now = Date.now();
            const timeSinceLast = now - this.lastRun;
            const wait = Math.max(0, this.minInterval - timeSinceLast);

            if (wait > 0) {
                await new Promise(resolve => setTimeout(resolve, wait));
            }

            const { fn, resolve, reject } = this.queue.shift();
            this.lastRun = Date.now();

            // Fire and forget (don't wait for completion) to allow network concurrency
            // We only throttle the dispatch rate
            Promise.resolve().then(() => fn())
                .then(resolve)
                .catch(reject);
        }

        this.processing = false;
    }
}

module.exports = RateLimiter;
