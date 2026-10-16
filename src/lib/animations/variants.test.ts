import { describe, expect, it } from 'vitest'
import {
  backdropVariants,
  cardHoverVariants,
  cardShadowVariants,
  containerVariants,
  fadeInVariants,
  itemVariants,
  modalVariants,
  pageVariants,
} from './variants'

describe('Animation Variants', () => {
  it('pageVariants has initial, animate, and exit states', () => {
    expect(pageVariants.initial).toBeDefined()
    expect(pageVariants.animate).toBeDefined()
    expect(pageVariants.exit).toBeDefined()
  })

  it('pageVariants initial state has opacity 0 and y offset', () => {
    const initial = pageVariants.initial
    expect(initial).toHaveProperty('opacity', 0)
    expect(initial).toHaveProperty('y', 20)
  })

  it('pageVariants animate state has opacity 1 and y 0', () => {
    const animate = pageVariants.animate
    expect(animate).toHaveProperty('opacity', 1)
    expect(animate).toHaveProperty('y', 0)
  })

  it('cardHoverVariants has initial and hover states', () => {
    expect(cardHoverVariants.initial).toBeDefined()
    expect(cardHoverVariants.hover).toBeDefined()
  })

  it('cardShadowVariants has initial, hover, and tap states', () => {
    expect(cardShadowVariants.initial).toBeDefined()
    expect(cardShadowVariants.hover).toBeDefined()
    expect(cardShadowVariants.tap).toBeDefined()
  })

  it('modalVariants has initial, animate, and exit states', () => {
    expect(modalVariants.initial).toBeDefined()
    expect(modalVariants.animate).toBeDefined()
    expect(modalVariants.exit).toBeDefined()
  })

  it('modalVariants initial state has opacity 0 and scale < 1', () => {
    const initial = modalVariants.initial
    expect(initial).toHaveProperty('opacity', 0)
    expect(initial).toHaveProperty('scale', 0.95)
  })

  it('modalVariants animate state has opacity 1 and scale 1', () => {
    const animate = modalVariants.animate
    expect(animate).toHaveProperty('opacity', 1)
    expect(animate).toHaveProperty('scale', 1)
  })

  it('backdropVariants has initial, animate, and exit states', () => {
    expect(backdropVariants.initial).toBeDefined()
    expect(backdropVariants.animate).toBeDefined()
    expect(backdropVariants.exit).toBeDefined()
  })

  it('containerVariants has staggerChildren transition', () => {
    const animate = containerVariants.animate
    expect(animate).toHaveProperty('transition')
    if (typeof animate === 'object' && animate !== null && 'transition' in animate) {
      const transition = (animate as Record<string, unknown>).transition
      expect(transition).toHaveProperty('staggerChildren')
    }
  })

  it('itemVariants has initial, animate states with opacity', () => {
    expect(itemVariants.initial).toHaveProperty('opacity', 0)
    expect(itemVariants.animate).toHaveProperty('opacity', 1)
  })

  it('fadeInVariants has initial, animate, and exit states', () => {
    expect(fadeInVariants.initial).toBeDefined()
    expect(fadeInVariants.animate).toBeDefined()
    expect(fadeInVariants.exit).toBeDefined()
  })
})
