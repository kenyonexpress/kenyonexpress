import {
  CANCELLATION_TEXT,
  type CleanValue,
  type DealProductType,
  type DealTemplate,
  RETURNS_TEXT,
  SELLER_BUSINESS_ID,
  SELLER_LEGAL_NAME,
  displayValue,
} from '@/lib/deal-templates/common'
import masters from '@/lib/deal-templates/masters.json'
import { formatAgorot } from '@/lib/money'
import type { Agorot } from '@/lib/money'
import Link from 'next/link'

/**
 * C149: the two blocks a templated deal adds under the description.
 *
 * `products.attributes` is written by the C148 wizard (buildProductWrite):
 * `template` names the master, `fields` holds its values, `legal` the
 * consumer-law disclosure. Both blocks read only that object, so a catalogue
 * row without a template shows no spec table and the default legal text.
 */

type DealAttributes = {
  template?: string
  fields?: Record<string, CleanValue>
  legal?: {
    seller_legal_name?: string
    seller_business_id?: string
    cancellation_policy?: string
    fine_print?: string | null
    price_includes_vat?: boolean
    returns_policy?: string
    delivery_days?: number
    validity_days?: number
  }
}

const templates = masters as unknown as DealTemplate[]

function readAttributes(raw: unknown): DealAttributes {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as DealAttributes) : {}
}

/** Fixed calendar date in Israel time; no clock read, safe in the static shell. */
function hebrewDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
}

export function ProductSpecs({ attributes }: { attributes: unknown }) {
  const attrs = readAttributes(attributes)
  const template = templates.find((t) => t.slug === attrs.template)
  if (!template || !attrs.fields) return null
  const rows = template.fields
    .map((field) => {
      const key = field.type === 'money' ? `${field.key}_agorot` : field.key
      return { label: field.label, value: displayValue(field, attrs.fields?.[key]) }
    })
    .filter((r) => r.value !== '')
  if (rows.length === 0) return null
  return (
    <details className="pdp-acc" open>
      <summary className="pdp-acc__summary">מפרט</summary>
      <table className="pdp-specs" data-pdp="specs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

export function ProductLegal({
  attributes,
  productType,
  supplierName,
  offerValidUntil,
  couponExpiryDays,
  shippingPriceAgorot,
}: {
  attributes: unknown
  productType: DealProductType
  supplierName: string | null
  offerValidUntil: string | null
  couponExpiryDays: number | null
  shippingPriceAgorot: number | null
}) {
  const legal = readAttributes(attributes).legal ?? {}
  const isCoupon = productType === 'coupon'
  const until = hebrewDate(offerValidUntil)
  const validityDays = legal.validity_days ?? couponExpiryDays
  return (
    <details className="pdp-acc" open>
      <summary className="pdp-acc__summary">מידע לצרכן ותנאי ביטול</summary>
      <section className="pdp-legal" data-pdp="legal" aria-label="מידע לצרכן">
        <ul className="pdp-details__list space-y-1.5">
          <li>
            <span className="pdp-details__label">המוכר: </span>
            {legal.seller_legal_name || SELLER_LEGAL_NAME}, ח.פ{' '}
            <span dir="ltr">{legal.seller_business_id || SELLER_BUSINESS_ID}</span>
          </li>
          {isCoupon && supplierName && (
            <li>
              <span className="pdp-details__label">נותן השירות: </span>
              {supplierName}
            </li>
          )}
          {until && (
            <li>
              <span className="pdp-details__label">המבצע בתוקף עד: </span>
              {until}
            </li>
          )}
          {isCoupon && validityDays != null && (
            <li>
              <span className="pdp-details__label">תוקף השובר: </span>
              {validityDays} ימים מיום הרכישה
            </li>
          )}
          {!isCoupon && legal.delivery_days != null && (
            <li>
              <span className="pdp-details__label">מועד אספקה: </span>
              עד {legal.delivery_days} ימי עסקים
            </li>
          )}
          {!isCoupon && shippingPriceAgorot != null && (
            <li>
              <span className="pdp-details__label">דמי משלוח: </span>
              {shippingPriceAgorot === 0 ? 'חינם' : formatAgorot(shippingPriceAgorot as Agorot)}
            </li>
          )}
          <li>
            <span className="pdp-details__label">מחיר: </span>
            {legal.price_includes_vat === false ? 'לא כולל מע״מ' : 'כולל מע״מ'}
          </li>
        </ul>
        <p className="pdp-legal__text">
          <span className="pdp-details__label">ביטול עסקה: </span>
          {legal.cancellation_policy || CANCELLATION_TEXT[productType]}
        </p>
        {!isCoupon && (
          <p className="pdp-legal__text">
            <span className="pdp-details__label">החזרות: </span>
            {legal.returns_policy || RETURNS_TEXT}
          </p>
        )}
        {legal.fine_print && (
          <p className="pdp-legal__text">
            <span className="pdp-details__label">תנאים: </span>
            {legal.fine_print}
          </p>
        )}
        <p className="pdp-details__note">
          <Link href="/terms" className="text-link hover:underline">
            תקנון האתר
          </Link>
          {' · '}
          <Link href="/returns" className="text-link hover:underline">
            מדיניות ביטולים והחזרות
          </Link>
        </p>
      </section>
    </details>
  )
}
