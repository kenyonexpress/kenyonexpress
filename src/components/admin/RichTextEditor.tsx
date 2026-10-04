'use client'

import RichText from '@/components/content/RichText'
import { useRef, useState } from 'react'

/**
 * The product description editor: a textarea that speaks the restricted markup
 * of `lib/content/markup` (the same grammar the CMS page bodies use, so the
 * admin learns one notation), a toolbar that types the markers, and a live
 * preview rendered by the same `RichText` the storefront uses, so what the
 * admin sees here is what the product page prints.
 *
 * No contentEditable and no HTML: the field posts plain text, the parser owns
 * the grammar, and the preview is React children (raw-html-gate).
 */

type Wrap = { kind: 'wrap'; before: string; after: string; placeholder: string }
type Prefix = { kind: 'prefix'; prefix: string; placeholder: string }

const TOOLS: { label: string; title: string; action: Wrap | Prefix }[] = [
  {
    label: 'ב',
    title: 'מודגש',
    action: { kind: 'wrap', before: '**', after: '**', placeholder: 'טקסט מודגש' },
  },
  {
    // Level 3: the product page already prints "תיאור המוצר" as its h2.
    label: 'כותרת',
    title: 'כותרת משנה',
    action: { kind: 'prefix', prefix: '### ', placeholder: 'כותרת' },
  },
  {
    label: '• רשימה',
    title: 'רשימת נקודות',
    action: { kind: 'prefix', prefix: '- ', placeholder: 'פריט' },
  },
  {
    label: '1. רשימה',
    title: 'רשימה ממוספרת',
    action: { kind: 'prefix', prefix: '1. ', placeholder: 'פריט' },
  },
]

function applyTool(
  value: string,
  start: number,
  end: number,
  action: Wrap | Prefix,
): { value: string; cursor: number } {
  const selected = value.slice(start, end)
  if (action.kind === 'wrap') {
    const inner = selected || action.placeholder
    const next = `${value.slice(0, start)}${action.before}${inner}${action.after}${value.slice(end)}`
    return {
      value: next,
      cursor: start + action.before.length + inner.length + action.after.length,
    }
  }
  // Prefix: at the start of the current line; selection spanning lines
  // prefixes each of them.
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEnd = end === start ? value.indexOf('\n', end) : end
  const blockEnd = lineEnd === -1 ? value.length : lineEnd
  const block = value.slice(lineStart, blockEnd) || action.placeholder
  const prefixed = block
    .split('\n')
    .map((line, i) => (action.prefix === '1. ' ? `${i + 1}. ${line}` : `${action.prefix}${line}`))
    .join('\n')
  const next = `${value.slice(0, lineStart)}${prefixed}${value.slice(blockEnd)}`
  return { value: next, cursor: lineStart + prefixed.length }
}

export default function RichTextEditor({
  id,
  name,
  value,
  onChange,
  rows = 6,
  className,
}: {
  id: string
  name: string
  value: string
  onChange: (next: string) => void
  rows?: number
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [showPreview, setShowPreview] = useState(false)

  function run(action: Wrap | Prefix) {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const result = applyTool(value, start, end, action)
    onChange(result.value)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(result.cursor, result.cursor)
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="עיצוב התיאור">
        {TOOLS.map((tool) => (
          <button
            key={tool.title}
            type="button"
            title={tool.title}
            aria-label={tool.title}
            onClick={() => run(tool.action)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {tool.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          aria-pressed={showPreview}
          className="ms-auto rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {showPreview ? 'הסתרת תצוגה מקדימה' : 'תצוגה מקדימה'}
        </button>
      </div>
      <textarea
        ref={ref}
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={className}
      />
      <p className="text-xs text-gray-500">
        **מודגש**, שורה שמתחילה ב-"### " היא כותרת, "- " נקודה, "1. " מספור, "&gt; " ציטוט,
        [טקסט](https://...) קישור. שורה ריקה מפרידה פסקאות.
      </p>
      {showPreview && (
        <div
          className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900"
          data-testid="rich-text-preview"
        >
          {value.trim() ? (
            <RichText markup={value} />
          ) : (
            <span className="text-gray-400">אין תיאור עדיין</span>
          )}
        </div>
      )}
    </div>
  )
}

export { applyTool }
