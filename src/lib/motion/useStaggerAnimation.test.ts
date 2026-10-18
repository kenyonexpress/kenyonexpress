import {
  containerVariants,
  itemVariants,
  useStaggerAnimation,
} from '@/lib/motion/useStaggerAnimation'
import { describe, expect, it } from 'vitest'

describe('useStaggerAnimation', () => {
  it('returns containerVariants and itemVariants', () => {
    const animation = useStaggerAnimation()
    expect(animation).toHaveProperty('containerVariants')
    expect(animation).toHaveProperty('itemVariants')
  })

  it('containerVariants has correct structure', () => {
    expect(containerVariants).toHaveProperty('hidden')
    expect(containerVariants).toHaveProperty('visible')
  })

  it('containerVariants hidden state', () => {
    expect(containerVariants.hidden).toEqual({
      opacity: 0,
    })
  })

  it('containerVariants visible state has correct structure', () => {
    expect(containerVariants.visible).toMatchObject({
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    })
  })

  it('itemVariants has correct structure', () => {
    expect(itemVariants).toHaveProperty('hidden')
    expect(itemVariants).toHaveProperty('visible')
  })

  it('itemVariants hidden state', () => {
    expect(itemVariants.hidden).toEqual({
      opacity: 0,
      y: 20,
    })
  })

  it('itemVariants visible state', () => {
    expect(itemVariants.visible).toMatchObject({
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: 'easeOut',
      },
    })
  })

  it('containerVariants stagger delay matches configuration', () => {
    const transition = containerVariants.visible.transition
    expect(transition.staggerChildren).toBe(0.1)
    expect(transition.delayChildren).toBe(0.2)
  })

  it('itemVariants transition duration is half second', () => {
    const transition = itemVariants.visible.transition
    expect(transition.duration).toBe(0.5)
  })
})
