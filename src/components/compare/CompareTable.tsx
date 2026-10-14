'use client'

import AddToCartButton from '@/components/cart/AddToCartButton'
import { useCompareList } from '@/components/compare/useCompareList'
import { type CompareColumn, cheapestId, toCompareColumn } from '@/lib/compare/rows'
import { shekels } from '@/lib/money-format'
import { getCompareProducts } from '@/server/actions/compare'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * The comparison table: one column per picked product, one row per fact.
 *
 * The list lives in this browser, so the table is built after mount from the
 * ids in storage and a public read of the current catalogue. A product that
 * was picked and has since been withdrawn is simply not in the answer, and
 * the table shows the ones that are.
 *
 * A real <table>, with the product names as column headers and each fact as a
 * row header, because that is what this content is: a screen reader can then
 * say "מחיר, <product>" for any cell. It scrolls sideways inside its own box
 * on a narrow screen; the page never does.
 */

type State = { status: 'loading' } | { status: 'ready'; columns: CompareColumn[] }

export default function CompareTable() {
  const { list, ready, remove, clear } = useCompareList()
  const [state, setState] = useState<State>({ status: 'loading' })
  const key = list.join(',')

  useEffect(() => {
    if (!ready) return
    const ids = key ? key.split(',') : []
    if (ids.length === 0) {
      setState({ status: 'ready', columns: [] })
      return
    }
    let cancelled = false
    void getCompareProducts(ids).then((products) => {
      if (!cancelled) setState({ status: 'ready', columns: products.map(toCompareColumn) })
    })
    return () => {
      cancelled = true
    }
  }, [ready, key])

  if (state.status === 'loading') {
    return (
      <p className="compare-page__note" aria-live="polite">
        טוענים את המוצרים להשוואה...
      </p>
    )
  }

  const columns = state.columns
  if (columns.length === 0) {
    return (
      <div className="compare-page__note">
        <p>עדיין לא נבחרו מוצרים להשוואה.</p>
        <p>
          בדף המוצרים, לחצו על סמל המאזניים בכרטיס של כל מוצר שתרצו להשוות.{' '}
          <Link href="/products">לכל המוצרים</Link>
        </p>
      </div>
    )
  }

  const cheapest = cheapestId(columns)
  const dash = '—'

  return (
    <>
      <div className="compare-page__scroll">
        <table className="compare-table">
          <caption className="sr-only">השוואה בין {columns.length} מוצרים</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">מאפיין</span>
              </th>
              {columns.map((column) => (
                <th scope="col" key={column.id}>
                  <Link href={`/product/${column.slug}`} className="compare-table__product">
                    {column.image ? (
                      <Image
                        src={column.image}
                        alt=""
                        width={120}
                        height={120}
                        sizes="120px"
                        loading="lazy"
                      />
                    ) : null}
                    <span>{column.name}</span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">מחיר</th>
              {columns.map((column) => (
                <td key={column.id}>
                  {column.priceAgorot !== null ? (
                    <>
                      <strong>{shekels(column.priceAgorot)}</strong>
                      {column.id === cheapest && (
                        <span className="compare-table__best"> המחיר הנמוך ביותר</span>
                      )}
                    </>
                  ) : (
                    dash
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">מחיר מלא</th>
              {columns.map((column) => (
                <td key={column.id}>
                  {column.fullPriceAgorot !== null ? (
                    <del>{shekels(column.fullPriceAgorot)}</del>
                  ) : (
                    dash
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">חיסכון</th>
              {columns.map((column) => (
                <td key={column.id}>
                  {column.savingAgorot !== null && column.discountPercent !== null
                    ? `${shekels(column.savingAgorot)} (${column.discountPercent}%)`
                    : dash}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">קטגוריה</th>
              {columns.map((column) => (
                <td key={column.id}>
                  {column.category ? (
                    <Link href={`/category/${column.category.slug}`}>
                      {column.category.name_he}
                    </Link>
                  ) : (
                    dash
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">זמינות</th>
              {columns.map((column) => (
                <td key={column.id}>{column.inStock ? 'במלאי' : 'אזל מהמלאי'}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">תוקף השובר</th>
              {columns.map((column) => (
                <td key={column.id}>
                  {column.voucherDays !== null ? `${column.voucherDays} ימים מהרכישה` : dash}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">תיאור</th>
              {columns.map((column) => (
                <td key={column.id}>{column.description ?? dash}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">
                <span className="sr-only">פעולות</span>
              </th>
              {columns.map((column) => (
                <td key={column.id}>
                  <div className="compare-table__actions">
                    {column.priceAgorot !== null && column.inStock && (
                      <AddToCartButton
                        productId={column.id}
                        productName={column.name}
                        priceAgorot={column.priceAgorot}
                      >
                        הוספה לסל
                      </AddToCartButton>
                    )}
                    <button
                      type="button"
                      className="compare-table__remove"
                      onClick={() => remove(column.id)}
                      aria-label={`הסר מההשוואה: ${column.name}`}
                    >
                      הסרה
                    </button>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="compare-page__note">
        <button type="button" className="compare-table__remove" onClick={clear}>
          ניקוי ההשוואה
        </button>
      </p>
    </>
  )
}
