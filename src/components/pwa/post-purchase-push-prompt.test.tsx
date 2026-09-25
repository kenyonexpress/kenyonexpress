import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PostPurchasePushPrompt from './PostPurchasePushPrompt'

/**
 * A NOTIFICATION PERMISSION IS ASKED FOR ONCE, EVER. THE INVITATION TO GO AND
 * ANSWER IT COMES BACK AFTER THIRTY DAYS.
 *
 * "Block" is not "no, thanks". A blocked origin cannot ask again: the customer
 * has to find site settings in their browser and undo it by hand. Every
 * assertion here is about not spending that one chance on somebody who has
 * already answered. The invitation itself spends nothing, so a "not now" hides
 * it for thirty days (Q17) rather than forever.
 */

const DAY = 24 * 60 * 60 * 1000

function setPermission(value: NotificationPermission) {
  vi.stubGlobal('Notification', { permission: value, requestPermission: vi.fn() })
}

beforeEach(() => {
  localStorage.clear()
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'a-public-key')
  vi.stubGlobal('PushManager', class {})
  setPermission('default')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('the post-purchase invitation', () => {
  it('offers notifications to somebody who has not decided', () => {
    render(<PostPurchasePushPrompt />)
    expect(screen.getByRole('region', { name: 'הצעה להפעלת התראות' })).toBeInTheDocument()
  })

  it('links to the page where a button asks, rather than asking here', () => {
    // A browser dialog appearing on top of the coupon codes is exactly the
    // unprompted interruption that produces a permanent Block.
    render(<PostPurchasePushPrompt />)
    expect(screen.getByRole('link', { name: 'הפעלת התראות' })).toHaveAttribute(
      'href',
      '/account/notifications',
    )
  })

  it('does not open the permission dialog itself', () => {
    const request = vi.fn()
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: request })
    render(<PostPurchasePushPrompt />)
    expect(request).not.toHaveBeenCalled()
  })

  it.each<NotificationPermission>(['granted', 'denied'])(
    'says nothing to somebody who already answered %s',
    (permission) => {
      setPermission(permission)
      const { container } = render(<PostPurchasePushPrompt />)
      expect(container).toBeEmptyDOMElement()
    },
  )

  it('is shown again on the next order when nobody dismissed it', () => {
    // Merely seeing it is not an answer; the old permanent seen-flag treated
    // it as one and a customer who scrolled past was never invited again.
    const first = render(<PostPurchasePushPrompt />)
    expect(first.container).not.toBeEmptyDOMElement()
    first.unmount()

    const second = render(<PostPurchasePushPrompt />)
    expect(second.container).not.toBeEmptyDOMElement()
  })

  it('"not now" hides it for thirty days on this device, then offers again', () => {
    const t0 = Date.UTC(2026, 8, 25, 12, 0, 0)
    vi.spyOn(Date, 'now').mockReturnValue(t0)
    const first = render(<PostPurchasePushPrompt />)
    fireEvent.click(screen.getByRole('button', { name: 'לא עכשיו' }))
    expect(first.container).toBeEmptyDOMElement()
    first.unmount()

    vi.spyOn(Date, 'now').mockReturnValue(t0 + 29 * DAY)
    const second = render(<PostPurchasePushPrompt />)
    expect(second.container).toBeEmptyDOMElement()
    second.unmount()

    vi.spyOn(Date, 'now').mockReturnValue(t0 + 30 * DAY)
    const third = render(<PostPurchasePushPrompt />)
    expect(third.container).not.toBeEmptyDOMElement()
  })

  it('following the link counts as a dismissal, since that page asks properly', () => {
    const t0 = Date.UTC(2026, 8, 25, 12, 0, 0)
    vi.spyOn(Date, 'now').mockReturnValue(t0)
    const first = render(<PostPurchasePushPrompt />)
    const link = screen.getByRole('link', { name: 'הפעלת התראות' })
    // jsdom cannot navigate; the click's own handler is what is under test.
    link.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(link)
    first.unmount()

    vi.spyOn(Date, 'now').mockReturnValue(t0 + 1 * DAY)
    const second = render(<PostPurchasePushPrompt />)
    expect(second.container).toBeEmptyDOMElement()
  })

  it('the legacy permanent flag is not a snooze: that customer is asked once more', () => {
    localStorage.setItem('ke:push-invite-shown', '1')
    const { container } = render(<PostPurchasePushPrompt />)
    expect(container).not.toBeEmptyDOMElement()
  })

  it('says nothing when the browser cannot receive a push at all', () => {
    vi.stubGlobal('PushManager', undefined)
    const { container } = render(<PostPurchasePushPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says nothing when there is no VAPID key to subscribe with', () => {
    // Offering a permission that cannot be turned into a subscription spends
    // the one chance and delivers nothing.
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
    const { container } = render(<PostPurchasePushPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('promises no marketing, because the templates send none', () => {
    render(<PostPurchasePushPrompt />)
    expect(screen.getByRole('region', { name: 'הצעה להפעלת התראות' })).toHaveTextContent(
      'בלי פרסומות',
    )
  })
})
