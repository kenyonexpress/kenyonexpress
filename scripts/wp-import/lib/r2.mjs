// Cloudflare R2 uploads for the import pipeline, via AWS SigV4 on the S3 API.
//
// The app already talks to R2 from src/lib/storage/r2.ts, but that module signs
// PRESIGNED URLs so a browser can PUT a file without the bytes passing through
// the server, and it is `server-only` so a script cannot import it. Here the
// bytes are already in hand in a Node process, so the request is signed
// directly with an Authorization header: one round trip instead of two, and no
// URL carrying credentials into a log.
//
// No AWS SDK. The signing is ~60 lines against Web Crypto, and the SDK would
// put a large transitive tree into the migration path for one PUT.

import { createHash, createHmac } from 'node:crypto'

const ALGORITHM = 'AWS4-HMAC-SHA256'
const REGION = 'auto' // R2 has one region and requires this literal
const SERVICE = 's3'

/**
 * The bucket, under either name. The app and these scripts read `R2_BUCKET`;
 * the Vercel project was provisioned with `R2_BUCKET_NAME` (measured
 * 2026-10-06 with `vercel env ls`). Accepting both is cheaper than a rename
 * that has to land in two places at once.
 */
export function bucketName() {
  return process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || ''
}

export function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      bucketName(),
  )
}

/**
 * The public URL of a key.
 *
 * Falls back to the r2.dev development domain when no custom domain is set,
 * and says so, because shipping r2.dev URLs into products.images is a decision
 * with a long tail: those URLs are rate limited by Cloudflare and they are not
 * on our domain, so the day the bucket moves every image in the catalogue
 * breaks. R2_PUBLIC_BASE_URL should be cdn.kenyonexpress.co.il in any run whose
 * output is kept.
 */
export function r2PublicUrl(key) {
  const base = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
  if (base) return `${base}/${key}`
  const account = process.env.R2_ACCOUNT_ID
  return account ? `https://pub-${account}.r2.dev/${key}` : null
}

function endpoint() {
  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
}

const hex = (buf) => Buffer.from(buf).toString('hex')
const sha256 = (data) => createHash('sha256').update(data).digest()
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()

/** RFC 3986: each segment encoded, slashes preserved. S3 is strict about this. */
function encodeKey(key) {
  return key
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/')
}

function signingKey(secret, date) {
  const kDate = hmac(`AWS4${secret}`, date)
  const kRegion = hmac(kDate, REGION)
  const kService = hmac(kRegion, SERVICE)
  return hmac(kService, 'aws4_request')
}

/**
 * PUT one object. Returns { key, url, skipped }.
 *
 * `ifNoneMatch` makes the upload conditional on the object not already
 * existing. Because every key here embeds the sha256 of its own bytes, an
 * object that exists is byte-identical to the one being uploaded, so a 412 is
 * success rather than a conflict. That is what makes a re-run after a crash
 * cost nothing instead of re-uploading a whole catalogue of images.
 */
