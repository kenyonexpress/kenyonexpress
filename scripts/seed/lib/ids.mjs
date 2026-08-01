// scripts/seed/lib/ids.mjs
//
// Deterministic identifiers.
//
// Every row this seed writes gets a UUID derived from a stable string key
// rather than from gen_random_uuid(). Two consequences the seed depends on:
//
//   1. Re-running the seed against the same database updates the same rows
//      instead of appending a second copy of the catalog. The steps can then
//      use ON CONFLICT (id) DO UPDATE and stay idempotent without needing a
//      natural key on every table (order_items has none).
//   2. A test or a screenshot can hard-code an id. seedId('product', 'pizza-01')
//      is the same UUID on every machine and in every rebuild.
//
// UUID v5 (SHA-1, RFC 4122 section 4.3) is used because it is the standard
// name-based scheme and needs nothing beyond node:crypto. The namespace below
// is a fixed random v4 UUID minted once for this seed; it is not a secret and
// it must never change, because changing it renames every row.

import { createHash } from 'node:crypto'

/** Fixed namespace for all seed-generated identifiers. Never change this. */
export const SEED_NAMESPACE = '6f1a1d64-3f5c-4b0e-9a4b-2e0a7c1d8b55'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuidToBytes(uuid) {
  if (!UUID_PATTERN.test(uuid)) throw new TypeError(`not a uuid: ${uuid}`)
  return Buffer.from(uuid.replace(/-/g, ''), 'hex')
}

function bytesToUuid(bytes) {
  const hex = Buffer.from(bytes).toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/** RFC 4122 v5: SHA-1 over namespace bytes + name, with version/variant bits set. */
export function uuidV5(name, namespace = SEED_NAMESPACE) {
  const hash = createHash('sha1')
  hash.update(uuidToBytes(namespace))
  hash.update(Buffer.from(name, 'utf8'))
  const bytes = hash.digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  return bytesToUuid(bytes)
}

/**
 * The id of one seeded row. `kind` is the entity ("product", "supplier",
 * "order-item"), `key` its stable business key within that kind. The kind is
 * part of the hash so a supplier and a product may share a slug without
 * colliding.
 */
export function seedId(kind, key) {
  return uuidV5(`ke-seed:${kind}:${key}`)
}
