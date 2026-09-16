import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * The gallery's three inputs -- thumbnails, swipe, keyboard -- and its zoom,
 * against one index.
 *
 * jsdom paints nothing, so what is pinned is the state each gesture leaves
 * behind: which thumbnail is current, which URL the frame holds, whether the
 * zoom wrapper carries a transform. The pixel side is the parity gate's job.
 */

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    blurDataURL: _blur,
    placeholder: _placeholder,
    ...props
  }: Record<string, unknown>) => {
    // biome-ignore lint/a11y/useAltText: passthrough stub, alt arrives via props
    return <img {...(props as object)} />
  },
}))

import ProductGallery, { SWIPE_THRESHOLD_PX, ZOOM_SCALE } from './ProductGallery'

// jsdom has no PointerEvent, and testing-library then dispatches a bare Event
// with no coordinates: every gesture reads as clientX undefined, which the
// component treats as a tap. A MouseEvent with a pointerId is what a browser
// hands the handlers, so that is what the suite dispatches.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'touch'
    }
  }
  Object.defineProperty(window, 'PointerEvent', { value: PointerEventPolyfill, writable: true })
}

const IMAGES = ['https://cdn.test/a.webp', 'https://cdn.test/b.webp', 'https://cdn.test/c.webp']

const frame = () => screen.getByRole('region', { name: /תמונות המוצר/ })
const mainSrc = () => (frame().querySelector('.pdp-gallery__zoom img') as HTMLImageElement).src
const zoomBox = () => screen.getByTestId('pdp-gallery-zoom')
const current = () =>
  screen
    .getAllByRole('button', { name: /^תמונה \d$/ })
    .findIndex((b) => b.getAttribute('aria-current') === 'true')

function swipe(dx: number, dy = 0) {
  fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 200, clientY: 200 })
  fireEvent.pointerUp(frame(), { pointerId: 1, clientX: 200 + dx, clientY: 200 + dy })
}

describe('ProductGallery', () => {
  it('opens on the first photo with its thumbnail current and the counter at 1', () => {
    render(<ProductGallery images={IMAGES} name="תיק" />)
    expect(mainSrc()).toBe(IMAGES[0])
    expect(current()).toBe(0)
    expect(frame().getAttribute('aria-label')).toContain('תמונה 1 מתוך 3')
  })

  it('a thumbnail click swaps the frame', () => {
    render(<ProductGallery images={IMAGES} name="תיק" />)
    fireEvent.click(screen.getByRole('button', { name: 'תמונה 3' }))
    expect(mainSrc()).toBe(IMAGES[2])
    expect(current()).toBe(2)
  })

  it('a leftward swipe is next, a rightward swipe is previous, and both wrap', () => {
    render(<ProductGallery images={IMAGES} name="תיק" />)
    swipe(-SWIPE_THRESHOLD_PX)
    expect(current()).toBe(1)
    swipe(-SWIPE_THRESHOLD_PX - 30)
    expect(current()).toBe(2)
    swipe(-SWIPE_THRESHOLD_PX)
    expect(current()).toBe(0)
    swipe(SWIPE_THRESHOLD_PX)
    expect(current()).toBe(2)
  })

  it('a mostly-vertical drag is a scroll, not a swipe', () => {
    render(<ProductGallery images={IMAGES} name="תיק" />)
    swipe(-SWIPE_THRESHOLD_PX, 120)
    expect(current()).toBe(0)
    // And not a tap either: the finger travelled.
    expect(frame().getAttribute('data-zoomed')).toBeNull()
  })

  it('the arrow keys follow the screen: left is next in an RTL page', () => {
    render(<ProductGallery images={IMAGES} name="תיק" />)
    fireEvent.keyDown(frame(), { key: 'ArrowLeft' })
    expect(current()).toBe(1)
    fireEvent.keyDown(frame(), { key: 'ArrowRight' })
    expect(current()).toBe(0)
    fireEvent.keyDown(frame(), { key: 'ArrowRight' })
    expect(current()).toBe(2)
  })

  it('the arrow buttons exist for a mouse and a screen reader', () => {
    render(<ProductGallery images={IMAGES} name="תיק" />)
    fireEvent.click(screen.getByRole('button', { name: 'התמונה הבאה' }))
    expect(current()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'התמונה הקודמת' }))
    expect(current()).toBe(0)
  })

  it('a tap zooms in place at the tap point, and a second tap restores', () => {
    render(<ProductGallery images={IMAGES} name="תיק" />)
    vi.spyOn(frame(), 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 400,
      height: 400,
      right: 500,
      bottom: 500,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    })
    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 200, clientY: 400 })
    fireEvent.pointerUp(frame(), { pointerId: 1, clientX: 203, clientY: 402 })
    expect(frame().getAttribute('data-zoomed')).toBe('true')
    expect(zoomBox().style.transform).toBe(`scale(${ZOOM_SCALE})`)
    // 25% across, 75% down: the origin is where the finger was.
    expect(zoomBox().style.transformOrigin).toBe('25.75% 75.5%')

    fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 200, clientY: 200 })
    fireEvent.pointerUp(frame(), { pointerId: 1, clientX: 200, clientY: 200 })
    expect(frame().getAttribute('data-zoomed')).toBeNull()
    expect(zoomBox().style.transform).toBe('')
  })

  it('moving to another photo, or Escape, leaves the zoom behind', () => {
    render(<ProductGallery images={IMAGES} name="תיק" />)
    fireEvent.keyDown(frame(), { key: 'Enter' })
    expect(frame().getAttribute('data-zoomed')).toBe('true')
    fireEvent.keyDown(frame(), { key: 'Escape' })
    expect(frame().getAttribute('data-zoomed')).toBeNull()

    fireEvent.keyDown(frame(), { key: ' ' })
    expect(frame().getAttribute('data-zoomed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'תמונה 2' }))
    expect(frame().getAttribute('data-zoomed')).toBeNull()
  })

  it('a single photo has no arrows, no thumbnails and still zooms', () => {
    render(<ProductGallery images={[IMAGES[0] as string]} name="תיק" />)
    expect(screen.queryByRole('button', { name: 'התמונה הבאה' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^תמונה \d$/ })).toBeNull()
    swipe(-SWIPE_THRESHOLD_PX)
    expect(mainSrc()).toBe(IMAGES[0])
    fireEvent.keyDown(frame(), { key: 'Enter' })
    expect(frame().getAttribute('data-zoomed')).toBe('true')
  })

  it('paints the sale badge only for a real reduction', () => {
    const { unmount } = render(
      <ProductGallery images={IMAGES} name="תיק" price={51} oldPrice={100} />,
    )
    expect(screen.getByText('49%')).toBeInTheDocument()
    unmount()
    render(<ProductGallery images={IMAGES} name="תיק" price={100} oldPrice={100} />)
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('renders the empty frame with no images and no controls', () => {
    render(<ProductGallery images={[]} name="תיק" />)
    expect(screen.queryByRole('region')).toBeNull()
    expect(document.querySelector('.pdp-gallery__frame--empty')).not.toBeNull()
  })
})