export async function r2Put(
  key,
  body,
  {
    contentType = 'image/webp',
    ifNoneMatch = true,
    // A year, immutable, by default: the content-addressed keys this module
    // was written for never change their bytes. A caller uploading a NAMED
    // key (products/<file>) passes the 30-day policy instead
    // (src/lib/images/cache-policy.mjs), because that file can be replaced.
    cacheControl = 'public, max-age=31536000, immutable',
  } = {},
) {
  if (!isR2Configured())
    throw new Error(
      'R2 is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET)',
    )

  const bucket = bucketName()
  const host = new URL(endpoint()).host
  const canonicalUri = `/${bucket}/${encodeKey(key)}`

  const now = new Date()
  const amzDate = `${now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, '')
    .slice(0, 15)}Z`
  const date = amzDate.slice(0, 8)
  const payloadHash = hex(sha256(body))

  const headers = {
    host,
    'content-type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    'cache-control': cacheControl,
  }
  if (ifNoneMatch) headers['if-none-match'] = '*'

  const signedHeaders = Object.keys(headers).sort()
  const canonicalHeaders = `${signedHeaders.map((h) => `${h}:${headers[h]}`).join('\n')}\n`
  const signedHeaderList = signedHeaders.join(';')

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '', // no query string
    canonicalHeaders,
    signedHeaderList,
    payloadHash,
  ].join('\n')

  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const stringToSign = [ALGORITHM, amzDate, scope, hex(sha256(canonicalRequest))].join('\n')
  const signature = hex(hmac(signingKey(process.env.R2_SECRET_ACCESS_KEY, date), stringToSign))

  const response = await fetch(`${endpoint()}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      ...headers,
      Authorization: `${ALGORITHM} Credential=${process.env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaderList}, Signature=${signature}`,
    },
    body,
  })

  // 412 means the object is already there. Content-addressed, so it is the
  // same object; treat it as done.
  if (response.status === 412) return { key, url: r2PublicUrl(key), skipped: true }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`R2 PUT ${key} failed: ${response.status} ${detail.slice(0, 300)}`)
  }

  return { key, url: r2PublicUrl(key), skipped: false }
}

/**
 * HEAD one object with a signed request: the verification step after a PUT,
 * and the only read that works before a public domain exists on the bucket
 * (a bucket with no custom domain and no r2.dev subdomain enabled answers
 * nothing unsigned). Returns the metadata R2 reports, never throws on 404.
 */
export async function r2Head(key) {
  if (!isR2Configured())
    throw new Error(
      'R2 is not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET)',
    )
  const bucket = bucketName()
  const host = new URL(endpoint()).host
  const canonicalUri = `/${bucket}/${encodeKey(key)}`
  const now = new Date()
  const amzDate = `${now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, '')
    .slice(0, 15)}Z`
  const date = amzDate.slice(0, 8)
  const payloadHash = hex(sha256(''))
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate }
  const signedHeaders = Object.keys(headers).sort()
  const canonicalHeaders = `${signedHeaders.map((h) => `${h}:${headers[h]}`).join('\n')}\n`
  const signedHeaderList = signedHeaders.join(';')
  const canonicalRequest = [
    'HEAD',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaderList,
    payloadHash,
  ].join('\n')
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const stringToSign = [ALGORITHM, amzDate, scope, hex(sha256(canonicalRequest))].join('\n')
  const signature = hex(hmac(signingKey(process.env.R2_SECRET_ACCESS_KEY, date), stringToSign))
  const response = await fetch(`${endpoint()}${canonicalUri}`, {
    method: 'HEAD',
    headers: {
      ...headers,
      Authorization: `${ALGORITHM} Credential=${process.env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaderList}, Signature=${signature}`,
    },
  })
  if (response.status === 404) return { key, exists: false, status: 404 }
  if (!response.ok) throw new Error(`R2 HEAD ${key} failed: ${response.status}`)
  return {
    key,
    exists: true,
    status: response.status,
    contentType: response.headers.get('content-type'),
    contentLength: Number(response.headers.get('content-length') ?? 0),
    etag: response.headers.get('etag'),
  }
}

/**
 * The key layout, shared by every derivative of one source image.
 *
 * Sharded by the first two hex characters of the hash so the bucket does not
 * become one prefix with tens of thousands of entries, which makes both
 * listing and the Cloudflare dashboard unusable.
 *
 * Keyed on the CONTENT HASH ALONE and never on a product id: real catalogues
 * reuse the same photo across products, and a per-product prefix would store
 * identical bytes once per product, so the sha256 dedup would save conversion
 * work and nothing else. The cost of that choice is that one object belongs to
 * many products, which is exactly why deleting a product must never delete its
 * objects.
 */
export function r2Key(hash, suffix = '', ext = 'webp') {
  return `wp/${hash.slice(0, 2)}/${hash}${suffix}.${ext}`
}
