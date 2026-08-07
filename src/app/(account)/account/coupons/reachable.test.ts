import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The customer must be able to reach their own QR from inside the account area.
 *
 * They could not. Two lists read the `vouchers` table: /account/coupons, which
 * printed the code as text, and /account/vouchers, which linked each row to
 * /coupon/[id]. The nav and the overview card both pointed at the first one, so
 * the only routes to the presentable coupon page were the checkout confirmation
 * and the issue email. Close either and the QR was gone.
 *
 * Server components are what broke, and they are not renderable in this suite,
 * so these read the routes as source. That is enough for the thing that was
 * actually wrong: which URLs the account area links to.
 */

const APP = join(process.cwd(), 'src/app')
const COUPONS_PAGE = join(APP, '(account)/account/coupons/page.tsx')
const NAV = join(process.cwd(), 'src/components/account/AccountNav.tsx')
const OVERVIEW = join(APP, '(account)/account/page.tsx')

function read(file: string): string {
  return readFileSync(file, 'utf8')
}

/** Comments explain the old links; only real code should satisfy these. */
function code(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function pageFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...pageFiles(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

describe('the account route to a coupon QR', () => {
  it('links every coupon row to its presentable page', () => {
    expect(code(COUPONS_PAGE)).toMatch(/href=\{`\/coupon\/\$\{voucher\.id\}`\}/)
  })

  it('is the page the nav and the overview actually point at', () => {
    expect(code(NAV)).toContain("href: '/account/coupons'")
    expect(code(OVERVIEW)).toContain('href="/account/coupons"')
  })

  it('reads the query that carries the voucher id, since /coupon/[id] needs it', () => {
    // getMyCoupons selected no id, which is why the page it backed could not
    // link anywhere even in principle.
    expect(code(COUPONS_PAGE)).toContain('getCustomerVouchers')
    expect(code(COUPONS_PAGE)).not.toContain('getMyCoupons')
  })

  it('presents status through the module the counter uses', () => {
    expect(code(COUPONS_PAGE)).toContain('couponStatusView')
    expect(code(COUPONS_PAGE)).not.toContain('couponStatusLabel')
  })
})

describe('the second list', () => {
  it('is gone, and its address redirects rather than 404s', () => {
    const vouchers = code(join(APP, '(account)/account/vouchers/page.tsx'))
    expect(vouchers).toContain("permanentRedirect('/account/coupons')")
    expect(vouchers).not.toContain('getCustomerVouchers')
  })

  it('is linked from nowhere in the app, so nothing takes the redirect hop', () => {
    const offenders = pageFiles(APP)
      .filter((file) => !file.includes(join('account', 'vouchers')))
      .filter((file) => /['"`]\/account\/vouchers['"`]/.test(code(file)))
      .map((file) => relative(process.cwd(), file))

    expect(offenders).toEqual([])
  })
})
