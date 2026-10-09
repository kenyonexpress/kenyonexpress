import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PostPurchasePushPrompt from './PostPurchasePushPrompt'

/**
 * A NOTIFICATION PERMISSION IS ASKED FOR ONCE, EVER.
 *
 * "Block" is not "no, thanks". A blocked origin cannot ask again: the customer
 * has to find site settings in their browser and undo it by hand. Every
 * assertion here is about not spending that one chance on somebody who has
 * already answered, or spending it twice.
 */

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

  it('is shown once per device and not on the next order', () => {
    const first = render(<PostPurchasePushPrompt />)
    expect(first.container).not.toBeEmptyDOMElement()
    first.unmount()

    const second = render(<PostPurchasePushPrompt />)
    expect(second.container).toBeEmptyDOMElement()
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
