const rateLimit = require('express-rate-limit');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AuthLimiter');

/**
 * Rate limiter middleware for authentication attempts.
 * Protects against brute-force attacks on Basic Auth protected routes.
 * 
 * Default config: 10 attempts per 15 minutes window.
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10, // Limit each IP to 10 requests per windowMs
    standardHeaders: 'draft-8', // Draft-8: `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
        success: false,
        error: 'Too many login attempts, please try again after 15 minutes'
    },
    handler: (req, res, next, options) => {
        logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
        res.status(options.statusCode).send(options.message);
    },
    skipSuccessfulRequests: true // Only count failed attempts (401) is tricky with Basic Auth handled by express-basic-auth
    // express-basic-auth sends 401 but middleware chain might stop there.
    // Actually, express-rate-limit counts all requests unless skip is defined.
    // Ideally for brute-force we want to count *attempts*, whether successful or not, or maybe just failures.
    // But without deep integration into basicAuth, counting all attempts to auth endpoint is safer default.
    // However, since Basic Auth is often sent on EVERY request in browser,
    // we must be careful. 

    // STRATEGY:
    // If we apply this GLOBALLY to protected routes, valid users will get blocked after 10 requests.
    // We should probably NOT use skipSuccessfulRequests=false for all requests.
    // 
    // BUT: Basic Auth usually sends header with every request.
    // If we limit checking the header, we limit usage.
    // 
    // The goal is to limit INVALID attempts. 
    // express-basic-auth doesn't expose an easy way to hook into failure for rate limiting external to it 
    // unless we wrap it or use a custom authorizer.
    //
    // ALTERNATIVE: Use failCallback in express-basic-auth options to track failures?
    // Or simpler: Just limits per IP for specific routes if login was a separate endpoint.
    // But here auth is on many routes.
    //
    // Let's stick thereto strict limiting on WRONG credentials if possible.
    // Since we cannot easily know if it's wrong before basicAuth runs, and basicAuth terminates response on 401...
    //
    // A common simpler approach for Basic Auth API:
    // Don't ratelimit widely used API endpoints too strictly.
    // But we have `adminUser` / `adminPassword`. It's likely used by humans or single services.
    // 
    // Refined Strategy:
    // We will assume that legitimate traffic comes with a valid token/password.
    // We can't distinguish easily without running auth check.
    // 
    // Best approach given constraints:
    // Rely on `failCallback` or `unauthorizedResponse` in `express-basic-auth` (in index.js) to trigger a custom rate limiter tick?
    // No, `express-rate-limit` works as middleware.
    //
    // Let's configure it to be lenient enough for normal use but strict for massive brute force.
    // 100 per 15 min? Or maybe just limit the *entry* points if possible?
    // Given it's a dashboard, the user loads it and makes many requests.
    //
    // Wait, `express-rate-limit` has `skipSuccessfulRequests: true`. 
    // This requires the response status to be set.
    // `express-basic-auth` sets 401 on failure.
    // So if we place limiter BEFORE basicAuth, and set `skipSuccessfulRequests: true`, 
    // then verify:
    // 1. Req comes in. Limiter passes it.
    // 2. basicAuth runs. 
    //    - If valid -> calls next() -> eventual 200/etc. -> Limiter sees success -> removes count.
    //    - If invalid -> checks password -> sends 401 -> Limiter sees 401 -> keeps count?
    // 
    // `skipSuccessfulRequests` option: "if true, this will skip decrementing the hit count for successful requests" -> NO.
    // Actually: "When set to true, successful requests (response status < 400) will not be counted." -> THIS IS WHAT WE WANT.
    // It effectively counts only failures.
});

module.exports = authLimiter;
