import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InstallPrompt from './InstallPrompt'

/**
 * THE BANNER WAS LYING ON TOP OF THE BOTTOM OF EVERY PAGE.
 *
 * It is `fixed`, and nothing reserved the space it occupies, so it covered
 * whatever was at the foot of the fold. The consent banner had already paid for
 * this exact lesson -- `globals.css` carries eleven measured viewport widths
 * proving its own reservation was short -- and the install prompt shipped
 * without one.
 *
 * Two more things this pins:
 *
 * - it does not appear before the visitor has done anything. Chrome fires
 *   `beforeinstallprompt` off an engagement heuristic that can be satisfied a
 *   second after paint, and a prompt dismissed on sight is dismissed forever,
 *   because the dismissal is remembered.
 * - the reservation is REMOVED when the banner goes, or every page keeps a
 *   6rem hole at the bottom for the rest of the session.
 */

function fireInstallPrompt() {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  event.prompt = () => Promise.resolve()
  event.userChoice = Promise.resolve({ outcome: 'dismissed' as const })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-pwa-prompt')
  vi.stubGlobal('matchMedia', ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia)
})

afterEach(() => vi.unstubAllGlobals())

describe('InstallPrompt', () => {
  it('stays hidden until the visitor has actually done something', () => {
    render(<InstallPrompt />)
    fireInstallPrompt()
    expect(screen.queryByRole('region', { name: 'התקנת האפליקציה' })).toBeNull()
    expect(document.documentElement.hasAttribute('data-pwa-prompt')).toBe(false)
  })

  it('appears after an interaction, and reserves its own space', () => {
    render(<InstallPrompt />)
    fireInstallPrompt()
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.getByRole('region', { name: 'התקנת האפליקציה' })).toBeTruthy()
    // The attribute globals.css adds `--reserve-pwa` off. Without it the banner
    // is `fixed` over the fold, which is the defect.
    expect(document.documentElement.hasAttribute('data-pwa-prompt')).toBe(true)
  })

  it('gives the space back when it is dismissed', () => {
    render(<InstallPrompt />)
    fireInstallPrompt()
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    act(() => {
      screen.getByRole('button', { name: 'לא עכשיו' }).click()
    })
    expect(screen.queryByRole('region', { name: 'התקנת האפליקציה' })).toBeNull()
    expect(document.documentElement.hasAttribute('data-pwa-prompt')).toBe(false)
    expect(localStorage.getItem('ke:pwa-install-dismissed')).toBe('1')
  })

  it('never comes back once dismissed', () => {
    localStorage.setItem('ke:pwa-install-dismissed', '1')
    render(<InstallPrompt />)
    fireInstallPrompt()
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.queryByRole('region', { name: 'התקנת האפליקציה' })).toBeNull()
  })

  it('labels both buttons in Hebrew and sizes them for a thumb', () => {
    render(<InstallPrompt />)
    fireInstallPrompt()
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    for (const name of ['לא עכשיו', 'התקנה']) {
      const button = screen.getByRole('button', { name })
      // --spacing-touch-min is 44px, the WCAG 2.5.5 floor.
      expect(button.className).toContain('min-h-touch-min')
      expect(button.className).toContain('focus-visible:outline-2')
    }
  })
})

/**
 * THE iOS FORM, WHICH NO EVENT CAN RAISE.
 *
 * Safari on iOS never fires `beforeinstallprompt`, so until 2026-09-17 the
 * banner above rendered for nobody on an iPhone: the `apple-touch-icon` and
 * `appleWebApp` metadata in the root layout described an install that no
 * shopper was ever told how to perform. On that platform the offer is the two
 * taps in the share sheet, and the same interaction gate, the same space
 * reservation and the same dismissal key apply to it.
 */
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

function pretendToBe(userAgent: string, extra: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries({ userAgent, platform: 'iPhone', ...extra })) {
    Object.defineProperty(window.navigator, key, { value, configurable: true })
  }
}

describe('InstallPrompt on iOS', () => {
  // The overrides are `configurable`, so deleting them uncovers jsdom's own
  // navigator again for whatever runs next in this file.
  afterEach(() => {
    for (const key of ['userAgent', 'platform', 'standalone']) {
      delete (window.navigator as unknown as Record<string, unknown>)[key]
    }
  })

  it('shows the share-sheet instructions after an interaction, without any event', () => {
    pretendToBe(IPHONE)
    render(<InstallPrompt />)
    // No beforeinstallprompt is dispatched: there is none to dispatch.
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    const banner = screen.getByRole('region', { name: 'התקנת האפליקציה' })
    expect(banner.getAttribute('data-install-surface')).toBe('ios')
    // The sheet item verbatim, so the shopper matches text they can see.
    expect(banner.textContent).toContain('הוסף למסך הבית')
    expect(banner.textContent).toContain('שיתוף')
    // There is no API to call, so there is no install button to press.
    expect(screen.queryByRole('button', { name: 'התקנה' })).toBeNull()
    expect(document.documentElement.hasAttribute('data-pwa-prompt')).toBe(true)
  })

  it('still waits for the visitor to do something first', () => {
    pretendToBe(IPHONE)
    render(<InstallPrompt />)
    expect(screen.queryByRole('region', { name: 'התקנת האפליקציה' })).toBeNull()
  })

  it('is dismissed for good by the one button it has, and gives the space back', () => {
    pretendToBe(IPHONE)
    render(<InstallPrompt />)
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    const button = screen.getByRole('button', { name: 'הבנתי' })
    expect(button.className).toContain('min-h-touch-min')
    act(() => {
      button.click()
    })
    expect(screen.queryByRole('region', { name: 'התקנת האפליקציה' })).toBeNull()
    expect(document.documentElement.hasAttribute('data-pwa-prompt')).toBe(false)
    // The same key Chrome's form writes, so neither form ever re-asks.
    expect(localStorage.getItem('ke:pwa-install-dismissed')).toBe('1')
  })

  it("stays silent once the app is on the home screen, via Safari's navigator.standalone", () => {
    pretendToBe(IPHONE, { standalone: true })
    render(<InstallPrompt />)
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.queryByRole('region', { name: 'התקנת האפליקציה' })).toBeNull()
  })
})
