#!/usr/bin/env node
/**
 * Call the official Supabase MCP server (@supabase/mcp-server-supabase) from a
 * script, over stdio, with the CLI's personal access token.
 *
 *   node scripts/supabase-mcp.mjs --project-ref <ref> [--read-only] list
 *   node scripts/supabase-mcp.mjs --project-ref <ref> [--read-only] call <tool> '<json args>'
 *
 * WHY. The harness's "claude.ai Supabase" connector needs an OAuth handshake
 * that only Ofir can finish in a browser, so an autonomous session has no MCP
 * tool to call. The server behind that connector is also published as a
 * package, and it speaks MCP over stdio. This file is that client: the same
 * tools (`execute_sql`, `list_tables`, `apply_migration`, `get_advisors`, ...),
 * the same server, driven from Node. SUPABASE_ACCESS_TOKEN comes from the
 * environment; `supabase-mcp-token.sh` (not in the repo) or the keychain the
 * CLI uses (`security find-generic-password -s "Supabase CLI" -w`) are the
 * sources. The token never appears in argv.
 *
 * `--read-only` is passed through to the server, which then opens every SQL
 * statement in a read-only transaction. Default here is read-only; `--write`
 * lifts it, and that is the flag to leave off against production.
 *
 * Transport: newline-delimited JSON-RPC 2.0 (MCP stdio transport). Framing in
 * ./supabase-mcp/lib.mjs so it can be unit tested without a server.
 */

import { spawn } from 'node:child_process'
import { encodeMessage, splitFrames } from './supabase-mcp/lib.mjs'

function parseArgs(argv) {
  const out = { positional: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--read-only') out.readOnly = true
    else if (a === '--write') out.write = true
    else if (a.startsWith('--project-ref=')) out.projectRef = a.slice('--project-ref='.length)
    else if (a === '--project-ref') out.projectRef = argv[++i]
    else out.positional.push(a)
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
if (!token) {
  console.error(
    'SUPABASE_ACCESS_TOKEN is not set (sbp_...). Export it; do not pass it on the command line.',
  )
  process.exit(2)
}
if (!args.projectRef) {
  console.error(
    'usage: supabase-mcp.mjs --project-ref <ref> [--read-only|--write] list | call <tool> <json>',
  )
  process.exit(2)
}
const readOnly = !args.write

const serverArgs = [
  '-y',
  '@supabase/mcp-server-supabase@latest',
  `--project-ref=${args.projectRef}`,
]
if (readOnly) serverArgs.push('--read-only')
const server = spawn('npx', serverArgs, {
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  stdio: ['pipe', 'pipe', 'inherit'],
})

let nextId = 1
const pending = new Map()
let buffer = ''
server.stdout.setEncoding('utf8')
server.stdout.on('data', (chunk) => {
  buffer += chunk
  const { frames, rest } = splitFrames(buffer)
  buffer = rest
  for (const frame of frames) {
    if (frame.id !== undefined && pending.has(frame.id)) {
      const { resolve, reject } = pending.get(frame.id)
      pending.delete(frame.id)
      if (frame.error) reject(new Error(`${frame.error.code}: ${frame.error.message}`))
      else resolve(frame.result)
    }
  }
})

function request(method, params) {
  const id = nextId++
  server.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params }))
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method}: no answer in 120s`))
    }, 120_000)
  })
}

function notify(method, params) {
  server.stdin.write(encodeMessage({ jsonrpc: '2.0', method, params }))
}

async function main() {
  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'kenyonexpress-scripts', version: '1.0.0' },
  })
  notify('notifications/initialized', {})

  const [command, tool, json] = args.positional
  if (command === 'list') {
    const { tools } = await request('tools/list', {})
    for (const t of tools)
      console.log(`${t.name.padEnd(28)} ${(t.description ?? '').split('\n')[0].slice(0, 90)}`)
    return 0
  }
  if (command === 'call' && tool) {
    const result = await request('tools/call', {
      name: tool,
      arguments: json ? JSON.parse(json) : {},
    })
    for (const part of result.content ?? []) {
      if (part.type === 'text') console.log(part.text)
      else console.log(JSON.stringify(part))
    }
    return result.isError ? 1 : 0
  }
  console.error('unknown command; use list, or call <tool> <json>')
  return 2
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => server.kill())
