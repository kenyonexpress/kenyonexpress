#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load env
const envPath = join(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf8')
const envVars = {}
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.+)$/)
  if (match) {
    envVars[match[1]] = match[2]
  }
}

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const migrationPath = join(__dirname, '../migrations/pending/310_fraud_detection_tables.sql')
const sql = readFileSync(migrationPath, 'utf8')

console.log('Applying migration 310: fraud detection tables...')

// Execute the SQL directly
const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql })

if (error) {
  // If exec_sql doesn't exist, try direct execution via pg
  console.log('exec_sql RPC not available, using direct connection...')

  // For Supabase, we need to use the REST API to execute SQL
  // This is a simplified version - in production you'd use proper migration tools
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--') && s !== 'DO $$' && s !== 'END $$')

  for (const statement of statements) {
    console.log('Executing statement:', `${statement.substring(0, 80)}...`)
    // We'll need to execute each DDL statement individually
    // This is complex, so for now just report what would be done
  }

  console.error('Cannot apply migration automatically.')
  console.error('Please apply migrations/pending/310_fraud_detection_tables.sql manually.')
  console.error('Error:', error.message)
  process.exit(1)
}

console.log('Migration 310 applied successfully!')
console.log('Result:', data)
