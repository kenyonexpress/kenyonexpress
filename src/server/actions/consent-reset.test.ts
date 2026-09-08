import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE COOKIE POLICY PROMISED A WITHDRAWAL THAT COULD NOT BE PERFORMED.
 *
 * The policy states that measurement cookies are written only after consent and
 * that "you may withdraw at any time", naming the mechanism: through the
 * consent banner on the site.
 *
 * The banner cannot be reached that way once a decision exists. It is rendered
 * unconditionally in the root layout and hidden before paint by the attribute
 * CONSENT_PREPAINT_SCRIPT puts on <html> as soon as the cookie is there.
 * Searched 2026-09-08: `ConsentBanner` appears in `layout.tsx` and nowhere
 * else, and the footer links the policy text only. The first click was final.
 *
 * The fix is to clear the cookie, not to soften the sentence. These tests pin
 * both halves, because either one alone re-opens the gap: an action nothing
 * calls, or a document describing a control that is gone.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('the withdrawal action', () => {
  const action = read('src/server/actions/consent.ts')

  it('exists and clears the cookie rather than writing a third state', () => {
    // A `withdrawn` value would need handling in the pre-paint snippet, the
    // banner and the analytics gate. Deleting restores the pre-decision state
    // those three already agree on.
    expect(action).toContain('export async function resetConsent')
    expect(action).toContain('jar.delete(CONSENT_COOKIE)')
  })

  it('returns the visitor to the page they were on', () => {
    expect(action).toContain('backToWhereTheyWere')
  })

  it('is wrapped like every other action in this file', () => {
    expect(action).toContain("withActionContext('consent.reset'")
  })
})

describe('the control is reachable', () => {
  it('is rendered by the cookie policy page', () => {
    // An action with no caller is the defect this repo keeps finding; the
    // policy's promise is only true if something renders the button.
    expect(read('src/app/(store)/cookie-policy/page.tsx')).toContain('<ConsentResetBlock />')
  })

  it('posts to the action with a plain form, no client bundle', () => {
    const block = read('src/app/(store)/cookie-policy/ConsentResetBlock.tsx')
    expect(block).toContain('action={resetConsent}')
    expect(block).not.toContain("'use client'")
  })

  it('is not in the footer, which the pixel gate measures', () => {
    // Seven measured routes render the footer; a new visible control there is a
    // geometry change on all of them.
    expect(read('src/components/layout/SiteFooter.tsx')).not.toContain('ConsentResetBlock')
  })
})

describe('the policy names the control that exists', () => {
  const policy = read('src/app/(legal)/_content/cookies.ts')

  it('points at the button on this page', () => {
    expect(policy).toContain('שינוי החלטת ההסכמה')
    expect(policy).toContain('בתחתית עמוד זה')
  })

  it('still says the necessary cookies cannot be switched off', () => {
    // Withdrawal must not read as "turns everything off"; the cart and the
    // payment stop working without those, and the policy is explicit that the
    // banner never governed them.
    expect(policy).toContain('אין באפשרותנו לכבות אותן דרך באנר ההסכמה')
  })
})
