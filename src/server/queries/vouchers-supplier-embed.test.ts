import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every `vouchers` read that embeds the supplier names the foreign key.
 *
 * `vouchers` points at `suppliers` twice (`supplier_id`, the issuer, and
 * `redeemed_by_supplier_id`). PostgREST answers a bare `suppliers(name)` with
 * PGRST201 ("more than one relationship was found") for EVERY row, never a
 * result, and the fake builders in the unit tests never see PostgREST, so only
 * a browser against the database shows it.
 *
 * MEASURED 2026-10-14 (UX18, logs/ux18/before.json and the server log): the
 * account overview, which reads `getCustomerVouchers()` for the coupons tile,
 * rendered "משהו השתבש אצלנו" for the signed-in customer at every width,
 * because `voucherReadOrFail` (rightly) throws on that error. The same bare
 * embed sat in the voucher email, the gift preview and the admin lookup.
 *
 * This reads the four files as source, the way overview.test.ts does, and
 * fails on any `suppliers(` on a vouchers select that lacks the hint.
 */
const FILES = [
  'src/server/queries/vouchers.ts',
  'src/server/payments/voucher-email.ts',
  'src/server/actions/gifts.ts',
  'src/server/actions/admin/vouchers.ts',
]

const HINT = 'suppliers!vouchers_supplier_id_fkey('

function code(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('vouchers -> suppliers embeds', () => {
  it.each(FILES)('%s names the issuing supplier foreign key on every embed', (rel) => {
    const src = code(rel)
    expect(src).toContain(HINT)
    // A `suppliers(` that is not immediately preceded by the hint's `!fk` part.
    const bare = src.match(/(?<!_fkey)suppliers\(/g) ?? []
    expect(bare, `bare suppliers( embed in ${rel}`).toEqual([])
  })
})
