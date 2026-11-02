/**
 * C148 deal master templates: the field model, the fields every deal shares,
 * validation, and the mapping onto the existing product write.
 *
 * Pure module (no server, no DOM), so the admin wizard, the server action and
 * the tests all run the same rules. The per-type fields live in the
 * `deal_templates` table (seeded from ./masters.json by migration 328).
 *
 * Money: the admin types whole shekels; every money value leaves this module
 * as integer agorot through src/lib/money.ts. `kenyon_price` / `full_price` /
 * `coupon_price_ils` are the existing upsert inputs and are whole-shekel
 * integers, exactly what ProductForm posts.
 */
import {
  BP_WHOLE,
  agorotFromDb,
  agorotFromShekelInput,
  agorotToWholeShekelString,
  bpFromPercentColumn,
  bpToShortPercentString,
  formatAgorot,
  percentFromColumn,
} from '@/lib/money'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'int'
  | 'money'
  | 'percent'
  | 'select'
  | 'multiselect'
  | 'bool'
  | 'list'
  | 'date'
  | 'phone'
  | 'url'

export interface TemplateField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: string[]
  min?: number
  max?: number
  default?: unknown
  help?: string
}

export type DealProductType = 'coupon' | 'physical'

export interface DealTemplate {
  slug: string
  name_he: string
  product_type: DealProductType
  category_slug: string | null
  fields: TemplateField[]
  defaults: Record<string, unknown>
  is_system?: boolean
  parent_slug?: string | null
}

/** What a form holds before validation: strings, string lists, booleans. */
export type RawValue = string | string[] | boolean
export type RawValues = Record<string, RawValue | undefined>
/** After validation: int/money/percent are numbers (money in agorot). */
export type CleanValue = string | number | boolean | string[] | null | undefined

export const SELLER_LEGAL_NAME = 'קניון אקספרס'
export const SELLER_BUSINESS_ID = '033798513'
export const VALIDITY_DAYS = ['30', '60', '90'] as const

export const CANCELLATION_TEXT: Record<DealProductType, string> = {
  coupon:
    'ניתן לבטל את העסקה תוך 14 ימים מיום הרכישה, ובלבד שהשובר טרם מומש, בהתאם לסעיף 14ג לחוק הגנת הצרכן, התשמ״א-1981. דמי ביטול: 5% ממחיר העסקה או 100 ₪, הנמוך מביניהם. שובר שלא מומש בתוקפו ניתן לבטל בהתאם לדין.',
  physical:
    'ניתן לבטל את העסקה תוך 14 ימים מיום קבלת המוצר או מסמך הגילוי, המאוחר מביניהם, בהתאם לסעיף 14ג לחוק הגנת הצרכן, התשמ״א-1981. יש להחזיר את המוצר באריזתו המקורית וללא שימוש. דמי ביטול: 5% ממחיר העסקה או 100 ₪, הנמוך מביניהם.',
}

export const RETURNS_TEXT =
  'החזרת המוצר מתבצעת באיסוף או במסירה לנקודת השירות של הספק. הזיכוי יבוצע באמצעי התשלום המקורי תוך 14 ימים מקבלת הודעת הביטול.'

/** Shared by every deal. `category` options are filled at render time. */
export const COMMON_BASICS: TemplateField[] = [
  { key: 'title', label: 'כותרת הדיל', type: 'text', required: true, min: 2, max: 120 },
  { key: 'short_description', label: 'תיאור קצר', type: 'textarea', max: 300 },
  { key: 'description', label: 'תיאור מלא', type: 'textarea', required: true, min: 20 },
  { key: 'category', label: 'קטגוריה', type: 'select', required: true },
  { key: 'tags', label: 'תגיות', type: 'list', help: 'תגית בכל שורה' },
]

