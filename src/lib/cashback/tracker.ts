import { type Agorot, agorot, sumAgorot } from '@/lib/money'
import {
  EVERY_FIFTH_PURCHASE_CASHBACK_BP,
  FIRST_PURCHASE_CASHBACK_BP,
  cashbackRateBp,
} from './engine'
import { CASHBACK_LIFETIME_MONTHS, cashbackExpiresAt } from './expiry'

/**
 * The customer-facing cashback tracker, as pure arithmetic over rows the
 * account area already reads under RLS. Nothing here moves money: the
 * database owns the award (`fn_cashback_order_bonus`, migration 177) and the
 * expiry (`fn_cashback_expire`, migration 215). This module answers the three
 * questions /account/cashback shows and nothing else:
 *
 *   1. how much cashback this account has earned over its lifetime,
 *   2. which of those credits lapses next and when,
 *   3. how many more paid orders until the next bonus.
 *
 * THE RANK MIRRORS THE SQL, NOT THE ENGINE. `fn_cashback_order_bonus` ranks an
 * order as `count(paid orders other than this one) + 1`, so the Nth paid order
 * is purchase number N. The engine's `cashbackRateBp(N)` then says what N
 * earns. Both are reused here rather than restated, so a rate change in one
 * place moves the tracker with it.
 *
 * Every amount is integer agorot through `money.ts`; no float touches a value.
 */

/** The ledger reasons that are cashback credits. `order_cashback` is the
 *  per-item cashback finalize.ts posts; `cashback_bonus` is the order-count
 *  bonus 177 posts. Both lapse under 215's twelve-month rule. */
export const CASHBACK_CREDIT_REASONS = new Set(['order_cashback', 'cashback_bonus'])

/** The bonus window: every fifth paid order. */
export const BONUS_EVERY_N_PURCHASES = 5

export interface CashbackLedgerCredit {
  /** Integer agorot, the credited magnitude. */
  amountAgorot: Agorot
  /** ISO timestamp the credit landed in the wallet. */
  createdAt: string
}

export interface LedgerRowLike {
  direction: 'credit' | 'debit'
  amountAgorot: Agorot
  reason: string
  createdAt: string
}

export interface NextBonus {
  /** 1-based number of the purchase that earns the next bonus. */
  purchaseNumber: number
  /** Paid orders still needed before that purchase, 1 when the next order earns it. */
  purchasesAway: number
  /** Rate that purchase earns, in basis points. */
  rateBp: number
  /** 0..100 fill for a progress bar toward the next bonus purchase. */
  progressPercent: number
}

/**
 * Where the customer stands toward the next bonus, given how many orders they
 * have already paid for. Zero paid orders means the next one is the first, at
 * 10%. Otherwise the next multiple of five, at 5%.
 */
export function nextBonus(paidOrderCount: number): NextBonus {
  if (!Number.isSafeInteger(paidOrderCount) || paidOrderCount < 0) {
    throw new RangeError(`paidOrderCount must be a non-negative integer (got ${paidOrderCount})`)
  }
  const nextPurchase = paidOrderCount + 1
  if (nextPurchase === 1) {
    return {
      purchaseNumber: 1,
      purchasesAway: 1,
      rateBp: FIRST_PURCHASE_CASHBACK_BP,
      progressPercent: 0,
    }
  }
  const bonusPurchase = Math.ceil(nextPurchase / BONUS_EVERY_N_PURCHASES) * BONUS_EVERY_N_PURCHASES
  const purchasesAway = bonusPurchase - paidOrderCount
  // The window the customer is inside: the five purchases ending at the bonus.
  const windowStart = bonusPurchase - BONUS_EVERY_N_PURCHASES
  const done = paidOrderCount - windowStart
  return {
    purchaseNumber: bonusPurchase,
    purchasesAway,
    rateBp: cashbackRateBp(bonusPurchase),
    progressPercent: Math.round((done * 100) / BONUS_EVERY_N_PURCHASES),
  }
}

/** Engine rate for a bonus purchase, exported so the page can name it. */
export const BONUS_RATE_BP = EVERY_FIFTH_PURCHASE_CASHBACK_BP

