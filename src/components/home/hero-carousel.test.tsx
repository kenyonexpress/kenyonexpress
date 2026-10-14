/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX05 (14.10.2026): the hero carousel's four behaviours, driven in jsdom with
 * fake timers. Measured before any of this existed (logs/ux05/before.json, on
 * the built page at 380 and 1440): a 120px touch swipe in either direction left
 * the slider on slide 1, no progress indicator existed, no text status existed,
 * and after the visitor engaged every slide mounted its media at once.
 *
 *   swipe     a touch travelling 75px or more sideways pages; RTL, so a finger
 *             moving right pulls the NEXT slide in; a short or mostly vertical
 *             drag does nothing; a mouse drag never pages
 *   autoplay  5000ms per slide once engaged, held under reduced motion
 *   progress  the current dot carries a fill that animates over the same
 *             5000ms while the timer runs, and reads full while it does not
 *   lazy      active + next mount their media after engagement, sticky; the
 *             rest wait their turn
 *   status    "שקופית N מתוך M", polite at rest and off while rotating
 */

const variant = vi.hoisted(() => ({ value: 'control' }))
vi.mock('@/lib/analytics/use-experiment-variant', () => ({
  useExperimentVariant: () => variant.value,
}))
vi.mock('@/components/ui/SmartImage', () => ({
  default: ({ src }: { src: string }) => <img alt="" data-smart-image={src} src={src} />,
}))

import HeroSlider, {
  HERO_AUTOPLAY_MS,
  HERO_SWIPE_THRESHOLD,
  type HeroSlide,
  swipeDelta,
} from './HeroSlider'

const SLIDES: HeroSlide[] = ['one', 'two', 'three', 'four'].map((id, i) => ({
  id,
  variant: 'welcome',
  title: `שקופית ${i + 1}`,
  image_url: `/hero/${id}.webp`,
  link_url: null,
}))

/**
 * jsdom has no PointerEvent (checked: `typeof window.PointerEvent` is
 * 'undefined' under the pinned version), and testing-library falls back to a
 * plain Event whose pointerType is undefined. A MouseEvent subclass carrying the
 * two fields the handler reads is enough to say "this came from a finger".
 */
class FakePointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string
  constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string }) {
    super(type, { bubbles: true, cancelable: true, ...init })
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'touch'
  }
}

function gesture(
  root: Element,
  { dx, dy = 0, pointerType = 'touch' }: { dx: number; dy?: number; pointerType?: string },
) {
  act(() => {
    root.dispatchEvent(
      new FakePointerEvent('pointerdown', {
        clientX: 200,
        clientY: 100,
        pointerType,
        pointerId: 7,
      }),
    )
  })
  act(() => {
    window.dispatchEvent(
      new FakePointerEvent('pointerup', {
        clientX: 200 + dx,
        clientY: 100 + dy,
        pointerType,
        pointerId: 7,
      }),
    )
  })
}

const root = (container: HTMLElement) =>
  container.querySelector('[data-hero-slider]') as HTMLElement
const activeIndex = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-hero-slider] > [aria-hidden]')].findIndex(
    (el) => el.getAttribute('aria-hidden') === 'false',
  )
const mountedMedia = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-hero-slider] > [aria-hidden]')].map(
    (el) => el.querySelectorAll('[data-smart-image]').length > 0,
  )
const progress = (container: HTMLElement) =>
  container.querySelector('button[aria-current="true"] [data-hero-progress]') as HTMLElement
const status = (container: HTMLElement) =>
  container.querySelector('[data-hero-status]') as HTMLElement

const engage = () => {
  act(() => {
    fireEvent.pointerDown(window)
  })
}

