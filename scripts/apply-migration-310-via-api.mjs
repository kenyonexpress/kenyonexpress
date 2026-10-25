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
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})

console.log('Applying migration 310 via Supabase client...')

// Create tables one by one via direct client calls
// fraud_alerts table
console.log('Creating fraud_alerts table...')
const { error: createAlertsError } = await supabase.from('fraud_alerts').select('id').limit(0)
if (createAlertsError && createAlertsError.code === 'PGRST116') {
  console.log('✅ fraud_alerts table does not exist, will create via raw SQL')
  // Table doesn't exist, need to create it
  // We'll create it via a raw query if possible
}

// Try using raw SQL via rpc if available
const _createTablesSQL = `
-- fraud_alerts table
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  order_id uuid,
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  device_fingerprint text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'blocked')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- fraud_ip_signup_log table
CREATE TABLE IF NOT EXISTS fraud_ip_signup_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  user_id uuid,
  email text NOT NULL,
  blocked boolean NOT NULL DEFAULT false,
  block_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
`

// Since we can't execute DDL directly via REST API, let's verify tables exist by trying to query them
console.log('\nVerifying fraud tables...')

const { error: alertsError } = await supabase.from('fraud_alerts').select('count').limit(0)
const { error: ipLogError } = await supabase.from('fraud_ip_signup_log').select('count').limit(0)

if (alertsError || ipLogError) {
  console.error('\n❌ Fraud tables do not exist and cannot be created via REST API')
  console.error('   fraud_alerts:', alertsError?.message || '✓')
  console.error('   fraud_ip_signup_log:', ipLogError?.message || '✓')
  console.error('\n⚠️  Migration 310 requires database admin access to apply')
  console.error('   Please apply supabase/migrations/310_fraud_detection_tables.sql manually')
  process.exit(1)
}

console.log('✅ Fraud tables verified!')
console.log('   - fraud_alerts: accessible')
console.log('   - fraud_ip_signup_log: accessible')
