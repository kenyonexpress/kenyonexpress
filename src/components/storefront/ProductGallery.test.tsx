import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ProductGallery from './ProductGallery'

describe('ProductGallery', () => {
  const mockImages = [
    'https://example.com/image1.webp',
    'https://example.com/image2.webp',
    'https://example.com/image3.webp',
  ]

  const mockAssets = {
    'https://example.com/image1.webp': {
      alt: 'תמונה ראשית',
      blurDataURL: 'data:image/png;base64,iVBORw0KGgo=',
    },
    'https://example.com/image2.webp': {
      alt: 'תמונה שנייה',
      blurDataURL: 'data:image/png;base64,iVBORw0KGgo=',
    },
    'https://example.com/image3.webp': {
      alt: 'תמונה שלישית',
      blurDataURL: 'data:image/png;base64,iVBORw0KGgo=',
    },
  }

  it('renders gallery frame with main image', () => {
    render(<ProductGallery images={mockImages} name="Test Product" assets={mockAssets} />)
    const frame = screen.getByRole('img', { hidden: true })
    expect(frame).toBeInTheDocument()
  })

  it('renders thumbnails when multiple images exist', () => {
    render(<ProductGallery images={mockImages} name="Test Product" assets={mockAssets} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(mockImages.length)
  })

  it('displays discount badge when price and oldPrice are provided', () => {
    const { container } = render(
      <ProductGallery
        images={mockImages}
        name="Test Product"
        assets={mockAssets}
        price={100}
        oldPrice={150}
      />,
    )
    const badge = container.querySelector('.pdp-gallery__badge')
    expect(badge).toBeInTheDocument()
    expect(badge?.textContent).toContain('33%')
  })

  it('does not display badge when prices are not provided', () => {
    render(<ProductGallery images={mockImages} name="Test Product" assets={mockAssets} />)
    const badge = screen.queryByText(/-\d+%/)
    expect(badge).not.toBeInTheDocument()
  })

  it('applies zoom class on mouse enter', () => {
    const { container } = render(
      <ProductGallery images={mockImages} name="Test Product" assets={mockAssets} />,
    )
    const frame = container.querySelector('[data-pdp="gallery"] .pdp-gallery__frame')
    expect(frame).toBeInTheDocument()

    fireEvent.mouseEnter(frame!)
    expect(frame).toHaveClass('pdp-gallery__frame--zoomed')
  })

  it('removes zoom class on mouse leave', () => {
    const { container } = render(
      <ProductGallery images={mockImages} name="Test Product" assets={mockAssets} />,
    )
    const frame = container.querySelector('[data-pdp="gallery"] .pdp-gallery__frame')

    fireEvent.mouseEnter(frame!)
    expect(frame).toHaveClass('pdp-gallery__frame--zoomed')

    fireEvent.mouseLeave(frame!)
    expect(frame).not.toHaveClass('pdp-gallery__frame--zoomed')
  })

  it('changes main image when thumbnail is clicked', () => {
    render(<ProductGallery images={mockImages} name="Test Product" assets={mockAssets} />)
    const thumbnailButtons = screen.getAllByRole('button')
    const secondThumbnail = thumbnailButtons[1]

    fireEvent.click(secondThumbnail!)
    expect(secondThumbnail).toHaveAttribute('aria-current', 'true')
  })

  it('renders empty state when no images provided', () => {
    render(<ProductGallery images={[]} name="Test Product" assets={mockAssets} />)
    const emptyFrame = screen.getByText('📦')
    expect(emptyFrame).toBeInTheDocument()
  })

  it('applies scale-125 class to image when zoomed', () => {
    const { container } = render(
      <ProductGallery images={mockImages} name="Test Product" assets={mockAssets} />,
    )
    const frame = container.querySelector('[data-pdp="gallery"] .pdp-gallery__frame')
    const image = frame?.querySelector('img')

    fireEvent.mouseEnter(frame!)
    expect(image).toHaveClass('scale-125')
  })

  it('applies scale-100 class to image when not zoomed', () => {
    const { container } = render(
      <ProductGallery images={mockImages} name="Test Product" assets={mockAssets} />,
    )
    const frame = container.querySelector('[data-pdp="gallery"] .pdp-gallery__frame')
    const image = frame?.querySelector('img')

    expect(image).toHaveClass('scale-100')
  })

  it('has transition-transform class for smooth zoom', () => {
    const { container } = render(
      <ProductGallery images={mockImages} name="Test Product" assets={mockAssets} />,
    )
    const frame = container.querySelector('[data-pdp="gallery"] .pdp-gallery__frame')
    const image = frame?.querySelector('img')

    expect(image).toHaveClass('transition-transform')
    expect(image).toHaveClass('duration-300')
  })
})
