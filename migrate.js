#!/usr/bin/env node

/**
 * ALVA POS MVP - Database Migration Script
 * 
 * This script handles database migration operations:
 * - Test database connectivity
 * - Run pending migrations
 * - Check migration status
 * - Rollback migrations (if needed)
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database configuration
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'alva_pos_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'root',
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
};

const migrationsPath = path.join(__dirname, 'src', 'database', 'migrations');

class SimpleMigrator {
  constructor() {
    this.client = new Client(config);
  }

  async connect() {
    try {
      await this.client.connect();
      console.log('✅ Connected to PostgreSQL database');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      return false;
    }
  }

  async disconnect() {
    try {
      await this.client.end();
      console.log('✅ Disconnected from database');
    } catch (error) {
      console.error('⚠️  Error disconnecting:', error.message);
    }
  }

  async testConnection() {
    try {
      const result = await this.client.query('SELECT NOW() as current_time, current_database() as db_name');
      console.log('✅ Database connection test successful');
      console.log(`   Server time: ${result.rows[0].current_time}`);
      console.log(`   Database: ${result.rows[0].db_name}`);
      return true;
    } catch (error) {
      console.error('❌ Database connection test failed:', error.message);
      return false;
    }
  }

  async initializeMigrationTable() {
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

    try {
      await this.client.query(sql);
      console.log('✅ Migration tracking table initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize migration table:', error.message);
      return false;
    }
  }

  async getAppliedMigrations() {
    try {
      const result = await this.client.query(`
        SELECT version, name, applied_at, execution_time_ms 
        FROM schema_migrations 
        ORDER BY version
      `);
      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get applied migrations:', error.message);
      return [];
    }
  }

  getAvailableMigrations() {
    try {
      if (!fs.existsSync(migrationsPath)) {
        console.error('❌ Migrations directory not found:', migrationsPath);
        return [];
      }

      const files = fs.readdirSync(migrationsPath)
        .filter(file => file.endsWith('.sql'))
        .sort();

      return files.map(file => {
        const version = file.replace('.sql', '');
        const filePath = path.join(migrationsPath, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        // Extract migration name from SQL comment
        const nameMatch = sql.match(/-- Description: (.+)/i) || sql.match(/-- Name: (.+)/i);
        const name = nameMatch ? nameMatch[1].trim() : version.replace(/_/g, ' ');

        return {
          version,
          name,
          sql,
          filePath
        };
      });
    } catch (error) {
      console.error('❌ Failed to read migration files:', error.message);
      return [];
    }
  }

  async runMigration(migration) {
    const startTime = Date.now();
    console.log(`🔄 Running migration: ${migration.version} - ${migration.name}`);

    try {
      // Execute migration SQL
      await this.client.query(migration.sql);
      
      const executionTimeMs = Date.now() - startTime;

      // Record migration as applied
      await this.client.query(
        `INSERT INTO schema_migrations (version, name, execution_time_ms) 
         VALUES ($1, $2, $3)
         ON CONFLICT (version) DO UPDATE SET
           execution_time_ms = EXCLUDED.execution_time_ms`,
        [migration.version, migration.name, executionTimeMs]
      );

      console.log(`✅ Migration completed: ${migration.version} in ${executionTimeMs}ms`);
      return { success: true, version: migration.version, executionTimeMs };

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      console.error(`❌ Migration failed: ${migration.version}`);
      console.error(`   Error: ${error.message}`);
      
      return { 
        success: false, 
        version: migration.version, 
        executionTimeMs, 
        error: error.message 
      };
    }
  }

  async runAllMigrations() {
    console.log('\n📦 Running database migrations...');
    
    // Initialize migration tracking
    const initialized = await this.initializeMigrationTable();
    if (!initialized) return false;

    // Get current state
    const applied = await this.getAppliedMigrations();
    const available = this.getAvailableMigrations();

    if (available.length === 0) {
      console.log('⚠️  No migration files found');
      return true;
    }

    const appliedVersions = new Set(applied.map(m => m.version));
    const pending = available.filter(m => !appliedVersions.has(m.version));

    if (pending.length === 0) {
      console.log('✅ All migrations are up to date');
      this.printMigrationStatus(applied, []);
      return true;
    }

    console.log(`📋 Found ${pending.length} pending migrations:`);
    pending.forEach(m => {
      console.log(`   - ${m.version}: ${m.name}`);
    });

    // Run pending migrations
    const results = [];
    for (const migration of pending) {
      const result = await this.runMigration(migration);
      results.push(result);

      if (!result.success) {
        console.error('💥 Stopping migration process due to failure');
        break;
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n📊 Migration Summary:`);
    console.log(`   Successful: ${successful}`);
    console.log(`   Failed: ${failed}`);

    return failed === 0;
  }

  async getMigrationStatus() {
    const applied = await this.getAppliedMigrations();
    const available = this.getAvailableMigrations();
    const appliedVersions = new Set(applied.map(m => m.version));
    const pending = available.filter(m => !appliedVersions.has(m.version));

    return { applied, pending, available };
  }

  printMigrationStatus(applied, pending) {
    console.log('\n📋 Migration Status:');
    
    if (applied.length > 0) {
      console.log(`\n✅ Applied Migrations (${applied.length}):`);
      applied.forEach(m => {
        const time = m.execution_time_ms ? `(${m.execution_time_ms}ms)` : '';
        console.log(`   ✓ ${m.version}: ${m.name} ${time}`);
      });
    }

    if (pending.length > 0) {
      console.log(`\n⏳ Pending Migrations (${pending.length}):`);
      pending.forEach(m => {
        console.log(`   ⏳ ${m.version}: ${m.name}`);
      });
    }

    if (applied.length === 0 && pending.length === 0) {
      console.log('   No migrations found');
    }
  }

  async verifyDatabaseSetup() {
    console.log('\n🔍 Verifying database setup...');

    try {
      // Check if key tables exist
      const tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `;
      
      const tablesResult = await this.client.query(tablesQuery);
      const tables = tablesResult.rows.map(row => row.table_name);

      console.log(`📊 Found ${tables.length} tables:`);
      tables.forEach(table => {
        console.log(`   - ${table}`);
      });

      // Check for expected tables
      const expectedTables = [
        'schema_migrations', 'products', 'customers', 'quotes', 
        'templates', 'boq_imports', 'session_analytics'
      ];

      const missingTables = expectedTables.filter(table => !tables.includes(table));
      
      if (missingTables.length > 0) {
        console.log(`\n⚠️  Missing expected tables: ${missingTables.join(', ')}`);
        return false;
      }

      // Check if we have sample data
      const productCount = await this.client.query('SELECT COUNT(*) FROM products');
      console.log(`📦 Sample products: ${productCount.rows[0].count}`);

      // Check indexes
      const indexQuery = `
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname LIKE 'idx_%'
        ORDER BY indexname;
      `;
      
      const indexResult = await this.client.query(indexQuery);
      console.log(`🔗 Found ${indexResult.rows.length} custom indexes`);

      // Check functions
      const functionQuery = `
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_type = 'FUNCTION' 
        AND routine_schema = 'public'
        AND routine_name NOT LIKE 'pg_%'
        ORDER BY routine_name;
      `;
      
      const functionResult = await this.client.query(functionQuery);
      console.log(`⚙️  Found ${functionResult.rows.length} custom functions`);

      console.log('\n✅ Database setup verification completed');
      return true;

    } catch (error) {
      console.error('❌ Database verification failed:', error.message);
      return false;
    }
  }

  async testCRUDOperations() {
    console.log('\n🧪 Testing basic CRUD operations...');

    try {
      // Test product insertion
      const productResult = await this.client.query(`
        INSERT INTO products (name, category, price, description, brand) 
        VALUES ('Test Product', 'cameras', 99.99, 'Test description', 'Test Brand')
        RETURNING id, name
      `);
      
      const productId = productResult.rows[0].id;
      console.log(`✅ Product CREATE: ${productResult.rows[0].name} (${productId})`);

      // Test product read
      const readResult = await this.client.query(
        'SELECT name, price FROM products WHERE id = $1',
        [productId]
      );
      console.log(`✅ Product READ: ${readResult.rows[0].name} - $${readResult.rows[0].price}`);

      // Test product update
      await this.client.query(
        'UPDATE products SET price = $1 WHERE id = $2',
        [199.99, productId]
      );
      console.log('✅ Product UPDATE: Price changed to $199.99');

      // Test product delete
      await this.client.query('DELETE FROM products WHERE id = $1', [productId]);
      console.log('✅ Product DELETE: Test product removed');

      // Test search functionality
      const searchResult = await this.client.query(`
        SELECT name, category 
        FROM products 
        WHERE search_vector @@ plainto_tsquery('camera') 
        LIMIT 3
      `);
      console.log(`✅ SEARCH: Found ${searchResult.rows.length} products matching 'camera'`);

      console.log('\n✅ CRUD operations test completed successfully');
      return true;

    } catch (error) {
      console.error('❌ CRUD operations test failed:', error.message);
      return false;
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'migrate';

  console.log('🚀 ALVA POS MVP - Database Migration Tool');
  console.log('=====================================');

  const migrator = new SimpleMigrator();
  
  try {
    // Connect to database
    const connected = await migrator.connect();
    if (!connected) {
      process.exit(1);
    }

    // Test connection
    const connectionOk = await migrator.testConnection();
    if (!connectionOk) {
      process.exit(1);
    }

    switch (command) {
      case 'migrate':
      case 'up':
        const migrateSuccess = await migrator.runAllMigrations();
        if (migrateSuccess) {
          await migrator.verifyDatabaseSetup();
          await migrator.testCRUDOperations();
        }
        process.exit(migrateSuccess ? 0 : 1);
        break;

      case 'status':
        const status = await migrator.getMigrationStatus();
        migrator.printMigrationStatus(status.applied, status.pending);
        break;

      case 'verify':
        const verifySuccess = await migrator.verifyDatabaseSetup();
        process.exit(verifySuccess ? 0 : 1);
        break;

      case 'test':
        const testSuccess = await migrator.testCRUDOperations();
        process.exit(testSuccess ? 0 : 1);
        break;

      default:
        console.log('Usage: node migrate.js [command]');
        console.log('Commands:');
        console.log('  migrate, up  - Run pending migrations (default)');
        console.log('  status       - Show migration status');
        console.log('  verify       - Verify database setup');
        console.log('  test         - Test CRUD operations');
        break;
    }

  } catch (error) {
    console.error('💥 Migration script error:', error.message);
    process.exit(1);
  } finally {
    await migrator.disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Migration interrupted');
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Migration terminated');
  process.exit(1);
});

if (require.main === module) {
  main();
}