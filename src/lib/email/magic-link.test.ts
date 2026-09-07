import { LRI, PDI } from '@/lib/email/bidi'
import { buildMagicLinkEmail } from '@/lib/email/magic-link'
import { describe, expect, it } from 'vitest'

const LINK =
  'https://kenyonexpress.co.il/auth/callback?token_hash=pkce_0123456789abcdef&type=magiclink'

describe('buildMagicLinkEmail', () => {
  // Attribute values HTML-escape the ampersand; every client decodes it back.
  const ESCAPED = LINK.replace(/&/g, '&amp;')

  it('carries the login link in both bodies', () => {
    const mail = buildMagicLinkEmail({ actionLink: LINK })
    expect(mail.html).toContain(`href="${ESCAPED}"`)
    // The copy-paste fallback line, for clients where the button dies.
    expect(mail.html.split(ESCAPED).length - 1).toBeGreaterThanOrEqual(2)
    expect(mail.text).toContain(LINK)
  })

  it('isolates the link in the plain-text body', () => {
    const mail = buildMagicLinkEmail({ actionLink: LINK })
    expect(mail.text).toContain(`${LRI}${LINK}${PDI}`)
  })

  it('is Hebrew, RTL, and unicode-bidi aware', () => {
    const mail = buildMagicLinkEmail({ actionLink: LINK })
    expect(mail.subject).toContain('כניסה')
    expect(mail.html).toContain('dir="rtl"')
    expect(mail.html).toContain('direction:rtl')
    expect(mail.html).toContain('unicode-bidi:isolate')
    // The link itself renders as an LTR run inside the RTL card.
    expect(mail.html).toContain('dir="ltr"')
    expect(mail.html).toContain('direction:ltr')
  })

  it('tells an uninvolved reader they can ignore it', () => {
    const mail = buildMagicLinkEmail({ actionLink: LINK })
    expect(mail.text).toContain('אם לא ביקשתם')
    expect(mail.html).toContain('אם לא ביקשתם')
  })

  it('carries no link other than the login link', () => {
    // A login mail with extra links is a phishing template. Every href and
    // every URL in the text body must be the action link itself.
    const mail = buildMagicLinkEmail({ actionLink: LINK })
    const hrefs = [...mail.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href).toBe(ESCAPED)
    const urls = mail.text.match(/https?:\/\/\S+/g) ?? []
    for (const url of urls) expect(url.replace(new RegExp(`${PDI}$`), '')).toBe(LINK)
  })

  it('escapes a hostile link rather than letting it break out of the markup', () => {
    const hostile = 'https://x.example/?q="><script>alert(1)</script>'
    const mail = buildMagicLinkEmail({ actionLink: hostile })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
  })
})
