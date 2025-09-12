// ALVA POS MVP - Financial Error Handler Middleware
// TASK-B010 & TASK-B011: Comprehensive error handling for financial operations

import { Request, Response, NextFunction } from 'express';
import Decimal from 'decimal.js';
import { Logger } from '@/utils/logger';
import { ApiResponse, ValidationError } from '@/types/api';

export interface FinancialError extends Error {
  type: 'CALCULATION_ERROR' | 'VALIDATION_ERROR' | 'PRECISION_ERROR' | 'SYNC_ERROR' | 'TIMEOUT_ERROR';
  details?: any;
  recoverable?: boolean;
  context?: {
    operation?: string;
    data?: any;
    sessionId?: string;
    timestamp?: string;
  };
}

export class FinancialErrorHandler {
  private static instance: FinancialErrorHandler;

  // Error tracking for monitoring
  private errorCounts: Map<string, number> = new Map();
  private recentErrors: Array<{
    type: string;
    timestamp: string;
    sessionId?: string;
    operation?: string;
  }> = [];

  // Configuration
  private readonly MAX_RECENT_ERRORS = 100;
  private readonly ERROR_RESET_INTERVAL = 300000; // 5 minutes

  constructor() {
    this.setupErrorTracking();
  }

  public static getInstance(): FinancialErrorHandler {
    if (!FinancialErrorHandler.instance) {
      FinancialErrorHandler.instance = new FinancialErrorHandler();
    }
    return FinancialErrorHandler.instance;
  }

  /**
   * Setup periodic error tracking cleanup
   */
  private setupErrorTracking(): void {
    setInterval(() => {
      this.cleanupErrorTracking();
    }, this.ERROR_RESET_INTERVAL);
  }

  /**
   * Clean up old error tracking data
   */
  private cleanupErrorTracking(): void {
    const cutoffTime = Date.now() - this.ERROR_RESET_INTERVAL;
    
    this.recentErrors = this.recentErrors.filter(error => {
      return new Date(error.timestamp).getTime() > cutoffTime;
    });

    // Reset error counts periodically
    this.errorCounts.clear();

    Logger.debug('Financial error tracking cleaned up', {
      remainingErrors: this.recentErrors.length
    });
  }

  /**
   * Track financial error occurrence
   */
  private trackError(error: FinancialError, sessionId?: string): void {
    const errorKey = `${error.type}_${error.name}`;
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);

    // Store recent error for monitoring
    this.recentErrors.push({
      type: error.type,
      timestamp: new Date().toISOString(),
      sessionId,
      operation: error.context?.operation
    });

