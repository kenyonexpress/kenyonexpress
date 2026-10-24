#!/usr/bin/env node
/**
 * apply-rls-migrations.mjs
 *
 * Apply migrations 298 and 299 to enable RLS on admin_users and payment_card_verifications
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_REF = 'ixvwfbuvfxxsjiywhbbb'

function getSupabaseToken() {
  try {
    const token = execSync('security find-generic-password -s "Supabase CLI" -w', {
      encoding: 'utf-8',
    }).trim()

    if (token.startsWith('go-keyring-base64:')) {
      const base64Part = token.slice('go-keyring-base64:'.length)
      return Buffer.from(base64Part, 'base64').toString('utf-8')
    }

    return token
  } catch (err) {
    console.error('Failed to get Supabase token from keychain:', err.message)
    process.exit(2)
  }
}

async function executeSQL(sql) {
  const token = getSupabaseToken()
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Query failed (${response.status}): ${text}`)
  }

  return await response.json()
}

async function applyMigration(migrationPath, migrationName) {
  console.log(`\nApplying ${migrationName}...`)

  const sql = readFileSync(migrationPath, 'utf-8')

  try {
    const result = await executeSQL(sql)
    console.log(`✅ ${migrationName} applied successfully`)
    if (result && result.length > 0) {
      console.log('Result:', JSON.stringify(result, null, 2))
    }
    return true
  } catch (err) {
    console.error(`❌ ${migrationName} failed:`, err.message)
    return false
  }
}

async function verifyRLS(tableName) {
  console.log(`\nVerifying RLS on ${tableName}...`)

  const sql = `
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = '${tableName}') AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '${tableName}';
  `

  const result = await executeSQL(sql)

  if (result.length > 0) {
    const row = result[0]
    console.log(`  RLS enabled: ${row.rls_enabled ? '✅' : '❌'}`)
    console.log(`  Policy count: ${row.policy_count}`)
    return row.rls_enabled
  }

  return false
}

async function main() {
  console.log('Applying RLS migrations for C72...\n')

  const migration298 = resolve(__dirname, '..', 'migrations', 'pending', '298_admin_users_rls.sql')
  const migration299 = resolve(
    __dirname,
    '..',
    'migrations',
    'pending',
    '299_payment_card_verifications_rls.sql',
  )

  // Apply migrations
  const success298 = await applyMigration(migration298, 'Migration 298 (admin_users RLS)')
  const success299 = await applyMigration(
    migration299,
    'Migration 299 (payment_card_verifications RLS)',
  )

  if (!success298 || !success299) {
    console.error('\n❌ One or more migrations failed')
    process.exit(1)
  }

  // Verify RLS is enabled
  const verified298 = await verifyRLS('admin_users')
  const verified299 = await verifyRLS('payment_card_verifications')

  if (!verified298 || !verified299) {
    console.error('\n❌ RLS verification failed')
    process.exit(1)
  }

  console.log('\n✅ All migrations applied and verified successfully!')
  process.exit(0)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
