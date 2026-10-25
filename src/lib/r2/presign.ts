// SigV4 presigned URLs for Cloudflare R2 (S3 API), GET and PUT.
// Server only. Web Crypto, no AWS SDK, same scheme as src/lib/storage/r2.ts.
//
// GET URLs are how a private object (invoice PDF, voucher asset) is handed to
// one customer for a few minutes. PUT URLs are how the browser uploads.

import 'server-only'

const ALGORITHM = 'AWS4-HMAC-SHA256'
const REGION = 'auto'
const SERVICE = 's3'

/** S3 allows at most 7 days. */
const MAX_PRESIGN_SECONDS = 604_800

export type R2Method = 'GET' | 'PUT'

export type R2Credentials = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

function r2CredentialsFromEnv(
  env: Record<string, string | undefined> = process.env,
): R2Credentials | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
  }
}

const encoder = new TextEncoder()

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

async function sha256Hex(data: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(data))))
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', k, encoder.encode(data))
}

const encodeRfc3986 = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

const encodeKey = (key: string) => key.split('/').map(encodeRfc3986).join('/')

/** Object keys are ours; refuse anything that could walk out of the prefix. */
export function assertSafeKey(key: string): void {
  if (
    !key ||
    key.startsWith('/') ||
    key.includes('..') ||
    key.includes('\\') ||
    key.includes('\0')
  ) {
    throw new Error('invalid R2 object key')
  }
}

export async function presignR2Url(opts: {
  method: R2Method
  key: string
  expiresSeconds?: number
  credentials?: R2Credentials
  now?: Date
}): Promise<string> {
  assertSafeKey(opts.key)
  const creds = opts.credentials ?? r2CredentialsFromEnv()
  if (!creds) throw new Error('R2 is not configured')

  const expires = Math.min(Math.max(Math.floor(opts.expiresSeconds ?? 300), 1), MAX_PRESIGN_SECONDS)
  const host = `${creds.accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${creds.bucket}/${encodeKey(opts.key)}`

  const amzDate = (opts.now ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`

  const params: Record<string, string> = {
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${creds.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  }
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(params[k] as string)}`)
    .join('&')

  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const stringToSign = [ALGORITHM, amzDate, scope, await sha256Hex(canonicalRequest)].join('\n')

  const kDate = await hmac(encoder.encode(`AWS4${creds.secretAccessKey}`), dateStamp)
  const kRegion = await hmac(kDate, REGION)
  const kService = await hmac(kRegion, SERVICE)
  const kSigning = await hmac(kService, 'aws4_request')
  const signature = toHex(new Uint8Array(await hmac(kSigning, stringToSign)))

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

/** Short-lived link to a private object. Default 5 minutes. */
export const signedGetUrl = (key: string, expiresSeconds = 300) =>
  presignR2Url({ method: 'GET', key, expiresSeconds })

/** Short-lived upload URL for the browser. Default 10 minutes. */
export const signedPutUrl = (key: string, expiresSeconds = 600) =>
  presignR2Url({ method: 'PUT', key, expiresSeconds })
