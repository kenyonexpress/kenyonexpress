import { LOGIN_DIALOG_EVENT } from '@/lib/auth/login-dialog'
import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import LoginLink from './LoginLink'

/**
 * jsdom cannot navigate, so a click whose default stands logs "Not
 * implemented: navigation". The document listener below runs AFTER React's
 * handler (React listens on the root container, under document), records
 * whether the link left the navigation alone, and only then stops jsdom from
 * attempting it. `click()` returns that record.
 */
describe('LoginLink', () => {
  const hosts: Array<(e: Event) => void> = []
  let navigates: boolean | null = null
  const settle = (e: Event) => {
    navigates = !e.defaultPrevented
    e.preventDefault()
  }
  beforeEach(() => {
    navigates = null
    document.addEventListener('click', settle)
  })
  afterEach(() => {
    document.removeEventListener('click', settle)
    for (const h of hosts.splice(0)) window.removeEventListener(LOGIN_DIALOG_EVENT, h)
  })
  function click(a: HTMLAnchorElement, init?: MouseEventInit): boolean {
    fireEvent.click(a, init)
    return navigates === true
  }
  function mountHost(claim: boolean): { details: Array<{ next?: string; mode?: string }> } {
    const details: Array<{ next?: string; mode?: string }> = []
    const host = (e: Event) => {
      details.push((e as CustomEvent).detail)
      if (claim) e.preventDefault()
    }
    hosts.push(host)
    window.addEventListener(LOGIN_DIALOG_EVENT, host)
    return { details }
  }

  it('renders the same anchor it always did: href, class and children', () => {
    const { container } = render(
      <LoginLink href="/login" className="tap-area hover:text-heading-hover">
        התחברות
      </LoginLink>,
    )
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('/login')
    expect(a.className).toContain('hover:text-heading-hover')
    expect(a.textContent).toBe('התחברות')
    expect(a.outerHTML).not.toContain('dialog')
  })

  it('navigates when no dialog is mounted', () => {
    const { container } = render(<LoginLink href="/login">התחברות</LoginLink>)
    const a = container.querySelector('a') as HTMLAnchorElement
    // No listener, no claim: the click's default (the navigation) stands.
    expect(click(a)).toBe(true)
  })

  it('opens the dialog and stops the navigation when a host claims the click', () => {
    const { details } = mountHost(true)
    window.history.replaceState(null, '', '/products?page=2')
    const { container } = render(<LoginLink href="/login">התחברות</LoginLink>)
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(click(a)).toBe(false)
    expect(details).toEqual([{ next: '/products?page=2', mode: 'login' }])
  })

  it('passes the link’s own next through to the dialog', () => {
    const { details } = mountHost(true)
    const { container } = render(
      <LoginLink href="/login?next=%2Fgift%2Fabc">התחברות וקבלת הקופון</LoginLink>,
    )
    click(container.querySelector('a') as HTMLAnchorElement)
    expect(details).toEqual([{ next: '/gift/abc', mode: 'login' }])
  })

  it('asks for the register body when the href is /signup (UX24), with its next', () => {
    const { details } = mountHost(true)
    window.history.replaceState(null, '', '/products')
    const { container } = render(
      <>
        <LoginLink href="/signup?next=%2Fcart">הרשמה</LoginLink>
        <LoginLink href="/signup">הרשמה</LoginLink>
      </>,
    )
    const [withNext, bare] = container.querySelectorAll('a')
    expect(click(withNext as HTMLAnchorElement)).toBe(false)
    expect(click(bare as HTMLAnchorElement)).toBe(false)
    expect(details).toEqual([
      { next: '/cart', mode: 'signup' },
      { next: '/products', mode: 'signup' },
    ])
  })

  it('leaves a modified click alone: a new tab is what the shopper asked for', () => {
    const { details } = mountHost(true)
    const { container } = render(<LoginLink href="/login">התחברות</LoginLink>)
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(click(a, { metaKey: true })).toBe(true)
    expect(click(a, { ctrlKey: true })).toBe(true)
    expect(click(a, { button: 1 })).toBe(true)
    expect(details).toEqual([])
  })

  it('still navigates when a host listens but does not claim', () => {
    mountHost(false)
    const { container } = render(<LoginLink href="/login">התחברות</LoginLink>)
    expect(click(container.querySelector('a') as HTMLAnchorElement)).toBe(true)
  })
})
