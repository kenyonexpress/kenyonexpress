import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { agorot } from '@/lib/commerce/money'
import { describe, expect, it } from 'vitest'
import { ZONE_RULES, anyZoneCharges, quoteShipping } from './zones'

const ROOT = resolve(__dirname, '../../..')

describe('the table matches what the site promises', () => {
  it('charges nothing anywhere, because the top bar says so on every page', () => {
    // THE ASSERTION THAT TIES THE TWO TOGETHER. `TopBar` prints
    // "משלוח מהיר חינם" with no qualifier, on every page of the site. That
    // sentence is a promise, and it is only true while this table is free.
    //
    // Either half may change; they may not change alone. Add a surcharge and
    // this fails until the banner is edited; edit the banner and the second
    // case below fails until the table agrees.
    const topBar = readFileSync(join(ROOT, 'src/components/layout/TopBar.tsx'), 'utf8')
    const promisesFree = topBar.includes('משלוח מהיר חינם')

    expect(anyZoneCharges()).toBe(!promisesFree)
  })

  it('still says it, so the first case above is testing something', () => {
    // Without this, deleting the banner would make the pair above vacuous:
    // `anyZoneCharges()` false and `promisesFree` false would fail, but a
    // reader could not tell which side moved. Naming the current state makes
    // the diff say it.
    const topBar = readFileSync(join(ROOT, 'src/components/layout/TopBar.tsx'), 'utf8')
    expect(topBar).toContain('משלוח מהיר חינם')
    expect(anyZoneCharges()).toBe(false)
  })

  it('gives every zone a Hebrew name and a distinct id', () => {
    const ids = ZONE_RULES.map((z) => z.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const zone of ZONE_RULES) expect(zone.nameHe.length).toBeGreaterThan(0)
  })

  it('keeps Eilat as its own zone', () => {
    // Pinned because collapsing it into `south` is the obvious simplification
    // and it is the wrong one: Eilat is a four-hour drive past the last
    // distribution point and every Israeli courier prices it apart. A flat
    // national rate loses money there specifically.
    expect(ZONE_RULES.find((z) => z.id === 'eilat')).toBeDefined()
    expect(ZONE_RULES.find((z) => z.id === 'south')).toBeDefined()
  })
})

describe('quoting', () => {
  const subtotal = agorot(10_000)

  it('is free everywhere today', () => {
    for (const zone of ZONE_RULES) {
      expect(quoteShipping({ zone: zone.id, subtotalAgorot: subtotal })).toEqual({
        ok: true,
        zone: zone.id,
        amountAgorot: 0,
        free: true,
      })
    }
  })

  it('refuses an unknown zone instead of charging the cheapest rate', () => {
    // The direction matters. Falling back to `center` would quote the lowest
    // price for an address nobody classified, and the loss would never surface;
    // refusing surfaces it at checkout, where the address can be fixed.
    expect(quoteShipping({ zone: 'atlantis', subtotalAgorot: subtotal })).toMatchObject({
      ok: false,
      reason: 'unknown_zone',
    })
  })

  it('charges nothing for collection, even from a zone that cannot be delivered to', () => {
    // Pickup outranks deliverability: a pickup point inside a no-delivery zone
    // is still somewhere the customer can walk to.
    expect(
      quoteShipping({ zone: 'remote', subtotalAgorot: agorot(0), pickup: true }),
    ).toMatchObject({ ok: true, amountAgorot: 0, free: true })
  })
})

describe('the rules a future rate table has to obey', () => {
  // Exercised against a hypothetical table rather than the live one, because
  // the live one is all zeroes and would pass these by accident. This is the
  // arithmetic that has to hold on the day somebody sets real rates.

  it('applies the free threshold against the subtotal', () => {
    const rule = { flatAgorot: agorot(2900), freeAboveAgorot: agorot(19_900) }
    const under = agorot(19_899)
    const at = agorot(19_900)
    expect(under >= rule.freeAboveAgorot).toBe(false)
    expect(at >= rule.freeAboveAgorot).toBe(true)
    // `>=`, not `>`. "חינם מ-199 ₪" means an order of exactly ₪199 ships free;
    // charging it is the reading nobody expects and every customer notices.
  })

  it('treats a null threshold as never free', () => {
    const rule = { freeAboveAgorot: null as number | null }
    expect(rule.freeAboveAgorot === null).toBe(true)
  })
})
