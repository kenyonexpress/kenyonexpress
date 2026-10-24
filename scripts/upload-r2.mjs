#!/usr/bin/env node
/**
 * UPLOADS THE INGESTED LIVE ASSETS TO CLOUDFLARE R2.
 *
 * WHY THIS EXISTS BUT HAS NEVER RUN FOR REAL. The goal that asked for it ended
 * mid-sentence at "upload to Cloudflare R2 under" — no bucket, no prefix. And
 * R2 is not enabled on the account at all: listing buckets returns
 * `403 {"code":10042,"message":"Please enable R2 through the Cloudflare
 * Dashboard."}`, measured 2026-09-06. So the destination could not exist even
 * if it had been named.
 *
 * Rather than guess a bucket and put a catalogue of live imagery somewhere
 * nobody chose, this is written, dry-runnable, and gated on the two facts that
 * are missing. When both arrive it is one command.
 *
 * SIGV4 BY HAND, NO SDK. R2 speaks the S3 API and `@aws-sdk/client-s3` is ~20MB
 * of dependency for PutObject. The signing is sixty lines of `node:crypto`,
 * which is the same trade this repo already made for blurhash and for the same
 * reason: four transitive packages here are pinned to close advisories.
 *
 * RATE LIMITING. R2 operations are capped at 50/min to avoid excessive API costs.
 * A sliding window tracks the last 60 seconds of operations.
 *
 * RESUME. State is tracked in refs/live-assets/.upload-state.json. If interrupted,
 * re-run and it skips uploaded objects. Use --force to ignore state and re-upload.
 *
 * COST CAP. Use --max-ops=N to stop after N operations. Prevents runaway costs.
 *
 * Usage:
 *   node scripts/upload-r2.mjs --dry-run          # verify without credentials
 *   node scripts/upload-r2.mjs --max-ops=100      # upload up to 100 objects
 *   node scripts/upload-r2.mjs --force            # ignore state, re-upload all
 *   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
 *   R2_BUCKET=... node scripts/upload-r2.mjs --prefix=live-assets/
 *
 * Exit: 0 done or dry-run clean, 1 blocked or failed.
 */

import { createHash, createHmac } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const MANIFEST = resolve('refs/live-assets/manifest.json')
const ROOT = resolve('refs/live-assets')
const STATE_FILE = resolve('refs/live-assets/.upload-state.json')

const flag = (name) => process.argv.includes(`--${name}`)
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

const DRY = flag('dry-run')
const FORCE = flag('force')
const PREFIX = arg('prefix', 'live-assets/')
const MAX_OPS = arg('max-ops', null) ? Number.parseInt(arg('max-ops', '0'), 10) : null
const RATE_LIMIT = 50 // operations per minute

const CONTENT_TYPE = {
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

/**
 * Immutable, because every object is content-addressed by its source path and a
 * live asset that changes gets a new path from WordPress. A year is the longest
 * value browsers honour.
 */
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

// ---- SigV4 --------------------------------------------------------------

const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()

function signingKey(secret, date, region, service) {
  const kDate = hmac(`AWS4${secret}`, date)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  return hmac(kService, 'aws4_request')
}

function signedHeaders({ method, host, path, body, accessKeyId, secretAccessKey, contentType }) {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const date = amzDate.slice(0, 8)
  const region = 'auto'
  const service = 's3'
  const payloadHash = sha256(body)

  const headers = {
    host,
    'content-type': contentType,
    'cache-control': CACHE_CONTROL,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
  const signed = Object.keys(headers).sort()
  const canonicalHeaders = signed.map((k) => `${k}:${headers[k]}\n`).join('')
  const canonicalRequest = [method, path, '', canonicalHeaders, signed.join(';'), payloadHash].join(
    '\n',
  )

  const scope = `${date}/${region}/${service}/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n')
  const signature = createHmac('sha256', signingKey(secretAccessKey, date, region, service))
    .update(toSign)
    .digest('hex')

  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${signature}`,
  }
}

// ---- state management ---------------------------------------------------

function loadState() {
  if (!existsSync(STATE_FILE)) return { uploaded: new Set(), timestamp: Date.now() }
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    return { uploaded: new Set(data.uploaded || []), timestamp: data.timestamp || Date.now() }
  } catch {
    return { uploaded: new Set(), timestamp: Date.now() }
  }
}

