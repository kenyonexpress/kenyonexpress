import { LRI, PDI } from '@/lib/email/bidi'
import { buildPasswordResetEmail } from '@/lib/email/password-reset'
import { describe, expect, it } from 'vitest'

const LINK =
  'https://kenyonexpress.co.il/auth/callback?token_hash=abc123&type=recovery&next=%2Freset-password'
const ESCAPED = LINK.replace(/&/g, '&amp;')

describe('buildPasswordResetEmail', () => {
  it('says reset, not sign in, and links exactly once as an href', () => {
    const mail = buildPasswordResetEmail({ actionLink: LINK })
    expect(mail.subject).toBe('איפוס סיסמה ל-KenyonExpress')
    expect(mail.text).toContain('לאפס את הסיסמה')
    expect(mail.text).not.toContain('להתחבר')
    expect(mail.text).toContain(`${LRI}${LINK}${PDI}`)
    const hrefs = [...mail.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
    expect(hrefs).toEqual([ESCAPED])
    // The copy-paste fallback line, for clients where the button dies.
    expect(mail.html.split(ESCAPED).length - 1).toBeGreaterThanOrEqual(2)
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
    expect(mail.html).toContain('<html lang="he" dir="rtl">')
    expect(mail.html).toContain('direction:rtl')
    expect(mail.html).toContain('unicode-bidi:isolate')
    expect(mail.html).toContain('dir="ltr"')
    expect(mail.html).toContain('direction:ltr')
  })

  it('carries no URL other than the reset link in the text body', () => {
    const mail = buildPasswordResetEmail({ actionLink: LINK })
    const urls = mail.text.match(/https?:\/\/\S+/g) ?? []
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url.replace(new RegExp(`${PDI}$`), '')).toBe(LINK)
  })

  it('escapes the link rather than trusting it', () => {
    const mail = buildPasswordResetEmail({ actionLink: 'https://x.test/?a=1&b="<script>' })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('names the site the caller passes, in the subject and the header', () => {
    const mail = buildPasswordResetEmail({ actionLink: LINK, siteName: 'החנות <של> דנה' })
    expect(mail.subject).toBe('איפוס סיסמה ל-החנות <של> דנה')
    expect(mail.html).toContain('החנות &lt;של&gt; דנה')
    expect(mail.html).not.toContain('<של>')
  })
})
