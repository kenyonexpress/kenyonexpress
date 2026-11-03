#!/usr/bin/env node

/**
 * Runs a catalogue audit (`--sql` / `--from` shape) against production through
 * `supabase db query --linked`, for the M-cycle, which has no SUPABASE_DB_URL.
 *
 *   node scripts/m-cycle-linked-audit.mjs audit-money-constraints.mjs
 *
 * The token comes from SUPABASE_ACCESS_TOKEN, else the `export` line in
 * ~/.zshrc (the DB ACCESS rule). Exit codes are the audit's own; 2 when the
 * database could not be read, so a failed query never reads as "no gaps".
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const audit = process.argv[2]
if (!audit || !/^audit-[a-z-]+\.mjs$/.test(audit)) {
  console.error('usage: m-cycle-linked-audit.mjs audit-<name>.mjs')
  process.exit(2)
}
const auditPath = path.join(projectRoot, 'scripts', audit)

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  try {
    const line = readFileSync(path.join(homedir(), '.zshrc'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('export SUPABASE_ACCESS_TOKEN='))
    return line?.split('=').slice(1).join('=').replaceAll('"', '') || null
  } catch {
    return null
  }
}

const token = accessToken()
if (!token) {
  console.error('m-cycle-linked-audit: no SUPABASE_ACCESS_TOKEN')
  process.exit(2)
}

const dir = mkdtempSync(path.join(tmpdir(), 'm-cycle-audit-'))
const sqlFile = path.join(dir, 'q.sql')
const jsonFile = path.join(dir, 'rows.json')
writeFileSync(sqlFile, execFileSync('node', [auditPath, '--sql'], { encoding: 'utf8' }))

let raw
try {
  raw = execFileSync('supabase', ['db', 'query', '--linked', '-f', sqlFile], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
  })
} catch (error) {
  console.error(`m-cycle-linked-audit: query failed: ${error.message}`)
  process.exit(2)
}

// The CLI may print a status line ahead of the JSON body.
const start = raw.indexOf('{')
if (start === -1) {
  console.error('m-cycle-linked-audit: no JSON in CLI output')
  process.exit(2)
}
writeFileSync(jsonFile, raw.slice(start))

try {
  process.stdout.write(
    execFileSync('node', [auditPath, '--from', jsonFile], { encoding: 'utf8', stdio: 'pipe' }),
  )
} catch (error) {
  process.stdout.write(error.stdout ?? '')
  process.stderr.write(error.stderr ?? '')
  process.exit(error.status ?? 1)
}
