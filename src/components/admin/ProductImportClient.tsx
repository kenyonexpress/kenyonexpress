'use client'

import {
  type HeaderMapping,
  IMPORT_COLUMNS,
  type ImportColumnKey,
  type ImportMode,
  type RawImportRow,
  buildErrorReportCsv,
  buildTemplateCsv,
  mapHeaders,
  toRecords,
} from '@/lib/admin/product-import/import-rows'
import { CsvStreamParser } from '@/lib/admin/product-import/parse-csv'
import { XlsxFormatError, parseXlsx } from '@/lib/admin/product-import/parse-xlsx'
import type { ImportRowResult } from '@/server/actions/admin/product-import'
import { importProductsBatch, previewProductImport } from '@/server/actions/admin/product-import'
import { ArrowRight, Download, FileUp, Upload } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'

/**
 * The import screen's client half. The file never uploads as a file: a .csv
 * is parsed chunk by chunk off `File.stream()`, an .xlsx through the
 * dependency-free zip reader in `parse-xlsx.ts`, and only the mapped rows
 * travel to the server actions - first all of them for the dry run, then the
 * valid ones again in batches of BATCH_SIZE, which is what the progress bar
 * counts. Between parse and dry run sits the mapping stage: every file column
 * gets a select, prefilled by the header aliases, so a spreadsheet with
 * unrecognized headers is mapped by hand instead of rejected.
 */

const BATCH_SIZE = 50
const PREVIEW_TABLE_LIMIT = 100
/** How many data rows the mapping table scans for a sample value per column. */
const SAMPLE_SCAN_ROWS = 20

type Stage = 'idle' | 'mapping' | 'checking' | 'ready' | 'importing' | 'done'

const btn =
  'inline-flex items-center gap-2 rounded-lg border border-black/10 bg-brand px-4 py-2 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50'
const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50'

function downloadCsv(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

const REQUIRED_KEYS = new Set(IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key))
const COLUMN_LABEL = new Map(IMPORT_COLUMNS.map((c) => [c.key, c.label]))

