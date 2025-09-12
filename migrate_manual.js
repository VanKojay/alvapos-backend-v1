#!/usr/bin/env node

/**
 * Manual migration runner that handles PostgreSQL dollar-quoted functions properly
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'alva_pos_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'test123',
};

async function runMigrationFile(filePath, migrationName) {
  const client = new Client(config);
  await client.connect();
  
  try {
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`🔄 Running ${migrationName}...`);
    
    await client.query(sql);
    
    console.log(`✅ ${migrationName} completed successfully`);
    
    // Record the migration
    await client.query(`
      INSERT INTO schema_migrations (version, name, execution_time_ms) 
      VALUES ($1, $2, $3)
      ON CONFLICT (version) DO NOTHING
    `, [path.basename(filePath, '.sql'), migrationName, 0]);
    
    return true;
  } catch (error) {
    console.error(`❌ ${migrationName} failed:`, error.message);
    return false;
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('🚀 ALVA POS MVP - Manual Database Migration');
  console.log('==========================================');

  // First, ensure migration table exists
  const client = new Client(config);
  await client.connect();
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz DEFAULT NOW(),
      applied_by text DEFAULT current_user,
      execution_time_ms integer,
      checksum text
    );
  `);
  
  await client.end();
  console.log('✅ Migration tracking table ready');

  const migrationsPath = path.join(__dirname, 'src', 'database', 'migrations');
  
  // Run each migration sequentially
  const migrations = [
    { file: '001_initial_schema.sql', name: 'Initial Schema' },
    { file: '002_security_policies.sql', name: 'Security Policies' },
    { file: '003_search_optimization.sql', name: 'Search Optimization' }
  ];

  for (const migration of migrations) {
    const filePath = path.join(migrationsPath, migration.file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Migration file not found: ${migration.file}`);
      continue;
    }

    const success = await runMigrationFile(filePath, migration.name);
    
    if (!success) {
      console.log('💥 Stopping migration process due to failure');
      process.exit(1);
    }
    
    // Small delay between migrations
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🎉 All migrations completed successfully!');
  
  // Run verification
  console.log('\n🔍 Running verification...');
  await runVerification();
}

async function runVerification() {
  const client = new Client(config);
  await client.connect();

  try {
    // Check tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    console.log(`✅ Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    // Check sample data
    const productCount = await client.query('SELECT COUNT(*) FROM products');
    console.log(`✅ Sample products: ${productCount.rows[0].count}`);

    // Test a simple query
    const searchTest = await client.query(`
      SELECT name, category 
      FROM products 
      WHERE name ILIKE '%camera%'
      LIMIT 3
    `);
    console.log(`✅ Search test: Found ${searchTest.rows.length} products`);

    console.log('\n🎉 Database is fully operational!');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}