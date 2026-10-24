#!/usr/bin/env node
/**
 * C02: Apply migrations via Supabase MCP apply_migration tool.
 * Based on db-mcp-probe.mjs but without --read-only flag.
 *
 * Usage:
 *   TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
 *   SUPABASE_ACCESS_TOKEN=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d) \
 *     node scripts/apply-migration-mcp.mjs 162_cron_schedule.sql
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'

const PROJECT_REF = 'ixvwfbuvfxxsjiywhbbb'

function unwrapMcpResult(msg) {
  if (msg.error) return { error: msg.error }
  let text = msg.result?.content?.[0]?.text ?? ''
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && typeof parsed.result === 'string') {
      text = parsed.result
    } else if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch {
    // plain text: fall through to the boundary scan
  }
  const m = text.match(/<untrusted-data-([a-f0-9-]+)>\n([\s\S]*?)\n<\/untrusted-data-\1>/)
  const body = m ? m[2] : text
  try {
    return JSON.parse(body)
  } catch {
    return { raw: body }
  }
}

function startServer(readOnly = false) {
  const args = ['-y', '@supabase/mcp-server-supabase@latest', `--project-ref=${PROJECT_REF}`]
  if (readOnly) args.push('--read-only')

  const child = spawn('npx', args, {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: process.env,
  })

  const pending = new Map()
  let nextId = 1

  createInterface({ input: child.stdout }).on('line', (line) => {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  })

  const send = (method, params, notify = false) => {
    const id = notify ? undefined : nextId++
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    if (notify) return Promise.resolve()
    return new Promise((resolve) => pending.set(id, resolve))
  }

  return { child, send }
}

async function main() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.error('SUPABASE_ACCESS_TOKEN is required')
    process.exit(2)
  }

  const migrationFile = process.argv[2]
  if (!migrationFile) {
    console.error('Usage: node apply-migration-mcp.mjs <migration-file>')
    process.exit(2)
  }

  const migrationPath = resolve(process.cwd(), 'migrations/pending', migrationFile)
  const sql = readFileSync(migrationPath, 'utf-8')

  console.error(`Connecting to Supabase MCP (project: ${PROJECT_REF})...`)
  const { child, send } = startServer(false) // NOT read-only

  await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'apply-migration-mcp', version: '1' },
  })
  await send('notifications/initialized', {}, true)

  // List available tools
  const tools = await send('tools/list', {})
  const toolNames = (tools.result?.tools ?? []).map((t) => t.name)
  console.error(`Available tools: ${toolNames.join(', ')}`)

  // Apply migration via Supabase MCP apply_migration (as per C02 requirement)
  console.error(`\nApplying migration: ${migrationFile}`)
  const migrationName = migrationFile.replace('.sql', '')
  const applyResult = unwrapMcpResult(
    await send('tools/call', {
      name: 'apply_migration',
      arguments: {
        name: migrationName,
        query: sql,
      },
    }),
  )

  if (applyResult.error) {
    console.error(`\nERROR applying ${migrationFile}:`, applyResult.error)
    child.kill()
    process.exit(1)
  }

  console.error('✓ Migration applied')

  // Verify by checking supabase_migrations.schema_migrations
  console.error('\nVerifying migration in schema_migrations...')
  const verifyResult = unwrapMcpResult(
    await send('tools/call', {
      name: 'execute_sql',
      arguments: {
        query: `SELECT version, name FROM supabase_migrations.schema_migrations WHERE name LIKE '%${migrationFile.replace('.sql', '')}%' ORDER BY version DESC LIMIT 1`,
      },
    }),
  )

  const output = {
    file: migrationFile,
    applied: applyResult,
    verified: verifyResult,
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)

  child.kill()

  if (verifyResult.error) {
    console.error('\nWARNING: Could not verify migration:', verifyResult.error)
  } else if (Array.isArray(verifyResult) && verifyResult.length > 0) {
    console.error(`✓ Verified in schema_migrations: version ${verifyResult[0].version}`)
  } else {
    console.error('WARNING: Migration not found in schema_migrations')
  }

  process.exit(0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
