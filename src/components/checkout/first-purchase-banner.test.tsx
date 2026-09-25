import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FirstPurchaseBanner, { FIRST_PURCHASE_BANNER_SNOOZE_KEY } from './FirstPurchaseBanner'

/**
 * The after-first-purchase banner (Q17): a passkey link and an "everything in
 * the app" link, dismissable for thirty days on this device, never forever.
 */

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 8, 25, 12, 0, 0)

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(Date, 'now').mockReturnValue(T0)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function banner() {
  return screen.queryByTestId('first-purchase-banner')
}

describe('the first-purchase banner', () => {
  it('offers a passkey and everything-in-the-app, each as a link to the page that does it', () => {
    render(<FirstPurchaseBanner />)
    expect(banner()).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'הוספת מפתח גישה' })).toHaveAttribute(
      'href',
      '/account/security',
    )
    expect(screen.getByRole('link', { name: 'הכל באפליקציה' })).toHaveAttribute(
      'href',
      '/account/notifications',
    )
  })

  it('drops the passkey link once the customer has one, and keeps the other', () => {
    render(<FirstPurchaseBanner hasPasskeys />)
    expect(banner()).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'הוספת מפתח גישה' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'הכל באפליקציה' })).toBeInTheDocument()
  })

  it('"not now" hides it for thirty days and it comes back on day thirty', () => {
    const first = render(<FirstPurchaseBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'לא עכשיו' }))
    expect(banner()).not.toBeInTheDocument()
    expect(localStorage.getItem(FIRST_PURCHASE_BANNER_SNOOZE_KEY)).toBe(String(T0 + 30 * DAY))
    first.unmount()

    vi.spyOn(Date, 'now').mockReturnValue(T0 + 29 * DAY)
    const second = render(<FirstPurchaseBanner />)
    expect(banner()).not.toBeInTheDocument()
    second.unmount()

    vi.spyOn(Date, 'now').mockReturnValue(T0 + 30 * DAY)
    render(<FirstPurchaseBanner />)
    expect(banner()).toBeInTheDocument()
  })

  it('records no consent and opens no permission dialog by being viewed', () => {
    const request = vi.fn()
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: request })
    render(<FirstPurchaseBanner />)
    expect(request).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
