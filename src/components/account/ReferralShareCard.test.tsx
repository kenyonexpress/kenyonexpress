import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The share card: the code, the link, and WhatsApp as the first button.
 *
 * The money labels come in as props the page formatted from the live terms, so
 * nothing here asserts a sum; what is asserted is that the sum the page gave is
 * the one WhatsApp receives, and that the link each channel carries names its
 * channel.
 */

const track = vi.fn()
vi.mock('@/lib/analytics/tracker', () => ({
  track: (...args: unknown[]) => track(...args),
}))
vi.mock('@/server/actions/referrals', () => ({
  ensureMyReferralCode: vi.fn(async () => ({ ok: true, code: 'NEWC0DE1' })),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import ReferralShareCard from './ReferralShareCard'

const ORIGIN = 'https://kenyonexpress.co.il'

beforeEach(() => {
  track.mockReset()
})

describe('ReferralShareCard', () => {
  it('shows the code LTR and a copy link that names the copy channel', () => {
    const html = renderToStaticMarkup(
      <ReferralShareCard
        initialCode="AB12CD34"
        shareOrigin={ORIGIN}
        friendBonusLabel="₪10"
        minOrderLabel="₪50"
      />,
    )
    expect(html).toContain('data-testid="referral-code"')
    expect(html).toContain('AB12CD34')
    expect(html).toContain('ref=AB12CD34')
    expect(html).toContain('utm_source=copy')
    expect(html).toContain('data-testid="referral-share-whatsapp"')
    // The native sheet is decided after mount; the server render never claims it.
    expect(html).not.toContain('data-testid="referral-share-native"')
  })

  it('opens WhatsApp with the friend bonus the page gave and the whatsapp link, and reports the tap first', () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(
      <ReferralShareCard
        initialCode="AB12CD34"
        shareOrigin={ORIGIN}
        friendBonusLabel="₪10"
        minOrderLabel="₪50"
      />,
    )

    fireEvent.click(screen.getByTestId('referral-share-whatsapp'))

    expect(track).toHaveBeenCalledWith('whatsapp_click', { context: 'referral' })
    expect(open).toHaveBeenCalledTimes(1)
    const href = String(open.mock.calls[0]?.[0])
    expect(href.startsWith('https://wa.me/?text=')).toBe(true)
    const text = decodeURIComponent(href.slice('https://wa.me/?text='.length))
    expect(text).toContain('₪10')
    expect(text).toContain('₪50')
    expect(text).toContain(`${ORIGIN}/?ref=AB12CD34&utm_source=whatsapp`)
    expect(open.mock.calls[0]?.[2]).toContain('noopener')
    vi.unstubAllGlobals()
  })

  it('promises the friend nothing in the message when their bonus is zero', () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(
      <ReferralShareCard
        initialCode="AB12CD34"
        shareOrigin={ORIGIN}
        friendBonusLabel={null}
        minOrderLabel="₪50"
      />,
    )
    fireEvent.click(screen.getByTestId('referral-share-whatsapp'))
    const text = decodeURIComponent(String(open.mock.calls[0]?.[0]))
    expect(text).not.toContain('₪')
    vi.unstubAllGlobals()
  })

  it('offers the native share sheet only where the browser has one', () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    render(
      <ReferralShareCard
        initialCode="AB12CD34"
        shareOrigin={ORIGIN}
        friendBonusLabel="₪10"
        minOrderLabel="₪50"
      />,
    )
    fireEvent.click(screen.getByTestId('referral-share-native'))
    expect(share).toHaveBeenCalledTimes(1)
    const payload = share.mock.calls[0]?.[0]
    expect(payload?.url).toContain('utm_source=share')
    expect(payload?.text).toContain('₪10')
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  })

  it('shows the mint button and no link when the customer has no code', () => {
    const html = renderToStaticMarkup(
      <ReferralShareCard
        initialCode={null}
        shareOrigin={ORIGIN}
        friendBonusLabel="₪10"
        minOrderLabel="₪50"
      />,
    )
    expect(html).toContain('צרו לי קוד הפניה')
    expect(html).not.toContain('wa.me')
    expect(html).not.toContain('ref=')
  })
})
