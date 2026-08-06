import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildOgCard } from '@/lib/og/product-card'
import { loadProductBySlug } from '@/lib/product-detail'
import { SITE } from '@/styles/tokens'
import { ImageResponse } from 'next/og'

/**
 * The 1200x630 card a shared product renders as in WhatsApp, Facebook and iMessage.
 *
 * WHY THIS EXISTS WHEN THE PAGE ALREADY SETS `openGraph.images`
 *
 * It set the product's own first photo, which is a 600x600 square. WhatsApp
 * crops a non-2:1 image to a small thumbnail beside the link, so the share
 * showed a fragment of a plate of food and no price at all — and the price is
 * the whole reason anyone forwards a deal.
 *
 * WHAT SATORI CANNOT DO, WHICH DECIDES THE MARKUP
 *
 * `next/og` renders through Satori, not a browser. There is no `text-overflow`,
 * no line clamp, no `position: static`, and no cascade: every element needs an
 * explicit `display: flex`, and text that does not fit is drawn past the edge
 * and cropped by the PNG boundary with nothing to indicate it. So the clipping
 * is done in `buildOgCard` in characters, and every number on this card is
 * decided there too — a wrong one here is a PNG that has to be looked at, on
 * the one surface nobody who ships it ever sees.
 *
 * FONTS ARE NOT OPTIONAL AND FAIL SILENTLY. Satori has no system fonts. Without
 * an explicit face every Hebrew glyph renders as an empty box or vanishes, and
 * the build stays green because a valid PNG is still produced. Heebo is vendored
 * as TTF (Satori cannot read woff2, which is the only form `next/font` leaves in
 * `.next`), subset by Google Fonts to Hebrew + Latin at 44KB per weight.
 */

export const alt = 'דיל בקניון אקספרס'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const FONT_DIR = path.join(process.cwd(), 'src', 'assets', 'fonts')

async function heebo(): Promise<{ regular: Buffer; bold: Buffer }> {
  const [regular, bold] = await Promise.all([
    readFile(path.join(FONT_DIR, 'Heebo-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'Heebo-Bold.ttf')),
  ])
  return { regular, bold }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const data = await loadProductBySlug(slug)
  const fonts = await heebo()

  // A missing product still gets a card. The link may be stale but it is being
  // shared right now, and a broken image preview beside it reads as a broken
  // site rather than as a product that moved.
  const card = data
    ? buildOgCard({
        name: data.product.name_he ?? 'דיל',
        supplierName: data.supplier?.name ?? null,
        priceIls: Number(data.product.kenyon_price ?? 0) || null,
        offer: data.couponOffer,
      })
    : buildOgCard({ name: 'קניון אקספרס', supplierName: null, priceIls: null, offer: null })

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        // The masthead yellow, which is the live-verified brand colour. The
        // brief's red appears zero times in the reference file; see the note
        // above `CATALOG` in styles/tokens.ts for the measurement.
        backgroundColor: SITE.brand.primary,
        padding: '64px 72px',
        fontFamily: 'Heebo',
        // Satori honours this, and without it a Hebrew line renders left-aligned
        // with its punctuation at the wrong end.
        direction: 'rtl',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 34, fontWeight: 700, color: SITE.brand.dark }}>קניון אקספרס</div>
          {card.supplier && (
            <div style={{ fontSize: 28, color: SITE.functional.heading, marginTop: 6 }}>
              {card.supplier}
            </div>
          )}
        </div>
        {card.discountBadge && (
          <div
            style={{
              display: 'flex',
              backgroundColor: SITE.functional.saleBadge,
              color: SITE.surface.page,
              fontSize: 44,
              fontWeight: 700,
              padding: '10px 28px',
              borderRadius: 999,
            }}
          >
            {card.discountBadge}
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
        {card.title}
      </div>

      {/* The white panel is drawn only when there IS a price. MEASURED on a
          product whose `is_coupon_enabled` is set with no `coupon_price_ils`
          (4 of the 61 active rows): the card rendered an empty white slab with
          the domain floating in it, which reads as a broken image rather than
          as a product with no price. The page itself says
          "מחיר הקופון טרם הוגדר" and refuses to sell it, so the card saying
          nothing about money is right; the empty box was not. */}
      {card.price ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            backgroundColor: SITE.surface.page,
            borderRadius: 24,
            padding: '28px 36px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {card.priceLabel && (
              <div style={{ fontSize: 26, color: SITE.neutral.muted }}>{card.priceLabel}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
              <div style={{ fontSize: 76, fontWeight: 700, color: SITE.functional.price }}>
                {card.price}
              </div>
              {card.wasPrice && (
                <div
                  style={{
                    fontSize: 36,
                    color: SITE.functional.priceStrike,
                    textDecoration: 'line-through',
                  }}
                >
                  {card.wasPrice}
                </div>
              )}
            </div>
            {card.balance && (
              <div style={{ fontSize: 30, color: SITE.functional.heading, marginTop: 4 }}>
                {card.balance}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: SITE.neutral.muted }}>
            kenyonexpress.co.il
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', fontSize: 30, color: SITE.functional.heading }}>
          kenyonexpress.co.il
        </div>
      )}
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
