"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.database = void 0;
const pg_1 = require("pg");
const environment_1 = require("./environment");
const logger_1 = require("../utils/logger");
class PostgreSQLConnection {
    constructor() {
        this.healthCheckInterval = null;
        const poolConfig = {
            connectionString: environment_1.config.database.url,
            host: environment_1.config.database.host,
            port: environment_1.config.database.port,
            database: environment_1.config.database.name,
            user: environment_1.config.database.user,
            password: environment_1.config.database.password,
            min: environment_1.config.database.connectionPool.min,
            max: environment_1.config.database.connectionPool.max,
            idleTimeoutMillis: environment_1.config.database.connectionPool.idleTimeout,
            connectionTimeoutMillis: environment_1.config.database.connectionPool.acquireTimeout,
            ssl: environment_1.config.isProduction ? { rejectUnauthorized: false } : false,
            application_name: 'alva-pos-backend',
            statement_timeout: 30000,
            query_timeout: 30000,
        };
        this.pool = new pg_1.Pool(poolConfig);
        this.pool.on('error', (err) => {
            logger_1.Logger.error('PostgreSQL pool error', {
                error: err.message,
                stack: err.stack,
            });
        });
        this.pool.on('connect', (client) => {
            logger_1.Logger.debug('New PostgreSQL client connected', {
                totalCount: this.pool.totalCount,
                idleCount: this.pool.idleCount,
                waitingCount: this.pool.waitingCount,
            });
        });
        this.startHealthCheck();
        logger_1.Logger.info('PostgreSQL connection pool initialized', {
            host: environment_1.config.database.host,
            port: environment_1.config.database.port,
            database: environment_1.config.database.name,
            min: environment_1.config.database.connectionPool.min,
            max: environment_1.config.database.connectionPool.max,
        });
    }
    async testConnection() {
        let client = null;
        try {
            client = await this.pool.connect();
            const result = await client.query('SELECT NOW() as current_time');
            if (result.rows && result.rows.length > 0) {
                logger_1.Logger.info('Database connection test passed', {
                    serverTime: result.rows[0].current_time,
                });
                return true;
            }
            return false;
        }
        catch (error) {
            logger_1.Logger.error('Database connection test failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
        finally {
            if (client) {
                client.release();
            }
        }
    }
    async getHealthStatus() {
        try {
            const startTime = Date.now();
            const connectionTest = await this.testConnection();
            const responseTime = Date.now() - startTime;
            const details = {
                connection: connectionTest,
                responseTime,
                host: environment_1.config.database.host,
                port: environment_1.config.database.port,
                database: environment_1.config.database.name,
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
        }
        catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: error instanceof Error ? error.message : String(error),
                    timestamp: new Date().toISOString(),
                },
            };
        }
    }
    async executeQuery(queryText, values, context) {
        const startTime = Date.now();
        let client = null;
        try {
            client = await this.pool.connect();
            const result = await client.query(queryText, values);
            const duration = Date.now() - startTime;
            logger_1.Logger.database(`Query executed: ${context || 'unknown'}`, {
                duration,
                rowCount: result.rowCount,
                command: result.command,
            });
            return {
                data: result.rows,
                error: null,
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger_1.Logger.error('Database query error', {
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
        }
        finally {
            if (client) {
                client.release();
            }
        }
    }
    async executeTransaction(queries, context) {
        let client = null;
        try {
            client = await this.pool.connect();
            await client.query('BEGIN');
            const results = [];
            for (const query of queries) {
                const result = await client.query(query.text, query.values);
                results.push(...result.rows);
            }
            await client.query('COMMIT');
            logger_1.Logger.database(`Transaction executed: ${context || 'unknown'}`, {
                queryCount: queries.length,
                resultCount: results.length,
            });
            return {
                data: results,
                error: null,
            };
        }
        catch (error) {
            if (client) {
                try {
                    await client.query('ROLLBACK');
                }
                catch (rollbackError) {
                    logger_1.Logger.error('Transaction rollback failed', {
                        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
                    });
                }
            }
            logger_1.Logger.error('Database transaction error', {
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
        }
        finally {
            if (client) {
                client.release();
            }
        }
    }
    async sessionQuery(sessionId, queryText, values, context) {
        const contextWithSession = `${context || 'query'} [session: ${sessionId.substring(0, 8)}...]`;
        return this.executeQuery(queryText, values, contextWithSession);
    }
    startHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        this.healthCheckInterval = setInterval(async () => {
            const health = await this.getHealthStatus();
            if (health.status === 'unhealthy') {
                logger_1.Logger.warn('Database health check failed', health.details);
            }
            else {
                logger_1.Logger.debug('Database health check passed', {
                    responseTime: health.details.responseTime,
                    poolStats: health.details.poolStats,
                });
            }
        }, 300000);
        logger_1.Logger.info('Database health check started (5 minute intervals)');
    }
    async cleanup() {
        try {
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
            await this.pool.end();
            logger_1.Logger.info('Database cleanup completed');
        }
        catch (error) {
            logger_1.Logger.error('Database cleanup error', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
exports.database = new PostgreSQLConnection();
exports.db = {
    query: (sessionId, queryText, values, context) => exports.database.sessionQuery(sessionId, queryText, values, context),
    execute: (queryText, values, context) => exports.database.executeQuery(queryText, values, context),
    transaction: (queries, context) => exports.database.executeTransaction(queries, context),
    health: () => exports.database.getHealthStatus(),
    test: () => exports.database.testConnection(),
    pool: exports.database.pool,
};
//# sourceMappingURL=database.js.map