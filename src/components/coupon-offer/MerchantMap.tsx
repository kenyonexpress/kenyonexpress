import type { SupplierLocation } from '@/lib/geo/distance'
import { buildMerchantMap } from '@/lib/geo/merchant-map'
import type { SupplierContactView } from '@/lib/supplier-contact'
import { MapPin, Navigation } from 'lucide-react'

/**
 * Where the coupon is redeemed, on a map.
 *
 * An OpenStreetMap embed, lazy, with the address and the navigation links
 * beside it. What the map shows depends on what the catalogue knows, and the
 * caption says which: a supplier coordinate is "מיקום מדויק", a city fallback
 * is "מיקום משוער לפי עיר". Measured against production every live supplier
 * is the second case, so the caption is the common path, not an edge.
 *
 * NO LOCATION AT ALL renders the section without a map rather than nothing:
 * the business name and the sentence that redemption happens at the counter
 * still belong on a coupon page, and an empty gap where a map should be
 * reads as a broken page.
 */
export default function MerchantMap({
  location,
  contact,
}: {
  location: SupplierLocation
  contact: SupplierContactView
}) {
  const map = buildMerchantMap(location)
  const title = contact.name ?? 'בית העסק'

  return (
    <section className="cpn-map" aria-labelledby="cpn-map-title" data-cpn="map">
      <h2 id="cpn-map-title" className="cpn-map__title">
        איפה מממשים
      </h2>
      <div className="cpn-map__grid">
        {map ? (
          <figure className="cpn-map__figure">
            <iframe
              src={map.embedSrc}
              title={`מפה: ${title}`}
              className="cpn-map__frame"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-popups"
              data-precision={map.precision}
            />
            <figcaption className="cpn-map__caption">{map.precisionLabel}</figcaption>
          </figure>
        ) : (
          <div className="cpn-map__missing">
            <MapPin size={20} aria-hidden="true" />
            <p>מיקום בית העסק יתעדכן בקרוב. כתובת מדויקת מופיעה על השובר לאחר הרכישה.</p>
          </div>
        )}

        <div className="cpn-map__details">
          <p className="cpn-map__name">{title}</p>
          {contact.addressLine && (
            <p className="cpn-map__address">
              <MapPin size={16} aria-hidden="true" />
              <span>{contact.addressLine}</span>
            </p>
          )}
          {!contact.addressLine && location.city && (
            <p className="cpn-map__address">
              <MapPin size={16} aria-hidden="true" />
              <span>{location.city.name}</span>
            </p>
          )}
          <p className="cpn-map__note">המימוש מתבצע בבית העסק, בהצגת השובר בקופה.</p>
          <div className="cpn-map__links">
            {contact.wazeHref && (
              <a
                href={contact.wazeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="cpn-map__link"
              >
                <Navigation size={16} aria-hidden="true" />
                ניווט ב-Waze
              </a>
            )}
            {map && (
              <a
                href={map.googleMapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="cpn-map__link"
              >
                <MapPin size={16} aria-hidden="true" />
                פתיחה ב-Google Maps
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