export const COMMON_PRICING: TemplateField[] = [
  { key: 'price', label: 'מחיר באתר (₪)', type: 'money', required: true, min: 1 },
  { key: 'compare_at_price', label: 'מחיר להשוואה (₪)', type: 'money' },
  {
    key: 'original_price_source',
    label: 'מקור המחיר להשוואה',
    type: 'text',
    help: 'למשל: מחירון בית העסק. חובה כשמוזן מחיר להשוואה',
  },
  { key: 'platform_percent', label: 'עמלת פלטפורמה (%)', type: 'percent', required: true },
  { key: 'max_units_per_order', label: 'מקסימום יחידות בהזמנה', type: 'int', min: 1, max: 100 },
  { key: 'offer_valid_until', label: 'המבצע בתוקף עד', type: 'date' },
  { key: 'cashback_percent', label: 'קאשבק (%)', type: 'percent' },
]

export const COUPON_FIELDS: TemplateField[] = [
  {
    key: 'validity_days',
    label: 'תוקף השובר (ימים מיום הרכישה)',
    type: 'select',
    required: true,
    options: [...VALIDITY_DAYS],
  },
]

export const PHYSICAL_FIELDS: TemplateField[] = [
  { key: 'shipping_price', label: 'מחיר משלוח (₪)', type: 'money' },
  { key: 'supplier_transfer_days', label: 'ימי העברה לספק', type: 'int', min: 0, max: 90 },
  { key: 'cancellation_window_days', label: 'חלון ביטול (ימים)', type: 'int', min: 0, max: 365 },
]

export const SUPPLIER_FIELDS: TemplateField[] = [
  { key: 'supplier_name', label: 'שם בית העסק', type: 'text', required: true, min: 2, max: 80 },
  { key: 'supplier_city', label: 'עיר', type: 'text', required: true, max: 60 },
  { key: 'supplier_address', label: 'כתובת', type: 'text', max: 200 },
  { key: 'supplier_phone', label: 'טלפון', type: 'phone', required: true },
  { key: 'supplier_whatsapp', label: 'וואטסאפ', type: 'phone' },
  { key: 'supplier_waze', label: 'קישור Waze', type: 'url' },
  { key: 'supplier_hours', label: 'שעות פעילות', type: 'textarea' },
]

export function legalFields(type: DealProductType): TemplateField[] {
  const shared: TemplateField[] = [
    { key: 'seller_legal_name', label: 'שם המוכר', type: 'text', required: true },
    { key: 'seller_business_id', label: 'ח.פ / ע.מ', type: 'text', required: true },
    {
      key: 'cancellation_policy',
      label: 'מדיניות ביטול',
      type: 'textarea',
      required: true,
      min: 20,
    },
    { key: 'fine_print', label: 'תנאים והגבלות', type: 'textarea' },
    { key: 'price_includes_vat', label: 'המחיר כולל מע״מ', type: 'bool' },
  ]
  if (type === 'coupon') return shared
  return [
    ...shared,
    { key: 'returns_policy', label: 'מדיניות החזרות', type: 'textarea', required: true },
    {
      key: 'delivery_days',
      label: 'מועד אספקה (ימי עסקים)',
      type: 'int',
      required: true,
      min: 1,
      max: 60,
    },
  ]
}

export interface FieldSection {
  id: string
  title: string
  fields: TemplateField[]
}

/** The full form for one template, in render order. */
export function formSections(
  t: Pick<DealTemplate, 'product_type' | 'fields' | 'name_he'>,
): FieldSection[] {
  return [
    { id: 'basics', title: 'פרטי הדיל', fields: COMMON_BASICS },
    { id: 'pricing', title: 'מחיר ועמלה', fields: COMMON_PRICING },
    t.product_type === 'coupon'
      ? { id: 'coupon', title: 'תוקף השובר', fields: COUPON_FIELDS }
      : { id: 'physical', title: 'משלוח והעברה לספק', fields: PHYSICAL_FIELDS },
    { id: 'template', title: `פרטי ${t.name_he}`, fields: t.fields },
    { id: 'supplier', title: 'פרטי בית העסק', fields: SUPPLIER_FIELDS },
    { id: 'legal', title: 'גילוי נאות לפי חוק הגנת הצרכן', fields: legalFields(t.product_type) },
  ]
}

function toRaw(v: unknown): RawValue | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.map(String)
  return String(v)
}

