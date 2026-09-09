import { describe, expect, it } from 'vitest'
import { CARRIERS, findCarrier, trackingView } from './carriers'

describe('the registry itself', () => {
  it('has a unique id and a Hebrew name for every carrier', () => {
    const ids = CARRIERS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const carrier of CARRIERS) expect(carrier.nameHe.length).toBeGreaterThan(0)
  })

  it('puts {tracking} in every URL it does define', () => {
    // A template without the placeholder is a link to a search page the
    // customer cannot use, which is the same failure as a wrong link.
    for (const carrier of CARRIERS) {
      if (carrier.urlTemplate) expect(carrier.urlTemplate).toContain('{tracking}')
    }
  })

  it('does not invent a URL for the three Israeli couriers', () => {
    // Pinned, because "add a link, it is probably this" is exactly the change
    // somebody makes without opening it. A link that 404s reads to the customer
    // as a lost parcel; a name with no link reads as a name with no link.
    for (const id of ['hfd', 'cheetah', 'baldar']) {
      expect(CARRIERS.find((c) => c.id === id)?.urlTemplate).toBeNull()
    }
  })

  it('shares no alias between two carriers', () => {
    const seen = new Map<string, string>()
    for (const carrier of CARRIERS) {
      for (const alias of carrier.aliases) {
        const fold = alias.trim().toLowerCase()
        expect(seen.get(fold), `"${alias}" is claimed twice`).toBeUndefined()
        seen.set(fold, carrier.id)
      }
    }
  })
})

describe('matching what an operator typed', () => {
  it('finds a carrier by id, Hebrew name or alias', () => {
    expect(findCarrier('israel_post')?.id).toBe('israel_post')
    expect(findCarrier('דואר ישראל')?.id).toBe('israel_post')
    expect(findCarrier('Israel Post')?.id).toBe('israel_post')
  })

  it('survives the whitespace and casing a form actually produces', () => {
    // `markItemShipped` stores `carrier.trim().slice(0, 120)` of whatever was
    // typed into a free-text box, so this is the normal input, not the edge.
    expect(findCarrier('  HFD  ')?.id).toBe('hfd')
    expect(findCarrier('Israel   Post')?.id).toBe('israel_post')
  })

  it('does not match on a substring', () => {
    // A note rather than a carrier name. `includes` would match israel_post
    // here and the answer would depend on list order, which is a coin toss
    // dressed as a lookup.
    expect(findCarrier('נמסר לשליח של דואר ישראל')).toBeNull()
  })

  it('returns null for nothing, rather than a default carrier', () => {
    expect(findCarrier(null)).toBeNull()
    expect(findCarrier('   ')).toBeNull()
  })
})

describe('what the customer is shown', () => {
  it('builds a link when the carrier is known and a number exists', () => {
    const view = trackingView('דואר ישראל', 'RR123456789IL')
    expect(view).toEqual({
      carrierLabel: 'דואר ישראל',
      trackingNumber: 'RR123456789IL',
      url: 'https://mypost.israelpost.co.il/itemtrace?itemcode=RR123456789IL',
    })
  })

  it('still shows the number when the carrier has no URL', () => {
    // The point of the whole module. The number is the one fact the customer
    // came for; withholding it because we could not build a link would repeat
    // the defect this replaces.
    expect(trackingView('HFD', '55512345')).toEqual({
      carrierLabel: 'HFD',
      trackingNumber: '55512345',
      url: null,
    })
  })

  it('still shows the number when the carrier is unrecognised', () => {
    expect(trackingView('שליח מקומי', '99')).toEqual({
      carrierLabel: 'שליח מקומי',
      trackingNumber: '99',
      url: null,
    })
  })

  it('builds no link from a carrier with no number', () => {
    expect(trackingView('דואר ישראל', null)).toEqual({
      carrierLabel: 'דואר ישראל',
      trackingNumber: null,
      url: null,
    })
  })

  it('escapes a number before putting it in a URL', () => {
    // `tracking_number` is free text an operator typed. Interpolating it raw
    // would let a space or an ampersand rewrite the query string.
    expect(trackingView('דואר ישראל', 'A B&c=1')?.url).toBe(
      'https://mypost.israelpost.co.il/itemtrace?itemcode=A%20B%26c%3D1',
    )
  })

  it('says nothing when there is nothing to say', () => {
    expect(trackingView(null, null)).toBeNull()
    expect(trackingView('  ', '  ')).toBeNull()
  })
})
