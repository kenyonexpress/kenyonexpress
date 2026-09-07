'use client'

import {
  IMPORT_COLUMNS,
  type ImportColumnKey,
  type RawImportRow,
  buildErrorReportCsv,
  buildTemplateCsv,
  mapHeaders,
  toRecords,
} from '@/lib/admin/product-import/import-rows'
import { CsvStreamParser } from '@/lib/admin/product-import/parse-csv'
import type { ImportRowResult } from '@/server/actions/admin/product-import'
import { importProductsBatch, previewProductImport } from '@/server/actions/admin/product-import'
import { Download, FileUp, Upload } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'

/**
 * The import screen's client half. The file never uploads as a file: it is
 * parsed in the browser, chunk by chunk off `File.stream()`, and only the
 * mapped rows travel to the server actions - first all of them for the dry
 * run, then the valid ones again in batches of BATCH_SIZE, which is what the
 * progress bar counts.
 */

const BATCH_SIZE = 50
const PREVIEW_TABLE_LIMIT = 100

type Stage = 'idle' | 'checking' | 'ready' | 'importing' | 'done'

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

export default function ProductImportClient() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [fileName, setFileName] = useState('')
  const [fatal, setFatal] = useState<string | null>(null)
  const [fileWarnings, setFileWarnings] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<RawImportRow[]>([])
  const [previewRows, setPreviewRows] = useState<ImportRowResult[]>([])
  const [summary, setSummary] = useState<{ total: number; valid: number; invalid: number } | null>(
    null,
  )
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [importResults, setImportResults] = useState<ImportRowResult[]>([])
  const [inserted, setInserted] = useState(0)
  const [errorsOnly, setErrorsOnly] = useState(false)

  async function handleFile(file: File) {
    setStage('checking')
    setFatal(null)
    setFileWarnings([])
    setPreviewRows([])
    setSummary(null)
    setImportResults([])
    setInserted(0)
    setFileName(file.name)

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
    const parsed = parser.end()

    const [header, ...dataRows] = parsed.rows
    if (!header || dataRows.length === 0) {
      setFatal('הקובץ ריק או שאין בו שורות נתונים מתחת לשורת הכותרות')
      setStage('idle')
      return
    }

    const mapping = mapHeaders(header)
    if (mapping.missing.length > 0) {
      const labels = IMPORT_COLUMNS.filter((c) =>
        (mapping.missing as ImportColumnKey[]).includes(c.key),
      ).map((c) => c.label)
      setFatal(`חסרות עמודות חובה: ${labels.join(', ')}. אפשר להוריד את התבנית ולהתחיל ממנה.`)
      setStage('idle')
      return
    }

    const warnings = [
      ...parsed.errors.map((e) => `שורה ${e.line}: ${e.message}`),
      ...(mapping.unknown.length > 0
        ? [`עמודות שלא זוהו ולא ייובאו: ${mapping.unknown.join(', ')}`]
        : []),
    ]
    setFileWarnings(warnings)

    const rows = toRecords(mapping, dataRows)
    setRawRows(rows)

    const preview = await previewProductImport(rows)
    if (preview.error || !preview.rows || !preview.summary) {
      setFatal(preview.error ?? 'בדיקת הקובץ נכשלה')
      setStage('idle')
      return
    }
    setPreviewRows(preview.rows)
    setSummary(preview.summary)
    setStage('ready')
  }

  async function runImport() {
    const validLines = new Set(previewRows.filter((r) => r.errors.length === 0).map((r) => r.line))
    const toImport = rawRows.filter((r) => validLines.has(r.line))
    if (toImport.length === 0) return

    setStage('importing')
    setProgress({ done: 0, total: toImport.length })

    const results: ImportRowResult[] = []
    let insertedCount = 0
    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
      const batch = toImport.slice(i, i + BATCH_SIZE)
      const res = await importProductsBatch(batch)
      if (res.error || !res.results) {
        // A failed batch fails its rows, not the whole run: the rows already
        // inserted stay inserted and are reported below as such.
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
      }
      setProgress({ done: Math.min(i + BATCH_SIZE, toImport.length), total: toImport.length })
    }

    setImportResults(results)
    setInserted(insertedCount)
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

  const failedCount = (stage === 'done' ? importResults : previewRows).filter(
    (r) => r.errors.length > 0,
  ).length
  const shownRows = (stage === 'done' ? importResults : previewRows).filter(
    (r) => !errorsOnly || r.errors.length > 0,
  )
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

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
            בחירת קובץ CSV
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
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
        <p className="text-sm text-gray-600">
          עובדים באקסל? לשמור בפורמט CSV UTF-8 (שמירה בשם ‹ CSV UTF-8) ולהעלות את הקובץ. כל המוצרים
          נקלטים כטיוטה: פרסום נעשה מתוך עמוד המוצר, אחרי שיוך ספק.
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

      {summary && stage !== 'checking' ? (
        <div className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-semibold text-gray-900">
              {stage === 'done' ? 'תוצאות הייבוא' : 'תוצאות בדיקה (טרם נשמר דבר)'}
            </span>
            <span className="text-gray-600">סה"כ שורות: {summary.total}</span>
            <span className="text-emerald-700">
              {stage === 'done' ? `נקלטו: ${inserted}` : `תקינות: ${summary.valid}`}
            </span>
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

          <div className="flex flex-wrap items-center gap-3">
            {stage === 'ready' && summary.valid > 0 ? (
              <button type="button" className={btn} onClick={() => void runImport()}>
                <Upload className="h-4 w-4" aria-hidden />
                ייבוא {summary.valid} מוצרים כטיוטה
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
                <tr className="border-b border-black/10 text-start text-gray-500">
                  <th className="py-2 pe-4 text-start font-medium">שורה</th>
                  <th className="py-2 pe-4 text-start font-medium">שם</th>
                  <th className="py-2 pe-4 text-start font-medium">קישור (slug)</th>
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
                    <td className="py-2">
                      {row.errors.length === 0 ? (
                        <span className="text-emerald-700">
                          {stage === 'done' ? 'נקלט' : 'תקין'}
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
