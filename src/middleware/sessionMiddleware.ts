import { Request, Response, NextFunction } from 'express';
import { sessionManager, SessionData } from '@/utils/session';
import { Logger } from '@/utils/logger';

// Extend Express Request interface to include session
declare global {
  namespace Express {
    interface Request {
      sessionId: string;
      session: SessionData;
    }
  }
}

export interface SessionMiddlewareOptions {
  required?: boolean;
  createIfMissing?: boolean;
  cookieName?: string;
  headerName?: string;
}

/**
 * Session middleware for managing browser-based sessions without authentication
 */
export function sessionMiddleware(options: SessionMiddlewareOptions = {}) {
  const {
    required = true,
    createIfMissing = true,
    cookieName = 'alva-session-id',
    headerName = 'x-session-id',
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Extract session ID from cookie or header
      let sessionId = req.cookies?.[cookieName] || req.headers[headerName] as string;
      let session: SessionData | null = null;

      // Try to get existing session
      if (sessionId) {
        session = sessionManager.getSession(sessionId);
        
        if (!session) {
          Logger.session(`Invalid or expired session ID: ${sessionId}`, {
            sessionId,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
          });
        }
      }

      // Create new session if needed
      if (!session && createIfMissing) {
        session = sessionManager.createSession(undefined, {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });
        sessionId = session.id;

        // Set session cookie with appropriate options
        res.cookie(cookieName, sessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: session.expiresAt.getTime() - Date.now(),
          path: '/',
        });

        Logger.session(`New session created: ${sessionId}`, {
          sessionId,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
      }

      // Handle missing session
      if (!session) {
        if (required) {
          Logger.security('Session required but not found', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.url,
          });

          res.status(401).json({
            error: 'Session required',
            message: 'A valid session is required to access this resource',
            code: 'SESSION_REQUIRED',
          });
          return;
        }

        // Set empty session data for optional session routes
        req.sessionId = '';
        req.session = {} as SessionData;
        res.locals.sessionId = '';
        return next();
      }

      // Attach session to request
      req.sessionId = sessionId;
      req.session = session;
      res.locals.sessionId = sessionId;

      // Log session access for monitoring
      Logger.debug('Session accessed', {
        sessionId,
        method: req.method,
        url: req.url,
        ip: req.ip,
        lastAccess: session.lastAccessedAt.toISOString(),
      });

      next();
    } catch (error) {
      Logger.error('Session middleware error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ip: req.ip,
        url: req.url,
      });

      res.status(500).json({
        error: 'Session management error',
        message: 'An error occurred while processing your session',
        code: 'SESSION_ERROR',
      });
    }
  };
}

/**
 * Middleware to validate session and prevent session hijacking
 */
export function validateSessionMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session || !req.sessionId) {
      return next();
    }

    try {
      const currentIp = req.ip;
      const currentUserAgent = req.get('User-Agent');
      const session = req.session;

      // Check for IP address changes (potential session hijacking)
      if (session.ipAddress && session.ipAddress !== currentIp) {
        Logger.security('Session IP address mismatch detected', {
          sessionId: req.sessionId,
          originalIp: session.ipAddress,
          currentIp,
          userAgent: currentUserAgent,
        });

        // In production, you might want to destroy the session
        // For now, just log the security event
      }

      // Check for user agent changes
      if (session.userAgent && session.userAgent !== currentUserAgent) {
        Logger.security('Session user agent mismatch detected', {
          sessionId: req.sessionId,
          originalUserAgent: session.userAgent,
          currentUserAgent,
          ip: currentIp,
        });
      }

      next();
    } catch (error) {
      Logger.error('Session validation error', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: req.sessionId,
        ip: req.ip,
      });

      next(); // Continue despite validation error
    }
  };
}

/**
 * Middleware to set session data
 */
export function setSessionData(key: string, value: any) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.sessionId) {
      sessionManager.setSessionData(req.sessionId, key, value);
    }
    next();
  };
}

/**
 * Middleware for optional session routes
 */
export const optionalSessionMiddleware = sessionMiddleware({
  required: false,
  createIfMissing: true,
});

/**
 * Middleware for required session routes
 */
export const requiredSessionMiddleware = sessionMiddleware({
  required: true,
  createIfMissing: true,
});