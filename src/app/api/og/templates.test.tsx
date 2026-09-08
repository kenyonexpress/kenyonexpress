// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs'
import { ImageResponse } from 'next/og'
import { describe, expect, it } from 'vitest'
import { buildCategoryCard, buildDealCard, buildOgCard } from './cards'
import { heebo } from './fonts'
import { imageTile, logoTile } from './image'
import {
  CategoryTemplate,
  type Chrome,
  DealTemplate,
  DefaultTemplate,
  OG_SIZE,
  ProductTemplate,
} from './templates'

/**
 * THE ONLY TEST THAT ACTUALLY RENDERS, and the only one that can catch what
 * Satori refuses.
 *
 * `cards.test.ts` next door asserts what the cards SAY. It cannot see the
 * failure this file exists for: Satori throws on markup a browser accepts (a
 * div with two children and no `display: flex`, an unsupported property, an
 * image it cannot decode) and inside `/api/og` a throw is a 500, which is a
 * broken image beside a live link in somebody's chat. Nothing else in this repo
 * would report it: the build passes, the types pass, the page passes.
 *
 * `// @vitest-environment node` is required. The suite default is jsdom and
 * this renders through wasm.
 *
 * Set `OG_OUT=/some/dir` to also write the PNGs and look at them. The
 * assertions here cover "it rendered"; only eyes cover "it reads right in
 * Hebrew", and the layout was measured that way. See the `row-reverse` note in
 * `templates.tsx` for what that measurement found.
 */

const DUMP = process.env.OG_OUT

async function png(name: string, element: React.ReactElement): Promise<Buffer> {
  const fonts = await heebo()
  const response = new ImageResponse(element, { ...OG_SIZE, fonts })
  const bytes = Buffer.from(await response.arrayBuffer())
  if (DUMP) {
    mkdirSync(DUMP, { recursive: true })
    writeFileSync(`${DUMP}/${name}.png`, bytes)
  }
  return bytes
}

/** Signature, then width and height straight out of the IHDR chunk. */
function expectCard(bytes: Buffer) {
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(bytes.readUInt32BE(16)).toBe(OG_SIZE.width)
  expect(bytes.readUInt32BE(20)).toBe(OG_SIZE.height)
  // A card that drew nothing is still a valid PNG. Flat yellow compresses to
  // roughly 5KB; every template here draws type over it.
  expect(bytes.byteLength).toBeGreaterThan(20_000)
}

const HOST = 'kenyonexpress.co.il'
const NOW = new Date('2026-09-01T12:00:00.000Z')
const DAY = 86_400_000

const chrome = async (): Promise<Chrome> => ({ logo: await logoTile(), host: HOST })

const OFFER = {
  sellable: true,
  fullPriceIls: 400,
  paidOnlineIls: 40,
  balanceAtBusinessIls: 360,
  discountPercent: 90,
  validUntil: null,
  expiryDays: 30,
} as const

