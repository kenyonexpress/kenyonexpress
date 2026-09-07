#!/usr/bin/env node
/**
 * Sentry alert rules, as code.
 *
 * The Sentry UI holds exactly one hand-made issue alert ("Send a notification
 * for high priority issues", 2026-08-21). Everything else alerting-wise lives
 * here and is applied by upsert, keyed on the rule NAME: run twice and the
 * second run updates in place rather than duplicating. Editing a rule in the
 * UI therefore survives only until the next CI run on main -- which is the
 * point. The UI is where rules go to drift.
 *
 * WHAT IS DEFINED. Two metric alerts on the error stream:
 *
 *   - "Error rate spike": total error events across the project. The
 *     thresholds are calibrated to a store this size, where the normal hourly
 *     error count is near zero: 20/hour means something broke for real
 *     customers, 50/hour means it is still breaking.
 *   - "RLS denial spike": events tagged area:rls, which only
 *     src/lib/supabase/rls-report-fetch.ts emits. Lower thresholds on
 *     purpose: a handful of denials is a policy regression or someone
 *     probing, and both are worth an email at 5, not at 50.
 *
 * WHY EMAIL TO THE FIRST TEAM. Metric alert triggers require an action, the
 * org has one team, and email is the only channel configured anywhere in this
 * project (ntfy is for money alarms and stays that way -- see
 * lib/observability/alert.ts for why that channel must stay quiet).
 *
 * CREDENTIALS. Same posture as the source-map upload in ci.yml: without
 * SENTRY_AUTH_TOKEN this prints one line and exits 0, so a laptop and a
 * fork's CI stay green and the rules are applied only where the secret
 * exists. `--dry` prints the payloads and touches nothing. `--ci` is
 * accepted for symmetry with sentry-verify.mjs and changes nothing yet.
 *
 * THE REGION MATTERS, again: the org lives at de.sentry.io, and against
 * sentry.io these endpoints 404 rather than redirect.
 */

import { readFileSync } from 'node:fs'

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry')

/** `.env.local` is not loaded for a plain node script the way Next loads it. */
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
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).trim()
  }
  return out
}

const env = { ...loadEnvLocal(), ...process.env }
const ORG = env.SENTRY_ORG
const PROJECT = env.SENTRY_PROJECT
const TOKEN = env.SENTRY_AUTH_TOKEN
const BASE = env.SENTRY_URL ?? 'https://de.sentry.io'

/** name-keyed; everything else about a rule may be edited freely here. */
function rules(teamId) {
  const email = [{ type: 'email', targetType: 'team', targetIdentifier: String(teamId) }]
  const common = {
    dataset: 'events',
    eventTypes: ['error'],
    aggregate: 'count()',
    timeWindow: 60,
    thresholdType: 0,
    resolveThreshold: null,
    environment: null,
    projects: [PROJECT],
    queryType: 0,
  }
  return [
    {
      ...common,
      name: 'Error rate spike',
      query: '',
      triggers: [
        { label: 'critical', alertThreshold: 50, actions: email },
        { label: 'warning', alertThreshold: 20, actions: email },
      ],
    },
    {
      ...common,
      name: 'RLS denial spike',
      query: 'area:rls',
      triggers: [
        { label: 'critical', alertThreshold: 15, actions: email },
        { label: 'warning', alertThreshold: 5, actions: email },
      ],
    },
  ]
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE}/api/0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status}: ${body.slice(0, 500)}`)
  }
  return res.status === 204 ? null : res.json()
}

async function main() {
  if (DRY) {
    console.log(JSON.stringify(rules('<team-id>'), null, 2))
    return
  }
  if (!TOKEN || !ORG || !PROJECT) {
    console.log('sentry-alert-rules: no SENTRY_AUTH_TOKEN/ORG/PROJECT, skipping (expected off CI)')
    return
  }

  const teams = await api(`/organizations/${ORG}/teams/`)
  const teamId = teams[0]?.id
  if (!teamId) throw new Error('no team in the organization to email')

  const existing = await api(`/organizations/${ORG}/alert-rules/`)
  for (const rule of rules(teamId)) {
    const found = existing.find((r) => r.name === rule.name)
    if (found) {
      await api(`/organizations/${ORG}/alert-rules/${found.id}/`, {
        method: 'PUT',
        body: JSON.stringify(rule),
      })
      console.log(`updated: ${rule.name} (id ${found.id})`)
    } else {
      const created = await api(`/organizations/${ORG}/alert-rules/`, {
        method: 'POST',
        body: JSON.stringify(rule),
      })
      console.log(`created: ${rule.name} (id ${created.id})`)
    }
  }
}

main().catch((err) => {
  console.error(`sentry-alert-rules: ${err.message}`)
  process.exit(1)
})
