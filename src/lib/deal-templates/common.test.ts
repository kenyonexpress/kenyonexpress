import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CANCELLATION_TEXT,
  type DealTemplate,
  SELLER_BUSINESS_ID,
  buildProductWrite,
  formSections,
  initialValues,
  validateDeal,
  validateField,
} from './common'
import mastersJson from './masters.json'

const masters = mastersJson as unknown as DealTemplate[]
const bySlug = (s: string) => masters.find((m) => m.slug === s)!
const keys = (s: string) => bySlug(s).fields.map((f) => f.key)

const CAT = '11111111-1111-4111-8111-111111111111'

function filled(t: DealTemplate) {
  const v = initialValues(t)
  Object.assign(v, {
    title: 'דיל בדיקה',
    description: 'תיאור מלא של הדיל לבדיקה אוטומטית',
    category: CAT,
    price: '199',
    compare_at_price: '299',
    original_price_source: 'מחירון בית העסק',
    platform_percent: '15',
    supplier_name: 'בית עסק',
    supplier_city: 'תל אביב',
    supplier_phone: '050-1234567',
  })
  for (const f of t.fields) {
    if (!f.required || v[f.key] !== undefined) continue
    const first = f.options?.[0] ?? ''
    v[f.key] =
      f.type === 'select'
        ? first
        : f.type === 'multiselect'
          ? [first]
          : f.type === 'int' || f.type === 'money'
            ? String(f.min ?? 1)
            : f.type === 'list'
              ? ['פריט']
              : f.type === 'bool'
                ? true
                : 'ערך'
  }
  return v
}

describe('deal masters', () => {
  it('has one master per required deal type', () => {
    for (const slug of [
      'iphone',
      'android-phone',
      'laptop',
      'tablet',
      'headphones',
      'restaurant',
      'cafe',
      'massage',
      'spa',
      'beauty-treatment',
      'tzimmer',
      'hotel',
      'baby-gear',
      'kids-toys',
      'pet-food',
      'pet-gear',
    ]) {
      expect(bySlug(slug), slug).toBeDefined()
    }
    expect(masters.length).toBeGreaterThanOrEqual(40)
  })

  it('carries exactly the specified type fields', () => {
    expect(keys('iphone')).toEqual(
      expect.arrayContaining([
        'model',
        'storage_gb',
        'color',
        'warranty_months',
        'condition',
        'included_accessories',
      ]),
    )
    expect(keys('restaurant')).toEqual(
      expect.arrayContaining([
        'meal_type',
        'max_diners',
        'menu_includes',
        'kosher',
        'booking_required',
      ]),
    )
    expect(keys('massage')).toEqual(
      expect.arrayContaining(['duration_min', 'treatment_type', 'what_to_bring']),
    )
    expect(keys('tzimmer')).toEqual(
      expect.arrayContaining([
        'nights',
        'max_guests',
        'checkin_checkout',
        'amenities',
        'weekend_price',
      ]),
    )
  })

  it('never repeats a common field inside a master', () => {
    const common = new Set([
      'title',
      'price',
      'gallery',
      'category',
      'tags',
      'platform_percent',
      'supplier_name',
    ])
    for (const m of masters)
      for (const f of m.fields) expect(common.has(f.key), `${m.slug}.${f.key}`).toBe(false)
  })

  it('defaults: coupons 90 days, physical free shipping, cashback 0', () => {
    for (const m of masters) {
      expect(m.defaults.cashback_percent).toBe(0)
      if (m.product_type === 'coupon') expect(m.defaults.validity_days).toBe(90)
      else expect(m.defaults.shipping_price_agorot).toBe(0)
    }
  })

  it('migration 328 seeds every master in masters.json', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../migrations/applied/328_deal_templates.sql'),
      'utf8',
    )
    for (const m of masters)
      expect(sql).toContain(`('${m.slug}', '${m.name_he.replaceAll("'", "''")}'`)
    expect(sql).not.toMatch(/\bnumeric\b/)
  })
})

