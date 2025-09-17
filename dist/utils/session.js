"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionManager = exports.SessionManager = void 0;
const uuid_1 = require("uuid");
const environment_1 = require("../config/environment");
const logger_1 = require("./logger");
class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.cleanupInterval = null;
        this.startCleanupTimer();
    }
    generateSessionId() {
        return (0, uuid_1.v4)();
    }
    createSession(sessionId, metadata) {
        const id = sessionId || this.generateSessionId();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + environment_1.config.session.timeout);
        const session = {
            id,
            createdAt: now,
            lastAccessedAt: now,
            expiresAt,
            data: {},
        };
        if (metadata?.ipAddress) {
            session.ipAddress = metadata.ipAddress;
        }
        if (metadata?.userAgent) {
            session.userAgent = metadata.userAgent;
        }
        this.sessions.set(id, session);
        logger_1.Logger.session(`Session created: ${id}`, {
            sessionId: id,
            expiresAt: expiresAt.toISOString(),
            ipAddress: metadata?.ipAddress,
        });
        return session;
    }
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }
        if (new Date() > session.expiresAt) {
            this.destroySession(sessionId);
            return null;
        }
        const now = new Date();
        session.lastAccessedAt = now;
        session.expiresAt = new Date(now.getTime() + environment_1.config.session.timeout);
        return session;
    }
    updateSession(sessionId, data) {
        const session = this.getSession(sessionId);
        if (!session) {
            return false;
        }
        session.data = { ...session.data, ...data };
        session.lastAccessedAt = new Date();
        logger_1.Logger.session(`Session updated: ${sessionId}`, {
            sessionId,
            dataKeys: Object.keys(data),
        });
        return true;
    }
    setSessionData(sessionId, key, value) {
        const session = this.getSession(sessionId);
        if (!session) {
            return false;
        }
        session.data[key] = value;
        session.lastAccessedAt = new Date();
        return true;
    }
    getSessionData(sessionId, key) {
        const session = this.getSession(sessionId);
        if (!session) {
            return null;
        }
        return session.data[key];
    }
    destroySession(sessionId) {
        const existed = this.sessions.has(sessionId);
        this.sessions.delete(sessionId);
        if (existed) {
            logger_1.Logger.session(`Session destroyed: ${sessionId}`, { sessionId });
        }
        return existed;
    }
    isValidSession(sessionId) {
        return this.getSession(sessionId) !== null;
    }
    getActiveSessions() {
        const activeSessions = Array.from(this.sessions.values())
            .filter(session => new Date() <= session.expiresAt)
            .map(session => ({
            id: session.id,
            createdAt: session.createdAt,
            lastAccessedAt: session.lastAccessedAt,
            expiresAt: session.expiresAt,
        }));
        return {
            total: activeSessions.length,
            sessions: activeSessions,
        };
    }
    cleanupExpiredSessions() {
        const now = new Date();
        let cleanedCount = 0;
        for (const [sessionId, session] of this.sessions.entries()) {
            if (now > session.expiresAt) {
                this.sessions.delete(sessionId);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            logger_1.Logger.session(`Cleaned up ${cleanedCount} expired sessions`);
        }
        return cleanedCount;
    }
    startCleanupTimer() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredSessions();
        }, environment_1.config.session.cleanupInterval);
        logger_1.Logger.session(`Session cleanup timer started (interval: ${environment_1.config.session.cleanupInterval}ms)`);
    }
    stopCleanupTimer() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            logger_1.Logger.session('Session cleanup timer stopped');
        }
    }
    getStats() {
        const now = new Date();
        let activeSessions = 0;
        let expiredSessions = 0;
        for (const session of this.sessions.values()) {
            if (now <= session.expiresAt) {
                activeSessions++;
            }
            else {
                expiredSessions++;
            }
        }
        return {
            totalSessions: this.sessions.size,
            activeSessions,
            expiredSessions,
        };
    }
}
exports.SessionManager = SessionManager;
exports.sessionManager = new SessionManager();
//# sourceMappingURL=session.js.map