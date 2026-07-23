'use client'

import ProductCard, { type Product } from '@/components/ProductCard'
import { useState } from 'react'

/** refs/electro.html .section-products-carousel — Featured Products with filter tabs */
const TABS = [
  { id: 'recommended', label: 'מומלצים' },
  { id: 'sale', label: 'במבצע' },
  { id: 'instock', label: 'במלאי' },
] as const

type TabId = (typeof TABS)[number]['id']

function filterProducts(products: Product[], tab: TabId): Product[] {
  if (tab === 'sale') {
    return products.filter(
      (p) => p.full_price != null && Number(p.full_price) > Number(p.kenyon_price ?? 0),
    )
  }
  if (tab === 'instock') {
    return products.filter((p) => (p.stock_quantity ?? 0) > 0)
  }
  return products
}

export default function FeaturedProductsTabs({ products }: { products: Product[] }) {
  const [active, setActive] = useState<TabId>('recommended')
  const visible = filterProducts(products, active).slice(0, 8)

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#ededed] pb-3">
        <h2 className="text-[22px] font-bold text-heading">מוצרים מומלצים</h2>
        <nav className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              aria-pressed={active === t.id}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                active === t.id
                  ? 'bg-brand-primary text-heading'
                  : 'text-muted hover:text-heading'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {visible.length > 0 ? (
        <div className="jet-listing-grid-deals bg-white">
          {visible.map((product) => (
            <div key={product.id} className="jet-listing-grid-deals__item">
              <ProductCard product={product} variant="deals" />
            </div>
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted">אין מוצרים להצגה</p>
      )}
    </div>
  )
}
