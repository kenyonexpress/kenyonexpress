import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getCategoryBySlug, getCategoryProducts } from '@/lib/category-page'
import { SITE } from '@/styles/tokens'
import { ImageResponse } from 'next/og'

/**
 * The 1200x630 card a shared CATEGORY renders as in WhatsApp, Facebook and iMessage.
 *
 * Same reasoning as the product card beside `product/[slug]`, and the same two
 * traps. Restated rather than cross-referenced, because both are silent:
 *
 * SATORI HAS NO SYSTEM FONTS. Without an explicit face every Hebrew glyph
 * renders as an empty box or vanishes, and the build stays green because a
 * valid PNG is still produced. Heebo is vendored as TTF next to this file's
 * sibling; woff2, which is all `next/font` leaves in `.next`, Satori cannot
 * read.
 *
 * THERE IS NO CASCADE AND NO TEXT-OVERFLOW. Every element needs an explicit
 * `display: flex`, and text that does not fit is drawn past the edge and
 * cropped by the PNG boundary with nothing to indicate it. Category names are
 * short (the longest of the twelve live rows is 18 characters), so this clips
 * at a length measured against the type size below rather than trusting them.
 *
 * WHY THE COUNT IS ON THE CARD. A category share with no number is a link to
 * "מסעדות", which says nothing a person would tap. `getCategoryProducts` is
 * the same `use cache` read the page itself makes with the same key, so the
 * number here is the number the page will show and it costs no extra query.
 */

export const alt = 'קטגוריה בקניון אקספרס'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts')

/** Measured at 96px: 22 characters is the widest line that stays inside the padding. */
const TITLE_MAX = 22

async function heebo(): Promise<{ regular: Buffer; bold: Buffer }> {
  const [regular, bold] = await Promise.all([
    readFile(path.join(FONT_DIR, 'Heebo-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'Heebo-Bold.ttf')),
  ])
  return { regular, bold }
}

function clip(text: string, max: number): string {
  const trimmed = text.trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`
}

/**
 * The subtitle, which never invents a number.
 *
 * Zero products is a real state - a category can be emptied from the admin
 * without being deactivated - and "0 דילים" on a share card is worse than the
 * generic line, so that case falls back to the site's own description.
 */
function subtitle(total: number): string {
  if (total <= 0) return 'קופונים, דילים ומבצעים'
  if (total === 1) return 'דיל אחד בקטגוריה'
  return `${total} דילים בקטגוריה`
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)

  const [category, fonts] = await Promise.all([getCategoryBySlug(slug), heebo()])

  // A category that no longer exists still gets a card. The link is being
  // shared right now, and a broken image preview beside it reads as a broken
  // site rather than as a category that moved.
  const total = category
    ? (
        await getCategoryProducts({
          categoryId: category.id,
          category: { name_he: category.name_he, slug: category.slug },
          sort: 'menu_order',
          page: 1,
        })
      ).total
    : 0

  const title = clip(category?.name_he ?? 'קניון אקספרס', TITLE_MAX)

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        // The masthead yellow, the live-verified brand colour, so a category
        // share and a product share are recognisably the same site.
        backgroundColor: SITE.brand.primary,
        padding: '64px 72px',
        fontFamily: 'Heebo',
        // Satori honours this, and without it a Hebrew line renders left-aligned
        // with its punctuation at the wrong end.
        direction: 'rtl',
      }}
    >
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: SITE.brand.dark }}>
        קניון אקספרס
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 96,
            fontWeight: 700,
            color: SITE.brand.dark,
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 40,
            color: SITE.functional.heading,
            marginTop: 12,
          }}
        >
          {subtitle(total)}
        </div>
      </div>

      <div style={{ display: 'flex', fontSize: 28, color: SITE.neutral.muted }}>
        kenyonexpress.co.il
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Heebo', data: fonts.regular, weight: 400, style: 'normal' },
        { name: 'Heebo', data: fonts.bold, weight: 700, style: 'normal' },
      ],
    },
  )
}
