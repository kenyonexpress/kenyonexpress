'use client'

import { type ProductImportState, importProductsCsv } from '@/server/actions/admin/product-import'
import { useActionState } from 'react'

export default function ImportForm() {
  const [state, action, pending] = useActionState<ProductImportState, FormData>(
    importProductsCsv,
    null,
  )
  return (
    <form action={action} className="space-y-3">
      <input type="file" name="file" accept=".csv,text/csv" required />
      <button type="submit" disabled={pending} className="rounded bg-gray-900 px-4 py-2 text-white">
        {pending ? 'מייבא...' : 'ייבוא'}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state && state.imported !== undefined && (
        <output className="block text-sm">
          <p>יובאו {state.imported} מוצרים כטיוטה.</p>
          {state.unknownColumns && state.unknownColumns.length > 0 && (
            <p>
              עמודות שהתעלמו מהן: <span dir="ltr">{state.unknownColumns.join(', ')}</span>
            </p>
          )}
          {state.failures?.map((f) => (
            <p key={f.line} className="text-red-700">
              שורה {f.line}: {f.error}
            </p>
          ))}
        </output>
      )}
    </form>
  )
}
