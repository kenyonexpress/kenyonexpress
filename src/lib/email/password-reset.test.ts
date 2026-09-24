import { describe, expect, it } from 'vitest'
import { buildPasswordResetEmail } from './password-reset'

const LINK =
  'https://kenyonexpress.co.il/auth/callback?token_hash=abc123&type=recovery&next=%2Freset-password'

describe('buildPasswordResetEmail', () => {
  it('says reset, not sign in, and links exactly once in both bodies', () => {
    const mail = buildPasswordResetEmail({ actionLink: LINK })
    expect(mail.subject).toBe('איפוס סיסמה ל-KenyonExpress')
    expect(mail.text).toContain('לאפס את הסיסמה')
    expect(mail.text).not.toContain('להתחבר')
    expect(mail.text).toContain(LINK)
    expect((mail.html.match(/href=/g) ?? []).length).toBe(1)
    expect(mail.html).toContain(`href="${LINK.replace(/&/g, '&amp;')}"`)
  })

  it('tells the reader that ignoring it changes nothing', () => {
    // A reset mail nobody asked for is what an account-takeover attempt looks
    // like from the victim's side; the mail has to say the password stands.
    const mail = buildPasswordResetEmail({ actionLink: LINK })
    expect(mail.text).toContain('הסיסמה הנוכחית נשארת בתוקף')
    expect(mail.html).toContain('הסיסמה הנוכחית נשארת בתוקף')
  })

  it('renders right-to-left and isolates the link left-to-right', () => {
    const mail = buildPasswordResetEmail({ actionLink: LINK })
    expect(mail.html).toContain('dir="rtl"')
    expect(mail.html).toContain('dir="ltr"')
    expect(mail.text).toContain('⁦https://')
  })

  it('escapes the link rather than trusting it', () => {
    const mail = buildPasswordResetEmail({ actionLink: 'https://x.test/?a=1&b="<script>' })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
  })
})
