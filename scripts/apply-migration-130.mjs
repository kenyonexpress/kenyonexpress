#!/usr/bin/env node
/**
 * Apply migration 130 and verify cron.job_run_details exists.
 * Uses the postgres npm package to connect directly to Supabase.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Load env vars
const envPath = join(projectRoot, '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const env = Object.fromEntries(
  envContent
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [key, ...valueParts] = line.split('=')
      const value = valueParts.join('=').replace(/^["']|["']$/g, '')
      return [key, value]
    }),
)

// Extract connection details
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

// Parse project ref from URL (e.g., https://PROJECT_REF.supabase.co)
const projectRef = new URL(supabaseUrl).hostname.split('.')[0]

// Construct connection string
// Direct connection: postgresql://postgres:[password]@db.PROJECT_REF.supabase.co:5432/postgres

console.log('Connecting to Supabase database...')
console.log(`Project: ${projectRef}`)

// Use direct connection format
const connectionString = `postgresql://postgres:${serviceRoleKey}@db.${projectRef}.supabase.co:5432/postgres`

const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
})

async function main() {
  try {
    // Test connection
    console.log('Testing connection...')
    const result = await sql`SELECT version()`
    console.log('✓ Connected to PostgreSQL:', result[0].version.split(' ').slice(0, 2).join(' '))

    // Read migration file
    const migrationPath = join(projectRoot, 'supabase/migrations/130_pg_cron_pg_net.sql')
    console.log(`\nReading migration: ${migrationPath}`)
    const migration = readFileSync(migrationPath, 'utf-8')

    // Apply migration
    console.log('Applying migration 130...')
    await sql.unsafe(migration)
    console.log('✓ Migration applied successfully')

    // Verify extensions
    console.log('\nVerifying extensions...')
    const extensions = await sql`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname IN ('pg_cron', 'pg_net')
      ORDER BY extname
    `
    for (const ext of extensions) {
      console.log(`✓ ${ext.extname} v${ext.extversion}`)
    }

    if (extensions.length !== 2) {
      throw new Error(`Expected 2 extensions (pg_cron, pg_net), got ${extensions.length}`)
    }

    // Verify backup_log table
    console.log('\nVerifying backup_log table...')
    const tables = await sql`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'backup_log'
    `
    if (tables.length === 0) {
      throw new Error('backup_log table not created')
    }
    console.log('✓ backup_log table exists')

    // Verify functions
    console.log('\nVerifying functions...')
    const functions = await sql`
      SELECT proname
      FROM pg_proc
      WHERE proname LIKE 'fn_drain%'
         OR proname LIKE 'fn_process%'
         OR proname LIKE 'fn_record%'
      ORDER BY proname
    `
    console.log(`✓ ${functions.length} functions created:`)
    for (const fn of functions) {
      console.log(`  - ${fn.proname}()`)
    }

    // CRITICAL VERIFICATION: Check cron.job_run_details exists
    console.log('\n🔍 VERIFYING cron.job_run_details...')
    try {
      const cronCheck = await sql`
        SELECT COUNT(*) as count
        FROM cron.job_run_details
      `
      console.log('✅ cron.job_run_details table EXISTS')
      console.log(`   Current job run count: ${cronCheck[0].count}`)
    } catch (err) {
      if (err.message.includes('does not exist')) {
        console.error('❌ cron.job_run_details table DOES NOT EXIST')
        console.error('   pg_cron extension may not be properly installed')
        throw err
      }
      throw err
    }

    // Check if jobs are scheduled
    console.log('\nChecking scheduled jobs...')
    const jobs = await sql`
      SELECT jobid, jobname, schedule, active
      FROM cron.job
      ORDER BY jobname
    `
    if (jobs.length === 0) {
      console.log('⚠️  No jobs scheduled yet')
      console.log('   Run: supabase/schedules/cron_jobs.sql to schedule jobs')
    } else {
      console.log(`✓ ${jobs.length} jobs scheduled:`)
      for (const job of jobs) {
        console.log(`  - ${job.jobname} (${job.schedule}) - ${job.active ? 'active' : 'inactive'}`)
      }
    }

    console.log('\n✅ VERIFICATION COMPLETE')
    console.log('\nMigration 130 applied successfully.')
    console.log('cron.job_run_details table verified.')
    console.log('\nNext steps:')
    console.log('1. Configure database settings (app_url, cron_secret)')
    console.log('2. Run supabase/schedules/cron_jobs.sql to schedule jobs')
    console.log('3. Wait 5 minutes and check: SELECT * FROM cron.job_run_details LIMIT 10;')

    process.exit(0)
  } catch (error) {
    console.error('\n❌ ERROR:', error.message)
    if (error.code === 'SASL_SIGNATURE_MISMATCH') {
      console.error('\nConnection failed. Possible reasons:')
      console.error('- Wrong service role key')
      console.error('- Network/firewall blocking connection')
      console.error('- Incorrect connection string format')
    }
    process.exit(1)
  } finally {
    await sql.end()
  }
}

main()
