import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * "העגלה שלך נשמרה" IS A PROMISE, AND THIS IS WHAT KEEPS IT.
 *
 * `/checkout/failed` tells a shopper whose card was declined that the cart is
 * still there and they can try again. That sentence is the whole page - there
 * is nothing else on it but the sentence and a link back - so if anything on
 * the failure path emptied the cart, the page would be lying to the person
 * least inclined to forgive it.
 *
 * Read at the time of writing: the cart is emptied in exactly one place,
 * `finalize.ts`, after the order is marked paid, and by `clearCart()`, which
 * only the cart store's own `clear` calls. Neither is on the failure path,
 * which is `reconcileOrderReturn` -> `redirect('/checkout/failed')` and
 * touches no cart at all.
 *
 * A SCAN RATHER THAN A FLOW TEST, for the same reason the route guards are
 * scanned: the flow needs a session, a seeded cart and a declining terminal,
 * and what actually goes wrong is somebody adding a tidy-up to a failure
 * handler. This fails the moment such a line appears anywhere new.
 */

const SRC = join(process.cwd(), 'src')

/**
 * The two modules allowed to empty a cart, and why.
 *
 * `finalize.ts` runs after the money is taken and the order is `paid`.
 * `actions/cart.ts` holds `clearCart`, which exists for the shopper's own
 * "empty the cart" and is reached only through the cart store.
 */
const ALLOWED = ['src/server/payments/finalize.ts', 'src/server/actions/cart.ts']

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full)
  }
  return acc
}

/** Emptying a cart, in every spelling this codebase uses for it. */
const EMPTIES_A_CART = [
  /from\(['"]carts['"]\)[\s\S]{0,120}?items:\s*\[\s*\]/,
  /from\(['"]carts['"]\)[\s\S]{0,60}?\.delete\(/,
  /\bclearCart(?:Action)?\s*\(/,
]

const FILES = walk(SRC)

describe('the cart after a failed payment', () => {
  it('is emptied from nowhere but the paid path and the shopper own button', () => {
    const offenders = FILES.filter((file) => {
      const rel = file.slice(process.cwd().length + 1)
      if (ALLOWED.includes(rel)) return false
      const source = readFileSync(file, 'utf8')
      // The store re-exports the action; that is the shopper's own button.
      if (rel === 'src/lib/cart/store.ts') return false
      return EMPTIES_A_CART.some((pattern) => pattern.test(source))
    }).map((f) => f.slice(process.cwd().length + 1))

    expect(offenders, '/checkout/failed promises the cart survives').toEqual([])
  })

  it('finds the allowed writes, so a rename cannot empty this test', () => {
    // Without this the suite would pass just as happily if `carts` were renamed
    // and every pattern above stopped matching anything at all.
    const hits = ALLOWED.filter((rel) =>
      EMPTIES_A_CART.some((pattern) =>
        pattern.test(readFileSync(join(process.cwd(), rel), 'utf8')),
      ),
    )
    expect(hits).toEqual(ALLOWED)
  })

  it('says the thing the scan is protecting', () => {
    const page = readFileSync(join(SRC, 'app/(store)/checkout/failed/page.tsx'), 'utf8')
    expect(page).toContain('התשלום לא הושלם')
    expect(page).toContain('החיוב לא בוצע. אפשר לנסות שוב, העגלה שלך נשמרה.')
    expect(page).toContain('href="/cart"')
  })
})
