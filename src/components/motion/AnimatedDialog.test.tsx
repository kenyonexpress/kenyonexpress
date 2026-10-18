import { contentVariants, overlayVariants } from '@/components/motion/AnimatedDialog'
import { describe, expect, it } from 'vitest'

describe('AnimatedDialog', () => {
  describe('Variants', () => {
    it('overlay variants have correct properties', () => {
      expect(overlayVariants.initial).toEqual({ opacity: 0 })
      expect(overlayVariants.animate).toEqual({ opacity: 1 })
      expect(overlayVariants.exit).toEqual({ opacity: 0 })
    })

    it('content variants have correct properties', () => {
      expect(contentVariants.initial).toMatchObject({
        opacity: 0,
        scale: 0.95,
        y: 20,
      })

      expect(contentVariants.animate).toMatchObject({
        opacity: 1,
        scale: 1,
        y: 0,
      })

      expect(contentVariants.exit).toMatchObject({
        opacity: 0,
        scale: 0.95,
        y: 20,
      })
    })

    it('content animate transition has duration', () => {
      const transition = contentVariants.animate.transition
      expect(transition).toMatchObject({
        duration: 0.3,
      })
      expect(transition?.ease).toBeDefined()
    })

    it('content exit transition has duration', () => {
      const transition = contentVariants.exit.transition
      expect(transition).toMatchObject({
        duration: 0.2,
      })
      expect(transition?.ease).toBeDefined()
    })

    it('overlay variants export correctly', () => {
      expect(overlayVariants).toBeDefined()
      expect(typeof overlayVariants).toBe('object')
    })

    it('content variants export correctly', () => {
      expect(contentVariants).toBeDefined()
      expect(typeof contentVariants).toBe('object')
    })
  })
})
