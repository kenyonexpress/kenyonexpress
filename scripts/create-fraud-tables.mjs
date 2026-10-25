#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const url = envVars.NEXT_PUBLIC_SUPABASE_URL
const key = envVars.SUPABASE_SERVICE_ROLE_KEY

console.log('Creating fraud tables via direct SQL execution...')

// Read migration
const migrationPath = join(__dirname, '../supabase/migrations/310_fraud_detection_tables.sql')
const sql = readFileSync(migrationPath, 'utf8')

// Execute via fetch to Supabase REST API
const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({ query: sql }),
})

if (!response.ok) {
  const text = await response.text()
  console.error('Failed to create tables:', text)
  console.log('\nAttempting statement-by-statement execution...')

  // Try executing each statement individually
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'))

  let success = 0
  let failed = 0

  for (const statement of statements) {
    if (statement === 'DO $$' || statement === 'END $$' || !statement) continue

    // Use pg_catalog to execute raw SQL
    try {
      const res = await fetch(`${url}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ sql: `${statement};` }),
      })

      if (res.ok) {
        success++
      } else {
        const err = await res.text()
        if (err.includes('already exists')) {
          console.log('⚠️  Already exists (skipping):', statement.substring(0, 80))
          success++
        } else {
          console.error('❌ Failed:', statement.substring(0, 80))
          console.error('   Error:', err)
          failed++
        }
      }
    } catch (_e) {
      failed++
    }
  }

  console.log(`\nResults: ${success} succeeded, ${failed} failed`)
  if (failed > 0) {
    console.error('\n⚠️  Migration incomplete. Some statements failed.')
    process.exit(1)
  }
} else {
  console.log('✅ Migration 310 applied successfully!')
}
