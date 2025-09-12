import express, { Application } from 'express';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { config } from '@/config/environment';
import { database } from '@/config/database';
import { databaseService } from '@/services/DatabaseService';
import { Logger } from '@/utils/logger';
import { sessionManager } from '@/utils/session';

// Database Middleware
import { initMySQLPool, mysqlMiddleware } from '@/middleware/database'; 
// atau kalau mau PostgreSQL, ganti dengan initPostgresPool & postgresMiddleware

// Middleware imports
import {
  corsMiddleware,
  helmetMiddleware,
  basicRateLimiter,
  sanitizeInput,
  requestIdMiddleware,
  securityHeaders,
  // sensitiveRateLimiterMiddleware,
} from '@/middleware/security';
import {
  optionalSessionMiddleware,
  validateSessionMiddleware,
} from '@/middleware/sessionMiddleware';
import {
  errorHandler,
  notFoundHandler,
  handleUncaughtException,
  handleUnhandledRejection,
} from '@/middleware/errorHandler';
import { financialErrorMiddleware } from '@/middleware/financialErrorHandler';

// Route imports
import { healthRoutes } from '@/routes/health';
import databaseRoutes from '@/routes/database';
import { quotesRouter } from '@/routes/quotes';
import { customersRouter } from '@/routes/customers';
import { productsRouter } from '@/routes/products';
import { realtimeRouter } from '@/routes/realtime';

// Service imports for initialization
import { realTimeSyncService } from '@/services/RealTimeSyncService';
import { financialCalculationService } from '@/services/FinancialCalculationService';
import { ordersRouter } from './routes/orders';

// dotenv.config();

class ALVAPOSServer {
  public app: Application;
  private server: any;

