/**
 * C149: builds migrations/pending/330_demo_deals.sql from ./demo-deals.mjs.
 *
 * Every deal goes through the C148 pipeline (validateDeal + buildProductWrite)
 * against its own master, so a demo row is exactly what the admin wizard
 * would have written. Money: whole shekels in, agorot out via src/lib/money.ts.
 *
 * Run: pnpm tsx scripts/demo/build-demo-deals.ts
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type DealTemplate,
  type RawValues,
  buildProductWrite,
  initialValues,
  validateDeal,
} from '../../src/lib/deal-templates/common'
import masters from '../../src/lib/deal-templates/masters.json'
import { agorotFromIlsNumber } from '../../src/lib/money'
import { CITIES, DEALS } from './demo-deals.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = resolve(root, 'migrations/pending/330_demo_deals.sql')

/** Published store number: demo businesses never route a call to a stranger. */
const DEMO_PHONE = '052-4635550'
const OFFER_UNTIL = '2027-01-31'
const PLATFORM_PERCENT = 20
const FALLBACK_CATEGORY = 'hot-deals'

const templates = masters as unknown as DealTemplate[]

function resolveImage(ref: string): string {
  let path: string
  if (ref.startsWith('/')) path = ref
  else if (ref.includes('.')) path = `/images/products/${ref}`
  else {
    const dir = resolve(root, 'public/images/cdn/wp', ref.slice(0, 2))
    const file = readdirSync(dir).find(
      (f) => f.startsWith(ref) && f.endsWith('.webp') && !/\.(card|og|thumb)\.webp$/.test(f),
    )
    if (!file) throw new Error(`image ${ref} not found`)
    path = `/images/cdn/wp/${ref.slice(0, 2)}/${file}`
  }
  if (!existsSync(resolve(root, 'public', path.slice(1)))) throw new Error(`missing ${path}`)
  return path
}

function raw(v: unknown): RawValues[string] {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.map(String)
  return String(v)
}

const q = (s: unknown) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`)
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`
const uuid = (key: string) => `md5(${q(`c149:${key}`)})::uuid`

const masterSlugs = new Set(templates.map((t) => t.slug))
const seen = new Set<string>()
const supplierSql = new Map<string, string>()
const productSql: string[] = []
const report: string[] = []
const failures: string[] = []

