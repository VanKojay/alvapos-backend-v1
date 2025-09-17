"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiredSessionMiddleware = exports.optionalSessionMiddleware = void 0;
exports.sessionMiddleware = sessionMiddleware;
exports.validateSessionMiddleware = validateSessionMiddleware;
exports.setSessionData = setSessionData;
const session_1 = require("../utils/session");
const logger_1 = require("../utils/logger");
function sessionMiddleware(options = {}) {
    const { required = true, createIfMissing = true, cookieName = 'alva-session-id', headerName = 'x-session-id', } = options;
    return (req, res, next) => {
        try {
            let sessionId = req.cookies?.[cookieName] || req.headers[headerName];
            let session = null;
            if (sessionId) {
                session = session_1.sessionManager.getSession(sessionId);
                if (!session) {
                    logger_1.Logger.session(`Invalid or expired session ID: ${sessionId}`, {
                        sessionId,
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                    });
                }
            }
            if (!session && createIfMissing) {
                session = session_1.sessionManager.createSession(undefined, {
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                });
                sessionId = session.id;
                res.cookie(cookieName, sessionId, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: session.expiresAt.getTime() - Date.now(),
                    path: '/',
                });
                logger_1.Logger.session(`New session created: ${sessionId}`, {
                    sessionId,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                });
            }
            if (!session) {
                if (required) {
                    logger_1.Logger.security('Session required but not found', {
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
                req.sessionId = '';
                req.session = {};
                res.locals.sessionId = '';
                return next();
            }
            req.sessionId = sessionId;
            req.session = session;
            res.locals.sessionId = sessionId;
            logger_1.Logger.debug('Session accessed', {
                sessionId,
                method: req.method,
                url: req.url,
                ip: req.ip,
                lastAccess: session.lastAccessedAt.toISOString(),
            });
            next();
        }
        catch (error) {
            logger_1.Logger.error('Session middleware error', {
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
function validateSessionMiddleware() {
    return (req, res, next) => {
        if (!req.session || !req.sessionId) {
            return next();
        }
        try {
            const currentIp = req.ip;
            const currentUserAgent = req.get('User-Agent');
            const session = req.session;
            if (session.ipAddress && session.ipAddress !== currentIp) {
                logger_1.Logger.security('Session IP address mismatch detected', {
                    sessionId: req.sessionId,
                    originalIp: session.ipAddress,
                    currentIp,
                    userAgent: currentUserAgent,
                });
            }
            if (session.userAgent && session.userAgent !== currentUserAgent) {
                logger_1.Logger.security('Session user agent mismatch detected', {
                    sessionId: req.sessionId,
                    originalUserAgent: session.userAgent,
                    currentUserAgent,
                    ip: currentIp,
                });
            }
            next();
        }
        catch (error) {
            logger_1.Logger.error('Session validation error', {
                error: error instanceof Error ? error.message : String(error),
                sessionId: req.sessionId,
                ip: req.ip,
            });
            next();
        }
    };
}
function setSessionData(key, value) {
    return (req, res, next) => {
        if (req.sessionId) {
            session_1.sessionManager.setSessionData(req.sessionId, key, value);
        }
        next();
    };
}
exports.optionalSessionMiddleware = sessionMiddleware({
    required: false,
    createIfMissing: true,
});
exports.requiredSessionMiddleware = sessionMiddleware({
    required: true,
    createIfMissing: true,
});
//# sourceMappingURL=sessionMiddleware.js.map