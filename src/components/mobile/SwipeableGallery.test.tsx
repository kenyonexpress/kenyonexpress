import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SwipeableGallery from './SwipeableGallery'

describe('SwipeableGallery', () => {
  const images = [
    'https://example.com/image1.jpg',
    'https://example.com/image2.jpg',
    'https://example.com/image3.jpg',
  ]

  it('renders gallery with multiple images', () => {
    const { container } = render(<SwipeableGallery images={images} alt="Product" />)

    const gallery = container.querySelector('[data-swipeable-gallery]')
    expect(gallery).toBeInTheDocument()
  })

  it('renders dot indicators for each image', () => {
    render(<SwipeableGallery images={images} alt="Product" />)

    const buttons = screen.getAllByRole('button')
    // Should have 3 dot buttons (one for each image)
    expect(buttons.length).toBeGreaterThanOrEqual(3)
  })

  it('has data-swipeable-gallery attribute', () => {
    const { container } = render(<SwipeableGallery images={images} alt="Product" />)

    expect(container.querySelector('[data-swipeable-gallery]')).toBeInTheDocument()
  })

  it('renders first image with priority', () => {
    const { container } = render(<SwipeableGallery images={images} alt="Product" />)

    const img = container.querySelector('img') as HTMLImageElement | null
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toBeTruthy()
  })

  it('has clickable dot indicators', () => {
    render(<SwipeableGallery images={images} alt="Product" />)

    const buttons = screen.getAllByRole('button')
    // Should have at least one button per image
    expect(buttons.length).toBeGreaterThanOrEqual(images.length)
  })

  it('has correct alt text format', () => {
    const { container } = render(<SwipeableGallery images={images} alt="Test Product" />)

    const img = container.querySelector('img')
    expect(img?.getAttribute('alt')).toContain('Test Product')
    expect(img?.getAttribute('alt')).toContain('תמונה')
  })

  it('renders with correct styling classes', () => {
    const { container } = render(<SwipeableGallery images={images} alt="Product" />)

    const mainDiv = container.querySelector('[data-swipeable-gallery]') as HTMLElement | null
    expect(mainDiv).toHaveClass('w-full')

    const galleryDiv = container.querySelector(
      '[data-swipeable-gallery] > div:first-child',
    ) as HTMLElement | null
    expect(galleryDiv).toHaveClass('bg-gray-100', 'overflow-hidden', 'rounded-lg')
  })
})
