import { type Agorot, agorot, agorotToIls } from '@/lib/commerce/money'

/**
 * Putting money INTO a wallet with a card: the decision, without the table.
 *
 * WHY THE TABLE IS NOT HERE YET. `payments.order_id` is `NOT NULL` in
 * production and `payment_kind` has exactly two values, `charge` and `refund`
 * (measured 2026-09-07). A top-up has no order, so it cannot be a `payments`
 * row without making that column nullable -- and every reader on the money path
 * finds the charge BY `order_id`. `migrations/pending/174_wallet_topups.sql`
 * is the table this module is written against; it is not applied, and applying
 * a migration is one of the project's hard stops.
 *
 * So this file is the half that can be correct today: the bounds, the state
 * machine and the idempotency key are decisions, not storage, and they are
 * tested without a database. The action and the callback branch are written
 * when 174 is applied, and they will have nothing left to decide.
 *
 * THE BALANCE STILL DOES NOT COME OUT. A wallet that can be filled by card and
 * never emptied to one is exactly what the terms describe: site credit, not
 * withdrawable, not transferable, not convertible to cash
 * (`src/app/(legal)/_content/terms.ts`). Nothing here changes that, and
 * `withdrawalRule()` below is that sentence as code so a future caller cannot
 * quietly assume otherwise.
 */

/** 20 shekels. Below this the card fee is a large fraction of the top-up. */
export const MIN_TOPUP_AGOROT = 2_000
/**
 * 5,000 shekels. A ceiling makes a stolen card a bounded loss and keeps the
 * wallet from becoming a way to move large sums into store credit. It is the
 * same number as the CHECK in 174, and the CHECK is what enforces it.
 */
export const MAX_TOPUP_AGOROT = 500_000

export type TopupState = 'initiated' | 'redirected' | 'succeeded' | 'failed'

/**
 * Legal moves. `succeeded` and `failed` are terminal: a top-up that failed is
 * retried by starting another one, because the first attempt is part of the
 * record and Cardcom has its own transaction for it.
 */
export const TOPUP_TRANSITIONS: Readonly<Record<TopupState, readonly TopupState[]>> = {
  initiated: ['redirected', 'failed'],
  redirected: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
}

export function isLegalTopupTransition(from: TopupState, to: TopupState): boolean {
  if (from === to) return true
  return (TOPUP_TRANSITIONS[from] ?? []).includes(to)
}

export type TopupRefusal =
  | 'not_signed_in'
  | 'amount_not_integer'
  | 'amount_below_minimum'
  | 'amount_above_maximum'

export type TopupPlan =
  | {
      ok: true
      amountAgorot: Agorot
      /** `fn_wallet_transfer` takes shekels; converted once, here, through money.ts. */
      amountIls: number
      /**
       * Derived from the top-up row's own id, so a replayed callback for the
       * same top-up credits once. Not from the low profile id: Cardcom can
       * issue a second page for one intent, and both would then credit.
       */
      idempotencyKey: string
    }
  | { ok: false; reason: TopupRefusal }

export function planWalletTopup(input: {
  userId: string | null
  topupId: string
  amountAgorot: number
}): TopupPlan {
  if (!input.userId) return { ok: false, reason: 'not_signed_in' }
  if (!Number.isInteger(input.amountAgorot)) return { ok: false, reason: 'amount_not_integer' }
  if (input.amountAgorot < MIN_TOPUP_AGOROT) return { ok: false, reason: 'amount_below_minimum' }
  if (input.amountAgorot > MAX_TOPUP_AGOROT) return { ok: false, reason: 'amount_above_maximum' }

  const amount = agorot(input.amountAgorot)
  return {
    ok: true,
    amountAgorot: amount,
    amountIls: agorotToIls(amount),
    idempotencyKey: `topup:${input.topupId}`,
  }
}

/**
 * The withdrawal rule, as a value rather than a paragraph.
 *
 * There is no withdrawal path and there is not meant to be one. This exists so
 * that a screen or an action asking "can this balance be paid out" gets an
 * answer from the same place the terms do, instead of each caller deciding.
 */
export const WITHDRAWAL_RULE = {
  withdrawable: false,
  transferable: false,
  convertibleToCash: false,
  /** Hebrew, ready to render, and the same sentence the terms carry. */
  noticeHe: 'יתרת הארנק היא קרדיט לרכישות באתר בלבד, ואינה ניתנת למשיכה, להעברה או להמרה למזומן.',
} as const
