import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getCategoryBySlug, getCategoryIndex } from '@/lib/category-page'
import { categoryAncestors } from '@/lib/category-tree'
import { visualOrder } from '@/lib/og/bidi'
import { SITE } from '@/styles/tokens'
import { ImageResponse } from 'next/og'

/**
 * The card a shared CATEGORY link renders as.
 *
 * It had none. `/product/[slug]` has had a generated card since the product
 * photo turned out to be a 600x600 square that WhatsApp crops to a thumbnail,
 * and `app/opengraph-image.tsx` gives the home page one -- so a category link
 * fell back to the ROOT card, which says "קניון אקספרס / קופונים ומבצעים במחיר
 * הכי טוב" no matter which of the twelve categories was shared. The link text
 * beneath it says one thing and the picture above it says another.
 *
 * A category has no photo and no price, so the card is made of the two things a
 * category page actually knows: its name, and where it sits in the tree. The
 * trail is what a second and third level are FOR -- "צימרים ← צימרים בצפון"
 * tells a recipient something that "צימרים בצפון" alone does not -- and it is
 * drawn from `categoryAncestors`, the same walk the breadcrumb and the
 * BreadcrumbList use, so the card cannot claim a different place in the
 * catalogue than the page does.
 *
 * SATORI CONSTRAINTS, the same three that decide the product card's markup:
 * every element needs an explicit `display: flex`; there is no `text-overflow`,
 * so text that does not fit is drawn past the edge and silently cropped by the
 * PNG boundary; and there are NO system fonts, so without an explicit TTF every
 * Hebrew glyph renders empty while the build stays green and a valid PNG is
 * still produced. The clip below is therefore in characters.
 */

export const alt = 'קטגוריה בקניון אקספרס'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts')

/**
 * The longest a name may be before it is cut.
 *
 * At 64px in Heebo, 1200px minus 72px of padding either side holds roughly 26
 * Hebrew characters on one line. Two lines is the budget, so 52, and the
 * ellipsis is drawn rather than relied on because Satori has no `text-overflow`
 * and would otherwise render the tail off the canvas with nothing to show for
 * it.
 */
function clip(value: string, max: number): string {
  const text = value.trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)

  const [category, regular, bold] = await Promise.all([
    getCategoryBySlug(slug),
    readFile(path.join(FONT_DIR, 'Heebo-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'Heebo-Bold.ttf')),
  ])

  // A slug nobody has still gets a card. The page will 404, but the link is
  // being shared right now and a broken image preview reads as a broken site.
  const title = category ? clip(category.name_he, 52) : 'קניון אקספרס'

  const trail = category
    ? categoryAncestors(await getCategoryIndex(), category.id).map((node) => node.name_he)
    : []

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: SITE.brand.primary,
        padding: '64px 72px',
        fontFamily: 'Heebo',
        // A FLEXBOX property here, and only that. It reverses the order of
        // boxes in a row; it does not reorder glyphs, because Satori has no
        // bidi algorithm. Believing otherwise is why every Hebrew string on
        // these cards rendered backwards until 2026-09-09. `visualOrder` is
        // what makes the text readable; this is what puts the boxes on the
        // correct side.
        direction: 'rtl',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: SITE.brand.dark }}>
          {visualOrder('קניון אקספרס')}
        </div>
        {trail.length > 0 && (
          <div
            style={{ display: 'flex', fontSize: 28, color: SITE.functional.heading, marginTop: 8 }}
          >
            {/* No `>` or `/` between the names. Satori has no bidi algorithm,
                so a neutral character between two Hebrew runs is placed by
                glyph order rather than by direction and lands on the wrong
                side of the word -- the same measurement that took the comma out
                of the root card. `←` is not neutral. */}
            {visualOrder(trail.join(' ← '))}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          fontSize: 64,
          fontWeight: 700,
          color: SITE.brand.dark,
          lineHeight: 1.15,
        }}
      >
        {visualOrder(title)}
      </div>

      <div style={{ display: 'flex', fontSize: 30, color: SITE.functional.heading }}>
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