/** Starting values for a new deal: common defaults, then the template's. */
export function initialValues(t: DealTemplate): RawValues {
  const d = t.defaults ?? {}
  const values: RawValues = {
    max_units_per_order: toRaw(d.max_units_per_order ?? (t.product_type === 'coupon' ? 10 : 5)),
    cashback_percent: toRaw(d.cashback_percent ?? 0),
    seller_legal_name: SELLER_LEGAL_NAME,
    seller_business_id: SELLER_BUSINESS_ID,
    cancellation_policy: CANCELLATION_TEXT[t.product_type],
    price_includes_vat: true,
  }
  if (t.product_type === 'coupon') {
    values.validity_days = toRaw(d.validity_days ?? 90)
  } else {
    values.shipping_price = agorotToWholeShekelString(agorotFromDb(d.shipping_price_agorot))
    values.supplier_transfer_days = toRaw(d.supplier_transfer_days ?? 14)
    values.cancellation_window_days = toRaw(d.cancellation_window_days ?? 14)
    values.returns_policy = RETURNS_TEXT
    values.delivery_days = '5'
  }
  for (const field of t.fields) {
    const v = d[field.key] ?? field.default
    if (field.type === 'money' && d[`${field.key}_agorot`] != null) {
      values[field.key] = agorotToWholeShekelString(agorotFromDb(d[`${field.key}_agorot`]))
    } else if (v !== undefined) {
      values[field.key] = toRaw(v)
    }
  }
  return values
}

const PHONE_RE = /^(?:\+972|0)(?:[23489]|5\d|7\d)-?\d{3}-?\d{4}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isEmpty(v: RawValue | undefined): boolean {
  if (v === undefined) return true
  if (typeof v === 'boolean') return false
  if (Array.isArray(v)) return v.filter((s) => s.trim() !== '').length === 0
  return typeof v === 'string' && v.trim() === ''
}

function asText(v: RawValue | undefined): string {
  if (Array.isArray(v)) return v.join('\n')
  return typeof v === 'string' ? v.trim() : ''
}

function asList(v: RawValue | undefined): string[] {
  const parts = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n/) : []
  return parts.map((s) => s.trim()).filter(Boolean)
}

/**
 * One field. Returns [clean value, Hebrew error or null]. `money` returns
 * integer agorot; whole shekels only, matching the display rule.
 */
export function validateField(
  field: TemplateField,
  raw: RawValue | undefined,
): [CleanValue, string | null] {
  const { label } = field
  if (field.type === 'bool') return [raw === true || raw === 'true' || raw === 'on', null]
  if (isEmpty(raw)) {
    return [
      field.type === 'list' || field.type === 'multiselect' ? [] : null,
      field.required ? `${label}: שדה חובה` : null,
    ]
  }
  const text = asText(raw)
  switch (field.type) {
    case 'text':
    case 'textarea': {
      if (field.min != null && text.length < field.min)
        return [text, `${label}: לפחות ${field.min} תווים`]
      if (field.max != null && text.length > field.max)
        return [text, `${label}: עד ${field.max} תווים`]
      return [text, null]
    }
    case 'int': {
      if (!/^-?\d+$/.test(text)) return [null, `${label}: מספר שלם בלבד`]
      const n = Number(text)
      if (field.min != null && n < field.min) return [n, `${label}: מינימום ${field.min}`]
      if (field.max != null && n > field.max) return [n, `${label}: מקסימום ${field.max}`]
      return [n, null]
    }
    case 'money': {
      if (!/^\d+$/.test(text)) return [null, `${label}: סכום בשקלים שלמים בלבד`]
      const amount = agorotFromShekelInput(text)
      if (amount == null) return [null, `${label}: סכום בשקלים שלמים בלבד`]
      if (field.min != null && amount < field.min * 100)
        return [null, `${label}: מינימום ${field.min} ₪`]
      return [amount, null]
    }
    case 'percent': {
      if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text)) return [null, `${label}: אחוז בין 0 ל-100`]
      const n = Number(text)
      if (n > 100) return [null, `${label}: אחוז בין 0 ל-100`]
      return [n, null]
    }
    case 'select': {
      if (field.options && !field.options.includes(text)) return [null, `${label}: בחירה לא תקינה`]
      return [text, null]
    }
    case 'multiselect': {
      const list = asList(raw)
      const bad = field.options ? list.find((s) => !field.options!.includes(s)) : undefined
      if (bad) return [list, `${label}: ערך לא תקין "${bad}"`]
      return [list, null]
    }
    case 'list':
      return [asList(raw), null]
    case 'date': {
      if (!DATE_RE.test(text) || Number.isNaN(Date.parse(text)))
        return [null, `${label}: תאריך לא תקין`]
      return [text, null]
    }
    case 'phone': {
      const compact = text.replace(/[\s-]/g, '')
      if (!PHONE_RE.test(compact)) return [null, `${label}: מספר טלפון ישראלי לא תקין`]
      return [compact, null]
    }
    case 'url': {
      try {
        const u = new URL(text)
        if (u.protocol !== 'https:') return [null, `${label}: קישור https בלבד`]
        return [u.toString(), null]
      } catch {
        return [null, `${label}: קישור לא תקין`]
      }
    }
  }
}

