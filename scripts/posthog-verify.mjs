#!/usr/bin/env node
/**
 * Proves the PostHog project key accepts a checkout step, by sending one real
 * `checkout_step` in the exact shape `src/lib/observability/posthog.ts` posts,
 * and printing the HTTP answer.
 *
 * WHY A SCRIPT. `trackEvent` is fire-and-forget by design: it voids the fetch
 * and swallows every failure, so a wrong key or a wrong region host produces
 * no error anywhere. Same reasoning as scripts/sentry-verify.mjs.
 *
 *   node scripts/posthog-verify.mjs          # send one event, print status
 *   node scripts/posthog-verify.mjs --dry    # config check only, no network
 *
 * The event carries `$environment: sandbox` and a `ke_verify` marker, so it can
 * be filtered out of every funnel. Reads NEXT_PUBLIC_POSTHOG_KEY and
 * NEXT_PUBLIC_POSTHOG_HOST from the environment, then `.env.local`.
 *
 * Exit 0 = PostHog answered 200 with status 1 or "Ok". Exit 1 = it did not.
 */

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const DRY = process.argv.includes('--dry')

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
    out[trimmed.slice(0, eq).replace(/^export\s+/, '')] = trimmed
      .slice(eq + 1)
      .replace(/^["']|["']$/g, '')
  }
  return out
}

const fileEnv = loadEnvLocal()
const env = (key) => process.env[key] || fileEnv[key] || ''

const key = env('NEXT_PUBLIC_POSTHOG_KEY')
const host = (env('NEXT_PUBLIC_POSTHOG_HOST') || 'https://us.i.posthog.com').replace(/\/+$/, '')

if (!key.startsWith('phc_')) {
  console.error(
    'posthog-verify: FAILED\n  NEXT_PUBLIC_POSTHOG_KEY is unset or not a phc_ project key.',
  )
  process.exit(1)
}

const marker = `posthog-verify-${Date.now().toString(36)}`
console.log('posthog-verify: config OK')
console.log(`  host          ${host}`)
console.log(`  key prefix    ${key.slice(0, 8)}`)

if (DRY) {
  console.log('\n--dry: no event sent.')
  process.exit(0)
}

const body = JSON.stringify({
  api_key: key,
  event: 'checkout_step',
  distinct_id: `ke-verify-${randomUUID()}`,
  properties: {
    step: 'identity',
    step_index: 1,
    $environment: 'sandbox',
    ke_verify: marker,
    $lib: 'kenyonexpress-fetch',
  },
  timestamp: new Date().toISOString(),
})

const response = await fetch(`${host}/capture/`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body,
  signal: AbortSignal.timeout(10_000),
})
const text = await response.text()
console.log(`\n  HTTP          ${response.status}`)
console.log(`  body          ${text}`)
console.log(`  marker        ${marker}`)

let accepted = false
try {
  const status = JSON.parse(text).status
  // The legacy endpoint answered 1; the current one answers "Ok".
  accepted = response.ok && (status === 1 || status === 'Ok')
} catch {
  accepted = false
}
console.log(accepted ? '\nposthog-verify: event accepted' : '\nposthog-verify: FAILED')
process.exit(accepted ? 0 : 1)
