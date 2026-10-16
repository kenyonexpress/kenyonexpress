'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

type Props = {
  priceMin?: number
  priceMax?: number
  productType?: 'coupon' | 'physical'
  suppliers?: { supplier_id: string; supplier_name_he: string; product_count: number }[]
  tags?: { tag: string; product_count: number }[]
  categoryId?: string
}

export default function CategoryFilterSidebar({ priceMin, priceMax, suppliers, tags }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [min, setMin] = useState(priceMin != null ? String(priceMin) : '')
  const [max, setMax] = useState(priceMax != null ? String(priceMax) : '')
  const [openSections, setOpenSections] = useState({
    price: true,
    suppliers: true,
    tags: true,
  })

  function pushWith(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams)
    mutate(params)
    params.delete('page')
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  function applyPrice(e: React.FormEvent) {
    e.preventDefault()
    pushWith((params) => {
      if (min && Number(min) >= 0) params.set('min', min)
      else params.delete('min')
      if (max && Number(max) >= 0) params.set('max', max)
      else params.delete('max')
    })
  }

  function toggleSection(section: keyof typeof openSections) {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const hasSuppliers = suppliers && suppliers.length > 0
  const hasTags = tags && tags.length > 0

  return (
    <aside id="category-filters" className="category-sidebar" aria-label="סינון מוצרים">
      <div className="category-sidebar__filters">
        {/* Price filter */}
        <div className="category-sidebar__filter-section">
          <button
            type="button"
            className={`category-sidebar__filter-header ${openSections.price ? 'is-open' : ''}`}
            onClick={() => toggleSection('price')}
            aria-expanded={openSections.price}
          >
            <span className="category-sidebar__filter-title">טווח מחירים</span>
            <span className="category-sidebar__filter-icon">▼</span>
          </button>
          {openSections.price && (
            <div className="category-sidebar__filter-content">
              <form className="category-sidebar__price-form" onSubmit={applyPrice}>
                <div className="category-sidebar__price-row">
                  <label className="sr-only" htmlFor="price-min">
                    מחיר מינימלי
                  </label>
                  <input
                    id="price-min"
                    className="category-sidebar__price-input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="מ- ₪"
                    value={min}
                    onChange={(e) => setMin(e.target.value)}
                  />
                  <span className="category-sidebar__price-separator">-</span>
                  <label className="sr-only" htmlFor="price-max">
                    מחיר מקסימלי
                  </label>
                  <input
                    id="price-max"
                    className="category-sidebar__price-input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="עד ₪"
                    value={max}
                    onChange={(e) => setMax(e.target.value)}
                  />
                </div>
                <button type="submit" className="category-sidebar__price-btn" disabled={isPending}>
                  סינון
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Suppliers filter */}
        {hasSuppliers && (
          <div className="category-sidebar__filter-section">
            <button
              type="button"
              className={`category-sidebar__filter-header ${openSections.suppliers ? 'is-open' : ''}`}
              onClick={() => toggleSection('suppliers')}
              aria-expanded={openSections.suppliers}
            >
              <span className="category-sidebar__filter-title">ספקים</span>
              <span className="category-sidebar__filter-icon">▼</span>
            </button>
            {openSections.suppliers && (
              <div className="category-sidebar__filter-content">
                <ul className="category-sidebar__suppliers-list">
                  {suppliers.map((supplier) => (
                    <li key={supplier.supplier_id} className="category-sidebar__supplier-item">
                      <span className="category-sidebar__supplier-name">
                        {supplier.supplier_name_he}
                      </span>
                      <span className="category-sidebar__supplier-badge">
                        {supplier.product_count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Tags filter */}
        {hasTags && (
          <div className="category-sidebar__filter-section">
            <button
              type="button"
              className={`category-sidebar__filter-header ${openSections.tags ? 'is-open' : ''}`}
              onClick={() => toggleSection('tags')}
              aria-expanded={openSections.tags}
            >
              <span className="category-sidebar__filter-title">תגיות</span>
              <span className="category-sidebar__filter-icon">▼</span>
            </button>
            {openSections.tags && (
              <div className="category-sidebar__filter-content">
                <div className="category-sidebar__tags-cloud">
                  {tags.map((tag) => (
                    <span
                      key={tag.tag}
                      className="category-sidebar__tag-chip"
                      title={`${tag.product_count} מוצרים`}
                    >
                      {tag.tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
