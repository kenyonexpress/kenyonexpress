import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import OfflineIndicator from './OfflineIndicator'

/**
 * WHAT THIS PINS, AND WHY EACH ONE IS A REAL FAILURE.
 *
 * The service worker serves the last catalogue pages a shopper saw when the
 * network is gone. That is the feature, and it is precisely what makes a
 * silent offline mode dangerous: a cached page looks exactly like a loaded one,
 * so a shopper taps a product, nothing happens, and the shop looks broken.
 *
 *   renders nothing while online   the header is under the pixel parity gate at
 *                                  380, 768 and 1440. A strip occupying a row
 *                                  would move every band below it on every page
 *                                  for a state almost nobody is in.
 *   reads onLine ON MOUNT          a visitor can arrive on a cached page ALREADY
 *                                  offline. No event ever fires in that case, so
 *                                  subscribing alone leaves the strip hidden for
 *                                  the entire visit -- which is the one visit it
 *                                  exists for.
 *   only trusts `false`            `navigator.onLine === true` means an interface
 *                                  exists, not that anything is reachable; a
 *                                  captive portal reports true. The component
 *                                  never claims to be online, it only reports
 *                                  the reading that is sound.
 */

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

afterEach(() => {
  setOnLine(true)
})

describe('the offline indicator', () => {
  it('renders nothing at all while the connection is up', () => {
    setOnLine(true)
    const { container } = render(<OfflineIndicator />)
    // Not "is hidden" -- nothing in the DOM, so it occupies no row and costs
    // the header no pixels.
    expect(container).toBeEmptyDOMElement()
  })

  it('appears when the connection drops', () => {
    setOnLine(true)
    render(<OfflineIndicator />)

    act(() => {
      setOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })

    expect(screen.getByRole('status')).toHaveTextContent('אין חיבור לאינטרנט')
  })

  it('appears on a page opened while already offline, with no event to go on', () => {
    // The case a subscribe-only implementation misses entirely.
    setOnLine(false)
    render(<OfflineIndicator />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('goes away again when the connection comes back', () => {
    setOnLine(false)
    render(<OfflineIndicator />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      setOnLine(true)
      window.dispatchEvent(new Event('online'))
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('is polite rather than an alert, and reads right to left', () => {
    // Losing signal does not warrant interrupting a screen reader mid-sentence.
    setOnLine(false)
    render(<OfflineIndicator />)
    const strip = screen.getByRole('status')
    expect(strip).toHaveAttribute('aria-live', 'polite')
    expect(strip).toHaveAttribute('dir', 'rtl')
  })

  it('tells the shopper what they are looking at, not just that it failed', () => {
    // "No connection" alone leaves a cached catalogue page looking like a live
    // one. The second sentence is the part that makes the first useful.
    setOnLine(false)
    render(<OfflineIndicator />)
    expect(screen.getByRole('status')).toHaveTextContent('עמודים שכבר ביקרתם בהם')
  })
})
