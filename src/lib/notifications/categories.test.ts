import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CATEGORIES,
  CATEGORY_HINT_HE,
  CATEGORY_LABEL_HE,
  KNOWN_KINDS,
  categoryOf,
  countByCategory,
  isCategory,
  isKindVisible,
  kindExclusion,
  muteKind,
  mutedCategories,
} from './categories'
import { OPTIONAL_KINDS, type PreferenceRow, REQUIRED_KINDS } from './preferences'

/**
 * The shelf mapping is a measurement, not an opinion: every kind the bell can
 * carry today must sit on a NAMED shelf, so the `system` fallback is reached
 * only by a kind this file has never heard of. The sources of "can carry" are
 * the trigger's CASE arms (231), the loyalty writer (261) and the preference
 * vocabulary, read from disk rather than retyped.
 */

const ROOT = process.cwd()

function bellKindsFromSql(file: string): string[] {
  const sql = readFileSync(resolve(ROOT, file), 'utf8')
  return [...sql.matchAll(/^\s*WHEN '([a-z_]+)' THEN\s*$/gm)].map((m) => m[1] ?? '')
}

function row(kind: string, channel: PreferenceRow['channel'], enabled: boolean): PreferenceRow {
  return { kind, channel, enabled }
}

describe('notification categories', () => {
  it('shelves every kind the bell trigger (231) can write', () => {
    const kinds = bellKindsFromSql('migrations/pending/231_bell_fanout.sql')
    expect(kinds.length).toBeGreaterThan(8)
    for (const kind of kinds) {
      expect(categoryOf(kind), kind).not.toBe('system')
    }
  })

  it('shelves the loyalty tier row (261) and every preference kind', () => {
    expect(categoryOf('loyalty_tier_upgraded')).toBe('account')
    for (const kind of [...REQUIRED_KINDS, ...OPTIONAL_KINDS]) {
      expect(categoryOf(kind), kind).not.toBe('system')
      expect(KNOWN_KINDS).toContain(kind)
    }
  })

  it('places receipts and parcels on orders, saved-item alerts on deals, perks on account', () => {
    expect(categoryOf('order_paid')).toBe('orders')
    expect(categoryOf('refund_completed')).toBe('orders')
    expect(categoryOf('voucher_issued')).toBe('orders')
    expect(categoryOf('price_drop')).toBe('deals')
    expect(categoryOf('back_in_stock')).toBe('deals')
    expect(categoryOf('cashback_credited')).toBe('account')
    expect(categoryOf('welcome')).toBe('account')
  })

  it('falls back to system for an unknown kind, visibly rather than silently', () => {
    expect(categoryOf('maintenance_window')).toBe('system')
    expect(categoryOf('')).toBe('system')
  })

  it('lists no kind twice', () => {
    expect(new Set(KNOWN_KINDS).size).toBe(KNOWN_KINDS.length)
  })

  it('has a Hebrew label and hint for every shelf', () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_LABEL_HE[c]).toMatch(/[א-ת]/)
      expect(CATEGORY_HINT_HE[c]).toMatch(/[א-ת]/)
    }
    expect(isCategory('orders')).toBe(true)
    expect(isCategory('category:orders')).toBe(false)
  })
})

describe('mutes', () => {
  it('stores under a prefixed kind the outbox CHECK can never admit', () => {
    expect(muteKind('deals')).toBe('category:deals')
    expect(muteKind('deals')).toContain(':')
  })

  it('reads a mute only from a disabled in_app row with the prefix', () => {
    expect(
      mutedCategories([
        row('category:deals', 'in_app', false),
        row('category:orders', 'in_app', true),
        row('category:account', 'email', false),
        row('category:bogus', 'in_app', false),
        row('price_drop', 'in_app', false),
      ]),
    ).toEqual(['deals'])
    expect(mutedCategories([])).toEqual([])
  })

  it('hides the muted shelf and the per-kind in_app opt-outs as one exclusion', () => {
    const ex = kindExclusion([
      row('category:deals', 'in_app', false),
      row('order_shipped', 'in_app', false),
      row('order_delivered', 'email', false),
    ])
    expect(ex.only).toBeNull()
    expect(ex.hide).toEqual(
      expect.arrayContaining(['price_drop', 'back_in_stock', 'order_shipped']),
    )
    expect(ex.hide).not.toContain('order_delivered')
    expect(isKindVisible('price_drop', ex)).toBe(false)
    expect(isKindVisible('order_shipped', ex)).toBe(false)
    expect(isKindVisible('order_paid', ex)).toBe(true)
    expect(isKindVisible('unknown_future_kind', ex)).toBe(true)
  })

  it('turns into an allow-list when the fallback shelf is muted', () => {
    const ex = kindExclusion([
      row('category:system', 'in_app', false),
      row('category:account', 'in_app', false),
      row('order_paid', 'in_app', false),
    ])
    expect(ex.hide).toEqual([])
    expect(ex.only).not.toBeNull()
    expect(ex.only).not.toContain('welcome')
    expect(ex.only).not.toContain('order_paid')
    expect(ex.only).toContain('order_shipped')
    expect(isKindVisible('unknown_future_kind', ex)).toBe(false)
    expect(isKindVisible('order_shipped', ex)).toBe(true)
  })

  it('counts every shelf, unread separately', () => {
    const counts = countByCategory([
      { kind: 'order_paid', read_at: null },
      { kind: 'order_shipped', read_at: '2026-10-01T00:00:00Z' },
      { kind: 'price_drop', read_at: null },
      { kind: 'mystery', read_at: null },
    ])
    expect(counts).toEqual({
      orders: { total: 2, unread: 1 },
      deals: { total: 1, unread: 1 },
      account: { total: 0, unread: 0 },
      system: { total: 1, unread: 1 },
    })
  })
})
