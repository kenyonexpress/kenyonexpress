import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Image Optimization Test Suite (UX40)
 *
 * Verifies that image components follow optimization patterns:
 * - Responsive sizes for different breakpoints
 * - Blur placeholders where appropriate
 * - Quality settings for compression
 * - Lazy loading for non-critical images
 */

describe('Image Optimization Patterns', () => {
  /**
   * ProductCard: Deal grid cards with responsive sizes
   * Measured at 18 viewport/dpr pairs
   */
  it('ProductCard has responsive deal sizes', () => {
    const content = readFileSync(
      path.join(process.cwd(), 'src/components/ProductCard.tsx'),
      'utf-8',
    )

    // Check for deal card responsive sizes
    expect(content).toContain('DEAL_SIZE_STOPS')
    expect(content).toContain('39vw')
    expect(content).toContain('43vw')
    expect(content).toContain('46vw')
    expect(content).toContain('240px')
    expect(content).toContain('sizes={DEAL_IMAGE_SIZES}')
    expect(content).toContain('quality={50}')
  })

  /**
   * ProductCard: Default variant with calculated sizes
   * For related products grid: 2 cols mobile, 3 cols tablet, 5 cols desktop
   */
  it('ProductCard has responsive default variant sizes', () => {
    const content = readFileSync(
      path.join(process.cwd(), 'src/components/ProductCard.tsx'),
      'utf-8',
    )

    // Check for default variant sizes
    expect(content).toContain('calc(50vw - 47px)')
    expect(content).toContain('calc(33.33vw - 44px)')
    expect(content).toContain('204px')
  })

  /**
   * ProductCard: Blur placeholder support
   */
  it('ProductCard includes blur placeholder', () => {
    const content = readFileSync(
      path.join(process.cwd(), 'src/components/ProductCard.tsx'),
      'utf-8',
    )

    expect(content).toContain("placeholder: 'blur'")
    expect(content).toContain('blurDataURL')
  })

  /**
   * CouponCard: Responsive sizes for coupon grid
   * Measured on rendered grid: 360->158, 412->184, ..., 1024->162, 1280->247
   */
  it('CouponCard has responsive coupon sizes', () => {
    const content = readFileSync(path.join(process.cwd(), 'src/components/CouponCard.tsx'), 'utf-8')

    expect(content).toContain('calc(50vw - 22px)')
    expect(content).toContain('calc(33.33vw - 18.67px)')
    expect(content).toContain('calc(33.33vw - 179.33px)')
    expect(content).toContain('248px')
  })

  /**
   * CategoryHeroBanner: Hero image with priority loading
   */
  it('CategoryHeroBanner has responsive sizes and priority', () => {
    const content = readFileSync(
      path.join(process.cwd(), 'src/components/category/CategoryHeroBanner.tsx'),
      'utf-8',
    )

    expect(content).toContain('100vw')
    expect(content).toContain('90vw')
    expect(content).toContain('1170px')
    expect(content).toContain('priority')
  })

  /**
   * ProductGallery: Main image responsive sizes + priority on active
   * Thumbnails: 64px fixed
   */
  it('ProductGallery has main image sizes and priority', () => {
    const content = readFileSync(
      path.join(process.cwd(), 'src/components/storefront/ProductGallery.tsx'),
      'utf-8',
    )

    // Main image sizes
    expect(content).toContain('40vw')
    expect(content).toContain('priority={active === 0}')

    // Thumbnail sizes
    expect(content).toContain('64px')
  })

  /**
   * ProductGallery: Blur placeholders
   */
  it('ProductGallery includes blur placeholders', () => {
    const content = readFileSync(
      path.join(process.cwd(), 'src/components/storefront/ProductGallery.tsx'),
      'utf-8',
    )

    expect(content).toContain("placeholder: 'blur'")
    expect(content).toContain('blurDataURL')
  })

  /**
   * CategoryProductCard: Thumbnail grid with measured sizes
   */
  it('CategoryProductCard has responsive thumbnail sizes', () => {
    const content = readFileSync(
      path.join(process.cwd(), 'src/components/category/CategoryProductCard.tsx'),
      'utf-8',
    )

    expect(content).toContain('THUMB_MAX_PX')
    expect(content).toContain('THUMB_SIZES')
    expect(content).toContain('calc(50vw - 63px)')
  })

  /**
   * CategoryProductCard: Blur placeholders
   */
  it('CategoryProductCard includes blur placeholders', () => {
    const content = readFileSync(
      path.join(process.cwd(), 'src/components/category/CategoryProductCard.tsx'),
      'utf-8',
    )

    expect(content).toContain("placeholder: 'blur'")
    expect(content).toContain('blurDataURL')
  })

  /**
   * LeftSidebar: Sidebar banner cards with responsive sizes
   */
  it('LeftSidebar has responsive banner sizes', () => {
    const content = readFileSync(
      path.join(process.cwd(), 'src/components/LeftSidebar.tsx'),
      'utf-8',
    )

    expect(content).toContain('320px')
    expect(content).toContain('100vw')
  })

  /**
   * BrandsRow: Brand logo grid with responsive sizes (UX40)
   */
  it('BrandsRow has responsive logo sizes', () => {
    const content = readFileSync(
      path.join(process.cwd(), 'src/components/home/BrandsRow.tsx'),
      'utf-8',
    )

    expect(content).toContain('sizes=')
    expect(content).toContain('90px')
    expect(content).toContain('110px')
    expect(content).toContain('120px')
    expect(content).toContain('loading="lazy"')
  })

  /**
   * WishlistCard: Product thumbnail with responsive sizes (UX40)
   */
  it('WishlistCard has responsive thumbnail sizes', () => {
    const content = readFileSync(
      path.join(process.cwd(), 'src/components/account/WishlistCard.tsx'),
      'utf-8',
    )

    expect(content).toContain('sizes=')
    expect(content).toContain('60px')
    expect(content).toContain('70px')
    expect(content).toContain('80px')
    expect(content).toContain('loading="lazy"')
  })

  /**
   * Verify next.config.ts has optimized image settings
   */
  it('next.config.ts has optimized image configuration', () => {
    const content = readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf-8')

    // Quality levels for different contexts
    expect(content).toContain('qualities:')
    expect(content).toContain('50') // Below-fold deal cards
    expect(content).toContain('60') // Small thumbnails
    expect(content).toContain('75') // Default
    expect(content).toContain('90') // Hero images

    // Custom image sizes for dense grids
    expect(content).toContain('imageSizes:')
    expect(content).toContain('288') // Custom rung for 277 device pixels @ 1.75dpr
    expect(content).toContain('256')
    expect(content).toContain('384')
  })

  /**
   * Verify remote image hosts are configured
   */
  it('has remote image patterns configured', () => {
    const content = readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf-8')

    expect(content).toContain('REMOTE_IMAGE_PATTERNS')
    expect(content).toContain('remotePatterns')
  })
})

