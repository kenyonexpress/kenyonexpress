import { render, screen } from '@testing-library/react'
import CategoryHeroBanner from './CategoryHeroBanner'

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill,
    className,
    priority,
    sizes,
  }: {
    src: string
    alt: string
    fill?: boolean
    className?: string
    priority?: boolean
    sizes?: string
  }) => (
    <img
      src={src}
      alt={alt}
      data-testid="category-hero-image"
      data-fill={fill}
      className={className}
      data-priority={priority}
      data-sizes={sizes}
    />
  ),
}))

describe('CategoryHeroBanner', () => {
  it('renders image when imageUrl is provided', () => {
    render(
      <CategoryHeroBanner imageUrl="https://example.com/image.jpg" categoryName="Test Category" />,
    )
    const image = screen.getByTestId('category-hero-image')
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg')
    expect(image).toHaveAttribute('alt', 'Test Category')
  })

  it('renders with priority loading', () => {
    render(
      <CategoryHeroBanner imageUrl="https://example.com/image.jpg" categoryName="Test Category" />,
    )
    const image = screen.getByTestId('category-hero-image')
    expect(image).toHaveAttribute('data-priority', 'true')
  })

  it('renders with responsive sizes', () => {
    render(
      <CategoryHeroBanner imageUrl="https://example.com/image.jpg" categoryName="Test Category" />,
    )
    const image = screen.getByTestId('category-hero-image')
    expect(image).toHaveAttribute(
      'data-sizes',
      '(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1170px',
    )
  })

  it('renders with fill layout', () => {
    render(
      <CategoryHeroBanner imageUrl="https://example.com/image.jpg" categoryName="Test Category" />,
    )
    const image = screen.getByTestId('category-hero-image')
    expect(image).toHaveAttribute('data-fill', 'true')
  })

  it('returns null when imageUrl is null', () => {
    const { container } = render(
      <CategoryHeroBanner imageUrl={null} categoryName="Test Category" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('returns null when imageUrl is empty string', () => {
    const { container } = render(<CategoryHeroBanner imageUrl="" categoryName="Test Category" />)
    expect(container.firstChild).toBeNull()
  })

  it('applies correct CSS class for styling', () => {
    render(
      <CategoryHeroBanner imageUrl="https://example.com/image.jpg" categoryName="Test Category" />,
    )
    const image = screen.getByTestId('category-hero-image')
    expect(image).toHaveClass('category-hero-banner__image')
  })
})
