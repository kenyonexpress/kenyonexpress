import { SITE } from '@/styles/tokens'
import type { CategoryCard, Countdown, DealCard, OgCard } from './cards'
import type { ImageTile } from './image'

/**
 * The four cards, drawn.
 *
 * WHAT SATORI CANNOT DO, WHICH DECIDES EVERY LINE OF THIS FILE.
 *
 * `next/og` renders through Satori, not a browser. There is no cascade, no
 * `position: static`, no `text-overflow` and no line clamp; every element that
 * holds more than a text node needs an explicit `display: flex`; and text that
 * does not fit is drawn past the edge and cropped by the PNG boundary with
 * nothing to indicate it. Every string that could overrun was therefore already
 * clipped in `cards.ts` before it reached this file, and nothing here decides
 * what the card says, only where it sits.
 *
 * `direction: 'rtl'` DOES NOT LAY OUT A FLEX ROW. This was measured, against
 * next 16.2.12's bundled Satori, by rendering one row three ways: with no
 * direction, with `direction: 'rtl'`, and with `flexDirection: 'row-reverse'`.
 * The first two came out BYTE-IDENTICAL (first child on the left) and only
 * `row-reverse` moved it to the right. So every row on these cards that carries
 * reading order says `row-reverse`, and every text block that must start at the
 * right margin says `textAlign: 'right'`. A `direction: 'rtl'` on the root
 * would have looked like it was doing the work and been doing none of it.
 *
 * What Satori DOES get right is the bidi inside a text run: Hebrew is reordered
 * correctly, and a price like `₪40` keeps its digits in order and its sign on
 * the correct side. That is checked in the same render. What it still cannot be
 * trusted with is a neutral character BETWEEN two Hebrew runs, measured on the
 * home card, which is why that one carries no comma. No string this file
 * draws has one.
 *
 * LENGTHS ARE NUMBERS, NOT `'56px'`. Both work in Satori. Only one passes
 * `scripts/hardcoded-gate.mjs`, which fails a new file on any `\d+px` literal,
 * and the numbers read better beside `fontSize` anyway.
 *
 * COLOURS COME FROM `SITE`, always. `tokens.test.ts` walks every `.tsx` under
 * `src/` and fails on a raw hex; there is no exemption for a file nobody reads
 * in a browser.
 *
 * THE VERTICAL BUDGET IS 630 AND NOTHING ENFORCES IT. Satori draws past the
 * bottom of the canvas without complaint, so the first render of the product
 * card lost the whole price panel off the edge: the one element the card
 * exists for. The sizes below are what fits with the header, a two-line title,
 * the photo and the panel all at once; they were measured, not chosen.
 */

export const OG_SIZE = { width: 1200, height: 630 }

/** Right-to-left reading order. See the note above: `direction` does not do this. */
const RTL_ROW = { display: 'flex', flexDirection: 'row-reverse' } as const

/** A Hebrew text block starts at the right margin. */
const RTL_TEXT = { display: 'flex', textAlign: 'right' } as const

export interface Chrome {
  /** The site wordmark, already decoded to PNG. Null falls back to type. */
  logo: ImageTile | null
  /** `kenyonexpress.co.il`, drawn on every card. */
  host: string
}

// ---------------------------------------------------------------------------
// Shared parts
// ---------------------------------------------------------------------------

function Wordmark({ chrome, eyebrow }: { chrome: Chrome; eyebrow?: string | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      {chrome.logo ? (
        <img
          src={chrome.logo.src}
          width={chrome.logo.width}
          height={chrome.logo.height}
          alt=""
          style={{ display: 'flex' }}
        />
      ) : (
        // The mark is a WebP on disk and reaches the card through sharp. If that
        // decode ever fails the card still has to be branded, so the fallback is
        // the name set in the same type rather than an empty corner.
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: SITE.brand.dark }}>
          קניון אקספרס
        </div>
      )}
      {eyebrow ? (
        <div style={{ ...RTL_TEXT, fontSize: 26, color: SITE.functional.heading, marginTop: 8 }}>
          {eyebrow}
        </div>
      ) : null}
    </div>
  )
}

