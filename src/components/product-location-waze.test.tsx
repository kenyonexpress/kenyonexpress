import ProductLocation from '@/components/product-card/ProductLocation'
import LocationPin from '@/components/product/LocationPin'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('LocationPin with Waze integration', () => {
  it('renders city with Waze link when coordinates are provided', () => {
    const { container } = render(
      <LocationPin
        location={{
          city: 'תל אביב',
          latitude: 32.0853,
          longitude: 34.7818,
        }}
      />,
    )

    const link = container.querySelector('a')
    expect(link).toBeTruthy()
    expect(link?.href).toContain('waze.com/ul')
    expect(link?.href).toContain('ll=32.0853,34.7818')
    expect(link?.href).toContain('navigate=yes')
    expect(link?.textContent).toBe('תל אביב')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noreferrer noopener')
  })

  it('renders city without link when coordinates are missing', () => {
    const { container } = render(
      <LocationPin
        location={{
          city: 'תל אביב',
          latitude: null,
          longitude: null,
        }}
      />,
    )

    const link = container.querySelector('a')
    expect(link).toBeFalsy()
    const span = container.querySelector('span')
    expect(span?.textContent).toBe('תל אביב')
  })

  it('returns null for nationwide (no city)', () => {
    const { container } = render(
      <LocationPin
        location={{
          city: null,
          latitude: null,
          longitude: null,
        }}
      />,
    )

    expect(container.firstChild).toBeFalsy()
  })

  it('returns null for explicit nationwide label', () => {
    const { container } = render(
      <LocationPin
        location={{
          city: 'כל הארץ',
          latitude: null,
          longitude: null,
        }}
      />,
    )

    expect(container.firstChild).toBeFalsy()
  })

  it('uses full address as fallback for Waze when coordinates are missing', () => {
    const { container } = render(
      <LocationPin
        location={{
          city: 'תל אביב',
          fullAddress: 'רחוב דיזנגוף 50, תל אביב',
          latitude: null,
          longitude: null,
        }}
      />,
    )

    const link = container.querySelector('a')
    expect(link).toBeTruthy()
    expect(link?.href).toContain('waze.com/ul')
    expect(link?.href).toContain('q=')
    expect(link?.href).toContain(encodeURIComponent('רחוב דיזנגוף 50, תל אביב'))
  })

  it('prefers coordinates over full address for Waze navigation', () => {
    const { container } = render(
      <LocationPin
        location={{
          city: 'תל אביב',
          fullAddress: 'רחוב דיזנגוף 50, תל אביב',
          latitude: 32.0853,
          longitude: 34.7818,
        }}
      />,
    )

    const link = container.querySelector('a')
    expect(link?.href).toContain('ll=32.0853,34.7818')
    expect(link?.href).not.toContain('q=')
  })

  it('applies custom className', () => {
    const { container } = render(
      <LocationPin
        location={{
          city: 'חיפה',
          latitude: 32.8191,
          longitude: 34.9983,
        }}
        className="custom-class"
      />,
    )

    const link = container.querySelector('a')
    expect(link?.className).toContain('custom-class')
  })
})

describe('ProductLocation fallback', () => {
  it('shows nationwide label when city is null', () => {
    render(<ProductLocation city={null} />)
    expect(screen.getByText('כל הארץ')).toBeTruthy()
  })

  it('shows city name when provided', () => {
    render(<ProductLocation city="ירושלים" />)
    expect(screen.getByText('ירושלים')).toBeTruthy()
  })

  it('shows nationwide label for explicit nationwide string', () => {
    render(<ProductLocation city="כל הארץ" />)
    expect(screen.getByText('כל הארץ')).toBeTruthy()
  })

  it('applies custom className', () => {
    const { container } = render(<ProductLocation city="חיפה" className="custom-location" />)
    const span = container.querySelector('.custom-location')
    expect(span).toBeTruthy()
  })
})
