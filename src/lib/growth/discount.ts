// Site-wide discount campaigns (`public.discount_campaigns`).
//
// Pure. No IO, no clock of its own, no database. Everything it needs arrives as
// an argument, which is what lets the whole judgement be unit tested without a
// cart, a session or a network.
//
// THREE RULES GOVERN THIS MODULE.
//
// 1. AGOROT, INTEGERS, EVERYWHERE. Every amount in and out is an integer number
//    of agorot. Percentages arrive as BASIS POINTS (1000 = 10%), so there is no
//    float anywhere in the path and no way to confuse 0.125 with 12.5.
//
// 2. THE DISCOUNT IS THE PLATFORM'S MONEY. It comes out of the platform
//    commission and never out of the supplier's share, exactly as 05a181a
//    established. The supplier never offered the code and never agreed to fund
//    it. That is why `commissionAgorot` is a hard ceiling here: past it, a
//    "discount" is the platform paying a supplier out of its own pocket, which
//    is a transfer and not a discount.
//
// 3. WHAT IS PAID AT THE BUSINESS IS NOT OURS TO DISCOUNT. A coupon product is
//    charged partly on the site and partly at the till. Only the first part is
//    discountable; reducing the second would hand the shopper money out of the
//    supplier's register. The caller passes only the on-site payable amount.

export type DiscountCampaign = {
  id: string
  code: string
  name: string
  kind: 'percent' | 'fixed'
  percent_bp: number | null
  amount_agorot: number | null
  min_order_agorot: number
  max_discount_agorot: number | null
  starts_at: string | null
  expires_at: string | null
  max_uses: number | null
  max_uses_per_user: number
  used_count: number
  allow_stacking: boolean
  is_active: boolean
}

export type DiscountFailure =
  | 'unknown'
  | 'inactive'
  | 'not-started'
  | 'expired'
  | 'exhausted'
  | 'below-minimum'
  | 'nothing-to-discount'
  | 'no-commission'
  | 'stacking-not-allowed'

export type DiscountEvaluation =
  | {
      ok: true
      campaignId: string
      code: string
      discountAgorot: number
      label: string
      cappedBy: CapReason | null
    }
  | { ok: false; reason: DiscountFailure; message: string }

/** Which ceiling actually bound the result. Reported so the UI can explain it. */
export type CapReason = 'max-discount' | 'commission' | 'payable'

const MESSAGES: Record<DiscountFailure, string> = {
  unknown: 'קוד ההנחה לא נמצא',
  inactive: 'קוד ההנחה אינו פעיל',
  'not-started': 'קוד ההנחה עדיין לא נכנס לתוקף',
  expired: 'תוקף קוד ההנחה פג',
  exhausted: 'קוד ההנחה מוצה',
  'below-minimum': 'הסכום בעגלה נמוך מהמינימום לקוד הזה',
  'nothing-to-discount': 'אין סכום לחיוב באתר שעליו אפשר להחיל את הקוד',
  'no-commission': 'לא ניתן להחיל את הקוד על העגלה הזו',
  'stacking-not-allowed': 'לא ניתן לצרף את הקוד הזה לקוד אחר',
}

/**
 * Codes are compared after normalising, and stored already normalised (the DB
 * CHECK enforces it). Matching is therefore an equality on an indexed column
 * rather than an ILIKE, which cannot use one.
 */
export function normalizeDiscountCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, '').toUpperCase() : ''
}

export type DiscountCartFacts = {
  /** What the shopper pays on this site, in agorot. The discountable base. */
  payableAgorot: number
  /**
   * The platform's commission across the cart, in agorot. The hard ceiling.
   * Rule 2: the discount is funded from here and from nowhere else.
   */
  commissionAgorot: number
  /** True when another code is already applied. */
  hasOtherDiscount?: boolean
}

function fail(reason: DiscountFailure): DiscountEvaluation {
  return { ok: false, reason, message: MESSAGES[reason] }
}

/**
 * Percentage of an agorot amount, in basis points, rounded half-up.
 *
 * Integer arithmetic only: `Math.round(a * bp / 10000)` on values this size
 * stays well inside the safe integer range, and the rounding is done once
 * rather than accumulated across lines.
 */
export function percentOfAgorot(amountAgorot: number, basisPoints: number): number {
  return Math.round((amountAgorot * basisPoints) / 10_000)
}

/** Human label for the badge next to the applied code. */
function labelFor(campaign: DiscountCampaign): string {
  if (campaign.kind === 'percent' && campaign.percent_bp !== null) {
    const percent = campaign.percent_bp / 100
    // 10 rather than 10.0, but 12.5 kept.
    const shown = Number.isInteger(percent) ? String(percent) : percent.toFixed(1)
    return `${shown}%- הנחה`
  }
  return 'הנחה'
}

/**
 * Decides what a campaign is worth against one cart, at one instant.
 *
 * `now` is a parameter and not `new Date()` so expiry is testable and so a
 * single request judges every campaign against the same moment.
 */
export function evaluateDiscount(
  campaign: DiscountCampaign | null,
  cart: DiscountCartFacts,
  now: Date,
): DiscountEvaluation {
  if (!campaign) return fail('unknown')
  if (!campaign.is_active) return fail('inactive')

  if (campaign.starts_at && new Date(campaign.starts_at) > now) return fail('not-started')
  if (campaign.expires_at && new Date(campaign.expires_at) <= now) return fail('expired')

  // A soft check only. The authoritative one is inside fn_claim_discount, which
  // holds a row lock; this exists so the cart can say "exhausted" before the
  // shopper reaches the payment page rather than after.
  if (campaign.max_uses !== null && campaign.used_count >= campaign.max_uses) {
    return fail('exhausted')
  }

  // Stacking is off unless the campaign opts in, per the goal. Checked before
  // the amount so a rejected stack never quotes a number the cart will not honour.
  if (cart.hasOtherDiscount && !campaign.allow_stacking) return fail('stacking-not-allowed')

  if (cart.payableAgorot <= 0) return fail('nothing-to-discount')
  if (cart.payableAgorot < campaign.min_order_agorot) return fail('below-minimum')

  // Rule 2, enforced. With no commission on this cart there is nothing to fund
  // a discount from, and taking it anyway would come out of the supplier.
  if (cart.commissionAgorot <= 0) return fail('no-commission')

  const gross =
    campaign.kind === 'percent'
      ? percentOfAgorot(cart.payableAgorot, campaign.percent_bp ?? 0)
      : (campaign.amount_agorot ?? 0)

  // Three ceilings, applied in this order, tracking which one bound so the UI
  // can explain a discount that came out smaller than the code advertises.
  let discount = gross
  let cappedBy: CapReason | null = null

  if (campaign.max_discount_agorot !== null && discount > campaign.max_discount_agorot) {
    discount = campaign.max_discount_agorot
    cappedBy = 'max-discount'
  }
  if (discount > cart.commissionAgorot) {
    discount = cart.commissionAgorot
    cappedBy = 'commission'
  }
  // The charge can never go negative, whatever the code says.
  if (discount > cart.payableAgorot) {
    discount = cart.payableAgorot
    cappedBy = 'payable'
  }

  if (discount <= 0) return fail('nothing-to-discount')

  return {
    ok: true,
    campaignId: campaign.id,
    code: campaign.code,
    discountAgorot: discount,
    label: labelFor(campaign),
    cappedBy,
  }
}
