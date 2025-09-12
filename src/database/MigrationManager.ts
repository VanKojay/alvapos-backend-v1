// ALVA POS MVP - Migration Manager
// Handles database schema migrations and version control for PostgreSQL

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { db } from '@/config/database';
import { Logger } from '@/utils/logger';

export interface Migration {
  version: string;
  name: string;
  sql: string;
  checksum?: string;
  appliedAt?: string;
  executionTimeMs?: number;
}

export interface MigrationResult {
  success: boolean;
  version: string;
  name: string;
  executionTimeMs: number;
  error?: string;
}

export class MigrationManager {
  private migrationsPath: string;

  constructor() {
    this.migrationsPath = join(__dirname, 'migrations');
  }

  /**
   * Initialize migration tracking table
   */
  private async initializeMigrationTracking(): Promise<void> {
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

    const { error } = await db.execute(sql, [], 'initialize_migration_tracking');
    
    if (error) {
      throw new Error(`Failed to initialize migration tracking: ${error.message}`);
    }

    Logger.info('Migration tracking table initialized');
  }

  /**
   * Get list of applied migrations
   */
  async getAppliedMigrations(): Promise<Migration[]> {
    await this.initializeMigrationTracking();

    const { data, error } = await db.execute<Migration>(
      `SELECT version, name, applied_at as "appliedAt", execution_time_ms as "executionTimeMs", checksum
       FROM schema_migrations 
       ORDER BY version`,
      [],
      'get_applied_migrations'
    );

    if (error) {
      throw new Error(`Failed to get applied migrations: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get available migration files
   */
  getAvailableMigrations(): Migration[] {
    try {
      const files = readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.sql'))
        .sort();

      return files.map(file => {
        const version = file.replace('.sql', '');
        const sql = readFileSync(join(this.migrationsPath, file), 'utf8');
        
        // Extract migration name from SQL comment or filename
        const nameMatch = sql.match(/-- Name: (.+)/i) || sql.match(/-- Description: (.+)/i);
        const name = nameMatch ? nameMatch[1].trim() : version.replace(/_/g, ' ');

        return {
          version,
          name,
          sql,
          checksum: this.generateChecksum(sql)
        };
      });
    } catch (error) {
      Logger.error('Failed to read migration files', {
        error: error instanceof Error ? error.message : String(error),
        path: this.migrationsPath
      });
      return [];
    }
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const applied = await this.getAppliedMigrations();
    const available = this.getAvailableMigrations();
    
    const appliedVersions = new Set(applied.map(m => m.version));
    
    return available.filter(migration => !appliedVersions.has(migration.version));
  }

  /**
   * Run a single migration
   */
  async runMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      Logger.info(`Running migration: ${migration.version} - ${migration.name}`);

      // Execute migration SQL
      const { error } = await db.execute(
        migration.sql, 
        [], 
        `migration_${migration.version}`
      );

      if (error) {
        throw new Error(`Migration execution failed: ${error.message}`);
      }

      const executionTimeMs = Date.now() - startTime;

      // Record migration as applied
      const { error: recordError } = await db.execute(
        `INSERT INTO schema_migrations (version, name, execution_time_ms, checksum) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (version) DO UPDATE SET
           execution_time_ms = EXCLUDED.execution_time_ms,
           checksum = EXCLUDED.checksum`,
        [migration.version, migration.name, executionTimeMs, migration.checksum],
        `record_migration_${migration.version}`
      );

      if (recordError) {
        Logger.warn(`Failed to record migration application: ${recordError.message}`);
      }

      Logger.info(`Migration completed: ${migration.version} in ${executionTimeMs}ms`);

      return {
        success: true,
        version: migration.version,
        name: migration.name,
        executionTimeMs
      };

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      Logger.error(`Migration failed: ${migration.version}`, {
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

  /**
   * Run all pending migrations
   */
  async runPendingMigrations(): Promise<MigrationResult[]> {
    const pending = await this.getPendingMigrations();
    
    if (pending.length === 0) {
      Logger.info('No pending migrations to run');
      return [];
    }

    Logger.info(`Found ${pending.length} pending migrations`);

    const results: MigrationResult[] = [];

    for (const migration of pending) {
      const result = await this.runMigration(migration);
      results.push(result);

      if (!result.success) {
        Logger.error(`Migration ${migration.version} failed, stopping migration process`);
        break;
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    Logger.info(`Migration batch completed: ${successful} successful, ${failed} failed`);

    return results;
  }

  /**
   * Rollback a migration (if rollback SQL is available)
   */
  async rollbackMigration(version: string): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      // Look for rollback file
      const rollbackPath = join(this.migrationsPath, `${version}_rollback.sql`);
      
      let rollbackSql: string;
      try {
        rollbackSql = readFileSync(rollbackPath, 'utf8');
      } catch (error) {
        throw new Error(`No rollback file found for migration ${version}`);
      }

      Logger.info(`Rolling back migration: ${version}`);

      // Execute rollback SQL
      const { error } = await db.execute(rollbackSql, [], `rollback_${version}`);

      if (error) {
        throw new Error(`Rollback execution failed: ${error.message}`);
      }

      const executionTimeMs = Date.now() - startTime;

      // Remove from migration tracking
      const { error: deleteError } = await db.execute(
        'DELETE FROM schema_migrations WHERE version = $1',
        [version],
        `remove_migration_${version}`
      );

      if (deleteError) {
        Logger.warn(`Failed to remove migration record: ${deleteError.message}`);
      }

      Logger.info(`Migration rollback completed: ${version} in ${executionTimeMs}ms`);

      return {
        success: true,
        version,
        name: `Rollback ${version}`,
        executionTimeMs
      };

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      Logger.error(`Migration rollback failed: ${version}`, {
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

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<{
    applied: Migration[];
    pending: Migration[];
    total: number;
    upToDate: boolean;
  }> {
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

  /**
   * Generate checksum for migration content
   */
  private generateChecksum(content: string): string {
    // Simple checksum implementation
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

// Export singleton instance
export const migrationManager = new MigrationManager();