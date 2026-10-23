import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ResponsiveImage from './ResponsiveImage'

describe('ResponsiveImage', () => {
  it('renders for local image paths', () => {
    render(<ResponsiveImage src="/products/test.jpg" alt="Test product" width={400} height={400} />)

    const img = screen.getByAltText('Test product')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src')
  })

  it('renders picture element for remote URLs', () => {
    const { container } = render(
      <ResponsiveImage
        src="https://example.com/products/test.jpg"
        alt="Test product"
        width={400}
        height={400}
      />,
    )

    const picture = container.querySelector('picture')
    expect(picture).toBeInTheDocument()
  })

  it('includes AVIF source', () => {
    const { container } = render(
      <ResponsiveImage
        src="https://example.com/products/test.jpg"
        alt="Test"
        width={400}
        height={400}
      />,
    )

    const avifSource = container.querySelector('source[type="image/avif"]')
    expect(avifSource).toBeInTheDocument()
    expect(avifSource).toHaveAttribute('srcset')
  })

  it('includes WebP source', () => {
    const { container } = render(
      <ResponsiveImage
        src="https://example.com/products/test.jpg"
        alt="Test"
        width={400}
        height={400}
      />,
    )

    const webpSource = container.querySelector('source[type="image/webp"]')
    expect(webpSource).toBeInTheDocument()
    expect(webpSource).toHaveAttribute('srcset')
  })

  it('uses custom widths when provided', () => {
    const { container } = render(
      <ResponsiveImage
        src="https://example.com/test.jpg"
        alt="Test"
        width={400}
        height={400}
        customWidths={[200, 400, 800]}
      />,
    )

    const avifSource = container.querySelector('source[type="image/avif"]')
    const srcset = avifSource?.getAttribute('srcset')
    expect(srcset).toContain('200w')
    expect(srcset).toContain('400w')
    expect(srcset).toContain('800w')
  })

  it('uses custom sizes attribute when provided', () => {
    const { container } = render(
      <ResponsiveImage
        src="https://example.com/test.jpg"
        alt="Test"
        width={400}
        height={400}
        customSizes="100vw"
      />,
    )

    const avifSource = container.querySelector('source[type="image/avif"]')
    expect(avifSource).toHaveAttribute('sizes', '100vw')
  })

  it('generates default sizes for productPage type', () => {
    const { container } = render(
      <ResponsiveImage
        src="https://example.com/test.jpg"
        alt="Test"
        width={400}
        height={400}
        imageType="productPage"
      />,
    )

    const avifSource = container.querySelector('source[type="image/avif"]')
    expect(avifSource).toHaveAttribute('sizes')
  })

  it('generates default sizes for dealCard type', () => {
    const { container } = render(
      <ResponsiveImage
        src="https://example.com/test.jpg"
        alt="Test"
        width={400}
        height={400}
        imageType="dealCard"
      />,
    )

    const avifSource = container.querySelector('source[type="image/avif"]')
    expect(avifSource?.getAttribute('sizes')).toContain('50vw')
  })

  it('applies custom className', () => {
    const { container } = render(
      <ResponsiveImage
        src="/test.jpg"
        alt="Test"
        width={400}
        height={400}
        className="rounded-lg"
      />,
    )

    const img = container.querySelector('img')
    expect(img).toHaveClass('rounded-lg')
  })

  it('forwards additional props to Image component', () => {
    render(
      <ResponsiveImage src="/test.jpg" alt="Test" width={400} height={400} priority quality={90} />,
    )

    const img = screen.getByAltText('Test')
    // Next 16 preloads a priority image through the document head instead of
    // stamping fetchpriority on the tag; what stays observable is that the
    // image is not deferred.
    expect(img).not.toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('decoding', 'async')
  })

  it('uses dealCard widths for dealCard type', () => {
    const { container } = render(
      <ResponsiveImage
        src="https://example.com/test.jpg"
        alt="Test"
        width={400}
        height={400}
        imageType="dealCard"
      />,
    )

    const avifSource = container.querySelector('source[type="image/avif"]')
    const srcset = avifSource?.getAttribute('srcset')
    // dealCard widths: [256, 288, 384]
    expect(srcset).toContain('256w')
    expect(srcset).toContain('288w')
    expect(srcset).toContain('384w')
  })

  it('uses gallery widths for gallery type', () => {
    const { container } = render(
      <ResponsiveImage
        src="https://example.com/test.jpg"
        alt="Test"
        width={400}
        height={400}
        imageType="gallery"
      />,
    )

    const avifSource = container.querySelector('source[type="image/avif"]')
    const srcset = avifSource?.getAttribute('srcset')
    // gallery widths: [300, 600, 1200]
    expect(srcset).toContain('300w')
    expect(srcset).toContain('600w')
    expect(srcset).toContain('1200w')
  })
})
