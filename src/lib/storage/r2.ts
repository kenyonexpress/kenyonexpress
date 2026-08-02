// Cloudflare R2 uploads via AWS SigV4 presigned PUT URLs (S3 compatible API).
// Server only. No AWS SDK: signing is done with Web Crypto (HMAC-SHA256).
//
// The browser receives a short-lived presigned URL and PUTs the file straight
// to R2, so image bytes never pass through the Next.js server. When R2 env vars
// are absent, callers fall back to Supabase Storage (see requestUploadUrl).
//
// Required env:
//   R2_ACCOUNT_ID           Cloudflare account id (subdomain of r2 endpoint)
//   R2_ACCESS_KEY_ID        R2 API token access key
//   R2_SECRET_ACCESS_KEY    R2 API token secret
//   R2_BUCKET               target bucket name
//   R2_PUBLIC_BASE_URL      public CDN base, e.g. https://cdn.kenyonexpress.co.il

import 'server-only'

const ALGORITHM = 'AWS4-HMAC-SHA256'
const REGION = 'auto'
const SERVICE = 's3'

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_BASE_URL,
  )
}

export function r2PublicUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
  return `${base}/${key}`
}

const encoder = new TextEncoder()

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return toHex(new Uint8Array(buf))
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// RFC 3986 encoding; each path segment is encoded but slashes are preserved.
function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeRfc3986).join('/')
}

/**
 * Build a presigned PUT URL valid for `expiresSeconds`. The browser must PUT the
 * raw file body to this URL. Only the `host` header is signed, so the client may
 * freely set Content-Type without breaking the signature.
 */
export async function createR2PresignedPutUrl(
  key: string,
  expiresSeconds = 600,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const accountId = process.env.R2_ACCOUNT_ID as string
  const accessKeyId = process.env.R2_ACCESS_KEY_ID as string
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY as string
  const bucket = process.env.R2_BUCKET as string

  const host = `${accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${bucket}/${encodeKey(key)}`

  // amz date: YYYYMMDDTHHMMSSZ (Date.now / new Date allowed here; runs at request time)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const signedHeaders = 'host'

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  }

  const canonicalQuery = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(queryParams[k] as string)}`)
    .join('&')

  const canonicalHeaders = `host:${host}\n`
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const kDate = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp)
  const kRegion = await hmac(kDate, REGION)
  const kService = await hmac(kRegion, SERVICE)
  const kSigning = await hmac(kService, 'aws4_request')
  const signature = toHex(new Uint8Array(await hmac(kSigning, stringToSign)))

  const uploadUrl = `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
  return { uploadUrl, publicUrl: r2PublicUrl(key) }
}
