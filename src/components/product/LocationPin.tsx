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
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        className="shrink-0"
      >
        <path
          fill="currentColor"
          d="M12 2a8 8 0 0 0-8 8c0 2 .6 3.4 1.6 5.2.5.9.4 1.6-.2 2.6-.2.4 0 .8.5.8 1.3 0 2.7-.3 3.7-.8 1 .4 2 .6 3 .6h.4a8 8 0 0 0 0-16Zm-3 8a1.2 1.2 0 1 1 0-2.4A1.2 1.2 0 0 1 9 10Zm6 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Zm-6.2 2.4h6.4a3.2 3.2 0 0 1-6.4 0Z"
        />
      </svg>
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
