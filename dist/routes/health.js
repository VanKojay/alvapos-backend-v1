"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = void 0;
const express_1 = require("express");
const environment_1 = require("../config/environment");
const database_1 = require("../config/database");
const session_1 = require("../utils/session");
const logger_1 = require("../utils/logger");
const errorHandler_1 = require("../middleware/errorHandler");
exports.healthRoutes = (0, express_1.Router)();
exports.healthRoutes.get('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const startTime = Date.now();
    try {
        const serverHealth = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            environment: environment_1.config.env,
            uptime: process.uptime(),
            pid: process.pid,
            nodeVersion: process.version,
        };
        const responseTime = Date.now() - startTime;
        res.json({
            ...serverHealth,
            responseTime,
        });
    }
    catch (error) {
        logger_1.Logger.error('Health check failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Health check failed',
        });
    }
}));
exports.healthRoutes.get('/detailed', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const startTime = Date.now();
    try {
        const databaseHealth = await database_1.database.getHealthStatus();
        const sessionStats = session_1.sessionManager.getStats();
        const sessionHealth = {
            status: 'healthy',
            statistics: sessionStats,
            cleanupActive: true,
        };
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
            environment: environment_1.config.env,
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
                port: environment_1.config.port,
                sessionTimeout: environment_1.config.session.timeout,
                rateLimitWindow: environment_1.config.rateLimit.windowMs,
                maxFileSize: environment_1.config.fileUpload.maxSize,
            },
        });
    }
    catch (error) {
        logger_1.Logger.error('Detailed health check failed', {
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
exports.healthRoutes.get('/live', (req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
    });
});
exports.healthRoutes.get('/ready', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    try {
        const databaseReady = await database_1.database.testConnection();
        if (databaseReady) {
            res.status(200).json({
                status: 'ready',
                timestamp: new Date().toISOString(),
            });
        }
        else {
            res.status(503).json({
                status: 'not_ready',
                timestamp: new Date().toISOString(),
                reason: 'Database connection failed',
            });
        }
    }
    catch (error) {
        logger_1.Logger.error('Readiness check failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(503).json({
            status: 'not_ready',
            timestamp: new Date().toISOString(),
            reason: 'Readiness check failed',
        });
    }
}));
exports.healthRoutes.get('/database', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const startTime = Date.now();
    try {
        const connectionTest = await database_1.database.testConnection();
        const healthStatus = await database_1.database.getHealthStatus();
        const responseTime = Date.now() - startTime;
        if (connectionTest) {
            res.json({
                status: 'healthy',
                connection: true,
                responseTime,
                details: healthStatus.details,
                timestamp: new Date().toISOString(),
            });
        }
        else {
            res.status(503).json({
                status: 'unhealthy',
                connection: false,
                responseTime,
                details: healthStatus.details,
                timestamp: new Date().toISOString(),
            });
        }
    }
    catch (error) {
        logger_1.Logger.error('Database health check failed', {
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
exports.healthRoutes.get('/sessions', (req, res) => {
    try {
        const stats = session_1.sessionManager.getStats();
        const activeSessions = session_1.sessionManager.getActiveSessions();
        res.json({
            status: 'healthy',
            statistics: stats,
            activeSessions: {
                total: activeSessions.total,
                sessions: activeSessions.sessions.slice(0, 10),
            },
            configuration: {
                timeout: environment_1.config.session.timeout,
                cleanupInterval: environment_1.config.session.cleanupInterval,
            },
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.Logger.error('Session health check failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(503).json({
            status: 'error',
            error: 'Session health check failed',
            timestamp: new Date().toISOString(),
        });
    }
});
exports.healthRoutes.get('/metrics', (req, res) => {
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
                nodeEnv: environment_1.config.env,
                port: environment_1.config.port,
            },
        });
    }
    catch (error) {
        logger_1.Logger.error('Metrics endpoint failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
            status: 'error',
            error: 'Failed to collect metrics',
            timestamp: new Date().toISOString(),
        });
    }
});
//# sourceMappingURL=health.js.map