/** The green discount pill. Drawn only when the saving is real; see `cards.ts`. */
function Badge({ children }: { children: string }) {
  return (
    <div
      style={{
        display: 'flex',
        backgroundColor: SITE.functional.saleBadge,
        color: SITE.surface.page,
        fontSize: 42,
        fontWeight: 700,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 26,
        paddingRight: 26,
        borderRadius: 999,
      }}
    >
      {children}
    </div>
  )
}

/** The white count pill the category card carries where a discount would sit. */
function CountPill({ children }: { children: string }) {
  return (
    <div
      style={{
        display: 'flex',
        backgroundColor: SITE.surface.page,
        color: SITE.functional.heading,
        fontSize: 34,
        fontWeight: 700,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 26,
        paddingRight: 26,
        borderRadius: 999,
      }}
    >
      {children}
    </div>
  )
}

function Domain({ chrome, color }: { chrome: Chrome; color?: string }) {
  return (
    <div style={{ display: 'flex', fontSize: 26, color: color ?? SITE.neutral.muted }}>
      {chrome.host}
    </div>
  )
}

/**
 * A product photo, on a white tile.
 *
 * `null` draws nothing at all rather than an empty frame: a card with a blank
 * white square on it reads as an image that failed to load, which is worse than
 * a card that simply has more room for its title.
 */
function Photo({ tile, size }: { tile: ImageTile | null; size: number }) {
  if (!tile) return null
  return (
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: SITE.surface.page,
      }}
    >
      <img src={tile.src} width={tile.width} height={tile.height} alt="" />
    </div>
  )
}

