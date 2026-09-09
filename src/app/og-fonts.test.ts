import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The guard for the failure mode `next/og` has that nothing else catches.
 *
 * Satori has NO system fonts. If these files go missing — a `.gitignore` rule
 * that swallows `*.ttf`, a deploy that prunes `src/assets`, someone tidying up
 * what looks like a stray binary — every Hebrew glyph on every Open Graph card
 * renders as nothing, the route still answers 200 with a valid PNG, the build
 * stays green, and the only person who ever sees the result is the recipient of
 * somebody else's share.
 *
 * So the assertions are on the bytes: present, non-trivial, and actually
 * TrueType. A zero-byte or LFS-pointer file passes an existence check and fails
 * on the phone.
 */

const FONTS = ['Heebo-Regular.ttf', 'Heebo-Bold.ttf']
const DIR = resolve(__dirname, '..', 'assets', 'fonts')

describe('the Open Graph fonts', () => {
  it.each(FONTS)('%s exists and is not empty', (name) => {
    expect(statSync(resolve(DIR, name)).size).toBeGreaterThan(10_000)
  })

  it.each(FONTS)('%s is really a TrueType file, not a pointer or an HTML error page', (name) => {
    // `sfnt` version 1.0: the first four bytes of every TTF. A Git LFS pointer
    // or a fetched error page would be text and pass a size check.
    const header = readFileSync(resolve(DIR, name)).subarray(0, 4)
    expect([...header]).toEqual([0x00, 0x01, 0x00, 0x00])
  })

  it.each([
    '(store)/product/[slug]/opengraph-image.tsx',
    '(store)/category/[slug]/opengraph-image.tsx',
    'opengraph-image.tsx',
  ])('%s declares the fonts explicitly', (file) => {
    // Satori silently drops glyphs it has no face for. An ImageResponse
    // without a `fonts` option is the exact shape of that failure.
    const src = readFileSync(resolve(__dirname, file), 'utf8')
    expect(src).toContain('Heebo-Regular.ttf')
    expect(src).toContain('Heebo-Bold.ttf')
    expect(src).toContain('fonts:')
  })
})

describe('the product page does not claim og:image itself', () => {
  it('leaves the field to the file convention', () => {
    // MEASURED: with `openGraph.images` set in `generateMetadata`, the served
    // page carried the product photo and `opengraph-image.tsx` was never used.
    // Next only fills the field when metadata has not already claimed it, so
    // the generated card built, appeared in the route list, and reached nothing.
    const src = readFileSync(resolve(__dirname, '(store)/product/[slug]/page.tsx'), 'utf8')
    const metadata = src
      .slice(src.indexOf('generateMetadata'), src.indexOf('generateStaticParams'))
      .split('\n')
      // Comments are stripped: the paragraph explaining this rule quotes the
      // very expression it forbids, and a test that its own explanation trips
      // is a test that gets deleted.
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
    expect(metadata).not.toContain('images:')
  })
})

/**
 * THE SECOND SILENT FAILURE ON THIS SURFACE, and the one the font check could
 * never see.
 *
 * MEASURED 2026-09-09 by fetching the PNGs: all three cards rendered every
 * Hebrew word backwards. `next/og` draws through Satori, which lays glyphs out
 * in logical order left to right and implements no bidi algorithm, and the
 * `direction: 'rtl'` each card sets is a FLEXBOX property: it reorders boxes,
 * not glyphs.
 *
 * The two failures are siblings and they fail the same way: route 200, valid
 * PNG, green build, unreadable card, seen only by the recipient of somebody
 * else's share. A missing font gives empty boxes; a present font gives every
 * glyph correct and in the wrong order, which is arguably worse because it
 * looks deliberate.
 *
 * `lib/og/bidi.test.ts` proves the reordering. This proves it is APPLIED, on
 * every card, which is the half a pure unit test cannot reach.
 */
describe('every Open Graph card runs its Hebrew through the bidi pass', () => {
  const CARDS = [
    '(store)/product/[slug]/opengraph-image.tsx',
    '(store)/category/[slug]/opengraph-image.tsx',
    'opengraph-image.tsx',
  ]

  it.each(CARDS)('%s imports visualOrder', (file) => {
    expect(readFileSync(resolve(__dirname, file), 'utf8')).toContain(
      "import { visualOrder } from '@/lib/og/bidi'",
    )
  })

  it.each(CARDS)('%s leaves no bare Hebrew string in the JSX', (file) => {
    const src = readFileSync(resolve(__dirname, file), 'utf8')
    // A Hebrew literal sitting between `>` and `<` is text Satori will draw as
    // it stands, which is backwards. Inside `visualOrder('...')` it is a call
    // argument and matches neither side of this.
    const bare = src.match(/>\s*[֐-׿][^<{]*</g) ?? []
    expect(bare, `bare Hebrew JSX text in ${file}: ${bare.join(' | ')}`).toEqual([])
  })
})
