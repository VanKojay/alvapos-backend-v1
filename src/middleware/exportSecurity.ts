// ALVA POS MVP - Export Security Middleware
// Basic security for export operations

import { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest {
  user?: {
    id: string;
    permissions: string[];
    role: string;
  };
  sessionId?: string;
  clientIP?: string;
  ip?: string;
  body?: any;
  query?: any;
}

// Basic rate limiting using in-memory store (for MVP only)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // 100 requests per window

// Simple rate limiting middleware
function basicRateLimit() {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    
    let clientData = rateLimitStore.get(clientId);
    
    // Reset if window expired
    if (!clientData || now > clientData.resetTime) {
      clientData = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
      rateLimitStore.set(clientId, clientData);
    }
    
    // Check rate limit
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

// Basic input sanitization
function sanitizeInput() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }
    next();
  };
}

// Security headers middleware
function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.removeHeader('X-Powered-By');
    next();
  };
}

// Helper function to sanitize objects
function sanitizeObject(obj: any): any {
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
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
}

export { securityHeaders, sanitizeInput, basicRateLimit };