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
 * - it is shown ONCE per device, and that is recorded when it appears rather
 *   than when it is answered. A visitor who scrolls past without touching it
 *   has pressed nothing, so a dismissal-only record brings the banner back on
 *   the next visit and the one after.
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

  it('records that it was shown the moment it appears, not when it is answered', () => {
    render(<InstallPrompt />)
    fireInstallPrompt()
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.getByRole('region', { name: 'התקנת האפליקציה' })).toBeInTheDocument()
    // Nothing has been pressed. The showing is already spent.
    expect(localStorage.getItem('ke:pwa-install-shown')).toBe('1')
  })

  it('never comes back after it has been shown once, even if it was ignored', () => {
    // The nagging case: scrolled past, never answered, no dismissal recorded.
    localStorage.setItem('ke:pwa-install-shown', '1')
    render(<InstallPrompt />)
    fireInstallPrompt()
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.queryByRole('region', { name: 'התקנת האפליקציה' })).toBeNull()
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
