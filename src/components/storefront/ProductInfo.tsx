'use client'

import { useCart } from '@/components/cart/CartProvider'
import CityTag from '@/components/geo/CityTag'
import FacebookShareButton from '@/components/shared/FacebookShareButton'
import WhatsAppShareButton from '@/components/shared/WhatsAppShareButton'
import CouponPricing from '@/components/storefront/CouponPricing'
import { productQuantityCeiling } from '@/lib/cart/format'
import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import { isImplausibleDiscount } from '@/lib/commerce/implausible-discount'
import { type RecurringOffer, describeRecurringPrice } from '@/lib/commerce/recurring'
import { cityByName } from '@/lib/geo/cities'
import { shekelsFromIls as sharedShekelsFromIls } from '@/lib/money-format'
import { buildShareMessage } from '@/lib/share/message'
import { Check, ShoppingCart } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type ReactNode, useState } from 'react'

interface Variant {
  id: string
  name_he: string
  price: number | null
  price_modifier: number
  stock_quantity: number | null
  /** Nullable in the table, and `effectiveSku` already falls back to the product's. */
  sku: string | null
}

interface Attribute {
  label: string
  value: string
}

interface Props {
  productId: string
  name: string
  nameEn: string | null
  basePrice: number
  oldPrice: number | null
  baseStock: number | null
  /**
   * The live "only X left" line, rendered by the page inside its own Suspense
   * boundary. Passed as a NODE rather than as numbers because reading those
   * numbers here would drag this component - and with it the whole product
   * page - out of the cache.
   */
  scarcitySlot?: ReactNode
  sku: string | null
  /** Category name, shown in the eyebrow slot live fills with its category links. */
  categoryName: string | null
  /**
   * Free text: the product's own city once 002-products-geo is applied, the
   * supplier's until then. Unrecognised values render nothing at all.
   */
  city: string | null
  attributes: Attribute[]
  variants: Variant[]
  isCoupon: boolean
  /**
   * Present only for coupon products. Built server-side from
   * products.coupon_price_ils so the page quotes the exact amount the cart
   * bills; deriving it here from a percent is what caused the two to disagree.
   */
  couponOffer: CouponOffer | null
  /**
   * Present only for recurring products. Built server-side from the billing
   * columns, so the page quotes exactly what the renewal worker will charge.
   */
  recurringOffer?: RecurringOffer | null
}

/**
 * Live prints ₪399, not ₪399.00, and the pixel comparison counts every glyph.
 * Agorot are still shown when a price actually has them.
 */
function shekelsFromIls(value: number): string {
  return sharedShekelsFromIls(value)
}

/**
 * The summary column of the product page.
 *
 * The vertical order and every gap in it are measured off the live
 * single-product template (see PDP in src/styles/tokens.ts): eyebrow, title,
 * meta, hairline, stock, the two price lines, the sale price, the buy controls,
 * then the tag line. Live fills two of those slots with features we do not have
 * -- a star rating and a wishlist link -- and those carry real data here rather
 * than a fabricated score, because the rhythm depends on the slots existing,
 * not on what live happens to put in them.
 */
