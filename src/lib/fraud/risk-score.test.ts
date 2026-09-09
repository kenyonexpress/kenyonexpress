import {
  ELEVATED_THRESHOLD,
  REVIEW_THRESHOLD,
  RISK_REASONS,
  type RiskSignals,
  assessRisk,
  riskReasonText,
} from '@/lib/fraud/risk-score'
import { describe, expect, it } from 'vitest'

const calm: RiskSignals = {
  declinedPaymentsLastHour: 0,
  distinctCardsLastDay: 1,
  profilesSharingCard: 1,
  accountAgeMinutes: 60 * 24 * 400,
  disposableEmail: false,
  previousPaidOrders: 12,
  totalAgorot: 9_900,
  ordersFromIpLastHour: 1,
  giftToOtherRecipient: false,
  discountShareBps: 0,
}

describe('assessRisk', () => {
  it('scores a returning customer buying a ₪99 coupon at zero', () => {
    expect(assessRisk(calm)).toEqual({ score: 0, band: 'low', reasons: [] })
  })

  it('never refuses anything: the return type has no refusal in it', () => {
    // The design claim, asserted rather than left in a comment. If somebody
    // adds a `block: true` to the assessment, this is where it is noticed.
    const assessment = assessRisk({ ...calm, declinedPaymentsLastHour: 99, disposableEmail: true })
    expect(Object.keys(assessment).sort()).toEqual(['band', 'reasons', 'score'])
  })

  it('routes to review on ANY ONE strong signal', () => {
    for (const signals of [
      { ...calm, declinedPaymentsLastHour: 3 },
      { ...calm, profilesSharingCard: 2 },
      { ...calm, distinctCardsLastDay: 3 },
    ]) {
      expect(assessRisk(signals).band, JSON.stringify(signals)).toBe('review')
    }
  })

  it('does NOT route to review on any one weak signal', () => {
    // A brand-new account is what every new customer has. If this ever starts
    // reaching the queue, the queue becomes the signup log.
    for (const signals of [
      { ...calm, accountAgeMinutes: 1 },
      { ...calm, giftToOtherRecipient: true },
      { ...calm, discountShareBps: 10_000 },
    ]) {
      expect(assessRisk(signals).band, JSON.stringify(signals)).not.toBe('review')
    }
  })

  it('reaches review on two medium signals but not on one', () => {
    const one = assessRisk({ ...calm, disposableEmail: true })
    expect(one.band).toBe('elevated')
    const two = assessRisk({ ...calm, disposableEmail: true, ordersFromIpLastHour: 5 })
    expect(two.band).toBe('review')
  })

  it('treats a high-value FIRST order as a signal and a repeat one as not', () => {
    const first = assessRisk({ ...calm, previousPaidOrders: 0, totalAgorot: 150_000 })
    expect(first.reasons).toContain('first_order_high_value')
    const repeat = assessRisk({ ...calm, previousPaidOrders: 4, totalAgorot: 150_000 })
    expect(repeat.reasons).not.toContain('first_order_high_value')
  })

  it('orders the reasons heaviest first, so the operator reads what routed it', () => {
    const assessment = assessRisk({
      ...calm,
      accountAgeMinutes: 1,
      disposableEmail: true,
      declinedPaymentsLastHour: 4,
    })
    expect(assessment.reasons[0]).toBe('card_declines')
    expect(assessment.reasons.at(-1)).toBe('fresh_account')
    const weights = assessment.reasons.map((r) => RISK_REASONS[r].weight)
    expect([...weights].sort((a, b) => b - a)).toEqual(weights)
  })

  it('caps at 100 rather than reporting an uncomparable number', () => {
    const everything = assessRisk({
      declinedPaymentsLastHour: 9,
      distinctCardsLastDay: 9,
      profilesSharingCard: 9,
      accountAgeMinutes: 0,
      disposableEmail: true,
      previousPaidOrders: 0,
      totalAgorot: 500_000,
      ordersFromIpLastHour: 9,
      giftToOtherRecipient: true,
      discountShareBps: 10_000,
    })
    expect(everything.score).toBe(100)
    expect(everything.band).toBe('review')
  })

  it('has no reason it cannot produce', () => {
    // Guards against the failure this file already corrected once: a reason
    // with a weight and no input, which reads as coverage and never fires.
    // `address_mismatch_country` was removed for exactly this - there is no
    // country column on user_addresses.
    const everything = assessRisk({
      declinedPaymentsLastHour: 9,
      distinctCardsLastDay: 9,
      profilesSharingCard: 9,
      accountAgeMinutes: 0,
      disposableEmail: true,
      previousPaidOrders: 0,
      totalAgorot: 500_000,
      ordersFromIpLastHour: 9,
      giftToOtherRecipient: true,
      discountShareBps: 10_000,
    })
    expect([...everything.reasons].sort()).toEqual(Object.keys(RISK_REASONS).sort())
  })

  it('places the bands where the constants say they are', () => {
    expect(ELEVATED_THRESHOLD).toBeLessThan(REVIEW_THRESHOLD)
    const justUnder = assessRisk({ ...calm, accountAgeMinutes: 1, giftToOtherRecipient: true })
    expect(justUnder.score).toBe(20)
    expect(justUnder.band).toBe('elevated')
  })
})

describe('riskReasonText', () => {
  it('gives a Hebrew sentence for every reason', () => {
    for (const reason of Object.keys(RISK_REASONS)) {
      expect(riskReasonText(reason)).toMatch(/[֐-׿]/)
    }
  })

  it('hands back an unknown reason rather than rendering "undefined"', () => {
    // Old rows survive a re-tuning of the table. The queue must render them.
    expect(riskReasonText('retired_signal')).toBe('retired_signal')
  })
})
