#!/usr/bin/env node
/**
 * Verifies PostHog capture is working by sending a test event and checking response.
 *
 * Usage:
 *   NEXT_PUBLIC_POSTHOG_KEY=phc_... node scripts/verify-posthog-capture.mjs
 *
 * Exit codes:
 *   0: Capture succeeded (200 response)
 *   1: Not configured (missing key)
 *   2: Capture failed (non-200 or error)
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(
  /\/+$/,
  '',
)

if (!KEY) {
  console.log('PostHog not configured (NEXT_PUBLIC_POSTHOG_KEY missing)')
  console.log('Capture: SKIP')
  process.exit(1)
}

const testEvent = {
  api_key: KEY,
  event: 'c35_verification_test',
  distinct_id: `verify-${Date.now()}`,
  properties: {
    $lib: 'c35-verify',
    source: 'verification-script',
    timestamp_unix: Date.now(),
  },
  timestamp: new Date().toISOString(),
}

console.log('PostHog Capture Verification')
console.log('============================')
console.log(`Host: ${HOST}`)
console.log(`Event: ${testEvent.event}`)
console.log(`Distinct ID: ${testEvent.distinct_id}`)
console.log('')

try {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  const response = await fetch(`${HOST}/capture/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(testEvent),
    signal: controller.signal,
  })

  clearTimeout(timeoutId)

  console.log(`Status: ${response.status} ${response.statusText}`)

  if (response.ok) {
    const text = await response.text()
    console.log(`Response: ${text || '(empty)'}`)
    console.log('')
    console.log('✅ PostHog capture: WORKING')
    console.log(`   Event sent successfully to ${HOST}/capture/`)
    console.log(`   Check PostHog UI for event: ${testEvent.event}`)
    process.exit(0)
  } else {
    const text = await response.text()
    console.error(`Error response: ${text}`)
    console.log('')
    console.log('❌ PostHog capture: FAILED')
    console.log(`   HTTP ${response.status}: ${response.statusText}`)
    process.exit(2)
  }
} catch (error) {
  if (error.name === 'AbortError') {
    console.error('Request timed out after 5s')
  } else {
    console.error(`Error: ${error.message}`)
  }
  console.log('')
  console.log('❌ PostHog capture: FAILED')
  console.log(`   ${error.message}`)
  process.exit(2)
}