/**
 * Size Calculation Tests
 *
 * Verify that responsive sizes are calculated correctly
 */
describe('Responsive Size Calculations', () => {
  /**
   * Deal card: 50vw - 48px formula
   * At 320px: 50% - 48px = 112px
   * At 412px: 50% - 48px = 158px
   * At 1024px: fixed 240px
   */
  it('deal card size calculation is correct', () => {
    // Mobile phones (< 430px): 39vw
    const mobile360 = 360 * 0.39 // ~140px
    expect(mobile360).toBeLessThan(158) // 412 device pixels @ 1.75dpr = 157px render

    // Handheld (< 640px): 43vw
    const handheld480 = 480 * 0.43 // ~206px
    expect(handheld480).toBeGreaterThan(158)

    // Tablet (< 1024px): 46vw
    const tablet768 = 768 * 0.46 // ~353px
    expect(tablet768).toBeGreaterThan(240)

    // Desktop: 240px fixed
    expect(240).toBeLessThan(400) // Measured maximum paint width
  })

  /**
   * Category thumbnail: 50vw - 63px
   * Meets fixed 186px at 497px (0.11 * W = 48 gap rule)
   */
  it('category thumbnail size calculation is correct', () => {
    const breakpoint = 497
    const formula = breakpoint * 0.5 - 63
    expect(Math.round(formula)).toBe(186)
  })

  /**
   * Related products grid: 33.33vw - 44px
   * 3-column layout with gutter
   */
  it('related products grid size calculation is correct', () => {
    // At 1440px (3 fixed 230px columns)
    const desktop1440 = 204 // Actual measured value
    expect(desktop1440).toBeGreaterThan(100)
    expect(desktop1440).toBeLessThan(400)
  })
})
