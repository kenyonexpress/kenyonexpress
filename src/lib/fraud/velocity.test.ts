import { VELOCITY_LIMITS, checkVelocity } from '@/lib/fraud/velocity'
import { describe, expect, it } from 'vitest'

const clean = { declinedPaymentsLastHour: 0, distinctCardsLastDay: 1, profilesSharingCard: 1 }

describe('checkVelocity', () => {
  it('lets an ordinary shopper through', () => {
    expect(checkVelocity(clean)).toEqual({ allowed: true })
  })

  it('lets a household with three cards and one decline through', () => {
    // The false positive that would matter: a family on one account, one
    // mistyped CVV. Every ceiling is above this by design.
    expect(
      checkVelocity({
        declinedPaymentsLastHour: 1,
        distinctCardsLastDay: 3,
        profilesSharingCard: 3,
      }).allowed,
    ).toBe(true)
  })

  it('refuses at the decline ceiling, not one below it', () => {
    const below = VELOCITY_LIMITS.declinedPaymentsLastHour - 1
    expect(checkVelocity({ ...clean, declinedPaymentsLastHour: below }).allowed).toBe(true)
    const at = checkVelocity({
      ...clean,
      declinedPaymentsLastHour: VELOCITY_LIMITS.declinedPaymentsLastHour,
    })
    expect(at.allowed).toBe(false)
    expect(at.allowed === false && at.rule).toBe('declined_payments')
  })

  it('refuses at the distinct-card ceiling', () => {
    const at = checkVelocity({
      ...clean,
      distinctCardsLastDay: VELOCITY_LIMITS.distinctCardsLastDay,
    })
    expect(at.allowed === false && at.rule).toBe('distinct_cards')
  })

  it('refuses a card that has spread across accounts, at four and not three', () => {
    // Three accounts on one card is a parent paying for two children. The
    // limit is deliberately above the family explanation.
    expect(checkVelocity({ ...clean, profilesSharingCard: 3 }).allowed).toBe(true)
    const at = checkVelocity({ ...clean, profilesSharingCard: 4 })
    expect(at.allowed === false && at.rule).toBe('card_across_accounts')
  })

  it('reports the decline rule first when several fire at once', () => {
    // Order is a product decision, not an accident: the customer is told the
    // thing they can act on.
    const result = checkVelocity({
      declinedPaymentsLastHour: 9,
      distinctCardsLastDay: 9,
      profilesSharingCard: 9,
    })
    expect(result.allowed === false && result.rule).toBe('declined_payments')
  })

  it('says nothing about the other accounts when a card is shared', () => {
    // The caller may be the thief, and the other account holder is the victim.
    const result = checkVelocity({ ...clean, profilesSharingCard: 8 })
    expect(result.allowed).toBe(false)
    if (result.allowed === false) {
      expect(result.message).not.toMatch(/חשבון|accounts|8/)
    }
  })

  it('every refusal carries a Hebrew sentence with no placeholder left in it', () => {
    const cases = [
      { ...clean, declinedPaymentsLastHour: 99 },
      { ...clean, distinctCardsLastDay: 99 },
      { ...clean, profilesSharingCard: 99 },
    ]
    for (const counts of cases) {
      const result = checkVelocity(counts)
      expect(result.allowed).toBe(false)
      if (result.allowed === false) {
        expect(result.message.length).toBeGreaterThan(10)
        expect(result.message).not.toMatch(/undefined|\{|\$/)
      }
    }
  })
})
