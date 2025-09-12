import { v4 as uuidv4 } from 'uuid';
import { config } from '@/config/environment';
import { Logger } from '@/utils/logger';

export interface SessionData {
  id: string;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  data: Record<string, any>;
}

export class SessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Generate a new session ID
   */
  generateSessionId(): string {
    return uuidv4();
  }

  /**
   * Create a new session
   */
  createSession(sessionId?: string, metadata?: { ipAddress?: string; userAgent?: string }): SessionData {
    const id = sessionId || this.generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.session.timeout);

    const session: SessionData = {
      id,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt,
      data: {},
    };

    // Only set optional properties if they have actual values
    if (metadata?.ipAddress) {
      session.ipAddress = metadata.ipAddress;
    }
    if (metadata?.userAgent) {
      session.userAgent = metadata.userAgent;
    }

    this.sessions.set(id, session);
    
    Logger.session(`Session created: ${id}`, {
      sessionId: id,
      expiresAt: expiresAt.toISOString(),
      ipAddress: metadata?.ipAddress,
    });

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    // Check if session is expired
    if (new Date() > session.expiresAt) {
      this.destroySession(sessionId);
      return null;
    }

    // Update last accessed time and extend expiration
    const now = new Date();
    session.lastAccessedAt = now;
    session.expiresAt = new Date(now.getTime() + config.session.timeout);

    return session;
  }

  /**
   * Update session data
   */
  updateSession(sessionId: string, data: Record<string, any>): boolean {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

    session.data = { ...session.data, ...data };
    session.lastAccessedAt = new Date();

    Logger.session(`Session updated: ${sessionId}`, {
      sessionId,
      dataKeys: Object.keys(data),
    });

    return true;
  }

  /**
   * Set specific session data
   */
  setSessionData(sessionId: string, key: string, value: any): boolean {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }

    session.data[key] = value;
    session.lastAccessedAt = new Date();

    return true;
  }

  /**
   * Get specific session data
   */
  getSessionData(sessionId: string, key: string): any {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    return session.data[key];
  }

  /**
   * Destroy session
   */
  destroySession(sessionId: string): boolean {
    const existed = this.sessions.has(sessionId);
    this.sessions.delete(sessionId);
    
    if (existed) {
      Logger.session(`Session destroyed: ${sessionId}`, { sessionId });
    }

    return existed;
  }

  /**
   * Check if session exists and is valid
   */
  isValidSession(sessionId: string): boolean {
    return this.getSession(sessionId) !== null;
  }

  /**
   * Get all active sessions (for monitoring)
   */
  getActiveSessions(): { total: number; sessions: Array<{ id: string; createdAt: Date; lastAccessedAt: Date; expiresAt: Date }> } {
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

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): number {
    const now = new Date();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      Logger.session(`Cleaned up ${cleanedCount} expired sessions`);
    }

    return cleanedCount;
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, config.session.cleanupInterval);

    Logger.session(`Session cleanup timer started (interval: ${config.session.cleanupInterval}ms)`);
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      Logger.session('Session cleanup timer stopped');
    }
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
  } {
    const now = new Date();
    let activeSessions = 0;
    let expiredSessions = 0;

    for (const session of this.sessions.values()) {
      if (now <= session.expiresAt) {
        activeSessions++;
      } else {
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

// Global session manager instance
export const sessionManager = new SessionManager();