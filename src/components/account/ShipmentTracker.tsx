import { formatDateTime } from '@/lib/account/format'
import { TIMELINE_STEPS } from '@/lib/shipping/tracking'
import type { CustomerShipment } from '@/server/queries/shipments'

/**
 * The tracking widget on the order page (STEP 43): a four-step timeline per
 * parcel, the carrier and tracking number, the carrier's events, and the
 * link to the courier's own page when `carriers.ts` knows one.
 *
 * Server component, no state: everything it shows came from `shipments`
 * (258) or, until that is applied, from the order's lines, through
 * `server/queries/shipments.ts`. The `live` flag only changes the hint under
 * the timeline; the shape is the same either way so the page never has two
 * layouts for one fact.
 */
export default function ShipmentTracker({ shipments }: { shipments: CustomerShipment[] }) {
  if (shipments.length === 0) return null
  return (
    <section className="account-card" data-section="shipment-tracker">
      <h2 className="account-card__title">מעקב משלוח</h2>
      {shipments.map((shipment, index) => (
        <div
          className="account-row"
          key={shipment.id ?? shipment.trackingNumber ?? `s-${index}`}
          data-testid="shipment"
        >
          <div className="account-row__main">
            <p className="account-row__title">
              {shipment.carrierLabel ?? 'משלוח'}
              {shipment.serviceLabel ? ` · ${shipment.serviceLabel}` : ''}{' '}
              <span className={`account-chip account-chip--${shipment.tone}`}>
                {shipment.statusLabel}
              </span>
            </p>
            <ol className="shipment-timeline" aria-label="שלבי המשלוח">
              {TIMELINE_STEPS.map((step, i) => (
                <li
                  key={step.step}
                  className="shipment-timeline__step"
                  data-done={i <= shipment.step ? '' : undefined}
                  aria-current={i === shipment.step ? 'step' : undefined}
                >
                  {step.label}
                </li>
              ))}
            </ol>
            {shipment.trackingNumber && (
              <p className="account-row__meta">
                מספר מעקב: <span dir="ltr">{shipment.trackingNumber}</span>
                {shipment.trackingUrl && (
                  <>
                    {' · '}
                    <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                      למעקב אצל חברת המשלוחים
                    </a>
                  </>
                )}
              </p>
            )}
            {shipment.estimatedDelivery && shipment.status !== 'delivered' && (
              <p className="account-row__meta">
                מסירה משוערת:{' '}
                {formatDateTime(`${shipment.estimatedDelivery}T12:00:00Z`).slice(0, 10)}
              </p>
            )}
            {shipment.events.length > 0 && (
              <ul className="shipment-events">
                {shipment.events.slice(0, 6).map((event) => (
                  <li key={`${event.at}|${event.status}`} className="account-row__meta">
                    {formatDateTime(event.at)} · {event.description}
                    {event.location ? ` · ${event.location}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {!shipment.live && (
              <p className="account-row__meta">
                עדכוני המסלול המפורטים יופיעו כאן כשחברת המשלוחים תדווח עליהם.
              </p>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}
