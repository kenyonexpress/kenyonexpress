import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PURGED_ROWS } from '@/lib/account/deletion'
import { describe, expect, it } from 'vitest'

/**
 * Pins what migration 247 promises about private order feedback, the way
 * reviews-moderation-migration-guards.test.ts pins 232. The whole feature
 * rests on "never public", and that is a property of the SQL: no anon grant,
 * no policy naming anon, no UPDATE or DELETE for the customer, and an INSERT
 * that re-checks the order is the caller's paid one. The self-check block at
 * the end of the file raises on the first three at apply time; this test
 * keeps the checked-in text honest before then.
 */

function resolveMigration(name: string): string {
  for (const dir of ['migrations/applied', 'migrations/pending', 'supabase/migrations']) {
    const full = join(process.cwd(), dir, name)
    if (existsSync(full)) return full
  }
  throw new Error(
    `${name} is in none of migrations/applied, migrations/pending, supabase/migrations`,
  )
}

const SQL = readFileSync(resolveMigration('247_order_feedback.sql'), 'utf8')
const CODE = SQL.replace(/^\s*--.*$/gm, '')

describe('migration 247 (order_feedback)', () => {
  it('creates the table once per order with a bounded score and text', () => {
    expect(CODE).toContain('CREATE TABLE IF NOT EXISTS public.order_feedback')
    expect(CODE).toMatch(/rating\s+smallint\s+NOT NULL CHECK \(rating BETWEEN 1 AND 5\)/)
    expect(CODE).toMatch(/length\(body\) BETWEEN 1 AND 2000/)
    expect(CODE).toContain('UNIQUE (order_id)')
    expect(CODE).toContain('REFERENCES public.orders(id) ON DELETE CASCADE')
    expect(CODE).toContain('REFERENCES public.profiles(id) ON DELETE CASCADE')
  })

  it('turns RLS on and grants the customer SELECT and INSERT only', () => {
    expect(CODE).toContain('ALTER TABLE public.order_feedback ENABLE ROW LEVEL SECURITY')
    expect(CODE).toContain('REVOKE ALL ON public.order_feedback FROM PUBLIC, anon, authenticated')
    expect(CODE).toMatch(/GRANT SELECT, INSERT ON public\.order_feedback TO authenticated;/)
    expect(CODE).not.toMatch(/GRANT[^;]*\b(UPDATE|DELETE)\b[^;]*order_feedback/)
    expect(CODE).not.toMatch(/GRANT[^;]*order_feedback[^;]*TO anon/)
  })

  it('never names anon in a policy and gives the customer no UPDATE or DELETE policy', () => {
    const policies = [
      ...CODE.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.order_feedback FOR (\w+) TO (\w+)/g),
    ]
    expect(policies.map((m) => [m[2], m[3]])).toEqual([
      ['SELECT', 'authenticated'],
      ['INSERT', 'authenticated'],
    ])
    expect(CODE).not.toMatch(/TO anon/)
    expect(CODE).not.toMatch(/TO public\b/i)
  })

  it('scopes the read to the owner and the insert to the owner of a paid, live order', () => {
    const select = CODE.match(/CREATE POLICY "order_feedback_owner_select"[\s\S]*?;/)?.[0] ?? ''
    expect(select).toContain('USING (user_id = (SELECT auth.uid()))')

    const insert =
      CODE.match(/CREATE POLICY "order_feedback_owner_insert_paid"[\s\S]*?\);\s*\n/)?.[0] ?? ''
    expect(insert).toContain('user_id = (SELECT auth.uid())')
    expect(insert).toContain('o.user_id = (SELECT auth.uid())')
    expect(insert).toContain('o.paid_at IS NOT NULL')
    expect(insert).toContain('o.deleted_at IS NULL')
  })

  it('checks its own promises at apply time', () => {
    expect(CODE).toContain("has_table_privilege('anon', 'public.order_feedback', 'SELECT')")
    expect(CODE).toContain(
      "has_table_privilege('authenticated', 'public.order_feedback', 'UPDATE')",
    )
    expect(CODE).toContain(
      "has_table_privilege('authenticated', 'public.order_feedback', 'DELETE')",
    )
    expect(CODE).toContain("'anon' = ANY (roles)")
  })

  it('is idempotent and wrapped in one transaction', () => {
    expect(CODE.trim().startsWith('BEGIN;')).toBe(true)
    expect(CODE.trim().endsWith('COMMIT;')).toBe(true)
    expect(CODE).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/)
    expect(CODE).not.toMatch(/CREATE INDEX (?!IF NOT EXISTS)/)
    expect((CODE.match(/CREATE POLICY/g) ?? []).length).toBe(
      (CODE.match(/DROP POLICY IF EXISTS/g) ?? []).length,
    )
  })
})

describe('the account purge', () => {
  it("erases a customer's order feedback with the account, by user_id", () => {
    expect(PURGED_ROWS).toContainEqual({ table: 'order_feedback', column: 'user_id' })
  })
})
