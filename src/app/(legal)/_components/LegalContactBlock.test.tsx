import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LegalContactBlock from './LegalContactBlock'

/**
 * The contact block is the one place the three binding pages (terms, privacy,
 * returns) say who operates the site. The number is asserted as the literal,
 * not through the constant, so a change to the constant fails here on purpose
 * and gets read before it is printed on a legal page.
 */
describe('LegalContactBlock', () => {
  it('names the operator and its registration number', () => {
    render(<LegalContactBlock intro="לשאלות בנוגע למסמך זה." />)
    const line = screen.getByText(/מפעילת האתר/)
    expect(line.textContent).toContain('קניון אקספרס')
    expect(line.textContent).toContain('מספר עוסק')
    expect(line.textContent).toContain('033798513')
  })

  it('isolates the digits as LTR inside the RTL sentence', () => {
    render(<LegalContactBlock intro="לשאלות בנוגע למסמך זה." />)
    const digits = screen.getByText('033798513')
    expect(digits.getAttribute('dir')).toBe('ltr')
  })
})
