import LocationPin from '@/components/icons/LocationPin'

/** What a product with no city shows: the deal is valid anywhere. */
export const NATIONWIDE_LABEL = 'כל הארץ'

/** The label for a product's location: its city, or nationwide when unset. */
export function productLocationLabel(city: string | null | undefined): string {
  const trimmed = typeof city === 'string' ? city.trim() : ''
  return trimmed.length > 0 ? trimmed : NATIONWIDE_LABEL
}

/**
 * The small line above a product title: pin, then city. The pin comes first in
 * the DOM, so in the RTL page it sits on the right of the text.
 */
export default function ProductLocation({
  city,
  className,
}: {
  city: string | null | undefined
  className?: string
}) {
  return (
    <span className={['product-location', className].filter(Boolean).join(' ')}>
      <LocationPin size={16} />
      <span className="product-location__text">{productLocationLabel(city)}</span>
    </span>
  )
}
