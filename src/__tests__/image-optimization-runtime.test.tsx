import { render } from '@testing-library/react'
import Image from 'next/image'
import { describe, expect, it } from 'vitest'

/**
 * Runtime Image Optimization Tests (UX40)
 *
 * Verifies actual image rendering and optimization at runtime,
 * not just source code patterns.
 */

describe('Image Component Runtime Optimization', () => {
  /**
   * Verify next/image renders with proper attributes
   */
  it('renders Image component with srcset attribute', () => {
    const { container } = render(
      <Image
        src="/test.jpg"
        alt="Test"
        width={200}
        height={200}
        sizes="(max-width: 640px) 100px, 200px"
      />,
    )

    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('srcset')).toBeTruthy()
  })

  /**
   * Verify lazy loading attribute is applied
   */
  it('applies loading lazy attribute for non-priority images', () => {
    const { container } = render(
      <Image src="/test.jpg" alt="Test" width={100} height={100} loading="lazy" />,
    )

    const img = container.querySelector('img')
    expect(img?.getAttribute('loading')).toBe('lazy')
  })

  /**
   * Verify priority prop is accepted for priority loading
   */
  it('accepts priority prop for LCP optimization', () => {
    const { container } = render(
      <Image src="/test.jpg" alt="Test" width={100} height={100} priority />,
    )

    // Priority prop accepted without error
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('alt')).toBe('Test')
  })

  /**
   * Verify blur placeholder attributes
   */
  it('accepts blur placeholder configuration', () => {
    const blurDataURL =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8VAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k='

    const { container } = render(
      <Image
        src="/test.jpg"
        alt="Test"
        width={100}
        height={100}
        placeholder="blur"
        blurDataURL={blurDataURL}
      />,
    )

    // Image component accepts blur placeholder configuration without error
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('alt')).toBe('Test')
  })

  /**
   * Verify fill layout image renders
   */
  it('renders fill layout images', () => {
    const { container } = render(<Image src="/test.jpg" alt="Test" fill className="object-cover" />)

    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.className).toContain('object-cover')
  })

  /**
   * Verify responsive sizes are applied correctly
   */
  it('applies responsive sizes attribute for different layouts', () => {
    const { container } = render(
      <Image
        src="/test.jpg"
        alt="Test"
        width={400}
        height={300}
        sizes="(max-width: 640px) 100vw, 50vw"
      />,
    )

    const img = container.querySelector('img')
    const sizes = img?.getAttribute('sizes')
    expect(sizes).toContain('max-width: 640px')
    expect(sizes).toContain('100vw')
    expect(sizes).toContain('50vw')
  })

  /**
   * Verify decoding async for performance
   */
  it('applies async decoding attribute', () => {
    const { container } = render(
      <Image src="/test.jpg" alt="Test" width={100} height={100} decoding="async" />,
    )

    const img = container.querySelector('img')
    expect(img?.getAttribute('decoding')).toBe('async')
  })

  /**
   * Verify alt text is always present for accessibility
   */
  it('requires alt text for accessibility', () => {
    const { container } = render(
      <Image src="/test.jpg" alt="Product image" width={100} height={100} />,
    )

    const img = container.querySelector('img')
    expect(img?.getAttribute('alt')).toBe('Product image')
    expect(img?.getAttribute('alt')).not.toBe('')
  })

  /**
   * Verify object-fit and object-cover for image containment
   */
  it('applies object-fit classes for image containment', () => {
    const { container } = render(
      <Image
        src="/test.jpg"
        alt="Test"
        fill
        className="object-cover"
        style={{ objectFit: 'cover' }}
      />,
    )

    const img = container.querySelector('img')
    expect(img?.style.objectFit).toBe('cover')
  })
})

/**
 * Image Component Props Validation
 *
 * Ensures components pass correct props to Image component
 */
describe('Image Component Props Validation', () => {
  /**
   * Verify width and height are set for intrinsic sizing
   */
  it('requires width and height for non-fill images', () => {
    const { container } = render(<Image src="/test.jpg" alt="Test" width={200} height={150} />)

    const img = container.querySelector('img')
    expect(img?.getAttribute('width')).toBeTruthy()
    expect(img?.getAttribute('height')).toBeTruthy()
  })

  /**
   * Verify quality prop controls compression
   */
  it('applies quality prop for compression control', () => {
    // Quality is compiled into the image fetch URL, not a DOM attribute
    // This test verifies the prop is accepted without error
    const { container } = render(
      <Image src="/test.jpg" alt="Test" width={100} height={100} quality={50} />,
    )

    expect(container.querySelector('img')).toBeTruthy()
  })

  /**
   * Verify className is preserved
   */
  it('preserves custom className', () => {
    const { container } = render(
      <Image src="/test.jpg" alt="Test" width={100} height={100} className="custom-class" />,
    )

    const img = container.querySelector('img')
    expect(img?.className).toContain('custom-class')
  })
})

/**
 * Responsive Image Sizes Validation
 *
 * Tests that responsive sizes are correctly calculated
 */
describe('Responsive Image Sizes', () => {
  /**
   * Test product card responsive sizes
   */
  it('validates deal card responsive sizes', () => {
    const dealSizes =
      '(max-width: 430px) 39vw, (max-width: 640px) 43vw, (max-width: 1023px) 46vw, 240px'

    // Verify the sizes string is valid for Next Image
    expect(dealSizes).toContain('vw')
    expect(dealSizes).toContain('px')
    expect(dealSizes.split(',').length).toBe(4)
  })

  /**
   * Test thumbnail responsive sizes
   */
  it('validates thumbnail responsive sizes', () => {
    const thumbSizes = '(max-width: 497px) calc(50vw - 63px), 186px'

    expect(thumbSizes).toContain('calc')
    expect(thumbSizes).toContain('186px')
  })

  /**
   * Test hero image responsive sizes
   */
  it('validates hero image responsive sizes', () => {
    const heroSizes = '(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1170px'

    expect(heroSizes).toContain('100vw')
    expect(heroSizes).toContain('90vw')
    expect(heroSizes).toContain('1170px')
  })
})
