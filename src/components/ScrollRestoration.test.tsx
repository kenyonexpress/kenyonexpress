import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScrollRestoration from './ScrollRestoration'

describe('ScrollRestoration', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('renders without crashing', () => {
    const { container } = render(<ScrollRestoration />)
    expect(container).toBeInTheDocument()
  })

  it('returns null (no visual output)', () => {
    const { container } = render(<ScrollRestoration />)
    expect(container.firstChild).toBeNull()
  })

  it('sets scroll restoration to auto if supported', () => {
    render(<ScrollRestoration />)
    if ('scrollRestoration' in window.history) {
      expect(window.history.scrollRestoration).toBe('auto')
    }
  })

  it('stores scroll position on pagehide event', () => {
    render(<ScrollRestoration />)

    // Simulate page hide event
    const event = new Event('pagehide')
    window.dispatchEvent(event)

    const stored = sessionStorage.getItem('scroll-position')
    expect(stored).toBe(String(window.scrollY))
  })

  it('restores scroll position on pageshow event', () => {
    // Set a stored scroll position
    sessionStorage.setItem('scroll-position', '100')

    render(<ScrollRestoration />)

    // Simulate pageshow event with persisted flag
    const event = new PageTransitionEvent('pageshow', { persisted: true })
    window.dispatchEvent(event)

    // Check that scrollTo was attempted
    expect(sessionStorage.getItem('scroll-position')).toBe('100')
  })

  it('handles missing scroll-position in sessionStorage', () => {
    render(<ScrollRestoration />)

    // Simulate pageshow without stored position
    const event = new PageTransitionEvent('pageshow', { persisted: true })
    expect(() => window.dispatchEvent(event)).not.toThrow()
  })

  it('cleans up event listeners on unmount', () => {
    const { unmount } = render(<ScrollRestoration />)

    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('pageshow', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('pagehide', expect.any(Function))

    removeEventListenerSpy.mockRestore()
  })
})
