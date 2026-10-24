#!/usr/bin/env node
/**
 * Verifies Axiom drain is working by sending a test log and checking response.
 *
 * Usage:
 *   AXIOM_TOKEN=xaat_... AXIOM_DATASET=dataset node scripts/verify-axiom-drain.mjs
 *
 * Exit codes:
 *   0: Ingest succeeded (200 response)
 *   1: Not configured (missing token or dataset)
 *   2: Ingest failed (non-200 or error)
 */

const TOKEN = process.env.AXIOM_TOKEN
const DATASET = process.env.AXIOM_DATASET
const API = 'https://api.axiom.co/v1/datasets'

if (!TOKEN || !DATASET) {
  console.log('Axiom not configured (AXIOM_TOKEN or AXIOM_DATASET missing)')
  console.log('Drain: SKIP')
  process.exit(1)
}

const testLog = {
  _time: new Date().toISOString(),
  ts: new Date().toISOString(),
  level: 'info',
  event: 'c35_verification_test',
  source: 'verification-script',
  timestamp_unix: Date.now(),
  request_id: `verify-${Date.now()}`,
  message: 'C35 Axiom drain verification test',
}

console.log('Axiom Drain Verification')
console.log('========================')
console.log(`Dataset: ${DATASET}`)
console.log(`Event: ${testLog.event}`)
console.log(`Request ID: ${testLog.request_id}`)
console.log('')

try {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)

  const response = await fetch(`${API}/${encodeURIComponent(DATASET)}/ingest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([testLog]),
    signal: controller.signal,
  })

  clearTimeout(timeoutId)

  console.log(`Status: ${response.status} ${response.statusText}`)

  if (response.ok) {
    const json = await response.json().catch(() => null)
    if (json) {
      console.log(`Response: ${JSON.stringify(json, null, 2)}`)
    }
    console.log('')
    console.log('✅ Axiom drain: WORKING')
    console.log(`   Log sent successfully to dataset: ${DATASET}`)
    console.log(`   Check Axiom UI for event: ${testLog.event}`)
    console.log(`   Filter by request_id: ${testLog.request_id}`)
    process.exit(0)
  } else {
    const text = await response.text()
    console.error(`Error response: ${text}`)
    console.log('')
    console.log('❌ Axiom drain: FAILED')
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
  console.log('❌ Axiom drain: FAILED')
  console.log(`   ${error.message}`)
  process.exit(2)
}
