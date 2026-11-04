import { t } from '@/lib/i18n/messages'
import { googleMapsSearchLink, wazeSearchLink } from '@/lib/waze'

export interface ConfirmSupplier {
  name: string | null
  address: string | null
  city: string | null
}

/**
 * Where the coupon is redeemed, on the coupon itself.
 *
 * Name, address and two map links. No phone and no supplier WhatsApp: the
 * store's contact policy is email and the store's own wa.me line, and the
 * supplier's WhatsApp is gated per product by `whatsapp_enabled`, which this
 * page does not read. The map links follow `waze.ts`: a street address or no
 * link, because a pin on a city centre is not where the coupon is used.
 */
export default function BusinessDetails({ supplier }: { supplier: ConfirmSupplier | null }) {
  const name = supplier?.name?.trim() || null
  const address = supplier?.address?.trim() || null
  const city = supplier?.city?.trim() || null
  const addressLine = [address, city && !address?.includes(city) ? city : null]
    .filter(Boolean)
    .join(', ')
  const waze = wazeSearchLink(address, city)
  const maps = googleMapsSearchLink(address, city)
  if (!name && !addressLine) return null

  return (
    <div className="confirm-business" data-testid="business-details">
      <div className="confirm-business__title">{t('checkout.confirm.businessTitle')}</div>
      {name && <div className="confirm-business__name">{name}</div>}
      {addressLine && <div className="confirm-business__address">{addressLine}</div>}
      {(waze || maps) && (
        <div className="confirm-business__links">
          {waze && (
            <a href={waze} target="_blank" rel="noopener noreferrer" data-testid="map-waze">
              {t('checkout.confirm.waze')}
            </a>
          )}
          {maps && (
            <a href={maps} target="_blank" rel="noopener noreferrer" data-testid="map-google">
              {t('checkout.confirm.maps')}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