export default function ProductImportClient() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [fileName, setFileName] = useState('')
  const [fatal, setFatal] = useState<string | null>(null)
  const [fileWarnings, setFileWarnings] = useState<string[]>([])
  const [header, setHeader] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [selections, setSelections] = useState<(ImportColumnKey | null)[]>([])
  const [mode, setMode] = useState<ImportMode>('insert')
  const [rawRows, setRawRows] = useState<RawImportRow[]>([])
  const [previewRows, setPreviewRows] = useState<ImportRowResult[]>([])
  const [summary, setSummary] = useState<{
    total: number
    valid: number
    invalid: number
    inserts: number
    updates: number
  } | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [importResults, setImportResults] = useState<ImportRowResult[]>([])
  const [applied, setApplied] = useState({ inserted: 0, updated: 0 })
  const [errorsOnly, setErrorsOnly] = useState(false)

  async function handleFile(file: File) {
    setStage('checking')
    setFatal(null)
    setFileWarnings([])
    setPreviewRows([])
    setSummary(null)
    setImportResults([])
    setApplied({ inserted: 0, updated: 0 })
    setFileName(file.name)

    let parsed: { rows: string[][]; errors: { line: number; message: string }[] }
    try {
      if (/\.xlsx$/i.test(file.name)) {
        parsed = await parseXlsx(await file.arrayBuffer())
      } else {
        // Streaming parse: the parser carries quote/CRLF state across chunk
        // boundaries, so a 5,000-row export never sits in memory twice.
        const parser = new CsvStreamParser()
        const reader = file.stream().getReader()
        const decoder = new TextDecoder('utf-8')
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          parser.write(decoder.decode(value, { stream: true }))
        }
        parser.write(decoder.decode())
        parsed = parser.end()
      }
    } catch (e) {
      setFatal(e instanceof XlsxFormatError ? e.message : 'קריאת הקובץ נכשלה')
      setStage('idle')
      return
    }

    const [headerRow, ...rest] = parsed.rows
    if (!headerRow || headerRow.length === 0 || rest.length === 0) {
      setFatal('הקובץ ריק או שאין בו שורות נתונים מתחת לשורת הכותרות')
      setStage('idle')
      return
    }

    setFileWarnings(parsed.errors.map((e) => `שורה ${e.line}: ${e.message}`))
    setHeader(headerRow)
    setDataRows(rest)
    setSelections(mapHeaders(headerRow).keys)
    setStage('mapping')
  }

  const duplicateKeys = (() => {
    const seen = new Map<ImportColumnKey, number>()
    for (const key of selections) if (key) seen.set(key, (seen.get(key) ?? 0) + 1)
    return [...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key)
  })()
  const mappedKeys = new Set(selections.filter((k): k is ImportColumnKey => k !== null))
  const missingRequired = IMPORT_COLUMNS.filter((c) => c.required && !mappedKeys.has(c.key))

  async function runPreview(nextMode: ImportMode = mode) {
    const mapping: HeaderMapping = { keys: selections, unknown: [], missing: [] }
    const rows = toRecords(mapping, dataRows)
    if (rows.length === 0) {
      setFatal('אחרי המיפוי לא נשארה אף שורת נתונים')
      setStage('mapping')
      return
    }

    setStage('checking')
    setFatal(null)
    setRawRows(rows)
    const preview = await previewProductImport(rows, nextMode)
    if (preview.error || !preview.rows || !preview.summary) {
      setFatal(preview.error ?? 'בדיקת הקובץ נכשלה')
      setStage('mapping')
      return
    }
    setPreviewRows(preview.rows)
    setSummary(preview.summary)
    setStage('ready')
  }

  function changeMode(next: ImportMode) {
    setMode(next)
    // The dry run's slug verdicts depend on the mode, so a flip after the
    // check re-runs it against the same mapped rows.
    if (stage === 'ready') void runPreview(next)
  }

  async function runImport() {
    const validLines = new Set(previewRows.filter((r) => r.errors.length === 0).map((r) => r.line))
    const toImport = rawRows.filter((r) => validLines.has(r.line))
    if (toImport.length === 0) return

    setStage('importing')
    setProgress({ done: 0, total: toImport.length })

    const results: ImportRowResult[] = []
    let insertedCount = 0
    let updatedCount = 0
    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
      const batch = toImport.slice(i, i + BATCH_SIZE)
      const res = await importProductsBatch(batch, mode)
      if (res.error || !res.results) {
        // A failed batch rolled itself back on the server: none of its rows
        // were kept, and each is reported with the batch's error. Batches
        // already applied stay applied.
        results.push(
          ...batch.map((b) => ({
            line: b.line,
            slug: b.record.slug ?? null,
            name: b.record.name_he ?? null,
            errors: [res.error ?? 'הייבוא נכשל'],
          })),
        )
      } else {
        results.push(...res.results)
        insertedCount += res.inserted ?? 0
        updatedCount += res.updated ?? 0
      }
      setProgress({ done: Math.min(i + BATCH_SIZE, toImport.length), total: toImport.length })
    }

    setImportResults(results)
    setApplied({ inserted: insertedCount, updated: updatedCount })
    setStage('done')
  }

  function downloadErrorReport() {
    const failed = (stage === 'done' ? importResults : previewRows).filter(
      (r) => r.errors.length > 0,
    )
    downloadCsv(
      'product-import-errors.csv',
      buildErrorReportCsv(
        failed.map((r) => ({ line: r.line, slug: r.slug, name: r.name, errors: r.errors })),
      ),
    )
  }

  function sampleFor(col: number): string {
    for (const row of dataRows.slice(0, SAMPLE_SCAN_ROWS)) {
      const value = (row[col] ?? '').trim()
      if (value.length > 0) return value
    }
    return ''
  }

  const failedCount = (stage === 'done' ? importResults : previewRows).filter(
    (r) => r.errors.length > 0,
  ).length
  const shownRows = (stage === 'done' ? importResults : previewRows).filter(
    (r) => !errorsOnly || r.errors.length > 0,
  )
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const modePicker = (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-gray-900">מה לעשות עם מוצר שכבר קיים?</legend>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="radio"
          name="import-mode"
          className="mt-1"
          checked={mode === 'insert'}
          onChange={() => changeMode('insert')}
          disabled={stage === 'checking' || stage === 'importing'}
        />
        <span>הוספה בלבד - שורה שהקישור (slug) שלה כבר קיים במערכת תיכשל</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="radio"
          name="import-mode"
          className="mt-1"
          checked={mode === 'upsert'}
          onChange={() => changeMode('upsert')}
          disabled={stage === 'checking' || stage === 'importing'}
        />
        <span>
          הוספה ועדכון - שורה עם קישור קיים תעדכן את המוצר הקיים. מתעדכנות רק עמודות שנכללו בקובץ,
          ושדות המחיר מחושבים מחדש מהקובץ במלואם. סטטוס, תמונות, ספק וסוג המוצר לא משתנים, ועמודת
          הסוג חובה בכל שורה מעדכנת.
        </span>
      </label>
    </fieldset>
  )

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={btn}
            onClick={() => inputRef.current?.click()}
            disabled={stage === 'checking' || stage === 'importing'}
          >
            <FileUp className="h-4 w-4" aria-hidden />
            בחירת קובץ (CSV או Excel)
          </button>
          <button
            type="button"
            className={btnGhost}
            onClick={() => downloadCsv('product-import-template.csv', buildTemplateCsv())}
          >
            <Download className="h-4 w-4" aria-hidden />
            הורדת תבנית
          </button>
          {fileName ? <span className="text-sm text-gray-600">{fileName}</span> : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
        <p className="text-sm text-gray-600">
          אפשר להעלות קובץ Excel (‏.xlsx, הגיליון הראשון נקרא) או CSV UTF-8. מוצרים חדשים נקלטים
          כטיוטה: פרסום נעשה מתוך עמוד המוצר, אחרי שיוך ספק.
        </p>
        {fatal ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{fatal}</p>
        ) : null}
        {fileWarnings.length > 0 ? (
          <ul className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
            {fileWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        {stage === 'checking' ? (
          <p className="text-sm text-gray-600">בודק את הקובץ (הרצת ניסיון, בלי לשמור)...</p>
        ) : null}
      </div>

      {stage === 'mapping' ? (
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">מיפוי עמודות</h2>
          <p className="text-sm text-gray-600">
            כל עמודה בקובץ זוהתה אוטומטית ככל האפשר. אפשר לתקן כל שיוך, ועמודה שמסומנת "לא לייבא"
            פשוט תדולג. עמודות עם * הן חובה.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-gray-500">
                  <th className="py-2 pe-4 text-start font-medium">עמודה בקובץ</th>
                  <th className="py-2 pe-4 text-start font-medium">ערך לדוגמה</th>
                  <th className="py-2 text-start font-medium">ייבוא אל</th>
                </tr>
              </thead>
              <tbody>
                {header.map((name, col) => (
                  <tr key={`${col}-${name}`} className="border-b border-black/5">
                    <td className="py-2 pe-4 font-medium text-gray-900">
                      {name.trim() || `עמודה ${col + 1}`}
                    </td>
                    <td className="max-w-48 truncate py-2 pe-4 text-gray-600">{sampleFor(col)}</td>
                    <td className="py-2">
                      <select
                        className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
                        value={selections[col] ?? ''}
                        onChange={(e) => {
                          const next = [...selections]
                          next[col] = (e.target.value || null) as ImportColumnKey | null
                          setSelections(next)
                        }}
                      >
                        <option value="">לא לייבא</option>
                        {IMPORT_COLUMNS.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                            {c.required ? ' *' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {duplicateKeys.length > 0 ? (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              שדה יעד נבחר יותר מפעם אחת:{' '}
              {duplicateKeys.map((k) => COLUMN_LABEL.get(k) ?? k).join(', ')}
            </p>
          ) : null}
          {missingRequired.length > 0 ? (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              עמודות חובה שטרם מופו: {missingRequired.map((c) => c.label).join(', ')}
            </p>
          ) : null}
          {modePicker}
          <button
            type="button"
            className={btn}
            disabled={duplicateKeys.length > 0 || missingRequired.length > 0}
            onClick={() => void runPreview()}
          >
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
            בדיקת הקובץ (הרצת ניסיון, בלי לשמור)
          </button>
        </div>
      ) : null}

      {summary && (stage === 'ready' || stage === 'importing' || stage === 'done') ? (
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-semibold text-gray-900">
              {stage === 'done' ? 'תוצאות הייבוא' : 'תוצאות בדיקה (טרם נשמר דבר)'}
            </span>
            <span className="text-gray-600">סה"כ שורות: {summary.total}</span>
            {stage === 'done' ? (
              <span className="text-emerald-700">
                נוספו: {applied.inserted} · עודכנו: {applied.updated}
              </span>
            ) : (
              <span className="text-emerald-700">
                תקינות: {summary.valid} ({summary.inserts} חדשים, {summary.updates} עדכונים)
              </span>
            )}
            <span className={failedCount > 0 ? 'text-red-700' : 'text-gray-600'}>
              שגויות: {failedCount}
            </span>
          </div>

          {stage === 'importing' ? (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-sm text-gray-600">
                מייבא... {progress.done} מתוך {progress.total} ({pct}%)
              </p>
            </div>
          ) : null}

          {stage === 'ready' ? modePicker : null}

          <div className="flex flex-wrap items-center gap-3">
            {stage === 'ready' && summary.valid > 0 ? (
              <button type="button" className={btn} onClick={() => void runImport()}>
                <Upload className="h-4 w-4" aria-hidden />
                {mode === 'upsert'
                  ? `ייבוא ${summary.valid} שורות (${summary.inserts} חדשים, ${summary.updates} עדכונים)`
                  : `ייבוא ${summary.valid} מוצרים כטיוטה`}
              </button>
            ) : null}
            {stage === 'ready' ? (
              <button type="button" className={btnGhost} onClick={() => setStage('mapping')}>
                חזרה למיפוי העמודות
              </button>
            ) : null}
            {failedCount > 0 ? (
              <button type="button" className={btnGhost} onClick={downloadErrorReport}>
                <Download className="h-4 w-4" aria-hidden />
                הורדת דוח שגיאות ({failedCount})
              </button>
            ) : null}
            {stage === 'done' ? (
              <Link href="/admin/products" className={btnGhost}>
                לרשימת המוצרים
              </Link>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={errorsOnly}
                onChange={(e) => setErrorsOnly(e.target.checked)}
              />
              הצגת שגיאות בלבד
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 text-gray-500">
                  <th className="py-2 pe-4 text-start font-medium">שורה</th>
                  <th className="py-2 pe-4 text-start font-medium">שם</th>
                  <th className="py-2 pe-4 text-start font-medium">קישור (slug)</th>
                  <th className="py-2 pe-4 text-start font-medium">פעולה</th>
                  <th className="py-2 text-start font-medium">מצב</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.slice(0, PREVIEW_TABLE_LIMIT).map((row) => (
                  <tr key={row.line} className="border-b border-black/5">
                    <td className="py-2 pe-4 text-gray-500">{row.line}</td>
                    <td className="py-2 pe-4">{row.name ?? '-'}</td>
                    <td className="py-2 pe-4 font-mono text-xs" dir="ltr">
                      {row.slug ?? '-'}
                    </td>
                    <td className="py-2 pe-4 text-gray-600">
                      {row.action === 'update' ? 'עדכון' : row.action === 'new' ? 'חדש' : '-'}
                    </td>
                    <td className="py-2">
                      {row.errors.length === 0 ? (
                        <span className="text-emerald-700">
                          {stage === 'done' ? (row.action === 'update' ? 'עודכן' : 'נקלט') : 'תקין'}
                        </span>
                      ) : (
                        <span className="text-red-700">{row.errors.join(' | ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shownRows.length > PREVIEW_TABLE_LIMIT ? (
              <p className="py-2 text-sm text-gray-500">
                מוצגות {PREVIEW_TABLE_LIMIT} שורות ראשונות מתוך {shownRows.length}. דוח השגיאות המלא
                זמין להורדה למעלה.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
