'use client'

import { bulkUpdateProductStatus } from '@/server/actions/admin/products'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

export default function ProductBulkClient({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLDivElement>) {
    const target = e.target as HTMLInputElement
    if (!('productId' in target.dataset) && !('selectAll' in target.dataset)) return

    if ('selectAll' in target.dataset) {
      const all =
        containerRef.current?.querySelectorAll<HTMLInputElement>('[data-product-id]') ?? []
      const ids = Array.from(all).map((el) => el.dataset.productId ?? '')
      setSelected(target.checked ? ids : [])
      for (const el of Array.from(all)) {
        el.checked = target.checked
      }
      return
    }

    const id = target.dataset.productId ?? ''
    setSelected((prev) => (target.checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  async function handleBulk(status: 'active' | 'archived' | 'paused' | 'draft') {
    if (!selected.length) {
      toast.error('לא נבחרו מוצרים')
      return
    }
    const result = await bulkUpdateProductStatus(selected, status)
    if (result.error) toast.error(result.error)
    else {
      toast.success(`${selected.length} מוצרים עודכנו`)
      setSelected([])
    }
  }

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-xs text-gray-600">{selected.length} נבחרו</span>
          <button
            type="button"
            onClick={() => handleBulk('active')}
            className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
          >
            הפעל
          </button>
          <button
            type="button"
            onClick={() => handleBulk('paused')}
            className="px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200"
          >
            השהה
          </button>
          <button
            type="button"
            onClick={() => handleBulk('archived')}
            className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            ארכיון
          </button>
        </div>
      )}
      <div ref={containerRef} onChange={handleChange}>
        {children}
      </div>
    </div>
  )
}
