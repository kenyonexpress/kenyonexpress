#!/usr/bin/env node
import { readFileSync } from 'node:fs'
// Apply migration 130: suppliers.open_weekends
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_KEY in environment')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

const sql = readFileSync('supabase/migrations/130_suppliers_open_weekends.sql', 'utf-8')

console.log('Applying migration 130...')
console.log('SQL:', sql)

try {
  // Execute raw SQL using the service role
  const { data, error } = await supabase.rpc('exec', { sql })

  if (error) {
    console.error('Error applying migration:', error)
    process.exit(1)
  }

  console.log('✓ Migration 130 applied successfully')
  console.log('Data:', data)

  // Verify column exists
  const { data: testData, error: testError } = await supabase
    .from('suppliers')
    .select('id, name, open_weekends')
    .limit(1)

  if (testError) {
    console.error('Verification failed:', testError)
    process.exit(1)
  }

  console.log('✓ Verified: suppliers.open_weekends column exists')
  console.log('Test query returned:', testData)
} catch (err) {
  console.error('Exception:', err)
  process.exit(1)
}
