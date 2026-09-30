import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `/voucher/[id]` (STEP 14) is the merchant's door onto a voucher's state
 * without a camera, and a door is only as good as its lock and its listing.
 * Server pages are not rendered in this suite (see overview.test.ts), so
 * this reads the sources for what would each fail silently:
 *
 *   1. the proxy bounces a signed-out visitor before the page runs;
 *   2. robots.txt keeps the path out of the index, and the page says noindex;
 *   3. the page renders the SAME confirm component as /redeem/[token], so the
 *      two doors cannot drift, and that component burns by code when it has
 *      no token instead of posting an empty qr_payload;
 *   4. the page decides nothing: no rpc call, no update, only reads and the
 *      confirm step's button;
 *   5. a miss is recorded, like every other refused entry.
 */

const root = process.cwd()
const read = (rel: string) =>
  readFileSync(join(root, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const page = read('src/app/voucher/[id]/page.tsx')

describe('/voucher/[id]', () => {
  it('is behind the session check in the proxy', () => {
    const proxy = read('src/proxy.ts')
    const needsAuth = proxy.slice(proxy.indexOf('const needsAuth'), proxy.indexOf('if (needsAuth'))
    expect(needsAuth).toContain("pathname.startsWith('/voucher/')")
  })

  it('is disallowed for crawlers and marked noindex', () => {
    expect(read('src/app/robots.ts')).toContain("'/voucher/'")
    expect(page).toContain('index: false')
  })

  it('renders the same confirm step as the scanned-QR page', () => {
    expect(page).toContain("from '../../redeem/[token]/RedeemConfirm'")
    expect(read('src/app/redeem/[token]/page.tsx')).toContain("from './RedeemConfirm'")
    expect(page).toContain('<RedeemConfirm')
    // No token on this door: the confirm step must burn by code.
    expect(page).not.toContain('token={')
  })

  it('burns by code when it has no token, and by token when it has one', () => {
    const confirm = read('src/app/redeem/[token]/RedeemConfirm.tsx')
    expect(confirm).toContain('token?: string')
    expect(confirm).toContain(
      "{ code: props.code, method: 'manual', idempotency_key: idempotencyKey }",
    )
    expect(confirm).toContain(
      "{ qr_payload: props.token, method: 'camera', idempotency_key: idempotencyKey }",
    )
  })

  it('accepts an id, a code or an 8-digit fallback, and resolves through the one resolver', () => {
    expect(page).toContain('isVoucherId(segment)')
    expect(page).toContain('getVoucherForRedemptionById(segment, memberships)')
    expect(page).toMatch(
      /resolveEnteredVoucherCode\(\s*segment,\s*\(\) => createAdminClient\(\) as never,?\s*\)/,
    )
  })

  it('decides nothing itself: no RPC and no write from the page', () => {
    expect(page).not.toMatch(/\.rpc\(/)
    expect(page).not.toMatch(/\.update\(/)
    expect(page).not.toMatch(/\.insert\(/)
  })

  it('records a miss and rate limits by address, like /redeem/[token]', () => {
    expect(page).toContain("outcome: 'not_found'")
    expect(page).toContain('checkRateLimit(`voucher-page:${scanContext.ip}`, 60, 3600)')
  })

  it('sends a signed-out visitor to login and back to the same voucher', () => {
    expect(page).toContain('redirect(`/login?next=${encodeURIComponent(`/voucher/${')
  })
})
