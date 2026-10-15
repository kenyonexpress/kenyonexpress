import { EcMapPointer } from '@/components/icons/electro-icons'
import { type PinLocation, locationPinHref } from '@/lib/waze-pin'

/**
 * City name with a Waze deep link. Display plus navigation only: no filter, no
 * "near me", no geolocation and no consent prompt.
 *
 * Renders nothing without a city. With a city but nothing to navigate to, it
 * prints the city as plain text rather than a dead link.
 */
export default function LocationPin({
  location,
  className,
}: {
  location: PinLocation
  className?: string
}) {
  const city = location.city?.trim()
  if (!city) return null
  const href = locationPinHref(location)
  const inner = (
    <>
      <EcMapPointer size={16} className="shrink-0" />
      <span>{city}</span>
    </>
  )
  const base = `inline-flex items-center gap-1 text-sm ${className ?? ''}`.trim()
  if (!href) return <span className={base}>{inner}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`ניווט ב-Waze אל ${city}`}
      className={`${base} hover:underline`}
    >
      {inner}
    </a>
  )
}
