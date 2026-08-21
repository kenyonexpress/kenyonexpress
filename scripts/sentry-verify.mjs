#!/usr/bin/env node
/**
 * Proves that this project's Sentry wiring actually delivers, by sending a real
 * event and printing the id to look up.
 *
 * WHY A SCRIPT AND NOT A TEST. Every Sentry failure mode in this repo is silent
 * by design, and each silence is deliberate somewhere else:
 *
 *   - `src/lib/observability/sentry.ts` returns early without a DSN, so the
 *     whole SDK is inert and nothing is queued.
 *   - `withSentryConfig` skips the source-map upload when SENTRY_AUTH_TOKEN is
 *     unset, so a fork's CI stays green.
 *   - `beforeSend` in all three configs can drop or empty an event.
 *
 * Any of those is correct on a laptop and wrong on a deploy, and none of them
 * fails a build, a type-check or a unit test. A unit test cannot tell them
 * apart either: it would have to mock the transport, and a mocked transport is
 * exactly the thing that is not being questioned. So this makes the network
 * call for real.
 *
 *   node scripts/sentry-verify.mjs              # send one event, print its id
 *   node scripts/sentry-verify.mjs --ci         # also FAIL if the upload
 *                                               # credential is missing
 *   node scripts/sentry-verify.mjs --dry        # config check only, no network
 *
 * THE REGION MATTERS. This org lives in the EU: the DSN host must be
 * `ingest.de.sentry.io`. A US-region DSN is accepted by `Sentry.init` without
 * complaint and the events land in a project nobody is looking at, so the host
 * is asserted here rather than trusted.
 *
 * Exit 0 = the event was accepted by ingest. Exit 1 = misconfigured, and the
 * message says which of the silences above you are standing in.
 */

import { readFileSync } from 'node:fs'
import * as Sentry from '@sentry/node'

const args = new Set(process.argv.slice(2))
const CI = args.has('--ci')
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
    // Comment lines in this file contain prose with '=' in it more than once.
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).trim()
  }
  return out
}

const fileEnv = loadEnvLocal()
/** A real environment variable wins; the file is the fallback. */
const env = (key) => process.env[key] || fileEnv[key] || ''

const problems = []

const dsn = env('SENTRY_DSN')
const publicDsn = env('NEXT_PUBLIC_SENTRY_DSN')

if (!dsn) {
  problems.push(
    'SENTRY_DSN is unset. This is the inert state: sentry.server.config.ts skips\n' +
      '    init entirely and capturePaymentError() returns before doing anything.',
  )
} else if (!dsn.includes('ingest.de.sentry.io')) {
  problems.push(
    [
      `SENTRY_DSN is not on the EU ingest host: ${dsn.replace(/\/\/[^@]*@/, '//[key]@')}`,
      '    This org is EU-region. A US DSN initialises cleanly and delivers nowhere',
      '    that anyone is watching.',
    ].join('\n'),
  )
}

if (!publicDsn) {
  problems.push(
    'NEXT_PUBLIC_SENTRY_DSN is unset, so the BROWSER reports nothing. The server\n' +
      '    DSN cannot stand in for it: it is not inlined into the client bundle.',
  )
}

if (CI && !env('SENTRY_AUTH_TOKEN')) {
  problems.push(
    'SENTRY_AUTH_TOKEN is unset, so withSentryConfig skips the source-map upload\n' +
      '    WITHOUT failing the build. Production JS is minified, so every stack\n' +
      '    trace becomes a column offset into a one-line chunk. Set it in Vercel.',
  )
}

if (CI && !env('SENTRY_ORG')) problems.push('SENTRY_ORG is unset; the upload has no target.')
if (CI && !env('SENTRY_PROJECT'))
  problems.push('SENTRY_PROJECT is unset; the upload has no target.')

if (problems.length > 0) {
  console.error('\nsentry-verify: FAILED\n')
  for (const p of problems) console.error(`  - ${p}\n`)
  process.exit(1)
}

console.log('sentry-verify: config OK')
console.log(`  ingest host   ${new URL(dsn).host}`)
console.log(`  project id    ${new URL(dsn).pathname.slice(1)}`)
console.log(`  environment   ${env('SENTRY_ENVIRONMENT') || 'development'}`)

if (DRY) {
  console.log('\n--dry: no event sent.')
  process.exit(0)
}

/**
 * A marker unique to this run, so the event can be found by search rather than
 * by "the most recent one", which is ambiguous the moment two runs race.
 */
const marker = `sentry-verify-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

Sentry.init({
  dsn,
  environment: env('SENTRY_ENVIRONMENT') || 'development',
  release: env('SENTRY_RELEASE') || undefined,
  // This script's whole purpose is delivery, so nothing is sampled away.
  tracesSampleRate: 0,
  sendDefaultPii: false,
})

const eventId = Sentry.captureException(new Error(`Sentry verification event: ${marker}`), {
  tags: { area: 'sentry-verify', marker },
  level: 'error',
})

// `flush` is the point. On a normal server the transport drains in the
// background; a short-lived script exits first and the event never leaves.
const delivered = await Sentry.flush(10_000)

if (!delivered) {
  console.error('\nsentry-verify: FAILED')
  console.error('  flush() timed out: the event was queued but never accepted by ingest.')
  console.error('  Network, a wrong project id in the DSN, or a disabled DSN key.')
  process.exit(1)
}

console.log('\nsentry-verify: event delivered')
console.log(`  event id      ${eventId}`)
console.log(`  marker        ${marker}`)
console.log(`  find it       marker:${marker}`)
