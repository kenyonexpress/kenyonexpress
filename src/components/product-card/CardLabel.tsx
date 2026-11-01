import ProductLocation from '@/components/product-card/ProductLocation'
import Link from 'next/link'

type Category = { name_he: string; slug: string } | null | undefined

/**
 * CARD LABEL RULE (C130). The centered line above a product title:
 * - physical products keep the category name, no city, no pin;
 * - everything else (coupon, service, recurring: a service at a physical
 *   place) shows the business city with a pin instead of the category, and
 *   reads "כל הארץ" only when the business has no city.
 * `type` is products.type; when a caller has not fetched it, a product that
 * ships nationwide counts as physical and the rest as a place.
 */
export function isPlaceProduct(
  type?: string | null,
  isPhysicalShipping?: boolean | null,
  isCouponEnabled?: boolean | null,
): boolean {
  // Same precedence as lib/commerce/product-type.ts: the admin's coupon opt-in wins.
  if (isCouponEnabled) return true
  if (type) return type !== 'physical'
  return !isPhysicalShipping
}

export default function CardLabel({
  type,
  isPhysicalShipping,
  isCouponEnabled,
  city,
  category,
  categoryHref,
  className,
}: {
  type?: string | null
  isCouponEnabled?: boolean | null
  isPhysicalShipping?: boolean | null
  city?: string | null
  category?: Category
  categoryHref?: (slug: string) => string
  className?: string
}) {
  const cls = ['card-label', className].filter(Boolean).join(' ')
  if (isPlaceProduct(type, isPhysicalShipping, isCouponEnabled)) {
    return <ProductLocation city={city} className={cls} />
  }
  if (!category) return null
  const href = categoryHref ? categoryHref(category.slug) : `/category/${category.slug}`
  return (
    <Link href={href} className={cls}>
      {category.name_he}
    </Link>
  )
}
