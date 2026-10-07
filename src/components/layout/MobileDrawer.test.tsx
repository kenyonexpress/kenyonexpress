import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MobileDrawer from './MobileDrawer'

/**
 * STEP 32 (2026-10-07). Two keyboard defects measured on the built home page
 * at 390px, neither of which axe reports because both are behaviour, not
 * markup:
 *
 *   1. The panel said `aria-modal="true"` and let Tab out. The 13th Tab from
 *      the open drawer landed on the masthead logo link under the scrim.
 *   2. The closed panel is translated off-screen, not removed, and a
 *      translated element is still focusable: Tab reached its close button
 *      at 44x44 entirely outside the viewport.
 *
 * The e2e suite walks the real page; this is the unit of the same contract,
 * so a refactor that drops either effect fails in `pnpm test` first.
 *
 * jsdom has no layout, so `getClientRects()` is empty for everything and the
 * trap's visibility filter would see no focusable at all. It is stubbed to
 * one rect for the test, which is what the browser returns for a rendered
 * link; the filter itself is exercised by the e2e walk.
 */

const rects = vi.spyOn(Element.prototype, 'getClientRects')

beforeEach(() => {
  rects.mockImplementation(() => [{}] as unknown as DOMRectList)
})

afterEach(() => {
  rects.mockReset()
})

function open() {
  render(<MobileDrawer />)
  const trigger = screen.getByRole('button', { name: 'תפריט קטגוריות', expanded: false })
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'תפריט קטגוריות' })
  return { trigger, dialog }
}

function tab(shift = false) {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: shift,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
}

describe('MobileDrawer keyboard contract', () => {
  it('is inert while closed, so an off-screen panel is not in the tab order', () => {
    render(<MobileDrawer />)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.hasAttribute('inert')).toBe(true)
    // The scrim is the other focusable outside the panel; it is parked too.
    expect(
      screen.getAllByRole('button', { name: 'סגירת התפריט', hidden: true })[0],
    ).toHaveAttribute('tabindex', '-1')
  })

  it('drops inert and moves focus into the panel when opened', () => {
    const { dialog } = open()
    expect(dialog.hasAttribute('inert')).toBe(false)
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('wraps Tab from the last category back to the close button, and Shift+Tab the other way', () => {
    const { dialog } = open()
    const focusables = dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
    const first = focusables[0] as HTMLElement
    const last = focusables[focusables.length - 1] as HTMLElement
    expect(first).toHaveAccessibleName('סגירת התפריט')

    last.focus()
    tab()
    expect(document.activeElement).toBe(first)

    first.focus()
    tab(true)
    expect(document.activeElement).toBe(last)
  })

  it('pulls focus back in if something outside the panel took it', () => {
    const { dialog } = open()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    expect(dialog.contains(document.activeElement)).toBe(false)
    tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    outside.remove()
  })

  it('Escape closes, returns focus to the trigger, and the panel is inert again', () => {
    const { trigger, dialog } = open()
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.activeElement).toBe(trigger)
    expect(dialog.hasAttribute('inert')).toBe(true)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
