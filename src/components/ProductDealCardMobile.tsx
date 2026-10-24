import ProductLocation from '@/components/product-card/ProductLocation'
import LocationPin from '@/components/product/LocationPin'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import Image from 'next/image'

type Product = {
  id: string
  slug: string
  name_he: string
  kenyon_price: number | null
  images: unknown
  full_price?: number | null
  category?: { name_he: string; slug: string } | null
  /** products.city; NULL renders as nationwide. */
  city?: string | null
  /** products.latitude for Waze navigation */
  latitude?: number | null
  /** products.longitude for Waze navigation */
  longitude?: number | null
}

/**
 * Ultra-simplified mobile card (380px) for maximum Electro parity.
 * Absolute minimal DOM, inline styles only, no complexity.
 */
export default function ProductDealCardMobile({ product }: { product: Product }) {
  const thumb =
    Array.isArray(product.images) && typeof product.images[0] === 'string'
      ? (product.images[0] as string)
      : null

  const price = Number(product.kenyon_price ?? 0)
  const old = product.full_price != null ? Number(product.full_price) : null

  const locationPin = (
    <LocationPin
      location={{
        city: product.city,
        latitude: product.latitude,
        longitude: product.longitude,
      }}
    />
  )

  return (
    <div
      style={{
        padding: '16px 12px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      {thumb && (
        <Image
          src={thumb}
          alt={product.name_he}
          width={300}
          height={300}
          style={{ width: '100%', height: 'auto', marginBottom: '12px' }}
        />
      )}
      <div style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--color-muted)' }}>
        {locationPin || <ProductLocation city={product.city} />}
      </div>
      <h2 style={{ fontSize: '16px', fontWeight: 500, margin: '0 0 8px 0', lineHeight: 1.4 }}>
        {product.name_he}
      </h2>
      <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-price)' }}>
        {shekelsFromIlsRounded(price)}
      </div>
      {old && old > price && (
        <div
          style={{
            fontSize: '14px',
            color: 'var(--color-muted)',
            textDecoration: 'line-through',
            marginTop: '4px',
          }}
        >
          {shekelsFromIlsRounded(old)}
        </div>
      )}
    </div>
  )
}
