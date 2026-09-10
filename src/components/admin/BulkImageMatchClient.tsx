'use client'

import ImageUploader from '@/components/admin/ImageUploader'
import { MATCH_PROBLEM_LABELS } from '@/lib/admin/image-matching'
import { type BulkImageState, bulkAttachImages } from '@/server/actions/admin/product-images'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * Upload a folder of images, see which product each file will attach to, then
 * apply.
 *
 * THE PAIRING IS KEPT ON THE CLIENT AND NOWHERE ELSE, and that is forced by the
 * upload path: `processAndUploadImage` keys every file as `<folder>/<uuid>`, so
 * the moment a file becomes a URL its name is gone. This component holds
 * `{ filename, url }` from `onUploaded` and sends both to the server, which is
 * the only point at which a filename can still be matched to a SKU or a slug.
 *
 * TWO STEPS, NOT ONE. Uploading does not attach anything: the operator sees the
 * match list first and presses a second button. Dragging in the wrong folder is
 * the ordinary mistake here, and a one-click flow would have written it to the
 * catalogue before they could read what it decided.
 */
export default function BulkImageMatchClient() {
  const [urls, setUrls] = useState<string[]>([])
  const [pairs, setPairs] = useState<{ filename: string; url: string }[]>([])
  const [state, setState] = useState<BulkImageState>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function apply() {
    startTransition(async () => {
      const result = await bulkAttachImages(pairs)
      setState(result)
      if (result && 'attached' in result && result.attached > 0) {
        setPairs([])
        setUrls([])
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-heading">1. העלאת הקבצים</h2>
        <p className="mt-1 text-xs text-black/50">
          שם כל קובץ צריך להיות המק"ט של המוצר, ואם אין מק"ט אז ה-slug שלו. הסיומת אינה חשובה.
        </p>
        <div className="mt-4">
          <ImageUploader
            bucket="product-images"
            folder="products"
            value={urls}
            onChange={setUrls}
            onUploaded={(uploaded) => setPairs((prev) => [...prev, ...uploaded])}
            maxFiles={50}
            altKind="product"
          />
        </div>
      </section>

      {pairs.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-bold text-heading">2. שיוך למוצרים</h2>
          <p className="mt-1 text-xs text-black/50">
            {pairs.length} קבצים הועלו. השיוך עצמו עוד לא בוצע.
          </p>
          <ul className="mt-3 space-y-1 text-xs text-black/70">
            {pairs.map((pair) => (
              <li key={pair.url} dir="ltr" className="text-start font-mono">
                {pair.filename}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={pending}
            onClick={apply}
            className="mt-4 rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-heading transition-colors hover:bg-brand-primary-hover disabled:opacity-60"
          >
            {pending ? 'משייך...' : 'שייך למוצרים'}
          </button>
        </section>
      )}

      {state && 'error' in state && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {state.error}
        </p>
      )}

      {state && 'result' in state && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-bold text-heading">התוצאה</h2>
          <p className="mt-1 text-sm text-black/70">{state.success}</p>

          {state.result.matched.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-black/70">
              {state.result.matched.map((match) => (
                <li key={match.filename}>
                  <span dir="ltr" className="font-mono">
                    {match.filename}
                  </span>{' '}
                  ← {match.productNameHe ?? match.productId} (
                  {match.matchedOn === 'sku' ? 'מק"ט' : 'slug'})
                </li>
              ))}
            </ul>
          )}

          {/* The unmatched list is the point of the screen, not an afterthought:
              a file that attached to nothing is invisible everywhere else. */}
          {state.result.problems.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-900">
                {state.result.problems.length} קבצים לא שויכו:
              </p>
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {state.result.problems.map((problem) => (
                  <li key={problem.filename}>
                    <span dir="ltr" className="font-mono">
                      {problem.filename}
                    </span>{' '}
                    - {MATCH_PROBLEM_LABELS[problem.reason]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
