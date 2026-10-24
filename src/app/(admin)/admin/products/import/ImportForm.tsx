'use client'

import { type ProductImportState, importProductsCsv } from '@/server/actions/admin/product-import'
import { useActionState, useRef, useState } from 'react'

const PREVIEW_COLUMNS = [
  'slug',
  'name_he',
  'type',
  'kenyon_price',
  'platform_percent',
  'city',
  'shipping_price_agorot',
  'cancellation_window_days',
  'payout_cadence',
] as const

/**
 * Two steps on one file: "בדיקה" posts mode=preview and writes nothing; once
 * the preview is clean enough, "אישור ייבוא" posts the same file with
 * mode=commit. Picking a different file resets to the preview step.
 */
export default function ImportForm() {
  // React clears an uncontrolled form (the file input included) once a form
  // action settles, so the chosen file is kept here and re-attached to every
  // submit. Without it the commit step arrives with no file.
  const fileRef = useRef<File | null>(null)
  const [state, action, pending] = useActionState<ProductImportState, FormData>(
    (prev, formData) => {
      if (fileRef.current) formData.set('file', fileRef.current)
      return importProductsCsv(prev, formData)
    },
    null,
  )
  const [submitted, setSubmitted] = useState<'preview' | 'commit'>('preview')
  const canCommit = state?.dryRun === true && (state.preview?.length ?? 0) > 0

  return (
    <form action={action} className="space-y-3">
      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          fileRef.current = e.target.files?.[0] ?? null
          setSubmitted('preview')
        }}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          name="mode"
          value="preview"
          disabled={pending}
          onClick={() => setSubmitted('preview')}
          className="rounded border border-gray-900 px-4 py-2"
        >
          {pending && submitted === 'preview' ? 'בודק...' : 'בדיקה (בלי לשמור)'}
        </button>
        {canCommit && (
          <button
            type="submit"
            name="mode"
            value="commit"
            disabled={pending}
            onClick={() => setSubmitted('commit')}
            className="rounded bg-gray-900 px-4 py-2 text-white"
          >
            {pending && submitted === 'commit'
              ? 'מייבא...'
              : `אישור ייבוא של ${state?.preview?.length} שורות`}
          </button>
        )}
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state && (state.unknownColumns?.length ?? 0) > 0 && (
        <p className="text-sm">
          עמודות שהתעלמו מהן: <span dir="ltr">{state.unknownColumns?.join(', ')}</span>
        </p>
      )}
      {state?.failures?.map((f) => (
        <p key={f.line} className="text-sm text-red-700">
          {f.error}
        </p>
      ))}
      {state?.dryRun && state.preview && state.preview.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="text-start text-sm">
              תצוגה מקדימה: {state.preview.length} שורות תקינות. שום דבר עוד לא נשמר.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="p-1 text-start">
                  שורה
                </th>
                {PREVIEW_COLUMNS.map((c) => (
                  <th key={c} scope="col" className="p-1 text-start" dir="ltr">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.preview.map((row) => (
                <tr key={row.line} className="border-t">
                  <td className="p-1">{row.line}</td>
                  {PREVIEW_COLUMNS.map((c) => (
                    <td key={c} className="p-1">
                      {row.fields[c] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state && !state.dryRun && state.imported !== undefined && (
        <output className="block text-sm">יובאו {state.imported} מוצרים כטיוטה.</output>
      )}
    </form>
  )
}