export interface ValidationResult {
  ok: boolean
  values: Record<string, CleanValue>
  errors: Record<string, string>
}

/** Every section, every error at once (the admin should not submit six times). */
export function validateDeal(
  t: DealTemplate,
  raw: RawValues,
  opts: { categoryIds?: string[]; publish?: boolean; imageCount?: number } = {},
): ValidationResult {
  const values: Record<string, CleanValue> = {}
  const errors: Record<string, string> = {}
  for (const section of formSections(t)) {
    for (const field of section.fields) {
      const effective =
        field.key === 'category' && opts.categoryIds
          ? { ...field, options: opts.categoryIds }
          : field
      const [v, err] = validateField(effective, raw[field.key])
      values[field.key] = v
      if (err) errors[field.key] = err
    }
  }
  const price = values.price as number | null
  const compare = values.compare_at_price as number | null
  if (compare != null && price != null && compare < price) {
    errors.compare_at_price = 'מחיר להשוואה חייב להיות גבוה או שווה למחיר באתר'
  }
  if (compare != null && !values.original_price_source) {
    errors.original_price_source = 'מקור המחיר להשוואה: חובה כשמוזן מחיר להשוואה'
  }
  if (
    t.product_type === 'coupon' &&
    !VALIDITY_DAYS.includes(String(values.validity_days) as '90')
  ) {
    errors.validity_days = 'תוקף השובר: 30, 60 או 90 ימים'
  }
  if (
    values.offer_valid_until &&
    Date.parse(String(values.offer_valid_until)) < Date.now() - 86_400_000
  ) {
    errors.offer_valid_until = 'תאריך סיום המבצע כבר עבר'
  }
  if (opts.publish && (opts.imageCount ?? 0) < 1) {
    errors.gallery = 'גלריה: נדרשת לפחות תמונה אחת לפרסום'
  }
  return { ok: Object.keys(errors).length === 0, values, errors }
}

/** Keys of the template's own fields, for attributes.fields. */
function templateAttributes(
  t: DealTemplate,
  v: Record<string, CleanValue>,
): Record<string, CleanValue> {
  const out: Record<string, CleanValue> = {}
  for (const field of t.fields) {
    const value = v[field.key]
    if (value === null || (Array.isArray(value) && value.length === 0)) continue
    out[field.type === 'money' ? `${field.key}_agorot` : field.key] = value
  }
  return out
}

export interface ProductWrite {
  /** Keys posted to the existing upsertProduct action (same names ProductForm uses). */
  form: Record<string, string>
  /** Written to products.attributes after the upsert. */
  attributes: Record<string, unknown>
  cashbackPercent: number
}

/**
 * Validated values to the existing product write. Prices go through the
 * upsert's own money path (whole shekels in, agorot columns out), so the
 * publish gate, split pair and audit stay the single implementation.
 */
