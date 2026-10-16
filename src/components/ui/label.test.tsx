import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Label } from './label'

describe('Label component', () => {
  describe('Variants', () => {
    it('renders default variant with primary text color', () => {
      render(<Label data-testid="label">Default Label</Label>)
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('text-[--electro-text-primary]')
    })

    it('renders error variant with error text color', () => {
      render(
        <Label data-testid="label" variant="error">
          Error Label
        </Label>,
      )
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('text-[--electro-error]')
    })

    it('renders success variant with success text color', () => {
      render(
        <Label data-testid="label" variant="success">
          Success Label
        </Label>,
      )
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('text-[--electro-success]')
    })

    it('renders muted variant with secondary text color', () => {
      render(
        <Label data-testid="label" variant="muted">
          Muted Label
        </Label>,
      )
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('text-[--electro-text-secondary]')
    })
  })

  describe('Sizes', () => {
    it('renders sm size with text-xs', () => {
      render(
        <Label data-testid="label" size="sm">
          Small Label
        </Label>,
      )
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('text-xs')
    })

    it('renders md size with text-sm (default)', () => {
      render(
        <Label data-testid="label" size="md">
          Medium Label
        </Label>,
      )
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('text-sm')
    })

    it('renders lg size with text-base', () => {
      render(
        <Label data-testid="label" size="lg">
          Large Label
        </Label>,
      )
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('text-base')
    })
  })

  describe('Required indicator', () => {
    it('shows red asterisk when required is true', () => {
      render(
        <Label data-testid="label" required>
          Required Field
        </Label>,
      )
      const label = screen.getByTestId('label')
      expect(label).toHaveClass("after:content-['*']")
      expect(label).toHaveClass('after:text-[--electro-error]')
    })

    it('does not show asterisk when required is false (default)', () => {
      render(
        <Label data-testid="label" required={false}>
          Optional Field
        </Label>,
      )
      const label = screen.getByTestId('label')
      expect(label).not.toHaveClass("after:content-['*']")
    })
  })

  describe('Font weight and styling', () => {
    it('applies font-medium for all labels', () => {
      render(<Label data-testid="label">Label Text</Label>)
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('font-medium')
    })

    it('applies font-medium and compact styling', () => {
      render(<Label data-testid="label">Label Text</Label>)
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('font-medium')
      expect(label).toHaveClass('transition-colors')
    })

    it('applies transition-colors for smooth changes', () => {
      render(<Label data-testid="label">Label Text</Label>)
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('transition-colors')
    })
  })

  describe('Disabled state styling', () => {
    it('applies disabled styling when peer is disabled', () => {
      render(<Label data-testid="label">Disabled Label</Label>)
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('peer-disabled:cursor-not-allowed')
      expect(label).toHaveClass('peer-disabled:opacity-70')
    })
  })

  describe('Combinations', () => {
    it('renders sm error required label', () => {
      render(
        <Label data-testid="label" variant="error" size="sm" required>
          Error Field
        </Label>,
      )
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('text-[--electro-error]', 'text-xs', "after:content-['*']")
    })

    it('renders lg success label without required indicator', () => {
      render(
        <Label data-testid="label" variant="success" size="lg" required={false}>
          Success Field
        </Label>,
      )
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('text-[--electro-success]', 'text-base')
    })
  })

  describe('HTML attributes', () => {
    it('supports htmlFor attribute linking to input', () => {
      render(
        <Label data-testid="label" htmlFor="email-input">
          Email
        </Label>,
      )
      const label = screen.getByTestId('label')
      expect(label).toHaveAttribute('for', 'email-input')
    })

    it('supports custom className', () => {
      render(
        <Label data-testid="label" className="custom-class">
          Label
        </Label>,
      )
      const label = screen.getByTestId('label')
      expect(label).toHaveClass('custom-class')
    })

    it('forwards ref correctly', () => {
      const ref = { current: null }
      render(
        <Label ref={ref} data-testid="label">
          Label
        </Label>,
      )
      expect(ref.current).toBeInstanceOf(HTMLLabelElement)
    })
  })

  describe('Accessibility', () => {
    it('is a proper label element for form accessibility', () => {
      render(<Label data-testid="label">Form Label</Label>)
      const label = screen.getByTestId('label')
      expect(label.tagName.toLowerCase()).toBe('label')
    })

    it('supports htmlFor for input association', () => {
      render(
        <>
          <Label htmlFor="test-input">Test Label</Label>
          <input id="test-input" data-testid="input" />
        </>,
      )
      const label = screen.getByText('Test Label')
      const input = screen.getByTestId('input')
      expect(label).toHaveAttribute('for', 'test-input')
      expect(input).toHaveAttribute('id', 'test-input')
    })
  })
})
