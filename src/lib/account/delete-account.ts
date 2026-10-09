/**
 * The pure half of account deletion. The action does the IO; every decision
 * that can be wrong lives here, where a test can reach it.
 */

/**
 * Typed, not clicked. A checkbox confirms that a finger slipped; typing this
 * phrase confirms that a person read it. The deletion is irreversible -- the
 * profile is anonymized in place and the login is disabled -- so the
 * confirmation bar is the highest one a form can ask for.
 */
export const DELETE_CONFIRMATION_PHRASE = 'מחק את החשבון שלי'

export type DeletionRefusal = 'not_signed_in' | 'confirmation_mismatch'

export type DeletionPlan =
  | { ok: true; userId: string }
  | { ok: false; reason: DeletionRefusal; message: string }

export function planAccountDeletion(input: {
  userId: string | null
  confirmation: unknown
}): DeletionPlan {
  if (!input.userId) {
    return { ok: false, reason: 'not_signed_in', message: 'יש להתחבר' }
  }
  // Trimmed, because a trailing space from an autocomplete keyboard is not a
  // failure of intent. NOT case-folded or fuzzed beyond that: the phrase is
  // the safety margin, and a lenient match erodes exactly the property it
  // exists for.
  const typed = typeof input.confirmation === 'string' ? input.confirmation.trim() : ''
  if (typed !== DELETE_CONFIRMATION_PHRASE) {
    return {
      ok: false,
      reason: 'confirmation_mismatch',
      message: `יש להקליד "${DELETE_CONFIRMATION_PHRASE}" בדיוק כדי לאשר`,
    }
  }
  return { ok: true, userId: input.userId }
}

/**
 * What the erasure leaves behind, written once so the action, the UI copy and
 * the tests describe the same event.
 *
 * KEPT: orders, payments, invoices, audit rows -- bookkeeping with a statutory
 * 7-year retention; the anonymized profile row they point at stays as their
 * anchor. ERASED: name, email, phone, addresses, saved cards, push tokens,
 * carts, recent searches, and the ability to log in.
 */
export const DELETION_EFFECTS = {
  kept: ['orders', 'payments', 'invoices', 'audit_log'],
  erased: [
    'profiles.email',
    'profiles.full_name',
    'profiles.phone',
    'user_addresses',
    'payment_tokens',
    'push_tokens',
    'carts',
    'user_recent_searches',
    'auth login',
  ],
} as const