export interface ExpiringCredit {
  /** Integer agorot of this credit still unconsumed by later debits. */
  remainingAgorot: Agorot
  /** The day the credit stops being spendable. */
  expiresAt: Date
  /** When the credit was earned. */
  earnedAt: Date
}

/**
 * Which credits are still alive and when each one lapses.
 *
 * Debits consume the OLDEST cashback first, the same customer-favourable
 * reading `expirableCashbackAgorot` uses for the sweep itself: every debit the
 * wallet ever made (spends, clawbacks, earlier expiries) is subtracted from
 * the credits in the order they were earned. What survives is what the sweep
 * will take on the first run after each credit's twelfth month.
 *
 * Credits already past `now` are omitted: the sweep either took them already
 * or will on its next run, and telling a customer "this lapsed yesterday" for
 * money that is still in their balance is worse than saying nothing.
 */
export function liveCashbackCredits(rows: LedgerRowLike[], now: Date): ExpiringCredit[] {
  const credits = rows
    .filter((row) => row.direction === 'credit' && CASHBACK_CREDIT_REASONS.has(row.reason))
    .map((row) => ({ amountAgorot: row.amountAgorot, earnedAt: new Date(row.createdAt) }))
    .sort((a, b) => a.earnedAt.getTime() - b.earnedAt.getTime())

  let debits = sumAgorot(
    rows.filter((row) => row.direction === 'debit').map((row) => row.amountAgorot),
  ) as number

  const live: ExpiringCredit[] = []
  for (const credit of credits) {
    const consumed = Math.min(debits, credit.amountAgorot)
    debits -= consumed
    const remaining = agorot(credit.amountAgorot - consumed)
    if (remaining <= 0) continue
    const expiresAt = cashbackExpiresAt(credit.earnedAt)
    if (expiresAt.getTime() <= now.getTime()) continue
    live.push({ remainingAgorot: remaining, expiresAt, earnedAt: credit.earnedAt })
  }
  return live
}

export interface CashbackOverview {
  /** Every cashback credit ever posted, integer agorot. */
  lifetimeEarnedAgorot: Agorot
  /** Credits still unconsumed and not yet lapsed, integer agorot. */
  liveAgorot: Agorot
  /** The soonest-lapsing live credit, or null when nothing is alive. */
  nextToExpire: ExpiringCredit | null
  /** Live credits lapsing within `soonDays` of now, integer agorot. */
  expiringSoonAgorot: Agorot
}

/** How far ahead "expiring soon" looks. */
export const EXPIRING_SOON_DAYS = 30

export function cashbackOverview(
  rows: LedgerRowLike[],
  now: Date,
  soonDays = EXPIRING_SOON_DAYS,
): CashbackOverview {
  const lifetimeEarnedAgorot = sumAgorot(
    rows
      .filter((row) => row.direction === 'credit' && CASHBACK_CREDIT_REASONS.has(row.reason))
      .map((row) => row.amountAgorot),
  )
  const live = liveCashbackCredits(rows, now)
  const soonCutoff = new Date(now.getTime() + soonDays * 24 * 60 * 60 * 1000)
  return {
    lifetimeEarnedAgorot,
    liveAgorot: sumAgorot(live.map((c) => c.remainingAgorot)),
    nextToExpire: live[0] ?? null,
    expiringSoonAgorot: sumAgorot(
      live
        .filter((c) => c.expiresAt.getTime() <= soonCutoff.getTime())
        .map((c) => c.remainingAgorot),
    ),
  }
}

/** Hebrew label per `cashback_ledger.entry_type` (constraint in 177 and 215). */
export const CASHBACK_ENTRY_LABELS: Record<string, string> = {
  order_item: 'קאשבק על מוצר',
  first_purchase_bonus: 'בונוס רכישה ראשונה',
  fifth_purchase_bonus: 'בונוס רכישה חמישית',
  admin_adjustment: 'התאמה ידנית',
  expiry: 'פקיעה',
}

export function cashbackEntryLabel(entryType: string): string {
  return CASHBACK_ENTRY_LABELS[entryType] ?? entryType
}

export { CASHBACK_LIFETIME_MONTHS }
