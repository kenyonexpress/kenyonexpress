import { type Agorot, agorot, parseIls } from '@/lib/money'

/**
 * What a supplier may propose as a new sticker price, checked before the row
 * exists and again by the admin before it is applied.
 *
 * Money is integer agorot end to end (src/lib/money.ts); the form takes
 * shekels as text and `parseIls` is the only conversion. The bounds are the
 * table's CHECK (migration 232) restated so the form can refuse with a
 * sentence instead of a 23514.
 */
export const MAX_PROPOSAL_AGOROT = agorot(10_000_000) // ₪100,000
export const MIN_PROPOSAL_AGOROT = agorot(100) // ₪1
export const MAX_PROPOSAL_NOTE_LENGTH = 1000

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export const PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  'pending',
  'approved',
  'rejected',
  'withdrawn',
] as const

export function isProposalStatus(raw: unknown): raw is ProposalStatus {
  return typeof raw === 'string' && (PROPOSAL_STATUSES as readonly string[]).includes(raw)
}

export type ProposalValidation = { ok: true; agorot: Agorot } | { ok: false; error: string }

/**
 * @param rawIls what the supplier typed, shekels
 * @param currentAgorot the product's sticker price now, or null when unset
 */
export function validateProposedPrice(
  rawIls: unknown,
  currentAgorot: Agorot | null,
): ProposalValidation {
  const text = typeof rawIls === 'number' ? String(rawIls) : String(rawIls ?? '').trim()
  if (text.length === 0) return { ok: false, error: 'יש להזין מחיר.' }
  let proposed: Agorot
  try {
    proposed = parseIls(text)
  } catch {
    return { ok: false, error: 'המחיר אינו מספר תקין.' }
  }
  if (!Number.isInteger(proposed) || proposed < MIN_PROPOSAL_AGOROT) {
    return { ok: false, error: 'המחיר חייב להיות לפחות ₪1.' }
  }
  if (proposed > MAX_PROPOSAL_AGOROT) {
    return { ok: false, error: 'המחיר גבוה מהתקרה (₪100,000).' }
  }
  if (currentAgorot !== null && proposed === currentAgorot) {
    return { ok: false, error: 'המחיר המוצע זהה למחיר הנוכחי.' }
  }
  return { ok: true, agorot: proposed }
}

export function validateProposalNote(
  raw: unknown,
): { ok: true; note: string | null } | { ok: false; error: string } {
  const note = String(raw ?? '').trim()
  if (note.length > MAX_PROPOSAL_NOTE_LENGTH) {
    return { ok: false, error: `ההערה ארוכה מדי (עד ${MAX_PROPOSAL_NOTE_LENGTH} תווים).` }
  }
  return { ok: true, note: note.length === 0 ? null : note }
}
