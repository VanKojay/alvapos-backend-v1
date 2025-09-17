"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realtimeRouter = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const FinancialCalculationService_1 = require("../services/FinancialCalculationService");
const financialErrorHandler_1 = require("../middleware/financialErrorHandler");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
exports.realtimeRouter = router;
function handleValidationErrors(req, res, next) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const validationErrors = errors.array().map(error => ({
            field: error.type === 'field' ? error.path : error.type,
            message: error.msg,
            value: error.type === 'field' ? error.value : undefined
        }));
        const response = {
            success: false,
            error: 'Validation failed',
            message: 'Please check your input data',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        return res.status(400).json({
            ...response,
            validation_errors: validationErrors
        });
    }
    next();
}
const calculationValidation = [
    (0, express_validator_1.body)('cartData').notEmpty().withMessage('Cart data is required'),
    (0, express_validator_1.body)('taxRate').optional().isFloat({ min: 0, max: 1 }).withMessage('Tax rate must be between 0 and 1'),
    (0, express_validator_1.body)('quoteId').optional().isUUID().withMessage('Quote ID must be a valid UUID'),
    handleValidationErrors
];
router.post('/calculate', calculationValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const sessionId = res.locals.sessionId;
        const { cartData, taxRate = 0.10, quoteId } = req.body;
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID required for calculations',
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId
            });
        }
        const calculationResult = FinancialCalculationService_1.financialCalculationService.calculateComprehensiveCartTotals(cartData, taxRate);
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Financial calculation completed', {
            sessionId,
            quoteId,
            isValid: calculationResult.isValid,
            finalTotal: calculationResult.totals.finalTotal,
            calculationTime: responseTime
        });
        const response = {
            success: calculationResult.isValid,
            data: {
                calculation: {
                    totals: calculationResult.totals,
                    updatedCartData: calculationResult.updatedCartData,
                    isValid: calculationResult.isValid,
                    errors: calculationResult.errors,
                    calculationTime: responseTime
                },
                realTimeSync: {
                    success: false,
                    error: 'Real-time sync functionality temporarily disabled'
                }
            },
            message: calculationResult.isValid ? 'Calculation completed successfully' : 'Calculation completed with errors',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        const statusCode = calculationResult.isValid ? 200 : 400;
        res.status(statusCode).json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Financial calculation failed', {
            error: error instanceof Error ? error.message : String(error),
            sessionId: res.locals.sessionId,
            responseTime
        });
        const response = {
            success: false,
            error: 'Financial calculation failed',
            message: error instanceof Error ? error.message : 'Internal server error',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.post('/validate', calculationValidation, async (req, res) => {
    const startTime = Date.now();
    try {
        const { cartData } = req.body;
        const validationResult = FinancialCalculationService_1.financialCalculationService.validateCartData(cartData);
        const responseTime = Date.now() - startTime;
        logger_1.Logger.info('Cart data validation completed', {
            sessionId: res.locals.sessionId,
            isValid: validationResult.isValid,
            errorCount: validationResult.errors.length,
            responseTime
        });
        const response = {
            success: validationResult.isValid,
            data: {
                validation: validationResult,
                validationTime: responseTime
            },
            message: validationResult.isValid ? 'Cart data is valid' : 'Cart data validation failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        const statusCode = validationResult.isValid ? 200 : 400;
        res.status(statusCode).json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Cart data validation failed', {
            error: error instanceof Error ? error.message : String(error),
            sessionId: res.locals.sessionId,
            responseTime
        });
        const response = {
            success: false,
            error: 'Cart data validation failed',
            message: error instanceof Error ? error.message : 'Internal server error',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.get('/health', async (req, res) => {
    const startTime = Date.now();
    try {
        const errorStats = financialErrorHandler_1.financialErrorHandler.getErrorStats();
        const systemHealth = financialErrorHandler_1.financialErrorHandler.getSystemHealth();
        const responseTime = Date.now() - startTime;
        const response = {
            success: true,
            data: {
                systemHealth,
                errorStatistics: errorStats,
                realtimeConnections: {
                    activeConnections: 0,
                    status: 'disabled',
                    message: 'Real-time functionality temporarily disabled'
                },
                responseTime
            },
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        const statusCode = systemHealth.status === 'healthy' ? 200 :
            systemHealth.status === 'warning' ? 202 : 503;
        res.status(statusCode).json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Health check failed', {
            error: error instanceof Error ? error.message : String(error),
            responseTime
        });
        const response = {
            success: false,
            error: 'Health check failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.get('/errors', async (req, res) => {
    const startTime = Date.now();
    try {
        const errorStats = financialErrorHandler_1.financialErrorHandler.getErrorStats();
        const isHighErrorRate = financialErrorHandler_1.financialErrorHandler.isHighErrorRate();
        const responseTime = Date.now() - startTime;
        const response = {
            success: true,
            data: {
                ...errorStats,
                isHighErrorRate,
                monitoringTime: responseTime
            },
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Error statistics retrieval failed', {
            error: error instanceof Error ? error.message : String(error),
            responseTime
        });
        const response = {
            success: false,
            error: 'Error statistics retrieval failed',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.post('/format-currency', [
    (0, express_validator_1.body)('amounts').isArray().withMessage('Amounts must be an array'),
    (0, express_validator_1.body)('amounts.*').isNumeric().withMessage('Each amount must be numeric'),
    (0, express_validator_1.body)('locale').optional().isString().withMessage('Locale must be a string'),
    (0, express_validator_1.body)('currency').optional().isString().withMessage('Currency must be a string'),
    handleValidationErrors
], async (req, res) => {
    const startTime = Date.now();
    try {
        const { amounts, locale = 'en-US', currency = 'USD' } = req.body;
        const formattedAmounts = amounts.map((amount) => ({
            original: amount,
            formatted: FinancialCalculationService_1.financialCalculationService.formatCurrency(amount, locale, currency),
            rounded: FinancialCalculationService_1.financialCalculationService.roundCurrency(amount)
        }));
        const responseTime = Date.now() - startTime;
        const response = {
            success: true,
            data: {
                formattedAmounts,
                locale,
                currency,
                formatTime: responseTime
            },
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.json(response);
    }
    catch (error) {
        const responseTime = Date.now() - startTime;
        logger_1.Logger.error('Currency formatting failed', {
            error: error instanceof Error ? error.message : String(error),
            responseTime
        });
        const response = {
            success: false,
            error: 'Currency formatting failed',
            message: error instanceof Error ? error.message : 'Internal server error',
            timestamp: new Date().toISOString(),
            requestId: res.locals.requestId
        };
        res.status(500).json(response);
    }
});
router.post('/subscribe', (req, res) => {
    res.status(503).json({
        success: false,
        error: 'Service unavailable',
        message: 'Real-time subscription functionality temporarily disabled during PostgreSQL conversion',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
    });
});
router.delete('/subscribe', (req, res) => {
    res.status(503).json({
        success: false,
        error: 'Service unavailable',
        message: 'Real-time unsubscription functionality temporarily disabled during PostgreSQL conversion',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
    });
});
router.get('/status', (req, res) => {
    res.json({
        success: true,
        data: {
            sessionId: res.locals.sessionId,
            connectionState: {
                isConnected: false,
                status: 'disabled',
                message: 'Real-time functionality temporarily disabled'
            },
            systemStats: {
                activeConnections: 0,
                status: 'disabled'
            },
            timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
    });
});
router.post('/sync/:quoteId', (req, res) => {
    res.status(503).json({
        success: false,
        error: 'Service unavailable',
        message: 'Quote sync functionality temporarily disabled during PostgreSQL conversion',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
    });
});
router.get('/connections', (req, res) => {
    res.json({
        success: true,
        data: {
            activeConnections: [],
            stats: {
                activeConnections: 0,
                status: 'disabled',
                message: 'Real-time connections disabled'
            },
            responseTime: 0
        },
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
    });
});
router.post('/broadcast', (req, res) => {
    res.status(503).json({
        success: false,
        error: 'Service unavailable',
        message: 'Broadcast functionality temporarily disabled during PostgreSQL conversion',
        timestamp: new Date().toISOString(),
        requestId: res.locals.requestId
    });
});
//# sourceMappingURL=realtime.js.map