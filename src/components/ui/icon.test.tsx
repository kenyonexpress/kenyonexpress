import { render } from '@testing-library/react'
import { AlertCircle, Check, Heart, Search, Settings } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { Icon } from './icon'

describe('Icon component', () => {
  describe('size tokens', () => {
    it('renders icon with xs size (16px)', () => {
      const { container } = render(<Icon as={Search} size="xs" data-testid="icon" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '16')
      expect(svg).toHaveAttribute('height', '16')
    })

    it('renders icon with sm size (20px)', () => {
      const { container } = render(<Icon as={Search} size="sm" data-testid="icon" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '20')
      expect(svg).toHaveAttribute('height', '20')
    })

    it('renders icon with md size (24px) by default', () => {
      const { container } = render(<Icon as={Search} data-testid="icon" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '24')
      expect(svg).toHaveAttribute('height', '24')
    })

    it('renders icon with lg size (32px)', () => {
      const { container } = render(<Icon as={Search} size="lg" data-testid="icon" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '32')
      expect(svg).toHaveAttribute('height', '32')
    })

    it('renders icon with xl size (48px)', () => {
      const { container } = render(<Icon as={Search} size="xl" data-testid="icon" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '48')
      expect(svg).toHaveAttribute('height', '48')
    })
  })

  describe('color variants', () => {
    it('renders with default variant (currentColor)', () => {
      const { container } = render(<Icon as={Search} variant="default" />)
      const svg = container.querySelector('svg')
      expect(svg?.style.color).toBe('')
    })

    it('renders with primary variant (yellow)', () => {
      const { container } = render(<Icon as={Search} variant="primary" />)
      const svg = container.querySelector('svg')
      expect(svg?.style.color).toBe('var(--electro-yellow-primary)')
    })

    it('renders with secondary variant (gray)', () => {
      const { container } = render(<Icon as={Search} variant="secondary" />)
      const svg = container.querySelector('svg')
      expect(svg?.style.color).toBe('var(--electro-gray-medium)')
    })

    it('renders with danger variant (red)', () => {
      const { container } = render(<Icon as={Search} variant="danger" />)
      const svg = container.querySelector('svg')
      expect(svg?.style.color).toBe('var(--electro-error)')
    })

    it('renders with success variant (green)', () => {
      const { container } = render(<Icon as={Check} variant="success" />)
      const svg = container.querySelector('svg')
      expect(svg?.style.color).toBe('var(--electro-success)')
    })

    it('renders with warning variant (orange)', () => {
      const { container } = render(<Icon as={AlertCircle} variant="warning" />)
      const svg = container.querySelector('svg')
      expect(svg?.style.color).toBe('var(--electro-warning)')
    })

    it('renders with info variant (blue)', () => {
      const { container } = render(<Icon as={Search} variant="info" />)
      const svg = container.querySelector('svg')
      expect(svg?.style.color).toBe('var(--electro-info)')
    })

    it('renders with muted variant (tertiary text)', () => {
      const { container } = render(<Icon as={Search} variant="muted" />)
      const svg = container.querySelector('svg')
      expect(svg?.style.color).toBe('var(--electro-text-tertiary)')
    })
  })

  describe('icon variants with different sizes', () => {
    it('combines sm size with primary variant', () => {
      const { container } = render(<Icon as={Check} size="sm" variant="primary" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '20')
      expect(svg).toHaveAttribute('height', '20')
      expect(svg?.style.color).toBe('var(--electro-yellow-primary)')
    })

    it('combines lg size with danger variant', () => {
      const { container } = render(<Icon as={AlertCircle} size="lg" variant="danger" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '32')
      expect(svg).toHaveAttribute('height', '32')
      expect(svg?.style.color).toBe('var(--electro-error)')
    })

    it('combines xl size with success variant', () => {
      const { container } = render(<Icon as={Check} size="xl" variant="success" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '48')
      expect(svg).toHaveAttribute('height', '48')
      expect(svg?.style.color).toBe('var(--electro-success)')
    })
  })

  describe('accessibility features', () => {
    it('renders with title attribute', () => {
      const { container } = render(<Icon as={Search} title="Search items" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('title', 'Search items')
    })

    it('renders with aria-label attribute', () => {
      const { container } = render(<Icon as={Search} aria-label="Search icon" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('aria-label', 'Search icon')
    })

    it('accepts both title and aria-label', () => {
      const { container } = render(
        <Icon as={Heart} title="Favorite" aria-label="Add to favorites" />,
      )
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('title', 'Favorite')
      expect(svg).toHaveAttribute('aria-label', 'Add to favorites')
    })
  })

  describe('ref forwarding', () => {
    it('forwards ref to SVG element', () => {
      const ref = { current: null }
      render(<Icon as={Settings} ref={ref} />)
      expect(ref.current).toBeInstanceOf(SVGSVGElement)
    })
  })

  describe('custom className support', () => {
    it('applies custom className to SVG', () => {
      const { container } = render(<Icon as={Search} className="custom-class" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveClass('custom-class')
    })

    it('combines className with built-in behavior', () => {
      const { container } = render(
        <Icon as={Check} size="md" variant="success" className="animate-spin" />,
      )
      const svg = container.querySelector('svg')
      expect(svg).toHaveClass('animate-spin')
      expect(svg).toHaveAttribute('width', '24')
      expect(svg?.style.color).toBe('var(--electro-success)')
    })
  })

  describe('different lucide icons', () => {
    it('renders Search icon', () => {
      const { container } = render(<Icon as={Search} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('renders Check icon', () => {
      const { container } = render(<Icon as={Check} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('renders Heart icon', () => {
      const { container } = render(<Icon as={Heart} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('renders AlertCircle icon', () => {
      const { container } = render(<Icon as={AlertCircle} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('renders Settings icon', () => {
      const { container } = render(<Icon as={Settings} />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  describe('undefined component handling', () => {
    it('returns null when component is not provided', () => {
      const { container } = render(<Icon />)
      expect(container.firstChild).toBeNull()
    })
  })

  describe('html attributes', () => {
    it('passes through additional HTML attributes', () => {
      const { container } = render(<Icon as={Search} data-testid="search-icon" role="img" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('data-testid', 'search-icon')
      expect(svg).toHaveAttribute('role', 'img')
    })
  })
})
