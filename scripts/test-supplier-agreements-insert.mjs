#!/usr/bin/env node
/**
 * C29: Test that supplier_agreements table accepts inserts and records all required fields.
 * Inserts a test row, verifies it, and cleans up.
 */
import { spawn } from 'node:child_process'
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
    // plain text: fall through
  }
  const m = text.match(/<untrusted-data-([a-f0-9-]+)>\n([\s\S]*?)\n<\/untrusted-data-\1>/)
  const body = m ? m[2] : text
  try {
    return JSON.parse(body)
  } catch {
    return { raw: body }
  }
}

function startServer() {
  const child = spawn(
    'npx',
    ['-y', '@supabase/mcp-server-supabase@latest', `--project-ref=${PROJECT_REF}`],
    {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: process.env,
    },
  )

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

  const send = (method, params) => {
    const id = nextId++
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    return new Promise((resolve) => pending.set(id, resolve))
  }

  return { child, send }
}

async function main() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    console.error('SUPABASE_ACCESS_TOKEN is required')
    process.exit(2)
  }

  console.error('Connecting to Supabase MCP...')
  const { child, send } = startServer()

  // Give it a moment to initialize
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // Step 1: Insert test row
  console.error('\n1. Inserting test row into supplier_agreements...')
  const insertResult = unwrapMcpResult(
    await send('tools/call', {
      name: 'execute_sql',
      arguments: {
        query: `
          INSERT INTO supplier_agreements (
            supplier_lead_id,
            verification_id,
            version_hash,
            version_date,
            ip_address,
            user_agent
          ) VALUES (
            NULL,
            NULL,
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            '2026-10-24',
            '192.0.2.1'::inet,
            'C29-Test-Agent/1.0'
          ) RETURNING id, version_hash, version_date, ip_address, user_agent, created_at
        `,
      },
    }),
  )

  if (insertResult.error) {
    console.error('ERROR inserting test row:', insertResult.error)
    child.kill()
    process.exit(1)
  }

  console.log('✓ Test row inserted:', JSON.stringify(insertResult, null, 2))

  // Step 2: Verify row exists
  console.error('\n2. Verifying row can be selected...')
  const selectResult = unwrapMcpResult(
    await send('tools/call', {
      name: 'execute_sql',
      arguments: {
        query: `SELECT id, version_hash, version_date, ip_address, user_agent, created_at FROM supplier_agreements WHERE user_agent = 'C29-Test-Agent/1.0' LIMIT 1`,
      },
    }),
  )

  if (selectResult.error || !Array.isArray(selectResult) || selectResult.length === 0) {
    console.error('ERROR verifying row:', selectResult.error || 'Row not found')
    child.kill()
    process.exit(1)
  }

  console.log('✓ Row verified:', JSON.stringify(selectResult[0], null, 2))

  // Step 3: Clean up test row
  console.error('\n3. Cleaning up test row...')
  const deleteResult = unwrapMcpResult(
    await send('tools/call', {
      name: 'execute_sql',
      arguments: {
        query: `DELETE FROM supplier_agreements WHERE user_agent = 'C29-Test-Agent/1.0' RETURNING id`,
      },
    }),
  )

  if (deleteResult.error) {
    console.error('ERROR deleting test row:', deleteResult.error)
    child.kill()
    process.exit(1)
  }

  console.log('✓ Test row deleted:', JSON.stringify(deleteResult, null, 2))

  console.error('\n✓ All tests passed - supplier_agreements table is working correctly')

  child.kill()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
