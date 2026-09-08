import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ImageResponse } from 'next/og'

/**
 * Heebo, as bytes, for Satori.
 *
 * THIS IS NOT AN OPTIMISATION AND IT IS NOT OPTIONAL. Satori has no system
 * fonts. An `ImageResponse` rendered without an explicit face still returns a
 * valid 1200x630 PNG with `200 OK`; it is simply blank where every Hebrew glyph
 * should have been. Nothing in the build, the type-check or the test suite
 * notices, and the only person who ever sees the result is the recipient of
 * somebody else's share. `src/app/og-fonts.test.ts` guards the files
 * themselves; this module is why there is one loader instead of three copies of
 * the same two `readFile` calls.
 *
 * TTF, NOT WOFF2. Satori cannot read woff2, and woff2 is the only form
 * `next/font` leaves in `.next`, so the faces are vendored under
 * `src/assets/fonts`, subset by Google Fonts to Hebrew + Latin, 44KB a weight.
 *
 * Memoised as a PROMISE rather than as a result: two cards rendering at once on
 * a warm lambda would otherwise each start their own pair of reads.
 */

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts')

/**
 * Derived from the constructor rather than imported from
 * `next/dist/compiled/@vercel/og/types`. `next/og` re-exports exactly one name
 * (the class), so the options type has to come off it, and reaching into
 * `dist/compiled` for the other half is a path that changes with a patch
 * release.
 */
type OgOptions = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>

export type OgFonts = NonNullable<OgOptions['fonts']>

let cached: Promise<OgFonts> | null = null

async function load(): Promise<OgFonts> {
  const [regular, bold] = await Promise.all([
    readFile(path.join(FONT_DIR, 'Heebo-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'Heebo-Bold.ttf')),
  ])
  return [
    { name: 'Heebo', data: regular, weight: 400, style: 'normal' },
    { name: 'Heebo', data: bold, weight: 700, style: 'normal' },
  ]
}

export function heebo(): Promise<OgFonts> {
  cached ??= load().catch((error) => {
    // Cleared on failure. A transient read error must not poison the module for
    // the life of the instance. That would turn one bad read into every card
    // on that lambda rendering empty until it is recycled.
    cached = null
    throw error
  })
  return cached
}
