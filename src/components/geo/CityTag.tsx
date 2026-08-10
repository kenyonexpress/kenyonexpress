import { cityByName } from '@/lib/geo/cities'
import { MapPin } from 'lucide-react'
import Link from 'next/link'

/**
 * "Where is this deal", as one tag.
 *
 * The catalogue card grew its own copy of this first
 * (`CategoryProductCard`, `.category-card__city`) and keeps it: that one also
 * renders a distance, and it is styled to sit inside the card's tag row. This
 * component is for the two surfaces that had NO city at all -- the product page
 * and the home card.
 *
 * WHAT IT WILL NOT DO. `cityByName` returns null for anything not in the city
 * table rather than guessing at a near-match, so a business is never labelled
 * with a city it is not in, and an unknown city renders nothing instead of
 * raw `suppliers.city` free text. That table is hand-typed, so it contains
 * things like empty strings and 'רמת' -- see the cityByName tests.
 *
 * RTL: the tag is inline content inside an `dir="rtl"` document. The icon
 * leads because in RTL that is the right-hand, reading-first edge; `gap`
 * rather than a margin keeps it correct under either direction without a
 * logical-property override.
 */
export default function CityTag({
  city,
  href,
  className = '',
}: {
  /** Free text, straight off the row. Unknown values render nothing. */
  city: string | null | undefined
  /** When set, the tag links to the city-filtered catalogue. */
  href?: string
  className?: string
}) {
  const known = cityByName(city)
  if (!known) return null

  const body = (
    <>
      <MapPin size={12} aria-hidden="true" className="shrink-0" />
      {known.name}
    </>
  )

  const classes = `city-tag ${className}`.trim()

  // A plain span when there is nowhere to go: a link to the page you are
  // already on is a tab stop that does nothing.
  if (!href) {
    return (
      <span className={classes} data-city={known.slug}>
        {body}
      </span>
    )
  }

  return (
    <Link href={href} className={`${classes} city-tag--link`} data-city={known.slug}>
      {body}
    </Link>
  )
}
