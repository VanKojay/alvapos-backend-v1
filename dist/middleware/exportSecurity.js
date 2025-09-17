"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityHeaders = securityHeaders;
exports.sanitizeInput = sanitizeInput;
exports.basicRateLimit = basicRateLimit;
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 100;
function basicRateLimit() {
    return (req, res, next) => {
        const clientId = req.ip || 'unknown';
        const now = Date.now();
        let clientData = rateLimitStore.get(clientId);
        if (!clientData || now > clientData.resetTime) {
            clientData = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
            rateLimitStore.set(clientId, clientData);
        }
        if (clientData.count >= RATE_LIMIT_MAX) {
            return res.status(429).json({
                error: 'Too many requests',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
            });
        }
        clientData.count++;
        next();
    };
}
function sanitizeInput() {
    return (req, res, next) => {
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeObject(req.body);
        }
        if (req.query && typeof req.query === 'object') {
            req.query = sanitizeObject(req.query);
        }
        next();
    };
}
function securityHeaders() {
    return (req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.removeHeader('X-Powered-By');
        next();
    };
}
function sanitizeObject(obj) {
    if (typeof obj === 'string') {
        return obj
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
    }
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }
    if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
    }
    return obj;
}
//# sourceMappingURL=exportSecurity.js.map