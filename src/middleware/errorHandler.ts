import { Request, Response, NextFunction } from 'express';
import { Logger } from '@/utils/logger';
import { config } from '@/config/environment';

export interface APIError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
  isOperational?: boolean;
}

export class AppError extends Error implements APIError {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;
  public details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_SERVER_ERROR',
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error classes
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND', true);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED', true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN', true);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT', true);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed', details?: any) {
    super(message, 500, 'DATABASE_ERROR', true, details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string = 'External service error') {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR', true);
  }
}

/**
 * Error response interface
 */
interface ErrorResponse {
  error: string;
  message: string;
  code: string;
  details?: any;
  timestamp: string;
  requestId?: string;
  path: string;
  method: string;
  stack?: string;
}

/**
 * Format error for API response
 */
function formatError(error: APIError, req: Request): ErrorResponse {
  const response: ErrorResponse = {
    error: error.name || 'Error',
    message: error.message,
    code: error.code || 'UNKNOWN_ERROR',
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  };

  // Add request ID if available
  if (req.headers['x-request-id']) {
    response.requestId = req.headers['x-request-id'] as string;
  }

  // Add details if available
  if (error.details) {
    response.details = error.details;
  }

  // Add stack trace in development
  if (config.isDevelopment && error.stack) {
    response.stack = error.stack;
  }

  return response;
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  error: APIError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  // Default error values
  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational !== false;

  // Log error with context
  const logContext = {
    requestId: req.headers['x-request-id'] as string,
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
    Logger.error(error.message, {
      ...logContext,
      stack: error.stack,
      details: error.details,
    });
  } else if (statusCode >= 400) {
    Logger.warn(error.message, logContext);
  }

  // Send error response
  const errorResponse = formatError(error, req);
  res.status(statusCode).json(errorResponse);
}

/**
 * Handle unhandled routes (404)
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const error = new NotFoundError(`Route ${req.method} ${req.path}`);
  next(error);
}

/**
 * Handle uncaught exceptions
 */
export function handleUncaughtException(error: Error): void {
  Logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });

  // Exit process in production
  if (config.isProduction) {
    process.exit(1);
  }
}

/**
 * Handle unhandled promise rejections
 */
export function handleUnhandledRejection(reason: any, promise: Promise<any>): void {
  Logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });

  // Exit process in production
  if (config.isProduction) {
    process.exit(1);
  }
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<any>
) {
  return (req: T, res: U, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation error handler for Joi
 */
export function handleValidationError(error: any): ValidationError {
  if (error.isJoi) {
    const details = error.details.map((detail: any) => ({
      field: detail.context?.key,
      message: detail.message.replace(/"/g, ''),
      value: detail.context?.value,
    }));

    return new ValidationError('Validation failed', details);
  }
  
  return error;
}