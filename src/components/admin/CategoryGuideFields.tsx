'use client'

import type { AdminCategoryGuide } from '@/lib/category-guides/admin-read'
import { countGuideWords } from '@/lib/category-guides/markdown'
import { GUIDE_MIN_WORDS, GUIDE_TARGET_WORDS, GUIDE_TITLE_MAX } from '@/lib/category-guides/rules'
import { useState } from 'react'

/**
 * The buyer-guide fields inside the category form (STEP 65): a title, the
 * markdown-lite body with a live word count against the target, and the
 * published switch. The body opens with what the storefront shows right now
 * (the row, else the authored text for the slug), so the editor edits the
 * live copy rather than a blank box. A blank body on save removes the row
 * and the storefront falls back to the authored text; unpublished keeps
 * the text and shows nothing, authored included.
 *
 * Hidden-field free: the three inputs are named for the action, which
 * parses them only when `guide_body_md` is present in the form data.
 */
export default function CategoryGuideFields({
  guide,
  categoryName,
}: {
  guide: AdminCategoryGuide
  categoryName: string | null
}) {
  const [body, setBody] = useState(guide.draft.body_md)
  const words = countGuideWords(body)
  const reached = words >= GUIDE_TARGET_WORDS
  const nearly = !reached && words >= GUIDE_MIN_WORDS
  const tone = reached ? 'text-green-700' : nearly ? 'text-amber-700' : 'text-gray-500'

  return (
    <fieldset className="space-y-3 border-t border-gray-200 pt-4">
      <legend className="text-sm font-semibold text-gray-900">מדריך קנייה (SEO)</legend>
      <p className="text-xs text-gray-500">
        מוצג בתחתית עמוד הקטגוריה כטקסט אינדקסבילי. היעד הוא כ-{GUIDE_TARGET_WORDS} מילים. כותרת
        משנה פותחים ב-<code dir="ltr">## </code>, סעיף ברשימה ב-<code dir="ltr">- </code>, ופסקאות
        מופרדות בשורה ריקה. בלי HTML ובלי קישורים.
      </p>

      {!guide.tableExists && (
        <p
          className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
          data-testid="guide-migration-pending"
        >
          טבלת מדריכי הקנייה עוד לא הוחלה (מיגרציה 268). הטקסט המובנה מוצג באתר; עריכה תישמר רק אחרי
          ההחלה.
        </p>
      )}
      {guide.draft.source === 'authored' && (
        <p className="text-xs text-gray-500" data-testid="guide-source-authored">
          הטקסט שלמטה הוא המדריך המובנה לקטגוריה זו; שמירה תהפוך אותו לגרסה שלכם.
        </p>
      )}

      <div>
        <label htmlFor="guide_title_he" className="block text-sm font-medium text-gray-700 mb-1">
          כותרת המדריך
        </label>
        <input
          id="guide_title_he"
          name="guide_title_he"
          defaultValue={guide.draft.title_he ?? ''}
          maxLength={GUIDE_TITLE_MAX}
          placeholder={categoryName ? `מדריך קנייה: ${categoryName}` : 'מדריך קנייה'}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="guide_body_md" className="block text-sm font-medium text-gray-700">
            גוף המדריך
          </label>
          <output
            htmlFor="guide_body_md"
            aria-live="polite"
            data-testid="guide-word-count"
            className={`text-xs font-medium tabular-nums ${tone}`}
          >
            {words} / {GUIDE_TARGET_WORDS} מילים
          </output>
        </div>
        <textarea
          id="guide_body_md"
          name="guide_body_md"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={14}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div className="flex items-center gap-3">
        <input
          id="guide_published"
          name="guide_published"
          type="checkbox"
          value="true"
          defaultChecked={guide.row ? guide.row.is_published : true}
          className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
        />
        <label htmlFor="guide_published" className="text-sm font-medium text-gray-700">
          המדריך מוצג באתר
        </label>
      </div>
    </fieldset>
  )
}
