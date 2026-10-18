import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LeftSidebar from './LeftSidebar'

describe('LeftSidebar - Category Cards', () => {
  it('renders three category cards', () => {
    render(<LeftSidebar />)
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(3)
  })

  it('renders category headings', () => {
    render(<LeftSidebar />)
    expect(screen.getByText('הדילים החמים של השבוע')).toBeInTheDocument()
    expect(screen.getByText('מבצעים גדולים על צימרים ומלונות')).toBeInTheDocument()
    expect(screen.getByText('מסעדות, בתי קפה ועוד')).toBeInTheDocument()
  })

  it('renders purchase buttons with correct text', () => {
    render(<LeftSidebar />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    for (const button of buttons) {
      expect(button).toHaveTextContent('לרכישה ←')
    }
  })

  it('renders real product images instead of emoji', () => {
    const { container } = render(<LeftSidebar />)
    // Check for img elements (Next.js Image component renders img tags)
    const images = container.querySelectorAll('img')
    expect(images.length).toBeGreaterThanOrEqual(3)
  })

  it('renders images with correct alt text', () => {
    render(<LeftSidebar />)
    expect(screen.getByAltText('דילים חמים - תמונת מוצר')).toBeInTheDocument()
    expect(screen.getByAltText('צימרים ומלונות - תמונת מוצר')).toBeInTheDocument()
    expect(screen.getByAltText('מסעדות - תמונת מוצר')).toBeInTheDocument()
  })

  it('applies border-radius token via inline style', () => {
    const { container } = render(<LeftSidebar />)
    const cards = container.querySelectorAll('article')
    for (const card of cards) {
      expect(card).toHaveStyle('border-radius: var(--radius-card)')
    }
  })

  it('applies hover shadow classes to cards', () => {
    const { container } = render(<LeftSidebar />)
    const cards = container.querySelectorAll('article')
    for (const card of cards) {
      expect(card.className).toContain('hover:shadow-lg')
      expect(card.className).toContain('hover:shadow-gray-300')
    }
  })

  it('applies hover scale transform to image areas', () => {
    const { container } = render(<LeftSidebar />)
    const imageAreas = container.querySelectorAll('[class*="hover:scale-105"]')
    expect(imageAreas.length).toBeGreaterThanOrEqual(3)
  })

  it('applies transition classes for smooth animations', () => {
    const { container } = render(<LeftSidebar />)
    const cards = container.querySelectorAll('article')
    for (const card of cards) {
      expect(card.className).toContain('transition-all')
      expect(card.className).toContain('duration-200')
    }
  })

  it('applies object-cover to images for proper display', () => {
    const { container } = render(<LeftSidebar />)
    const images = container.querySelectorAll('img')
    for (const image of images) {
      expect(image.className).toContain('object-cover')
    }
  })

  it('renders purchase buttons with correct styling', () => {
    const { container } = render(<LeftSidebar />)
    const buttons = container.querySelectorAll('button')
    for (const button of buttons) {
      expect(button.className).toContain('text-white')
      expect(button.className).toContain('text-xs')
      expect(button.className).toContain('font-bold')
      expect(button.className).toContain('py-1.5')
      expect(button.className).toContain('rounded-full')
    }
  })

  it('applies correct font weight and size to headings', () => {
    const { container } = render(<LeftSidebar />)
    const headings = container.querySelectorAll('p')
    for (const heading of headings) {
      expect(heading.className).toContain('font-extrabold')
      expect(heading.className).toContain('text-xs')
    }
  })

  it('maintains spacing between cards', () => {
    const { container } = render(<LeftSidebar />)
    const aside = container.querySelector('aside')
    expect(aside).toHaveClass('space-y-3')
  })

  it('cards have cursor pointer for interactivity', () => {
    const { container } = render(<LeftSidebar />)
    const cards = container.querySelectorAll('article')
    for (const card of cards) {
      expect(card.className).toContain('cursor-pointer')
    }
  })

  it('image containers have correct height', () => {
    const { container } = render(<LeftSidebar />)
    const imageContainers = container.querySelectorAll('[class*="h-24"]')
    expect(imageContainers.length).toBeGreaterThanOrEqual(3)
  })

  it('image containers have overflow-hidden for zoom effect', () => {
    const { container } = render(<LeftSidebar />)
    const imageContainers = container.querySelectorAll('[class*="overflow-hidden"]')
    expect(imageContainers.length).toBeGreaterThanOrEqual(3)
  })
})
