// Israeli postal code ("מיקוד").
//
// Israel Post moved from 5 digits to 7 in 2013, and both are still in
// circulation: the 7-digit code is what every official form asks for, but a
// large share of shoppers still type the 5-digit code printed on older mail.
// Rejecting the 5-digit form outright would fail people whose code is simply
// the older one; silently padding it would invent a delivery area that does not
// exist. So both lengths are accepted and reported distinctly, and the caller
// decides. The checkout treats a 5-digit code as valid input and stores it as
// typed rather than guessing the two missing digits.
//
// Nothing here is a deliverability check. A syntactically valid code can still
// be a code Israel Post does not use; that is a lookup, not a regex.

export type PostalCodeCheck =
  | { ok: true; normalized: string; form: 'modern-7' | 'legacy-5' }
  | { ok: false; reason: 'empty' | 'non-digit' | 'length' | 'all-zero'; message: string }

type PostalCodeFailure = Extract<PostalCodeCheck, { ok: false }>['reason']

const MESSAGES: Record<PostalCodeFailure, string> = {
  empty: 'יש להזין מיקוד',
  'non-digit': 'מיקוד מכיל ספרות בלבד',
  length: 'מיקוד ישראלי הוא 7 ספרות (או 5 בפורמט הישן)',
  'all-zero': 'מיקוד לא יכול להיות אפסים בלבד',
}

/**
 * Strips the separators people type (spaces, hyphens, the RTL marks that get
 * pasted in from WhatsApp) without touching digits. Anything else left over
 * makes the code invalid rather than being stripped too: "12a4567" is a typo,
 * not a formatted code.
 */
function stripSeparators(raw: string): string {
  // ‎-‏ are LRM/RLM and ‪-‮ the directional overrides. They
  // are invisible, they ride along on anything copied out of a Hebrew chat, and
  // without this they would turn a correct code into a "non-digit" rejection
  // the shopper cannot see the cause of.
  return raw.replace(/[\s\-‎‏‪-‮]/g, '')
}

export function checkIsraeliPostalCode(raw: unknown): PostalCodeCheck {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value === '') return { ok: false, reason: 'empty', message: MESSAGES.empty }

  const compact = stripSeparators(value)
  if (compact === '') return { ok: false, reason: 'empty', message: MESSAGES.empty }
  if (!/^[0-9]+$/.test(compact)) {
    return { ok: false, reason: 'non-digit', message: MESSAGES['non-digit'] }
  }
  if (compact.length !== 5 && compact.length !== 7) {
    return { ok: false, reason: 'length', message: MESSAGES.length }
  }
  // 0000000 passes every length and digit rule and is the value a barely-filled
  // form produces. It is not an address.
  if (/^0+$/.test(compact)) {
    return { ok: false, reason: 'all-zero', message: MESSAGES['all-zero'] }
  }

  return {
    ok: true,
    normalized: compact,
    form: compact.length === 7 ? 'modern-7' : 'legacy-5',
  }
}

/**
 * The checkout's postal code is optional, exactly as it is on the live site.
 * Optional means "may be omitted", not "may be wrong": an empty value passes,
 * anything present is held to the full rule.
 */
export function checkOptionalIsraeliPostalCode(raw: unknown): PostalCodeCheck | null {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value === '') return null
  return checkIsraeliPostalCode(value)
}
