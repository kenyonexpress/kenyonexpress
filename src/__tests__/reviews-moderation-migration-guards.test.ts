import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE PROPERTIES 232 MUST NOT LOSE ON A REWRITE.
 *
 * `232_reviews_admin_moderation_only.sql` is the closing of the review model:
 * reviews are collected from verified buyers and read by the admin, never
 * displayed and never supplier-edited. Applied 2026-09-10
 * (`reviews_admin_moderation_only_232`) with the holes proven live first --
 * anon SELECT returned rows and an authenticated UPDATE of supplier_reply was
 * permitted before, both 42501 after. What this pins is the shape of the
 * file, so a later edit cannot quietly re-open a path:
 *
 * 1. THE COLUMN GRANT, BY NAME. 199's UPDATE grant was per-column, which
 *    means it never appears in role_table_grants -- the audit surface people
 *    actually read. A table-level `REVOKE UPDATE` alone would look complete
 *    and leave the three reply columns writable, so the file must keep the
 *    column-list revoke naming all three.
 *
 * 2. BOTH POLICIES GO, AND ONLY THOSE TWO. `reviews_supplier_reply` and
 *    `reviews_public_read_approved` are the doors 232 closes. The three
 *    owner policies from 154 are the doors that must stay: they are what
 *    "owner-only" means for the remaining INSERT / SELECT / DELETE grants.
 *
 * 3. THE ANON READ. No public display means the anon role holds nothing on
 *    reviews at all; the code half of the same decision is that
 *    src/server/queries/reviews.ts exports no reader (its doc says why).
 */

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/pending/232_reviews_admin_moderation_only.sql'),
  'utf8',
)

describe('232_reviews_admin_moderation_only.sql', () => {
  it('revokes the reply UPDATE per column, naming all three', () => {
    expect(sql).toMatch(
      /REVOKE UPDATE \(supplier_reply, supplier_replied_at, supplier_replied_by\)\s*\n\s*ON public\.reviews FROM authenticated, anon, PUBLIC;/,
    )
    // The table-level revoke is the belt on top, not a substitute.
    expect(sql).toMatch(/REVOKE UPDATE ON TABLE public\.reviews FROM authenticated, anon, PUBLIC;/)
  })

  it('drops exactly the two policies that contradicted the model', () => {
    const dropped = [...sql.matchAll(/DROP POLICY IF EXISTS "([a-z_]+)"/g)].map((m) => m[1]).sort()
    expect(dropped).toEqual(['reviews_public_read_approved', 'reviews_supplier_reply'])
  })

  it('revokes the anonymous read and touches nothing else anon had', () => {
    expect(sql).toMatch(/REVOKE SELECT ON TABLE public\.reviews FROM anon;/)
  })

  it('leaves the owner policies and the data alone', () => {
    // "Owner-only edit" is carried by 154's policies; 232 must not restate or
    // remove them (the prose may name them, DDL may not), and it is a
    // grants-and-policies change, not a data one.
    expect(sql).not.toMatch(/(DROP|CREATE|ALTER) POLICY[^;]*reviews_owner_/)
    expect(sql).not.toMatch(/DROP COLUMN|DROP TABLE|DELETE FROM|TRUNCATE/i)
  })

  it('keeps the code half honest: the queries module is a tombstone', () => {
    // The doc may say the old reader's name; runnable code may not exist. The
    // module must export nothing but the empty marker that keeps it a module.
    const queries = readFileSync(resolve(process.cwd(), 'src/server/queries/reviews.ts'), 'utf8')
    const code = queries.replaceAll(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/createPublicClient|from\(/)
    expect(code.match(/export/g)).toEqual(['export'])
    expect(code).toMatch(/export \{\}/)
  })
})
