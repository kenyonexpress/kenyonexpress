import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SOFT_DELETE_LIVE_TABLES, SOFT_DELETE_PENDING_TABLES, excludeDeleted } from './soft-delete'

/**
 * THE SPLIT BETWEEN "FILTER NOW" AND "FILTER AFTER THE MIGRATION" MUST NOT DRIFT.
 *
 * `excludeDeleted` filters on a column, and 42703 on a missing column fails
 * the WHOLE query, not just the field (see optional-columns.ts). So the
 * pending list being wrong in either direction is a production incident:
 * a table listed as live too early 42703s every call site, and a table left
 * pending after its column exists silently serves deleted rows to the
 * service role. Three anchors below:
 *
 *   1. behaviour of the helper itself,
 *   2. every table migration 185 alters is now LIVE, not pending,
 *   3. both lists against src/types/database.ts, which mirrors production.
 *
 * 185 WAS APPLIED 2026-09-09 and anchor 3 did exactly what it was built to
 * do: it went red the moment the types were regenerated, and the fix was the
 * designed one -- move the four names into the live list. Anchor 2 used to
 * assert "the pending list names exactly what 185 alters"; now that the
 * migration is applied it asserts the inverse, so the four cannot silently
 * fall back to being no-ops.
 */

/** A recording stand-in for the Supabase filter builder. */
function fakeQuery() {
  const calls: [string, unknown][] = []
  const query = {
    calls,
    is(column: string, value: unknown) {
      calls.push([column, value])
      return query
    },
  }
  return query
}

// Applied files move directories; resolve like status-transitions.test.ts does.
// Renumbered 149 -> 185 on 2026-09-09: production had already spent 149 on
// `149_audit_log_append_only`. Both directories are still searched because an
// applied file moves out of `pending/`.
const MIGRATION_CANDIDATES = [
  'migrations/pending/185_soft_delete_user_facing_remainder.sql',
  'migrations/applied/185_soft_delete_user_facing_remainder.sql',
  'supabase/migrations/185_soft_delete_user_facing_remainder.sql',
]

function migration149(): string {
  for (const candidate of MIGRATION_CANDIDATES) {
    const path = resolve(process.cwd(), candidate)
    if (existsSync(path)) return readFileSync(path, 'utf8')
  }
  throw new Error('185_soft_delete_user_facing_remainder.sql found in none of the three locations')
}

/** Null when the table has no generated type at all (reviews, wishlists). */
function generatedRowBlock(table: string): string | null {
  const types = readFileSync(resolve(process.cwd(), 'src/types/database.ts'), 'utf8')
  const match = types.match(new RegExp(`\\n      ${table}: \\{\\n        Row: \\{([^}]*)\\}`))
  return match?.[1] ?? null
}

describe('excludeDeleted', () => {
  it('appends deleted_at is null for every live table', () => {
    for (const table of SOFT_DELETE_LIVE_TABLES) {
      const query = fakeQuery()
      const result = excludeDeleted(query, table)
      expect(result).toBe(query)
      expect(query.calls, table).toEqual([['deleted_at', null]])
    }
  })

  it('is a no-op for every pending table, so no call site can 42703', () => {
    for (const table of SOFT_DELETE_PENDING_TABLES) {
      const query = fakeQuery()
      const result = excludeDeleted(query, table)
      expect(result).toBe(query)
      expect(query.calls, table).toEqual([])
    }
  })

  it('keeps the two lists disjoint', () => {
    const live = new Set<string>(SOFT_DELETE_LIVE_TABLES)
    const overlap = SOFT_DELETE_PENDING_TABLES.filter((t) => live.has(t))
    expect(overlap).toEqual([])
  })
})

function tablesAlteredBy185(): string[] {
  return [
    ...migration149().matchAll(
      /alter table public\.(\w+) add column if not exists deleted_at timestamptz/g,
    ),
  ]
    .flatMap((m) => (m[1] ? [m[1]] : []))
    .sort()
}

describe('migration 185 against the live list', () => {
  it('has every table it alters in the live list, so the filter is on', () => {
    const live = new Set<string>(SOFT_DELETE_LIVE_TABLES)
    const altered = tablesAlteredBy185()
    expect(altered.length).toBeGreaterThan(0)
    for (const table of altered) {
      expect(live.has(table), `${table} is altered by 185 but is not in the live list`).toBe(true)
    }
  })

  it('leaves none of them pending, which would silently serve deleted rows', () => {
    const pending = new Set<string>(SOFT_DELETE_PENDING_TABLES)
    for (const table of tablesAlteredBy185()) {
      expect(pending.has(table), `${table} is applied but still listed pending`).toBe(false)
    }
  })

  it('gives each of them the house partial index', () => {
    const sql = migration149()
    for (const table of tablesAlteredBy185()) {
      expect(sql, table).toContain(`create index if not exists ${table}_deleted_at_idx`)
    }
  })
})

describe('both lists against the generated production types', () => {
  it('every live table carries deleted_at in production', () => {
    for (const table of SOFT_DELETE_LIVE_TABLES) {
      expect(generatedRowBlock(table) ?? '', table).toContain('deleted_at')
    }
  })

  it('every pending table still lacks it; when this fails, its migration was applied: move the table to the live list', () => {
    for (const table of SOFT_DELETE_PENDING_TABLES) {
      // Absent from the generated types entirely proves the same thing as
      // present-without-deleted_at. Vacuous while the pending list is empty,
      // and kept for the next migration that needs to sit in it.
      expect(generatedRowBlock(table) ?? '', table).not.toContain('deleted_at')
    }
  })
})
