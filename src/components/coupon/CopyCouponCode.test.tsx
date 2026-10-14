import { act, fireEvent, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CopyCouponCode, { COPIED_CONFIRMATION_MS } from './CopyCouponCode'

/**
 * UX10: the coupon code and its copy button. The clipboard is the browser's,
 * so it is stubbed here two ways: granted (the code lands in it and the
 * button says so for COPIED_CONFIRMATION_MS) and refused (the code is
 * selected on screen and the button says to copy it by hand). Production has
 * no row with a code until 270 is applied, which is why this lives here and
 * the e2e skips.
 */
describe('CopyCouponCode', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    vi.useFakeTimers()
    writeText.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the code visibly, left to right, inside the button', () => {
    const html = renderToStaticMarkup(<CopyCouponCode code="SPA90" />)
    expect(html).toContain('data-copy-code')
    expect(html).toContain('data-state="idle"')
    expect(html).toMatch(/<code[^>]*data-coupon-code[^>]*dir="ltr"[^>]*>SPA90<\/code>/)
    expect(html).toContain('העתקת קוד')
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('aria-label')
  })

  it('writes the code to the clipboard, confirms, and reverts after the confirmation window', async () => {
    writeText.mockResolvedValue(undefined)
    const { container } = render(<CopyCouponCode code="SPA90" />)
    const button = container.querySelector('[data-copy-code]') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(button)
    })
    expect(writeText).toHaveBeenCalledWith('SPA90')
    expect(button.dataset.state).toBe('copied')
    expect(button.textContent).toContain('הקוד הועתק')
    act(() => {
      vi.advanceTimersByTime(COPIED_CONFIRMATION_MS - 1)
    })
    expect(button.dataset.state).toBe('copied')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(button.dataset.state).toBe('idle')
    expect(button.textContent).toContain('העתקת קוד')
  })

  it('selects the code on screen and says to copy by hand when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const { container } = render(<CopyCouponCode code="SPA90" />)
    const button = container.querySelector('[data-copy-code]') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(button)
    })
    expect(button.dataset.state).toBe('failed')
    expect(button.textContent).toContain('העתיקו ידנית')
    const selected = window.getSelection()?.toString()
    expect(selected).toBe('SPA90')
    // The code itself never leaves the screen.
    expect(container.querySelector('[data-coupon-code]')?.textContent).toBe('SPA90')
  })

  it('survives a browser with no clipboard API at all', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    const { container } = render(<CopyCouponCode code="SPA90" />)
    const button = container.querySelector('[data-copy-code]') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(button)
    })
    expect(button.dataset.state).toBe('failed')
  })

  it('clears the pending revert on unmount', async () => {
    writeText.mockResolvedValue(undefined)
    const { container, unmount } = render(<CopyCouponCode code="SPA90" />)
    const button = container.querySelector('[data-copy-code]') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(button)
    })
    unmount()
    expect(() => vi.advanceTimersByTime(COPIED_CONFIRMATION_MS + 10)).not.toThrow()
  })
})
