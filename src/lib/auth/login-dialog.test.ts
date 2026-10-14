import { afterEach, describe, expect, it } from 'vitest'
import {
  LOGIN_DIALOG_EVENT,
  currentLocationNext,
  isPlainActivation,
  nextFromLoginHref,
  openLoginDialog,
} from './login-dialog'

describe('openLoginDialog', () => {
  const listeners: Array<(e: Event) => void> = []
  afterEach(() => {
    for (const l of listeners.splice(0)) window.removeEventListener(LOGIN_DIALOG_EVENT, l)
  })

  it('returns false when nothing is listening, so the link navigates', () => {
    expect(openLoginDialog({ next: '/cart' })).toBe(false)
  })

  it('returns true once a host claims the event by preventing its default', () => {
    const seen: unknown[] = []
    const host = (e: Event) => {
      seen.push((e as CustomEvent).detail)
      e.preventDefault()
    }
    listeners.push(host)
    window.addEventListener(LOGIN_DIALOG_EVENT, host)
    expect(openLoginDialog({ next: '/cart' })).toBe(true)
    expect(seen).toEqual([{ next: '/cart' }])
  })

  it('a listener that does not claim leaves the link to navigate', () => {
    const host = () => {}
    listeners.push(host)
    window.addEventListener(LOGIN_DIALOG_EVENT, host)
    expect(openLoginDialog()).toBe(false)
  })
})

describe('nextFromLoginHref', () => {
  it('reads the next a login link already carries', () => {
    expect(nextFromLoginHref('/login?next=%2Fgift%2Fabc')).toBe('/gift/abc')
    expect(nextFromLoginHref('/login?next=/gift-card')).toBe('/gift-card')
  })
  it('is null for a bare /login and for an empty next', () => {
    expect(nextFromLoginHref('/login')).toBeNull()
    expect(nextFromLoginHref('/login?next=')).toBeNull()
    expect(nextFromLoginHref('/login?error=x')).toBeNull()
  })
})

describe('currentLocationNext', () => {
  it('is the path plus the query, never a fragment', () => {
    expect(currentLocationNext({ pathname: '/search', search: '?q=%D7%96%D7%95%D7%92' })).toBe(
      '/search?q=%D7%96%D7%95%D7%92',
    )
    expect(currentLocationNext({ pathname: '/', search: '' })).toBe('/')
  })
})

describe('isPlainActivation', () => {
  it('is true for a bare primary click', () => {
    expect(isPlainActivation({ button: 0 })).toBe(true)
    expect(isPlainActivation({})).toBe(true)
  })
  it.each([
    ['meta', { metaKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['middle button', { button: 1 }],
    ['already handled', { defaultPrevented: true }],
  ])('is false with %s, so a new-tab or handled click stays a navigation', (_, event) => {
    expect(isPlainActivation(event)).toBe(false)
  })
})
