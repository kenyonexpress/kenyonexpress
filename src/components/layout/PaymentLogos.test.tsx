import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PaymentLogos, { PAYMENT_MARK_LABELS } from './PaymentLogos'

/**
 * UX13: the payment marks. Pinned: five schemes an Israeli acquirer settles,
 * each an SVG image with a Hebrew name a screen reader says once, every
 * colour a `fill-payment-*` token class and never a raw value (the tokens gate
 * covers the hex rule; this covers the wiring), and the list labelled so the
 * footer's two copies read as "אמצעי תשלום" and not as five loose pictures.
 */
describe('PaymentLogos', () => {
  it('renders the five schemes as labelled images in a labelled list', () => {
    render(<PaymentLogos />)
    const list = screen.getByRole('list', { name: 'אמצעי תשלום' })
    const marks = within(list).getAllByRole('img')
    expect(marks.map((m) => m.getAttribute('aria-label'))).toEqual([
      'ויזה',
      'מאסטרקארד',
      'אמריקן אקספרס',
      'ישראכרט',
      'דיינרס קלאב',
    ])
    expect(PAYMENT_MARK_LABELS).toHaveLength(5)
  })

  it('names every mark in Hebrew, with a <title> that matches', () => {
    render(<PaymentLogos />)
    for (const mark of screen.getAllByRole('img')) {
      const label = mark.getAttribute('aria-label') ?? ''
      expect(label).toMatch(/^[א-ת ]+$/)
      expect(mark.querySelector('title')?.textContent).toBe(label)
    }
  })

  it('paints every scheme colour from a token class', () => {
    const { container } = render(<PaymentLogos />)
    const painted = container.querySelectorAll('svg *[class]')
    expect(painted.length).toBeGreaterThanOrEqual(5)
    for (const el of painted) {
      expect(el.getAttribute('class')).toMatch(/^fill-payment-[a-z-]+$/)
    }
    // No scheme is drawn with a literal colour.
    expect(container.innerHTML).not.toMatch(/fill="#|fill="rgb/)
  })

  it('takes extra classes for the bar it sits on', () => {
    render(<PaymentLogos className="mt-2" />)
    expect(screen.getByRole('list', { name: 'אמצעי תשלום' }).className).toContain('mt-2')
  })
})
