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
 * Usage:
 *   node scripts/upload-r2.mjs --dry-run          # verify without credentials
 *   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
 *   R2_BUCKET=... node scripts/upload-r2.mjs --prefix=live-assets/
 *
 * Exit: 0 done or dry-run clean, 1 blocked or failed.
 */

import { createHash, createHmac } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const MANIFEST = resolve('refs/live-assets/manifest.json')
const ROOT = resolve('refs/live-assets')

const flag = (name) => process.argv.includes(`--${name}`)
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

const DRY = flag('dry-run')
const PREFIX = arg('prefix', 'live-assets/')

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
let sent = 0
let failed = 0

for (const object of objects) {
  const body = readFileSync(object.file)
  const path = `/${R2_BUCKET}/${object.key}`
  const contentType = CONTENT_TYPE[extname(object.file).toLowerCase()] ?? 'application/octet-stream'
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
    process.stdout.write('.')
  } catch (error) {
    failed += 1
    console.error(`\n  failed ${object.key}: ${String(error).slice(0, 120)}`)
  }
}

console.log(`\n\nuploaded ${sent}, failed ${failed}`)
process.exit(failed > 0 ? 1 : 0)
