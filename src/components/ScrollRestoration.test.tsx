import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ScrollRestoration from './ScrollRestoration'

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value })
}

/** jsdom's location is http://localhost:3000/ in this suite, so the path is "/". */
function saved(path: string, y: number) {
  sessionStorage.setItem('scroll-y', JSON.stringify({ path, y }))
}

describe('ScrollRestoration', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setScrollY(0)
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('saves the scroll position WITH the path it belongs to on beforeunload', () => {
    window.history.replaceState(null, '', '/product/x?y=1')
    setScrollY(250)

    render(<ScrollRestoration />)
    window.dispatchEvent(new Event('beforeunload'))

    expect(JSON.parse(sessionStorage.getItem('scroll-y') ?? 'null')).toEqual({
      path: '/product/x?y=1',
      y: 250,
    })
  })

  it('restores on a persisted pageshow for the same path', () => {
    saved('/', 350)
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<ScrollRestoration />)

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 350, left: 0, behavior: 'auto' })
  })

  /**
   * THE DEFECT THIS COMPONENT HAD. A product page scrolled 729px saved that
   * number, and /checkout, a different page whose body had not streamed yet,
   * was scrolled 729px on arrival: CLS 0.4515 on the production build at
   * Pixel 5, measured 2026-10-21, all of it the footer leaving the viewport.
   */
  it('never applies a position saved on a different path', () => {
    saved('/product/x', 729)
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<ScrollRestoration />)

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))

    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('does not restore on an ordinary (non-persisted) pageshow', () => {
    saved('/', 350)
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<ScrollRestoration />)

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))

    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('does not restore on mount for a forward navigation, only for back_forward', () => {
    saved('/', 400)
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const entries = vi.spyOn(performance, 'getEntriesByType')

    entries.mockReturnValue([{ type: 'navigate' } as unknown as PerformanceEntry])
    const first = render(<ScrollRestoration />)
    expect(scrollToSpy).not.toHaveBeenCalled()
    first.unmount()

    entries.mockReturnValue([{ type: 'back_forward' } as unknown as PerformanceEntry])
    render(<ScrollRestoration />)
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 400, left: 0, behavior: 'auto' })
  })

  it('ignores an entry written by the old unscoped version (a bare number)', () => {
    sessionStorage.setItem('scroll-y', '350')
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<ScrollRestoration />)

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))

    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('handles missing scroll-y in sessionStorage', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<ScrollRestoration />)

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))

    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('cleans up event listeners on unmount', () => {
    const { unmount } = render(<ScrollRestoration />)
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('pageshow', expect.any(Function))
  })

  it('full flow: scroll, leave, come back with bfcache, restored on the same path', () => {
    setScrollY(750)
    const { unmount } = render(<ScrollRestoration />)

    window.dispatchEvent(new Event('beforeunload'))
    expect(JSON.parse(sessionStorage.getItem('scroll-y') ?? 'null')).toEqual({ path: '/', y: 750 })
    unmount()

    setScrollY(0)
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<ScrollRestoration />)
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 750, left: 0, behavior: 'auto' })
  })
})
