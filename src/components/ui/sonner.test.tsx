import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MAX_VISIBLE_TOASTS, TOAST_DURATION_MS } from '@/lib/ui/toast'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

type Captured = {
  theme?: string
  position?: string
  dir?: string
  richColors?: boolean
  closeButton?: boolean
  visibleToasts?: number
  duration?: number
  mobileOffset?: number
  className?: string
  containerAriaLabel?: string
  icons?: Record<string, ReactNode>
  toastOptions?: { closeButtonAriaLabel?: string }
}

vi.mock('sonner', () => ({
  Toaster: (props: Captured) => (
    <div
      data-testid="sonner"
      data-props={JSON.stringify({ ...props, icons: Object.keys(props.icons ?? {}) })}
    />
  ),
}))

import { TOASTER_ARIA_LABEL, TOAST_CLOSE_LABEL, Toaster } from './sonner'

function captured(): Captured & { icons: string[] } {
  return JSON.parse(screen.getByTestId('sonner').getAttribute('data-props') ?? '{}')
}

/**
 * UX28: the toaster's policy lives here and nowhere else. Measured before
 * (logs/ux28/before.json): three layouts each repeated the same four props,
 * the admin layout repeated none and so mounted nothing, and `useTheme()`
 * without a provider followed the OS, painting a black toast on a white site
 * for a shopper with a dark desktop.
 */
describe('Toaster', () => {
  it('bakes the site policy in, so a bare <Toaster /> is the whole configuration', () => {
    render(<Toaster />)
    const p = captured()
    expect(p.theme).toBe('light')
    expect(p.position).toBe('top-center')
    expect(p.dir).toBe('rtl')
    expect(p.richColors).toBe(true)
    expect(p.closeButton).toBe(true)
    expect(p.visibleToasts).toBe(MAX_VISIBLE_TOASTS)
    expect(p.duration).toBe(TOAST_DURATION_MS.success)
    // 20 and not sonner's 16: the 44px close hit box must end on the screen at 380.
    expect(p.mobileOffset).toBe(20)
    expect(p.className).toContain('ke-toaster')
  })

  it('names the region and the close button in Hebrew', () => {
    render(<Toaster />)
    const p = captured()
    expect(p.containerAriaLabel).toBe(TOASTER_ARIA_LABEL)
    expect(TOASTER_ARIA_LABEL).toBe('התראות')
    expect(p.toastOptions?.closeButtonAriaLabel).toBe(TOAST_CLOSE_LABEL)
    expect(TOAST_CLOSE_LABEL).toMatch(/^[֐-׿\s]+$/)
  })

  it('carries an icon for each of the four kinds notify() can raise', () => {
    render(<Toaster />)
    expect(captured().icons.sort()).toEqual(['error', 'info', 'success', 'warning'])
  })

  it('does not read the OS theme: next-themes is gone from the component', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/ui/sonner.tsx'), 'utf8')
      // The comments explain why next-themes left; only the code is checked.
      .replace(/\/\*[\s\S]*?\*\//g, '')
    expect(source).not.toMatch(/from 'next-themes'/)
    expect(source).not.toMatch(/useTheme\(/)
    expect(source).toContain('theme="light"')
  })
})
