/**
 * Generic server-side idempotency (module 3/9). Server-only.
 *
 * Backed by the `idempotency_keys` table (migration 052): UNIQUE (scope, key),
 * a `response_hash` for replay comparison, and `expires_at` for cleanup. This
 * complements the dedicated keys already on payments / ledger / wallet /
 * webhook events; use it for server operations that need replay safety but do
 * not have a natural unique column of their own.
 *
 * Contract:
 *   1. `claim` inserts (scope, key). The FIRST caller wins ('claimed'); any
 *      concurrent/later caller sees 'exists' (ON CONFLICT DO NOTHING).
 *   2. The winner runs the work, then `record`s a hash of its response.
 *   3. A replayer reads the recorded hash and can short-circuit, and can verify
 *      that a re-computed response matches what was returned the first time.
 *
 * Key generation is deterministic and pure so the same logical operation always
 * maps to the same key (e.g. `lp:<clientRef>`, `order:<id>:cashback`).
 */

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// --- pure core (unit-testable, no DB) --------------------------------------

/** A colon-joined key; each part is trimmed and must be non-empty. */
export function makeIdempotencyKey(scope: string, ...parts: (string | number)[]): string {
  if (!scope || scope.length === 0) {
    throw new TypeError('idempotency scope is required')
  }
  const rendered = parts.map((p) => {
    const s = String(p).trim()
    if (s.length === 0) {
      throw new TypeError('idempotency key parts must be non-empty')
    }
    return s
  })
  return [scope, ...rendered].join(':')
}

/**
 * Canonical JSON: object keys sorted recursively so that two logically-equal
 * responses hash identically regardless of key order. Rejects non-finite
 * numbers so no float NaN/Infinity can slip into a money response hash.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('cannot canonicalize a non-finite number')
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k])
    }
    return out
  }
  return value
}

/** Stable SHA-256 of a response payload, for replay equality checks. */
export function hashResponse(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

// --- DB dedupe (service-role) ----------------------------------------------

export type ClaimResult = 'claimed' | 'exists'

/**
 * Try to claim (scope, key). Returns 'claimed' if this caller inserted the row
 * (it owns the work), 'exists' if the key was already present (replay).
 */
export async function claim(
  client: SupabaseClient,
  scope: string,
  key: string,
  ttlSeconds = 24 * 60 * 60,
): Promise<ClaimResult> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()
  // upsert with ignoreDuplicates => ON CONFLICT (scope, key) DO NOTHING.
  // A fresh insert returns the row; a conflict returns no rows (already claimed).
  const { data, error } = await client
    .from('idempotency_keys')
    .upsert(
      { scope, key, expires_at: expiresAt },
      { onConflict: 'scope,key', ignoreDuplicates: true },
    )
    .select('id')
  if (error) {
    throw new Error(`idempotency claim failed for ${scope}:${key}: ${error.message}`)
  }
  return Array.isArray(data) && data.length > 0 ? 'claimed' : 'exists'
}

/** Record the response hash for a claimed key. */
export async function record(
  client: SupabaseClient,
  scope: string,
  key: string,
  response: unknown,
): Promise<void> {
  const { error } = await client
    .from('idempotency_keys')
    .update({ response_hash: hashResponse(response) })
    .eq('scope', scope)
    .eq('key', key)
  if (error) {
    throw new Error(`idempotency record failed for ${scope}:${key}: ${error.message}`)
  }
}

/** Read the previously recorded response hash, or null if none yet. */
export async function getRecordedHash(
  client: SupabaseClient,
  scope: string,
  key: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('idempotency_keys')
    .select('response_hash')
    .eq('scope', scope)
    .eq('key', key)
    .maybeSingle()
  if (error) {
    throw new Error(`idempotency read failed for ${scope}:${key}: ${error.message}`)
  }
  return (data?.response_hash as string | undefined) ?? null
}

/**
 * Run `compute` at most once per (scope, key). On first call: claim, compute,
 * record, return { replayed:false, result }. On replay: return
 * { replayed:true, result:null } (caller re-reads the durable result by key).
 */
export async function withIdempotency<T>(
  client: SupabaseClient,
  scope: string,
  key: string,
  compute: () => Promise<T>,
): Promise<{ replayed: boolean; result: T | null }> {
  const claimed = await claim(client, scope, key)
  if (claimed === 'exists') {
    return { replayed: true, result: null }
  }
  const result = await compute()
  await record(client, scope, key, result)
  return { replayed: false, result }
}