let reduce = false
beforeEach(() => {
  vi.useFakeTimers()
  variant.value = 'control'
  reduce = false
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('reduced-motion') && reduce,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('swipeDelta', () => {
  it('pages only past the live threshold, sideways, and forward on a rightward finger', () => {
    expect(swipeDelta(HERO_SWIPE_THRESHOLD, 0)).toBe(1)
    expect(swipeDelta(-HERO_SWIPE_THRESHOLD, 0)).toBe(-1)
    expect(swipeDelta(HERO_SWIPE_THRESHOLD - 1, 0)).toBe(0)
    // Mostly vertical: the page is scrolling, not the carousel.
    expect(swipeDelta(100, 120)).toBe(0)
    expect(swipeDelta(100, 100)).toBe(0)
    expect(swipeDelta(100, 99)).toBe(1)
  })
})

describe('hero carousel swipe', () => {
  it('a rightward touch swipe goes to the next slide, a leftward one back', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    expect(activeIndex(container)).toBe(0)
    gesture(root(container), { dx: 120 })
    expect(activeIndex(container)).toBe(1)
    gesture(root(container), { dx: 120 })
    expect(activeIndex(container)).toBe(2)
    gesture(root(container), { dx: -120 })
    expect(activeIndex(container)).toBe(1)
  })

  it('wraps at both ends', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    gesture(root(container), { dx: -120 })
    expect(activeIndex(container)).toBe(SLIDES.length - 1)
    gesture(root(container), { dx: 120 })
    expect(activeIndex(container)).toBe(0)
  })

  it('ignores a short drag, a vertical pan and a mouse drag', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    gesture(root(container), { dx: HERO_SWIPE_THRESHOLD - 1 })
    expect(activeIndex(container)).toBe(0)
    gesture(root(container), { dx: 100, dy: 140 })
    expect(activeIndex(container)).toBe(0)
    gesture(root(container), { dx: 200, pointerType: 'mouse' })
    expect(activeIndex(container)).toBe(0)
  })

  it('a cancelled gesture (the browser took it for a vertical pan) does not page', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    act(() => {
      root(container).dispatchEvent(
        new FakePointerEvent('pointerdown', { clientX: 200, clientY: 100, pointerId: 7 }),
      )
    })
    act(() => {
      window.dispatchEvent(new FakePointerEvent('pointercancel', { pointerId: 7 }))
    })
    act(() => {
      window.dispatchEvent(
        new FakePointerEvent('pointerup', { clientX: 400, clientY: 100, pointerId: 7 }),
      )
    })
    expect(activeIndex(container)).toBe(0)
  })

  it('leaves the pan axis to the browser', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    expect(root(container).className).toContain('touch-pan-y')
  })

  it('restarts the five seconds from the swiped-to slide', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    engage()
    act(() => {
      vi.advanceTimersByTime(4_000)
    })
    gesture(root(container), { dx: 120 })
    expect(activeIndex(container)).toBe(1)
    act(() => {
      vi.advanceTimersByTime(4_000)
    })
    // 8s since engagement but only 4s since the swipe: still on slide 2.
    expect(activeIndex(container)).toBe(1)
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(activeIndex(container)).toBe(2)
  })
})

