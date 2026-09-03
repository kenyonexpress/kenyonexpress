import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Source-level guards for the two ways this route can break WITHOUT failing a
 * build, a type-check or any other test.
 *
 * The same shape as `src/app/og-fonts.test.ts` next door, and for the same
 * reason: both failures produce a valid 1200x630 PNG with a 200 in front of it,
 * and the only person who sees the result is the recipient of somebody else's
 * share.
 */

const HERE = resolve(__dirname)
const APP = resolve(__dirname, '..', '..')

const read = (path: string) => readFileSync(path, 'utf8')

describe('the /api/og route', () => {
  it('hands Satori an explicit font, which is the difference between Hebrew and nothing', () => {
    // Satori has NO system fonts. An ImageResponse without a `fonts` option
    // renders every Hebrew glyph as empty and still answers 200 with a valid
    // PNG. `og-fonts.test.ts` pins the same rule on the two file-convention
    // cards; this route is the third generator and needs it just as much.
    const src = read(resolve(HERE, 'route.tsx'))
    expect(src).toContain('fonts')
    expect(read(resolve(HERE, 'fonts.ts'))).toContain('Heebo-Regular.ttf')
    expect(read(resolve(HERE, 'fonts.ts'))).toContain('Heebo-Bold.ttf')
  })

  it('never declares a runtime, which this app cannot compile', () => {
    // MEASURED on the first `next build`: with `cacheComponents` enabled,
    // `export const runtime = 'nodejs'` fails the build outright - "Route
    // segment config \"runtime\" is not compatible with
    // nextConfig.cacheComponents". Node is the default and is what the route
    // needs (node:fs for the faces, sharp for the WebP and AVIF this catalogue
    // is made of), so the correct declaration is none at all.
    // Anchored to the start of a line: the paragraph in `route.tsx` explaining
    // this rule quotes the very export it forbids, and a test its own
    // explanation trips is a test that gets deleted. Same dodge as the comment
    // strip in `og-fonts.test.ts`.
    expect(read(resolve(HERE, 'route.tsx'))).not.toMatch(/^export const runtime/m)
  })

  it('does not install a second copy of @vercel/og', () => {
    // `next/og` IS @vercel/og: next/og.js re-exports dist/server/og/image-response,
    // whose ImageResponse is declared over next/dist/compiled/@vercel/og. A
    // separate install would put a second satori and a second resvg - megabytes
    // of wasm - into the bundle on a version nothing pins against next's.
    const pkg = JSON.parse(read(resolve(process.cwd(), 'package.json')))
    expect(pkg.dependencies['@vercel/og']).toBeUndefined()
    expect(pkg.devDependencies['@vercel/og']).toBeUndefined()
    expect(read(resolve(HERE, 'route.tsx'))).toContain("from 'next/og'")
  })
})

/**
 * Every page that claims an `og:image` from this route builds the URL with
 * `ogImageUrl`/`ogImage` rather than by hand.
 *
 * A hand-written `/api/og?t=cetegory&slug=x` is not an error anywhere:
 * `parseOgRequest` answers the default card, on purpose, because a 400 renders
 * as a broken image beside a live link. That deliberate leniency is exactly
 * what makes a typo here invisible, so the typo is prevented instead of caught.
 */
describe('the pages wired to it', () => {
  const WIRED = [
    '(store)/category/[slug]/page.tsx',
    '(main)/coupons/[id]/page.tsx',
    '(main)/coupons/page.tsx',
    '(store)/products/page.tsx',
  ]

  it.each(WIRED)('%s builds its og:image through the helper', (file) => {
    const src = read(resolve(APP, file))
    expect(src).toContain("from '@/app/api/og/url'")
    expect(src).toContain('ogImage(')
  })

  it.each(WIRED)('%s never writes the query string itself', (file) => {
    const src = read(resolve(APP, file))
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n')
    expect(src).not.toMatch(/['"`]\/api\/og\?/)
  })
})
