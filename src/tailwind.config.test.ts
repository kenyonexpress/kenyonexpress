import { describe, expect, it } from 'vitest'
import config from '../tailwind.config'

/**
 * Tests for Tailwind configuration with design tokens.
 * Verifies that the color tokens from src/styles/tokens.css are properly configured
 * as Tailwind utilities.
 */
describe('Tailwind config', () => {
  it('extends theme with color tokens', () => {
    expect(config.theme).toBeDefined()
    expect(config.theme?.extend).toBeDefined()
    expect(config.theme?.extend?.colors).toBeDefined()
  })

  it('configures primary brand yellow with all variants', () => {
    const colors = config.theme?.extend?.colors as Record<string, unknown>
    const brand = colors?.brand as Record<string, string>

    expect(brand).toBeDefined()
    expect(brand.DEFAULT).toBe('var(--color-brand-primary)')
    expect(brand.hover).toBe('var(--color-brand-primary-hover)')
    expect(brand.focus).toBe('var(--color-brand-primary-focus)')
    expect(brand.dark).toBe('var(--color-brand-dark)')
    expect(brand.accent).toBe('var(--color-brand-accent)')
  })

  it('configures functional colors (price, error, success, link, heading)', () => {
    const colors = config.theme?.extend?.colors as Record<string, string>

    expect(colors.price).toBe('var(--color-price)')
    expect(colors.error).toBe('var(--color-error)')
    expect(colors.success).toBe('var(--color-success)')
    expect(colors.link).toBe('var(--color-link)')
    expect(colors.heading).toBe('var(--color-heading)')
  })

  it('configures neutral and border colors', () => {
    const colors = config.theme?.extend?.colors as Record<string, string>

    expect(colors.border).toBe('var(--color-border)')
    expect(colors.muted).toBe('var(--color-muted)')
    expect(colors.icon).toBe('var(--color-icon)')
  })

  it('configures surface colors (background, paper, panels)', () => {
    const colors = config.theme?.extend?.colors as Record<string, string>

    expect(colors.background).toBe('var(--color-background)')
    expect(colors.surface).toBe('var(--color-surface)')
    expect(colors.ink).toBe('var(--color-ink)')
    expect(colors.track).toBe('var(--color-track)')
  })

  it('configures third-party brand colors (WhatsApp, Facebook)', () => {
    const colors = config.theme?.extend?.colors as Record<string, string>

    expect(colors.whatsapp).toBe('var(--color-whatsapp)')
    expect(colors.facebook).toBe('var(--color-facebook)')
  })

  it('configures payment card scheme colors', () => {
    const colors = config.theme?.extend?.colors as Record<string, string>

    expect(colors['payment-visa']).toBe('var(--color-payment-visa)')
    expect(colors['payment-mastercard-red']).toBe('var(--color-payment-mastercard-red)')
    expect(colors['payment-amex']).toBe('var(--color-payment-amex)')
  })

  it('configures typography utilities with design tokens', () => {
    const fontSize = config.theme?.extend?.fontSize as Record<string, string>

    expect(fontSize).toBeDefined()
    expect(fontSize.nano).toBe('var(--text-nano)')
    expect(fontSize.badge).toBe('var(--text-badge)')
    expect(fontSize.topbar).toBe('var(--text-topbar)')
  })

  it('configures border radius utilities', () => {
    const radius = config.theme?.extend?.borderRadius as Record<string, string>

    expect(radius?.card).toBe('var(--radius-card, 8px)')
    expect(radius?.btn).toBe('var(--radius-btn, 4px)')
    expect(radius?.elevated).toBe('var(--radius-elevated, 12px)')
  })

  it('configures box shadow utilities', () => {
    const shadow = config.theme?.extend?.boxShadow as Record<string, string>

    expect(shadow?.card).toBe('var(--shadow-card)')
    expect(shadow?.['card-hover']).toBe('var(--shadow-card-hover)')
  })

  it('references CSS variables instead of hardcoded values', () => {
    const colors = config.theme?.extend?.colors as Record<string, unknown>

    const colorEntries = Object.entries(colors)
    for (const [key, value] of colorEntries) {
      if (typeof value === 'string' && !key.includes('stripe') && key !== 'inherit') {
        // All color values should be CSS variable references
        expect(value).toMatch(/^var\(/)
      }
    }
  })
})
