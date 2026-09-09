import { agorot } from '@/lib/commerce/money'
import { describe, expect, it } from 'vitest'
import {
  type PriceObservation,
  REFERENCE_WINDOW_DAYS,
  checkReferencePrice,
  mayShowReference,
  referenceWarning,
} from './reference-price'

const END = '2026-09-09'

/** `n` consecutive days ending on END, all at the same price. */
function flat(days: number, priceAgorot: number, endsOn = END): PriceObservation[] {
  const end = Date.parse(`${endsOn}T00:00:00Z`)
  return Array.from({ length: days }, (_, i) => ({
    observedOn: new Date(end - i * 86_400_000).toISOString().slice(0, 10),
    priceAgorot: agorot(priceAgorot),
  }))
}

const check = (over: Partial<Parameters<typeof checkReferencePrice>[0]> = {}) =>
  checkReferencePrice({
    currentAgorot: agorot(9900),
    referenceAgorot: agorot(15000),
    observations: [],
    windowEndsOn: END,
    ...over,
  })

describe('a claim nobody can check', () => {
  it('is unproven, not compliant, when there is no history at all', () => {
    // The state of all 15 struck-through products in production on 2026-09-09.
    const verdict = check()
    expect(verdict).toEqual({
      kind: 'unproven',
      reason: 'no_history',
      daysObserved: 0,
      daysRequired: 30,
    })
  })

  it('is still unproven one day short of the window', () => {
    // 29 of 30. The lowest price could be on the day nobody recorded, so the
    // window cannot produce the number the law asks for.
    const verdict = check({ observations: flat(REFERENCE_WINDOW_DAYS - 1, 15000) })
    expect(verdict.kind).toBe('unproven')
    expect(verdict).toMatchObject({ reason: 'window_too_short', daysObserved: 29 })
  })

  it('turns into a verdict on the evidence the day the window fills', () => {
    // The property that makes this self-tightening rather than a flag somebody
    // has to remember: the same claim, the same code, one more day of history.
    const short = check({ observations: flat(29, 12000) })
    const full = check({ observations: flat(30, 12000) })
    expect(short.kind).toBe('unproven')
    expect(full.kind).toBe('violating')
  })
})

describe('a claim the record supports', () => {
  it('passes when the reference equals the lowest price charged', () => {
    // Equal, not merely below. A reference equal to the lowest price actually
    // charged is the honest claim: the shopper saves exactly what it says.
    const verdict = check({ referenceAgorot: agorot(15000), observations: flat(30, 15000) })
    expect(verdict).toEqual({
      kind: 'compliant',
      referenceAgorot: 15000,
      lowestAgorot: 15000,
      daysObserved: 30,
    })
  })

  it('passes when the reference understates the saving', () => {
    const verdict = check({ referenceAgorot: agorot(14000), observations: flat(30, 15000) })
    expect(verdict.kind).toBe('compliant')
  })
})

describe('a claim the record contradicts', () => {
  it('fails when one day in the window was cheaper than the reference', () => {
    // The whole point of a 30-day window rather than "the last price". A single
    // day at 120 makes a 150 "before" price a saving nobody was ever offered.
    const observations = [...flat(30, 15000)]
    observations[10] = { observedOn: observations[10]!.observedOn, priceAgorot: agorot(12000) }
    const verdict = check({ referenceAgorot: agorot(15000), observations })
    expect(verdict).toMatchObject({
      kind: 'violating',
      reason: 'above_lowest_charged',
      lowestAgorot: 12000,
    })
  })

  it('fails immediately when the reference is not above the price charged', () => {
    // Checked before coverage on purpose: this is nonsense in every window, and
    // waiting 30 days to say so leaves it on the page for a month.
    const verdict = check({ currentAgorot: agorot(9900), referenceAgorot: agorot(9900) })
    expect(verdict).toMatchObject({ kind: 'violating', reason: 'not_above_current' })
    expect(verdict.kind === 'violating' && verdict.lowestAgorot).toBe(null)
  })

  it('reports the lowest it knows even when the reference is not above current', () => {
    const verdict = check({
      currentAgorot: agorot(9900),
      referenceAgorot: agorot(9000),
      observations: flat(5, 8000),
    })
    expect(verdict).toMatchObject({ kind: 'violating', lowestAgorot: 8000, daysObserved: 5 })
  })
})

describe('the window has edges and they are enforced', () => {
  it('ignores an observation older than the window', () => {
    // 31 days of data is 30 days of window plus one day that does not count.
    // Without the cutoff, a price from six months ago could justify today's
    // claim, which is the entire loophole the 30 days exists to close.
    const observations = flat(31, 15000)
    observations[30] = { observedOn: observations[30]!.observedOn, priceAgorot: agorot(1) }
    const verdict = check({ referenceAgorot: agorot(15000), observations })
    expect(verdict).toMatchObject({ kind: 'compliant', lowestAgorot: 15000 })
  })

  it('ignores an observation dated after the window ends', () => {
    const verdict = check({
      referenceAgorot: agorot(15000),
      observations: [...flat(30, 15000), { observedOn: '2026-09-10', priceAgorot: agorot(1) }],
    })
    expect(verdict).toMatchObject({ kind: 'compliant', lowestAgorot: 15000 })
  })

  it('takes the lower of two observations for the same day', () => {
    // A re-run of the snapshot is not two prices. Taking the lower one is the
    // conservative direction: it is the price a shopper could have paid.
    const observations = [...flat(30, 15000), { observedOn: END, priceAgorot: agorot(11000) }]
    const verdict = check({ referenceAgorot: agorot(15000), observations })
    expect(verdict).toMatchObject({ kind: 'violating', lowestAgorot: 11000, daysObserved: 30 })
  })

  it('refuses a date it cannot parse rather than treating it as epoch', () => {
    expect(() => check({ windowEndsOn: '09/09/2026' })).toThrow(/YYYY-MM-DD/)
  })
})

describe('a product making no claim', () => {
  it('is not_claimed, and carries no warning', () => {
    const verdict = check({ referenceAgorot: null })
    expect(verdict).toEqual({ kind: 'not_claimed' })
    expect(referenceWarning(verdict)).toBe(null)
    expect(mayShowReference(verdict)).toBe(false)
  })
})

describe('what the storefront does with each verdict', () => {
  it('paints compliant and unproven, and refuses violating', () => {
    // The judgement call, pinned. `unproven` shows because an absence of
    // evidence is not evidence of a false claim, and because suppressing it
    // today would blank 15 of 44 products at once. `violating` is measured to
    // be false and is never painted.
    expect(mayShowReference(check({ observations: flat(30, 15000) }))).toBe(true)
    expect(mayShowReference(check())).toBe(true)
    expect(mayShowReference(check({ observations: flat(30, 9000) }))).toBe(false)
  })
})

describe('what the admin is told', () => {
  it('says something on every verdict except a clean one', () => {
    for (const verdict of [
      check(),
      check({ observations: flat(5, 15000) }),
      check({ observations: flat(30, 9000) }),
      check({ referenceAgorot: agorot(9900) }),
    ]) {
      expect(referenceWarning(verdict)).toBeTruthy()
    }
    expect(referenceWarning(check({ observations: flat(30, 15000) }))).toBe(null)
  })

  it('counts the days it has, so the warning is actionable', () => {
    expect(referenceWarning(check({ observations: flat(7, 15000) }))).toContain('7')
  })
})