describe('every template renders a card Satori accepts', () => {
  it('product: photo, supplier, discount, price panel', async () => {
    const bytes = await png(
      'product',
      <ProductTemplate
        chrome={await chrome()}
        photo={
          await imageTile('/images/products/S5cf8b9b35a5b49b0bf525d6cb7b89181H-600x600.webp', 230)
        }
        card={buildOgCard({
          name: 'ארוחה זוגית מפנקת במסעדת השף עם יין',
          supplierName: 'מסעדת השף תל אביב',
          priceIls: null,
          offer: OFFER,
        })}
      />,
    )
    expectCard(bytes)
  })

  it('product: no photo, no supplier, no price', async () => {
    // An `is_coupon_enabled` row with no `coupon_price_ils`: 4 of the 61 active
    // products. The panel must not draw, and the card must still be a card.
    const bytes = await png(
      'product-bare',
      <ProductTemplate
        chrome={await chrome()}
        photo={null}
        card={buildOgCard({
          name: 'ארוחה זוגית מפנקת במסעדת השף הכוללת יין אדום מובחר ועוד דברים טובים',
          supplierName: null,
          priceIls: null,
          offer: { sellable: false, reason: 'missing-price', fullPriceIls: 400, validUntil: null },
        })}
      />,
    )
    expectCard(bytes)
  })

  it('category: three thumbnails and a count', async () => {
    const bytes = await png(
      'category',
      <CategoryTemplate
        chrome={await chrome()}
        thumbs={(
          await Promise.all([
            imageTile('/images/products/1635336888j88OE.webp', 124),
            imageTile('/images/products/137_dl_photo_ffd5b-600x464.webp', 124),
            imageTile('/images/products/WhatsApp-Image-2023-05-29-at-21.59.02-1-600x600.webp', 124),
          ])
        ).filter((tile) => tile !== null)}
        card={buildCategoryCard({
          nameHe: 'מסעדות ובתי קפה',
          description:
            'מסעדות ובתי קפה בקניון אקספרס. דילים קופונים ומוצרים במחירים של קניון אקספרס.',
          total: 48,
        })}
      />,
    )
    expectCard(bytes)
  })

  it('category: empty, so no pill and no thumbnails', async () => {
    const bytes = await png(
      'category-empty',
      <CategoryTemplate
        chrome={await chrome()}
        thumbs={[]}
        card={buildCategoryCard({
          nameHe: 'קטגוריה עם שם ארוך מאוד שנמשך והולך',
          description: 'קטגוריה בקניון אקספרס. דילים קופונים ומוצרים במחירים של קניון אקספרס.',
          total: 0,
        })}
      />,
    )
    expectCard(bytes)
  })

  it('deal: running, with the countdown', async () => {
    const bytes = await png(
      'deal',
      <DealTemplate
        chrome={await chrome()}
        photo={await imageTile('/images/products/1635336888j88OE.webp', 220)}
        card={buildDealCard({
          titleHe: 'ארוחה זוגית מפנקת כולל יין',
          businessName: 'מסעדת השף',
          originalPrice: 400,
          platformPrice: 40,
          discountPercentage: 90,
          validUntil: new Date(NOW.getTime() + 3 * DAY),
          now: NOW,
        })}
      />,
    )
    expectCard(bytes)
  })

  it('deal: ended, no price, no business, no photo', async () => {
    // What a link forwarded a week late renders as.
    const bytes = await png(
      'deal-ended',
      <DealTemplate
        chrome={await chrome()}
        photo={null}
        card={buildDealCard({
          titleHe: 'דיל שהסתיים ואין לו מחיר ואין לו בית עסק ויש לו שם ארוך',
          businessName: null,
          originalPrice: 400,
          platformPrice: null,
          discountPercentage: null,
          validUntil: new Date(NOW.getTime() - DAY),
          now: NOW,
        })}
      />,
    )
    expectCard(bytes)
  })

  it('default: the brand card', async () => {
    expectCard(await png('default', <DefaultTemplate chrome={await chrome()} />))
  })

  it('default: with the logo decode failed, so the wordmark is type', async () => {
    // `logoTile()` answers null on any sharp or fs failure. The card still has
    // to be branded, which is the whole reason the fallback exists.
    expectCard(
      await png('default-no-logo', <DefaultTemplate chrome={{ logo: null, host: HOST }} />),
    )
  })
})

describe('the image pipeline', () => {
  it('decodes the WebP this catalogue is made of, which Satori cannot read itself', async () => {
    const tile = await imageTile('/images/products/1635336888j88OE.webp', 124)
    expect(tile?.src.startsWith('data:image/png;base64,')).toBe(true)
    expect(tile?.width).toBe(124)
    expect(tile?.height).toBe(124)
  })

  it('refuses a host that is not on the allowlist', async () => {
    // `images` is admin-entered text, and this route fetches it server-side.
    expect(await imageTile('https://evil.example/x.png', 124)).toBe(null)
    expect(await imageTile('http://kenyonexpress.co.il/x.png', 124)).toBe(null)
    expect(await imageTile('//kenyonexpress.co.il/x.png', 124)).toBe(null)
  })

  it('cannot be walked out of public/', async () => {
    expect(await imageTile('/../../.env.local', 124)).toBe(null)
    expect(await imageTile('/../package.json', 124)).toBe(null)
  })

  it('answers null rather than throwing for a file that is not there', async () => {
    expect(await imageTile('/images/products/no-such-file.webp', 124)).toBe(null)
    expect(await imageTile(null, 124)).toBe(null)
    expect(await imageTile('   ', 124)).toBe(null)
  })
})
