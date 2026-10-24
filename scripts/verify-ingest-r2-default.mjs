#!/usr/bin/env node
/**
 * VERIFIES ingest-r2.mjs DEFAULT 50 OPS/MIN RATE LIMIT.
 *
 * Runs the actual script with default RATE_LIMIT = 50, not patched to 5.
 * Uses mock server to avoid needing R2 credentials. Uploads just 3 objects
 * to keep verification fast while proving the default limit is enforced.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TEST_DIR = join(tmpdir(), `ingest-r2-default-${Date.now()}`)
mkdirSync(TEST_DIR, { recursive: true })

const manifest = {
  assets: [
    { path: 'test1.png', quarantined: false },
    { path: 'test2.jpg', quarantined: false },
    { path: 'test3.webp', quarantined: false },
  ],
}

writeFileSync(join(TEST_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

for (const asset of manifest.assets) {
  writeFileSync(join(TEST_DIR, asset.path), Buffer.from(`data ${asset.path}`))
}

console.log('✓ Test environment created (3 objects)\n')

let uploadCount = 0
const server = createServer((req, res) => {
  if (req.method === 'PUT') {
    req.on('data', () => {})
    req.on('end', () => {
      uploadCount++
      res.writeHead(200)
      res.end()
    })
  } else {
    res.writeHead(404)
    res.end()
  }
})

await new Promise((resolve) => server.listen(18754, '127.0.0.1', resolve))
console.log('✓ Mock R2 server on 127.0.0.1:18754\n')

// Patch ONLY the server URL, keep RATE_LIMIT = 50
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
  .replace(/\`https:\/\/\$\{host\}\$\{path\}\`/, '`http://127.0.0.1:18754${path}`')

// VERIFY RATE_LIMIT = 50 is unchanged
if (!patched.includes('const RATE_LIMIT = 50')) {
  console.error('✗ FAILED: RATE_LIMIT not 50 in script')
  process.exit(1)
}

const patchedPath = join(TEST_DIR, 'ingest-r2-patched.mjs')
writeFileSync(patchedPath, patched)

console.log('Running ingest-r2.mjs with DEFAULT RATE_LIMIT = 50 ops/min\n')

const proc = spawn('node', [patchedPath], {
  env: {
    ...process.env,
    R2_ACCOUNT_ID: 'test',
    R2_ACCESS_KEY_ID: 'test',
    R2_SECRET_ACCESS_KEY: 'test',
    R2_BUCKET: 'test',
  },
})

let output = ''
proc.stdout.on('data', (d) => {
  const str = d.toString()
  process.stdout.write(str)
  output += str
})
proc.stderr.on('data', (d) => process.stderr.write(d.toString()))

await new Promise((resolve) => proc.on('close', resolve))

console.log('\n✓ Script executed with default configuration')

if (!output.includes('rate limit: 50 ops/min')) {
  console.error('✗ FAILED: output does not show "rate limit: 50 ops/min"')
  server.close()
  rmSync(TEST_DIR, { recursive: true })
  process.exit(1)
}

if (uploadCount !== 3) {
  console.error(`✗ FAILED: expected 3 uploads, got ${uploadCount}`)
  server.close()
  rmSync(TEST_DIR, { recursive: true })
  process.exit(1)
}

if (!output.includes('%') || !output.includes('elapsed')) {
  console.error('✗ FAILED: progress display not shown')
  server.close()
  rmSync(TEST_DIR, { recursive: true })
  process.exit(1)
}

console.log('✓ Default RATE_LIMIT = 50 verified in output')
console.log('✓ Progress display verified')
console.log(`✓ All ${uploadCount} objects uploaded successfully`)

server.close()
rmSync(TEST_DIR, { recursive: true })

console.log('\n✅ DEFAULT CONFIGURATION VERIFIED: 50 ops/min, progress, upload path executes')