describe('hero carousel autoplay and progress', () => {
  it('advances every HERO_AUTOPLAY_MS once engaged, and the constant is 5s', () => {
    expect(HERO_AUTOPLAY_MS).toBe(5000)
    const { container } = render(<HeroSlider slides={SLIDES} />)
    engage()
    act(() => {
      vi.advanceTimersByTime(HERO_AUTOPLAY_MS)
    })
    expect(activeIndex(container)).toBe(1)
    act(() => {
      vi.advanceTimersByTime(HERO_AUTOPLAY_MS)
    })
    expect(activeIndex(container)).toBe(2)
  })

  it('shows a full bar at rest and a 5s fill while the timer runs', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    expect(progress(container).dataset.heroProgress).toBe('idle')
    expect(progress(container).style.animation).toBe('')
    engage()
    expect(progress(container).dataset.heroProgress).toBe('running')
    expect(progress(container).style.animation).toContain('hero-progress')
    expect(progress(container).style.animation).toContain(`${HERO_AUTOPLAY_MS}ms`)
    // The bar under the fill is the idle grey while the fill is running, and
    // the brand colour when it is not, so a resting bar is the old bar.
    const bar = progress(container).parentElement as HTMLElement
    expect(bar.style.backgroundColor).toBe('var(--color-slider-dot-idle)')
  })

  it('the fill grows from the inline start, the right edge in RTL', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    expect(progress(container).className).toContain('origin-right')
  })

  it('pausing on hover drops the fill to full and resuming restarts it with the timer', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    engage()
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    act(() => {
      fireEvent.mouseEnter(root(container))
    })
    expect(progress(container).dataset.heroProgress).toBe('idle')
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(activeIndex(container)).toBe(0)
    act(() => {
      fireEvent.mouseLeave(root(container))
    })
    expect(progress(container).dataset.heroProgress).toBe('running')
    act(() => {
      vi.advanceTimersByTime(4_999)
    })
    expect(activeIndex(container)).toBe(0)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(activeIndex(container)).toBe(1)
  })

  it('holds the slide under prefers-reduced-motion, and the dots still page', () => {
    reduce = true
    const { container } = render(<HeroSlider slides={SLIDES} />)
    engage()
    expect(progress(container).dataset.heroProgress).toBe('idle')
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(activeIndex(container)).toBe(0)
    act(() => {
      fireEvent.click(container.querySelector('button[aria-label="שקופית 3"]') as HTMLElement)
    })
    expect(activeIndex(container)).toBe(2)
    gesture(root(container), { dx: 120 })
    expect(activeIndex(container)).toBe(3)
  })

  it('the static_hero arm never runs the fill either', () => {
    variant.value = 'static_hero'
    const { container } = render(<HeroSlider slides={SLIDES} />)
    engage()
    expect(progress(container).dataset.heroProgress).toBe('idle')
  })

  it('a single slide draws no dots, no fill and no timer', () => {
    const { container } = render(<HeroSlider slides={SLIDES.slice(0, 1)} />)
    engage()
    expect(container.querySelector('[data-hero-progress]')).toBeNull()
    expect(status(container).textContent).toBe('שקופית 1 מתוך 1')
  })
})

describe('hero carousel lazy media', () => {
  it('mounts only the first slide before engagement', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    expect(mountedMedia(container)).toEqual([true, false, false, false])
  })

  it('mounts the next slide on engagement, not all of them', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    engage()
    expect(mountedMedia(container)).toEqual([true, true, false, false])
  })

  it('keeps a slide mounted once shown and reaches one ahead as it rotates', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    engage()
    act(() => {
      vi.advanceTimersByTime(HERO_AUTOPLAY_MS)
    })
    expect(activeIndex(container)).toBe(1)
    expect(mountedMedia(container)).toEqual([true, true, true, false])
    act(() => {
      vi.advanceTimersByTime(HERO_AUTOPLAY_MS)
    })
    expect(mountedMedia(container)).toEqual([true, true, true, true])
  })

  it('a dot tap mounts the chosen slide on demand, plus the one after it', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    act(() => {
      fireEvent.click(container.querySelector('button[aria-label="שקופית 3"]') as HTMLElement)
    })
    // The click is not a window pointerdown in jsdom, so this is the
    // un-engaged path: the chosen slide mounts, nothing else does.
    expect(mountedMedia(container)).toEqual([true, false, true, false])
    engage()
    expect(mountedMedia(container)).toEqual([true, false, true, true])
  })
})

describe('hero carousel status', () => {
  it('names the slide for assistive tech and is polite only while not rotating', () => {
    const { container } = render(<HeroSlider slides={SLIDES} />)
    expect(status(container).textContent).toBe('שקופית 1 מתוך 4')
    expect(status(container).getAttribute('aria-live')).toBe('polite')
    expect(status(container).getAttribute('aria-atomic')).toBe('true')
    expect(status(container).className).toContain('sr-only')
    engage()
    expect(status(container).getAttribute('aria-live')).toBe('off')
    act(() => {
      vi.advanceTimersByTime(HERO_AUTOPLAY_MS)
    })
    expect(status(container).textContent).toBe('שקופית 2 מתוך 4')
    act(() => {
      fireEvent.mouseEnter(root(container))
    })
    expect(status(container).getAttribute('aria-live')).toBe('polite')
  })
})