for (const deal of DEALS) {
  const t = templates.find((m) => m.slug === deal.master)
  if (!t) throw new Error(`unknown master ${deal.master}`)
  if (seen.has(t.slug)) throw new Error(`duplicate master ${t.slug}`)
  seen.add(t.slug)

  const city = deal.supplier.city as keyof typeof CITIES
  const coords = CITIES[city]
  if (!coords) throw new Error(`no coordinates for ${city}`)
  const address = `${deal.supplier.address}, ${city}`
  const waze = `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
  const isCoupon = t.product_type === 'coupon'
  const categorySlug = t.category_slug ?? FALLBACK_CATEGORY

  const values: RawValues = {
    ...initialValues(t),
    title: deal.title,
    short_description: deal.short,
    description: deal.description,
    category: categorySlug,
    tags: ['דמו', t.name_he],
    price: String(deal.price),
    compare_at_price: String(deal.compare),
    original_price_source: isCoupon ? 'מחירון בית העסק' : 'מחיר מחירון היבואן',
    platform_percent: String(PLATFORM_PERCENT),
    offer_valid_until: OFFER_UNTIL,
    supplier_name: deal.supplier.name,
    supplier_city: city,
    supplier_address: deal.supplier.address,
    supplier_phone: DEMO_PHONE,
    supplier_whatsapp: DEMO_PHONE,
    supplier_waze: waze,
    supplier_hours: deal.supplier.hours ?? 'א׳-ה׳ 09:00-19:00, ו׳ 09:00-13:00',
    fine_print: isCoupon
      ? 'השובר אישי ואינו ניתן להמרה בכסף. מימוש אחד לכל שובר, בכפוף לתיאום מראש מול בית העסק.'
      : 'המלאי מוגבל. התמונות להמחשה בלבד.',
  }
  if (!isCoupon) values.shipping_price = deal.price >= 300 ? '0' : '29'
  for (const [k, v] of Object.entries(deal.fields)) values[k] = raw(v)

  const result = validateDeal(t, values, { publish: true, imageCount: deal.img.length })
  if (!result.ok) {
    failures.push(`${t.slug}: ${JSON.stringify(result.errors)}`)
    continue
  }
  const images = deal.img.map(resolveImage)
  const slug = `demo-${t.slug}`
  const write = buildProductWrite(t, result.values, {
    slug,
    supplierId: null,
    images,
    publish: true,
  })

  const supplierKey = `supplier:${deal.supplier.name}`
  supplierSql.set(
    supplierKey,
    `(${uuid(supplierKey)}, ${q(deal.supplier.name)}, ${q(city)}, ${q(deal.supplier.address)}, ${q(DEMO_PHONE)}, ${q(DEMO_PHONE)}, 'active', true)`,
  )

  const price = agorotFromIlsNumber(deal.price)
  const compare = agorotFromIlsNumber(deal.compare)
  const discount = Math.round((1 - deal.price / deal.compare) * 100)
  const shippingAgorot = isCoupon ? null : Number(result.values.shipping_price ?? 0)
  const shekels = (a: number) => (a / 100).toFixed(0)

  const cols: Record<string, string> = {
    id: uuid(`product:${slug}`),
    supplier_id: uuid(supplierKey),
    category_id: `(select id from public.categories where slug = ${q(categorySlug)})`,
    type: `${q(t.product_type)}::product_type`,
    status: `'active'::product_status`,
    approval_status: `'approved'::product_approval_status`,
    slug: q(slug),
    name_he: q(deal.title),
    short_description_he: q(deal.short),
    description_he: q(deal.description),
    seo_description: q(deal.short),
    highlights: j(deal.highlights),
    attributes: j({ ...write.attributes, demo: true }),
    images: j(images),
    brand: q(deal.brand ?? null),
    tags: `array[${['דמו', t.name_he].map(q).join(', ')}]::text[]`,
    city: q(city),
    full_address: q(address),
    latitude: String(coords[0]),
    longitude: String(coords[1]),
    whatsapp_enabled: 'true',
    offer_valid_until: q(`${OFFER_UNTIL}T21:59:59Z`),
    platform_percent: String(PLATFORM_PERCENT),
    supplier_split_percent: String(100 - PLATFORM_PERCENT),
    commission_percent: String(PLATFORM_PERCENT),
    commission_type: `${q(isCoupon ? 'coupon_absolute' : 'physical_percent')}::commission_type`,
    is_coupon_enabled: String(isCoupon),
    coupon_expiry_days: isCoupon ? String(result.values.validity_days ?? 90) : 'null',
    // Coupon: the sticker (price_ils/full_price) is the business's list
    // price, the coupon price is what the shopper pays; matches the live
    // coupon rows. Physical: kenyon/price = sale, full = struck-through.
    // The *_agorot twins are generated columns (round(x * 100)), not written.
    price_ils: isCoupon ? shekels(compare) : shekels(price),
    kenyon_price: shekels(price),
    full_price: shekels(compare),
    compare_at_price_ils: shekels(compare),
    coupon_price_ils: isCoupon ? shekels(price) : 'null',
    discount_percent: String(discount),
    requires_shipping: String(!isCoupon),
    is_physical_shipping: String(!isCoupon),
    shipping_price_agorot: shippingAgorot == null ? 'null' : String(shippingAgorot),
    supplier_transfer_days: isCoupon ? 'null' : String(result.values.supplier_transfer_days ?? 14),
    cancellation_window_days: String(14),
    warranty_months: write.form.warranty_months ?? 'null',
    condition: q(write.form.condition || null),
    coupon_terms_he: q(write.form.coupon_terms_he),
    redemption_instructions_he: isCoupon
      ? q(
          `מציגים בבית העסק את השובר מהמייל או מהאזור האישי: קוד QR או קוד מימוש בן 8 ספרות. ${
            (deal.fields as Record<string, unknown>).booking_required
              ? `יש לתאם מראש בטלפון ${DEMO_PHONE}.`
              : 'אין צורך בתיאום מראש.'
          }`,
        )
      : 'null',
    stock_quantity: '50',
    max_per_order: String(result.values.max_units_per_order ?? 5),
    published_at: 'now()',
    is_demo: 'true',
  }
  const names = Object.keys(cols)
  productSql.push(
    `insert into public.products (${names.join(', ')})\nvalues (${names.map((n) => cols[n]).join(',\n  ')})\non conflict (slug) do update set ${names
      .filter((n) => n !== 'id' && n !== 'slug')
      .map((n) => `${n} = excluded.${n}`)
      .join(', ')};`,
  )
  report.push(`${t.slug}\t${slug}\t${t.product_type}\t${deal.price}/${deal.compare}\t-${discount}%`)
}

if (failures.length) throw new Error(`validation failed:\n${failures.join('\n')}`)
const missing = [...masterSlugs].filter((s) => !seen.has(s))
if (missing.length) throw new Error(`no demo deal for masters: ${missing.join(', ')}`)

const sql = `-- 330_demo_deals.sql (C149)
--
-- One complete demo deal per deal master (${seen.size} masters), every row
-- is_demo = true (products and their demo suppliers). Requires 329.
-- GENERATED by scripts/demo/build-demo-deals.ts from scripts/demo/demo-deals.mjs.
-- Idempotent: ids are md5 of a stable key, products upsert on slug.
-- Remove: delete from products where is_demo; delete from suppliers where is_demo;
-- Apply: supabase db query --linked -f migrations/pending/330_demo_deals.sql

begin;

insert into public.suppliers (id, name, city, address, contact_phone, whatsapp, status, is_demo)
values
${[...supplierSql.values()].join(',\n')}
on conflict (id) do update set name = excluded.name, city = excluded.city, address = excluded.address,
  contact_phone = excluded.contact_phone, whatsapp = excluded.whatsapp, status = excluded.status, is_demo = true;

${productSql.join('\n\n')}

commit;
`
writeFileSync(OUT, sql)
console.log(report.join('\n'))
console.log(`\n${seen.size} deals, ${supplierSql.size} suppliers -> ${OUT}`)
