import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The root layout's `twitter` metadata must carry the card type and nothing
 * else.
 *
 * A title written there is inherited by every segment that sets `openGraph`
 * without also setting `twitter`, which is every category and product page.
 * Measured 2026-10-05 (W12) on the built HTML: those pages carried their own
 * og:title and the HOME page's twitter:title. Without a title here, Next fills
 * twitter from the resolved openGraph, so the two always agree.
 *
 * Pinned on the source because the layout cannot be imported under vitest
 * (next/font/google is a build-time transform).
 */
describe('root layout twitter metadata', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/app/layout.tsx'), 'utf8')
  const block = source.match(/twitter:\s*\{([^}]*)\}/)?.[1] ?? ''

  it('declares the card type', () => {
    expect(block).toMatch(/card:\s*'summary_large_image'/)
  })

  it('declares no title or description, so each page inherits its own openGraph', () => {
    expect(block).not.toMatch(/\btitle\s*:/)
    expect(block).not.toMatch(/\bdescription\s*:/)
  })
})
