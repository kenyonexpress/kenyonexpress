import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `vouchers` points at `suppliers` twice (`supplier_id` and
 * `redeemed_by_supplier_id`), so a bare `suppliers(...)` embed on a vouchers
 * select is PGRST201 ("more than one relationship was found") on EVERY row,
 * never a result. The reads that throw on it take the whole page down:
 * measured 2026-10-21, /account/coupons rendered "משהו השתבש אצלנו" for the
 * fixture customer the moment it held a voucher, from `getCustomerVouchers`.
 * The 2026-10-05 and 2026-10-14 fixes had each landed on another branch and
 * not here, which is what this test is for: it reads the sources, so the fake
 * Supabase builders in the unit tests (which never see PostgREST) cannot hide
 * a regression.
 */
const FILES = [
  'src/server/queries/vouchers.ts',
  'src/server/payments/voucher-email.ts',
  'src/server/actions/gifts.ts',
  'src/server/actions/admin/vouchers.ts',
  'src/app/(admin)/admin/coupons/codes/[id]/page.tsx',
  'src/app/(admin)/admin/coupons/codes/page.tsx',
]

const HINT = 'suppliers!vouchers_supplier_id_fkey('

describe('supplier embeds on vouchers reads', () => {
  for (const file of FILES) {
    it(`${file} hints every suppliers embed with the supplier_id foreign key`, () => {
      // process.cwd(), not import.meta.url: jsdom rewrites the latter.
      const source = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
      const bare = source.match(/(?<!!vouchers_supplier_id_fkey)\bsuppliers\(/g) ?? []
      const hinted = source.split(HINT).length - 1
      expect(hinted, `${file} reads vouchers and embeds suppliers`).toBeGreaterThan(0)
      expect(bare, `bare suppliers( embeds in ${file}`).toHaveLength(0)
    })
  }
})
