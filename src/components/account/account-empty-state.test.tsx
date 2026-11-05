import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AccountEmptyState from './AccountEmptyState'

/**
 * S33: an empty account list says what will appear in it and offers the way to
 * the shop. Before this, the coupons page had one grey sentence and no link.
 */

describe('AccountEmptyState', () => {
  it('renders the sentence, the hint and one link to the shop', () => {
    render(
      <AccountEmptyState
        testId="orders-empty"
        icon={<svg />}
        title="עוד לא ביצעת הזמנות."
        hint="כל הזמנה שתבצעו תופיע כאן."
        href="/products"
        cta="לכל המוצרים"
      />,
    )
    expect(screen.getByTestId('orders-empty')).toBeTruthy()
    expect(screen.getByText('עוד לא ביצעת הזמנות.').className).toContain('account-empty')
    expect(screen.getByText('כל הזמנה שתבצעו תופיע כאן.')).toBeTruthy()
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('/products')
    expect(links[0]?.className).toContain('account-btn--primary')
  })

  it('hides the icon from a screen reader', () => {
    const { container } = render(
      <AccountEmptyState icon={<svg />} title="א" hint="ב" href="/" cta="ג" />,
    )
    expect(container.querySelector('.account-empty-state__icon')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
  })

  it('is what the orders page and the coupons page both show when empty', () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
    const orders = read('src/app/(account)/account/orders/page.tsx')
    const coupons = read('src/app/(account)/account/coupons/page.tsx')
    expect(orders).toMatch(/orders\.length === 0[\s\S]*<AccountEmptyState/)
    expect(coupons).toMatch(/vouchers\.length === 0[\s\S]*<AccountEmptyState/)
    // /account/vouchers and /account/my-vouchers redirect to /account/coupons,
    // so the coupons empty state IS the vouchers empty state.
    for (const alias of ['vouchers', 'my-vouchers']) {
      expect(read(`src/app/(account)/account/${alias}/page.tsx`)).toContain(
        "permanentRedirect('/account/coupons')",
      )
    }
  })
})
