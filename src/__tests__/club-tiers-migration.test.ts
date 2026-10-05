import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CLUB_TIERS, CLUB_TIER_IDS } from '@/lib/club/tiers'
import { describe, expect, it } from 'vitest'

/**
 * Pending 251 and the code must describe the same four tiers.
 *
 * The migration seeds `club_tiers` with the thresholds `CLUB_TIERS` has carried
 * since Q15 and fixes the ids with a CHECK; the code reads those rows and
 * falls back to `CLUB_TIERS` when they are absent. If either side renames a
 * tier or moves a default, the other must move with it, or a customer's tier
 * changes on the day the file is applied for no reason anyone decided.
 */

const SQL = readFileSync(resolve(process.cwd(), 'migrations/pending/251_club_tiers.sql'), 'utf8')

/** Strip `-- ...` comments so prose about what the file does not do is not matched. */
const code = SQL.replace(/^\s*--.*$/gm, '')

describe('251_club_tiers.sql', () => {
  it('seeds exactly the compiled default thresholds, by id and rank', () => {
    const rows = [...code.matchAll(/\('(\w+)',\s*(\d+),\s*(\d+)\)/g)].map((m) => ({
      id: m[1],
      rank: Number(m[2]),
      min_agorot: Number(m[3]),
    }))
    expect(rows).toEqual(
      CLUB_TIERS.map((tier, rank) => ({ id: tier.id, rank, min_agorot: tier.minAgorot })),
    )
    expect(code).toMatch(/ON CONFLICT \(id\) DO NOTHING/)
  })

  it('fixes the ids to the ones the code knows, on the table and on the order snapshot', () => {
    const list = CLUB_TIER_IDS.map((id) => `'${id}'`).join(', ')
    const checks = [...code.matchAll(/IN \(([^)]+)\)/g)].map((m) => m[1]?.trim())
    expect(checks).toContain(list)
    // Once for club_tiers.id, once for orders.club_tier.
    expect(checks.filter((c) => c === list)).toHaveLength(2)
  })

  it('pins the floor to zero at the database too', () => {
    expect(code).toMatch(/CHECK \(\(id = 'member'\) = \(min_agorot = 0\)\)/)
  })

  it('adds the two snapshot columns to orders, as integer agorot and a bounded text', () => {
    expect(code).toMatch(/ALTER TABLE public\.orders\s+ADD COLUMN IF NOT EXISTS club_tier text/)
    expect(code).toMatch(
      /ALTER TABLE public\.orders\s+ADD COLUMN IF NOT EXISTS club_spend_agorot bigint/,
    )
    expect(code).toMatch(/club_spend_agorot IS NULL OR club_spend_agorot >= 0/)
    expect(code).not.toMatch(/numeric|double precision|real\b/)
  })

  it('is idempotent and locks the table to a read for signed-in customers only', () => {
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS public\.club_tiers/)
    expect(code).toMatch(/DROP TRIGGER IF EXISTS set_updated_at ON public\.club_tiers/)
    expect(code).toMatch(/DROP POLICY IF EXISTS club_tiers_authenticated_read/)
    expect(code).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(code).toMatch(/FOR SELECT\s+TO authenticated/)
    expect(code).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/)
    expect(code).toMatch(/REVOKE ALL ON public\.club_tiers FROM anon/)
    expect(code).toMatch(/REVOKE ALL ON public\.club_tiers FROM authenticated/)
    expect(code).toMatch(/GRANT SELECT ON public\.club_tiers TO authenticated/)
    expect(code).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)/)
    // No function is created or replaced: 244's stance, see the header.
    expect(code).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/)
  })

  it('is registered in the pending manifest and the apply order', () => {
    for (const file of ['README.md', 'APPLY-ORDER.md']) {
      const text = readFileSync(resolve(process.cwd(), 'migrations/pending', file), 'utf8')
      expect(text, file).toContain('251_club_tiers.sql')
    }
  })
})
