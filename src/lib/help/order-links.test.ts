import { describe, expect, it } from 'vitest'
import {
  helpUrlForOrder,
  normalizeOrderRef,
  orderHelpLinks,
  orderShortId,
  parseHelpSearchParams,
} from './order-links'

const FULL = '6f1e2d3c-4b5a-4c6d-8e9f-0a1b2c3d4e5f'

describe('orderShortId', () => {
  it('is the first eight characters, upper-cased, as the rest of the site prints it', () => {
    expect(orderShortId(FULL)).toBe('6F1E2D3C')
  })
})

describe('normalizeOrderRef', () => {
  it('accepts a UUID and a short reference', () => {
    expect(normalizeOrderRef(FULL)).toBe(FULL)
    expect(normalizeOrderRef(' 6F1E2D3C ')).toBe('6F1E2D3C')
  })

  it('drops anything that is not an id, so it is never echoed into the page or the mail', () => {
    expect(normalizeOrderRef(null)).toBeNull()
    expect(normalizeOrderRef('')).toBeNull()
    expect(normalizeOrderRef('abc')).toBeNull()
    expect(normalizeOrderRef('<script>alert(1)</script>')).toBeNull()
    expect(normalizeOrderRef('x'.repeat(65))).toBeNull()
    expect(normalizeOrderRef('6F1E 2D3C')).toBeNull()
  })
})

describe('helpUrlForOrder', () => {
  it('deep-links to /help with the order and the orders shelf by default', () => {
    expect(helpUrlForOrder(FULL)).toBe(`/help?order=${FULL}&topic=orders`)
    expect(helpUrlForOrder(FULL, 'refunds')).toBe(`/help?order=${FULL}&topic=refunds`)
  })
})

describe('parseHelpSearchParams', () => {
  it('reads the two parameters and validates both', () => {
    expect(parseHelpSearchParams(new URLSearchParams(`order=${FULL}&topic=refunds`))).toEqual({
      orderRef: FULL,
      topic: 'refunds',
    })
  })

  it('ignores an unknown topic and a malformed order, and tolerates no params at all', () => {
    expect(parseHelpSearchParams(new URLSearchParams('order=%3Cb%3E&topic=billing'))).toEqual({
      orderRef: null,
      topic: null,
    })
    expect(parseHelpSearchParams(null)).toEqual({ orderRef: null, topic: null })
  })
})

describe('orderHelpLinks', () => {
  it('offers the order, its receipt, a return and WhatsApp for a full id', () => {
    const links = orderHelpLinks(FULL)
    expect(links.map((l) => l.href)).toEqual([
      `/account/orders/${FULL}`,
      `/account/orders/${FULL}/receipt`,
      `/account/return/${FULL}`,
      expect.stringMatching(/^https:\/\/wa\.me\/972\d+\?text=/),
    ])
    const wa = links.at(-1)
    expect(wa?.external).toBe(true)
    expect(decodeURIComponent(wa?.href ?? '')).toContain('6F1E2D3C')
  })

  it('does not link to routes that would 404 on a short reference', () => {
    const links = orderHelpLinks('6F1E2D3C')
    expect(links.map((l) => l.href)[0]).toBe('/account/orders')
    expect(links.some((l) => l.href.includes('/receipt'))).toBe(false)
    expect(links.filter((l) => l.external)).toHaveLength(1)
  })

  it('every label is Hebrew', () => {
    for (const link of orderHelpLinks(FULL)) expect(link.label).toMatch(/[א-ת]/)
  })
})
