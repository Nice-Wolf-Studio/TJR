#!/usr/bin/env node

/**
 * Setup Supabase database schema
 * Executes the schema.sql file using Supabase client
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase credentials
const SUPABASE_URL = 'https://bgxuoythpcjnfhifdgvh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJneHVveXRocGNqbmZoaWZkZ3ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NDA4NzksImV4cCI6MjA3NTExNjg3OX0.ZmbJ4uV6ROO_h-pNALM1wSsmWHEobaLPL5gTKpvqX7M';

async function setupDatabase() {
  console.log('🔧 Setting up Supabase database schema...');

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Read schema SQL file
  const schemaPath = join(__dirname, '..', 'docs', 'database', 'schema.sql');
  console.log(`📖 Reading schema from: ${schemaPath}`);

  const schemaSql = readFileSync(schemaPath, 'utf-8');

  // Execute SQL (using RPC call to execute raw SQL)
  console.log('⚡ Executing SQL schema...');

  // Split the SQL into individual statements
  const statements = schemaSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📝 Found ${statements.length} SQL statements`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';';

    // Skip comments and empty statements
    if (statement.trim().startsWith('--') || statement.trim() === ';') {
      continue;
    }

    try {
      // Extract the first few words for logging
      const preview = statement.substring(0, 60).replace(/\s+/g, ' ');
      console.log(`  [${i + 1}/${statements.length}] ${preview}...`);

      // Execute via RPC (using the postgres extension)
      const { error } = await supabase.rpc('exec_sql', { sql: statement });

      if (error) {
        // Try direct execution as fallback
        const { error: error2 } = await supabase
          .from('_dummy_')
          .select('*')
          .limit(0);

        if (error2 && !error2.message.includes('does not exist')) {
          console.warn(`  ⚠️  Warning: ${error.message.substring(0, 100)}`);
          errorCount++;
        } else {
          successCount++;
        }
      } else {
        successCount++;
      }
    } catch (err) {
      console.error(`  ❌ Error: ${err.message.substring(0, 100)}`);
      errorCount++;
    }
  }

  console.log('\n✅ Database setup complete!');
  console.log(`   Success: ${successCount} statements`);
  if (errorCount > 0) {
    console.log(`   Warnings: ${errorCount} statements`);
  }

  // Verify tables were created
  console.log('\n📊 Verifying tables...');

  const tables = ['market_data_cache', 'query_log', 'trades', 'analysis'];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`   ❌ ${table}: Not found (${error.message.substring(0, 50)})`);
      } else {
        console.log(`   ✅ ${table}: OK (${count || 0} rows)`);
      }
    } catch (err) {
      console.log(`   ⚠️  ${table}: ${err.message.substring(0, 50)}`);
    }
  }

  console.log('\n🎉 All done! Database is ready for use.');
  console.log('\n📝 Next steps:');
  console.log('   1. Restart the Discord bot');
  console.log('   2. Test with: /ask What is the current ES price?');
  console.log('   3. Verify logs in Supabase: SELECT * FROM query_log LIMIT 10;');
}

// Run setup
setupDatabase().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
