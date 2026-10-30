'use client'

import CategoryAutocomplete from '@/components/category/CategoryAutocomplete'
import PriceRangeSlider from '@/components/category/PriceRangeSlider'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

type Props = {
  priceMin?: number
  priceMax?: number
  categoryMinPrice?: number
  categoryMaxPrice?: number
  productType?: 'coupon' | 'physical'
  suppliers?: { supplier_id: string; supplier_name_he: string; product_count: number }[]
  tags?: { tag: string; product_count: number }[]
  categoryId?: string
  categorySlug?: string
  categoryName?: string
}

export default function CategoryFilterSidebar({
  priceMin,
  priceMax,
  categoryMinPrice = 0,
  categoryMaxPrice = 100000,
  suppliers,
  tags,
  categorySlug,
  categoryName,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
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

  function applyPrice(minVal: number, maxVal: number) {
    pushWith((params) => {
      if (minVal >= 0) params.set('min', String(minVal))
      else params.delete('min')
      if (maxVal >= 0) params.set('max', String(maxVal))
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
      {categorySlug && categoryName && (
        <CategoryAutocomplete categorySlug={categorySlug} categoryName={categoryName} />
      )}
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
              <PriceRangeSlider
                min={categoryMinPrice}
                max={categoryMaxPrice}
                minValue={priceMin}
                maxValue={priceMax}
                onApply={applyPrice}
                isPending={isPending}
              />
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
                      <button
                        type="button"
                        className="category-sidebar__supplier-filter-btn"
                        onClick={() => {
                          const params = new URLSearchParams(searchParams)
                          params.set('supplier', supplier.supplier_id)
                          params.delete('page')
                          const qs = params.toString()
                          startTransition(() => {
                            router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
                          })
                        }}
                        disabled={isPending}
                      >
                        <span className="category-sidebar__supplier-name">
                          {supplier.supplier_name_he}
                        </span>
                      </button>
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
                    <button
                      key={tag.tag}
                      type="button"
                      className="category-sidebar__tag-chip"
                      title={`${tag.product_count} מוצרים`}
                      onClick={() => {
                        const params = new URLSearchParams(searchParams)
                        params.set('tag', tag.tag)
                        params.delete('page')
                        const qs = params.toString()
                        startTransition(() => {
                          router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
                        })
                      }}
                      disabled={isPending}
                    >
                      {tag.tag}
                    </button>
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
