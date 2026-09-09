import type { CartView, CartViewItem } from '@/lib/cart/types'
import { agorot } from '@/lib/commerce/money'
import { buildAbandonedCartEmail, resumeUrl } from '@/lib/growth/abandoned-cart-email'
import { shekels } from '@/lib/money-format'
import { describe, expect, it } from 'vitest'

/**
 * WHAT THE MAIL SAYS, AND WHAT IT MUST NOT SAY.
 *
 * The version this replaced said "you have N items in your cart" and nothing
 * else. That is the one fact the recipient already knows, and it is the one
 * fact that cannot remind them of anything -- nobody abandons a cart because
 * they forgot how many things were in it.
 *
 * Three things here are worth a test rather than a read-through: the money is
 * the cart's own `total` and never re-derived, a product name cannot inject
 * markup, and the two reminders do not say the same sentence twice.
 */

function item(over: Partial<CartViewItem> & { name_he: string }): CartViewItem {
  return {
    product_id: '11111111-1111-4111-8111-111111111111',
    variant_id: null,
    quantity: 1,
    slug: 'p',
    image_url: null,
    unit_price: agorot(1000),
    line_total: agorot(1000),
    type: 'physical',
    available: true,
    platform_fee: agorot(0),
    supplier_due: agorot(1000),
    customer_pays_now: agorot(1000),
    balance_due_at_business: agorot(0),
    platform_percent_bp: 0,
    platform_percent_snapshot: null,
    coupon_price_unit: null,
    max_quantity: null,
    ...over,
  } as CartViewItem
}

function cart(items: CartViewItem[], over: Partial<CartView> = {}): CartView {
  const subtotal = items.reduce((sum, i) => sum + Number(i.line_total), 0)
  return {
    id: 'cart-1',
    items,
    item_count: items.length,
    subtotal: agorot(subtotal),
    platform_fee: agorot(0),
    supplier_due: agorot(subtotal),
    balance_due_at_business: agorot(0),
    coupon: null,
    discount: agorot(0),
    total: agorot(subtotal),
    ...over,
  } as CartView
}

const BASE = 'https://kenyonexpress.co.il'

describe('buildAbandonedCartEmail', () => {
  it('names the products, which is the whole point of the message', () => {
    const { html } = buildAbandonedCartEmail({
      cart: cart([item({ name_he: 'עוגת שוקולד' }), item({ name_he: 'זר פרחים' })]),
      base: BASE,
      reminder: 1,
    })
    expect(html).toContain('עוגת שוקולד')
    expect(html).toContain('זר פרחים')
  })

  it('shows the quantity only when there is more than one', () => {
    const one = buildAbandonedCartEmail({
      cart: cart([item({ name_he: 'פריט' })]),
      base: BASE,
      reminder: 1,
    })
    const three = buildAbandonedCartEmail({
      cart: cart([item({ name_he: 'פריט', quantity: 3 })]),
      base: BASE,
      reminder: 1,
    })
    expect(one.html).not.toContain('×')
    expect(three.html).toContain('×3')
  })

  /**
   * The total is the cart's `total`, which is AFTER any applied coupon, because
   * that is what the card will be charged if the customer follows the link.
   * Quoting the subtotal promises a number the checkout then contradicts
   * upward, which is the one direction a price surprise is never forgiven.
   */
  it('quotes the post-discount total, not the subtotal', () => {
    const discounted = cart([item({ name_he: 'פריט', line_total: agorot(10000) })], {
      subtotal: agorot(10000),
      discount: agorot(2500),
      total: agorot(7500),
    })
    const { html } = buildAbandonedCartEmail({ cart: discounted, base: BASE, reminder: 1 })
    // Compared against `shekels` itself rather than a literal, so the test does
    // not encode the currency formatting and go red when that changes.
    const totalCell = html.slice(html.indexOf('סה"כ'))
    expect(totalCell).toContain(shekels(discounted.total))
    expect(totalCell).not.toContain(shekels(discounted.subtotal))
  })

  it('itemises at most five lines and counts the rest', () => {
    const many = Array.from({ length: 9 }, (_, i) => item({ name_he: `מוצר ${i}` }))
    const { html } = buildAbandonedCartEmail({ cart: cart(many), base: BASE, reminder: 1 })
    expect(html).toContain('מוצר 4')
    expect(html).not.toContain('מוצר 5')
    expect(html).toContain('ועוד <bdi>4</bdi> פריטים')
  })

  /**
   * Product names are operator content typed into an admin form, and this HTML
   * goes into somebody's inbox. Escaping is the cheap half of that; the
   * expensive half would be discovering it was missing.
   */
  it('escapes a product name rather than emitting it as markup', () => {
    const { html } = buildAbandonedCartEmail({
      cart: cart([item({ name_he: '<img src=x onerror="alert(1)">' })]),
      base: BASE,
      reminder: 1,
    })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })

  it('says something different in the second reminder, and says it is the last', () => {
    const first = buildAbandonedCartEmail({
      cart: cart([item({ name_he: 'פריט' })]),
      base: BASE,
      reminder: 1,
    })
    const second = buildAbandonedCartEmail({
      cart: cart([item({ name_he: 'פריט' })]),
      base: BASE,
      reminder: 2,
    })
    expect(second.subject).not.toBe(first.subject)
    expect(second.html).not.toBe(first.html)
    expect(second.html).toContain('האחרונה')
  })

  it('includes the unsubscribe link when there is one, and omits the block when there is not', () => {
    const withLink = buildAbandonedCartEmail({
      cart: cart([item({ name_he: 'פריט' })]),
      base: BASE,
      reminder: 1,
      unsubscribeUrl: `${BASE}/newsletter/unsubscribe?token=abc`,
    })
    const without = buildAbandonedCartEmail({
      cart: cart([item({ name_he: 'פריט' })]),
      base: BASE,
      reminder: 1,
    })
    expect(withLink.html).toContain('הסרה מרשימת הדיוור')
    expect(without.html).not.toContain('הסרה מרשימת הדיוור')
  })

  it('renders right-to-left', () => {
    const { html } = buildAbandonedCartEmail({
      cart: cart([item({ name_he: 'פריט' })]),
      base: BASE,
      reminder: 1,
    })
    expect(html).toContain('dir="rtl"')
  })
})

describe('resumeUrl', () => {
  it('points at the cart and tags which reminder brought them', () => {
    expect(resumeUrl(BASE, 2)).toBe(
      `${BASE}/cart?utm_source=email&utm_medium=lifecycle&utm_campaign=abandoned_cart&utm_content=reminder_2`,
    )
  })

  it('does not double the slash on a base that has one', () => {
    expect(resumeUrl(`${BASE}/`, 1)).toContain(`${BASE}/cart?`)
  })

  /**
   * Not a token URL. The cart is already keyed to the signed-in account, so
   * /cart shows the recipient their own; a token link would be a bearer
   * credential to somebody's cart sitting in an inbox forever and buys nothing.
   */
  it('carries no credential', () => {
    const url = resumeUrl(BASE, 1)
    expect(url).not.toMatch(/token|cart_id|[0-9a-f]{8}-[0-9a-f]{4}/i)
  })
})
