import { activeTabHref } from '@/components/layout/BottomTabBar'
import BottomTabBarActive from '@/components/layout/BottomTabBarActive'
import { t } from '@/lib/i18n/messages'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const pathname = vi.hoisted(() => ({ current: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }))

/**
 * The two things that make a bottom bar wrong rather than merely ugly: an
 * active state that lies about where you are, and a target a thumb misses.
 */

function renderAt(path: string) {
  pathname.current = path
  return render(<BottomTabBarActive />)
}

describe('activeTabHref', () => {
  it('matches home exactly, because "/" is a prefix of everything', () => {
    // A prefix match here would light the home tab on every page in the site
    // and make the active state meaningless.
    expect(activeTabHref('/')).toBe('/')
    expect(activeTabHref('/search')).not.toBe('/')
    expect(activeTabHref('/account')).not.toBe('/')
  })

  it('keeps a tab lit inside its own sub-tree', () => {
    expect(activeTabHref('/account/orders')).toBe('/account')
    expect(activeTabHref('/category/hot-deals')).toBe('/products')
    expect(activeTabHref('/search?q=x'.split('?')[0] as string)).toBe('/search')
  })

  it('gives the wallet sub-tree to the wallet tab, not to account', () => {
    // Both tabs match /account/wallet. Array order is the tiebreak, and it is
    // the reason the wallet entry is declared before the account entry.
    expect(activeTabHref('/account/wallet')).toBe('/account/wallet')
    expect(activeTabHref('/account/my-vouchers')).toBe('/account/wallet')
  })

  it('does not match a path that merely starts with the same letters', () => {
    // `/accounts-payable` is not inside `/account`.
    expect(activeTabHref('/accounts-payable')).toBeNull()
    expect(activeTabHref('/searching')).toBeNull()
  })

  it('lights nothing on a route no tab owns, rather than guessing', () => {
    expect(activeTabHref('/cart')).toBeNull()
    expect(activeTabHref('/checkout')).toBeNull()
  })
})

describe('BottomTabBar', () => {
  it('renders the five destinations the phone journey needs', () => {
    renderAt('/')
    // Read through the catalog, like the component, so a renamed key fails
    // here instead of this test asserting a string the UI no longer shows.
    for (const key of [
      'nav.tabbar.home',
      'nav.tabbar.categories',
      'nav.tabbar.search',
      'nav.tabbar.wallet',
      'nav.tabbar.account',
    ] as const) {
      const label = t(key)
      expect(screen.getByRole('link', { name: label }), key).toBeTruthy()
    }
  })

  it('marks exactly one tab as the current page', () => {
    renderAt('/account/orders')
    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')

    expect(current).toHaveLength(1)
    expect(current[0]?.textContent).toContain(t('nav.tabbar.account'))
  })

  it('marks none when no tab owns the route', () => {
    renderAt('/checkout')
    expect(
      screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page'),
    ).toHaveLength(0)
  })

  it('gives every target the 44px floor WCAG 2.5.5 asks for', () => {
    // `min-h-11` is Tailwind's 44px and is how the rest of this repo spells the
    // floor. Five across at 380px is where it is easiest to miss: the label is
    // --text-micro, so the padded anchor and not the glyph is what the thumb
    // has to hit.
    renderAt('/')
    for (const link of screen.getAllByRole('link')) {
      expect(link.className, link.textContent ?? '').toContain('min-h-11')
    }
  })

  it('hides itself from 768px up instead of shrinking', () => {
    const { container } = renderAt('/')
    expect(container.querySelector('[data-bottom-tab-bar]')?.className).toContain('md:hidden')
  })

  it('sits below the consent banner and the WhatsApp button', () => {
    // z-30 against the banner's 50 and the button's 40. The banner is a legal
    // gate that must not be coverable; it is dismissed once and then removed.
    const { container } = renderAt('/')
    expect(container.querySelector('[data-bottom-tab-bar]')?.className).toContain('z-30')
  })

  it('is a labelled landmark, so a screen reader can jump to it', () => {
    renderAt('/')
    expect(screen.getByRole('navigation', { name: t('nav.tabbar.label') })).toBeTruthy()
  })

  it('uses logical inset so RTL needs no override', () => {
    const { container } = renderAt('/')
    const cls = container.querySelector('[data-bottom-tab-bar]')?.className ?? ''
    expect(cls).toContain('inset-inline-0')
    expect(cls).not.toMatch(/\b(left|right)-0\b/)
  })
})
