"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.financialErrorMiddleware = exports.financialErrorHandler = exports.FinancialErrorHandler = void 0;
const logger_1 = require("../utils/logger");
class FinancialErrorHandler {
    constructor() {
        this.errorCounts = new Map();
        this.recentErrors = [];
        this.MAX_RECENT_ERRORS = 100;
        this.ERROR_RESET_INTERVAL = 300000;
        this.setupErrorTracking();
    }
    static getInstance() {
        if (!FinancialErrorHandler.instance) {
            FinancialErrorHandler.instance = new FinancialErrorHandler();
        }
        return FinancialErrorHandler.instance;
    }
    setupErrorTracking() {
        setInterval(() => {
            this.cleanupErrorTracking();
        }, this.ERROR_RESET_INTERVAL);
    }
    cleanupErrorTracking() {
        const cutoffTime = Date.now() - this.ERROR_RESET_INTERVAL;
        this.recentErrors = this.recentErrors.filter(error => {
            return new Date(error.timestamp).getTime() > cutoffTime;
        });
        this.errorCounts.clear();
        logger_1.Logger.debug('Financial error tracking cleaned up', {
            remainingErrors: this.recentErrors.length
        });
    }
    trackError(error, sessionId) {
        const errorKey = `${error.type}_${error.name}`;
        const currentCount = this.errorCounts.get(errorKey) || 0;
        this.errorCounts.set(errorKey, currentCount + 1);
        this.recentErrors.push({
            type: error.type,
            timestamp: new Date().toISOString(),
            sessionId,
            operation: error.context?.operation
        });
        if (this.recentErrors.length > this.MAX_RECENT_ERRORS) {
            this.recentErrors = this.recentErrors.slice(-this.MAX_RECENT_ERRORS);
        }
    }
    createFinancialError(type, message, details, context) {
        const error = new Error(message);
        error.type = type;
        error.details = details;
        error.context = {
            ...context,
            timestamp: new Date().toISOString()
        };
        error.recoverable = this.isRecoverableError(type);
        return error;
    }
    isRecoverableError(type) {
        switch (type) {
            case 'VALIDATION_ERROR':
                return true;
            case 'TIMEOUT_ERROR':
                return true;
            case 'SYNC_ERROR':
                return true;
            case 'CALCULATION_ERROR':
                return false;
            case 'PRECISION_ERROR':
                return false;
            default:
                return false;
        }
    }
    handleDecimalError(error, context) {
        let message = 'Decimal calculation error occurred';
        let type = 'PRECISION_ERROR';
        if (error.message) {
            if (error.message.includes('Invalid argument')) {
                message = 'Invalid numeric value provided for calculation';
                type = 'VALIDATION_ERROR';
            }
            else if (error.message.includes('Division by zero')) {
                message = 'Division by zero attempted in calculation';
                type = 'CALCULATION_ERROR';
            }
            else if (error.message.includes('precision')) {
                message = 'Precision limit exceeded in calculation';
                type = 'PRECISION_ERROR';
            }
        }
        return this.createFinancialError(type, message, {
            originalError: error.message,
            stack: error.stack
        }, context);
    }
    handleValidationErrors(errors, operation, context) {
        const message = `Validation failed for ${operation}: ${errors.length} error(s) found`;
        return this.createFinancialError('VALIDATION_ERROR', message, {
            validationErrors: errors,
            errorCount: errors.length
        }, { ...context, operation });
    }
    handleSyncError(error, sessionId, operation) {
        let message = 'Real-time synchronization failed';
        let type = 'SYNC_ERROR';
        if (error.message) {
            if (error.message.includes('timeout')) {
                message = 'Real-time sync operation timed out';
                type = 'TIMEOUT_ERROR';
            }
            else if (error.message.includes('connection')) {
                message = 'Real-time connection error occurred';
                type = 'SYNC_ERROR';
            }
        }
        return this.createFinancialError(type, message, {
            originalError: error.message,
            stack: error.stack
        }, {
            operation,
            sessionId,
            timestamp: new Date().toISOString()
        });
    }
    middleware() {
        return (error, req, res, next) => {
            const sessionId = res.locals.sessionId;
            const requestId = res.locals.requestId;
            if (this.isFinancialError(error)) {
                const financialError = error;
                this.handleFinancialError(financialError, req, res, sessionId, requestId);
                return;
            }
            if (this.isDecimalError(error)) {
                const financialError = this.handleDecimalError(error, {
                    operation: req.method + ' ' + req.path,
                    sessionId
                });
                this.handleFinancialError(financialError, req, res, sessionId, requestId);
                return;
            }
            if (this.isFinancialValidationError(error, req)) {
                const validationErrors = error.validationErrors || [
                    { field: 'unknown', message: error.message }
                ];
                const financialError = this.handleValidationErrors(validationErrors, req.method + ' ' + req.path, { sessionId });
                this.handleFinancialError(financialError, req, res, sessionId, requestId);
                return;
            }
            next(error);
        };
    }
    handleFinancialError(error, req, res, sessionId, requestId) {
        this.trackError(error, sessionId);
        const logLevel = this.getLogLevel(error.type);
        const logData = {
            type: error.type,
            message: error.message,
            details: error.details,
            context: error.context,
            sessionId,
            requestId,
            path: req.path,
            method: req.method,
            recoverable: error.recoverable
        };
        switch (logLevel) {
            case 'error':
                logger_1.Logger.error('Financial operation error', logData);
                break;
            case 'warn':
                logger_1.Logger.warn('Financial operation warning', logData);
                break;
            default:
                logger_1.Logger.info('Financial operation issue', logData);
        }
        const statusCode = this.getStatusCode(error.type);
        const response = {
            success: false,
            error: this.getPublicErrorMessage(error),
            message: error.recoverable ? 'Please review your input and try again' : 'A system error occurred',
            timestamp: new Date().toISOString(),
            requestId
        };
        if (error.type === 'VALIDATION_ERROR' && error.details?.validationErrors) {
            response.validation_errors = error.details.validationErrors;
        }
        if (error.recoverable) {
            response.suggestions = this.getRecoverySuggestions(error.type);
        }
        res.status(statusCode).json(response);
    }
    isFinancialError(error) {
        return error && typeof error.type === 'string' &&
            ['CALCULATION_ERROR', 'VALIDATION_ERROR', 'PRECISION_ERROR', 'SYNC_ERROR', 'TIMEOUT_ERROR']
                .includes(error.type);
    }
    isDecimalError(error) {
        return error && (error.constructor?.name === 'DecimalError' ||
            error.name === 'DecimalError' ||
            (error.message && error.message.includes('Decimal')));
    }
    isFinancialValidationError(error, req) {
        const financialPaths = ['/api/quotes', '/api/realtime/calculate', '/api/realtime/validate'];
        const isFinancialPath = financialPaths.some(path => req.path.includes(path));
        return isFinancialPath && ((error.validationErrors && Array.isArray(error.validationErrors)) ||
            (error.message && error.message.includes('validation')) ||
            (error.message && error.message.includes('cart')) ||
            (error.message && error.message.includes('discount')) ||
            (error.message && error.message.includes('price')));
    }
    getLogLevel(type) {
        switch (type) {
            case 'CALCULATION_ERROR':
            case 'PRECISION_ERROR':
                return 'error';
            case 'SYNC_ERROR':
            case 'TIMEOUT_ERROR':
                return 'warn';
            case 'VALIDATION_ERROR':
                return 'info';
            default:
                return 'warn';
        }
    }
    getStatusCode(type) {
        switch (type) {
            case 'VALIDATION_ERROR':
                return 400;
            case 'TIMEOUT_ERROR':
                return 408;
            case 'SYNC_ERROR':
                return 503;
            case 'CALCULATION_ERROR':
            case 'PRECISION_ERROR':
                return 500;
            default:
                return 500;
        }
    }
    getPublicErrorMessage(error) {
        switch (error.type) {
            case 'VALIDATION_ERROR':
                return 'Invalid input data provided';
            case 'CALCULATION_ERROR':
                return 'Calculation error occurred';
            case 'PRECISION_ERROR':
                return 'Calculation precision error';
            case 'SYNC_ERROR':
                return 'Real-time synchronization failed';
            case 'TIMEOUT_ERROR':
                return 'Operation timed out';
            default:
                return 'Financial operation failed';
        }
    }
    getRecoverySuggestions(type) {
        switch (type) {
            case 'VALIDATION_ERROR':
                return [
                    'Check that all required fields are provided',
                    'Verify that prices and quantities are valid positive numbers',
                    'Ensure discount values are within acceptable ranges'
                ];
            case 'TIMEOUT_ERROR':
                return [
                    'Try the operation again',
                    'Check your internet connection',
                    'Reduce the complexity of your request'
                ];
            case 'SYNC_ERROR':
                return [
                    'Refresh the page and try again',
                    'Check your connection status',
                    'Contact support if the issue persists'
                ];
            default:
                return ['Contact support for assistance'];
        }
    }
    getErrorStats() {
        const errorTypes = {};
        this.recentErrors.forEach(error => {
            errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
        });
        return {
            errorCounts: Object.fromEntries(this.errorCounts),
            recentErrorCount: this.recentErrors.length,
            errorTypes
        };
    }
    isHighErrorRate() {
        const recentErrorsCount = this.recentErrors.filter(error => {
            const errorTime = new Date(error.timestamp).getTime();
            const fiveMinutesAgo = Date.now() - 300000;
            return errorTime > fiveMinutesAgo;
        }).length;
        return recentErrorsCount > 10;
    }
    getSystemHealth() {
        const recentErrors = this.recentErrors.filter(error => {
            const errorTime = new Date(error.timestamp).getTime();
            const fiveMinutesAgo = Date.now() - 300000;
            return errorTime > fiveMinutesAgo;
        });
        const errorRate = recentErrors.length;
        if (errorRate === 0) {
            return {
                status: 'healthy',
                errorRate: 0,
                details: 'No recent financial errors detected'
            };
        }
        else if (errorRate < 5) {
            return {
                status: 'healthy',
                errorRate,
                details: 'Low error rate within normal parameters'
            };
        }
        else if (errorRate < 10) {
            return {
                status: 'warning',
                errorRate,
                details: 'Elevated error rate detected'
            };
        }
        else {
            return {
                status: 'critical',
                errorRate,
                details: 'High error rate requires attention'
            };
        }
    }
}
exports.FinancialErrorHandler = FinancialErrorHandler;
exports.financialErrorHandler = FinancialErrorHandler.getInstance();
exports.financialErrorMiddleware = exports.financialErrorHandler.middleware();
//# sourceMappingURL=financialErrorHandler.js.map