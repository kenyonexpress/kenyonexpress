'use client'

import { useCart } from '@/components/cart/CartProvider'
import WhatsAppShareButton from '@/components/shared/WhatsAppShareButton'
import CouponPricing from '@/components/storefront/CouponPricing'
import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import { Check, ShoppingCart } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Variant {
  id: string
  name_he: string
  price: number | null
  price_modifier: number
  stock_quantity: number | null
  sku: string
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
  sku: string | null
  /** Category name, shown in the eyebrow slot live fills with its category links. */
  categoryName: string | null
  attributes: Attribute[]
  variants: Variant[]
  isCoupon: boolean
  /**
   * Present only for coupon products. Built server-side from
   * products.coupon_price_ils so the page quotes the exact amount the cart
   * bills; deriving it here from a percent is what caused the two to disagree.
   */
  couponOffer: CouponOffer | null
}

/**
 * Live prints ₪399, not ₪399.00, and the pixel comparison counts every glyph.
 * Agorot are still shown when a price actually has them.
 */
function shekels(value: number): string {
  return `₪${value.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
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
  sku,
  categoryName,
  attributes,
  variants,
  isCoupon,
  couponOffer,
}: Props) {
  const { addToCart, isPending } = useCart()
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(
    variants.length === 1 ? (variants[0]?.id ?? null) : null,
  )
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  const variant = variants.find((v) => v.id === selected) ?? null
  const price = variant != null ? (variant.price ?? basePrice + variant.price_modifier) : basePrice
  const stock = variant?.stock_quantity ?? baseStock
  const outOfStock = stock === 0
  const effectiveSku = variant?.sku ?? sku
  const needsVariant = variants.length > 0 && !selected
  // The commission engine refuses a coupon line with no absolute price, so the
  // button must not offer a purchase the checkout would reject.
  const couponUnsellable = isCoupon && couponOffer !== null && !couponOffer.sellable

  const hasDiscount = oldPrice != null && oldPrice > price
  const discountPct = hasDiscount ? Math.round((1 - price / oldPrice) * 100) : 0
  const maxQty = stock != null && stock > 0 ? stock : 99
  const blocked = outOfStock || needsVariant || couponUnsellable || isPending

  const handleAddToCart = async () => {
    if (blocked) return
    await addToCart(productId, selected, qty, name)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  // Live's second button skips the cart drawer. Same add, then straight to
  // checkout; the checkout subtree is auth-gated in proxy.ts, so a guest lands
  // on login with the item already saved rather than losing the selection.
  const handleBuyNow = async () => {
    if (blocked) return
    await addToCart(productId, selected, qty, name)
    router.push('/checkout')
  }

  const buyLabel = outOfStock
    ? 'אזל מהמלאי'
    : couponUnsellable
      ? 'לא זמין לרכישה'
      : isCoupon
        ? 'קנה עכשיו'
        : 'הוסף לסל'

  return (
    <div data-pdp="summary" className="pdp-summary">
      {categoryName && <p className="pdp-summary__eyebrow">{categoryName}</p>}

      <h1 className="pdp-summary__title">{name}</h1>

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
        {outOfStock ? 'אזל מהמלאי' : 'במלאי, מוכן למשלוח'}
      </p>

      {/* A coupon is priced by its own absolute model, so it gets the whole
          pricing block. Everything else shows the ordinary sale price. */}
      {couponOffer ? (
        <div className="pdp-coupon">
          <CouponPricing offer={couponOffer} />
        </div>
      ) : (
        <>
          <ul className="pdp-summary__list">
            {oldPrice != null && (
              <li>
                מחיר רגיל: <del>{shekels(oldPrice)}</del>
              </li>
            )}
            <li>מחיר בקניון: {shekels(price)}</li>
          </ul>

          <p className="pdp-summary__price">
            <span>{shekels(price)}</span>
            {hasDiscount && (
              <>
                <del>{shekels(oldPrice)}</del>
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
                onClick={() => setSelected(v.id)}
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
        <WhatsAppShareButton
          message={`מצאתי משהו שווה ב-KenyonExpress: ${name} ב-${shekels(price)}`}
          appendCurrentUrl
        />
      </div>
    </div>
  )
}
