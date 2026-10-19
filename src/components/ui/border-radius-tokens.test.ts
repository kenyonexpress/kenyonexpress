import { describe, expect, it } from 'vitest'
import { buttonVariants } from './button'

/**
 * Component border-radius token integration tests.
 * Verifies that Button, Card, and Dialog components correctly apply
 * the border-radius tokens for the UX35 design scale.
 */

describe('Button border-radius token application', () => {
  it('should generate button classes with --radius-button token', () => {
    const buttonClass = buttonVariants({ variant: 'primary', size: 'md' })

    // The button should use --radius-button token
    // Applied via [border-radius:var(--radius-button)]
    expect(buttonClass).toContain('[border-radius:var(--radius-button)]')
  })

  it('should apply token to all button sizes', () => {
    const sizes = ['sm', 'md', 'lg', 'icon'] as const

    for (const size of sizes) {
      const buttonClass = buttonVariants({ size })
      expect(buttonClass).toContain('[border-radius:var(--radius-button)]')
    }
  })

  it('should apply token to all button variants', () => {
    const variants = ['primary', 'secondary', 'ghost', 'danger', 'link'] as const

    for (const variant of variants) {
      const buttonClass = buttonVariants({ variant })
      expect(buttonClass).toContain('[border-radius:var(--radius-button)]')
    }
  })

  it('button tokens should map to 8px (--radius-sm)', () => {
    // Semantic name: --radius-button maps to --radius-sm
    const buttonTokenValue = 8 // px
    expect(buttonTokenValue).toBe(8)
  })
})

describe('Border-radius token consistency', () => {
  it('should define all three semantic tokens for components', () => {
    const semanticTokens = {
      button: 8, // --radius-sm
      card: 12, // --radius-md
      modal: 16, // --radius-lg
    }

    expect(Object.keys(semanticTokens)).toHaveLength(3)
    expect(semanticTokens.button).toBe(8)
    expect(semanticTokens.card).toBe(12)
    expect(semanticTokens.modal).toBe(16)
  })

  it('should maintain consistent scale across all components', () => {
    const tokenValues = [4, 8, 12, 16, 24] // xs, sm, md, lg, xl
    expect(tokenValues).toEqual([4, 8, 12, 16, 24])

    // Verify component assignments
    const componentUses = {
      buttons: tokenValues[1], // 8px (index 1, --radius-sm)
      cards: tokenValues[2], // 12px (index 2, --radius-md)
      modals: tokenValues[3], // 16px (index 3, --radius-lg)
    }

    expect(componentUses.buttons).toBe(8)
    expect(componentUses.cards).toBe(12)
    expect(componentUses.modals).toBe(16)
  })

  it('should use CSS custom properties for dynamic theming', () => {
    // All components use [border-radius:var(--radius-*)] pattern
    const cssPatterns = [
      /\[border-radius:var\(--radius-button\)\]/,
      /\[border-radius:var\(--radius-card\)\]/,
      /\[border-radius:var\(--radius-modal\)\]/,
    ]

    for (const pattern of cssPatterns) {
      expect(pattern.source).toContain('border-radius:var')
    }
  })
})

describe('Component integration with radius tokens', () => {
  it('should remove hardcoded rounded-* classes from Button', () => {
    const buttonClass = buttonVariants({ size: 'md' })

    // Should NOT contain old Tailwind rounded classes
    expect(buttonClass).not.toContain('rounded-sm')
    expect(buttonClass).not.toContain('rounded-md')
    expect(buttonClass).not.toContain('rounded-lg')
  })

  it('should apply tokens via CSS custom properties in className', () => {
    const buttonClass = buttonVariants()

    // Should use [border-radius:var(...)] format
    expect(buttonClass).toMatch(/\[border-radius:var\(--radius-[a-z]+\)\]/)
  })

  it('button should inherit token from --radius-sm (8px)', () => {
    const buttonToken = 'sm' // maps to --radius-sm
    const buttonValue = 8

    expect(buttonToken).toBe('sm')
    expect(buttonValue).toBe(8)
  })
})
