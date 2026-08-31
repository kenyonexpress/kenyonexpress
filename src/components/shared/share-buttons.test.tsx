import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FacebookShareButton from './FacebookShareButton'
import WhatsAppFloat from './WhatsAppFloat'
import WhatsAppShareButton from './WhatsAppShareButton'

/**
 * The three sharing surfaces from (14), which had no tests at all.
 *
 * Each of them turns application state into a URL that leaves the site, and
 * each has a way of being wrong that looks completely fine on screen: a float
 * that silently disappears when an env var is unset, a share sheet that sends
 * the wrong price or the URL twice, a Facebook link that shares the wrong page.
 * None of those raises an error, and none of them is visible in a screenshot.
 */

const PHONE_ENV = 'NEXT_PUBLIC_WHATSAPP_PHONE'

describe('the floating WhatsApp button', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders a wa.me link with a prefilled Hebrew message', () => {
    const html = renderToStaticMarkup(<WhatsAppFloat />)
    expect(html).toContain('https://wa.me/')
    expect(html).toContain('text=')
  })

  it('survives an unset phone env var by falling back to the published number', () => {
    // Before [68] this button was the only one of the three store-number
    // surfaces reading the env var, so a deploy without it lost the button
    // while the footer and the contact page carried on. A missing button is a
    // failure nobody reports.
    vi.stubEnv(PHONE_ENV, '')
    const html = renderToStaticMarkup(<WhatsAppFloat />)
    expect(html).toContain('wa.me/972524635550')
  })

  it('opens in a new tab without handing the opener over', () => {
    const html = renderToStaticMarkup(<WhatsAppFloat />)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('noopener')
  })

  it('is labelled for a screen reader, not just drawn', () => {
    const html = renderToStaticMarkup(<WhatsAppFloat />)
    expect(html).toContain('aria-label="דברו איתנו בוואטסאפ"')
  })

  it('sits in the RTL-correct corner, by logical property', () => {
    // `end-5`, not `right-5`: the site is RTL and a physical property would put
    // the button on the wrong side of every page.
    const html = renderToStaticMarkup(<WhatsAppFloat />)
    expect(html).toMatch(/\bend-5\b/)
    expect(html).not.toMatch(/\bright-5\b/)
  })
})

describe('the WhatsApp share button', () => {
  const open = vi.fn()

  beforeEach(() => {
    open.mockReset()
    vi.stubGlobal('open', open)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://kenyonexpress.co.il/product/spa?utm_source=x' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Render, then invoke the button's click handler the way the DOM would. */
  function clickWith(props: Parameters<typeof WhatsAppShareButton>[0]) {
    const element = WhatsAppShareButton(props)
    const onClick = (element as { props: { onClick: () => void } }).props.onClick
    onClick()
    return decodeURIComponent(String(open.mock.calls[0]?.[0] ?? ''))
  }

  it('sends the message it was given', () => {
    expect(clickWith({ message: 'מצאתי משהו שווה' })).toContain('מצאתי משהו שווה')
  })

  it('appends the page URL once, and only when asked', () => {
    // The message builder deliberately carries no URL, because each channel
    // appends its own. Appending here as well would send it twice.
    const withUrl = clickWith({ message: 'שווה', appendCurrentUrl: true })
    expect(withUrl.split('https://kenyonexpress.co.il').length - 1).toBe(1)

    open.mockReset()
    expect(clickWith({ message: 'שווה' })).not.toContain('kenyonexpress.co.il')
  })

  it('shares the URL the customer is actually on, campaign parameters and all', () => {
    expect(clickWith({ message: 'שווה', appendCurrentUrl: true })).toContain('utm_source=x')
  })

  it('opens without handing the opener over', () => {
    clickWith({ message: 'שווה' })
    expect(String(open.mock.calls[0]?.[2])).toContain('noopener')
  })
})

describe('the Facebook share button', () => {
  const open = vi.fn()

  beforeEach(() => {
    open.mockReset()
    vi.stubGlobal('open', open)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://kenyonexpress.co.il/product/spa' },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the sharer a URL and nothing else', () => {
    // Facebook removed the `quote` parameter in 2017 and ignores it silently.
    // Everything the post shows comes from the Open Graph tags it scrapes, so a
    // text parameter here would be a message nobody ever reads.
    const element = FacebookShareButton({})
    ;(element as { props: { onClick: () => void } }).props.onClick()
    const url = new URL(String(open.mock.calls[0]?.[0]))
    expect(url.host).toBe('www.facebook.com')
    expect([...url.searchParams.keys()]).toEqual(['u'])
    expect(url.searchParams.get('u')).toBe('https://kenyonexpress.co.il/product/spa')
  })
})

describe('no share surface may quote a coupon by its sticker price', () => {
  /**
   * The defect `lib/share/message.ts` exists to prevent, as a gate rather than
   * as a comment: for a coupon, `products.price_ils` is what the goods cost at
   * the business, and the page beside the button quotes something smaller. A
   * surface that formats a price itself has no way to know that.
   */
  const SHARE_TEXT_BUILDERS = ['buildShareMessage', 'buildCouponShareText']

  function componentsUsing(needle: string): string[] {
    const found: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue
        if (readFileSync(full, 'utf8').includes(needle)) found.push(full)
      }
    }
    walk(resolve(process.cwd(), 'src'))
    return found
  }

  it('every WhatsAppShareButton gets its text from an approved builder', () => {
    const callers = componentsUsing('<WhatsAppShareButton')
    expect(
      callers.length,
      'no share button call sites found; did the component move?',
    ).toBeGreaterThan(0)
    for (const file of callers) {
      const source = readFileSync(file, 'utf8')
      const used = SHARE_TEXT_BUILDERS.filter((builder) => source.includes(builder))
      expect(
        used,
        `${file} builds its own share text. Use one of: ${SHARE_TEXT_BUILDERS.join(', ')} — a coupon's price is not products.price_ils.`,
      ).not.toHaveLength(0)
    }
  })

  it('offers no sticker-price product-share builder to reach for', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/whatsapp.ts'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toContain('buildProductShareText')
  })
})
