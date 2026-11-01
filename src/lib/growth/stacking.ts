import {
  type CapReason,
  type DiscountCampaign,
  type DiscountFailure,
  evaluateDiscount,
} from '@/lib/growth/discount'

/**
 * Stacking: what a SET of campaign codes is worth against one cart.
 *
 * Pure, like `evaluateDiscount`, which does all the per-code judging. This
 * module only decides how codes COMBINE:
 *
 * 1. `allow_stacking = false` means EXCLUSIVE, in both directions. A
 *    non-stackable code cannot join an existing stack, and nothing can join a
 *    stack whose member is non-stackable. One flag, one meaning; a code that
 *    is "exclusive except when it came first" would be two.
 *
 * 2. Codes apply IN THE ORDER THE SHOPPER ADDED THEM, each against what the
 *    previous ones left: the payable shrinks by every earlier discount, and so
 *    does the commission ceiling, because rule 2 of `discount.ts` - the
 *    discount is the platform's money and never the supplier's - is a property
 *    of the TOTAL, not of each code alone. Two 60% codes on a cart with 100
 *    agorot of commission yield 100, not 120.
 *
 * 3. At most MAX_STACKED_CODES. The cap is a fraud brake, not a UX judgement:
 *    every extra slot multiplies the combinations an abuser can probe.
 *
 * A refused code refuses ALONE: the codes before it keep their evaluation and
 * the codes after it are still tried, so one expired code in the middle of a
 * stack costs the shopper that code and nothing else. The truthful-cart rule
 * (`resolveAppliedCoupon`): what stopped being valid renders as if never
 * applied.
 *
 * The legacy `public.coupons` table and printed QR unit codes never stack -
 * they do not reach this module. The cart applies them single, as before.
 */

export const MAX_STACKED_CODES = 3

export interface StackedDiscount {
  campaignId: string
  code: string
  label: string
  discountAgorot: number
  cappedBy: CapReason | null
}

export interface StackRefusal {
  code: string
  reason: DiscountFailure | 'stack-full'
  message: string
}

export interface StackEvaluation {
  applied: StackedDiscount[]
  totalAgorot: number
  refused: StackRefusal[]
}

export interface StackCartFacts {
  /** What the shopper pays on this site, in agorot. */
  payableAgorot: number
  /** The platform's commission across the cart, in agorot. The shared ceiling. */
  commissionAgorot: number
  /** True when the cart holds a gift card; nothing is discountable then. */
  giftCardInCart?: boolean
}

const STACK_FULL_MESSAGE = 'ניתן לשלב עד שלושה קודים בהזמנה אחת'

/**
 * `campaigns` arrives in application order, one entry per code the shopper
 * applied, `null` where the code resolved to no campaign (deleted since, or
 * never one). Duplicates of a campaign already applied are refused as
 * 'stacking-not-allowed' rather than silently deduped, because "I entered it
 * twice and the total did not move" reads as a broken cart.
 */
export function evaluateDiscountStack(
  campaigns: readonly (DiscountCampaign | null)[],
  cart: StackCartFacts,
  now: Date,
): StackEvaluation {
  const applied: (StackedDiscount & { exclusive: boolean })[] = []
  const refused: StackRefusal[] = []

  let remainingPayable = cart.payableAgorot
  let remainingCommission = cart.commissionAgorot

  for (const campaign of campaigns) {
    if (!campaign) {
      refused.push({ code: '', reason: 'unknown', message: 'קוד ההנחה לא נמצא' })
      continue
    }
    if (applied.length >= MAX_STACKED_CODES) {
      refused.push({ code: campaign.code, reason: 'stack-full', message: STACK_FULL_MESSAGE })
      continue
    }
    const alreadyApplied = applied.some((entry) => entry.campaignId === campaign.id)
    const joinsOthers = applied.length > 0
    const blockedByExclusive =
      joinsOthers && (!campaign.allow_stacking || applied.some((entry) => entry.exclusive))
    if (alreadyApplied || blockedByExclusive) {
      refused.push({
        code: campaign.code,
        reason: 'stacking-not-allowed',
        message: 'לא ניתן לצרף את הקוד הזה לקוד אחר',
      })
      continue
    }

    const evaluation = evaluateDiscount(
      campaign,
      {
        payableAgorot: remainingPayable,
        commissionAgorot: remainingCommission,
        // The exclusivity rules above already decided the combination, so the
        // engine's own single-flag check must not re-refuse a legal stack.
        hasOtherDiscount: false,
        giftCardInCart: cart.giftCardInCart,
      },
      now,
    )
    if (!evaluation.ok) {
      refused.push({ code: campaign.code, reason: evaluation.reason, message: evaluation.message })
      continue
    }

    applied.push({
      campaignId: evaluation.campaignId,
      code: evaluation.code,
      label: evaluation.label,
      discountAgorot: evaluation.discountAgorot,
      cappedBy: evaluation.cappedBy,
      exclusive: !campaign.allow_stacking,
    })
    remainingPayable -= evaluation.discountAgorot
    remainingCommission -= evaluation.discountAgorot
  }

  return {
    applied: applied.map(({ exclusive: _exclusive, ...entry }) => entry),
    totalAgorot: applied.reduce((sum, entry) => sum + entry.discountAgorot, 0),
    refused,
  }
}
