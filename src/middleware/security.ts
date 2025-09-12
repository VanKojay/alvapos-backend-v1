import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import helmet from 'helmet';
import cors from 'cors';
import Joi from 'joi';
import { config } from '@/config/environment';
import { Logger } from '@/utils/logger';
import { RateLimitError, ValidationError, handleValidationError } from './errorHandler';

/**
 * CORS configuration
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (config.cors.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    Logger.security('CORS origin rejected', { origin });
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
  maxAge: 86400, // 24 hours
});

/**
 * Helmet security headers
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: config.isProduction ? undefined : false,
  crossOriginEmbedderPolicy: false, // Allow file uploads
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

/**
 * Basic rate limiter
 */
export const basicRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  skipSuccessfulRequests: config.rateLimit.skipSuccessfulRequests,
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    Logger.security('Rate limit exceeded', {
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

/**
 * Advanced rate limiter for sensitive operations
 */
const sensitiveRateLimiter = new RateLimiterMemory({
  points: 10, // Number of requests
  duration: 60, // Per 60 seconds
  blockDuration: 300, // Block for 5 minutes if limit exceeded
});

export function advancedRateLimiter() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = req.ip || 'unknown';
      await sensitiveRateLimiter.consume(key);
      next();
    } catch (rejRes: any) {
      const remainingTime = Math.ceil(rejRes.msBeforeNext / 1000);
      
      Logger.security('Advanced rate limit exceeded', {
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


// export const sensitiveRateLimiterMiddleware = (req: Request, res: Response, next: NextFunction) => {
//   sensitiveRateLimiter.consume(req.ip)
//     .then(() => {
//       next();
//     })
//     .catch(() => {
//       res.status(429).json({
//         message: 'Terlalu banyak percobaan. Coba lagi nanti.',
//       });
//     });
// };

/**
 * Input sanitization middleware
 */
export function sanitizeInput() {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Sanitize query parameters
      if (req.query) {
        req.query = sanitizeObject(req.query);
      }

      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
      }

      next();
    } catch (error) {
      Logger.error('Input sanitization error', {
        error: error instanceof Error ? error.message : String(error),
        ip: req.ip,
        url: req.url,
      });
      
      next(new ValidationError('Invalid input data'));
    }
  };
}


/**
 * Sanitize object properties
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
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

/**
 * Sanitize string inputs
 */
function sanitizeString(str: string): string {
  if (typeof str !== 'string') {
    return str;
  }

  // Remove potential script tags and dangerous characters
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:text\/html/gi, '')
    .trim();
}

/**
 * Request validation middleware
 */
export function validateRequest(schema: {
  body?: Joi.Schema;
  query?: Joi.Schema;
  params?: Joi.Schema;
  headers?: Joi.Schema;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const errors: Array<{ field: string; message: string }> = [];

      // Validate request body
      if (schema.body && req.body) {
        const { error } = schema.body.validate(req.body, { abortEarly: false });
        if (error) {
          const validationError = handleValidationError(error);
          throw validationError;
        }
      }

      // Validate query parameters
      if (schema.query && req.query) {
        const { error } = schema.query.validate(req.query, { abortEarly: false });
        if (error) {
          const validationError = handleValidationError(error);
          throw validationError;
        }
      }

      // Validate URL parameters
      if (schema.params && req.params) {
        const { error } = schema.params.validate(req.params, { abortEarly: false });
        if (error) {
          const validationError = handleValidationError(error);
          throw validationError;
        }
      }

      // Validate headers
      if (schema.headers && req.headers) {
        const { error } = schema.headers.validate(req.headers, { abortEarly: false });
        if (error) {
          const validationError = handleValidationError(error);
          throw validationError;
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Request ID middleware
 */
export function requestIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] as string || 
                      `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    res.locals.requestId = requestId;
    
    next();
  };
}

/**
 * Security headers middleware
 */
export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Remove sensitive headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    if (config.isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    next();
  };
}

/**
 * File upload security middleware
 */
export function validateFileUpload() {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const contentType = req.headers['content-type'];
    const contentLength = req.headers['content-length'];

    // Check content type
    if (contentType && !config.fileUpload.allowedTypes.some((type: string) => contentType.includes(type))) {
      Logger.security('Invalid file type upload attempt', {
        contentType,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.status(400).json({
        error: 'Invalid File Type',
        message: 'File type not allowed',
        code: 'INVALID_FILE_TYPE',
        allowedTypes: config.fileUpload.allowedTypes,
      });
      return;
    }

    // Check file size
    if (contentLength && parseInt(contentLength) > config.fileUpload.maxSize) {
      Logger.security('File size limit exceeded', {
        contentLength,
        maxSize: config.fileUpload.maxSize,
        ip: req.ip,
      });

      res.status(413).json({
        error: 'File Too Large',
        message: `File size exceeds limit of ${config.fileUpload.maxSize} bytes`,
        code: 'FILE_TOO_LARGE',
        maxSize: config.fileUpload.maxSize,
      });
      return;
    }

    next();
  };
}