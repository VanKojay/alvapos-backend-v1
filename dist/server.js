"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = exports.server = void 0;
const express_1 = __importDefault(require("express"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const environment_1 = require("./config/environment");
const database_1 = require("./config/database");
const DatabaseService_1 = require("./services/DatabaseService");
const logger_1 = require("./utils/logger");
const session_1 = require("./utils/session");
const database_2 = require("./middleware/database");
const security_1 = require("./middleware/security");
const sessionMiddleware_1 = require("./middleware/sessionMiddleware");
const errorHandler_1 = require("./middleware/errorHandler");
const financialErrorHandler_1 = require("./middleware/financialErrorHandler");
const health_1 = require("./routes/health");
const quotes_1 = require("./routes/quotes");
const customers_1 = require("./routes/customers");
const products_1 = require("./routes/products");
const realtime_1 = require("./routes/realtime");
const RealTimeSyncService_1 = require("./services/RealTimeSyncService");
const FinancialCalculationService_1 = require("./services/FinancialCalculationService");
const orders_1 = require("./routes/orders");
const app = (0, express_1.default)();
exports.app = app;
app.get("/api/hello", (req, res) => {
    res.json({ message: "Hello from Express on Vercel!" });
});
class ALVAPOSServer {
    constructor() {
        this.app = (0, express_1.default)();
        this.setupGlobalErrorHandlers();
        this.setupDatabase();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    setupGlobalErrorHandlers() {
        process.on('uncaughtException', errorHandler_1.handleUncaughtException);
        process.on('unhandledRejection', errorHandler_1.handleUnhandledRejection);
        process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    }
    setupDatabase() {
        (0, database_2.initMySQLPool)();
        logger_1.Logger.info('Database pool initialized');
    }
    setupMiddleware() {
        if (environment_1.config.isProduction) {
            this.app.set('trust proxy', 1);
        }
        this.app.use((0, morgan_1.default)(environment_1.config.logging.format, {
            stream: {
                write: (message) => {
                    logger_1.Logger.info(message.trim());
                },
            },
            skip: (req) => {
                return environment_1.config.isProduction && req.url === '/api/health';
            },
        }));
        this.app.use((0, compression_1.default)({
            threshold: environment_1.config.performance.compressionThreshold,
            level: 6,
        }));
        this.app.use(security_1.helmetMiddleware);
        this.app.use(security_1.corsMiddleware);
        this.app.use((0, security_1.requestIdMiddleware)());
        this.app.use((0, security_1.securityHeaders)());
        this.app.use(express_1.default.json({ limit: '10mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
        this.app.use((0, cookie_parser_1.default)());
        this.app.use(security_1.basicRateLimiter);
        this.app.use((0, security_1.sanitizeInput)());
        this.app.use(sessionMiddleware_1.optionalSessionMiddleware);
        this.app.use((0, sessionMiddleware_1.validateSessionMiddleware)());
        logger_1.Logger.info('Middleware setup completed');
    }
    setupRoutes() {
        this.app.use('/api/health', health_1.healthRoutes);
        this.app.use('/api/quotes', quotes_1.quotesRouter);
        this.app.use('/api/orders', orders_1.ordersRouter);
        this.app.use('/api/customers', customers_1.customersRouter);
        this.app.use('/api/products', products_1.productsRouter);
        this.app.use('/api/realtime', realtime_1.realtimeRouter);
        this.app.get('/', (req, res) => {
            res.json({
                message: 'ALVA POS MVP Backend API',
                version: '1.0.0',
                environment: environment_1.config.env,
                timestamp: new Date().toISOString(),
                status: 'operational',
            });
        });
        this.app.get('/api', (req, res) => {
            res.json({
                name: 'ALVA POS MVP API',
                version: '1.0.0',
                description: 'Backend API for ALVA Point of Sales MVP application',
                environment: environment_1.config.env,
                endpoints: {
                    health: '/api/health',
                    database: '/api/database',
                    migrations: '/api/database/migrations',
                    search: '/api/database/search',
                    quotes: '/api/quotes',
                    customers: '/api/customers',
                    products: '/api/products',
                    calculations: {
                        base: '/api/realtime',
                        calculate: '/api/realtime/calculate',
                        validate: '/api/realtime/validate',
                        health: '/api/realtime/health',
                        errors: '/api/realtime/errors',
                        formatCurrency: '/api/realtime/format-currency'
                    }
                },
                features: {
                    financialCalculations: 'Decimal.js precision calculations with comprehensive discount support',
                    postgresqlDatabase: 'Pure PostgreSQL integration for reliability and performance',
                    errorHandling: 'Specialized financial error handling and recovery',
                    validation: 'Comprehensive cart and financial data validation'
                },
                documentation: 'https://docs.alva-pos.com',
                support: 'support@alva.com',
            });
        });
        logger_1.Logger.info('Routes setup completed');
    }
    setupErrorHandling() {
        this.app.use(errorHandler_1.notFoundHandler);
        this.app.use(financialErrorHandler_1.financialErrorMiddleware);
        this.app.use(errorHandler_1.errorHandler);
    }
    async start() {
        try {
            const dbHealthy = await database_1.database.testConnection();
            if (!dbHealthy) {
                logger_1.Logger.warn('Database connection test failed, but continuing startup...');
                logger_1.Logger.warn('Server will start with limited functionality until database is properly configured');
            }
            else {
                logger_1.Logger.info('Database connection test passed');
            }
            logger_1.Logger.info('Attempting database schema initialization...');
            try {
                const initResult = await DatabaseService_1.databaseService.initializeDatabase();
                if (!initResult.success) {
                    logger_1.Logger.warn(`Database initialization skipped: ${initResult.error}`);
                    logger_1.Logger.warn('Database features may be limited until proper schema is set up');
                }
                else {
                    logger_1.Logger.info('Database schema initialized successfully');
                }
            }
            catch (initError) {
                logger_1.Logger.warn('Database initialization failed, continuing with limited functionality', {
                    error: initError instanceof Error ? initError.message : String(initError)
                });
            }
            logger_1.Logger.info('Initializing application services...');
            FinancialCalculationService_1.financialCalculationService;
            logger_1.Logger.info('Financial calculation service initialized');
            RealTimeSyncService_1.realTimeSyncService;
            logger_1.Logger.info('Real-time sync service stub initialized (functionality disabled)');
            logger_1.Logger.info('All application services initialized successfully');
            this.server = this.app.listen(environment_1.config.port, () => {
                logger_1.Logger.info(`🚀 ALVA POS MVP Server started successfully`, {
                    port: environment_1.config.port,
                    environment: environment_1.config.env,
                    nodeVersion: process.version,
                    pid: process.pid,
                    databaseUrl: environment_1.config.database.host + ':' + environment_1.config.database.port,
                    databaseStatus: dbHealthy ? 'healthy' : 'limited_functionality',
                });
                if (!dbHealthy) {
                    logger_1.Logger.warn('⚠️  Database connection issue detected');
                    logger_1.Logger.warn('   Server is running but some features may not work correctly');
                    logger_1.Logger.warn('   Check your PostgreSQL configuration and database schema');
                    logger_1.Logger.warn('   Visit /api/health for more detailed status information');
                }
            });
            this.server.keepAliveTimeout = environment_1.config.performance.keepAliveTimeout;
            this.server.headersTimeout = environment_1.config.performance.headersTimeout;
            this.logServerStats();
        }
        catch (error) {
            logger_1.Logger.error('Server startup failed', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            process.exit(1);
        }
    }
    async gracefulShutdown(signal) {
        logger_1.Logger.info(`Received ${signal}. Starting graceful shutdown...`);
        try {
            if (this.server) {
                this.server.close(() => {
                    logger_1.Logger.info('HTTP server closed');
                });
            }
            session_1.sessionManager.stopCleanupTimer();
            try {
                await RealTimeSyncService_1.realTimeSyncService.shutdown();
                logger_1.Logger.info('Real-time sync service stub shutdown completed');
            }
            catch (error) {
                logger_1.Logger.warn('Error shutting down real-time sync service stub', { error });
            }
            await database_1.database.cleanup();
            await new Promise(resolve => setTimeout(resolve, 1000));
            logger_1.Logger.info('Graceful shutdown completed');
            process.exit(0);
        }
        catch (error) {
            logger_1.Logger.error('Error during graceful shutdown', {
                error: error instanceof Error ? error.message : String(error),
            });
            process.exit(1);
        }
    }
    logServerStats() {
        setInterval(() => {
            const memUsage = process.memoryUsage();
            const sessionStats = session_1.sessionManager.getStats();
            const realtimeStats = RealTimeSyncService_1.realTimeSyncService.getConnectionStats();
            logger_1.Logger.performance('Server statistics', {
                memory: {
                    rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
                    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
                    external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
                },
                sessions: sessionStats,
                realtimeConnections: realtimeStats,
                uptime: Math.round(process.uptime()),
                pid: process.pid,
                financialEngine: {
                    precisionLibrary: 'Decimal.js v10.4.3',
                    supportedDiscounts: ['item-level', 'total-level'],
                    calculationFeatures: ['percentage-discounts', 'nominal-discounts', 'tax-calculation', 'currency-formatting'],
                    realTimeFeatures: ['websocket-sync', 'optimistic-updates', 'connection-recovery']
                }
            });
        }, 300000);
    }
}
const server = new ALVAPOSServer();
exports.server = server;
if (require.main === module) {
    server.start().catch((error) => {
        logger_1.Logger.error('Failed to start server', {
            error: error.message,
            stack: error.stack,
        });
        process.exit(1);
    });
}
exports.default = server.app;
//# sourceMappingURL=server.js.map