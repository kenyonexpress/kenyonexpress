/**
 * What a supplier still needs before it can trade, as an ordered checklist.
 *
 * Creating a supplier row is the easy half. The half that was missing is that
 * nobody could reach it: `supplier_members` is what the supplier portal reads
 * to decide who may scan a voucher (`src/lib/supplier/rbac.ts`), and the admin
 * had no screen that writes it. A supplier could therefore be complete,
 * published, and selling, with no member able to redeem anything at the
 * counter.
 *
 * Pure, so the checklist the admin sees and the gate that blocks publishing
 * cannot disagree.
 */

import { type RequiredSupplierField, supplierReadiness } from './supplier-form'

export const MEMBER_ROLES = ['owner', 'manager', 'scanner'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'בעלים',
  manager: 'מנהל',
  scanner: 'סורק',
}

export interface OnboardingStep {
  key: 'identity' | 'active' | 'members' | 'products'
  title: string
  /** What the admin has to do, when it is not done. */
  todo: string
  done: boolean
  /** Where to go to do it, relative to the supplier page. */
  blocking: boolean
}

export interface OnboardingInput {
  supplier: Partial<Record<RequiredSupplierField, string | null | undefined>> & {
    status?: string | null
  }
  activeMemberCount: number
  productCount: number
  publishedProductCount: number
}

/**
 * The steps, in the order they unblock each other.
 *
 * `blocking` marks the ones that stop the supplier trading at all, as opposed
 * to merely leaving it empty. A supplier with no products is not broken, it is
 * new; a supplier with no active member cannot honour a voucher a customer has
 * already paid for, which is a different kind of missing.
 */
export function onboardingSteps(input: OnboardingInput): OnboardingStep[] {
  const readiness = supplierReadiness(input.supplier)
  const identityDone = readiness.missing.length === 0

  return [
    {
      key: 'identity',
      title: 'פרטי זהות',
      todo: identityDone
        ? ''
        : `חסרים: ${readiness.missingLabels.join(', ')}. בלעדיהם אי אפשר לפרסם מוצר של הספק.`,
      done: identityDone,
      blocking: true,
    },
    {
      key: 'active',
      title: 'סטטוס פעיל',
      todo: input.supplier.status === 'active' ? '' : 'הספק מסומן כלא פעיל, ומוצריו לא יתפרסמו.',
      done: input.supplier.status === 'active',
      blocking: true,
    },
    {
      key: 'members',
      title: 'גישת צוות',
      todo:
        input.activeMemberCount > 0
          ? ''
          : 'אף משתמש לא משויך לספק, ולכן אין מי שיסרוק שובר בבית העסק.',
      done: input.activeMemberCount > 0,
      blocking: true,
    },
    {
      key: 'products',
      title: 'מוצרים',
      todo:
        input.productCount === 0
          ? 'אין מוצרים משויכים לספק.'
          : input.publishedProductCount === 0
            ? `${input.productCount} מוצרים משויכים, אף אחד לא פעיל.`
            : '',
      done: input.publishedProductCount > 0,
      blocking: false,
    },
  ]
}

export interface OnboardingSummary {
  steps: OnboardingStep[]
  doneCount: number
  total: number
  /** True when nothing blocking is outstanding. */
  canTrade: boolean
}

export function summarizeOnboarding(input: OnboardingInput): OnboardingSummary {
  const steps = onboardingSteps(input)
  return {
    steps,
    doneCount: steps.filter((s) => s.done).length,
    total: steps.length,
    canTrade: steps.every((s) => s.done || !s.blocking),
  }
}
