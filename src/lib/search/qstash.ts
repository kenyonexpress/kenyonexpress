import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { SearchIndexJob } from '@/lib/search/pipeline-contracts'

/**
 * Upstash QStash transport for search-index jobs.
 *
 * Kept SDK-free on purpose, like every other HTTP integration in this repo
 * (Meilisearch, Cardcom): one publish call and one JWT verification are not
 * worth a dependency.
 *
 * Delivery contract:
 * - publish -> QStash -> POST {APP_URL}/api/search/index-job (worker).
 * - QStash retries a non-2xx worker response up to QSTASH_RETRIES times with
 *   exponential backoff, then POSTs the failure to /api/search/index-dlq and
 *   parks the message in Upstash's own DLQ as a second copy.
 * - Every QStash delivery carries an `Upstash-Signature` JWS signed with one
 *   of two rotating HMAC keys; verifyQstashSignature checks it.
 *
 * When QSTASH_TOKEN is unset (local dev, tests, preview envs) enqueue degrades
 * to inline execution so the pipeline still works end to end without Upstash.
 */

const QSTASH_URL = 'https://qstash.upstash.io'
export const QSTASH_RETRIES = 5

export type EnqueueOutcome =
  | { transport: 'qstash'; messageId: string }
  | { transport: 'inline'; outcome: string }

function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (!url) throw new Error('Missing required env: NEXT_PUBLIC_APP_URL')
  return url.replace(/\/$/, '')
}

/**
 * Publishes a job to QStash, or runs it inline when QStash is not configured.
 * `runInline` is injected rather than imported to keep this module free of the
 * indexer's Supabase dependency (and trivially testable).
 */
export async function enqueueSearchIndexJob(
  job: SearchIndexJob,
  runInline: (job: SearchIndexJob) => Promise<string>,
): Promise<EnqueueOutcome> {
  const token = process.env.QSTASH_TOKEN
  if (!token) {
    return { transport: 'inline', outcome: await runInline(job) }
  }

  const target = `${appUrl()}/api/search/index-job`
  const res = await fetch(`${QSTASH_URL}/v2/publish/${target}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Upstash-Retries': String(QSTASH_RETRIES),
      'Upstash-Failure-Callback': `${appUrl()}/api/search/index-dlq`,
      // One logical change per product may fire many times in a burst (bulk
      // edits); dedup on content so the queue collapses identical jobs.
      'Upstash-Deduplication-Id': `${job.op}:${job.productId}:${job.enqueuedAt}`,
    },
    body: JSON.stringify(job),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`qstash publish failed: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as { messageId?: string }
  return { transport: 'qstash', messageId: data.messageId ?? 'unknown' }
}

function base64UrlDecode(segment: string): Buffer {
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

type QstashClaims = {
  iss?: string
  sub?: string
  exp?: number
  nbf?: number
  body?: string
}

function verifyWithKey(token: string, key: string, rawBody: string, url: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

  const expected = createHmac('sha256', key).update(`${headerB64}.${payloadB64}`).digest()
  if (!constantTimeEqual(expected, base64UrlDecode(signatureB64))) return false

  let claims: QstashClaims
  try {
    claims = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as QstashClaims
  } catch {
    return false
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (claims.iss !== 'Upstash') return false
  if (claims.sub !== url) return false
  if (typeof claims.exp !== 'number' || claims.exp < nowSeconds) return false
  if (typeof claims.nbf === 'number' && claims.nbf > nowSeconds) return false

  // The claim binds the JWS to this exact body: base64url(sha256(body)).
  const bodyHash = createHash('sha256').update(rawBody).digest('base64url')
  if (typeof claims.body !== 'string') return false
  return constantTimeEqual(Buffer.from(claims.body), Buffer.from(bodyHash))
}

/**
 * Verifies an `Upstash-Signature` header against the two rotating signing
 * keys. Returns false (never throws) so callers can answer 401 uniformly.
 */
export function verifyQstashSignature(
  signature: string | null,
  rawBody: string,
  url: string,
): boolean {
  if (!signature) return false
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY
  const next = process.env.QSTASH_NEXT_SIGNING_KEY
  if (!current && !next) return false
  try {
    return (
      (Boolean(current) && verifyWithKey(signature, current as string, rawBody, url)) ||
      (Boolean(next) && verifyWithKey(signature, next as string, rawBody, url))
    )
  } catch {
    return false
  }
}
