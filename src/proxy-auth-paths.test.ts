import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WHICH PATHS THE PROXY DEMANDS A SESSION FOR.
 *
 * The rule that matters is not "are the private pages guarded" - they are, and
 * loudly. It is the inverse: does a guard reach further than its own area. A
 * prefix test written with `startsWith` catches every path that merely begins
 * with those characters, and the failure is silent, because the page still
 * responds, just with a login form.
 *
 * That happened here. `pathname.startsWith('/supplier')` also matched
 * `/suppliers`, the PUBLIC join-us page carrying the lead form. Measured
 * against a production build, it answered 307 to /login. SiteFooter links it as
 * the one footer entry aimed at a business rather than a shopper, and
 * sitemap.ts publishes it at priority 0.7 with the comment "a business is worth
 * more than a session" - so the page whose entire job is to win new suppliers
 * turned every prospect away, and told Googlebot to log in for a URL the
 * sitemap advertises.
 *
 * Source-scanned rather than executed: the proxy needs a Supabase client, a
 * request and cookie state to run, and what is being defended is the SHAPE of
 * the predicate. A test that boots the whole edge runtime to discover that
 * `startsWith` is the wrong operator would be slower and no more conclusive.
 */

const src = readFileSync(resolve(process.cwd(), 'src/proxy.ts'), 'utf8')

/**
 * Comments stripped, because proxy.ts DOCUMENTS the bad expression in order to
 * explain why it is gone. An assertion that cannot tell an explanation from a
 * declaration would forbid recording the reason - and the reason is the most
 * useful thing in that file.
 */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('the supplier guard covers the portal and nothing else', () => {
  it('does not gate on a bare /supplier prefix', () => {
    // The exact expression that shipped the bug. `/suppliers`, `/supplier-faq`
    // and any future sibling all begin with these eight characters.
    expect(code).not.toMatch(/pathname\.startsWith\('\/supplier'\)/)
  })

  it('matches the portal root exactly and its subtree separately', () => {
    expect(code).toContain("pathname === '/supplier'")
    expect(code).toContain("pathname.startsWith('/supplier/')")
  })

  it('still leaves the two public portal doors open', () => {
    // A supplier who is signed out has to be able to reach a login form.
    expect(code).toContain("pathname === '/supplier/login'")
    expect(code).toContain("pathname === '/supplier/access-denied'")
  })
})

describe('the same operator is not reused where it would over-match', () => {
  it('gates the checkout SUBTREE, never the checkout page itself', () => {
    // `pathname === '/checkout'` in this list would break guest checkout,
    // which is the product decision the file argues for at length.
    expect(code).toContain("pathname.startsWith('/checkout/')")
    expect(code).not.toMatch(/pathname === '\/checkout'\s*\|\|/)
  })

  it('excludes the payment frame return from the checkout guard', () => {
    // Cardcom navigates the payment iframe cross-site, so SameSite=Lax cookies
    // are withheld; requiring a session there shows a login form inside the
    // payment box of a shopper who has already paid.
    expect(code).toContain('isPaymentFramePath(pathname)')
  })
})

/**
 * The public routes a signed-out visitor must be able to reach.
 *
 * Listed by hand rather than derived from the app directory: the point is to
 * state the intent independently, so that a guard which starts capturing one of
 * these fails here rather than being discovered by a supplier who gave up.
 */
describe('public routes are not named by any auth predicate', () => {
  const PUBLIC = [
    '/suppliers',
    '/products',
    '/coupons',
    '/about',
    '/contact',
    '/faq',
    '/blog',
    '/cart',
  ]

  it.each(PUBLIC)('%s is not gated', (path) => {
    // Any predicate that names the path outright, or prefixes it, would gate it.
    expect(code).not.toContain(`pathname === '${path}'`)
    expect(code).not.toContain(`pathname.startsWith('${path}')`)
  })
})