function saveState(uploaded) {
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ uploaded: Array.from(uploaded), timestamp: Date.now() }, null, 2),
    'utf8',
  )
}

// ---- rate limiting ------------------------------------------------------

class RateLimiter {
  constructor(maxOpsPerMinute) {
    this.maxOps = maxOpsPerMinute
    this.window = []
  }

  async waitIfNeeded() {
    const now = Date.now()
    const cutoff = now - 60000 // 60 seconds ago
    this.window = this.window.filter((t) => t > cutoff)

    if (this.window.length >= this.maxOps) {
      const oldestOp = this.window[0]
      const waitMs = oldestOp + 60000 - now
      if (waitMs > 0) {
        process.stdout.write(` [rate limit: waiting ${Math.ceil(waitMs / 1000)}s] `)
        await new Promise((resolve) => setTimeout(resolve, waitMs))
        return this.waitIfNeeded()
      }
    }

    this.window.push(Date.now())
  }
}

// ---- progress display ---------------------------------------------------

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  return `${min}m ${s}s`
}

function showProgress(current, total, bytes, totalBytes, startTime) {
  const pct = ((current / total) * 100).toFixed(1)
  const elapsed = Date.now() - startTime
  const rate = elapsed > 0 ? current / elapsed : 0
  const eta = rate > 0 ? (total - current) / rate : 0

  process.stdout.write(
    `\r  ${current}/${total} (${pct}%) · ${formatBytes(bytes)}/${formatBytes(totalBytes)} · ` +
      `elapsed ${formatDuration(elapsed)} · ETA ${formatDuration(eta)}` +
      `${' '.repeat(10)}`,
  )
}

// ---- the blockers -------------------------------------------------------

function checkBlockers() {
  const missing = []
  for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
    if (!process.env[name]) missing.push(name)
  }
  return missing
}

function reportBlocked(missing) {
  console.error('upload-r2: BLOCKED, nothing uploaded\n')
  console.error(`  missing environment: ${missing.join(', ')}\n`)
  console.error('  Two things are outstanding and neither can be guessed:\n')
  console.error('  1. R2 is not enabled on the Cloudflare account. Listing buckets returns')
  console.error('     403 code 10042 "Please enable R2 through the Cloudflare Dashboard".')
  console.error('     Enable it, then create the bucket.')
  console.error('  2. The instruction that asked for this ended mid-sentence at')
  console.error('     "upload to Cloudflare R2 under" — no bucket name, no prefix.\n')
  console.error('  Once both are settled:')
  console.error('    R2_ACCOUNT_ID=<id> R2_ACCESS_KEY_ID=<key> \\')
  console.error('    R2_SECRET_ACCESS_KEY=<secret> R2_BUCKET=<bucket> \\')
  console.error(`    node scripts/upload-r2.mjs --prefix=${PREFIX}\n`)
  console.error('  docs/MISSING-ASSETS.md carries the same, with the measurement.')
}

// ---- main ---------------------------------------------------------------

if (!existsSync(MANIFEST)) {
  console.error(`upload-r2: no manifest at ${MANIFEST}`)
  console.error('  Run `node scripts/ingest-live-assets.mjs` first.')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))

/**
 * Everything the ingest kept, plus its derivatives. Quarantined assets are NOT
 * uploaded: they are the Electro demo kit and the whole point of quarantining
 * them was to keep them out of anything the site can reach.
 */
