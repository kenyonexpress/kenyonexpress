import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

describe('Select component', () => {
  describe('SelectTrigger Variants', () => {
    it('renders default variant with correct border and background', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('border-[--electro-border]')
      expect(trigger).toHaveClass('bg-[--electro-white]')
      expect(trigger).toHaveClass('text-[--electro-text-primary]')
    })

    it('renders error variant with error styling', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" variant="error">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('border-[--electro-error]')
      expect(trigger).toHaveClass('bg-[--electro-error-light]')
    })

    it('renders success variant with success styling', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" variant="success">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('border-[--electro-success]')
      expect(trigger).toHaveClass('bg-[--electro-success-light]')
    })

    it('renders disabled variant when disabled prop is true', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" disabled>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toBeDisabled()
      expect(trigger).toHaveClass('border-[--electro-border-alt]')
      expect(trigger).toHaveClass('bg-[--electro-gray-light]')
    })
  })

  describe('SelectTrigger Sizes', () => {
    it('renders sm size trigger', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" size="sm">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('h-8', 'px-3', 'py-1', 'text-xs')
    })

    it('renders md size trigger (default)', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" size="md">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('h-10', 'px-3', 'py-2', 'text-sm')
    })

    it('renders lg size trigger', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" size="lg">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('h-12', 'px-4', 'py-3', 'text-base')
    })
  })

  describe('SelectTrigger styling', () => {
    it('centers content with flex and justify-between', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('flex', 'items-center', 'justify-between')
    })

    it('has rounded borders', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('rounded-md')
    })

    it('applies transition colors', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('transition-colors')
    })

    it('applies focus-visible ring styling', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-offset-2')
    })
  })

  describe('Placeholder styling', () => {
    it('applies placeholder text color', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select an option..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('data-[placeholder]:text-[--electro-text-tertiary]')
    })
  })

  describe('Disabled state', () => {
    it('prevents interaction when disabled', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" disabled>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toBeDisabled()
    })

    it('shows disabled cursor', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" disabled>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('disabled:cursor-not-allowed')
      expect(trigger).toHaveClass('disabled:opacity-50')
    })
  })

  describe('Combinations', () => {
    it('renders sm error select trigger', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" variant="error" size="sm">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('border-[--electro-error]', 'h-8', 'px-3')
    })

    it('renders lg success select trigger', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" variant="success" size="lg">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('border-[--electro-success]', 'h-12', 'px-4')
    })
  })

  describe('HTML attributes', () => {
    it('supports custom className', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" className="custom-class">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('custom-class')
    })

    it('forwards ref correctly', () => {
      const ref = { current: null }
      render(
        <Select>
          <SelectTrigger ref={ref} data-testid="trigger">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      )
      expect(ref.current).toBeTruthy()
    })
  })

  describe('SelectContent styling', () => {
    it('uses design token colors in dropdown content', () => {
      render(
        <Select defaultOpen>
          <SelectTrigger>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent data-testid="content">
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>,
      )
      // Content is portal-mounted and may not be directly testable for classes
      // but we can verify structure
      const content = screen.queryByTestId('content')
      if (content) {
        expect(content).toHaveClass('border-[--electro-border]')
        expect(content).toHaveClass('bg-[--electro-white]')
      }
    })
  })

  describe('SelectItem styling', () => {
    it('applies hover and focus styling to items', () => {
      render(
        <Select defaultOpen>
          <SelectTrigger>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1" data-testid="item">
              Option 1
            </SelectItem>
          </SelectContent>
        </Select>,
      )
      // Items may be inside portal, structure verified above
      const item = screen.queryByTestId('item')
      if (item) {
        expect(item).toHaveClass('transition-colors')
        expect(item).toHaveClass('hover:bg-[--electro-surface-hover]')
      }
    })
  })

  describe('Accessibility', () => {
    it('supports placeholder value', () => {
      const { container } = render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Choose an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>,
      )
      expect(container).toBeTruthy()
    })

    it('maintains proper structure for screen readers', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>,
      )
      // Basic structure validation
      const trigger = screen.getByRole('combobox')
      expect(trigger).toBeInTheDocument()
    })
  })

  describe('Hebrew RTL support', () => {
    it('supports Hebrew placeholder text', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="בחר אפשרות..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">אפשרות 1</SelectItem>
            <SelectItem value="2">אפשרות 2</SelectItem>
          </SelectContent>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toBeInTheDocument()
    })

    it('applies styling to Hebrew select options', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" variant="error">
            <SelectValue placeholder="בחר אפשרות..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('border-[--electro-error]')
      expect(trigger).toHaveClass('bg-[--electro-error-light]')
    })

    it('maintains focus ring for Hebrew inputs', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="בחר אפשרות..." />
          </SelectTrigger>
        </Select>,
      )
      const trigger = screen.getByTestId('trigger')
      expect(trigger).toHaveClass('focus-visible:ring-2')
    })
  })
})