function Shell({
  header,
  badge,
  body,
  footer,
}: {
  header: React.ReactNode
  badge: React.ReactNode
  body: React.ReactNode
  footer: React.ReactNode
}) {
  return (
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
        paddingTop: 44,
        paddingBottom: 44,
        paddingLeft: 60,
        paddingRight: 60,
        fontFamily: 'Heebo',
      }}
    >
      <div style={{ ...RTL_ROW, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {header}
        {badge}
      </div>
      {body}
      {footer}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

/**
 * The product card, reachable as a URL and carrying the photo that the
 * file-convention card at `(store)/product/[slug]/opengraph-image.tsx` never
 * had.
 *
 * It reads the model `lib/og/product-card.ts` builds, so the price rule that
 * module exists to enforce holds here too: the number comes from the coupon
 * OFFER and never from `price_ils`, because on a coupon that column is what the
 * goods cost at the business rather than what this site charges.
 */
export function ProductTemplate({
  card,
  photo,
  chrome,
}: {
  card: OgCard
  photo: ImageTile | null
  chrome: Chrome
}) {
  return (
    <Shell
      header={<Wordmark chrome={chrome} eyebrow={card.supplier} />}
      badge={card.discountBadge ? <Badge>{card.discountBadge}</Badge> : null}
      body={
        <div
          style={{
            ...RTL_ROW,
            flexGrow: 1,
            alignItems: 'center',
            gap: 40,
            paddingTop: 16,
            paddingBottom: 16,
          }}
        >
          <div
            style={{
              ...RTL_TEXT,
              flexGrow: 1,
              flexShrink: 1,
              // Satori's flex is Yoga's: without a zero basis a long title
              // pushes the photo off the card instead of wrapping.
              flexBasis: 0,
              fontSize: 54,
              fontWeight: 700,
              color: SITE.brand.dark,
              lineHeight: 1.15,
            }}
          >
            {card.title}
          </div>
          <Photo tile={photo} size={230} />
        </div>
      }
      footer={<PricePanel card={card} chrome={chrome} />}
    />
  )
}

/**
 * The white money panel, drawn ONLY when there is a price.
 *
 * MEASURED on a product whose `is_coupon_enabled` is set with no
 * `coupon_price_ils` (4 of the 61 active rows) the card rendered an empty
 * white slab with the domain floating in it, which reads as a broken image
 * rather than as a product with no price. The page itself says
 * "מחיר הקופון טרם הוגדר" and refuses to sell it, so a card that says nothing
 * about money is right; the empty box was not.
 */
function PricePanel({ card, chrome }: { card: OgCard; chrome: Chrome }) {
  if (!card.price) return <Domain chrome={chrome} />
  return (
    <div
      style={{
        ...RTL_ROW,
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        backgroundColor: SITE.surface.page,
        borderRadius: 24,
        paddingTop: 20,
        paddingBottom: 20,
        paddingLeft: 34,
        paddingRight: 34,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        {card.priceLabel ? (
          <div style={{ ...RTL_TEXT, fontSize: 24, color: SITE.neutral.muted }}>
            {card.priceLabel}
          </div>
        ) : null}
        <div style={{ ...RTL_ROW, alignItems: 'baseline', gap: 16 }}>
          <div
            style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: SITE.functional.price }}
          >
            {card.price}
          </div>
          {card.wasPrice ? (
            <div
              style={{
                display: 'flex',
                fontSize: 32,
                color: SITE.functional.priceStrike,
                textDecoration: 'line-through',
              }}
            >
              {card.wasPrice}
            </div>
          ) : null}
        </div>
        {card.balance ? (
          <div style={{ ...RTL_TEXT, fontSize: 26, color: SITE.functional.heading, marginTop: 2 }}>
            {card.balance}
          </div>
        ) : null}
      </div>
      <Domain chrome={chrome} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

/**
 * A category shares as its name, its own sentence, how many products are behind
 * it, and up to three of them.
 *
 * The thumbnails are the point. A category link with no image is the case the
 * root layout's `summary_large_image` turns into a blank grey rectangle, and a
 * name alone would not be worth generating a PNG for.
 */
export function CategoryTemplate({
  card,
  thumbs,
  chrome,
}: {
  card: CategoryCard
  thumbs: ImageTile[]
  chrome: Chrome
}) {
  return (
    <Shell
      header={<Wordmark chrome={chrome} eyebrow="קטגוריה" />}
      badge={card.countLabel ? <CountPill>{card.countLabel}</CountPill> : null}
      body={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            flexGrow: 1,
            justifyContent: 'center',
            paddingTop: 12,
            paddingBottom: 12,
          }}
        >
          <div
            style={{
              ...RTL_TEXT,
              fontSize: 72,
              fontWeight: 700,
              color: SITE.brand.dark,
              lineHeight: 1.1,
            }}
          >
            {card.name}
          </div>
          <div
            style={{
              ...RTL_TEXT,
              fontSize: 29,
              color: SITE.functional.heading,
              marginTop: 16,
              lineHeight: 1.35,
            }}
          >
            {card.description}
          </div>
        </div>
      }
      footer={
        <div style={{ ...RTL_ROW, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ ...RTL_ROW, gap: 16 }}>
            {thumbs.map((tile) => (
              <div
                key={tile.src.slice(-24)}
                style={{
                  display: 'flex',
                  width: 124,
                  height: 124,
                  borderRadius: 20,
                  overflow: 'hidden',
                  backgroundColor: SITE.surface.page,
                }}
              >
                <img src={tile.src} width={tile.width} height={tile.height} alt="" />
              </div>
            ))}
          </div>
          <Domain chrome={chrome} />
        </div>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Deal
// ---------------------------------------------------------------------------

export function DealTemplate({
  card,
  photo,
  chrome,
}: {
  card: DealCard
  photo: ImageTile | null
  chrome: Chrome
}) {
  return (
    <Shell
      header={<Wordmark chrome={chrome} eyebrow={card.business} />}
      badge={card.discountBadge ? <Badge>{card.discountBadge}</Badge> : null}
      body={
        <div
          style={{
            ...RTL_ROW,
            flexGrow: 1,
            alignItems: 'center',
            gap: 40,
            paddingTop: 12,
            paddingBottom: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 0,
            }}
          >
            <div
              style={{
                ...RTL_TEXT,
                fontSize: 52,
                fontWeight: 700,
                color: SITE.brand.dark,
                lineHeight: 1.15,
              }}
            >
              {card.title}
            </div>
            {card.price ? (
              <div style={{ ...RTL_ROW, alignItems: 'baseline', gap: 16, marginTop: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 64,
                    fontWeight: 700,
                    color: SITE.functional.price,
                  }}
                >
                  {card.price}
                </div>
                {card.wasPrice ? (
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 32,
                      color: SITE.functional.priceStrike,
                      textDecoration: 'line-through',
                    }}
                  >
                    {card.wasPrice}
                  </div>
                ) : null}
              </div>
            ) : null}
            {card.balance ? (
              <div
                style={{ ...RTL_TEXT, fontSize: 26, color: SITE.functional.heading, marginTop: 6 }}
              >
                {card.balance}
              </div>
            ) : null}
          </div>
          <Photo tile={photo} size={220} />
        </div>
      }
      footer={<TimerBar countdown={card.countdown} chrome={chrome} />}
    />
  )
}

/**
 * The countdown strip.
 *
 * Each unit is its OWN flex child rather than one interpolated sentence. A
 * string like `מסתיים בעוד 3 ימים 12 שעות` is three Hebrew runs with digits
 * between them, which is exactly the arrangement the home card's missing comma
 * was measured on. Flex order is decided by `row-reverse` and cannot be
 * surprised by a shaper.
 */
function TimerBar({ countdown, chrome }: { countdown: Countdown; chrome: Chrome }) {
  return (
    <div
      style={{
        ...RTL_ROW,
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: SITE.functional.heading,
        borderRadius: 20,
        paddingTop: 18,
        paddingBottom: 18,
        paddingLeft: 30,
        paddingRight: 30,
      }}
    >
      <div style={{ ...RTL_ROW, alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', fontSize: 30, color: SITE.brand.primary, fontWeight: 700 }}>
          {countdown.label}
        </div>
        {countdown.kind === 'left'
          ? countdown.parts.map((part) => (
              <div
                key={part}
                style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: SITE.surface.page }}
              >
                {part}
              </div>
            ))
          : null}
      </div>
      <Domain chrome={chrome} color={SITE.surface.page} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Default
// ---------------------------------------------------------------------------

/**
 * What a share renders as when the template has no row to describe: an unknown
 * slug, a deleted deal, a page that only wants the brand.
 *
 * It is also what a malformed request gets. `parseOgRequest` never answers 400,
 * because a 400 beside a live link is a broken image in somebody's chat, and a
 * broken image reads as a broken site rather than as a stale URL.
 */
export function DefaultTemplate({ chrome }: { chrome: Chrome }) {
  return (
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
      }}
    >
      {chrome.logo ? (
        <img
          src={chrome.logo.src}
          width={chrome.logo.width}
          height={chrome.logo.height}
          alt=""
          style={{ display: 'flex', marginBottom: 28 }}
        />
      ) : null}
      <div style={{ display: 'flex', fontSize: 88, fontWeight: 700, color: SITE.brand.dark }}>
        קניון אקספרס
      </div>
      <div style={{ display: 'flex', fontSize: 38, color: SITE.functional.heading, marginTop: 16 }}>
        {/* No comma. Satori is not to be trusted with a neutral character
            between two Hebrew runs: it is placed by glyph order rather than by
            direction and lands on the wrong side of the word. Measured on the
            first render of the home card. */}
        קופונים ומבצעים במחיר הכי טוב
      </div>
      <div style={{ display: 'flex', fontSize: 30, color: SITE.neutral.muted, marginTop: 44 }}>
        {chrome.host}
      </div>
    </div>
  )
}
