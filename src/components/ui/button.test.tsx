import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'

describe('Button component', () => {
  describe('Variants', () => {
    it('renders primary variant with yellow background', () => {
      render(<Button variant="primary">Primary Button</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-[--electro-yellow-primary]')
      expect(button).toHaveClass('text-black')
    })

    it('renders secondary variant with gray background', () => {
      render(<Button variant="secondary">Secondary Button</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-[--electro-gray-medium]')
      expect(button).toHaveClass('text-[--electro-text-primary]')
    })

    it('renders ghost variant with transparent background', () => {
      render(<Button variant="ghost">Ghost Button</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-transparent')
      expect(button).toHaveClass('text-[--electro-text-primary]')
    })

    it('renders danger variant with red background', () => {
      render(<Button variant="danger">Danger Button</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-[--electro-error]')
      expect(button).toHaveClass('text-white')
    })

    it('renders link variant with text color and underline', () => {
      render(<Button variant="link">Link Button</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-transparent')
      expect(button).toHaveClass('text-[--electro-link]')
      expect(button).toHaveClass('underline-offset-4')
    })

    it('renders primary variant by default', () => {
      render(<Button>Default Button</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-[--electro-yellow-primary]')
    })
  })

  describe('Sizes', () => {
    it('renders sm size with small height and padding', () => {
      render(<Button size="sm">Small Button</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('h-8', 'px-3', 'py-1', 'text-xs')
    })

    it('renders md size with medium height and padding', () => {
      render(<Button size="md">Medium Button</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('h-10', 'px-4', 'py-2', 'text-sm')
    })

    it('renders lg size with large height and padding', () => {
      render(<Button size="lg">Large Button</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('h-12', 'px-6', 'py-3', 'text-base')
    })

    it('renders icon size as square button', () => {
      render(<Button size="icon">🔍</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('h-10', 'w-10')
    })

    it('renders md size by default', () => {
      render(<Button>Default Size</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('h-10', 'px-4', 'py-2', 'text-sm')
    })
  })

  describe('Loading state', () => {
    it('shows spinner when loading is true', () => {
      render(<Button loading>Click me</Button>)
      const spinner = screen.getByRole('button').querySelector('span')
      expect(spinner).toHaveClass('animate-spin', 'rounded-full')
    })

    it('renders loading text when provided', () => {
      render(
        <Button loading loadingText="Loading...">
          Click me
        </Button>,
      )
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('renders children text as loading text fallback', () => {
      render(<Button loading>Processing...</Button>)
      expect(screen.getByText('Processing...')).toBeInTheDocument()
    })

    it('disables button when loading is true', () => {
      render(<Button loading>Click me</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('sets aria-busy when loading', () => {
      render(<Button loading>Loading</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-busy', 'true')
    })

    it('does not show loading state when loading is false', () => {
      render(<Button loading={false}>Click me</Button>)
      const button = screen.getByRole('button')
      const spinner = button.querySelector('.animate-spin')
      expect(spinner).not.toBeInTheDocument()
    })
  })

  describe('Disabled state', () => {
    it('disables button when disabled prop is true', () => {
      render(<Button disabled>Disabled</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('applies disabled opacity styling', () => {
      render(<Button disabled>Disabled</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('disabled:opacity-50')
    })

    it('disables button when loading is true', () => {
      render(<Button loading>Loading</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })
  })

  describe('Combinations', () => {
    it('renders primary sm button', () => {
      render(
        <Button variant="primary" size="sm">
          Small Primary
        </Button>,
      )
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-[--electro-yellow-primary]', 'h-8', 'px-3')
      expect(button).toHaveClass('[border-radius:var(--radius-button)]')
    })

    it('renders danger lg button', () => {
      render(
        <Button variant="danger" size="lg">
          Large Danger
        </Button>,
      )
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-[--electro-error]', 'h-12', 'px-6')
      expect(button).toHaveClass('[border-radius:var(--radius-button)]')
    })

    it('renders loading secondary md button', () => {
      render(
        <Button variant="secondary" size="md" loading>
          Save
        </Button>,
      )
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-[--electro-gray-medium]', 'h-10', 'px-4')
      expect(button).toHaveClass('[border-radius:var(--radius-button)]')
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-busy', 'true')
    })

    it('renders link sm button', () => {
      render(
        <Button variant="link" size="sm">
          Cancel
        </Button>,
      )
      const button = screen.getByRole('button')
      expect(button).toHaveClass('text-[--electro-link]', 'h-8', 'px-3')
      expect(button).toHaveClass('[border-radius:var(--radius-button)]')
    })

    it('renders ghost lg button with loading state', () => {
      render(
        <Button variant="ghost" size="lg" loading loadingText="Processing...">
          Submit
        </Button>,
      )
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-transparent', 'h-12', 'px-6')
      expect(button).toHaveClass('[border-radius:var(--radius-button)]')
      expect(screen.getByText('Processing...')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('renders as button by default', () => {
      render(<Button>Click me</Button>)
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('supports focus-visible ring for keyboard navigation', () => {
      render(<Button>Focusable</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-offset-2')
    })

    it('applies transition colors for smooth interactions', () => {
      render(<Button>Interactive</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('transition-colors')
    })

    it('supports gap between icon and text', () => {
      render(<Button>Icon and Text</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('gap-2')
    })
  })

  describe('HTML attributes', () => {
    it('passes through HTML button attributes', () => {
      render(
        <Button data-testid="custom-btn" title="Click to submit">
          Submit
        </Button>,
      )
      const button = screen.getByTestId('custom-btn')
      expect(button).toHaveAttribute('title', 'Click to submit')
    })

    it('supports custom className', () => {
      render(<Button className="custom-class">Button</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('custom-class')
    })

    it('supports ref forwarding', () => {
      const ref = { current: null }
      render(<Button ref={ref}>Button</Button>)
      expect(ref.current).toBeInstanceOf(HTMLButtonElement)
    })

    it('prevents pointer events when disabled', () => {
      render(<Button disabled>Disabled</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('disabled:pointer-events-none')
    })
  })

  describe('SVG icon support', () => {
    it('shrinks SVG icons properly', () => {
      render(
        <Button>
          <svg data-testid="test-icon" />
          Click me
        </Button>,
      )
      const button = screen.getByRole('button')
      expect(button).toHaveClass('[&_svg]:shrink-0')
      expect(button).toHaveClass('[&_svg]:pointer-events-none')
    })
  })

  describe('Whitespace handling', () => {
    it('prevents text wrapping with whitespace-nowrap', () => {
      render(<Button>Button Text</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('whitespace-nowrap')
    })

    it('centers content with inline-flex', () => {
      render(<Button>Centered</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('inline-flex', 'items-center', 'justify-center')
    })
  })
})
