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

  it('renders SVG icons instead of emoji', () => {
    const { container } = render(<LeftSidebar />)
    // Check for SVG elements (lucide-react icons)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThanOrEqual(3)
  })

  it('applies border-radius token via inline style', () => {
    const { container } = render(<LeftSidebar />)
    const cards = container.querySelectorAll('article')
    for (const card of cards) {
      expect(card).toHaveStyle('border-radius: var(--radius-card)')
    }
  })

  it('applies gradient background classes to image areas', () => {
    const { container } = render(<LeftSidebar />)
    const imageAreas = container.querySelectorAll('[class*="bg-gradient"]')
    expect(imageAreas.length).toBeGreaterThanOrEqual(3)
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

  it('applies white text to SVG icons for visibility on gradient', () => {
    const { container } = render(<LeftSidebar />)
    const icons = container.querySelectorAll('svg')
    for (const icon of icons) {
      expect(icon.className.baseVal).toContain('text-white')
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

  it('has correct accessibility attributes', () => {
    render(<LeftSidebar />)
    const cards = screen.getAllByRole('article')
    expect(cards[0]).toHaveAttribute('aria-label', 'דילים חמים')
    expect(cards[1]).toHaveAttribute('aria-label', 'צימרים ובתי מלון')
    expect(cards[2]).toHaveAttribute('aria-label', 'מסעדות ובתי קפה')
  })

  it('maintains spacing between cards', () => {
    const { container } = render(<LeftSidebar />)
    const aside = container.querySelector('aside')
    expect(aside).toHaveClass('space-y-3')
  })

  it('cards have cursor pointer on hover', () => {
    const { container } = render(<LeftSidebar />)
    const cards = container.querySelectorAll('article')
    for (const card of cards) {
      expect(card.className).toContain('cursor-pointer')
    }
  })
})
