import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * "VERIFY NO PAN STORED", AS A CHECK RATHER THAN A SENTENCE.
 *
 * STEP 16 asks for it verified. What existed was `legal-pages.test.ts`
 * asserting that the terms page CONTAINS the sentence "הפלטפורמה אינה שומרת את
 * מספר הכרטיס" - a test of the prose, not of the code. The privacy content
 * file's own header says a claim it does not honour is worse than a missing
 * sentence, and on 2026-09-08 it was not honouring one:
 *
 *   the policy listed the card's EXPIRY among details kept "at the clearing
 *   company only", while `payment_tokens` stores `expiry_month`,
 *   `expiry_year`, `last_4` and `card_brand`. `server/payments/finalize.ts`
 *   writes them; the checkout reads them so it does not offer a saved card
 *   that has already expired.
 *
 * True about the PAN, false about three columns. The policy is corrected, and
 * this holds both halves: the schema keeps no number and no CVV, and the
 * document keeps naming what it does keep.
 */
const ROOT = resolve(__dirname, '..', '..', '..')
const types = readFileSync(join(ROOT, 'src/types/database.ts'), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const SRC = join(ROOT, 'src')
const FILES = walk(SRC)
  .map((f) => ({ path: relative(SRC, f), text: readFileSync(f, 'utf8') }))
  .filter((f) => f.path !== 'types/database.ts')

describe('the schema has nowhere to put a card number or a CVV', () => {
  // Read against the GENERATED types, which describe the hosted database
  // column by column - not against a migration file, because the file chain
  // and production are different lineages here.
  const FORBIDDEN = ['card_number', 'cardnumber', 'pan', 'cvv', 'cvc', 'security_code']

  for (const column of FORBIDDEN) {
    it(`no column is named ${column}`, () => {
      const declared = new RegExp(`^\\s+${column}\\??:`, 'im')
      expect(declared.test(types)).toBe(false)
    })
  }
})

describe('no code writes one either', () => {
  it('assigns nothing to a card-number or CVV field', () => {
    const offenders = FILES.filter((f) =>
      /\b(card_number|cardNumber|cvv|cvc|security_code|securityCode)\s*[:=]/i.test(f.text),
    ).map((f) => f.path)
    expect(offenders).toEqual([])
  })
})

describe('what IS kept is named in the policy', () => {
  const privacy = readFileSync(join(ROOT, 'src/app/(legal)/_content/privacy.ts'), 'utf8')

  it('says the expiry is stored, because it is', () => {
    // payment_tokens.expiry_month / expiry_year, written by finalize.ts.
    expect(privacy).toContain('חודש ושנת התוקף')
  })

  it('says the last four digits are stored, because they are', () => {
    expect(privacy).toContain('ארבע הספרות האחרונות')
  })

  it('no longer lists the expiry among what is kept only at the processor', () => {
    expect(privacy).not.toContain('מספר כרטיס אשראי מלא, תוקף הכרטיס וקוד האבטחה')
  })

  it('still states the two things that really are never stored', () => {
    expect(privacy).toContain('אינה שומרת מספרי כרטיס אשראי')
    expect(privacy).toContain('אינה שומרת את קוד האבטחה')
  })
})
