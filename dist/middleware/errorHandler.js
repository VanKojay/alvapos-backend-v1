"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalServiceError = exports.DatabaseError = exports.RateLimitError = exports.ConflictError = exports.ForbiddenError = exports.UnauthorizedError = exports.NotFoundError = exports.ValidationError = exports.AppError = void 0;
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
exports.handleUncaughtException = handleUncaughtException;
exports.handleUnhandledRejection = handleUnhandledRejection;
exports.asyncHandler = asyncHandler;
exports.handleValidationError = handleValidationError;
const logger_1 = require("../utils/logger");
const environment_1 = require("../config/environment");
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', isOperational = true, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = isOperational;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message, details) {
        super(message, 400, 'VALIDATION_ERROR', true, details);
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404, 'NOT_FOUND', true);
    }
}
exports.NotFoundError = NotFoundError;
class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED', true);
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 403, 'FORBIDDEN', true);
    }
}
exports.ForbiddenError = ForbiddenError;
class ConflictError extends AppError {
    constructor(message = 'Resource conflict') {
        super(message, 409, 'CONFLICT', true);
    }
}
exports.ConflictError = ConflictError;
class RateLimitError extends AppError {
    constructor(message = 'Too many requests') {
        super(message, 429, 'RATE_LIMIT_EXCEEDED', true);
    }
}
exports.RateLimitError = RateLimitError;
class DatabaseError extends AppError {
    constructor(message = 'Database operation failed', details) {
        super(message, 500, 'DATABASE_ERROR', true, details);
    }
}
exports.DatabaseError = DatabaseError;
class ExternalServiceError extends AppError {
    constructor(service, message = 'External service error') {
        super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', true);
    }
}
exports.ExternalServiceError = ExternalServiceError;
function formatError(error, req) {
    const response = {
        error: error.name || 'Error',
        message: error.message,
        code: error.code || 'UNKNOWN_ERROR',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
    };
    if (req.headers['x-request-id']) {
        response.requestId = req.headers['x-request-id'];
    }
    if (error.details) {
        response.details = error.details;
    }
    if (environment_1.config.isDevelopment && error.stack) {
        response.stack = error.stack;
    }
    return response;
}
function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }
    const statusCode = error.statusCode || 500;
    const isOperational = error.isOperational !== false;
    const logContext = {
        requestId: req.headers['x-request-id'],
        sessionId: req.sessionId,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        statusCode,
        code: error.code,
        isOperational,
    };
    if (statusCode >= 500) {
        logger_1.Logger.error(error.message, {
            ...logContext,
            stack: error.stack,
            details: error.details,
        });
    }
    else if (statusCode >= 400) {
        logger_1.Logger.warn(error.message, logContext);
    }
    const errorResponse = formatError(error, req);
    res.status(statusCode).json(errorResponse);
}
function notFoundHandler(req, res, next) {
    const error = new NotFoundError(`Route ${req.method} ${req.path}`);
    next(error);
}
function handleUncaughtException(error) {
    logger_1.Logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
    });
    if (environment_1.config.isProduction) {
        process.exit(1);
    }
}
function handleUnhandledRejection(reason, promise) {
    logger_1.Logger.error('Unhandled Promise Rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
    });
    if (environment_1.config.isProduction) {
        process.exit(1);
    }
}
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
function handleValidationError(error) {
    if (error.isJoi) {
        const details = error.details.map((detail) => ({
            field: detail.context?.key,
            message: detail.message.replace(/"/g, ''),
            value: detail.context?.value,
        }));
        return new ValidationError('Validation failed', details);
    }
    return error;
}
//# sourceMappingURL=errorHandler.js.map