    // Limit recent errors array size
    if (this.recentErrors.length > this.MAX_RECENT_ERRORS) {
      this.recentErrors = this.recentErrors.slice(-this.MAX_RECENT_ERRORS);
    }
  }

  /**
   * Create standardized financial error
   */
  public createFinancialError(
    type: FinancialError['type'],
    message: string,
    details?: any,
    context?: FinancialError['context']
  ): FinancialError {
    const error = new Error(message) as FinancialError;
    error.type = type;
    error.details = details;
    error.context = {
      ...context,
      timestamp: new Date().toISOString()
    };
    error.recoverable = this.isRecoverableError(type);
    
    return error;
  }

  /**
   * Determine if error type is recoverable
   */
  private isRecoverableError(type: FinancialError['type']): boolean {
    switch (type) {
      case 'VALIDATION_ERROR':
        return true; // User can fix validation issues
      case 'TIMEOUT_ERROR':
        return true; // Can retry
      case 'SYNC_ERROR':
        return true; // Can retry sync
      case 'CALCULATION_ERROR':
        return false; // Indicates system issue
      case 'PRECISION_ERROR':
        return false; // Indicates serious calculation issue
      default:
        return false;
    }
  }

  /**
   * Handle Decimal.js specific errors
   */
  public handleDecimalError(error: any, context?: FinancialError['context']): FinancialError {
    let message = 'Decimal calculation error occurred';
    let type: FinancialError['type'] = 'PRECISION_ERROR';

    if (error.message) {
      if (error.message.includes('Invalid argument')) {
        message = 'Invalid numeric value provided for calculation';
        type = 'VALIDATION_ERROR';
      } else if (error.message.includes('Division by zero')) {
        message = 'Division by zero attempted in calculation';
        type = 'CALCULATION_ERROR';
      } else if (error.message.includes('precision')) {
        message = 'Precision limit exceeded in calculation';
        type = 'PRECISION_ERROR';
      }
    }

    return this.createFinancialError(type, message, {
      originalError: error.message,
      stack: error.stack
    }, context);
  }

  /**
   * Handle calculation validation errors
   */
  public handleValidationErrors(
    errors: ValidationError[],
    operation: string,
    context?: FinancialError['context']
  ): FinancialError {
    const message = `Validation failed for ${operation}: ${errors.length} error(s) found`;
    
    return this.createFinancialError('VALIDATION_ERROR', message, {
      validationErrors: errors,
      errorCount: errors.length
    }, { ...context, operation });
  }

  /**
   * Handle real-time sync errors
   */
  public handleSyncError(error: any, sessionId: string, operation: string): FinancialError {
    let message = 'Real-time synchronization failed';
    let type: FinancialError['type'] = 'SYNC_ERROR';

    if (error.message) {
      if (error.message.includes('timeout')) {
        message = 'Real-time sync operation timed out';
        type = 'TIMEOUT_ERROR';
      } else if (error.message.includes('connection')) {
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

  /**
   * Express middleware for handling financial errors
   */
  public middleware() {
    return (error: any, req: Request, res: Response, next: NextFunction): void => {
      const sessionId = res.locals.sessionId;
      const requestId = res.locals.requestId;

      // Check if this is a financial error
      if (this.isFinancialError(error)) {
        const financialError = error as FinancialError;
        this.handleFinancialError(financialError, req, res, sessionId, requestId);
        return;
      }

      // Check if this is a Decimal.js error
      if (this.isDecimalError(error)) {
        const financialError = this.handleDecimalError(error, {
          operation: req.method + ' ' + req.path,
          sessionId
        });
        this.handleFinancialError(financialError, req, res, sessionId, requestId);
        return;
      }

      // Check if this is a validation error related to financial data
      if (this.isFinancialValidationError(error, req)) {
        const validationErrors: ValidationError[] = error.validationErrors || [
          { field: 'unknown', message: error.message }
        ];
        const financialError = this.handleValidationErrors(
          validationErrors,
          req.method + ' ' + req.path,
          { sessionId }
        );
        this.handleFinancialError(financialError, req, res, sessionId, requestId);
        return;
      }

      // Not a financial error, pass to next error handler
      next(error);
    };
  }

  /**
   * Handle financial error and send response
   */
  private handleFinancialError(
    error: FinancialError,
    req: Request,
    res: Response,
    sessionId?: string,
    requestId?: string
  ): void {
    // Track the error
    this.trackError(error, sessionId);

    // Log the error with appropriate level
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
        Logger.error('Financial operation error', logData);
        break;
      case 'warn':
        Logger.warn('Financial operation warning', logData);
        break;
      default:
        Logger.info('Financial operation issue', logData);
    }

    // Determine HTTP status code
    const statusCode = this.getStatusCode(error.type);

    // Create API response
    const response: ApiResponse = {
      success: false,
      error: this.getPublicErrorMessage(error),
      message: error.recoverable ? 'Please review your input and try again' : 'A system error occurred',
      timestamp: new Date().toISOString(),
      requestId
    };

    // Add validation errors if present
    if (error.type === 'VALIDATION_ERROR' && error.details?.validationErrors) {
      (response as any).validation_errors = error.details.validationErrors;
    }

    // Add recovery suggestions for recoverable errors
    if (error.recoverable) {
      (response as any).suggestions = this.getRecoverySuggestions(error.type);
    }

    res.status(statusCode).json(response);
  }

  /**
   * Determine if error is a financial error
   */
  private isFinancialError(error: any): boolean {
    return error && typeof error.type === 'string' && 
           ['CALCULATION_ERROR', 'VALIDATION_ERROR', 'PRECISION_ERROR', 'SYNC_ERROR', 'TIMEOUT_ERROR']
           .includes(error.type);
  }

  /**
   * Determine if error is a Decimal.js error
   */
  private isDecimalError(error: any): boolean {
    return error && (
      error.constructor?.name === 'DecimalError' ||
      error.name === 'DecimalError' ||
      (error.message && error.message.includes('Decimal'))
    );
  }

  /**
   * Determine if error is financial validation related
   */
  private isFinancialValidationError(error: any, req: Request): boolean {
    const financialPaths = ['/api/quotes', '/api/realtime/calculate', '/api/realtime/validate'];
    const isFinancialPath = financialPaths.some(path => req.path.includes(path));
    
    return isFinancialPath && (
      (error.validationErrors && Array.isArray(error.validationErrors)) ||
      (error.message && error.message.includes('validation')) ||
      (error.message && error.message.includes('cart')) ||
      (error.message && error.message.includes('discount')) ||
      (error.message && error.message.includes('price'))
    );
  }

  /**
   * Get appropriate log level for error type
   */
  private getLogLevel(type: FinancialError['type']): 'error' | 'warn' | 'info' {
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

  /**
   * Get HTTP status code for error type
   */
  private getStatusCode(type: FinancialError['type']): number {
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

  /**
   * Get user-friendly error message
   */
  private getPublicErrorMessage(error: FinancialError): string {
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

  /**
   * Get recovery suggestions for error type
   */
  private getRecoverySuggestions(type: FinancialError['type']): string[] {
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

  /**
   * Get error statistics for monitoring
   */
  public getErrorStats(): {
    errorCounts: Record<string, number>;
    recentErrorCount: number;
    errorTypes: Record<string, number>;
  } {
    const errorTypes: Record<string, number> = {};
    
    this.recentErrors.forEach(error => {
      errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
    });

    return {
      errorCounts: Object.fromEntries(this.errorCounts),
      recentErrorCount: this.recentErrors.length,
      errorTypes
    };
  }

  /**
   * Check if system is experiencing high error rates
   */
  public isHighErrorRate(): boolean {
    const recentErrorsCount = this.recentErrors.filter(error => {
      const errorTime = new Date(error.timestamp).getTime();
      const fiveMinutesAgo = Date.now() - 300000; // 5 minutes
      return errorTime > fiveMinutesAgo;
    }).length;

    // Consider high error rate if more than 10 errors in 5 minutes
    return recentErrorsCount > 10;
  }

  /**
   * Get system health based on error rates
   */
  public getSystemHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    errorRate: number;
    details: string;
  } {
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
    } else if (errorRate < 5) {
      return {
        status: 'healthy',
        errorRate,
        details: 'Low error rate within normal parameters'
      };
    } else if (errorRate < 10) {
      return {
        status: 'warning',
        errorRate,
        details: 'Elevated error rate detected'
      };
    } else {
      return {
        status: 'critical',
        errorRate,
        details: 'High error rate requires attention'
      };
    }
  }
}

// Export singleton instance and middleware
export const financialErrorHandler = FinancialErrorHandler.getInstance();
export const financialErrorMiddleware = financialErrorHandler.middleware();