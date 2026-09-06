import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SOFT_DELETE_LIVE_TABLES, SOFT_DELETE_PENDING_TABLES, excludeDeleted } from './soft-delete'

/**
 * THE SPLIT BETWEEN "FILTER NOW" AND "FILTER AFTER 149" MUST NOT DRIFT.
 *
 * `excludeDeleted` filters on a column, and 42703 on a missing column fails
 * the WHOLE query, not just the field (see optional-columns.ts). So the
 * pending list being wrong in either direction is a production incident:
 * a table listed as live too early 42703s every call site, and a table left
 * pending after its column exists silently serves deleted rows to the
 * service role. Three anchors below:
 *
 *   1. behaviour of the helper itself,
 *   2. the pending list against what migration 149 actually alters,
 *   3. both lists against src/types/database.ts, which mirrors production.
 *      When 149 is applied and the types are regenerated, anchor 3 fails on
 *      purpose, and the fix is the designed one: move the four names into
 *      the live list.
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
const MIGRATION_CANDIDATES = [
  'migrations/pending/149_soft_delete_user_facing_remainder.sql',
  'supabase/migrations/149_soft_delete_user_facing_remainder.sql',
]

function migration149(): string {
  for (const candidate of MIGRATION_CANDIDATES) {
    const path = resolve(process.cwd(), candidate)
    if (existsSync(path)) return readFileSync(path, 'utf8')
  }
  throw new Error('149_soft_delete_user_facing_remainder.sql found in neither location')
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

describe('the pending list against migration 149', () => {
  it('names exactly the tables 149 adds deleted_at to', () => {
    const altered = [
      ...migration149().matchAll(
        /alter table public\.(\w+) add column if not exists deleted_at timestamptz/g,
      ),
    ]
      .map((m) => m[1])
      .sort()
    expect(altered).toEqual([...SOFT_DELETE_PENDING_TABLES].sort())
  })

  it('gives each of them the house partial index', () => {
    const sql = migration149()
    for (const table of SOFT_DELETE_PENDING_TABLES) {
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

  it('every pending table still lacks it; when this fails, 149 was applied: move the table to the live list', () => {
    for (const table of SOFT_DELETE_PENDING_TABLES) {
      // Absent from the generated types entirely (reviews, wishlists as of
      // 2026-09-04) proves the same thing as present-without-deleted_at.
      expect(generatedRowBlock(table) ?? '', table).not.toContain('deleted_at')
    }
  })
})
