import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * UX13: the site footer's shape. Measured before (logs/ux13/before.json):
 * three columns at 1440 (495 / 337 / 337), two closed `<details>` rows below
 * lg with eleven links under the first, four TEXT payment badges on the
 * desktop bar only, and a Telegram icon whose href was `#`.
 *
 * Pinned here: four columns from lg (the contact column and three link
 * columns), three closed accordion rows below it with the policies in a
 * column of their own, every link a real path, the social row a labelled nav
 * of real profiles, and the payment marks on both the desktop bar and the
 * handheld dark bar.
 */

vi.mock('@/server/actions/newsletter', () => ({ subscribeToNewsletter: vi.fn() }))

import SiteFooter from './SiteFooter'

const SOURCE = readFileSync(resolve(process.cwd(), 'src/components/layout/SiteFooter.tsx'), 'utf8')

describe('SiteFooter (UX13)', () => {
  it('lays out four columns from lg', () => {
    const { container } = render(<SiteFooter />)
    const grid = container.querySelector('[data-footer-columns]')
    expect(grid).not.toBeNull()
    const tracks = grid?.className.match(/lg:grid-cols-\[([^\]]+)\]/)?.[1]?.split('_') ?? []
    expect(tracks).toHaveLength(4)
    // the contact column plus the three link columns
    expect(grid?.children).toHaveLength(4)
    expect(grid?.querySelectorAll(':scope > details')).toHaveLength(3)
  })

  it('folds the link columns into three closed accordion rows below lg', () => {
    const { container } = render(<SiteFooter />)
    const rows = [...container.querySelectorAll('details')]
    expect(rows.map((d) => d.querySelector('summary')?.textContent?.trim())).toEqual([
      'שירות לקוחות',
      'מדיניות ותקנון',
      'אזור אישי',
    ])
    for (const row of rows) {
      expect(row.open).toBe(false)
      expect(row.className).toContain('footer-disclosure')
      // the chevron is the phone's affordance and leaves at lg
      expect(row.querySelector('summary svg')?.getAttribute('class')).toContain('lg:hidden')
    }
  })

  it('gives the policies their own column and keeps the service column short', () => {
    const { container } = render(<SiteFooter />)
    const rows = [...container.querySelectorAll('details')]
    const [service, policies, personal] = rows
    if (!service || !policies || !personal) throw new Error('expected three link columns')
    const hrefs = (d: Element) => [...d.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs(service)).toEqual(['/contact', '/about', '/faq', '/blog', '/suppliers'])
    expect(hrefs(policies)).toEqual([
      '/terms-and-conditions',
      '/privacy-policy',
      '/refund_returns',
      '/shipping',
      '/cookies',
      '/accessibility',
    ])
    expect(hrefs(personal)).toEqual(['/account', '/cart', '/account/orders'])
  })

  it('links nothing to "#"', () => {
    const { container } = render(<SiteFooter />)
    const dead = [...container.querySelectorAll('a[href="#"]')]
    expect(dead.map((a) => a.getAttribute('aria-label') ?? a.textContent)).toEqual([])
  })

  it('offers the social profiles as a labelled nav of real external links', () => {
    render(<SiteFooter />)
    const nav = screen.getByRole('navigation', { name: 'רשתות חברתיות' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual([
      'יוטיוב',
      'אינסטגרם',
      'וואטסאפ',
      'טוויטר',
      'פייסבוק',
    ])
    for (const a of links) {
      expect(a.getAttribute('href')).toMatch(/^https:\/\//)
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
      expect(a.querySelector('svg')).not.toBeNull()
    }
  })

  it('shows the payment marks on the desktop bar and on the handheld dark bar', () => {
    const { container } = render(<SiteFooter />)
    const lists = screen.getAllByRole('list', { name: 'אמצעי תשלום' })
    expect(lists).toHaveLength(2)
    for (const list of lists) expect(within(list).getAllByRole('img')).toHaveLength(5)
    const handheld = container.querySelector('.bg-footer-bg.lg\\:hidden')
    const desktop = container.querySelector('.bg-bottom-bar')
    expect(handheld?.querySelector('[aria-label="אמצעי תשלום"]')).not.toBeNull()
    expect(desktop?.querySelector('[aria-label="אמצעי תשלום"]')).not.toBeNull()
    // the four text badges are gone
    expect(container.textContent).not.toMatch(/Discover|Mastercard/)
  })

  it('reveals the closed rows from lg through ::details-content, not only display', () => {
    // Chromium 131+ hides a closed <details> with `content-visibility: hidden`
    // on ::details-content. `display: block !important` on the children gave
    // the links a layout box and no paint: logs/ux13/before-1440.png shows two
    // headings over nothing, and logs/ux13/details-probe.mjs measured
    // checkVisibility() false on the legacy rule and true on this one.
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
    const lg = css.slice(
      css.indexOf('@media (min-width: 1024px) {\n  .footer-disclosure > summary'),
    )
    const rule = lg.match(/\.footer-disclosure::details-content \{([^}]+)\}/)?.[1] ?? ''
    expect(rule).toMatch(/content-visibility:\s*visible/)
    expect(rule).toMatch(/display:\s*block !important/)
    // and the legacy rule stays for browsers without the pseudo-element
    expect(lg).toMatch(/\.footer-disclosure > \*:not\(summary\) \{\s*display: block !important;/)
  })

  it('keeps the paths other suites read off the source', () => {
    // content-pages.test.ts and legal-duplication.test.ts grep these literals.
    for (const href of ['/about', '/suppliers', '/blog'])
      expect(SOURCE).toContain(`href: '${href}'`)
    expect(SOURCE).toMatch(/handheld-footer-bar/)
  })
})