describe('validation', () => {
  it('every master validates when filled with its defaults + required fields', () => {
    for (const m of masters) {
      const r = validateDeal(m, filled(m), { categoryIds: [CAT] })
      expect(r.errors, m.slug).toEqual({})
    }
  })

  it('money is whole shekels, stored as agorot', () => {
    expect(validateField({ key: 'p', label: 'מחיר', type: 'money' }, '199')).toEqual([19900, null])
    expect(validateField({ key: 'p', label: 'מחיר', type: 'money' }, '19.90')[1]).toContain(
      'שקלים שלמים',
    )
  })

  it('requires a source when a compare price is shown, and compare >= price', () => {
    const t = bySlug('massage')
    const v = filled(t)
    v.original_price_source = ''
    v.compare_at_price = '100'
    const r = validateDeal(t, v, { categoryIds: [CAT] })
    expect(r.errors.original_price_source).toBeDefined()
    expect(r.errors.compare_at_price).toBeDefined()
  })

  it('coupon validity is 30/60/90 only; publish needs an image', () => {
    const t = bySlug('spa')
    const v = filled(t)
    v.validity_days = '45'
    const r = validateDeal(t, v, { categoryIds: [CAT], publish: true, imageCount: 0 })
    expect(r.errors.validity_days).toBeDefined()
    expect(r.errors.gallery).toBeDefined()
  })

  it('physical legal block requires returns + delivery time; coupon does not', () => {
    const phys = formSections(bySlug('laptop'))
      .find((s) => s.id === 'legal')!
      .fields.map((f) => f.key)
    const coup = formSections(bySlug('tzimmer'))
      .find((s) => s.id === 'legal')!
      .fields.map((f) => f.key)
    expect(phys).toEqual(
      expect.arrayContaining(['returns_policy', 'delivery_days', 'cancellation_policy']),
    )
    expect(coup).not.toContain('returns_policy')
    expect(initialValues(bySlug('tzimmer')).cancellation_policy).toBe(CANCELLATION_TEXT.coupon)
    expect(initialValues(bySlug('tzimmer')).seller_business_id).toBe(SELLER_BUSINESS_ID)
  })
})

describe('buildProductWrite', () => {
  it('coupon: site charge is the coupon price, list price is the compare price', () => {
    const t = bySlug('tzimmer')
    const r = validateDeal(t, filled(t), { categoryIds: [CAT] })
    const w = buildProductWrite(t, r.values, {
      slug: 'x',
      supplierId: null,
      images: [],
      publish: false,
    })
    expect(w.form.coupon_price_ils).toBe('199')
    expect(w.form.kenyon_price).toBe('299')
    expect(w.form.coupon_expiry_days).toBe('90')
    expect(w.form.supplier_split_percent).toBe('85')
    expect(w.form.status).toBe('draft')
    expect((w.attributes.fields as Record<string, unknown>).weekend_price_agorot).toBe(100)
    expect(w.cashbackPercent).toBe(0)
  })

  it('physical: price, shipping in agorot, condition mapped to the column enum', () => {
    const t = bySlug('iphone')
    const r = validateDeal(t, filled(t), { categoryIds: [CAT] })
    const w = buildProductWrite(t, r.values, {
      slug: 'x',
      supplierId: null,
      images: ['/a.webp'],
      publish: true,
    })
    expect(w.form.kenyon_price).toBe('199')
    expect(w.form.shipping_price_agorot).toBe('0')
    expect(w.form.condition).toBe('new')
    expect(w.form.warranty_months).toBe('12')
    expect(w.form.status).toBe('active')
    expect(w.attributes.template).toBe('iphone')
  })
})

describe('buildProductWrite feeds the existing product schema', () => {
  it('every master produces a write productSchema accepts', async () => {
    const { productSchema } = await import('@/lib/admin/product-form-schema')
    for (const t of masters) {
      const r = validateDeal(t, filled(t), { categoryIds: [CAT] })
      const { form } = buildProductWrite(t, r.values, {
        slug: 'deal-test',
        supplierId: null,
        images: [],
        publish: true,
      })
      const g = (k: string) => (form[k] ? form[k] : null)
      const parsed = productSchema.safeParse({
        slug: form.slug,
        name_he: form.name_he,
        description_he: g('description_he'),
        category_id: g('category_id'),
        type: form.type,
        status: form.status,
        kenyon_price: g('kenyon_price'),
        full_price: g('full_price'),
        platform_percent: g('platform_percent'),
        supplier_split_percent: g('supplier_split_percent'),
        coupon_price_ils: g('coupon_price_ils'),
        coupon_expiry_days: g('coupon_expiry_days'),
        is_coupon_enabled: form.is_coupon_enabled === 'true',
        max_per_order: g('max_per_order'),
        requires_shipping: form.requires_shipping === 'true',
        is_physical_shipping: form.is_physical_shipping === 'true',
        city: g('city'),
        warranty_months: g('warranty_months'),
        condition: g('condition'),
        tags: [],
        highlights: [],
      })
      expect(parsed.success ? null : parsed.error.issues, t.slug).toBeNull()
    }
  })
})