export default function ProductInfo({
  productId,
  name,
  nameEn,
  basePrice,
  oldPrice,
  baseStock,
  scarcitySlot = null,
  sku,
  categoryName,
  city,
  attributes,
  variants,
  isCoupon,
  couponOffer,
  recurringOffer = null,
}: Props) {
  const { addToCart, isPending } = useCart()

  // Resolved once here rather than inside CityTag, because the href needs the
  // slug and the tag needs the canonical name, and resolving twice invites the
  // two to disagree.
  const knownCity = cityByName(city)
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(
    variants.length === 1 ? (variants[0]?.id ?? null) : null,
  )
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  const variant = variants.find((v) => v.id === selected) ?? null
  const price = variant != null ? (variant.price ?? basePrice + variant.price_modifier) : basePrice
  // The CACHED level, deliberately. This component renders inside the product
  // page's hour-long cache, and reading live availability here would make the
  // whole page uncacheable - `next build` refuses it outright under
  // `cacheComponents`, which is how the first attempt was caught.
  //
  // The live number streams in separately through `<StockScarcity>`, which is
  // Suspense-wrapped. That split is also the right one on its own terms: the
  // price and the buy button should paint immediately, and "only 3 left" is
  // the one line worth waiting a beat for.
  const stock = variant?.stock_quantity ?? baseStock
  const outOfStock = stock === 0
  const effectiveSku = variant?.sku ?? sku
  const needsVariant = variants.length > 0 && !selected
  // The commission engine refuses a coupon line with no absolute price, so the
  // button must not offer a purchase the checkout would reject.
  const couponUnsellable = isCoupon && couponOffer !== null && !couponOffer.sellable
  // The same refusal for the other type. A physical product whose price is null
  // or 0 would otherwise paint ₪0.00 beside a live add-to-cart button; the cart
  // marks such a line unpriced and beginCheckout refuses it, so offering the
  // purchase here only moves the refusal to the worst possible moment.
  const priceUnsellable = !isCoupon && !(price > 0)
  // A price that is an implausible fraction of its own compare-at is a data
  // error rather than an offer, and the cart and `beginCheckout` both refuse
  // such a line. Same argument as the two gates above: the button must not
  // offer a purchase the server has already decided to reject. The badge below
  // divides the same two numbers, so without this the page paints "-100%" over
  // a live buy button.
  const priceImplausible = isImplausibleDiscount(price, oldPrice)

  const hasDiscount = oldPrice != null && oldPrice > price
  const discountPct = hasDiscount ? Math.round((1 - price / oldPrice) * 100) : 0
  // Not `stock ?? 99`. The schema stops a cart line at 99 whatever the shelf
  // holds, and /product/demo-coupon-1 rendered `max="100"` against it -
  // measured on a built server. `CART_LINE_MAX_QUANTITY` exists precisely so
  // this number and the one that rejects the write cannot drift.
  const maxQty = productQuantityCeiling(stock)
  const blocked =
    outOfStock ||
    needsVariant ||
    couponUnsellable ||
    priceUnsellable ||
    priceImplausible ||
    isPending

  const handleAddToCart = async () => {
    if (blocked) return
    // Only confirm what happened. The store resolves for a refusal as well, so
    // the unconditional version showed "נוסף לסל" over a cart the server had
    // just declined to change, next to the error toast contradicting it.
    if (!(await addToCart(productId, selected, qty, name))) return
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  // Live's second button skips the cart drawer. Same add, then straight to
  // checkout; the checkout subtree is auth-gated in proxy.ts, so a guest lands
  // on login with the item already saved rather than losing the selection.
  const handleBuyNow = async () => {
    if (blocked) return
    // The navigation is the add's consequence, so it waits on the add's answer.
    // A refused item used to push anyway, and /checkout bounces an empty cart
    // to /cart — the shopper pressed "קנה עכשיו" and landed two pages away
    // from the product with nothing saying why. Staying put leaves them on the
    // product with the error toast that does.
    if (!(await addToCart(productId, selected, qty, name))) return
    router.push('/checkout')
  }

  const buyLabel = outOfStock
    ? 'אזל מהמלאי'
    : couponUnsellable || priceUnsellable
      ? 'לא זמין לרכישה'
      : recurringOffer
        ? 'הצטרף למנוי'
        : isCoupon
          ? 'קנה עכשיו'
          : 'הוסף לסל'

  return (
    <div data-pdp="summary" className="pdp-summary">
      {categoryName && <p className="pdp-summary__eyebrow">{categoryName}</p>}

      <h1 className="pdp-summary__title">{name}</h1>

      {/* Where the deal is, directly under the title, so it is answered before
          the price rather than at the bottom of the page next to the supplier
          block. It links into the city-filtered catalogue: a customer who cares
          which city this is in is the customer who wants the others in it.
          `knownCity` is null for free text the city table does not recognise,
          and the whole line disappears rather than printing it raw. */}
      {knownCity && (
        <p className="pdp-summary__city">
          <CityTag city={knownCity.name} href={`/products?city=${knownCity.slug}`} />
        </p>
      )}

      <p className="pdp-summary__meta" dir={effectiveSku ? 'rtl' : 'ltr'}>
        {effectiveSku ? (
          <>
            מק"ט: <span dir="ltr">{effectiveSku}</span>
          </>
        ) : (
          (nameEn ?? '')
        )}
      </p>

      <hr className="pdp-summary__rule" />

      <p className="pdp-summary__stock">
        <span
          className={`pdp-summary__dot${outOfStock ? '' : ' pdp-summary__dot--in'}`}
          aria-hidden="true"
        />
        {outOfStock ? (isCoupon ? 'הדיל נסגר' : 'אזל מהמלאי') : 'במלאי, מוכן למשלוח'}
      </p>

      {/*
        Said only when there is a real number behind it. `stockDisplay` returns
        null for everything else rather than a vaguer phrase, because Israeli
        consumer law limits urgency claims to ones the seller can substantiate -
        the same rule that keeps the deal countdown tied to a real
        `offer_valid_until` instead of a rolling timer.
      */}
      {/*
        The live scarcity line, streamed in by the page. Null when the page did
        not read it (a variant, or an untracked product), which is most of the
        catalogue.
      */}
      {!outOfStock && scarcitySlot}

      {/* A subscription is priced per cycle; quoting the one-off price here
          would promise the wrong number. The renewal terms sit next to the
          amount because clicking the CTA both charges the first cycle and
          saves the card -- the server forces tokenisation -- and that must be
          said BEFORE the click, not discovered on a statement. */}
      {recurringOffer && (
        <div className="pdp-summary__recurring" data-pdp="recurring">
          <p className="text-2xl font-bold text-heading" dir="rtl">
            {describeRecurringPrice(recurringOffer)}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            החיוב מתחדש אוטומטית בכרטיס שנשמר בקנייה. ביטול בכל עת מאזור האישי, בתוקף עד סוף התקופה
            ששולמה.
          </p>
        </div>
      )}

      {/* A coupon is priced by its own absolute model, so it gets the whole
          pricing block. Everything else shows the ordinary sale price. */}
      {recurringOffer ? null : couponOffer ? (
        <div className="pdp-coupon">
          <CouponPricing offer={couponOffer} />
        </div>
      ) : (
        <>
          <ul className="pdp-summary__list">
            {oldPrice != null && (
              <li>
                מחיר רגיל: <del>{shekelsFromIls(oldPrice)}</del>
              </li>
            )}
            <li>מחיר בקניון: {shekelsFromIls(price)}</li>
          </ul>

          <p className="pdp-summary__price">
            <span>{shekelsFromIls(price)}</span>
            {hasDiscount && (
              <>
                <del>{shekelsFromIls(oldPrice)}</del>
                <span className="pdp-summary__badge">{discountPct}%-</span>
              </>
            )}
          </p>
        </>
      )}

      {variants.length > 0 && (
        <div className="pdp-summary__variants">
          <p>בחר גרסה</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <button
                type="button"
                key={v.id}
                onClick={() => {
                  setSelected(v.id)
                  // The ceiling belongs to the SELECTION, so switching selection
                  // has to move the number under it. Picking a 50-in-stock
                  // variant, typing 20, then switching to one with 3 left left
                  // `20` sitting in an input whose `max` had just become 3 --
                  // and the add went out at 20, for the server to refuse. That
                  // is the same drift `productQuantityCeiling` exists to stop,
                  // one state update further along.
                  setQty((current) =>
                    Math.min(current, productQuantityCeiling(v.stock_quantity ?? baseStock)),
                  )
                }}
                disabled={v.stock_quantity === 0}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                  selected === v.id
                    ? 'bg-brand-dark text-white border-brand-dark'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-brand-dark'
                } ${v.stock_quantity === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {v.name_he}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="pdp-buy">
        {/* Live has no +/- stepper: a single 140x41 number input with the
            spinner suppressed. Measured 2026-07-28. */}
        <input
          type="number"
          className="pdp-buy__qty"
          value={qty}
          min={1}
          max={maxQty}
          disabled={outOfStock}
          aria-label="כמות"
          onChange={(e) => {
            const next = Number.parseInt(e.target.value, 10)
            if (!Number.isFinite(next)) return
            setQty(Math.min(Math.max(next, 1), maxQty))
          }}
        />

        <button
          type="button"
          onClick={() => void handleAddToCart()}
          disabled={blocked}
          className="pdp-buy__atc"
        >
          {added ? (
            <>
              <Check size={18} />
              נוסף לסל
            </>
          ) : (
            <>
              <ShoppingCart size={18} />
              {buyLabel}
            </>
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={() => void handleBuyNow()}
        disabled={blocked}
        className="pdp-buy__now"
      >
        {outOfStock ? 'אזל מהמלאי' : 'קנה עכשיו'}
      </button>

      <div className="pdp-summary__tags">
        <span>
          {attributes.length > 0
            ? `${attributes.map((a) => a.value).join(', ')}`
            : (categoryName ?? '')}
        </span>
        {/* The message is built from the OFFER, not from `price`. For a
            coupon, `price` is the sticker price of the goods at the business,
            and this line used to send a friend "₪200" for a deal the page
            beside it quotes at ₪80. See lib/share/message.ts. */}
        <span className="inline-flex items-center gap-4">
          <WhatsAppShareButton
            productId={productId}
            message={buildShareMessage({ name, priceIls: price, offer: couponOffer })}
            appendCurrentUrl
          />
          <FacebookShareButton />
        </span>
      </div>
    </div>
  )
}
