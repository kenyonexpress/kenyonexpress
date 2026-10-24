#!/usr/bin/env node
/**
 * check-rls-coverage.mjs
 *
 * Query all tables in the public schema and check which ones don't have RLS enabled.
 * Uses the Supabase Management API via the CLI's OAuth token from the macOS keychain.
 *
 * Exit codes:
 *   0 - All tables have RLS enabled
 *   1 - One or more tables missing RLS
 *   2 - Error querying database
 */

import { execSync } from 'node:child_process'

const PROJECT_REF = 'ixvwfbuvfxxsjiywhbbb'

function getSupabaseToken() {
  try {
    const token = execSync('security find-generic-password -s "Supabase CLI" -w', {
      encoding: 'utf-8',
    }).trim()

    // Decode if base64-encoded
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
  console.log('Checking RLS coverage for all public tables...\n')

  const sql = `
    SELECT
      schemaname,
      tablename,
      rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `

  try {
    const result = await queryDatabase(sql)

    if (!Array.isArray(result)) {
      console.error('Unexpected response format:', result)
      process.exit(2)
    }

    const tablesWithoutRLS = result.filter((row) => !row.rowsecurity)
    const tablesWithRLS = result.filter((row) => row.rowsecurity)

    console.log(`Total tables in public schema: ${result.length}`)
    console.log(`Tables WITH RLS enabled: ${tablesWithRLS.length}`)
    console.log(`Tables WITHOUT RLS enabled: ${tablesWithoutRLS.length}\n`)

    if (tablesWithoutRLS.length > 0) {
      console.log('❌ Tables missing RLS:\n')
      for (const row of tablesWithoutRLS) {
        console.log(`  - ${row.tablename}`)
      }
      console.log('')
      process.exit(1)
    } else {
      console.log('✅ All public tables have RLS enabled')
      process.exit(0)
    }
  } catch (err) {
    console.error('Error querying database:', err.message)
    process.exit(2)
  }
}

main()
