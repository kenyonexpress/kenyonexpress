#!/usr/bin/env node
/**
 * Applies scripts/posthog/insights.mjs to a PostHog project by upsert.
 *
 *   pnpm posthog:provision          apply (needs the three variables below)
 *   pnpm posthog:provision:dry      print the payloads and the plan, touch nothing
 *
 * CREDENTIALS. Same posture as scripts/sentry-alert-rules.mjs: without
 * POSTHOG_PERSONAL_API_KEY this prints one line and exits 0, so a laptop and
 * a fork's CI stay green and the definitions are applied only where the
 * secret exists. The key is a PERSONAL api key (phx_...), never the project
 * key the browser uses (phc_...): the project key can only capture.
 *
 *   POSTHOG_PERSONAL_API_KEY   phx_..., scopes insight:write cohort:write
 *   POSTHOG_PROJECT_ID         numeric project id from the project settings URL
 *   POSTHOG_API_HOST           optional; https://us.posthog.com (default) or
 *                              https://eu.posthog.com. NOT the ingestion host
 *                              (us.i.posthog.com), which 404s on /api/projects.
 *
 * Idempotent by name: an insight or cohort whose name matches is PATCHed,
 * anything else is POSTed. Deleting a definition here does not delete it in
 * PostHog; it leaves it as an unmanaged object with the managed tag on it.
 */

import { readFileSync } from 'node:fs'
import {
  buildCohorts,
  buildFunnelInsight,
  buildRetentionInsights,
  planUpserts,
} from './insights.mjs'

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
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    // Strip one pair of matching quotes; a quoted key kept verbatim is the
    // documented way to get "401 Invalid API key" from every service here.
    out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

const env = { ...loadEnvLocal(), ...process.env }
const token = env.POSTHOG_PERSONAL_API_KEY
const projectId = env.POSTHOG_PROJECT_ID
const host = (env.POSTHOG_API_HOST ?? 'https://us.posthog.com').replace(/\/+$/, '')

const desired = {
  insights: [buildFunnelInsight(), ...buildRetentionInsights()],
  cohorts: buildCohorts(),
}

if (DRY) {
  console.log(JSON.stringify(desired, null, 2))
}

if (!token || !projectId) {
  console.log(
    DRY
      ? 'posthog:provision --dry: no POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID, nothing to plan against.'
      : 'posthog:provision: POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID unset, skipping.',
  )
  process.exit(0)
}

async function api(method, path, body) {
  const response = await fetch(`${host}/api/projects/${projectId}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 300)}`)
  }
  return text ? JSON.parse(text) : null
}

async function listAll(path) {
  const results = []
  let next = `${path}?limit=100`
  while (next) {
    const page = await api('GET', next)
    results.push(...(page?.results ?? []))
    // `next` is absolute; keep only the part after the project prefix.
    const marker = `/api/projects/${projectId}/`
    next = page?.next ? page.next.slice(page.next.indexOf(marker) + marker.length) : null
  }
  return results
}

async function upsert(kind, path, payloads) {
  const existing = (await listAll(path)).map((item) => ({ id: item.id, name: item.name }))
  const plan = planUpserts(existing, payloads)
  console.log(
    `${kind}: ${plan.create.length} to create, ${plan.update.length} to update${DRY ? ' (dry run)' : ''}`,
  )
  if (DRY) return
  for (const payload of plan.create) {
    const created = await api('POST', path, payload)
    console.log(`  created ${kind} "${payload.name}" (${created?.id ?? '?'})`)
  }
  for (const { id, payload } of plan.update) {
    await api('PATCH', `${path}${id}/`, payload)
    console.log(`  updated ${kind} "${payload.name}" (${id})`)
  }
}

try {
  // Cohorts first: nothing references them yet, but when a funnel breakdown
  // does, the cohort must exist before the insight that names it.
  await upsert('cohort', 'cohorts/', desired.cohorts)
  await upsert('insight', 'insights/', desired.insights)
  console.log('posthog:provision: done')
} catch (error) {
  console.error('posthog:provision failed:', error instanceof Error ? error.message : error)
  process.exit(1)
}
