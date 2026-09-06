import { describe, expect, it } from 'vitest'
import {
  MAX_TOPUP_AGOROT,
  MIN_TOPUP_AGOROT,
  TOPUP_TRANSITIONS,
  WITHDRAWAL_RULE,
  isLegalTopupTransition,
  planWalletTopup,
} from './wallet-topup'

const OK = { userId: 'user-1', topupId: 'topup-1' }

describe('planWalletTopup', () => {
  it('plans a top-up in agorot and converts to shekels once', () => {
    const plan = planWalletTopup({ ...OK, amountAgorot: 12_345 })
    expect(plan).toEqual({
      ok: true,
      amountAgorot: 12_345,
      amountIls: 123.45,
      idempotencyKey: 'topup:topup-1',
    })
  })

  it('keys off the top-up id and not the Cardcom page', () => {
    // Cardcom can issue a second Low Profile page for one intent. Keying on
    // that id would let both pages credit the same wallet.
    const a = planWalletTopup({ ...OK, amountAgorot: 5_000 })
    const b = planWalletTopup({ ...OK, amountAgorot: 5_000 })
    expect(a.ok && b.ok && a.idempotencyKey === b.idempotencyKey).toBe(true)
  })

  it('refuses a guest', () => {
    expect(planWalletTopup({ ...OK, userId: null, amountAgorot: 5_000 })).toEqual({
      ok: false,
      reason: 'not_signed_in',
    })
  })

  it('refuses a fractional agora, which is a float that got this far', () => {
    expect(planWalletTopup({ ...OK, amountAgorot: 5_000.5 })).toEqual({
      ok: false,
      reason: 'amount_not_integer',
    })
  })

  it('holds both bounds, inclusively', () => {
    expect(planWalletTopup({ ...OK, amountAgorot: MIN_TOPUP_AGOROT }).ok).toBe(true)
    expect(planWalletTopup({ ...OK, amountAgorot: MIN_TOPUP_AGOROT - 1 })).toEqual({
      ok: false,
      reason: 'amount_below_minimum',
    })
    expect(planWalletTopup({ ...OK, amountAgorot: MAX_TOPUP_AGOROT }).ok).toBe(true)
    expect(planWalletTopup({ ...OK, amountAgorot: MAX_TOPUP_AGOROT + 1 })).toEqual({
      ok: false,
      reason: 'amount_above_maximum',
    })
  })

  it('matches the bounds the migration enforces', () => {
    // The CHECK in 174 is the enforcement; these constants are what the UI and
    // the action refuse with first. If they disagree, a customer is told a
    // number the database then rejects.
    const sql = require('node:fs').readFileSync(
      'migrations/pending/174_wallet_topups.sql',
      'utf8',
    ) as string
    expect(sql).toContain(`between ${MIN_TOPUP_AGOROT} and ${MAX_TOPUP_AGOROT}`)
  })
})

describe('the top-up state machine', () => {
  it('cannot succeed without being redirected first', () => {
    expect(isLegalTopupTransition('initiated', 'succeeded')).toBe(false)
    expect(isLegalTopupTransition('initiated', 'redirected')).toBe(true)
    expect(isLegalTopupTransition('redirected', 'succeeded')).toBe(true)
  })

  it('leaves both terminal states terminal', () => {
    expect(TOPUP_TRANSITIONS.succeeded).toEqual([])
    expect(TOPUP_TRANSITIONS.failed).toEqual([])
    expect(isLegalTopupTransition('failed', 'redirected')).toBe(false)
    expect(isLegalTopupTransition('succeeded', 'failed')).toBe(false)
  })

  it('allows a move to the same state, because an unrelated update is not a move', () => {
    expect(isLegalTopupTransition('redirected', 'redirected')).toBe(true)
  })
})

describe('the withdrawal rule', () => {
  it('says no in every direction, and in the same words as the terms', () => {
    expect(WITHDRAWAL_RULE.withdrawable).toBe(false)
    expect(WITHDRAWAL_RULE.transferable).toBe(false)
    expect(WITHDRAWAL_RULE.convertibleToCash).toBe(false)

    const terms = require('node:fs').readFileSync(
      'src/app/(legal)/_content/terms.ts',
      'utf8',
    ) as string
    expect(terms).toContain(WITHDRAWAL_RULE.noticeHe)
  })
})
