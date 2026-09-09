/**
 * Israeli company and dealer numbers: ח"פ, ע"מ, עוסק פטור.
 *
 * WHAT THIS CHECKS AND WHAT IT CANNOT. It checks that a number is
 * WELL-FORMED - nine digits whose check digit agrees - which catches the
 * transposed pair and the dropped digit, and nothing else. It does NOT check
 * that the business exists, that it is active, or that the person typing it
 * owns it. Only the Registrar of Companies knows those, there is no integration
 * with them here, and the onboarding flow settles the question the way it is
 * actually settled: by a human looking at the certificate the applicant
 * uploads.
 *
 * That distinction is the reason this file says so at the top. A validator that
 * returns true is the easiest thing in an onboarding flow to read as
 * "verified", and the review console therefore never shows this as a tick - it
 * shows the number next to the document.
 *
 * THE ALGORITHM is the same check digit the Israeli national ID uses, because
 * these numbers are drawn from the same space: each digit is multiplied by 1 or
 * 2 alternately from the left, products of two digits are summed digitwise, and
 * the total must be divisible by ten. That is why an individual's ID doubles as
 * their עוסק מורשה number and passes here, which is correct rather than a bug -
 * a sole trader registers under exactly that number.
 */

export type CompanyIdCheck =
  | { ok: true; normalized: string; kind: CompanyIdKind }
  | { ok: false; reason: 'EMPTY' | 'NOT_NINE_DIGITS' | 'CHECK_DIGIT' }

/**
 * What the leading digit says, and it says less than people assume. The
 * Registrar allocates `5` to companies limited by shares and `58` to
 * associations (עמותות); everything else in the nine-digit space is an
 * individual's ID being used as a dealer number. Anything beyond that is
 * folklore, so this reports three kinds and not twelve.
 */
export type CompanyIdKind = 'company' | 'association' | 'individual'

const NINE_DIGITS = /^\d{9}$/

/** Strips the separators people type: hyphens, spaces, and the ח"פ prefix. */
export function normalizeCompanyId(raw: string): string {
  return raw
    .trim()
    .replace(/^(ח\.?"?פ\.?|ע\.?"?מ\.?|ח\.?פ\.?)/u, '')
    .replace(/[\s\-.]/g, '')
}

export function companyIdKind(normalized: string): CompanyIdKind {
  if (normalized.startsWith('58')) return 'association'
  if (normalized.startsWith('5')) return 'company'
  return 'individual'
}

export function checkCompanyId(raw: string): CompanyIdCheck {
  const normalized = normalizeCompanyId(raw)
  if (normalized.length === 0) return { ok: false, reason: 'EMPTY' }
  if (!NINE_DIGITS.test(normalized)) return { ok: false, reason: 'NOT_NINE_DIGITS' }

  let total = 0
  for (let i = 0; i < 9; i++) {
    const digit = Number(normalized[i])
    const product = digit * ((i % 2) + 1)
    // A two-digit product contributes its digits, not itself: 14 adds 5.
    total += product > 9 ? product - 9 : product
  }
  if (total % 10 !== 0) return { ok: false, reason: 'CHECK_DIGIT' }

  return { ok: true, normalized, kind: companyIdKind(normalized) }
}

/** One Hebrew sentence per refusal, for the form. */
export const COMPANY_ID_MESSAGES: Record<Extract<CompanyIdCheck, { ok: false }>['reason'], string> =
  {
    EMPTY: 'נא למלא מספר ח"פ או עוסק מורשה',
    NOT_NINE_DIGITS: 'מספר ח"פ או עוסק מורשה הוא תשע ספרות',
    // Names the likely mistake rather than the algorithm. "ספרת ביקורת שגויה"
    // means nothing to somebody who has just copied a number off a certificate.
    CHECK_DIGIT: 'המספר אינו תקין. בדקו שלא התחלפו ספרות והשלימו אפסים מובילים',
  }

export function companyIdMessage(check: CompanyIdCheck): string | null {
  return check.ok ? null : COMPANY_ID_MESSAGES[check.reason]
}
