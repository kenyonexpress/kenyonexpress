#!/usr/bin/env node
/**
 * Answers "is PITR actually bought on this project?" in one command.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/dr/pitr-status.mjs
 *
 * The token is a personal access token from https://supabase.com/dashboard/account/tokens
 * (NOT the service key, NOT the anon key: this is the account-level API, and
 * the project keys have no access to it). Nothing here writes; the token needs
 * no more than read.
 *
 * Exit codes: 0 PITR applied, 3 measured absent, 2 could not measure.
 * See pitr-lib.mjs for why "could not measure" is a separate answer.
 */

import { execFileSync } from 'node:child_process'
import { EXIT, exitCodeFor, pitrVerdict } from './pitr-lib.mjs'

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'ixvwfbuvfxxsjiywhbbb'
const API = 'https://api.supabase.com'

const note = (msg) => console.log(`.. ${msg}`)
const ok = (msg) => console.log(`ok ${msg}`)

/** Refuse loudly instead of reporting a guess as a measurement. */
function cannotMeasure(msg) {
  console.error(`?? ${msg}`)
  process.exit(EXIT.CANNOT_MEASURE)
}

/**
 * The token, from the environment or, on a Mac where `supabase login` has been
 * run, from the CLI's own keychain entry (stored as `go-keyring-base64:` +
 * base64 of the sbp_ token). Measured 2026-09-22: the second path is the only
 * one this project's laptop has, and a check that cannot run on the one
 * machine that runs checks is a check nobody runs.
 */
function keychainToken() {
  if (process.platform !== 'darwin') return null
  try {
    const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
      encoding: 'utf8',
    }).trim()
    const b64 = raw.startsWith('go-keyring-base64:') ? raw.slice('go-keyring-base64:'.length) : raw
    const decoded = Buffer.from(b64, 'base64').toString('utf8')
    return decoded.startsWith('sbp_') ? decoded : null
  } catch {
    return null
  }
}
const token = process.env.SUPABASE_ACCESS_TOKEN || keychainToken()
if (!token) {
  cannotMeasure(
    'SUPABASE_ACCESS_TOKEN is not set and no Supabase CLI login is in the keychain. Create one at ' +
      'https://supabase.com/dashboard/account/tokens and re-run. Without it this check has no opinion, ' +
      'which is the honest answer.',
  )
}

note(`GET ${API}/v1/projects/${PROJECT_REF}/billing/addons`)
let res
try {
  res = await fetch(`${API}/v1/projects/${PROJECT_REF}/billing/addons`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
} catch (err) {
  cannotMeasure(`request failed: ${err.message}`)
}

const body = await res.text()
if (res.status === 401 || res.status === 403) {
  cannotMeasure(`the API rejected the token (${res.status}). ${body.slice(0, 300)}`)
}
if (!res.ok) {
  cannotMeasure(`unexpected ${res.status} from the Management API. ${body.slice(0, 300)}`)
}

let payload
try {
  payload = JSON.parse(body)
} catch {
  cannotMeasure(`response was not JSON (${body.slice(0, 200)})`)
}

// Second reading, same token: what the platform actually holds. The add-on
// list says what was bought; this says what exists to restore from.
try {
  const backupsRes = await fetch(`${API}/v1/projects/${PROJECT_REF}/database/backups`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (backupsRes.ok) {
    const b = await backupsRes.json()
    const list = Array.isArray(b.backups) ? b.backups : []
    const times = list
      .map((x) => x.inserted_at)
      .filter(Boolean)
      .sort()
    const window = times.length
      ? ` window=${times[0].slice(0, 10)}..${times[times.length - 1].slice(0, 10)}`
      : ''
    note(
      `backups: pitr_enabled=${b.pitr_enabled} walg_enabled=${b.walg_enabled} physical=${list.length}${window}`,
    )
  } else {
    note(`backups endpoint answered ${backupsRes.status}; the add-on verdict below stands alone`)
  }
} catch (err) {
  note(`backups endpoint unreachable: ${err.message}`)
}

const verdict = pitrVerdict(payload)
const selected = Array.isArray(payload.selected_addons) ? payload.selected_addons : []
note(
  `selected add-ons: ${
    selected.length
      ? selected
          .map((a) => (typeof a?.variant === 'string' ? a.variant : (a?.variant?.id ?? '?')))
          .join(', ')
      : '(none)'
  }`,
)

if (verdict.enabled === true) {
  ok(`PITR is applied: ${verdict.reason}. RPO ${verdict.rpo}.`)
} else if (verdict.enabled === false) {
  console.error(`no PITR: ${verdict.reason}. RPO ${verdict.rpo}.`)
} else {
  console.error(`inconclusive: ${verdict.reason}`)
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs')
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## PITR\n- project: \`${PROJECT_REF}\`\n- enabled: ${verdict.enabled}\n- retention: ${verdict.retentionDays ?? 'n/a'} days\n- RPO: ${verdict.rpo}\n`,
  )
}

process.exit(exitCodeFor(verdict))
