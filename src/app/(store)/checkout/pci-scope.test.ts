import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * PCI DSS scope, held still.
 *
 * The integration is SAQ-A because the card number is typed on Cardcom's
 * hosted page and nowhere else: the checkout form collects an address, the
 * iframe shows Cardcom's origin, the webhook re-verifies server-to-server,
 * and a saved card is a Cardcom token. Any of those can be undone by one
 * well-meaning edit - a "card number" input added to the form, a PAN field
 * posted to `ChargeToken.aspx`, `allow-top-navigation` granted to the frame -
 * and none of them would fail a type check. This file is what fails.
 */

const ROOT = process.cwd()

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8')
}

function sourcesUnder(dir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourcesUnder(path))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push({ path, source: read(path) })
    }
  }
  return out
}

/** Browser autofill tokens that only ever mean "a card is being typed here". */
const CARD_AUTOCOMPLETE = /autoComplete=["'](cc-number|cc-csc|cc-exp|cc-exp-month|cc-exp-year)["']/
/** Field names a PAN or CVV would be posted under. */
const CARD_FIELD_NAMES =
  /name=["'](card_number|cardNumber|card-number|pan|cvv|cvc|csc|card_cvv|expiry|card_expiry)["']/i

describe('the checkout never touches a card number', () => {
  const checkoutSources = sourcesUnder('src/app/(store)/checkout')

  it('renders no card-number, CVV or expiry input in any checkout component', () => {
    const offenders = checkoutSources
      .filter(({ source }) => CARD_AUTOCOMPLETE.test(source) || CARD_FIELD_NAMES.test(source))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('frames Cardcom without letting the frame steer the tab', () => {
    const form = read('src/app/(store)/checkout/CheckoutForm.tsx')
    const sandbox = form.match(/sandbox="([^"]+)"/)?.[1] ?? ''
    expect(sandbox).toContain('allow-forms')
    expect(sandbox).not.toContain('allow-top-navigation')
  })

  it('names the hosted page as the only place a challenge runs', () => {
    // 3DS is Cardcom's ACS inside Cardcom's page. A token charge that needs a
    // challenge is bounced to that page, never answered from here.
    const action = read('src/server/actions/payments/checkout.ts')
    expect(action).toContain('threeDSChallenge')
    expect(action).toMatch(/isThreeDSChallengeRequired/)
  })
})

describe('the payment adapter posts no card data', () => {
  const adapterSources = sourcesUnder('src/lib/payments')

  it('sends tokens and Low Profile ids to Cardcom, never a PAN', () => {
    // The legacy interface would accept `CardNumber`, `CVV` and `CardValidity*`
    // on a direct charge. The adapter must keep using the token and the
    // hosted page, so those field names have no business appearing.
    const offenders = adapterSources
      .filter(({ source }) =>
        /\b(CardNumber|cardnumber|CVV2?|CardValidityMonth\s*:)\b/.test(source),
      )
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('stores a saved card as a token with its last four, not the number', () => {
    const cardcom = read('src/lib/payments/cardcom.ts')
    expect(cardcom).toContain('Last4CardDigits')
    expect(cardcom).toContain("'/Interface/ChargeToken.aspx'")
    expect(cardcom).toContain("'/Interface/LowProfile.aspx'")
  })
})

describe('a saved card never leaves as more than its last four digits', () => {
  it('the data export selects only the masked columns of payment_tokens', () => {
    const route = read('src/app/api/account/export/route.ts')
    const select = route.match(/from\('payment_tokens'\)\s*\.select\(\s*'([^']+)'/)?.[1] ?? ''
    expect(select).not.toBe('')
    const columns = select.split(',').map((c) => c.trim())
    expect(columns).toEqual(
      expect.arrayContaining(['card_brand', 'last_4', 'expiry_month', 'expiry_year']),
    )
    expect(columns).not.toContain('*')
    expect(columns.some((c) => /token/i.test(c))).toBe(false)
  })

  it('the log scrubber redacts every card-shaped key before it reaches Sentry', async () => {
    const { redact } = await import('@/lib/observability/scrub')
    const out = redact({
      cardcom_token: 't',
      card_number: '4580000000000000',
      CardNumber: '4580',
      cvv: '123',
      last_4: '0000',
    }) as Record<string, unknown>
    expect(out.cardcom_token).toBe('[redacted]')
    expect(out.card_number).toBe('[redacted]')
    expect(out.CardNumber).toBe('[redacted]')
    expect(out.cvv).toBe('[redacted]')
    // The masked digits are the one card fact support is allowed to see.
    expect(out.last_4).toBe('0000')
  })
})
