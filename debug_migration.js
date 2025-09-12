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

async function debugMigration() {
  const client = new Client(config);
  await client.connect();
  
  const migrationFile = path.join(__dirname, 'src', 'database', 'migrations', '001_initial_schema.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');
  
  // Split into individual statements and try each one
  const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
  
  console.log(`Found ${statements.length} SQL statements`);
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i].trim() + ';';
    
    if (statement === ';' || statement.startsWith('--')) {
      continue;
    }
    
    console.log(`\n--- Statement ${i + 1} ---`);
    console.log(statement.substring(0, 100) + '...');
    
    try {
      await client.query(statement);
      console.log('✅ Success');
    } catch (error) {
      console.log('❌ Error:', error.message);
      console.log('Full statement:');
      console.log(statement);
      break;
    }
  }
  
  await client.end();
}

debugMigration().catch(console.error);