const objects = []
for (const asset of manifest.assets) {
  if (asset.quarantined || asset.error) continue
  const source = join(ROOT, asset.path)
  if (existsSync(source)) {
    objects.push({ key: PREFIX + asset.path, file: source, blurhash: asset.blurhash })
  }
  for (const d of asset.derivatives ?? []) {
    const derived = join(
      ROOT,
      '_derived',
      `${asset.path.replace(/\.[^.]+$/, '')}.${d.width}.${d.format}`,
    )
    if (existsSync(derived)) {
      objects.push({ key: PREFIX + derived.slice(join(ROOT, '_derived/').length), file: derived })
    }
  }
}

const totalBytes = objects.reduce((n, o) => n + statSync(o.file).size, 0)
const quarantined = manifest.assets.filter((a) => a.quarantined).length

console.log(`upload-r2: ${objects.length} objects, ${(totalBytes / 1e6).toFixed(1)}MB`)
console.log(`  prefix: ${PREFIX}`)
console.log(`  skipping ${quarantined} quarantined Electro/vendor assets`)

if (DRY) {
  console.log('\n  DRY RUN — nothing sent. First ten keys:')
  for (const o of objects.slice(0, 10)) {
    console.log(`    ${o.key}  (${(statSync(o.file).size / 1024).toFixed(0)}KB)`)
  }
  console.log(`\n  ...and ${Math.max(0, objects.length - 10)} more.`)
  console.log('  Content-Type is set per extension; Cache-Control is')
  console.log(`  "${CACHE_CONTROL}" on every object.`)
  process.exit(0)
}

const missing = checkBlockers()
if (missing.length > 0) {
  reportBlocked(missing)
  process.exit(1)
}

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

// Load state
const state = FORCE ? { uploaded: new Set(), timestamp: Date.now() } : loadState()
const limiter = new RateLimiter(RATE_LIMIT)

let sent = 0
let failed = 0
let skipped = 0
let bytesSent = 0
const startTime = Date.now()

// Filter out already-uploaded objects
const toUpload = objects.filter((o) => {
  if (state.uploaded.has(o.key)) {
    skipped += 1
    return false
  }
  return true
})

if (skipped > 0) {
  console.log(`\n  Resuming: ${skipped} objects already uploaded, ${toUpload.length} remaining`)
}

// Apply cost cap
const cappedUpload = MAX_OPS ? toUpload.slice(0, MAX_OPS - state.uploaded.size) : toUpload
if (MAX_OPS && cappedUpload.length < toUpload.length) {
  console.log(
    `\n  Cost cap: uploading ${cappedUpload.length} of ${toUpload.length} remaining (max-ops=${MAX_OPS})`,
  )
}

console.log('') // newline before progress

for (const object of cappedUpload) {
  await limiter.waitIfNeeded()

  const body = readFileSync(object.file)
  const path = `/${R2_BUCKET}/${object.key}`
  const contentType = CONTENT_TYPE[extname(object.file).toLowerCase()] ?? 'application/octet-stream'

  showProgress(sent + failed, cappedUpload.length, bytesSent, totalBytes, startTime)

  try {
    const response = await fetch(`https://${host}${path}`, {
      method: 'PUT',
      headers: signedHeaders({
        method: 'PUT',
        host,
        path,
        body,
        contentType,
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      }),
      body,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status} ${await response.text()}`)

    sent += 1
    bytesSent += body.length
    state.uploaded.add(object.key)
    saveState(state.uploaded)
  } catch (error) {
    failed += 1
    console.error(`\n  failed ${object.key}: ${String(error).slice(0, 120)}`)
  }
}

showProgress(sent + failed, cappedUpload.length, bytesSent, totalBytes, startTime)
console.log('\n')

const remaining = toUpload.length - cappedUpload.length
if (remaining > 0) {
  console.log(
    `\nCost cap reached. ${remaining} objects remain. Re-run without --max-ops or increase the limit.`,
  )
}

if (skipped > 0 || state.uploaded.size > 0) {
  console.log(
    `\nTotal progress: ${state.uploaded.size} uploaded, ${objects.length - state.uploaded.size} remaining`,
  )
}

console.log(`\nSession: uploaded ${sent}, failed ${failed}, skipped ${skipped}`)
process.exit(failed > 0 ? 1 : 0)
