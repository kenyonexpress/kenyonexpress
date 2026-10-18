import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BrandsRow from './BrandsRow'

const mockBrands = [
  {
    id: '1',
    name: 'Brand One',
    name_he: 'מותג אחד',
    logo_url: 'https://example.com/logo1.png',
  },
  {
    id: '2',
    name: 'Brand Two',
    name_he: 'מותג שניים',
    logo_url: 'https://example.com/logo2.png',
  },
]

describe('BrandsRow', () => {
  it('renders brands when provided', () => {
    render(<BrandsRow brands={mockBrands} />)

    expect(screen.getByText('מותג אחד')).toBeInTheDocument()
    expect(screen.getByText('מותג שניים')).toBeInTheDocument()
  })

  it('renders nothing when brands list is empty', () => {
    const { container } = render(<BrandsRow brands={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when brands are undefined', () => {
    const { container } = render(<BrandsRow brands={undefined as any} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders images with correct alt text', () => {
    render(<BrandsRow brands={mockBrands} />)

    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('alt', 'מותג אחד')
    expect(images[1]).toHaveAttribute('alt', 'מותג שניים')
  })

  it('renders links with supplier query params', () => {
    render(<BrandsRow brands={mockBrands} />)

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/search?supplier=1')
    expect(links[1]).toHaveAttribute('href', '/search?supplier=2')
  })

  it('renders with RTL support', () => {
    const { container } = render(<BrandsRow brands={mockBrands} />)
    const section = container.querySelector('section')

    expect(section).toBeInTheDocument()
  })
})
