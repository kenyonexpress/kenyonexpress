// Supabase access for the import pipeline.
//
// Reads are always allowed: validation needs before/after counts and the
// loader needs to know whether a row already exists. Writes go through
// upsertRows(), which refuses to touch the database in a dry run. There is no
// other write path in this pipeline.

import { createClient } from '@supabase/supabase-js'
import { DRY_RUN, SUPABASE, dryRunReason } from '../config.mjs'
import { externalId, warn } from './log.mjs'

let client
let warned = false

/**
 * Service-role client, or null when credentials are absent. A null client is
 * not an error: the pipeline then runs fully offline against the JSON
 * artifacts, which is the normal mode for authoring and reviewing a plan.
 */
export function getDb() {
  if (client !== undefined) return client
  if (!SUPABASE.url || !SUPABASE.serviceKey) {
    if (!warned) {
      warn('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set - running offline (no DB reads)')
      warned = true
    }
    client = null
    return client
  }
  client = createClient(SUPABASE.url, SUPABASE.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  })
  return client
}

/** Throws unless both write locks are open. Call before any mutation. */
export function assertWritable() {
  if (DRY_RUN) {
    throw new Error(`refusing to write: dry run (${dryRunReason()})`)
  }
}

/**
 * Idempotent upsert keyed on a natural conflict target.
 *
 * Returns a per-row plan of {wpId, externalId, action, targetId}. In a dry run
 * the plan is computed from a SELECT of the existing keys and nothing is
 * written; with both locks open the same plan is computed and then applied, so
 * the dry-run output is the literal preview of the real run.
 */
export async function upsertRows({
  db,
  schema = 'wp_import',
  table,
  rows,
  conflictColumn,
  entity,
  wpIdColumn = conflictColumn,
}) {
  if (rows.length === 0) return []

  const keys = rows.map((r) => r[conflictColumn])
  const existing = new Set()

  if (db) {
    // chunked IN(...) so a 40k-product run does not build one giant URL
    for (let i = 0; i < keys.length; i += 500) {
      const slice = keys.slice(i, i + 500)
      const { data, error } = await db
        .schema(schema)
        .from(table)
        .select(conflictColumn)
        .in(conflictColumn, slice)
      if (error) throw new Error(`${schema}.${table} key probe failed: ${error.message}`)
      for (const row of data) existing.add(String(row[conflictColumn]))
    }
  }

  const plan = rows.map((row) => ({
    wpId: row[wpIdColumn],
    externalId: externalId(entity, row[wpIdColumn]),
    action: existing.has(String(row[conflictColumn])) ? 'update' : 'insert',
    targetTable: `${schema}.${table}`,
    targetId: null,
  }))

  if (DRY_RUN || !db) return plan

  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500)
    const { error } = await db
      .schema(schema)
      .from(table)
      .upsert(slice, { onConflict: conflictColumn, ignoreDuplicates: false })
    if (error) throw new Error(`${schema}.${table} upsert failed: ${error.message}`)
  }
  return plan
}

/**
 * Resolve or mint the uuid a wp entity projects onto, through wp_import.id_map.
 *
 * This is the reason a re-run never duplicates: the uuid is decided once, on
 * first sight, and every later run reads it back. In a dry run the mapping is
 * held in memory only, so the preview still shows stable per-run uuids without
 * persisting anything.
 */
export async function resolveIdMap({ db, entity, wpIds, cache = new Map() }) {
  const missing = wpIds.filter((id) => !cache.has(String(id)))
  if (db && missing.length > 0) {
    for (let i = 0; i < missing.length; i += 500) {
      const slice = missing.slice(i, i + 500).map(String)
      const { data, error } = await db
        .schema('wp_import')
        .from('id_map')
        .select('wp_id, new_id')
        .eq('entity', entity)
        .in('wp_id', slice)
      if (error) throw new Error(`id_map lookup failed: ${error.message}`)
      for (const row of data) cache.set(String(row.wp_id), { newId: row.new_id, existing: true })
    }
  }
  const out = new Map()
  for (const wpId of wpIds) {
    const key = String(wpId)
    if (!cache.has(key)) cache.set(key, { newId: crypto.randomUUID(), existing: false })
    out.set(key, cache.get(key))
  }
  return out
}

/** Row count of a table, or null when offline. Used for before/after gates. */
export async function countRows(db, schema, table, filter = null) {
  if (!db) return null
  let query = db.schema(schema).from(table).select('*', { count: 'exact', head: true })
  if (filter) query = filter(query)
  const { count, error } = await query
  if (error) throw new Error(`${schema}.${table} count failed: ${error.message}`)
  return count
}
