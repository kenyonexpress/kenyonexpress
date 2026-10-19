import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Textarea } from './textarea'

describe('Textarea component', () => {
  describe('Variants', () => {
    it('renders default variant', () => {
      render(<Textarea data-testid="textarea" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('border-[--electro-border]')
      expect(textarea).toHaveClass('bg-[--electro-white]')
      expect(textarea).toHaveClass('text-[--electro-text-primary]')
    })

    it('renders error variant with error border and background', () => {
      render(<Textarea data-testid="textarea" variant="error" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('border-[--electro-error]')
      expect(textarea).toHaveClass('bg-[--electro-error-light]')
    })

    it('renders success variant with success border and background', () => {
      render(<Textarea data-testid="textarea" variant="success" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('border-[--electro-success]')
      expect(textarea).toHaveClass('bg-[--electro-success-light]')
    })

    it('renders disabled variant when disabled prop is true', () => {
      render(<Textarea data-testid="textarea" disabled />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toBeDisabled()
      expect(textarea).toHaveClass('border-[--electro-border-alt]')
      expect(textarea).toHaveClass('bg-[--electro-gray-light]')
    })
  })

  describe('Sizes', () => {
    it('renders sm size with min-h-16', () => {
      render(<Textarea data-testid="textarea" size="sm" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('min-h-16', 'px-3', 'py-2', 'text-xs')
    })

    it('renders md size with min-h-20 (default)', () => {
      render(<Textarea data-testid="textarea" size="md" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('min-h-20', 'px-3', 'py-2', 'text-sm')
    })

    it('renders lg size with min-h-24', () => {
      render(<Textarea data-testid="textarea" size="lg" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('min-h-24', 'px-4', 'py-3', 'text-base')
    })
  })

  describe('Placeholder', () => {
    it('supports placeholder text with correct color', () => {
      render(<Textarea data-testid="textarea" placeholder="Enter your message..." />)
      const textarea = screen.getByPlaceholderText('Enter your message...')
      expect(textarea).toHaveClass('placeholder:text-[--electro-text-tertiary]')
    })
  })

  describe('Focus state', () => {
    it('applies focus ring styling', () => {
      render(<Textarea data-testid="textarea" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('focus-visible:ring-2')
      expect(textarea).toHaveClass('focus-visible:ring-offset-2')
    })

    it('applies default focus ring color', () => {
      render(<Textarea data-testid="textarea" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('focus-visible:ring-[--electro-info]')
    })

    it('applies error focus ring for error variant', () => {
      render(<Textarea data-testid="textarea" variant="error" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('focus-visible:ring-[--electro-error]')
    })

    it('applies success focus ring for success variant', () => {
      render(<Textarea data-testid="textarea" variant="success" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('focus-visible:ring-[--electro-success]')
    })
  })

  describe('Resizing', () => {
    it('allows vertical resize by default', () => {
      render(<Textarea data-testid="textarea" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('resize-vertical')
    })
  })

  describe('Combinations', () => {
    it('renders sm error textarea', () => {
      render(<Textarea data-testid="textarea" variant="error" size="sm" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('border-[--electro-error]', 'min-h-16', 'px-3')
    })

    it('renders lg success textarea', () => {
      render(<Textarea data-testid="textarea" variant="success" size="lg" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('border-[--electro-success]', 'min-h-24', 'px-4')
    })
  })

  describe('Attributes', () => {
    it('supports standard HTML textarea attributes', () => {
      render(
        <Textarea
          data-testid="textarea"
          value="Test message"
          onChange={() => {}}
          rows={5}
          cols={30}
          required
        />,
      )
      const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement
      expect(textarea.value).toBe('Test message')
      expect(textarea.rows).toBe(5)
      expect(textarea.cols).toBe(30)
      expect(textarea).toBeRequired()
    })

    it('supports ref forwarding', () => {
      const ref = { current: null }
      render(<Textarea ref={ref} data-testid="textarea" />)
      expect(ref.current).toBeInstanceOf(HTMLTextAreaElement)
    })

    it('supports custom className', () => {
      render(<Textarea data-testid="textarea" className="custom-class" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('custom-class')
    })
  })

  describe('Disabled state', () => {
    it('prevents interaction when disabled', () => {
      render(<Textarea data-testid="textarea" disabled />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toBeDisabled()
    })

    it('shows disabled styling with opacity', () => {
      render(<Textarea data-testid="textarea" disabled />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('disabled:opacity-50')
      expect(textarea).toHaveClass('disabled:cursor-not-allowed')
    })
  })

  describe('Transitions', () => {
    it('applies transition-colors for smooth color changes', () => {
      render(<Textarea data-testid="textarea" />)
      const textarea = screen.getByTestId('textarea')
      expect(textarea).toHaveClass('transition-colors')
    })
  })

  describe('Hebrew RTL support', () => {
    it('works with Hebrew placeholder text', () => {
      render(<Textarea data-testid="textarea" placeholder="הקלד הודעה..." />)
      const textarea = screen.getByPlaceholderText('הקלד הודעה...')
      expect(textarea).toBeInTheDocument()
    })

    it('preserves placeholder styling for Hebrew', () => {
      render(<Textarea data-testid="textarea" placeholder="הקלד הודעה..." />)
      const textarea = screen.getByPlaceholderText('הקלד הודעה...')
      expect(textarea).toHaveClass('placeholder:text-[--electro-text-tertiary]')
    })

    it('applies variant styling to Hebrew textareas', () => {
      render(<Textarea data-testid="textarea" variant="error" placeholder="שגיאה בהודעה" />)
      const textarea = screen.getByPlaceholderText('שגיאה בהודעה')
      expect(textarea).toHaveClass('border-[--electro-error]')
      expect(textarea).toHaveClass('bg-[--electro-error-light]')
    })

    it('supports Hebrew text content', () => {
      render(<Textarea data-testid="textarea" defaultValue="זהו טקסט בעברית לבדיקת RTL" />)
      const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement
      expect(textarea.value).toBe('זהו טקסט בעברית לבדיקת RTL')
    })
  })
})
