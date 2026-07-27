export type SupplierSummary = { id: string; name: string } | null

// Renders supplier details on EVERY product page (coupon and physical). When no
// supplier is linked it still renders with a graceful placeholder, so the block
// is always present. Only the public-safe supplier name is shown (contact
// details stay private). Colours come from tokens (text-heading); layout uses
// logical flow so it mirrors correctly under RTL.
export default function SupplierInfo({
  supplier,
  productType,
}: {
  supplier: SupplierSummary
  productType: 'coupon' | 'physical' | 'service' | 'subscription'
}) {
  return (
    <section aria-label="פרטי ספק">
      <h2 className="pdp-details__title">פרטי הספק</h2>

      {supplier ? (
        <p className="pdp-details__list">
          <span className="pdp-details__label">ספק: </span>
          <span className="font-medium">{supplier.name}</span>
        </p>
      ) : (
        <p className="pdp-details__list pdp-details__label">פרטי הספק יתעדכנו בקרוב.</p>
      )}

      <p className="pdp-details__note">
        {productType === 'coupon'
          ? 'מימוש הקופון מתבצע ישירות מול הספק בבית העסק.'
          : 'המוצר נשלח ומסופק על ידי הספק.'}
      </p>
    </section>
  )
}
