/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The `static_hero` arm of the home_hero experiment (STEP 66): the slider
 * never auto-advances, even after the visitor engaged. Control keeps the
 * measured behaviour: autoplay starts on the first pointerdown and ticks
 * every AUTOPLAY_MS.
 */

const variant = vi.hoisted(() => ({ value: 'control' }))
vi.mock('@/lib/analytics/use-experiment-variant', () => ({
  useExperimentVariant: () => variant.value,
}))

import HeroSlider, { type HeroSlide } from './HeroSlider'

const SLIDES: HeroSlide[] = [
  { id: 'one', variant: 'welcome', title: 'ראשון', image_url: null, link_url: null },
  { id: 'two', variant: 'welcome', title: 'שני', image_url: null, link_url: null },
]

function visibleSlides(container: HTMLElement): number {
  return container.querySelectorAll('[data-hero-slider] > [aria-hidden="false"]').length
}

function activeIndex(container: HTMLElement): number {
  const slides = [...container.querySelectorAll('[data-hero-slider] > [aria-hidden]')]
  return slides.findIndex((el) => el.getAttribute('aria-hidden') === 'false')
}

beforeEach(() => {
  vi.useFakeTimers()
  variant.value = 'control'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('home_hero static_hero arm', () => {
  it('control advances after the visitor engages', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    expect(visibleSlides(container)).toBe(1)
    expect(activeIndex(container)).toBe(0)
    act(() => {
      fireEvent.pointerDown(window)
    })
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(activeIndex(container)).toBe(1)
    expect(
      container.querySelector('[data-hero-slider]')?.hasAttribute('data-home-hero-variant'),
    ).toBe(false)
  })

  it('static_hero never advances, and says so on the root', () => {
    variant.value = 'static_hero'
    const { container } = render(<HeroSlider slides={SLIDES} />)
    act(() => {
      fireEvent.pointerDown(window)
    })
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(activeIndex(container)).toBe(0)
    expect(
      container.querySelector('[data-hero-slider]')?.getAttribute('data-home-hero-variant'),
    ).toBe('static_hero')
  })
})
