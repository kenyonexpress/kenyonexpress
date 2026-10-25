#!/usr/bin/env node
import { readFileSync } from 'node:fs'
// Apply migration 130 using pg library directly
import pg from 'pg'

const PROJECT_REF = 'ixvwfbuvfxxsjiywhbbb'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/^"/, '').replace(/"$/, '')

// Try Transaction pooler (port 6543) with service key
const regions = ['eu-north-1', 'us-east-1', 'ap-southeast-1']

async function tryConnection(region) {
  const connectionString = `postgresql://postgres.${PROJECT_REF}:${SERVICE_KEY}@aws-0-${region}.pooler.supabase.com:6543/postgres`

  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 })

  try {
    await client.connect()
    console.log(`✓ Connected via ${region}`)

    const sql = readFileSync('supabase/migrations/130_suppliers_open_weekends.sql', 'utf-8')
    console.log('Applying migration...')

    await client.query(sql)
    console.log('✓ Migration applied')

    // Verify
    const result = await client.query(
      'SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
      ['suppliers', 'open_weekends'],
    )

    if (result.rows.length > 0) {
      console.log('✓ Verified: suppliers.open_weekends exists')
      return true
    }
    console.error('✗ Column not found after migration')
    return false
  } catch (err) {
    if (err.code !== 'ECONNREFUSED' && err.code !== 'ETIMEDOUT') {
      console.error(`Error with ${region}:`, err.message)
    }
    return false
  } finally {
    await client.end().catch(() => {})
  }
}

for (const region of regions) {
  console.log(`Trying ${region}...`)
  if (await tryConnection(region)) {
    process.exit(0)
  }
}

console.error('Failed to connect to any region')
process.exit(1)
