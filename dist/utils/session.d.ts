export interface SessionData {
    id: string;
    createdAt: Date;
    lastAccessedAt: Date;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
    data: Record<string, any>;
}
export declare class SessionManager {
    private sessions;
    private cleanupInterval;
    constructor();
    generateSessionId(): string;
    createSession(sessionId?: string, metadata?: {
        ipAddress?: string;
        userAgent?: string;
    }): SessionData;
    getSession(sessionId: string): SessionData | null;
    updateSession(sessionId: string, data: Record<string, any>): boolean;
    setSessionData(sessionId: string, key: string, value: any): boolean;
    getSessionData(sessionId: string, key: string): any;
    destroySession(sessionId: string): boolean;
    isValidSession(sessionId: string): boolean;
    getActiveSessions(): {
        total: number;
        sessions: Array<{
            id: string;
            createdAt: Date;
            lastAccessedAt: Date;
            expiresAt: Date;
        }>;
    };
    cleanupExpiredSessions(): number;
    private startCleanupTimer;
    stopCleanupTimer(): void;
    getStats(): {
        totalSessions: number;
        activeSessions: number;
        expiredSessions: number;
    };
}
export declare const sessionManager: SessionManager;
//# sourceMappingURL=session.d.ts.map