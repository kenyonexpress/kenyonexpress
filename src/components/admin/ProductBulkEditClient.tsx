'use client'

import {
  type BulkOperationKind,
  REPLACE_FIELDS,
  REPLACE_FIELD_LABEL,
  type ReplaceField,
} from '@/lib/admin/product-bulk/plan'
import { PRODUCT_STATUSES, PRODUCT_TYPES } from '@/lib/admin/product-bulk/scope'
import {
  type BulkPreviewResult,
  type BulkPreviewRow,
  type BulkRowResult,
  applyProductBulkBatch,
  previewProductBulkEdit,
  startProductBulkRun,
} from '@/server/actions/admin/product-bulk'
import {
  finishProductImportRun,
  rollbackProductImportRun,
} from '@/server/actions/admin/product-import'
import { Play, Search, Undo2 } from 'lucide-react'
import { useState } from 'react'

/**
 * The bulk edit screen's client half. Three panels top to bottom: the scope
 * (which products), the operation (what changes), and the dry run (what it
 * would do to each matched row, with the reason for every row it would
 * leave alone). Apply is disabled until a dry run has been seen for the
 * current inputs - editing any field discards the preview, so what gets
 * applied is always what was shown.
 *
 * Apply sends the change ids in batches of BATCH_SIZE inside one run
 * (`startProductBulkRun` .. `finishProductImportRun`), which is what makes
 * the run appear in `/admin/products/import/history` with an undo. A batch
 * that fails rolls itself back on the server and stops the run; the batches
 * already applied stay until the admin presses undo here or there.
 */

const BATCH_SIZE = 50

interface Props {
  categories: { id: string; name_he: string }[]
  hidePricing: boolean
  r2Configured: boolean
}

type Stage = 'idle' | 'previewing' | 'ready' | 'applying' | 'done'

const STATUS_LABEL: Record<(typeof PRODUCT_STATUSES)[number], string> = {
  draft: 'טיוטה',
  active: 'פעיל',
  paused: 'מושהה',
  sold_out: 'אזל',
  archived: 'ארכיון',
}

const TYPE_LABEL: Record<(typeof PRODUCT_TYPES)[number], string> = {
  physical: 'מוצר פיזי',
  coupon: 'קופון',
  recurring: 'מנוי',
  service: 'שירות',
}

const FIELD_LABEL: Record<string, string> = {
  kenyon_price: 'מחיר',
  price_ils: 'מחיר (price_ils)',
  full_price: 'מחיר מלא',
  discount_percent: 'הנחה %',
  stock_quantity: 'מלאי',
  images: 'תמונות',
  ...REPLACE_FIELD_LABEL,
}

const KIND_LABEL: Record<BulkOperationKind, string> = {
  price: 'מחירים',
  stock: 'מלאי',
  discount: 'הנחה',
  replace: 'חיפוש והחלפה',
  images: 'תמונות מ-R2',
}

const input =
  'rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand'
const btn =
  'inline-flex items-center gap-2 rounded-lg border border-black/10 px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const btnPrimary = `${btn} bg-brand text-brand-dark hover:bg-brand-primary-hover`
const btnGhost = `${btn} bg-white text-gray-700 hover:bg-gray-50`

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'ריק'
  if (Array.isArray(value)) {
    const first = value.find((v): v is string => typeof v === 'string')
    const tail = first ? first.slice(first.lastIndexOf('/') + 1) : ''
    return `${value.length} תמונות${tail ? ` (${tail}${value.length > 1 ? ', ...' : ''})` : ''}`
  }
  if (typeof value === 'number') {
    return key === 'discount_percent' ? `${value}%` : String(value)
  }
  const text = String(value)
  return text.length > 90 ? `${text.slice(0, 90)}…` : text
}

