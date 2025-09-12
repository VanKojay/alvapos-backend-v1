import { Router, Request, Response } from 'express';
import { config } from '@/config/environment';
import { database } from '@/config/database';
import { sessionManager } from '@/utils/session';
import { Logger } from '@/utils/logger';
import { asyncHandler } from '@/middleware/errorHandler';

export const healthRoutes = Router();

/**
 * Basic health check endpoint
 */
healthRoutes.get('/', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Basic server health
    const serverHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.env,
      uptime: process.uptime(),
      pid: process.pid,
      nodeVersion: process.version,
    };

    const responseTime = Date.now() - startTime;

    res.json({
      ...serverHealth,
      responseTime,
    });
  } catch (error) {
    Logger.error('Health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
}));

/**
 * Detailed health check with all services
 */
healthRoutes.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Database health
    const databaseHealth = await database.getHealthStatus();
    
    // Session manager health
    const sessionStats = sessionManager.getStats();
    const sessionHealth = {
      status: 'healthy',
      statistics: sessionStats,
      cleanupActive: true, // Cleanup timer should be running
    };

    // Memory usage
    const memoryUsage = process.memoryUsage();
    const memoryHealth = {
      status: memoryUsage.heapUsed < (memoryUsage.heapTotal * 0.9) ? 'healthy' : 'warning',
      usage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      },
      unit: 'MB',
    };

    // Overall status determination
    const allHealthy = [
      databaseHealth.status === 'healthy',
      sessionHealth.status === 'healthy',
      memoryHealth.status === 'healthy',
    ].every(Boolean);

    const overallStatus = allHealthy ? 'healthy' : 'degraded';
    const responseTime = Date.now() - startTime;

    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: config.env,
      responseTime,
      services: {
        server: {
          status: 'healthy',
          uptime: process.uptime(),
          pid: process.pid,
          nodeVersion: process.version,
        },
        database: databaseHealth,
        sessions: sessionHealth,
        memory: memoryHealth,
      },
      configuration: {
        port: config.port,
        sessionTimeout: config.session.timeout,
        rateLimitWindow: config.rateLimit.windowMs,
        maxFileSize: config.fileUpload.maxSize,
      },
    });
  } catch (error) {
    Logger.error('Detailed health check failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Detailed health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}));

/**
 * Liveness probe (for Kubernetes/Docker)
 */
healthRoutes.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - if server is responding, it's alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness probe (for Kubernetes/Docker)
 */
healthRoutes.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  try {
    // Check if all critical services are ready
    const databaseReady = await database.testConnection();
    
    if (databaseReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        reason: 'Database connection failed',
      });
    }
  } catch (error) {
    Logger.error('Readiness check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      reason: 'Readiness check failed',
    });
  }
}));

/**
 * Database connection test endpoint
 */
healthRoutes.get('/database', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const connectionTest = await database.testConnection();
    const healthStatus = await database.getHealthStatus();
    const responseTime = Date.now() - startTime;

    if (connectionTest) {
      res.json({
        status: 'healthy',
        connection: true,
        responseTime,
        details: healthStatus.details,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        connection: false,
        responseTime,
        details: healthStatus.details,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    Logger.error('Database health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      status: 'error',
      connection: false,
      error: error instanceof Error ? error.message : 'Database health check failed',
      timestamp: new Date().toISOString(),
    });
  }
}));

/**
 * Session manager status endpoint
 */
healthRoutes.get('/sessions', (req: Request, res: Response) => {
  try {
    const stats = sessionManager.getStats();
    const activeSessions = sessionManager.getActiveSessions();

    res.json({
      status: 'healthy',
      statistics: stats,
      activeSessions: {
        total: activeSessions.total,
        sessions: activeSessions.sessions.slice(0, 10), // Limit response size
      },
      configuration: {
        timeout: config.session.timeout,
        cleanupInterval: config.session.cleanupInterval,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    Logger.error('Session health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      status: 'error',
      error: 'Session health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * System metrics endpoint
 */
healthRoutes.get('/metrics', (req: Request, res: Response) => {
  try {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    res.json({
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
      },
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      environment: {
        nodeEnv: config.env,
        port: config.port,
      },
    });
  } catch (error) {
    Logger.error('Metrics endpoint failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      status: 'error',
      error: 'Failed to collect metrics',
      timestamp: new Date().toISOString(),
    });
  }
});