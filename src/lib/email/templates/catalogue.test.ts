import {
  EMAIL_FONT_STACK,
  EMAIL_MAX_WIDTH_PX,
  EMAIL_MOBILE_BREAKPOINT_PX,
  emailMediaQuery,
  renderEmailDocument,
} from '@/lib/email/layout'
import { OFF_PAGE } from '@/styles/tokens'
import { describe, expect, it } from 'vitest'
import { EMAIL_TEMPLATE_CATALOGUE, type EmailTemplateId } from './catalogue'

const SITE = 'https://kenyonexpress.co.il'

/** The eight STEP 16 asked for, by name, so a dropped entry is a red test. */
const REQUIRED: EmailTemplateId[] = [
  'order-confirmation',
  'shipping-update',
  'delivery-confirmation',
  'cashback-earned',
  'price-drop',
  'welcome',
  'password-reset',
  'magic-link',
]

/** Hebrew letters, as a range. */
const HEBREW = /[א-ת]/

describe('the email template catalogue', () => {
  it('lists exactly the eight transactional templates, each once', () => {
    const ids = EMAIL_TEMPLATE_CATALOGUE.map((t) => t.id)
    expect([...ids].sort()).toEqual([...REQUIRED].sort())
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('labels every entry in Hebrew', () => {
    for (const entry of EMAIL_TEMPLATE_CATALOGUE) {
      expect(entry.labelHe, entry.id).toMatch(HEBREW)
    }
  })

  it.each(EMAIL_TEMPLATE_CATALOGUE.map((t) => [t.id, t] as const))(
    '%s renders a full responsive RTL document',
    (_id, entry) => {
      const mail = entry.sample(SITE)

      // A DOCUMENT, not a fragment: the head is what a phone client reads the
      // viewport and the media query from. A bare <div> has neither.
      expect(mail.html.trimStart()).toMatch(/^<!DOCTYPE html>/i)
      expect(mail.html).toContain('<html lang="he" dir="rtl">')
      expect(mail.html).toContain('<meta charset="utf-8">')
      expect(mail.html).toContain(
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
      )

      // RESPONSIVE: fluid table capped at the desktop width, and a media
      // query that collapses it on a narrow screen.
      expect(mail.html).toContain(`max-width:${EMAIL_MAX_WIDTH_PX}px`)
      expect(mail.html).toContain(`width="${EMAIL_MAX_WIDTH_PX}"`)
      expect(mail.html).toContain('role="presentation" width="100%"')
      expect(mail.html).toContain(
        `@media only screen and (max-width:${EMAIL_MOBILE_BREAKPOINT_PX}px)`,
      )
      expect(mail.html).toContain('.ke-container{width:100%!important')

      // RTL HEBREW: direction set as an attribute (Outlook) and as CSS (the
      // rest), bidi-isolated, in the brand font with a system fallback.
      expect(mail.html).toContain('<body dir="rtl"')
      expect(mail.html).toContain('direction:rtl;unicode-bidi:isolate')
      expect(mail.html).toContain(`font-family:${EMAIL_FONT_STACK}`)
      expect(mail.subject).toMatch(HEBREW)
      expect(mail.text).toMatch(HEBREW)
      expect(mail.html).toMatch(HEBREW)

      // Every colour still inline, from the palette: the media query is the
      // only thing in <style>, so a client that drops the head loses nothing
      // but the phone paddings.
      const styleBlocks = mail.html.match(/<style>[\s\S]*?<\/style>/g) ?? []
      expect(styleBlocks).toEqual([`<style>${emailMediaQuery()}</style>`])
      expect(mail.html).toContain(`background:${OFF_PAGE.panelWarm}`)

      // Nothing leaked from a builder's guard: no "Invalid Date", no
      // "undefined", no "null" printed as text.
      for (const junk of ['Invalid Date', 'undefined', '>null<', 'NaN']) {
        expect(mail.html, `${entry.id} prints ${junk}`).not.toContain(junk)
        expect(mail.text, `${entry.id} prints ${junk}`).not.toContain(junk)
      }
    },
  )

  it('links every template at the configured origin, never a hardcoded one', () => {
    const other = 'https://preview.kenyonexpress.example'
    for (const entry of EMAIL_TEMPLATE_CATALOGUE) {
      const mail = entry.sample(other)
      expect(mail.html, entry.id).toContain(other)
      expect(mail.html, entry.id).not.toContain('https://kenyonexpress.co.il/')
    }
  })

  it('keeps the auth mails to exactly one link', () => {
    for (const id of ['password-reset', 'magic-link'] as const) {
      const entry = EMAIL_TEMPLATE_CATALOGUE.find((t) => t.id === id)
      const mail = entry?.sample(SITE)
      const hrefs = new Set([...(mail?.html ?? '').matchAll(/href="([^"]*)"/g)].map((m) => m[1]))
      expect(hrefs.size, id).toBe(1)
    }
  })
})

describe('renderEmailDocument', () => {
  it('escapes the site name, the title, the preheader and the footer', () => {
    const html = renderEmailDocument({
      siteName: '<b>x</b>',
      title: 'a "quoted" <title>',
      preheader: '<img src=x>',
      bodyHtml: '<p>body</p>',
      footer: 'foot & <note>',
    })
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('<title>a &quot;quoted&quot; &lt;title&gt;</title>')
    expect(html).not.toContain('<img src=x>')
    expect(html).toContain('foot &amp; &lt;note&gt;')
    // The body markup is the builder's and is inserted as it came.
    expect(html).toContain('<p>body</p>')
  })

  it('omits the preheader block entirely when there is nothing to preview', () => {
    for (const preheader of [undefined, '', '   ']) {
      const html = renderEmailDocument({ bodyHtml: '', footer: 'f', preheader })
      expect(html).not.toContain('display:none')
    }
  })

  it('inserts the footer markup a builder escaped itself, after the footer sentence', () => {
    const html = renderEmailDocument({
      bodyHtml: '',
      footer: 'sentence',
      footerHtml: '<a href="https://x.test/u">u</a>',
    })
    expect(html).toContain('sentence<a href="https://x.test/u">u</a>')
  })
})
