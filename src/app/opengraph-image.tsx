import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { visualOrder } from '@/lib/og/bidi'
import { SITE } from '@/styles/tokens'
import { ImageResponse } from 'next/og'

/**
 * The card the site itself renders as when a link to the home page is shared.
 *
 * It had none. The root layout declares `twitter.card: 'summary_large_image'`,
 * and a large-image card with no image is a blank grey rectangle with the title
 * underneath — worse than the small card it would otherwise have got.
 *
 * Same font constraint as the product card next door: Satori has no system
 * fonts, and without an explicit TTF every Hebrew glyph renders empty while the
 * build stays green.
 */

export const alt = 'קניון אקספרס — קופונים ומבצעים'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts')

export default async function Image() {
  const [regular, bold] = await Promise.all([
    readFile(path.join(FONT_DIR, 'Heebo-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'Heebo-Bold.ttf')),
  ])

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: SITE.brand.primary,
        fontFamily: 'Heebo',
        direction: 'rtl',
      }}
    >
      <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, color: SITE.brand.dark }}>
        {visualOrder('קניון אקספרס')}
      </div>
      <div style={{ display: 'flex', fontSize: 40, color: SITE.functional.heading, marginTop: 16 }}>
        {/* Every Hebrew string on this card goes through `visualOrder`.
            MEASURED 2026-09-09 by fetching this PNG: the line above rendered
            "סרפסקא ןוינק" and this one rendered backwards too. Satori has no
            bidi algorithm, and the `direction: 'rtl'` above is a FLEXBOX
            property: it reorders boxes and does nothing to glyphs. */}
        {visualOrder('קופונים ומבצעים במחיר הכי טוב')}
      </div>
      <div style={{ display: 'flex', fontSize: 30, color: SITE.neutral.muted, marginTop: 48 }}>
        kenyonexpress.co.il
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Heebo', data: regular, weight: 400, style: 'normal' },
        { name: 'Heebo', data: bold, weight: 700, style: 'normal' },
      ],
    },
  )
}
