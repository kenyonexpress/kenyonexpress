'use client'

import ImageUploader from '@/components/admin/ImageUploader'
import type { SupplierOption } from '@/components/admin/ProductForm'
import {
  type DealTemplate,
  type RawValue,
  type RawValues,
  type TemplateField,
  formSections,
  initialValues,
  validateDeal,
} from '@/lib/deal-templates/common'
import { cloneDealTemplate, createDealFromTemplate } from '@/server/actions/admin/deal-templates'
import { useMemo, useState, useTransition } from 'react'
import DealPreview from './DealPreview'
import TemplateCloner from './TemplateCloner'

interface Props {
  templates: DealTemplate[]
  categories: { id: string; name_he: string; slug: string }[]
  suppliers: SupplierOption[]
  canPublish: boolean
}

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand'

export default function DealWizard({
  templates: initialTemplates,
  categories,
  suppliers,
  canPublish,
}: Props) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [query, setQuery] = useState('')
  const [template, setTemplate] = useState<DealTemplate | null>(null)
  const [cloning, setCloning] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return templates
    return templates.filter(
      (t) =>
        t.name_he.toLowerCase().includes(q) ||
        t.slug.includes(q) ||
        t.fields.some((f) => f.label.includes(q)),
    )
  }, [query, templates])

  if (template) {
    return (
      <DealForm
        template={template}
        categories={categories}
        suppliers={suppliers}
        canPublish={canPublish}
        onBack={() => setTemplate(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-[#fed700] px-3 py-1 text-xs font-bold text-gray-900">
          שלב 1 מתוך 2
        </span>
        <h2 className="text-lg font-bold text-gray-900">בחירת תבנית דיל</h2>
        <a
          href="/admin/products/new?mode=classic"
          className="ms-auto text-sm text-[#0062bd] hover:underline"
        >
          טופס מוצר מלא (ללא תבנית)
        </a>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="חיפוש תבנית: אייפון, צימר, עיסוי..."
        aria-label="חיפוש תבנית"
        className={INPUT}
      />
      {(['coupon', 'physical'] as const).map((type) => {
        const list = filtered.filter((t) => t.product_type === type)
        if (list.length === 0) return null
        return (
          <section key={type}>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              {type === 'coupon' ? 'שוברים ודילים בבית העסק' : 'מוצרים במשלוח'} ({list.length})
            </h3>
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
              {list.map((t) => (
                <li key={t.slug}>
                  <button
                    type="button"
                    onClick={() => setTemplate(t)}
                    className="w-full rounded-lg border border-gray-200 bg-white p-3 text-start hover:border-[#fed700] hover:bg-[#fffbe0]"
                  >
                    <span className="block font-semibold text-gray-900">{t.name_he}</span>
                    <span className="block text-xs text-gray-500">
                      {t.fields.length} שדות ייעודיים{t.is_system ? '' : ' · תבנית מותאמת'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {filtered.length === 0 && (
        <p className="text-sm text-gray-500">לא נמצאה תבנית. אפשר ליצור חדשה מהקרובה ביותר.</p>
      )}

      <div className="rounded-lg border border-dashed border-gray-300 p-4">
        {cloning ? (
          <TemplateCloner
            templates={templates}
            initialName={query}
            onCancel={() => setCloning(false)}
            onSave={async (draft) => {
              const res = await cloneDealTemplate(draft)
              if (!res.ok) return res.error
              const source = templates.find((t) => t.slug === draft.source_slug)!
              const created: DealTemplate = {
                ...source,
                slug: res.slug,
                name_he: draft.name_he,
                fields: draft.fields,
                is_system: false,
                parent_slug: source.slug,
              }
              setTemplates((prev) => [...prev, created])
              setCloning(false)
              setTemplate(created)
              return null
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCloning(true)}
            className="text-sm font-semibold text-[#0062bd] hover:underline"
          >
            + יצירת תבנית חדשה מהתבנית הקרובה ביותר (נשמרת לשימוש עתידי)
          </button>
        )}
      </div>
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: TemplateField
  value: RawValue | undefined
  onChange: (v: RawValue) => void
  error?: string
}) {
  const id = `f_${field.key}`
  const label = (
    <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-700">
      {field.label}
      {field.required ? ' *' : ''}
    </label>
  )
  let control: React.ReactNode
  switch (field.type) {
    case 'bool':
      return (
        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.label}
        </label>
      )
    case 'textarea':
      control = (
        <textarea
          id={id}
          rows={3}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT}
        />
      )
      break
    case 'list':
      control = (
        <textarea
          id={id}
          rows={3}
          value={Array.isArray(value) ? value.join('\n') : String(value ?? '')}
          onChange={(e) => onChange(e.target.value.split('\n'))}
          className={INPUT}
          placeholder="פריט בכל שורה"
        />
      )
      break
    case 'select':
      control = (
        <select
          id={id}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT}
        >
          <option value="">בחירה...</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {field.key === 'validity_days' ? `${o} ימים` : o}
            </option>
          ))}
        </select>
      )
      break
    case 'multiselect': {
      const selected = Array.isArray(value) ? value : []
      control = (
        <div id={id} className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => {
            const on = selected.includes(o)
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? selected.filter((s) => s !== o) : [...selected, o])}
                className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-[#fed700] bg-[#fed700] font-semibold' : 'border-gray-300 bg-white'}`}
              >
                {o}
              </button>
            )
          })}
        </div>
      )
      break
    }
    default: {
      const numeric = field.type === 'int' || field.type === 'money' || field.type === 'percent'
      control = (
        <input
          id={id}
          type={
            field.type === 'date'
              ? 'date'
              : field.type === 'url'
                ? 'url'
                : field.type === 'phone'
                  ? 'tel'
                  : 'text'
          }
          inputMode={field.type === 'percent' ? 'decimal' : numeric ? 'numeric' : undefined}
          dir={numeric || field.type === 'phone' || field.type === 'url' ? 'ltr' : undefined}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT}
        />
      )
    }
  }
  return (
    <div>
      {label}
      {control}
      {field.help && <p className="mt-1 text-xs text-gray-500">{field.help}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-[#E4002B]">
          {error}
        </p>
      )}
    </div>
  )
}

function DealForm({
  template,
  categories,
  suppliers,
  canPublish,
  onBack,
}: {
  template: DealTemplate
  categories: Props['categories']
  suppliers: SupplierOption[]
  canPublish: boolean
  onBack: () => void
}) {
  const [values, setValues] = useState<RawValues>(() => {
    const init = initialValues(template)
    const cat = categories.find((c) => c.slug === template.category_slug)
    if (cat) init.category = cat.id
    return init
  })
  const [images, setImages] = useState<string[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const sections = useMemo(() => {
    return formSections(template).map((s) =>
      s.id === 'basics'
        ? {
            ...s,
            fields: s.fields.map((f) =>
              f.key === 'category' ? { ...f, options: categories.map((c) => c.id) } : f,
            ),
          }
        : s,
    )
  }, [template, categories])

  const set = (key: string, v: RawValue) => setValues((prev) => ({ ...prev, [key]: v }))

  function pickSupplier(id: string) {
    setSupplierId(id)
    const s = suppliers.find((x) => x.id === id)
    if (!s) return
    setValues((prev) => ({
      ...prev,
      supplier_name: s.name,
      supplier_phone: s.contact_phone ?? prev.supplier_phone,
      supplier_address: s.address ?? prev.supplier_address,
    }))
  }

  function submit(publish: boolean) {
    const local = validateDeal(template, values, {
      categoryIds: categories.map((c) => c.id),
      publish,
      imageCount: images.length,
    })
    if (publish && !supplierId) local.errors.supplier_name = 'לפרסום יש לבחור ספק רשום'
    setErrors(local.errors)
    if (Object.keys(local.errors).length > 0) {
      setMessage({ kind: 'error', text: `יש לתקן ${Object.keys(local.errors).length} שדות` })
      return
    }
    setMessage(null)
    startTransition(async () => {
      const res = await createDealFromTemplate({
        template_slug: template.slug,
        values,
        images,
        supplier_id: supplierId || null,
        publish,
      })
      if (!res.ok) {
        setErrors(res.errors ?? {})
        setMessage({ kind: 'error', text: res.error })
        return
      }
      setMessage({
        kind: 'ok',
        text: res.published
          ? `הדיל פורסם: /product/${res.slug}`
          : `נשמר כטיוטה: /product/${res.slug}`,
      })
      window.location.assign(`/admin/products/${res.id}/edit`)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-[#fed700] px-3 py-1 text-xs font-bold text-gray-900">
          שלב 2 מתוך 2
        </span>
        <h2 className="text-lg font-bold text-gray-900">דיל חדש: {template.name_he}</h2>
        <button
          type="button"
          onClick={onBack}
          className="ms-auto text-sm text-[#0062bd] hover:underline"
        >
          חזרה לבחירת תבנית
        </button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form
          className="space-y-6 rounded-xl border border-gray-200 bg-white p-6"
          onSubmit={(e) => {
            e.preventDefault()
            submit(false)
          }}
          noValidate
        >
          {sections.map((section) => (
            <fieldset key={section.id} className="space-y-3">
              <legend className="mb-2 text-base font-bold text-gray-900">{section.title}</legend>
              {section.id === 'supplier' && (
                <div>
                  <label
                    htmlFor="supplier_id"
                    className="mb-1 block text-xs font-medium text-gray-700"
                  >
                    ספק רשום (נדרש לפרסום)
                  </label>
                  <select
                    id="supplier_id"
                    value={supplierId}
                    onChange={(e) => pickSupplier(e.target.value)}
                    className={INPUT}
                  >
                    <option value="">בחירת ספק...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {section.fields.map((field) =>
                  field.key === 'category' ? (
                    <div key={field.key}>
                      <label
                        htmlFor="f_category"
                        className="mb-1 block text-xs font-medium text-gray-700"
                      >
                        {field.label} *
                      </label>
                      <select
                        id="f_category"
                        value={String(values.category ?? '')}
                        onChange={(e) => set('category', e.target.value)}
                        className={INPUT}
                      >
                        <option value="">בחירה...</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name_he}
                          </option>
                        ))}
                      </select>
                      {errors.category && (
                        <p role="alert" className="mt-1 text-xs text-[#E4002B]">
                          {errors.category}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div
                      key={field.key}
                      className={
                        field.type === 'textarea' || field.type === 'multiselect'
                          ? 'md:col-span-2'
                          : ''
                      }
                    >
                      <FieldInput
                        field={field}
                        value={values[field.key]}
                        onChange={(v) => set(field.key, v)}
                        error={errors[field.key]}
                      />
                    </div>
                  ),
                )}
              </div>
              {section.id === 'basics' && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-700">גלריית תמונות (עד 8) *</p>
                  <ImageUploader
                    bucket="product-images"
                    folder="products"
                    value={images}
                    onChange={setImages}
                    maxFiles={8}
                    altKind="product"
                    altSubject={String(values.title ?? '')}
                  />
                  {errors.gallery && (
                    <p role="alert" className="mt-1 text-xs text-[#E4002B]">
                      {errors.gallery}
                    </p>
                  )}
                </div>
              )}
            </fieldset>
          ))}

          {message && (
            <output
              className={`block text-sm ${message.kind === 'ok' ? 'text-green-700' : 'text-[#E4002B]'}`}
            >
              {message.text}
            </output>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
            {canPublish && (
              <button
                type="button"
                disabled={pending}
                onClick={() => submit(true)}
                className="rounded-lg bg-[#fed700] px-6 py-2.5 text-sm font-semibold text-gray-900 hover:bg-[#fedd26] disabled:opacity-60"
              >
                {pending ? 'שומר...' : 'פרסום'}
              </button>
            )}
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
            >
              שמירה כטיוטה
            </button>
          </div>
        </form>
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <p className="mb-2 text-xs font-semibold text-gray-500">תצוגה מקדימה חיה של עמוד המוצר</p>
          <DealPreview
            template={template}
            values={values}
            images={images}
            categoryName={categories.find((c) => c.id === values.category)?.name_he ?? ''}
          />
        </aside>
      </div>
    </div>
  )
}
