#!/usr/bin/env node
/**
 * Makes the Axiom side of the log leg real: the dataset with its retention
 * policy, the four dashboards and the seven alert rules, all as code.
 *
 * WHY A SCRIPT AND NOT CLICKS. The same argument as sentry-verify.mjs, from
 * the other direction: a dashboard built in the UI exists in exactly one
 * place and dies with the workspace. They live in
 * scripts/axiom/dashboards/*.json and scripts/axiom/monitors.json, reviewed
 * like any other code, and this script makes Axiom match them. Re-running is
 * safe: the dataset update, the dashboard `overwrite` flag and the name-keyed
 * monitor lookup make every step an upsert.
 *
 *   node scripts/axiom/setup.mjs          # create/update everything
 *   node scripts/axiom/setup.mjs --dry    # print what would be sent, no network
 *
 * WHAT IT ENFORCES.
 *   - Dataset AXIOM_DATASET exists, retentionDays=30, useRetentionPeriod=true.
 *     30 days: long enough to investigate a chargeback window, short enough
 *     that redacted-but-still-operational data does not accumulate forever.
 *   - Dashboards auth / payments / errors / routes, uid-pinned (kenyon-auth,
 *     kenyon-payments, kenyon-errors, kenyon-routes) so a re-run updates rather
 *     than duplicates. `{{dataset}}` in the JSON is bound to AXIOM_DATASET here.
 *   - Alert rules from scripts/axiom/monitors.json, keyed on name so a re-run
 *     updates in place, each pointing at one notifier. The notifier is Slack
 *     when SLACK_WEBHOOK_URL is set and email otherwise, which is the same
 *     posture src/lib/observability/alert.ts takes: one channel that always
 *     works, one that appears when the operator provides a destination.
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

// --- 2. Dashboards: auth, errors, payments, routes ------------------------

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

// --- 3. The notifier every alert rule points at -----------------------------
//
// A monitor with no notifier is a rule that evaluates and tells nobody, which
// is the failure this whole section is about. Slack when a webhook URL exists,
// email otherwise: the operator's own address is the channel that cannot be
// unconfigured, and SECTIONS 34 recorded that there was no Slack workspace to
// send to. This does not decide that question, it follows whatever the
// environment says today.

const slackUrl = process.env.SLACK_WEBHOOK_URL
const alertEmail = process.env.ALERT_EMAIL
const notifierName = 'KenyonExpress alerts'
const notifierProperties = slackUrl
  ? { slack: { slackUrl } }
  : alertEmail
    ? { email: { emails: [alertEmail] } }
    : null

// No destination in the environment, so none is invented. The alternative was
// a default address written into the file, and an address in a repository is
// one that outlives the person, gets copied into the next project and cannot
// be changed without a commit. The rules are still created -- they are the
// reviewed artefact, and thresholds are worth having in version control before
// they are worth firing -- but they are created DISABLED and say so, because a
// rule that evaluates and tells nobody is the exact failure this section
// exists to remove, and an enabled-but-silent rule looks like coverage.
let notifierId = null
if (!notifierProperties) {
  console.log(
    'notifier: neither SLACK_WEBHOOK_URL nor ALERT_EMAIL is set, so no notifier\n' +
      '          was created and the alert rules below are upserted DISABLED.\n' +
      '          Set either variable and re-run to arm them.',
  )
} else if (!DRY) {
  const list = await api('GET', '/v2/notifiers')
  if (!list.ok) fail('list notifiers', list)
  const found = (list.json ?? []).find((n) => n.name === notifierName)

  if (found) {
    const updated = await api('PUT', `/v2/notifiers/${found.id}`, {
      name: notifierName,
      properties: notifierProperties,
    })
    if (!updated.ok) fail('update notifier', updated)
    notifierId = found.id
    console.log(`notifier ${notifierName}: updated (${slackUrl ? 'slack' : 'email'})`)
  } else {
    const created = await api('POST', '/v2/notifiers', {
      name: notifierName,
      properties: notifierProperties,
    })
    if (!created.ok) fail('create notifier', created)
    notifierId = created.json?.id ?? null
    console.log(`notifier ${notifierName}: created (${slackUrl ? 'slack' : 'email'})`)
  }
} else {
  console.log(`[dry] notifier ${notifierName} would be ${slackUrl ? 'slack' : 'email'}`)
}

// --- 4. Alert rules, keyed on name -----------------------------------------

const { monitors } = JSON.parse(readFileSync(join(HERE, 'monitors.json'), 'utf8'))

const existingMonitors = DRY ? [] : await api('GET', '/v2/monitors')
if (!DRY && !existingMonitors.ok) fail('list monitors', existingMonitors)
const byName = new Map(((DRY ? [] : existingMonitors.json) ?? []).map((m) => [m.name, m]))

for (const monitor of monitors) {
  const body = {
    name: monitor.name,
    description: monitor.description,
    type: monitor.type,
    // The dataset is bound here for the same reason it is in the dashboards:
    // the files describe a shape, the environment names the workspace.
    aplQuery: monitor.aplQuery.replaceAll('{{dataset}}', DATASET),
    operator: monitor.operator,
    threshold: monitor.threshold,
    intervalMinutes: monitor.intervalMinutes,
    range: `${monitor.rangeMinutes}m`,
    notifierIds: notifierId ? [notifierId] : [],
    // Armed only when there is somewhere for it to shout. See the notifier
    // block above for why this is not defaulted to true.
    disabled: !notifierId,
  }

  if (DRY) {
    console.log(
      `[dry] monitor ${monitor.slug}: ${monitor.operator} ${monitor.threshold}, every ${monitor.intervalMinutes}m over ${monitor.rangeMinutes}m${notifierProperties ? '' : ' (DISABLED: no notifier)'}`,
    )
    continue
  }

  const found = byName.get(monitor.name)
  const result = found
    ? await api('PUT', `/v2/monitors/${found.id}`, body)
    : await api('POST', '/v2/monitors', body)
  if (!result.ok) fail(`monitor ${monitor.slug}`, result)
  console.log(`monitor ${monitor.slug}: ${found ? 'updated' : 'created'}`)
}

console.log(DRY ? 'dry run complete, nothing sent' : 'Axiom matches scripts/axiom/.')
