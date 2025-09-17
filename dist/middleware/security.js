"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.basicRateLimiter = exports.helmetMiddleware = exports.corsMiddleware = void 0;
exports.advancedRateLimiter = advancedRateLimiter;
exports.sanitizeInput = sanitizeInput;
exports.validateRequest = validateRequest;
exports.requestIdMiddleware = requestIdMiddleware;
exports.securityHeaders = securityHeaders;
exports.validateFileUpload = validateFileUpload;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const environment_1 = require("../config/environment");
const logger_1 = require("../utils/logger");
const errorHandler_1 = require("./errorHandler");
exports.corsMiddleware = (0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (environment_1.config.cors.allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        logger_1.Logger.security('CORS origin rejected', { origin });
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Session-ID',
        'X-Request-ID',
    ],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 86400,
});
exports.helmetMiddleware = (0, helmet_1.default)({
    contentSecurityPolicy: environment_1.config.isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
});
exports.basicRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: environment_1.config.rateLimit.windowMs,
    max: environment_1.config.rateLimit.maxRequests,
    skipSuccessfulRequests: environment_1.config.rateLimit.skipSuccessfulRequests,
    message: {
        error: 'Too Many Requests',
        message: 'Too many requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger_1.Logger.security('Rate limit exceeded', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.url,
        });
        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Too many requests from this IP, please try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
        });
    },
});
const sensitiveRateLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
    points: 10,
    duration: 60,
    blockDuration: 300,
});
function advancedRateLimiter() {
    return async (req, res, next) => {
        try {
            const key = req.ip || 'unknown';
            await sensitiveRateLimiter.consume(key);
            next();
        }
        catch (rejRes) {
            const remainingTime = Math.ceil(rejRes.msBeforeNext / 1000);
            logger_1.Logger.security('Advanced rate limit exceeded', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                url: req.url,
                remainingTime,
            });
            res.set('Retry-After', remainingTime.toString());
            res.status(429).json({
                error: 'Too Many Requests',
                message: `Rate limit exceeded. Try again in ${remainingTime} seconds.`,
                code: 'ADVANCED_RATE_LIMIT_EXCEEDED',
                retryAfter: remainingTime,
            });
        }
    };
}
function sanitizeInput() {
    return (req, res, next) => {
        try {
            if (req.query) {
                req.query = sanitizeObject(req.query);
            }
            if (req.body && typeof req.body === 'object') {
                req.body = sanitizeObject(req.body);
            }
            next();
        }
        catch (error) {
            logger_1.Logger.error('Input sanitization error', {
                error: error instanceof Error ? error.message : String(error),
                ip: req.ip,
                url: req.url,
            });
            next(new errorHandler_1.ValidationError('Invalid input data'));
        }
    };
}
function sanitizeObject(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
    }
    if (typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            const sanitizedKey = sanitizeString(key);
            sanitized[sanitizedKey] = sanitizeObject(value);
        }
        return sanitized;
    }
    if (typeof obj === 'string') {
        return sanitizeString(obj);
    }
    return obj;
}
function sanitizeString(str) {
    if (typeof str !== 'string') {
        return str;
    }
    return str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/data:text\/html/gi, '')
        .trim();
}
function validateRequest(schema) {
    return (req, res, next) => {
        try {
            const errors = [];
            if (schema.body && req.body) {
                const { error } = schema.body.validate(req.body, { abortEarly: false });
                if (error) {
                    const validationError = (0, errorHandler_1.handleValidationError)(error);
                    throw validationError;
                }
            }
            if (schema.query && req.query) {
                const { error } = schema.query.validate(req.query, { abortEarly: false });
                if (error) {
                    const validationError = (0, errorHandler_1.handleValidationError)(error);
                    throw validationError;
                }
            }
            if (schema.params && req.params) {
                const { error } = schema.params.validate(req.params, { abortEarly: false });
                if (error) {
                    const validationError = (0, errorHandler_1.handleValidationError)(error);
                    throw validationError;
                }
            }
            if (schema.headers && req.headers) {
                const { error } = schema.headers.validate(req.headers, { abortEarly: false });
                if (error) {
                    const validationError = (0, errorHandler_1.handleValidationError)(error);
                    throw validationError;
                }
            }
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
function requestIdMiddleware() {
    return (req, res, next) => {
        const requestId = req.headers['x-request-id'] ||
            `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        req.headers['x-request-id'] = requestId;
        res.setHeader('X-Request-ID', requestId);
        res.locals.requestId = requestId;
        next();
    };
}
function securityHeaders() {
    return (req, res, next) => {
        res.removeHeader('X-Powered-By');
        res.removeHeader('Server');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        if (environment_1.config.isProduction) {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        }
        next();
    };
}
function validateFileUpload() {
    return (req, res, next) => {
        const contentType = req.headers['content-type'];
        const contentLength = req.headers['content-length'];
        if (contentType && !environment_1.config.fileUpload.allowedTypes.some((type) => contentType.includes(type))) {
            logger_1.Logger.security('Invalid file type upload attempt', {
                contentType,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
            });
            res.status(400).json({
                error: 'Invalid File Type',
                message: 'File type not allowed',
                code: 'INVALID_FILE_TYPE',
                allowedTypes: environment_1.config.fileUpload.allowedTypes,
            });
            return;
        }
        if (contentLength && parseInt(contentLength) > environment_1.config.fileUpload.maxSize) {
            logger_1.Logger.security('File size limit exceeded', {
                contentLength,
                maxSize: environment_1.config.fileUpload.maxSize,
                ip: req.ip,
            });
            res.status(413).json({
                error: 'File Too Large',
                message: `File size exceeds limit of ${environment_1.config.fileUpload.maxSize} bytes`,
                code: 'FILE_TOO_LARGE',
                maxSize: environment_1.config.fileUpload.maxSize,
            });
            return;
        }
        next();
    };
}
//# sourceMappingURL=security.js.map