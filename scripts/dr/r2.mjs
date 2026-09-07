/**
 * Minimal Cloudflare R2 (S3 API) client for the backup pipeline. SigV4 by
 * hand, node stdlib only: the workflows that run this must not need `pnpm
 * install` (a backup job that can be broken by a lockfile change is a backup
 * job that silently stops), and `@aws-sdk/client-s3` is ~20MB for four verbs.
 *
 * Credentials come from a BACKUP_R2_* family of env vars, deliberately
 * distinct from any runtime R2_* media credentials: the backup token should be
 * scoped to the backup bucket alone, so a leak of one is not a leak of both.
 */

import { createHash, createHmac } from 'node:crypto'

const REGION = 'auto'
const SERVICE = 's3'

/** Read + validate the BACKUP_R2_* family; names every missing var at once. */
export function r2ConfigFromEnv(env = process.env) {
  const names = [
    'BACKUP_R2_ACCOUNT_ID',
    'BACKUP_R2_ACCESS_KEY_ID',
    'BACKUP_R2_SECRET_ACCESS_KEY',
    'BACKUP_R2_BUCKET',
  ]
  const missing = names.filter((n) => !env[n])
  if (missing.length > 0) {
    throw new Error(
      `missing env: ${missing.join(', ')} (an R2 API token scoped to the backup bucket; see docs/DB-RESTORE-RUNBOOK.md)`,
    )
  }
  return {
    accountId: env.BACKUP_R2_ACCOUNT_ID,
    accessKeyId: env.BACKUP_R2_ACCESS_KEY_ID,
    secretAccessKey: env.BACKUP_R2_SECRET_ACCESS_KEY,
    bucket: env.BACKUP_R2_BUCKET,
  }
}

// S3 uri-encodes each path segment but keeps the slashes.
function encodeKeyPath(key) {
  return key.split('/').map(uriEncode).join('/')
}

// RFC 3986, which is stricter than encodeURIComponent about ! ' ( ) *
function uriEncode(s) {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest()
}

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex')
}

async function r2Fetch(cfg, method, key, { query = {}, body = null } = {}) {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`
  const path = `/${cfg.bucket}${key ? `/${encodeKeyPath(key)}` : ''}`
  const now = new Date()
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256Hex(body ?? '')

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(String(query[k]))}`)
    .join('&')
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = [
    method,
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, REGION)
  const kService = hmac(kRegion, SERVICE)
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  const url = `https://${host}${path}${canonicalQuery ? `?${canonicalQuery}` : ''}`
  const res = await fetch(url, {
    method,
    headers: {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: body ?? undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `R2 ${method} ${key || '(bucket)'} -> ${res.status} ${res.statusText}\n${text.slice(0, 500)}`,
    )
  }
  return res
}

export async function r2Put(cfg, key, bodyBuffer) {
  await r2Fetch(cfg, 'PUT', key, { body: bodyBuffer })
}

/** @returns {Promise<Buffer>} */
export async function r2Get(cfg, key) {
  const res = await r2Fetch(cfg, 'GET', key)
  return Buffer.from(await res.arrayBuffer())
}

export async function r2Delete(cfg, key) {
  await r2Fetch(cfg, 'DELETE', key)
}

/** Every key under the prefix, following ListObjectsV2 pagination. */
export async function r2List(cfg, prefix) {
  const { parseListObjectsXml } = await import('./backup-lib.mjs')
  const keys = []
  let token = null
  do {
    const query = { 'list-type': '2', prefix }
    if (token) query['continuation-token'] = token
    const res = await r2Fetch(cfg, 'GET', '', { query })
    const page = parseListObjectsXml(await res.text())
    keys.push(...page.keys)
    token = page.truncated ? page.continuationToken : null
  } while (token)
  return keys
}
