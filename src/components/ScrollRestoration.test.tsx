import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScrollRestoration from './ScrollRestoration'

describe('ScrollRestoration', () => {
  beforeEach(() => {
    sessionStorage.clear()
    window.scrollY = 0
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

  it('saves scroll position on beforeunload', () => {
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: 250,
    })

    render(<ScrollRestoration />)
    window.dispatchEvent(new Event('beforeunload'))

    expect(sessionStorage.getItem('scroll-y')).toBe('250')
  })

  it('restores scroll position on pageshow event', () => {
    sessionStorage.setItem('scroll-y', '350')

    const scrollToSpy = vi.spyOn(window, 'scrollTo')
    render(<ScrollRestoration />)

    const event = new PageTransitionEvent('pageshow', { persisted: true })
    window.dispatchEvent(event)

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 350,
      left: 0,
      behavior: 'auto',
    })
  })

  it('handles missing scroll-y in sessionStorage', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo')
    render(<ScrollRestoration />)

    const event = new PageTransitionEvent('pageshow', { persisted: true })
    window.dispatchEvent(event)

    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('cleans up event listeners on unmount', () => {
    const { unmount } = render(<ScrollRestoration />)
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('pageshow', expect.any(Function))
    removeEventListenerSpy.mockRestore()
  })

  it('full flow: saves on beforeunload and restores on pageshow', () => {
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: 500,
    })

    render(<ScrollRestoration />)
    window.dispatchEvent(new Event('beforeunload'))
    expect(sessionStorage.getItem('scroll-y')).toBe('500')

    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: 0,
    })

    const scrollToSpy = vi.spyOn(window, 'scrollTo')
    const event = new PageTransitionEvent('pageshow', { persisted: true })
    window.dispatchEvent(event)

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 500,
      left: 0,
      behavior: 'auto',
    })
  })

  it('simulates back navigation: user scrolls → navigates away → returns to page with scroll restored', () => {
    // Step 1: User scrolls down
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: 750,
    })

    const { unmount } = render(<ScrollRestoration />)

    // Step 2: User navigates away (beforeunload fires)
    window.dispatchEvent(new Event('beforeunload'))
    expect(sessionStorage.getItem('scroll-y')).toBe('750')

    // Step 3: Component unmounts (page leaves)
    unmount()

    // Step 4: User hits back button (new page instance, bfcache restores)
    // Reset scrollY to simulate new page load at top
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: 0,
    })

    const scrollToSpy = vi.spyOn(window, 'scrollTo')

    // Step 5: New component instance with stored position
    render(<ScrollRestoration />)

    // Step 6: Browser fires pageshow with persisted=true (back navigation)
    const backNavEvent = new PageTransitionEvent('pageshow', { persisted: true })
    window.dispatchEvent(backNavEvent)

    // Step 7: Scroll restored to saved position
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 750,
      left: 0,
      behavior: 'auto',
    })
  })
})
