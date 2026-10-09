#!/usr/bin/env node
/**
 * Creates or updates the UptimeRobot monitor and its webhook alert contact.
 *
 *   node scripts/uptimerobot/setup.mjs --dry   # print the plan, call nothing
 *   node scripts/uptimerobot/setup.mjs         # apply it
 *
 * Reads UPTIMEROBOT_API_KEY (the account's MAIN key; read-only keys cannot
 * create anything), UPTIMEROBOT_WEBHOOK_SECRET (the same value the deployment
 * holds, or the relay answers 401 to every alert), and the public origin from
 * UPTIMEROBOT_BASE_URL or NEXT_PUBLIC_SITE_URL. `.env.local` is loaded the
 * way sentry-verify.mjs loads it, because a plain node script gets nothing
 * from Next.
 *
 * Idempotent: matching is by friendly name, and a second run on a configured
 * account reports `keep` for both and changes nothing. The decisions live in
 * plan.mjs, where they are unit tested.
 *
 * Exit 0 = the account matches the plan. Exit 1 = misconfigured or the API
 * refused, and the message says which.
 */

import { readFileSync } from 'node:fs'
import { contactSpec, desiredContact, desiredMonitor, planChanges } from './plan.mjs'

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry')
const API = 'https://api.uptimerobot.com/v2'

function loadEnvLocal() {
  let raw
  try {
    raw = readFileSync('.env.local', 'utf8')
  } catch {
    return {}
  }
  const out = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    out[trimmed.slice(0, eq)] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...loadEnvLocal(), ...process.env }

function fail(message) {
  console.error(`uptimerobot: ${message}`)
  process.exit(1)
}

const baseUrl = env.UPTIMEROBOT_BASE_URL || env.NEXT_PUBLIC_SITE_URL
if (!baseUrl) fail('set UPTIMEROBOT_BASE_URL or NEXT_PUBLIC_SITE_URL to the public origin')
const secret = env.UPTIMEROBOT_WEBHOOK_SECRET
if (!secret) fail('UPTIMEROBOT_WEBHOOK_SECRET is unset; the relay would answer 401 to every alert')

let monitor
let contact
try {
  monitor = desiredMonitor({ baseUrl, intervalSeconds: env.UPTIMEROBOT_INTERVAL_SECONDS })
  contact = desiredContact({ baseUrl, secret })
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

/** The secret is the only sensitive value in the plan; it never reaches stdout. */
function redacted(value) {
  return String(value).replace(secret, '[redacted]')
}

async function call(method, params) {
  const body = new URLSearchParams({ api_key: env.UPTIMEROBOT_API_KEY, format: 'json', ...params })
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'cache-control': 'no-cache' },
    body,
    signal: AbortSignal.timeout(15000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.stat !== 'ok') {
    const reason = json.error?.message ?? json.error?.type ?? `HTTP ${res.status}`
    throw new Error(`${method} refused: ${reason}`)
  }
  return json
}

async function main() {
  console.log(`monitor:  ${monitor.friendly_name} -> ${monitor.url} every ${monitor.interval}s`)
  console.log(`contact:  ${contact.friendly_name} -> ${redacted(contact.value)}`)

  if (DRY) {
    console.log('dry run: nothing called')
    return
  }
  if (!env.UPTIMEROBOT_API_KEY)
    fail('UPTIMEROBOT_API_KEY is unset (the main key, not a read-only one)')
  if (/localhost|127\.0\.0\.1/.test(baseUrl))
    fail('refusing to point UptimeRobot at a local origin')

  const [monitorsRes, contactsRes] = await Promise.all([
    call('getMonitors', { search: monitor.friendly_name }),
    call('getAlertContacts', {}),
  ])
  const plan = planChanges({
    monitors: monitorsRes.monitors ?? [],
    contacts: contactsRes.alert_contacts ?? [],
    monitor,
    contact,
  })

  let contactId = plan.contact.id
  if (plan.contact.action === 'create') {
    const created = await call('newAlertContact', contact)
    contactId = created.alertcontact.id
    console.log(`contact:  created #${contactId}`)
  } else if (plan.contact.action === 'update') {
    await call('editAlertContact', { id: contactId, ...plan.contact.changes })
    console.log(`contact:  updated #${contactId} (${Object.keys(plan.contact.changes).join(', ')})`)
  } else {
    console.log(`contact:  keep #${contactId}`)
  }

  const alert_contacts = contactSpec(contactId)
  if (plan.monitor.action === 'create') {
    const created = await call('newMonitor', { ...monitor, alert_contacts })
    console.log(`monitor:  created #${created.monitor.id}`)
  } else if (plan.monitor.action === 'update') {
    await call('editMonitor', { id: plan.monitor.id, ...plan.monitor.changes, alert_contacts })
    console.log(
      `monitor:  updated #${plan.monitor.id} (${Object.keys(plan.monitor.changes).join(', ')})`,
    )
  } else {
    // Re-assert the contact binding even on keep: getMonitors does not return
    // it without an extra flag, and a monitor with no contact pages nobody.
    await call('editMonitor', { id: plan.monitor.id, alert_contacts })
    console.log(`monitor:  keep #${plan.monitor.id}, contact binding re-asserted`)
  }
}

main().catch((error) => fail(redacted(error instanceof Error ? error.message : String(error))))
