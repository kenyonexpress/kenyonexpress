import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pathname = { current: '/account' }

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}))

import AccountTabs from './AccountTabs'

/**
 * UX18: the tab bar is a nav of five links with Hebrew labels, one of them
 * `aria-current="page"`, and it is route-based (no tablist, no tab roles:
 * each link loads its own page).
 */
describe('AccountTabs', () => {
  beforeEach(() => {
    pathname.current = '/account'
  })

  it('renders five links in Hebrew inside a labelled nav', () => {
    render(<AccountTabs />)
    const nav = screen.getByRole('navigation', { name: 'אזורי החשבון' })
    const links = nav.querySelectorAll('a.account-tabbar__link')
    expect(links).toHaveLength(5)
    expect([...links].map((a) => a.textContent)).toEqual([
      'סקירה',
      'ההזמנות שלי',
      'רשימת המשאלות',
      'כתובות',
      'הגדרות',
    ])
    expect([...links].map((a) => a.getAttribute('href'))).toEqual([
      '/account',
      '/account/orders',
      '/account/wishlist',
      '/account/addresses',
      '/account/settings',
    ])
    expect(nav.querySelector('[role="tablist"]')).toBeNull()
  })

  it('marks the overview current on /account and nothing else', () => {
    render(<AccountTabs />)
    const current = screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current'))
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('סקירה')
    expect(current[0]).toHaveAttribute('aria-current', 'page')
  })

  it('lights the orders tab on an order page and the settings tab on a settings child', () => {
    pathname.current = '/account/orders/3f2a'
    const first = render(<AccountTabs />)
    expect(screen.getByRole('link', { name: 'ההזמנות שלי' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'סקירה' })).not.toHaveAttribute('aria-current')
    first.unmount()

    pathname.current = '/account/notifications'
    render(<AccountTabs />)
    expect(screen.getByRole('link', { name: 'הגדרות' })).toHaveAttribute('aria-current', 'page')
  })

  it('lights nothing on an account page outside the five', () => {
    pathname.current = '/account/wallet'
    render(<AccountTabs />)
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current'))).toHaveLength(
      0,
    )
  })
})
