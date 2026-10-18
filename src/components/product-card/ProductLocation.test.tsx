import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ProductLocation, { NATIONWIDE_LABEL, productLocationLabel } from './ProductLocation'

describe('productLocationLabel', () => {
  it('prints the city when the product has one', () => {
    expect(productLocationLabel('תל אביב')).toBe('תל אביב')
  })

  it('reads a missing, empty or blank city as nationwide', () => {
    expect(productLocationLabel(null)).toBe(NATIONWIDE_LABEL)
    expect(productLocationLabel(undefined)).toBe(NATIONWIDE_LABEL)
    expect(productLocationLabel('   ')).toBe(NATIONWIDE_LABEL)
    expect(NATIONWIDE_LABEL).toBe('כל הארץ')
  })
})

describe('<ProductLocation>', () => {
  it('puts the pin before the text, so it sits on the right in RTL', () => {
    const { container } = render(<ProductLocation city="חיפה" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.firstElementChild?.tagName.toLowerCase()).toBe('svg')
    expect(root.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByText('חיפה')).toBeTruthy()
  })

  it('shows nationwide for a product with no city', () => {
    render(<ProductLocation city={null} />)
    expect(screen.getByText('כל הארץ')).toBeTruthy()
  })
})
