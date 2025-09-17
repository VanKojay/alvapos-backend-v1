"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrationManager = exports.MigrationManager = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
class MigrationManager {
    constructor() {
        this.migrationsPath = (0, path_1.join)(__dirname, 'migrations');
    }
    async initializeMigrationTracking() {
        const sql = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz DEFAULT NOW(),
        applied_by text DEFAULT current_user,
        execution_time_ms integer,
        checksum text,
        
        CONSTRAINT migrations_version_format CHECK (version ~ '^\\d{3}_[a-z0-9_]+$')
      );
    `;
        const { error } = await database_1.db.execute(sql, [], 'initialize_migration_tracking');
        if (error) {
            throw new Error(`Failed to initialize migration tracking: ${error.message}`);
        }
        logger_1.Logger.info('Migration tracking table initialized');
    }
    async getAppliedMigrations() {
        await this.initializeMigrationTracking();
        const { data, error } = await database_1.db.execute(`SELECT version, name, applied_at as "appliedAt", execution_time_ms as "executionTimeMs", checksum
       FROM schema_migrations 
       ORDER BY version`, [], 'get_applied_migrations');
        if (error) {
            throw new Error(`Failed to get applied migrations: ${error.message}`);
        }
        return data || [];
    }
    getAvailableMigrations() {
        try {
            const files = (0, fs_1.readdirSync)(this.migrationsPath)
                .filter(file => file.endsWith('.sql'))
                .sort();
            return files.map(file => {
                const version = file.replace('.sql', '');
                const sql = (0, fs_1.readFileSync)((0, path_1.join)(this.migrationsPath, file), 'utf8');
                const nameMatch = sql.match(/-- Name: (.+)/i) || sql.match(/-- Description: (.+)/i);
                const name = nameMatch ? nameMatch[1].trim() : version.replace(/_/g, ' ');
                return {
                    version,
                    name,
                    sql,
                    checksum: this.generateChecksum(sql)
                };
            });
        }
        catch (error) {
            logger_1.Logger.error('Failed to read migration files', {
                error: error instanceof Error ? error.message : String(error),
                path: this.migrationsPath
            });
            return [];
        }
    }
    async getPendingMigrations() {
        const applied = await this.getAppliedMigrations();
        const available = this.getAvailableMigrations();
        const appliedVersions = new Set(applied.map(m => m.version));
        return available.filter(migration => !appliedVersions.has(migration.version));
    }
    async runMigration(migration) {
        const startTime = Date.now();
        try {
            logger_1.Logger.info(`Running migration: ${migration.version} - ${migration.name}`);
            const { error } = await database_1.db.execute(migration.sql, [], `migration_${migration.version}`);
            if (error) {
                throw new Error(`Migration execution failed: ${error.message}`);
            }
            const executionTimeMs = Date.now() - startTime;
            const { error: recordError } = await database_1.db.execute(`INSERT INTO schema_migrations (version, name, execution_time_ms, checksum) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (version) DO UPDATE SET
           execution_time_ms = EXCLUDED.execution_time_ms,
           checksum = EXCLUDED.checksum`, [migration.version, migration.name, executionTimeMs, migration.checksum], `record_migration_${migration.version}`);
            if (recordError) {
                logger_1.Logger.warn(`Failed to record migration application: ${recordError.message}`);
            }
            logger_1.Logger.info(`Migration completed: ${migration.version} in ${executionTimeMs}ms`);
            return {
                success: true,
                version: migration.version,
                name: migration.name,
                executionTimeMs
            };
        }
        catch (error) {
            const executionTimeMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger_1.Logger.error(`Migration failed: ${migration.version}`, {
                error: errorMessage,
                executionTime: executionTimeMs
            });
            return {
                success: false,
                version: migration.version,
                name: migration.name,
                executionTimeMs,
                error: errorMessage
            };
        }
    }
    async runPendingMigrations() {
        const pending = await this.getPendingMigrations();
        if (pending.length === 0) {
            logger_1.Logger.info('No pending migrations to run');
            return [];
        }
        logger_1.Logger.info(`Found ${pending.length} pending migrations`);
        const results = [];
        for (const migration of pending) {
            const result = await this.runMigration(migration);
            results.push(result);
            if (!result.success) {
                logger_1.Logger.error(`Migration ${migration.version} failed, stopping migration process`);
                break;
            }
        }
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        logger_1.Logger.info(`Migration batch completed: ${successful} successful, ${failed} failed`);
        return results;
    }
    async rollbackMigration(version) {
        const startTime = Date.now();
        try {
            const rollbackPath = (0, path_1.join)(this.migrationsPath, `${version}_rollback.sql`);
            let rollbackSql;
            try {
                rollbackSql = (0, fs_1.readFileSync)(rollbackPath, 'utf8');
            }
            catch (error) {
                throw new Error(`No rollback file found for migration ${version}`);
            }
            logger_1.Logger.info(`Rolling back migration: ${version}`);
            const { error } = await database_1.db.execute(rollbackSql, [], `rollback_${version}`);
            if (error) {
                throw new Error(`Rollback execution failed: ${error.message}`);
            }
            const executionTimeMs = Date.now() - startTime;
            const { error: deleteError } = await database_1.db.execute('DELETE FROM schema_migrations WHERE version = $1', [version], `remove_migration_${version}`);
            if (deleteError) {
                logger_1.Logger.warn(`Failed to remove migration record: ${deleteError.message}`);
            }
            logger_1.Logger.info(`Migration rollback completed: ${version} in ${executionTimeMs}ms`);
            return {
                success: true,
                version,
                name: `Rollback ${version}`,
                executionTimeMs
            };
        }
        catch (error) {
            const executionTimeMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger_1.Logger.error(`Migration rollback failed: ${version}`, {
                error: errorMessage,
                executionTime: executionTimeMs
            });
            return {
                success: false,
                version,
                name: `Rollback ${version}`,
                executionTimeMs,
                error: errorMessage
            };
        }
    }
    async getMigrationStatus() {
        const applied = await this.getAppliedMigrations();
        const pending = await this.getPendingMigrations();
        const available = this.getAvailableMigrations();
        return {
            applied,
            pending,
            total: available.length,
            upToDate: pending.length === 0
        };
    }
    generateChecksum(content) {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
}
exports.MigrationManager = MigrationManager;
exports.migrationManager = new MigrationManager();
//# sourceMappingURL=MigrationManager.js.map