  constructor() {
    this.app = express();
    this.setupGlobalErrorHandlers();
    this.setupDatabase(); // inisialisasi pool MySQL/Postgres
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    process.on('uncaughtException', handleUncaughtException);
    process.on('unhandledRejection', handleUnhandledRejection);
    
    // Graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  private setupDatabase(): void {
    initMySQLPool(); // ⬅️ atau initPostgresPool() kalau pakai PostgreSQL
    Logger.info('Database pool initialized');
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Trust proxy for production deployment
    if (config.isProduction) {
      this.app.set('trust proxy', 1);
    }

    // Request logging
    this.app.use(morgan(config.logging.format, {
      stream: {
        write: (message: string) => {
          Logger.info(message.trim());
        },
      },
      skip: (req) => {
        // Skip health check logs in production
        return config.isProduction && req.url === '/api/health';
      },
    }));

    // Basic security and performance middleware
    this.app.use(compression({
      threshold: config.performance.compressionThreshold,
      level: 6, // Balanced compression level
    }));
    this.app.use(helmetMiddleware);
    this.app.use(corsMiddleware);
    this.app.use(requestIdMiddleware());
    this.app.use(securityHeaders());

    // Request parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(cookieParser());

    // Security middleware
    this.app.use(basicRateLimiter);
    // this.app.use(sensitiveRateLimiterMiddleware); // ⬅ pasang di sini
    this.app.use(sanitizeInput());

    // Session management
    this.app.use(optionalSessionMiddleware);
    this.app.use(validateSessionMiddleware());

    Logger.info('Middleware setup completed');
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check routes (no session required)
    this.app.use('/api/health', healthRoutes);

    // Database management routes (with session management)
    // this.app.use('/api/database', databaseRoutes);
    // Tambahkan middleware database sebelum route database
    // this.app.use('/api/database', mysqlMiddleware(), databaseRoutes);

    // Core API routes
    this.app.use('/api/quotes', quotesRouter);
    this.app.use('/api/orders', ordersRouter);
    this.app.use('/api/customers', customersRouter);
    this.app.use('/api/products', productsRouter);
    this.app.use('/api/realtime', realtimeRouter);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'ALVA POS MVP Backend API',
        version: '1.0.0',
        environment: config.env,
        timestamp: new Date().toISOString(),
        status: 'operational',
      });
    });

    // API documentation endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'ALVA POS MVP API',
        version: '1.0.0',
        description: 'Backend API for ALVA Point of Sales MVP application',
        environment: config.env,
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
        documentation: 'https://docs.alva-pos.com', // Placeholder
        support: 'support@alva.com', // Placeholder
      });
    });

    Logger.info('Routes setup completed');
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // 404 handler (must be last route)
    this.app.use(notFoundHandler);

    // Financial error handler (before global error handler)
    this.app.use(financialErrorMiddleware);

    // Global error handler (must be last middleware)
    this.app.use(errorHandler);
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      // Test database connection
      const dbHealthy = await database.testConnection();
      if (!dbHealthy) {
        Logger.warn('Database connection test failed, but continuing startup...');
        Logger.warn('Server will start with limited functionality until database is properly configured');
      } else {
        Logger.info('Database connection test passed');
      }

      // Try to initialize database schema, but don't fail if it's not possible
      Logger.info('Attempting database schema initialization...');
      try {
        const initResult = await databaseService.initializeDatabase();
        if (!initResult.success) {
          Logger.warn(`Database initialization skipped: ${initResult.error}`);
          Logger.warn('Database features may be limited until proper schema is set up');
        } else {
          Logger.info('Database schema initialized successfully');
        }
      } catch (initError) {
        Logger.warn('Database initialization failed, continuing with limited functionality', {
          error: initError instanceof Error ? initError.message : String(initError)
        });
      }

      // Initialize services
      Logger.info('Initializing application services...');
      
      // Initialize financial calculation service (singleton pattern)
      financialCalculationService;
      Logger.info('Financial calculation service initialized');
      
      // Initialize real-time sync service stub (singleton pattern)  
      realTimeSyncService;
      Logger.info('Real-time sync service stub initialized (functionality disabled)');
      
      Logger.info('All application services initialized successfully');

      // Start HTTP server
      this.server = this.app.listen(config.port, () => {
        Logger.info(`🚀 ALVA POS MVP Server started successfully`, {
          port: config.port,
          environment: config.env,
          nodeVersion: process.version,
          pid: process.pid,
          databaseUrl: config.database.host + ':' + config.database.port,
          databaseStatus: dbHealthy ? 'healthy' : 'limited_functionality',
        });
        
        if (!dbHealthy) {
          Logger.warn('⚠️  Database connection issue detected');
          Logger.warn('   Server is running but some features may not work correctly');
          Logger.warn('   Check your PostgreSQL configuration and database schema');
          Logger.warn('   Visit /api/health for more detailed status information');
        }
      });

      // Configure server timeouts
      this.server.keepAliveTimeout = config.performance.keepAliveTimeout;
      this.server.headersTimeout = config.performance.headersTimeout;

      // Log server statistics
      this.logServerStats();

    } catch (error) {
      Logger.error('Server startup failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  private async gracefulShutdown(signal: string): Promise<void> {
    Logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {
      // Stop accepting new connections
      if (this.server) {
        this.server.close(() => {
          Logger.info('HTTP server closed');
        });
      }

      // Cleanup session manager
      sessionManager.stopCleanupTimer();

      // Cleanup real-time sync service stub
      try {
        await realTimeSyncService.shutdown();
        Logger.info('Real-time sync service stub shutdown completed');
      } catch (error) {
        Logger.warn('Error shutting down real-time sync service stub', { error });
      }

      // Cleanup database connections
      await database.cleanup();

      // Allow time for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));

      Logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      Logger.error('Error during graceful shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  }

  /**
   * Log server statistics
   */
  private logServerStats(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const sessionStats = sessionManager.getStats();
      const realtimeStats = realTimeSyncService.getConnectionStats();

      Logger.performance('Server statistics', {
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
    }, 300000); // Every 5 minutes
  }
}

// Create and start server
const server = new ALVAPOSServer();

if (require.main === module) {
  server.start().catch((error) => {
    Logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

export { server };
export default server.app;