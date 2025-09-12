// ALVA POS MVP - Calculation API Routes (formerly Real-Time)
// Real-time sync functionality temporarily disabled - PostgreSQL conversion

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { financialCalculationService } from '@/services/FinancialCalculationService';
import { financialErrorHandler } from '@/middleware/financialErrorHandler';
import { Logger } from '@/utils/logger';
import { 
  ApiResponse, 
  CartData,
  ValidationError
} from '@/types/api';

const router = Router();

// ===========================================
// MIDDLEWARE & VALIDATION
// ===========================================

/**
 * Handle validation errors
 */
function handleValidationErrors(req: Request, res: Response, next: any) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map(error => ({
      field: error.type === 'field' ? (error as any).path : error.type,
      message: error.msg,
      value: error.type === 'field' ? (error as any).value : undefined
    }));

    const response: ApiResponse = {
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

// ===========================================
// VALIDATION RULES
// ===========================================

const calculationValidation = [
  body('cartData').notEmpty().withMessage('Cart data is required'),
  body('taxRate').optional().isFloat({ min: 0, max: 1 }).withMessage('Tax rate must be between 0 and 1'),
  body('quoteId').optional().isUUID().withMessage('Quote ID must be a valid UUID'),
  handleValidationErrors
];

// ===========================================
// CALCULATION ENDPOINTS (NON-REAL-TIME)
// ===========================================

/**
 * POST /api/realtime/calculate - Perform financial calculations
 * Note: Real-time sync functionality disabled in PostgreSQL conversion
 */
router.post('/calculate', calculationValidation, async (req: Request, res: Response) => {
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

    // Perform comprehensive financial calculation
    const calculationResult = financialCalculationService.calculateComprehensiveCartTotals(
      cartData,
      taxRate
    );

    const responseTime = Date.now() - startTime;
    Logger.info('Financial calculation completed', {
      sessionId,
      quoteId,
      isValid: calculationResult.isValid,
      finalTotal: calculationResult.totals.finalTotal,
      calculationTime: responseTime
    });

    const response: ApiResponse = {
      success: calculationResult.isValid,
      data: {
        calculation: {
          totals: calculationResult.totals,
          updatedCartData: calculationResult.updatedCartData,
          isValid: calculationResult.isValid,
          errors: calculationResult.errors,
          calculationTime: responseTime
        },
        // Note: Real-time sync disabled for PostgreSQL conversion
        realTimeSync: {
          success: false,
          error: 'Real-time sync functionality temporarily disabled'
        }
      },
      message: calculationResult.isValid ? 'Calculation completed successfully' : 'Calculation completed with errors',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    // Return appropriate status code based on validation
    const statusCode = calculationResult.isValid ? 200 : 400;
    res.status(statusCode).json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Financial calculation failed', {
      error: error instanceof Error ? error.message : String(error),
      sessionId: res.locals.sessionId,
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Financial calculation failed',
      message: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * POST /api/realtime/validate - Validate cart data without calculation
 */
router.post('/validate', calculationValidation, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { cartData } = req.body;

    // Perform validation using financial calculation service
    const validationResult = financialCalculationService.validateCartData(cartData);

    const responseTime = Date.now() - startTime;
    Logger.info('Cart data validation completed', {
      sessionId: res.locals.sessionId,
      isValid: validationResult.isValid,
      errorCount: validationResult.errors.length,
      responseTime
    });

    const response: ApiResponse = {
      success: validationResult.isValid,
      data: {
        validation: validationResult,
        validationTime: responseTime
      },
      message: validationResult.isValid ? 'Cart data is valid' : 'Cart data validation failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    // Return appropriate status code based on validation
    const statusCode = validationResult.isValid ? 200 : 400;
    res.status(statusCode).json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Cart data validation failed', {
      error: error instanceof Error ? error.message : String(error),
      sessionId: res.locals.sessionId,
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Cart data validation failed',
      message: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

// ===========================================
// SYSTEM HEALTH ENDPOINTS
// ===========================================

/**
 * GET /api/realtime/health - Get system health for financial operations
 */
router.get('/health', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const errorStats = financialErrorHandler.getErrorStats();
    const systemHealth = financialErrorHandler.getSystemHealth();

    const responseTime = Date.now() - startTime;

    const response: ApiResponse = {
      success: true,
      data: {
        systemHealth,
        errorStatistics: errorStats,
        // Note: Real-time connections disabled for PostgreSQL conversion
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

    // Return warning status if system health is not healthy
    const statusCode = systemHealth.status === 'healthy' ? 200 : 
                      systemHealth.status === 'warning' ? 202 : 503;

    res.status(statusCode).json(response);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Health check failed', {
      error: error instanceof Error ? error.message : String(error),
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

/**
 * GET /api/realtime/errors - Get error statistics for monitoring
 */
router.get('/errors', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const errorStats = financialErrorHandler.getErrorStats();
    const isHighErrorRate = financialErrorHandler.isHighErrorRate();

    const responseTime = Date.now() - startTime;

    const response: ApiResponse = {
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

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Error statistics retrieval failed', {
      error: error instanceof Error ? error.message : String(error),
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Error statistics retrieval failed',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

// ===========================================
// CURRENCY FORMATTING UTILITY ENDPOINT
// ===========================================

/**
 * POST /api/realtime/format-currency - Format currency values for display
 */
router.post('/format-currency', [
  body('amounts').isArray().withMessage('Amounts must be an array'),
  body('amounts.*').isNumeric().withMessage('Each amount must be numeric'),
  body('locale').optional().isString().withMessage('Locale must be a string'),
  body('currency').optional().isString().withMessage('Currency must be a string'),
  handleValidationErrors
], async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { amounts, locale = 'en-US', currency = 'USD' } = req.body;

    const formattedAmounts = amounts.map((amount: number) => ({
      original: amount,
      formatted: financialCalculationService.formatCurrency(amount, locale, currency),
      rounded: financialCalculationService.roundCurrency(amount)
    }));

    const responseTime = Date.now() - startTime;

    const response: ApiResponse = {
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

  } catch (error) {
    const responseTime = Date.now() - startTime;
    Logger.error('Currency formatting failed', {
      error: error instanceof Error ? error.message : String(error),
      responseTime
    });

    const response: ApiResponse = {
      success: false,
      error: 'Currency formatting failed',
      message: error instanceof Error ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      requestId: res.locals.requestId
    };

    res.status(500).json(response);
  }
});

// ===========================================
// DISABLED ENDPOINTS - REAL-TIME FUNCTIONALITY
// ===========================================

/**
 * Real-time subscription endpoints are disabled for PostgreSQL conversion
 * These can be re-enabled later with WebSocket implementation
 */

router.post('/subscribe', (req: Request, res: Response) => {
  res.status(503).json({
    success: false,
    error: 'Service unavailable',
    message: 'Real-time subscription functionality temporarily disabled during PostgreSQL conversion',
    timestamp: new Date().toISOString(),
    requestId: res.locals.requestId
  });
});

router.delete('/subscribe', (req: Request, res: Response) => {
  res.status(503).json({
    success: false,
    error: 'Service unavailable', 
    message: 'Real-time unsubscription functionality temporarily disabled during PostgreSQL conversion',
    timestamp: new Date().toISOString(),
    requestId: res.locals.requestId
  });
});

router.get('/status', (req: Request, res: Response) => {
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

router.post('/sync/:quoteId', (req: Request, res: Response) => {
  res.status(503).json({
    success: false,
    error: 'Service unavailable',
    message: 'Quote sync functionality temporarily disabled during PostgreSQL conversion',
    timestamp: new Date().toISOString(),
    requestId: res.locals.requestId
  });
});

router.get('/connections', (req: Request, res: Response) => {
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

router.post('/broadcast', (req: Request, res: Response) => {
  res.status(503).json({
    success: false,
    error: 'Service unavailable',
    message: 'Broadcast functionality temporarily disabled during PostgreSQL conversion',
    timestamp: new Date().toISOString(),
    requestId: res.locals.requestId
  });
});

export { router as realtimeRouter };