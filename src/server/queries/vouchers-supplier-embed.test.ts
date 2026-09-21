import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * `vouchers` carries two foreign keys to `suppliers`: `supplier_id` (who sold
 * it) and `redeemed_by_supplier_id` (who scanned it, added later). PostgREST
 * refuses an unhinted `suppliers(...)` embed on such a table with PGRST201,
 * "could not embed because more than one relationship was found".
 *
 * Measured on the 2026-09-21 go-live dry run against production: every load of
 * the customer's coupon list logged `voucher.customer_list_read_failed` with
 * PGRST201, and the page showed the customer nothing. Nothing in the unit
 * suite could see it, because the ambiguity only exists in the database. This
 * test pins the hint in the source, so the next FK to suppliers cannot silently
 * empty the coupon page again.
 */
const FILES = [
  'src/server/queries/vouchers.ts',
  'src/app/(admin)/admin/coupons/codes/page.tsx',
  'src/app/(admin)/admin/coupons/codes/[id]/page.tsx',
]

describe('supplier embeds on vouchers name their foreign key', () => {
  for (const file of FILES) {
    it(file, () => {
      const source = readFileSync(file, 'utf8')
      const embeds = source.match(/suppliers(![\w]+)?\(/g) ?? []
      expect(embeds.length, `${file} embeds suppliers somewhere`).toBeGreaterThan(0)
      for (const embed of embeds) {
        expect(embed, `${file}: ${embed}`).toBe('suppliers!vouchers_supplier_id_fkey(')
      }
    })
  }
})