export function buildProductWrite(
  t: DealTemplate,
  v: Record<string, CleanValue>,
  ctx: { slug: string; supplierId: string | null; images: string[]; publish: boolean },
): ProductWrite {
  const shekels = (a: CleanValue) => (a == null ? '' : agorotToWholeShekelString(agorotFromDb(a)))
  const platformBp = bpFromPercentColumn(v.platform_percent) ?? 0
  const cashbackPercent = percentFromColumn(v.cashback_percent) ?? 0
  const form: Record<string, string> = {
    slug: ctx.slug,
    name_he: String(v.title ?? ''),
    short_description_he: String(v.short_description ?? ''),
    description_he: String(v.description ?? ''),
    category_id: String(v.category ?? ''),
    supplier_id: ctx.supplierId ?? '',
    type: t.product_type,
    status: ctx.publish ? 'active' : 'draft',
    platform_percent: bpToShortPercentString(platformBp),
    supplier_split_percent: bpToShortPercentString(BP_WHOLE - platformBp),
    max_per_order: v.max_units_per_order == null ? '' : String(v.max_units_per_order),
    offer_valid_until: v.offer_valid_until ? String(v.offer_valid_until) : '',
    tags: ((v.tags as string[]) ?? []).join(','),
    images: JSON.stringify(ctx.images),
    city: String(v.supplier_city ?? ''),
    full_address: String(v.supplier_address ?? ''),
    whatsapp_enabled: v.supplier_whatsapp ? 'true' : 'false',
    coupon_terms_he: [v.cancellation_policy, v.fine_print].filter(Boolean).join('\n\n'),
  }
  if (t.product_type === 'coupon') {
    // Coupon: the site charge is the coupon price; the list price is the
    // compare price when there is one (coupon price may not exceed it).
    form.coupon_price_ils = shekels(v.price)
    form.kenyon_price = shekels(v.compare_at_price ?? v.price)
    form.full_price = shekels(v.compare_at_price)
    form.coupon_expiry_days = String(v.validity_days ?? 90)
    form.is_coupon_enabled = 'true'
    form.requires_shipping = 'false'
    form.is_physical_shipping = 'false'
  } else {
    form.kenyon_price = shekels(v.price)
    form.full_price = shekels(v.compare_at_price)
    form.requires_shipping = 'true'
    form.is_physical_shipping = 'true'
    form.shipping_price_agorot = v.shipping_price == null ? '0' : String(v.shipping_price)
    if (v.supplier_transfer_days != null)
      form.supplier_transfer_days = String(v.supplier_transfer_days)
    if (v.cancellation_window_days != null)
      form.cancellation_window_days = String(v.cancellation_window_days)
    if (v.warranty_months != null) form.warranty_months = String(v.warranty_months)
    if (v.condition) {
      form.condition =
        { חדש: 'new', מחודש: 'refurbished', משומש: 'used' }[String(v.condition)] ?? ''
    }
  }
  if (v.brand) form.brand = String(v.brand)

  const attributes = {
    template: t.slug,
    template_name_he: t.name_he,
    fields: templateAttributes(t, v),
    original_price_source: v.original_price_source ?? null,
    supplier: {
      name: v.supplier_name,
      city: v.supplier_city,
      address: v.supplier_address,
      phone: v.supplier_phone,
      whatsapp: v.supplier_whatsapp,
      waze: v.supplier_waze,
      hours: v.supplier_hours,
    },
    legal: {
      seller_legal_name: v.seller_legal_name,
      seller_business_id: v.seller_business_id,
      cancellation_policy: v.cancellation_policy,
      fine_print: v.fine_print,
      price_includes_vat: v.price_includes_vat,
      ...(t.product_type === 'physical'
        ? { returns_policy: v.returns_policy, delivery_days: v.delivery_days }
        : { validity_days: Number(v.validity_days ?? 90) }),
    },
    cashback_percent: cashbackPercent,
  }
  return { form, attributes, cashbackPercent }
}

/** Display a template value in Hebrew for the preview and the product page. */
export function displayValue(field: TemplateField, v: CleanValue): string {
  if (v === null || v === undefined) return ''
  if (field.type === 'bool') return v ? 'כן' : 'לא'
  if (field.type === 'money') return formatAgorot(agorotFromDb(v))
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

export const TEMPLATE_SLUG_RE = /^[a-z0-9-]{2,60}$/
