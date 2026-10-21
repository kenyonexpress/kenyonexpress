import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { BRAND_DISPLAY_NAME, BRAND_DISPLAY_PARTS, BRAND_TAGLINE } from '@/lib/brand'
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

export const alt = `${BRAND_DISPLAY_NAME} — ${BRAND_TAGLINE}`
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
      {/* Two runs as two flex children, not one string: Satori has no bidi
          pass, and a mixed Hebrew+Latin string would be placed by glyph
          order. In a `direction: rtl` row the first child sits on the right,
          which is where the Hebrew word belongs. */}
      <div
        style={{
          display: 'flex',
          gap: 28,
          fontSize: 96,
          fontWeight: 700,
          color: SITE.brand.dark,
        }}
      >
        {BRAND_DISPLAY_PARTS.map((part) => (
          <span key={part} style={{ display: 'flex' }}>
            {part}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', fontSize: 40, color: SITE.functional.heading, marginTop: 16 }}>
        {/* No comma. Satori has no bidi algorithm, so a neutral character
            between two Hebrew runs is placed by glyph order rather than by
            direction and lands on the wrong side of the word. Measured on the
            first render of this card. */}
        קופונים ומבצעים במחיר הכי טוב
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
