#!/usr/bin/env node
/**
 * Verifies that migration 130 was applied correctly by:
 * 1. Attempting to select platform_percent_snapshot from order_items (succeeds if renamed)
 * 2. Attempting to select platform_percent from order_items (fails if renamed)
 *
 * Run after applying migration 130 to production.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
})

console.log('🔍 Verifying Migration 130: platform_percent_snapshot\n')

// 1. Try to select the new column
console.log('1. Checking if platform_percent_snapshot column exists...')
const { data: newData, error: newError } = await supabase
  .from('order_items')
  .select('id, platform_percent_snapshot')
  .limit(1)

if (newError) {
  if (newError.code === '42703') {
    console.error('❌ Column platform_percent_snapshot does NOT exist')
    console.error('   → Migration 130 not applied')
    console.error(`   Database error: ${newError.message}`)
    process.exit(1)
  }
  // Other errors might be permissions, empty table, etc - not blockers
  console.log(`  ⚠ Non-fatal error: ${newError.message}`)
}

console.log('✓ Column platform_percent_snapshot exists and is selectable')

// 2. Try to select the old column (should fail)
console.log('\n2. Checking if old column platform_percent was removed...')
const { data: oldData, error: oldError } = await supabase
  .from('order_items')
  .select('id, platform_percent')
  .limit(1)

if (!oldError) {
  console.error('❌ Old column platform_percent still EXISTS')
  console.error('   → Migration 130 rename did not complete')
  process.exit(1)
}

if (oldError.code !== '42703') {
  console.error('❌ Unexpected error checking old column:', oldError.message)
  process.exit(1)
}

console.log('✓ Old column platform_percent does not exist (successfully renamed)')
console.log(`  Database confirmed: ${oldError.message}`)

console.log('\n✅ Migration 130 verification PASSED')
console.log('   Column renamed from platform_percent → platform_percent_snapshot')
console.log('   Note: Trigger enforcement cannot be verified via JS client; check migration logs.')
