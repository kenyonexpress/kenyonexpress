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
  productType: 'coupon' | 'physical' | 'service'
}) {
  return (
    <section
      aria-label="פרטי ספק"
      className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6"
    >
      <h2 className="text-base font-bold text-heading">פרטי הספק</h2>

      {supplier ? (
        <p className="mt-3 text-sm">
          <span className="text-gray-500">ספק: </span>
          <span className="font-medium text-heading">{supplier.name}</span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-gray-500">פרטי הספק יתעדכנו בקרוב.</p>
      )}

      <p className="mt-3 text-xs text-gray-500">
        {productType === 'coupon'
          ? 'מימוש הקופון מתבצע ישירות מול הספק בבית העסק.'
          : 'המוצר נשלח ומסופק על ידי הספק.'}
      </p>
    </section>
  )
}
