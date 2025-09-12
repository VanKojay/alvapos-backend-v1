import { Pool, PoolClient, PoolConfig } from 'pg';
import { config } from '@/config/environment';
import { Logger } from '@/utils/logger';

export interface DatabaseConnection {
  pool: Pool;
  testConnection(): Promise<boolean>;
  getHealthStatus(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }>;
  cleanup(): Promise<void>;
}

class PostgreSQLConnection implements DatabaseConnection {
  public pool: Pool;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    const poolConfig: PoolConfig = {
      connectionString: config.database.url,
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      min: config.database.connectionPool.min,
      max: config.database.connectionPool.max,
      idleTimeoutMillis: config.database.connectionPool.idleTimeout,
      connectionTimeoutMillis: config.database.connectionPool.acquireTimeout,
      // Enhanced security and performance settings
      ssl: config.isProduction ? { rejectUnauthorized: false } : false,
      application_name: 'alva-pos-backend',
      statement_timeout: 30000, // 30 seconds
      query_timeout: 30000,
    };

    this.pool = new Pool(poolConfig);
    
    // Handle pool errors
    this.pool.on('error', (err: Error) => {
      Logger.error('PostgreSQL pool error', {
        error: err.message,
        stack: err.stack,
      });
    });

    // Handle client connection events
    this.pool.on('connect', (client: PoolClient) => {
      Logger.debug('New PostgreSQL client connected', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
      });
    });

    this.startHealthCheck();
    Logger.info('PostgreSQL connection pool initialized', {
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      min: config.database.connectionPool.min,
      max: config.database.connectionPool.max,
    });
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    let client: PoolClient | null = null;
    
    try {
      client = await this.pool.connect();
      
      // Simple connectivity test
      const result = await client.query('SELECT NOW() as current_time');
      
      if (result.rows && result.rows.length > 0) {
        Logger.info('Database connection test passed', {
          serverTime: result.rows[0].current_time,
        });
        return true;
      }
      
      return false;
    } catch (error) {
      Logger.error('Database connection test failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      const startTime = Date.now();
      const connectionTest = await this.testConnection();
      const responseTime = Date.now() - startTime;

      const details = {
        connection: connectionTest,
        responseTime,
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        timestamp: new Date().toISOString(),
        poolStats: {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount,
        },
      };

      return {
        status: connectionTest ? 'healthy' : 'unhealthy',
        details,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Execute query with error handling and logging
   */
  async executeQuery<T = any>(
    queryText: string,
    values?: any[],
    context?: string
  ): Promise<{ data: T[] | null; error: any }> {
    const startTime = Date.now();
    let client: PoolClient | null = null;

    try {
      client = await this.pool.connect();
      const result = await client.query(queryText, values);
      const duration = Date.now() - startTime;

      Logger.database(`Query executed: ${context || 'unknown'}`, {
        duration,
        rowCount: result.rowCount,
        command: result.command,
      });

      return {
        data: result.rows as T[],
        error: null,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      Logger.error('Database query error', {
        context,
        error: error instanceof Error ? error.message : String(error),
        query: queryText,
        values,
        duration,
      });

      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Unknown database error',
          code: 'QUERY_ERROR',
        },
      };
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Execute query in transaction
   */
  async executeTransaction<T = any>(
    queries: Array<{ text: string; values?: any[] }>,
    context?: string
  ): Promise<{ data: T[] | null; error: any }> {
    let client: PoolClient | null = null;

    try {
      client = await this.pool.connect();
      await client.query('BEGIN');

      const results: T[] = [];

      for (const query of queries) {
        const result = await client.query(query.text, query.values);
        results.push(...(result.rows as T[]));
      }

      await client.query('COMMIT');

      Logger.database(`Transaction executed: ${context || 'unknown'}`, {
        queryCount: queries.length,
        resultCount: results.length,
      });

      return {
        data: results,
        error: null,
      };
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error('Transaction rollback failed', {
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }

      Logger.error('Database transaction error', {
        context,
        error: error instanceof Error ? error.message : String(error),
        queryCount: queries.length,
      });

      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Transaction failed',
          code: 'TRANSACTION_ERROR',
        },
      };
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Session-based query helper
   */
  async sessionQuery<T = any>(
    sessionId: string,
    queryText: string,
    values?: any[],
    context?: string
  ): Promise<{ data: T[] | null; error: any }> {
    // Add session context to query logging
    const contextWithSession = `${context || 'query'} [session: ${sessionId.substring(0, 8)}...]`;
    
    return this.executeQuery<T>(queryText, values, contextWithSession);
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      const health = await this.getHealthStatus();
      
      if (health.status === 'unhealthy') {
        Logger.warn('Database health check failed', health.details);
      } else {
        Logger.debug('Database health check passed', {
          responseTime: health.details.responseTime,
          poolStats: health.details.poolStats,
        });
      }
    }, 300000);

    Logger.info('Database health check started (5 minute intervals)');
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      // Stop health checks
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      // Close the pool
      await this.pool.end();

      Logger.info('Database cleanup completed');
    } catch (error) {
      Logger.error('Database cleanup error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Global database instance
export const database = new PostgreSQLConnection();

// Database helper functions
export const db = {
  /**
   * Generic query helper with session context
   */
  query: <T = any>(
    sessionId: string,
    queryText: string,
    values?: any[],
    context?: string
  ) => database.sessionQuery<T>(sessionId, queryText, values, context),

  /**
   * Execute query without session context
   */
  execute: <T = any>(
    queryText: string,
    values?: any[],
    context?: string
  ) => database.executeQuery<T>(queryText, values, context),

  /**
   * Execute transaction
   */
  transaction: <T = any>(
    queries: Array<{ text: string; values?: any[] }>,
    context?: string
  ) => database.executeTransaction<T>(queries, context),

  /**
   * Health check helper
   */
  health: () => database.getHealthStatus(),

  /**
   * Test connection helper
   */
  test: () => database.testConnection(),

  /**
   * Direct pool access for complex queries
   */
  pool: database.pool,
};