import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildBusinessInquiryText, buildOrderInquiryText, storeWhatsAppLink } from '@/lib/whatsapp'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShareMenu from './ShareMenu'

/** C147: the share actions are WhatsApp, native share, copy link -- in that order. */

const URL_ = 'https://www.kenyonexpress.co.il/s/abc'

describe('ShareMenu', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('orders WhatsApp, native share, copy link when Web Share exists', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn() })
    await act(async () => {
      render(
        <ShareMenu title="עסק" subject={{ name: 'עסק', priceIls: null, offer: null }} url={URL_} />,
      )
    })
    const labels = screen.getAllByRole('button').map((b) => b.textContent?.trim())
    expect(labels).toEqual(['שתפו בוואטסאפ', 'שיתוף', 'העתקת קישור'])
  })

  it('opens wa.me with the prefilled text and the URL, only on click', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(
      <ShareMenu title="עסק" subject={{ name: 'עסק', priceIls: null, offer: null }} url={URL_} />,
    )
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('שתפו בוואטסאפ'))
    expect(open).toHaveBeenCalledTimes(1)
    const href = String(open.mock.calls[0]?.[0])
    expect(href.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(href.split('text=')[1] ?? '')).toBe(
      `מצאתי משהו שווה ב-KenyonExpress: עסק\n${URL_}`,
    )
  })
})

describe('C147 prefilled contact links', () => {
  it('business inquiry goes to the store number and names the business', () => {
    const href = storeWhatsAppLink(buildBusinessInquiryText('פיצה כהן', URL_))
    expect(href).toMatch(/^https:\/\/wa\.me\/972\d+\?text=/)
    expect(decodeURIComponent(href?.split('text=')[1] ?? '')).toContain('"פיצה כהן"')
  })

  it('order inquiry carries the order number', () => {
    const href = storeWhatsAppLink(buildOrderInquiryText('AB12CD34'))
    expect(decodeURIComponent(href?.split('text=')[1] ?? '')).toContain('AB12CD34')
  })

  it('business and order pages render a wa.me contact button', () => {
    const root = resolve(__dirname, '../../app')
    const business = readFileSync(resolve(root, '(store)/s/[id]/page.tsx'), 'utf8')
    const order = readFileSync(resolve(root, '(account)/account/orders/[id]/page.tsx'), 'utf8')
    expect(business).toContain('<ShareMenu')
    expect(business).toContain('buildBusinessInquiryText')
    expect(order).toContain('buildOrderInquiryText')
  })
})
