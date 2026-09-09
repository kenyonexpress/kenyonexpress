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

const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  cannotMeasure(
    'SUPABASE_ACCESS_TOKEN is not set. Create one at https://supabase.com/dashboard/account/tokens ' +
      'and re-run. Without it this check has no opinion, which is the honest answer.',
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
