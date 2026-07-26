/**
 * Shipping and delivery, on physical product pages only.
 *
 * What is deliberately absent: the platform/supplier split. `platform_percent`
 * decides how the money divides AFTER the sale and is snapshotted onto the
 * order line at purchase; the customer pays the same full price whichever way
 * it divides. Surfacing it would expose the supplier's margin to shoppers and
 * to competitors for no benefit to the buyer. The split is visible in the admin
 * console and on the supplier portal, which is where it belongs.
 */
export default function ShippingInfo({
  requiresShipping,
  weightGrams,
  warrantyMonths,
}: {
  requiresShipping: boolean | null
  weightGrams: number | null
  warrantyMonths: number | null
}) {
  // A product that ships nowhere and carries no warranty has nothing to say
  // here; an empty bordered card is worse than no card.
  if (requiresShipping === false && warrantyMonths == null) return null

  return (
    <section
      aria-label="משלוח ואספקה"
      className="rounded-2xl border border-border bg-white p-5 lg:p-6"
    >
      <h2 className="text-base font-bold text-heading">משלוח ואספקה</h2>

      <ul className="mt-3 space-y-1.5 text-sm text-heading">
        {requiresShipping === false ? (
          <li>מוצר דיגיטלי, נשלח במייל ואינו דורש משלוח פיזי.</li>
        ) : (
          <>
            <li>
              <span className="text-muted">זמן אספקה משוער: </span>
              <span className="font-medium">3-7 ימי עסקים</span>
            </li>
            <li>
              <span className="text-muted">אופן המשלוח: </span>
              <span className="font-medium">נשלח ישירות על ידי הספק</span>
            </li>
            {weightGrams != null && weightGrams > 0 && (
              <li>
                <span className="text-muted">משקל: </span>
                <span className="font-medium">
                  {weightGrams >= 1000
                    ? `${(weightGrams / 1000).toLocaleString('he-IL', { maximumFractionDigits: 2 })} ק"ג`
                    : `${weightGrams} גרם`}
                </span>
              </li>
            )}
          </>
        )}

        {warrantyMonths != null && warrantyMonths > 0 && (
          <li>
            <span className="text-muted">אחריות: </span>
            <span className="font-medium">{warrantyMonths} חודשים</span>
          </li>
        )}
      </ul>

      <p className="mt-3 text-xs text-muted">
        זמני האספקה נמדדים מרגע אישור ההזמנה ואינם כוללים סופי שבוע וחגים.
      </p>
    </section>
  )
}
