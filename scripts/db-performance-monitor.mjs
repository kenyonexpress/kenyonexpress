#!/usr/bin/env node

/**
 * MAINTENANCE_LOOP_9: Database Performance Monitoring Script
 *
 * Generates a performance report for Supabase connection pool and query metrics.
 * Used by MAINTENANCE_LOOP_9 to verify:
 * - Connection pool is healthy and responsive
 * - No slow queries detected (>500ms)
 * - Query timeout enforcement is working
 *
 * Writes findings to docs/DB-STATUS.md
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SLOW_QUERY_THRESHOLD_MS = 500
const CONNECTION_TIMEOUT_MS = 2000
const TEST_TIMEOUT_MS = 10000

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

/**
 * Performs connection pool and query performance monitoring
 */
async function monitorDatabasePerformance() {
  console.log('🔍 Starting database performance monitoring...')
  console.log(`📅 ${new Date().toISOString()}`)

  const results = {
    timestamp: new Date().toISOString(),
    connectionPool: null,
    queries: [],
    slowQueriesDetected: [],
    errors: [],
    summary: null,
  }

  // Test 1: Connection pool responsiveness
  console.log('\n1️⃣  Testing connection pool...')
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const startTime = Date.now()

    const { count, error } = await Promise.race([
      client.from('products').select('id', { count: 'exact', head: true }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT_MS),
      ),
    ])

    const elapsed = Date.now() - startTime

    if (error) {
      results.connectionPool = { status: 'ERROR', error: error.message, elapsedMs: elapsed }
      results.errors.push(`Connection pool error: ${error.message}`)
      console.error(`   ❌ Connection failed: ${error.message}`)
    } else {
      results.connectionPool = { status: 'HEALTHY', elapsedMs: elapsed, productCount: count }
      console.log(`   ✅ Connection established in ${elapsed}ms`)
      console.log(`   ✅ Product count: ${count}`)
    }
  } catch (err) {
    results.connectionPool = { status: 'ERROR', error: err.message }
    results.errors.push(`Connection pool test failed: ${err.message}`)
    console.error(`   ❌ ${err.message}`)
  }

  // Test 2: Query performance baseline
  console.log('\n2️⃣  Testing query performance...')
  const queries = [
    {
      name: 'products-active',
      table: 'products',
      filters: [{ col: 'status', op: 'eq', val: 'active' }],
      limit: 10,
    },
    {
      name: 'coupons-active',
      table: 'coupons',
      filters: [{ col: 'status', op: 'eq', val: 'active' }],
      limit: 20,
    },
    { name: 'products-count', table: 'products', filters: [], limit: 1, countExact: true },
  ]

  for (const query of queries) {
    try {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      const startTime = Date.now()

      let q = client.from(query.table).select('id')
      for (const filter of query.filters) {
        q = q[filter.op](filter.col, filter.val)
      }
      q = q.limit(query.limit)

      const { data, error } = await Promise.race([
        q,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), TEST_TIMEOUT_MS),
        ),
      ])

      const elapsed = Date.now() - startTime
      const isSlow = elapsed > SLOW_QUERY_THRESHOLD_MS

      if (error) {
        results.errors.push(`Query ${query.name} error: ${error.message}`)
        console.error(`   ❌ ${query.name}: ${error.message}`)
      } else {
        const status = isSlow ? '⚠️ SLOW' : '✅'
        console.log(
          `   ${status} ${query.name}: ${elapsed}ms (rows: ${Array.isArray(data) ? data.length : 0})`,
        )

        results.queries.push({
          name: query.name,
          elapsedMs: elapsed,
          rowCount: Array.isArray(data) ? data.length : 0,
          isSlow,
        })

        if (isSlow) {
          results.slowQueriesDetected.push({
            query: query.name,
            elapsedMs: elapsed,
            threshold: SLOW_QUERY_THRESHOLD_MS,
          })
        }
      }
    } catch (err) {
      results.errors.push(`Query ${query.name} failed: ${err.message}`)
      console.error(`   ❌ ${query.name}: ${err.message}`)
    }
  }

  // Summary
  console.log('\n📊 Summary:')
  const slowCount = results.slowQueriesDetected.length
  if (slowCount === 0) {
    console.log('   ✅ No slow queries detected (>500ms)')
  } else {
    console.log(`   ⚠️  ${slowCount} slow query/ies detected`)
  }

  if (results.errors.length === 0) {
    console.log('   ✅ No errors detected')
  } else {
    console.log(`   ❌ ${results.errors.length} error(s) detected`)
  }

  results.summary = {
    connectionPoolHealthy: results.connectionPool?.status === 'HEALTHY',
    slowQueriesDetected: slowCount,
    totalQueries: results.queries.length,
    errorsDetected: results.errors.length,
  }

  return results
}

/**
 * Updates DB-STATUS.md with monitoring results
 */
function updateStatusReport(results) {
  const statusFilePath = path.resolve(projectRoot, 'docs', 'DB-STATUS.md')

  let content = fs.readFileSync(statusFilePath, 'utf-8')

  // Update timestamp
  const now = new Date().toISOString().split('T')[0]
  const nowTime = new Date().toLocaleTimeString('en-US', { timeZone: 'UTC' })
  const timestamp = `**Last Updated:** ${now} ${nowTime} UTC`

  content = content.replace(/\*\*Last Updated:\*\*.*?UTC.*?\n/s, `${timestamp}\n`)

  // Create findings section
  let alertSection = '## ⚠️ Monitoring Alert\n\n'

  if (results.slowQueriesDetected.length > 0) {
    alertSection += '### Slow Queries Detected (>500ms)\n\n'
    alertSection += `**Count:** ${results.slowQueriesDetected.length}\n\n`
    alertSection += '| Query | Elapsed (ms) | Threshold (ms) |\n'
    alertSection += '|-------|--------------|----------------|\n'
    for (const slow of results.slowQueriesDetected) {
      alertSection += `| ${slow.query} | ${slow.elapsedMs} | ${slow.threshold} |\n`
    }
    alertSection += '\n**Action:** Review query construction and indexing strategies.\n\n'
  } else {
    alertSection += '### No Slow Queries Detected\n\n'
    alertSection += `All monitored queries completed within ${SLOW_QUERY_THRESHOLD_MS}ms threshold.\n\n`
  }

  if (results.errors.length > 0) {
    alertSection += '### Errors During Monitoring\n\n'
    alertSection += `**Count:** ${results.errors.length}\n\n`
    for (const err of results.errors) {
      alertSection += `- ${err}\n`
    }
  }

  alertSection += `**Timestamp:** ${results.timestamp}\n\n---\n\n`

  // Insert alert section after the executive summary
  const insertPoint = content.indexOf('---\n\n## 1. Connection Pool Configuration')
  if (insertPoint > -1) {
    content = `${content.slice(0, insertPoint)}---\n\n${alertSection}${content.slice(insertPoint + 4)}`
  }

  fs.writeFileSync(statusFilePath, content, 'utf-8')
  console.log(`\n✅ Updated ${statusFilePath}`)
}

// Run monitoring
try {
  const results = await monitorDatabasePerformance()
  updateStatusReport(results)

  // Exit with success
  process.exit(results.summary.errorsDetected === 0 ? 0 : 1)
} catch (err) {
  console.error('❌ Monitoring failed:', err.message)
  process.exit(1)
}
