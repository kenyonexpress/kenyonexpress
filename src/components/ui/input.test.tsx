import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Input } from './input'

describe('Input component', () => {
  describe('Variants', () => {
    it('renders default variant', () => {
      render(<Input data-testid="input" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('border-[--electro-border]')
      expect(input).toHaveClass('bg-[--electro-white]')
      expect(input).toHaveClass('text-[--electro-text-primary]')
    })

    it('renders error variant with error border and background', () => {
      render(<Input data-testid="input" variant="error" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('border-[--electro-error]')
      expect(input).toHaveClass('bg-[--electro-error-light]')
    })

    it('renders success variant with success border and background', () => {
      render(<Input data-testid="input" variant="success" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('border-[--electro-success]')
      expect(input).toHaveClass('bg-[--electro-success-light]')
    })

    it('renders disabled variant when disabled prop is true', () => {
      render(<Input data-testid="input" disabled />)
      const input = screen.getByTestId('input')
      expect(input).toBeDisabled()
      expect(input).toHaveClass('border-[--electro-border-alt]')
      expect(input).toHaveClass('bg-[--electro-gray-light]')
    })
  })

  describe('Sizes', () => {
    it('renders sm size', () => {
      render(<Input data-testid="input" size="sm" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('h-8', 'px-3', 'py-1', 'text-xs')
    })

    it('renders md size (default)', () => {
      render(<Input data-testid="input" size="md" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('h-10', 'px-3', 'py-2', 'text-sm')
    })

    it('renders lg size', () => {
      render(<Input data-testid="input" size="lg" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('h-12', 'px-4', 'py-3', 'text-base')
    })
  })

  describe('Placeholder', () => {
    it('supports placeholder text with correct color', () => {
      render(<Input data-testid="input" placeholder="Enter text..." />)
      const input = screen.getByPlaceholderText('Enter text...')
      expect(input).toHaveClass('placeholder:text-[--electro-text-tertiary]')
    })
  })

  describe('Focus state', () => {
    it('applies focus ring styling', () => {
      render(<Input data-testid="input" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('focus-visible:ring-2')
      expect(input).toHaveClass('focus-visible:ring-offset-2')
    })

    it('applies default focus ring color', () => {
      render(<Input data-testid="input" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('focus-visible:ring-[--electro-info]')
    })

    it('applies error focus ring for error variant', () => {
      render(<Input data-testid="input" variant="error" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('focus-visible:ring-[--electro-error]')
    })

    it('applies success focus ring for success variant', () => {
      render(<Input data-testid="input" variant="success" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('focus-visible:ring-[--electro-success]')
    })

    it('uses focus-visible for keyboard accessibility', () => {
      render(<Input data-testid="input" type="email" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('focus-visible:outline-none')
    })
  })

  describe('Combinations', () => {
    it('renders sm error input', () => {
      render(<Input data-testid="input" variant="error" size="sm" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('border-[--electro-error]', 'h-8', 'px-3')
    })

    it('renders lg success input', () => {
      render(<Input data-testid="input" variant="success" size="lg" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('border-[--electro-success]', 'h-12', 'px-4')
    })
  })

  describe('Attributes', () => {
    it('supports standard HTML input attributes', () => {
      render(
        <Input
          data-testid="input"
          type="email"
          value="test@example.com"
          onChange={() => {}}
          required
        />,
      )
      const input = screen.getByTestId('input') as HTMLInputElement
      expect(input.type).toBe('email')
      expect(input.value).toBe('test@example.com')
      expect(input).toBeRequired()
    })

    it('supports ref forwarding', () => {
      const ref = { current: null }
      render(<Input ref={ref} data-testid="input" />)
      expect(ref.current).toBeInstanceOf(HTMLInputElement)
    })

    it('supports custom className', () => {
      render(<Input data-testid="input" className="custom-class" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('custom-class')
    })
  })

  describe('Disabled state', () => {
    it('prevents interaction when disabled', () => {
      render(<Input data-testid="input" disabled />)
      const input = screen.getByTestId('input')
      expect(input).toBeDisabled()
    })

    it('shows disabled styling with opacity', () => {
      render(<Input data-testid="input" disabled />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('disabled:opacity-50')
      expect(input).toHaveClass('disabled:cursor-not-allowed')
    })
  })

  describe('Transitions', () => {
    it('applies transition-colors for smooth color changes', () => {
      render(<Input data-testid="input" />)
      const input = screen.getByTestId('input')
      expect(input).toHaveClass('transition-colors')
    })
  })

  describe('Input types', () => {
    it('supports text input type', () => {
      render(<Input data-testid="input" type="text" />)
      const input = screen.getByTestId('input') as HTMLInputElement
      expect(input.type).toBe('text')
    })

    it('supports email input type', () => {
      render(<Input data-testid="input" type="email" />)
      const input = screen.getByTestId('input') as HTMLInputElement
      expect(input.type).toBe('email')
    })

    it('supports phone input type', () => {
      render(<Input data-testid="input" type="tel" />)
      const input = screen.getByTestId('input') as HTMLInputElement
      expect(input.type).toBe('tel')
    })

    it('supports password input type', () => {
      render(<Input data-testid="input" type="password" />)
      const input = screen.getByTestId('input') as HTMLInputElement
      expect(input.type).toBe('password')
    })
  })

  describe('Hebrew RTL support', () => {
    it('works with Hebrew placeholder text', () => {
      render(<Input data-testid="input" placeholder="הקלד טקסט..." />)
      const input = screen.getByPlaceholderText('הקלד טקסט...')
      expect(input).toBeInTheDocument()
    })

    it('preserves placeholder styling for Hebrew', () => {
      render(<Input data-testid="input" placeholder="הקלד טקסט..." />)
      const input = screen.getByPlaceholderText('הקלד טקסט...')
      expect(input).toHaveClass('placeholder:text-[--electro-text-tertiary]')
    })

    it('applies variant styling to Hebrew inputs', () => {
      render(<Input data-testid="input" variant="error" placeholder="שגיאה" />)
      const input = screen.getByPlaceholderText('שגיאה')
      expect(input).toHaveClass('border-[--electro-error]')
      expect(input).toHaveClass('bg-[--electro-error-light]')
    })
  })
})
