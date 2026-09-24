import { t } from '@/lib/i18n/messages'

/** The validity windows an admin can pick for a coupon product, in days. */
export const COUPON_EXPIRY_PRESETS = [30, 60, 90] as const

/**
 * Per-product voucher validity: 30, 60 or 90 days from purchase.
 *
 * A legacy value outside the presets (a CSV import, an older product) stays
 * selectable as its own option so opening and saving the form never silently
 * rewrites it. The empty option is a real, invalid choice: the server schema
 * still refuses a coupon product with no validity, there is no default here.
 */
export default function CouponExpirySelect({
  id = 'coupon_expiry_days',
  defaultValue,
  className,
  required,
}: {
  id?: string
  defaultValue?: number | null
  className?: string
  required?: boolean
}) {
  const current = defaultValue && defaultValue > 0 ? defaultValue : null
  const legacy =
    current !== null && !(COUPON_EXPIRY_PRESETS as readonly number[]).includes(current)
      ? current
      : null
  return (
    <select
      id={id}
      name="coupon_expiry_days"
      defaultValue={current === null ? '' : String(current)}
      dir="ltr"
      className={className}
      required={required}
    >
      <option value="">{t('couponExpiry.choose')}</option>
      {legacy !== null && (
        <option value={legacy}>
          {legacy} {t('couponExpiry.legacy')}
        </option>
      )}
      {COUPON_EXPIRY_PRESETS.map((days) => (
        <option key={days} value={days}>
          {days} {t('couponExpiry.days')}
        </option>
      ))}
    </select>
  )
}
