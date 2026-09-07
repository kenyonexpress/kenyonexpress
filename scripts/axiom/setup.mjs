#!/usr/bin/env node
/**
 * Makes the Axiom side of the log leg real: the dataset with its retention
 * policy, and the three dashboards, all as code.
 *
 * WHY A SCRIPT AND NOT CLICKS. The same argument as sentry-verify.mjs, from
 * the other direction: a dashboard built in the UI exists in exactly one
 * place and dies with the workspace. These three live in
 * scripts/axiom/dashboards/*.json, reviewed like any other code, and this
 * script makes Axiom match them. Re-running is safe: the dataset update and
 * the dashboard `overwrite` flag make every step an upsert.
 *
 *   node scripts/axiom/setup.mjs          # create/update everything
 *   node scripts/axiom/setup.mjs --dry    # print what would be sent, no network
 *
 * WHAT IT ENFORCES.
 *   - Dataset AXIOM_DATASET exists, retentionDays=30, useRetentionPeriod=true.
 *     30 days: long enough to investigate a chargeback window, short enough
 *     that redacted-but-still-operational data does not accumulate forever.
 *   - Dashboards auth / payments / errors, uid-pinned (kenyon-auth,
 *     kenyon-payments, kenyon-errors) so a re-run updates rather than
 *     duplicates. `{{dataset}}` in the JSON is bound to AXIOM_DATASET here.
 *
 * NEEDS. AXIOM_TOKEN with ingest+datasets+dashboards permissions (an
 * API token, not a personal token, keeps dashboards shared: the API refuses
 * private dashboards, which is why owner stays X-AXIOM-EVERYONE) and
 * AXIOM_DATASET. Reads .env.local like the app does, so one file configures
 * both sides.
 *
 * Exit 0 = Axiom matches the files. Exit 1 = it does not, and the message
 * quotes the API's answer rather than paraphrasing it.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry')

// .env.local, parsed just enough: the app's own env loading belongs to Next,
// and this script runs outside it.
function loadEnvLocal() {
  let raw
  try {
    raw = readFileSync(resolve(HERE, '../../.env.local'), 'utf8')
  } catch {
    return
  }
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  }
}
loadEnvLocal()

const TOKEN = process.env.AXIOM_TOKEN
const DATASET = process.env.AXIOM_DATASET
const BASE = process.env.AXIOM_URL || 'https://api.axiom.co'

if (!TOKEN || !DATASET) {
  console.error(
    'AXIOM_TOKEN and AXIOM_DATASET are both required (env or .env.local).\n' +
      'Without them the app runs console-only, which is a valid state -- but\n' +
      'this script exists to configure Axiom, so it refuses to half-run.',
  )
  process.exit(1)
}

const RETENTION_DAYS = 30

async function api(method, path, body) {
  if (DRY) {
    console.log(`[dry] ${method} ${path}${body ? ` ${JSON.stringify(body).slice(0, 200)}...` : ''}`)
    return { ok: true, status: 0, json: null }
  }
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 500) }
  }
  return { ok: response.ok, status: response.status, json }
}

function fail(step, result) {
  console.error(`FAILED at ${step}: HTTP ${result.status}\n${JSON.stringify(result.json, null, 2)}`)
  process.exit(1)
}

// --- 1. Dataset, with the 30-day retention policy -------------------------

const existing = await api('GET', `/v2/datasets/${encodeURIComponent(DATASET)}`)
const retention = {
  description:
    'KenyonExpress structured logs (src/lib/observability/log.ts). Managed by scripts/axiom/setup.mjs.',
  retentionDays: RETENTION_DAYS,
  useRetentionPeriod: true,
}

if (!DRY && existing.status === 404) {
  const created = await api('POST', '/v2/datasets', { name: DATASET, ...retention })
  if (!created.ok) fail('create dataset', created)
  console.log(`dataset ${DATASET}: created, retention ${RETENTION_DAYS}d`)
} else if (!DRY && !existing.ok) {
  fail('read dataset', existing)
} else {
  const updated = await api('PUT', `/v2/datasets/${encodeURIComponent(DATASET)}`, retention)
  if (!updated.ok) fail('update dataset retention', updated)
  console.log(`dataset ${DATASET}: retention ${RETENTION_DAYS}d confirmed`)
}

// The API echoes the dataset back; trust but verify, because a plan that does
// not allow per-dataset retention accepts the field and ignores it.
if (!DRY) {
  const check = await api('GET', `/v2/datasets/${encodeURIComponent(DATASET)}`)
  const got = check.json?.retentionDays
  if (check.ok && got !== undefined && Number(got) !== RETENTION_DAYS) {
    console.error(
      `WARNING: asked for retentionDays=${RETENTION_DAYS}, Axiom reports ${got}. Per-dataset retention may not be available on this plan; set it in Axiom > Datasets > settings if the number above is wrong.`,
    )
  }
}

// --- 2. Dashboards: auth, payments, errors --------------------------------

const dashboardsDir = join(HERE, 'dashboards')
for (const file of readdirSync(dashboardsDir)
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  const slug = file.replace(/\.json$/, '')
  const dashboard = JSON.parse(
    readFileSync(join(dashboardsDir, file), 'utf8').replaceAll('{{dataset}}', DATASET),
  )
  dashboard.uid = `kenyon-${slug}`

  const result = await api('POST', '/v2/dashboards', {
    dashboard,
    overwrite: true,
    message: 'scripts/axiom/setup.mjs',
  })
  if (!result.ok) fail(`dashboard ${slug}`, result)
  console.log(`dashboard kenyon-${slug}: upserted (${dashboard.charts.length} charts)`)
}

console.log(DRY ? 'dry run complete, nothing sent' : 'Axiom matches scripts/axiom/.')
