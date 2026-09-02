import {
  DELETE_CONFIRMATION_PHRASE,
  DELETION_EFFECTS,
  planAccountDeletion,
} from '@/lib/account/delete-account'
import { describe, expect, it } from 'vitest'

describe('the two gates before an account dies', () => {
  it('refuses without a session', () => {
    const plan = planAccountDeletion({ userId: null, confirmation: DELETE_CONFIRMATION_PHRASE })
    expect(plan.ok).toBe(false)
    if (!plan.ok) expect(plan.reason).toBe('not_signed_in')
  })

  it('accepts the exact phrase', () => {
    const plan = planAccountDeletion({ userId: 'u1', confirmation: DELETE_CONFIRMATION_PHRASE })
    expect(plan).toEqual({ ok: true, userId: 'u1' })
  })

  // A trailing space from an autocomplete keyboard is not a failure of intent.
  it('tolerates surrounding whitespace and nothing else', () => {
    expect(
      planAccountDeletion({ userId: 'u1', confirmation: `  ${DELETE_CONFIRMATION_PHRASE}  ` }).ok,
    ).toBe(true)
  })

  // The phrase IS the safety margin; a lenient match erodes exactly the
  // property it exists for.
  it('refuses anything that is not the phrase', () => {
    for (const wrong of [
      '',
      'מחק',
      'מחק את החשבון',
      DELETE_CONFIRMATION_PHRASE.slice(0, -1),
      DELETE_CONFIRMATION_PHRASE.toUpperCase(), // no letters change case in Hebrew, but the guard is exact-match
      null,
      undefined,
      42,
    ]) {
      const plan = planAccountDeletion({ userId: 'u1', confirmation: wrong })
      if (typeof wrong === 'string' && wrong.trim() === DELETE_CONFIRMATION_PHRASE) continue
      expect(plan.ok, String(wrong)).toBe(false)
    }
  })
})

describe('what the erasure leaves behind', () => {
  // Bookkeeping with a statutory retention period is KEPT; everything personal
  // is erased. The UI copy and the SQL function both describe this list.
  it('keeps the books and erases the person', () => {
    expect(DELETION_EFFECTS.kept).toContain('orders')
    expect(DELETION_EFFECTS.kept).toContain('invoices')
    expect(DELETION_EFFECTS.kept).toContain('audit_log')
    expect(DELETION_EFFECTS.erased).toContain('payment_tokens')
    expect(DELETION_EFFECTS.erased).toContain('auth login')
    // Nothing may appear on both sides.
    const kept = new Set<string>(DELETION_EFFECTS.kept)
    for (const erased of DELETION_EFFECTS.erased) expect(kept.has(erased)).toBe(false)
  })
})
