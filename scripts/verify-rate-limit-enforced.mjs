#!/usr/bin/env node
/**
 * PROVES 50 OPS/MIN RATE LIMIT IS ENFORCED.
 *
 * Uploads 60 objects with ingest-r2.mjs. Without rate limiting, this would
 * complete in ~3 seconds. With 50 ops/min limit, it MUST take at least 60s
 * (first 50 go immediately, then wait 60s for window to clear, then last 10).
 *
 * This demonstrates the rate limiter actually enforces the limit in the real
 * upload path, not just in theory.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TEST_DIR = join(tmpdir(), `rate-limit-verify-${Date.now()}`)
mkdirSync(TEST_DIR, { recursive: true })

// Create 60 objects (will exceed 50/min limit)
const NUM_OBJECTS = 60
const manifest = {
  assets: Array.from({ length: NUM_OBJECTS }, (_, i) => ({
    path: `test${i}.png`,
    quarantined: false,
  })),
}

writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

for (const asset of manifest.assets) {
  writeFileSync(join(TEST_DIR, asset.path), Buffer.from(`data ${asset.path}`))
}

console.log(`✓ Created ${NUM_OBJECTS} test objects\n`)

// Mock R2 server
let uploadCount = 0
const uploadTimes = []

const server = createServer((req, res) => {
  if (req.method === 'PUT') {
    req.on('data', () => {})
    req.on('end', () => {
      uploadCount++
      uploadTimes.push(Date.now())
      res.writeHead(200)
      res.end()
    })
  } else {
    res.writeHead(404)
    res.end()
  }
})

await new Promise((resolve) => server.listen(18755, '127.0.0.1', resolve))

console.log('✓ Mock R2 server running\n')

// Patch script to use test dir (keep RATE_LIMIT = 50)
const script = await import('node:fs').then((fs) =>
  fs.readFileSync('scripts/ingest-r2.mjs', 'utf8'),
)

const patched = script
  .replace(
    /const MANIFEST = resolve\('refs\/live-assets\/manifest\.json'\)/,
    `const MANIFEST = '${join(TEST_DIR, 'manifest.json')}'`,
  )
  .replace(/const ROOT = resolve\('refs\/live-assets'\)/, `const ROOT = '${TEST_DIR}'`)
  .replace(
    /const STATE_FILE = resolve\('refs\/live-assets\/\.ingest-r2-state\.json'\)/,
    `const STATE_FILE = '${join(TEST_DIR, '.state.json')}'`,
  )
  .replace(/\`https:\/\/\$\{host\}\$\{path\}\`/, '`http://127.0.0.1:18755${path}`')

if (!patched.includes('const RATE_LIMIT = 50')) {
  console.error('✗ FAILED: script does not have RATE_LIMIT = 50')
  process.exit(1)
}

const patchedPath = join(TEST_DIR, 'ingest-r2.mjs')
writeFileSync(patchedPath, patched)

console.log(`Uploading ${NUM_OBJECTS} objects with 50 ops/min limit...\n`)
console.log('Expected: >60s (first 50 immediate, wait for window, then last 10)\n')

const startTime = Date.now()

const proc = spawn('node', [patchedPath], {
  env: {
    ...process.env,
    R2_ACCOUNT_ID: 'test',
    R2_ACCESS_KEY_ID: 'test',
    R2_SECRET_ACCESS_KEY: 'test',
    R2_BUCKET: 'test',
  },
})

let sawRateLimitWait = false

proc.stdout.on('data', (d) => {
  const str = d.toString()
  if (str.includes('rate limit: waiting')) {
    sawRateLimitWait = true
    process.stdout.write('\n✓ RATE LIMIT TRIGGERED: ')
  }
  process.stdout.write(str)
})

proc.stderr.on('data', (d) => process.stderr.write(d.toString()))

await new Promise((resolve) => proc.on('close', resolve))

const elapsed = Date.now() - startTime

console.log(`\n\nUpload completed in ${(elapsed / 1000).toFixed(1)}s`)

server.close()

// Verify results
if (uploadCount !== NUM_OBJECTS) {
  console.error(`✗ FAILED: expected ${NUM_OBJECTS} uploads, got ${uploadCount}`)
  rmSync(TEST_DIR, { recursive: true })
  process.exit(1)
}

if (!sawRateLimitWait) {
  console.error('✗ FAILED: did not see "rate limit: waiting" message')
  rmSync(TEST_DIR, { recursive: true })
  process.exit(1)
}

// Without rate limiting, 60 uploads would take ~3s
// With 50/min limit: first 50 immediate (~2.5s), wait ~60s, last 10 immediate
// Total should be >= 60s

const MIN_EXPECTED = 60000 // 60 seconds
if (elapsed < MIN_EXPECTED * 0.95) {
  console.error(
    `✗ FAILED: completed too fast (${(elapsed / 1000).toFixed(1)}s < ${MIN_EXPECTED / 1000}s)`,
  )
  console.error('  Rate limiter may not be working')
  rmSync(TEST_DIR, { recursive: true })
  process.exit(1)
}

console.log(`✓ Duration ${(elapsed / 1000).toFixed(1)}s >= ${MIN_EXPECTED / 1000}s minimum`)
console.log('✓ Rate limiter enforced 50 ops/min limit')
console.log(`✓ All ${uploadCount} objects uploaded`)

rmSync(TEST_DIR, { recursive: true })

console.log('\n✅ VERIFIED: 50 ops/min rate limit is enforced in real upload path')
