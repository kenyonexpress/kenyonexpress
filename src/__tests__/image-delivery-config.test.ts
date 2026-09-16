import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The image delivery contract in next.config.ts, asserted as text.
 *
 * ARCHITECTURE-PERFORMANCE-SEO.md section 4.2 fixes three things about how
 * Vercel Image Optimization serves this catalogue: AVIF first with WebP as
 * the fallback, a 31-day CDN TTL for optimized images, and the quality rungs
 * the components are allowed to ask for. None of them fails a build or a
 * type-check when missing; Next 16's defaults (WebP only, 4 hours) simply
 * take over and the difference is a Vercel bill and a slower repeat visit.
 */

const config = readFileSync(resolve(__dirname, '../../next.config.ts'), 'utf8')

/** The `images: { ... }` block, so assertions cannot match a comment elsewhere. */
function imagesBlock(): string {
  const start = config.indexOf('\n  images: {')
  expect(start, 'images block present').toBeGreaterThan(0)
  const end = config.indexOf('\n  },', start)
  return config.slice(start, end)
}

describe('next.config images', () => {
  it('serves AVIF first and WebP as the fallback', () => {
    expect(imagesBlock()).toMatch(/formats:\s*\['image\/avif',\s*'image\/webp'\]/)
  })

  it('keeps optimized images at the edge for 31 days', () => {
    // 2678400 = 31 * 24 * 60 * 60. Product photos change by changing their
    // path (section 4.2 rule 5), so a long TTL costs nothing in freshness.
    expect(imagesBlock()).toMatch(/minimumCacheTTL:\s*2678400\b/)
  })

  it('allows the quality rungs the components use and no wildcard', () => {
    const block = imagesBlock()
    expect(block).toMatch(/qualities:\s*\[50, 60, 75, 90, 95\]/)
    expect(block).not.toMatch(/qualities:\s*undefined/)
  })

  it('builds remotePatterns from the single host list', () => {
    expect(imagesBlock()).toContain('remotePatterns: [...REMOTE_IMAGE_PATTERNS]')
  })
})
