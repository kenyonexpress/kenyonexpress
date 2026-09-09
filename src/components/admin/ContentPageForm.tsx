'use client'

import RichText from '@/components/content/RichText'
import type { AdminContentPage } from '@/lib/admin/content-pages'
import { parseFaqText } from '@/lib/content/faq-text'
import { excerpt } from '@/lib/content/markup'
import { type ContentPageActionState, saveContentPage } from '@/server/actions/admin/content-pages'
import { useActionState, useState } from 'react'

/**
 * The page editor, with the preview rendered by the same component the site
 * uses.
 *
 * THE PREVIEW IS NOT A SECOND RENDERER. It is `<RichText>`, the component
 * `/page/[slug]` and `/about` render with, fed from the textarea on every
 * keystroke. A preview built from its own markup is a preview that is wrong in
 * exactly the cases an operator needs it for: the ones where the parser did
 * something they did not expect. Since `parseBlocks` is pure and synchronous,
 * this costs nothing and cannot disagree with the page.
 *
 * NO `bound_route` FIELD, DELIBERATELY. 205 says why at length: binding is what
 * a route file does, and a form that could write it would let an operator point
 * a page at `/checkout` and put that URL in the sitemap. The bound address is
 * shown as text so the operator knows where the page lives.
 */

const INITIAL: ContentPageActionState = null

const LABEL = 'block text-sm font-medium text-gray-700 mb-1'
const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand'

export default function ContentPageForm({ page }: { page: AdminContentPage }) {
  const [state, action, pending] = useActionState(saveContentPage, INITIAL)

  const initialBody =
    page.body.kind === 'faq'
      ? page.body.entries.map((entry) => `## ${entry.question}\n${entry.answer}`).join('\n\n')
      : page.body.markup

  const [body, setBody] = useState(initialBody)
  const [status, setStatus] = useState(page.status)

  const error = state && 'error' in state ? state.error : null
  const success = state && 'success' in state ? state.success : null

  const faqPreview = page.body.kind === 'faq' ? parseFaqText(body) : []

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={action} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
        <input type="hidden" name="slug" value={page.slug} />
        <input type="hidden" name="bodyKind" value={page.body.kind} />
        <input type="hidden" name="status" value={status} />

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">{success}</div>
        )}

        <div>
          <label htmlFor="title" className={LABEL}>
            כותרת העמוד *
          </label>
          <input id="title" name="title" defaultValue={page.title} required className={INPUT} />
          <p className="mt-1 text-xs text-gray-500">
            זו הכותרת הראשית שנראית בעמוד, וגם ברירת המחדל לכותרת ב-Google.
          </p>
        </div>

        <div>
          <label htmlFor="body" className={LABEL}>
            {page.body.kind === 'faq' ? 'שאלות ותשובות *' : 'תוכן העמוד *'}
          </label>
          <textarea
            id="body"
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={22}
            className={`${INPUT} font-mono leading-relaxed`}
          />
          <p className="mt-1 text-xs text-gray-500">
            {page.body.kind === 'faq'
              ? 'כל שאלה מתחילה בשורה שנפתחת ב-## , והשורות שאחריה הן התשובה.'
              : '## כותרת משנה, ### כותרת קטנה, **מודגש**, [טקסט](/קישור), - רשימה, > ציטוט. כל השאר טקסט רגיל.'}
          </p>
        </div>

        <div>
          <label htmlFor="seoTitle" className={LABEL}>
            כותרת ל-Google
          </label>
          <input
            id="seoTitle"
            name="seoTitle"
            defaultValue={page.seoTitle ?? ''}
            className={INPUT}
          />
          <p className="mt-1 text-xs text-gray-500">ריק = משתמשים בכותרת העמוד.</p>
        </div>

        <div>
          <label htmlFor="seoDescription" className={LABEL}>
            תיאור ל-Google
          </label>
          <textarea
            id="seoDescription"
            name="seoDescription"
            defaultValue={page.seoDescription ?? ''}
            rows={3}
            className={INPUT}
          />
          <p className="mt-1 text-xs text-gray-500">
            ריק = נגזר מהתוכן. לדוגמה: {excerpt(body, 90) || 'אין עדיין תוכן'}
          </p>
        </div>

        <div>
          <label htmlFor="ogImageUrl" className={LABEL}>
            תמונת שיתוף
          </label>
          <input
            id="ogImageUrl"
            name="ogImageUrl"
            defaultValue={page.ogImageUrl ?? ''}
            dir="ltr"
            className={`${INPUT} text-right`}
            placeholder="/images/..."
          />
        </div>

        <div>
          <label htmlFor="note" className={LABEL}>
            מה שונה בשמירה הזאת
          </label>
          <input id="note" name="note" className={INPUT} />
          <p className="mt-1 text-xs text-gray-500">
            נשמר בהיסטוריה. זו השורה שתסביר בעוד חצי שנה למה הפסקה השתנתה.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
          <button
            type="submit"
            disabled={pending}
            onClick={() => setStatus('draft')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            שמירה כטיוטה
          </button>
          <button
            type="submit"
            disabled={pending}
            onClick={() => setStatus('published')}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-heading disabled:opacity-50"
          >
            שמירה ופרסום
          </button>
          <span className="text-xs text-gray-500">
            {page.builtIn
              ? 'העמוד הזה עדיין מגיע מהקוד. שמירה ראשונה יוצרת אותו במסד הנתונים.'
              : `כתובת: ${page.href}`}
          </span>
        </div>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">תצוגה מקדימה</h2>
        <p className="mb-4 text-xs text-gray-500">
          מוצג באותו רכיב שמרנדר את העמוד עצמו, כך שמה שנראה כאן הוא מה שיפורסם.
        </p>
        <div dir="rtl" className="border-t border-gray-200 pt-4">
          <h1 className="text-2xl font-bold text-heading">{page.title}</h1>
          {page.body.kind === 'faq' ? (
            <div className="mt-4 divide-y divide-heading/10 border-y border-heading/10">
              {faqPreview.map((entry) => (
                <div key={entry.question} className="py-3">
                  <p className="text-base font-semibold text-heading">{entry.question}</p>
                  <p className="mt-1 text-base leading-relaxed text-heading/80">{entry.answer}</p>
                </div>
              ))}
            </div>
          ) : (
            <RichText markup={body} />
          )}
        </div>
      </div>
    </div>
  )
}
