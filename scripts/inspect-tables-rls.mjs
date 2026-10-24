#!/usr/bin/env node
/**
 * inspect-tables-rls.mjs
 *
 * Inspect specific tables to understand their structure and existing policies
 */

import { execSync } from 'node:child_process'

const PROJECT_REF = 'ixvwfbuvfxxsjiywhbbb'
const TABLES = ['admin_users', 'payment_card_verifications']

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

async function queryDatabase(sql) {
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

async function main() {
  for (const table of TABLES) {
    console.log(`\n=== ${table} ===\n`)

    // Get columns
    const columnsSQL = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '${table}'
      ORDER BY ordinal_position;
    `

    const columns = await queryDatabase(columnsSQL)
    console.log('Columns:')
    for (const col of columns) {
      console.log(
        `  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`,
      )
    }

    // Get existing policies
    const policiesSQL = `
      SELECT policyname, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = '${table}';
    `

    const policies = await queryDatabase(policiesSQL)
    console.log('\nExisting RLS Policies:')
    if (policies.length === 0) {
      console.log('  (none)')
    } else {
      for (const p of policies) {
        console.log(`  ${p.policyname}: ${p.cmd}`)
        if (p.qual) console.log(`    USING: ${p.qual}`)
        if (p.with_check) console.log(`    WITH CHECK: ${p.with_check}`)
      }
    }

    // Get row count
    const countSQL = `SELECT COUNT(*) as count FROM ${table};`
    const count = await queryDatabase(countSQL)
    console.log(`\nRow count: ${count[0].count}`)
  }
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
