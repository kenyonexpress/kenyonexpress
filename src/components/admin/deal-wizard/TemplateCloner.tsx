'use client'

import type { DealTemplate, FieldType, TemplateField } from '@/lib/deal-templates/common'
import { slugify } from '@/lib/utils/slugify'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand'

const TYPE_LABELS: Partial<Record<FieldType, string>> = {
  text: 'טקסט',
  textarea: 'טקסט ארוך',
  int: 'מספר שלם',
  money: 'סכום (₪ שלמים)',
  select: 'בחירה אחת',
  multiselect: 'בחירה מרובה',
  bool: 'כן / לא',
  list: 'רשימה',
  date: 'תאריך',
}

export interface CloneDraft {
  source_slug: string
  slug: string
  name_he: string
  fields: TemplateField[]
}

/** Clone the closest master, edit its field list, save it as a new master. */
export default function TemplateCloner({
  templates,
  initialName,
  onSave,
  onCancel,
}: {
  templates: DealTemplate[]
  initialName: string
  onSave: (draft: CloneDraft) => Promise<string | null>
  onCancel: () => void
}) {
  const [sourceSlug, setSourceSlug] = useState(templates[0]?.slug ?? '')
  const [nameHe, setNameHe] = useState(initialName)
  const [slug, setSlug] = useState('')
  const [fields, setFields] = useState<TemplateField[]>(templates[0]?.fields ?? [])
  const [newField, setNewField] = useState({
    label: '',
    key: '',
    type: 'text' as FieldType,
    options: '',
    required: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function pickSource(s: string) {
    setSourceSlug(s)
    setFields(templates.find((t) => t.slug === s)?.fields ?? [])
  }

  function addField() {
    const key = newField.key || slugify(newField.label).replace(/-/g, '_')
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(key)) {
      setError('מפתח שדה: אותיות לטיניות קטנות, ספרות וקו תחתון')
      return
    }
    if (fields.some((f) => f.key === key)) {
      setError(`שדה כפול: ${key}`)
      return
    }
    const options = newField.options
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    setFields([
      ...fields,
      {
        key,
        label: newField.label.trim(),
        type: newField.type,
        ...(newField.required ? { required: true } : {}),
        ...(newField.type === 'select' || newField.type === 'multiselect' ? { options } : {}),
      },
    ])
    setNewField({ label: '', key: '', type: 'text', options: '', required: false })
    setError(null)
  }

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-gray-900">תבנית חדשה מתבנית קיימת</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label htmlFor="clone_source" className="mb-1 block text-xs font-medium text-gray-700">
            התבנית הקרובה ביותר
          </label>
          <select
            id="clone_source"
            value={sourceSlug}
            onChange={(e) => pickSource(e.target.value)}
            className={INPUT}
          >
            {templates.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name_he}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="clone_name" className="mb-1 block text-xs font-medium text-gray-700">
            שם התבנית החדשה *
          </label>
          <input
            id="clone_name"
            value={nameHe}
            onChange={(e) => setNameHe(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="clone_slug" className="mb-1 block text-xs font-medium text-gray-700">
            מזהה באנגלית *
          </label>
          <input
            id="clone_slug"
            dir="ltr"
            value={slug}
            placeholder={slugify(nameHe)}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            className={INPUT}
          />
        </div>
      </div>

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {fields.map((f) => (
          <li key={f.key} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="font-medium text-gray-900">{f.label}</span>
            <span className="text-xs text-gray-500">
              {TYPE_LABELS[f.type] ?? f.type}
              {f.required ? ' · חובה' : ''}
            </span>
            <button
              type="button"
              aria-label={`הסרת ${f.label}`}
              onClick={() => setFields(fields.filter((x) => x.key !== f.key))}
              className="ms-auto text-gray-400 hover:text-price"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="grid items-end gap-2 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <input
          aria-label="תווית שדה חדש"
          placeholder="תווית שדה חדש"
          value={newField.label}
          onChange={(e) => setNewField({ ...newField, label: e.target.value })}
          className={INPUT}
        />
        <select
          aria-label="סוג השדה"
          value={newField.type}
          onChange={(e) => setNewField({ ...newField, type: e.target.value as FieldType })}
          className={INPUT}
        >
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          aria-label="אפשרויות (מופרדות בפסיק)"
          placeholder="אפשרויות, מופרדות בפסיק"
          value={newField.options}
          disabled={newField.type !== 'select' && newField.type !== 'multiselect'}
          onChange={(e) => setNewField({ ...newField, options: e.target.value })}
          className={INPUT}
        />
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={newField.required}
            onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
          />
          חובה
        </label>
        <button
          type="button"
          onClick={addField}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          הוספה
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-price">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            const err = await onSave({
              source_slug: sourceSlug,
              slug: slug || slugify(nameHe),
              name_he: nameHe.trim(),
              fields,
            })
            setSaving(false)
            setError(err)
          }}
          className="rounded-lg bg-brand-primary px-5 py-2 text-sm font-semibold text-gray-900 hover:bg-brand-primary-hover disabled:opacity-60"
        >
          {saving ? 'שומר...' : 'שמירת התבנית והמשך'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:underline">
          ביטול
        </button>
      </div>
    </div>
  )
}
