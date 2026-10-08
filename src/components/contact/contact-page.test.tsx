import { act, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/actions/contact', () => ({ submitContactForm: async () => ({ ok: false }) }))

import ContactPage from '@/app/(store)/contact/page'
import { validateJsonLd } from '@/lib/seo/json-ld-validate.mjs'
import { SUPPORT_HOURS_ROWS, SUPPORT_RESPONSE } from '@/lib/support-hours'
import { PUBLISHED_STORE_WHATSAPP } from '@/lib/whatsapp'
import SupportStatusBadge from './SupportStatusBadge'

describe('/contact page', () => {
  const html = renderToStaticMarkup(<ContactPage />)

  it('offers WhatsApp, the email and the form', () => {
    expect(html).toContain('data-testid="whatsapp-support"')
    expect(html).toContain(`https://wa.me/${PUBLISHED_STORE_WHATSAPP}?text=`)
    expect(html).toContain('href="mailto:info@kenyonexpress.co.il"')
    expect(html).toContain('name="message"')
    expect(html).toContain('href="/help"')
  })

  it('prints every hours row and every response-time line from the one module', () => {
    for (const row of SUPPORT_HOURS_ROWS) {
      expect(html).toContain(row.label)
      expect(html).toContain(row.hours)
    }
    for (const line of Object.values(SUPPORT_RESPONSE)) expect(html).toContain(line)
    expect(html).toContain('לפי שעון ישראל')
  })

  it('prerenders the status badge empty, so the server never freezes a clock', () => {
    expect(html).toContain('data-testid="support-status"')
    expect(html).not.toContain('פתוח עכשיו')
    expect(html).not.toContain('סגור עכשיו')
  })

  it('carries valid ContactPage and Organization structured data with the same hours', () => {
    const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)
    expect(match).not.toBeNull()
    const nodes = JSON.parse(match?.[1] ?? '[]') as Record<string, unknown>[]
    expect(validateJsonLd(nodes).filter((i) => i.level === 'error')).toEqual([])
    expect(nodes.map((n) => n['@type'])).toEqual(['ContactPage', 'Organization'])
    const org = nodes[1] as { contactPoint: Record<string, unknown>[] }
    const point = org.contactPoint[0] as Record<string, unknown>
    expect(point.telephone).toBe(`+${PUBLISHED_STORE_WHATSAPP}`)
    expect(point.email).toBe('info@kenyonexpress.co.il')
    expect(point.hoursAvailable).toHaveLength(6)
  })
})

describe('SupportStatusBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fills in after mount from the Israeli clock, and ticks', async () => {
    // Sunday 08:59 in Israel (06:59Z, winter): closed, opens today.
    vi.setSystemTime(new Date('2026-01-11T06:59:30Z'))
    render(<SupportStatusBadge />)
    const badge = screen.getByTestId('support-status')
    expect(badge).toHaveTextContent('סגור עכשיו, נפתח היום ב-09:00')
    expect(badge.getAttribute('data-open')).toBe('false')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(badge).toHaveTextContent('פתוח עכשיו, עונים עד 18:00')
    expect(badge.getAttribute('data-open')).toBe('true')
  })
})