function Diff({ row }: { row: BulkPreviewRow }) {
  if (row.status !== 'change' || !row.after) return null
  const after = row.after
  // price_ils mirrors kenyon_price; showing both is noise.
  const keys = Object.keys(after).filter((k) => k !== 'price_ils')
  return (
    <ul className="space-y-0.5 text-xs">
      {keys.map((key) => (
        <li key={key} className="text-gray-700">
          <span className="text-gray-500">{FIELD_LABEL[key] ?? key}:</span>{' '}
          <span className="line-through text-gray-400" dir="auto">
            {formatValue(key, row.before?.[key])}
          </span>{' '}
          <span className="font-medium text-gray-900" dir="auto">
            {formatValue(key, after[key])}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function ProductBulkEditClient({ categories, hidePricing, r2Configured }: Props) {
  // Scope
  const [skuPattern, setSkuPattern] = useState('')
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')

  // Operation
  const [kind, setKind] = useState<BulkOperationKind>(hidePricing ? 'stock' : 'price')
  const [priceMode, setPriceMode] = useState<'percent' | 'set'>('percent')
  const [priceValue, setPriceValue] = useState('')
  const [stockMode, setStockMode] = useState<'set' | 'delta'>('set')
  const [stockValue, setStockValue] = useState('')
  const [discountValue, setDiscountValue] = useState('')
  const [replaceField, setReplaceField] = useState<ReplaceField>('name_he')
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [caseInsensitive, setCaseInsensitive] = useState(false)
  const [imagesMode, setImagesMode] = useState<'replace' | 'append'>('replace')
  const [prefix, setPrefix] = useState('')

  // Run
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<BulkPreviewResult | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [runId, setRunId] = useState<string | null>(null)
  const [applied, setApplied] = useState<{
    updated: number
    failed: number
    stopped: string | null
  }>()
  const [failures, setFailures] = useState<BulkRowResult[]>([])
  const [undo, setUndo] = useState<{
    state: 'idle' | 'working' | 'done' | 'failed'
    text?: string
  }>({
    state: 'idle',
  })

  const scope = { skuPattern, q, categoryId, status, type }

  function operation(): Record<string, unknown> {
    switch (kind) {
      case 'price':
        return { kind, mode: priceMode, value: priceValue }
      case 'stock':
        return { kind, mode: stockMode, value: stockValue }
      case 'discount':
        return { kind, value: discountValue }
      case 'replace':
        return { kind, field: replaceField, find, replace, caseInsensitive }
      case 'images':
        return { kind, mode: imagesMode, prefix }
      default:
        return { kind }
    }
  }

  /** Any edit invalidates the dry run; apply only ever follows a fresh one. */
  function edit<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      if (stage === 'ready' || stage === 'done') {
        setStage('idle')
        setPreview(null)
        setApplied(undefined)
        setRunId(null)
        setUndo({ state: 'idle' })
      }
    }
  }

  async function runPreview() {
    setStage('previewing')
    setError(null)
    setPreview(null)
    setApplied(undefined)
    setRunId(null)
    setUndo({ state: 'idle' })
    const res = await previewProductBulkEdit(scope, operation())
    if (res.error) {
      setError(res.error)
      setStage('idle')
      return
    }
    setPreview(res)
    setStage('ready')
  }

  async function runApply() {
    if (!preview?.changeIds || !preview.summary || preview.changeIds.length === 0) return
    const count = preview.changeIds.length
    if (
      !window.confirm(
        `לעדכן ${count} מוצרים?\n${preview.label ?? ''}\n\nאפשר לבטל את הריצה אחר כך מההיסטוריה.`,
      )
    ) {
      return
    }
    setStage('applying')
    setError(null)
    setProgress({ done: 0, total: count })
    const op = operation()

    const started = await startProductBulkRun(op, {
      label: preview.label ?? '',
      summary: {
        matched: preview.summary.matched,
        changes: preview.summary.changes,
        skipped: preview.summary.skipped,
      },
    })
    if (started.error || !started.runId) {
      setError(started.error ?? 'פתיחת הריצה נכשלה')
      setStage('ready')
      return
    }
    setRunId(started.runId)

    let updated = 0
    let stopped: string | null = null
    const failed: BulkRowResult[] = []
    const nameById = new Map(preview.rows?.map((r) => [r.id, r]) ?? [])
    let batchNumber = 0
    for (let i = 0; i < count; i += BATCH_SIZE) {
      const ids = preview.changeIds.slice(i, i + BATCH_SIZE)
      if (stopped !== null) {
        for (const id of ids) {
          const row = nameById.get(id)
          failed.push({ id, slug: row?.slug ?? id, name: row?.name ?? '', errors: ['לא נוסה'] })
        }
        continue
      }
      batchNumber += 1
      const res = await applyProductBulkBatch(ids, op, { id: started.runId, batch: batchNumber })
      if (res.error || !res.results) {
        stopped = res.error ?? 'העדכון נכשל'
        for (const id of ids) {
          const row = nameById.get(id)
          failed.push({ id, slug: row?.slug ?? id, name: row?.name ?? '', errors: [stopped] })
        }
      } else {
        updated += res.updated ?? 0
        failed.push(...res.results.filter((r) => r.errors.length > 0))
      }
      setProgress({ done: Math.min(i + BATCH_SIZE, count), total: count })
    }

    const runStatus = stopped ? (updated > 0 ? 'partial' : 'failed') : 'done'
    const finished = await finishProductImportRun(started.runId, {
      status: runStatus,
      inserted: 0,
      updated,
      failed: failed.length,
      error: stopped,
      rowErrors: failed.map((r, i) => ({
        line: i + 1,
        slug: r.slug,
        name: r.name,
        errors: r.errors,
      })),
    })
    if (finished.error) setError(finished.error)
    setApplied({ updated, failed: failed.length, stopped })
    setFailures(failed)
    setStage('done')
  }

  async function undoRun() {
    if (!runId) return
    if (!window.confirm('לבטל את הריצה? כל המוצרים שעודכנו יחזרו לערכים הקודמים.')) return
    setUndo({ state: 'working' })
    const res = await rollbackProductImportRun(runId)
    if (res.error) {
      setUndo({ state: 'failed', text: res.error })
      return
    }
    setUndo({
      state: 'done',
      text: `שוחזרו ${res.revertedUpdates ?? 0}${res.skipped ? `, דולגו ${res.skipped} (נערכו מאז)` : ''}${res.failures ? `, נכשלו ${res.failures}` : ''}`,
    })
  }

  const busy = stage === 'previewing' || stage === 'applying'
  const kinds: BulkOperationKind[] = hidePricing
    ? ['stock', 'replace', 'images']
    : ['price', 'stock', 'discount', 'replace', 'images']
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Scope */}
      <section className="rounded-xl border border-black/10 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-gray-900">1. אילו מוצרים</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            תבנית מק"ט (* כל רצף, ? תו אחד)
            <input
              className={input}
              dir="ltr"
              value={skuPattern}
              onChange={(e) => edit(setSkuPattern)(e.target.value)}
              placeholder="AB-*"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            שם מכיל
            <input className={input} value={q} onChange={(e) => edit(setQ)(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            קטגוריה
            <select
              className={input}
              value={categoryId}
              onChange={(e) => edit(setCategoryId)(e.target.value)}
            >
              <option value="">הכל</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_he}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            סטטוס
            <select
              className={input}
              value={status}
              onChange={(e) => edit(setStatus)(e.target.value)}
            >
              <option value="">הכל</option>
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            סוג
            <select className={input} value={type} onChange={(e) => edit(setType)(e.target.value)}>
              <option value="">הכל</option>
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Operation */}
      <section className="rounded-xl border border-black/10 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-gray-900">2. מה לשנות</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => edit(setKind)(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                kind === k
                  ? 'bg-brand-primary text-ink'
                  : 'border border-black/10 text-black/60 hover:bg-brand-primary/30 hover:text-ink'
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {kind === 'price' ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              אופן
              <select
                className={input}
                value={priceMode}
                onChange={(e) => edit(setPriceMode)(e.target.value as 'percent' | 'set')}
              >
                <option value="percent">שינוי באחוזים (גם המחיר המלא)</option>
                <option value="set">קביעת מחיר בשקלים</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              {priceMode === 'percent' ? 'אחוז (למשל -10 או 15)' : 'מחיר חדש בשקלים'}
              <input
                className={input}
                dir="ltr"
                inputMode="decimal"
                value={priceValue}
                onChange={(e) => edit(setPriceValue)(e.target.value)}
              />
            </label>
            <p className="text-xs text-gray-500">
              קופונים: מחיר הקופון נשאר, ואחוז ההנחה מחושב מחדש. מנויים מדולגים.
            </p>
          </div>
        ) : null}

        {kind === 'stock' ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              אופן
              <select
                className={input}
                value={stockMode}
                onChange={(e) => edit(setStockMode)(e.target.value as 'set' | 'delta')}
              >
                <option value="set">קביעת כמות</option>
                <option value="delta">הוספה / הפחתה</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              {stockMode === 'set' ? 'כמות במלאי' : 'שינוי (למשל 20 או -5)'}
              <input
                className={input}
                dir="ltr"
                inputMode="numeric"
                value={stockValue}
                onChange={(e) => edit(setStockValue)(e.target.value)}
              />
            </label>
            <p className="text-xs text-gray-500">רק מוצרים פיזיים. הפחתה לא יורדת מתחת ל-0.</p>
          </div>
        ) : null}

        {kind === 'discount' ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              אחוז הנחה (ריק = ביטול הנחה)
              <input
                className={input}
                dir="ltr"
                inputMode="decimal"
                value={discountValue}
                onChange={(e) => edit(setDiscountValue)(e.target.value)}
              />
            </label>
            <p className="text-xs text-gray-500">
              רק מוצרים פיזיים: בקופון ההנחה נגזרת משני המחירים ולא נערכת כאן.
            </p>
          </div>
        ) : null}

        {kind === 'replace' ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              שדה
              <select
                className={input}
                value={replaceField}
                onChange={(e) => edit(setReplaceField)(e.target.value as ReplaceField)}
              >
                {REPLACE_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {REPLACE_FIELD_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              לחפש
              <input
                className={input}
                value={find}
                onChange={(e) => edit(setFind)(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              להחליף ב
              <input
                className={input}
                value={replace}
                onChange={(e) => edit(setReplace)(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={caseInsensitive}
                onChange={(e) => edit(setCaseInsensitive)(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              בלי הבחנה בין אותיות גדולות וקטנות
            </label>
            <p className="w-full text-xs text-gray-500">
              החלפה מילולית של כל המופעים. תוצאה ריקה או ארוכה מדי מדולגת.
            </p>
          </div>
        ) : null}

        {kind === 'images' ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              תיקייה ב-R2 (קידומת)
              <input
                className={input}
                dir="ltr"
                value={prefix}
                onChange={(e) => edit(setPrefix)(e.target.value)}
                placeholder="catalog/2026/"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              אופן
              <select
                className={input}
                value={imagesMode}
                onChange={(e) => edit(setImagesMode)(e.target.value as 'replace' | 'append')}
              >
                <option value="replace">החלפת הגלריה</option>
                <option value="append">הוספה לגלריה הקיימת</option>
              </select>
            </label>
            <p className="w-full text-xs text-gray-500">
              קובץ מותאם למוצר לפי שמו: <code dir="ltr">AB-100.jpg</code> הוא התמונה הראשית של המק"ט
              AB-100, <code dir="ltr">AB-100-1.jpg</code> ואילך הגלריה. אותיות גדולות/קטנות ו-_
              לעומת - לא משנים.
            </p>
            {!r2Configured ? (
              <p className="w-full rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                אחסון R2 לא מוגדר בסביבה הזו; הבדיקה תיכשל עד שיוגדרו R2_ACCOUNT_ID,
                R2_ACCESS_KEY_ID ו-R2_SECRET_ACCESS_KEY.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btnGhost}
            disabled={busy}
            onClick={() => void runPreview()}
          >
            <Search className="h-4 w-4" aria-hidden />
            {stage === 'previewing' ? 'בודק...' : 'הרצת ניסיון (בלי לשמור)'}
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={busy || stage !== 'ready' || !preview?.changeIds?.length}
            onClick={() => void runApply()}
          >
            <Play className="h-4 w-4" aria-hidden />
            {preview?.changeIds?.length ? `עדכון ${preview.changeIds.length} מוצרים` : 'עדכון'}
          </button>
          {error ? <span className="text-sm text-red-700">{error}</span> : null}
        </div>
      </section>

      {/* Progress / result */}
      {stage === 'applying' ? (
        <section className="rounded-xl border border-black/10 bg-white p-4">
          <p className="mb-2 text-sm text-gray-700">
            מעדכן... {progress.done} מתוך {progress.total} ({pct}%)
          </p>
          <div className="h-2 w-full overflow-hidden rounded bg-gray-100">
            <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
        </section>
      ) : null}

      {stage === 'done' && applied ? (
        <section
          className={`rounded-xl border p-4 ${
            applied.stopped ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <p className="text-sm font-semibold text-gray-900">
            {applied.stopped ? 'הריצה נעצרה' : 'הריצה הושלמה'}: עודכנו {applied.updated}
            {applied.failed ? `, לא עודכנו ${applied.failed}` : ''}
          </p>
          {applied.stopped ? <p className="mt-1 text-xs text-red-700">{applied.stopped}</p> : null}
          {failures.length > 0 ? (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-gray-600">פירוט ({failures.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {failures.slice(0, 100).map((f) => (
                  <li key={f.id} className="text-gray-700">
                    <span className="font-mono" dir="ltr">
                      {f.slug}
                    </span>
                    : {f.errors.join(' | ')}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {applied.updated > 0 && runId ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={btnGhost}
                disabled={undo.state === 'working' || undo.state === 'done'}
                onClick={() => void undoRun()}
              >
                <Undo2 className="h-4 w-4" aria-hidden />
                {undo.state === 'working' ? 'מבטל...' : 'ביטול הריצה הזו'}
              </button>
              {undo.text ? (
                <span
                  className={`text-xs ${undo.state === 'failed' ? 'text-red-700' : 'text-emerald-700'}`}
                >
                  {undo.text}
                </span>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Preview */}
      {preview?.summary && preview.rows ? (
        <section className="rounded-xl border border-black/10 bg-white p-4">
          <h2 className="mb-1 text-sm font-bold text-gray-900">3. הרצת ניסיון</h2>
          <p className="mb-3 text-xs text-gray-600">
            {preview.label} · נמצאו {preview.summary.matched} · ישתנו{' '}
            <span className="font-semibold text-gray-900">{preview.summary.changes}</span> · ידולגו{' '}
            {preview.summary.skipped} · ללא שינוי {preview.summary.unchanged}
            {preview.summary.r2Keys !== undefined ? ` · ${preview.summary.r2Keys} קבצים ב-R2` : ''}
          </p>
          {preview.summary.scopeTruncated ? (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              הסינון תפס יותר מדי מוצרים ורק הראשונים נבדקו; יש לצמצם את הסינון.
            </p>
          ) : null}
          {preview.summary.r2Truncated ? (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              בתיקייה ב-R2 יש יותר קבצים ממה שנקרא; יש להזין קידומת מצומצמת יותר.
            </p>
          ) : null}
          {preview.rows.length < preview.summary.matched ? (
            <p className="mb-3 text-xs text-gray-500">
              מוצגות {preview.rows.length} שורות מתוך {preview.summary.matched}; העדכון יחול על כל
              השורות שישתנו.
            </p>
          ) : null}
          {preview.rows.length === 0 ? (
            <p className="text-sm text-gray-600">אף מוצר לא תואם לסינון.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-gray-500">
                    <th className="px-3 py-2 text-start font-medium">מוצר</th>
                    <th className="px-3 py-2 text-start font-medium">מק"ט</th>
                    <th className="px-3 py-2 text-start font-medium">תוצאה</th>
                    <th className="px-3 py-2 text-start font-medium">שינוי</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.id} className="border-b border-black/5 align-top">
                      <td className="px-3 py-2">
                        <div className="text-gray-900">{row.name}</div>
                        <div className="font-mono text-xs text-gray-400" dir="ltr">
                          {row.slug}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-700" dir="ltr">
                        {row.sku ?? '-'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                            row.status === 'change'
                              ? 'bg-emerald-100 text-emerald-800'
                              : row.status === 'skip'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {row.status === 'change'
                            ? 'ישתנה'
                            : row.status === 'skip'
                              ? 'ידולג'
                              : 'ללא שינוי'}
                        </span>
                        {row.reason ? (
                          <div className="mt-1 text-xs text-gray-600">{row.reason}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <Diff row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
