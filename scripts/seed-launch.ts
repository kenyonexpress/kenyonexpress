/**
 * Launch seed (queue item G4, 05.11.2026): three sample coupons, one dummy
 * supplier, through the same money module, publish gate and image pipeline the
 * admin form uses, written with the service-role client the way every seed in
 * this repo writes (`scripts/seed-demo-catalog.ts` explains why a script cannot
 * call the server action: no staff session, no multipart request).
 *
 * Usage (repo root):
 *   pnpm exec tsx scripts/seed-launch.ts --check    # read-only: are the three rows there, and in what state
 *   pnpm exec tsx scripts/seed-launch.ts --apply    # upsert supplier + images + 3 coupons (idempotent, fixed ids)
 *   pnpm exec tsx scripts/seed-launch.ts --remove   # delete exactly those rows; refuses if an order references one
 *
 * THE TARGET GUARD IS THE REPO'S. `scripts/seed-target-guard.mjs` refuses the
 * production ref unless `SEED_ALLOW_PRODUCTION=i-understand` is set. G4 is an
 * explicit instruction to seed production, so the run that did it set the
 * override on the command line; the script itself does not bypass the guard.
 *
 * FLAGGED FOR ONE-COMMAND REMOVAL. There is no `is_seed` column and none is
 * added: `products.is_demo` and `suppliers.is_demo` already exist in production
 * for exactly this purpose, and `tags` carries `launch-seed` so the three rows
 * are distinguishable from the 72 `demo-` rows the demo catalogue seeded. Fixed
 * ids (`de30de30-0000-4000-8000-3...`) make `--remove` exact.
 *
 * IMAGES COME FROM THE OLD SITE ONLY (`wp_import/media/<sha256>.webp`, the
 * attachments stage 06 downloaded), never stock, never placeholders. Each one
 * goes through `processImage` (webp + avif at 1600/800/400 plus the blur) and
 * is stored under `launch-seed/<slug>/w<width>.<format>`, the admin upload
 * action's own key shape, in R2 when configured and otherwise in the public
 * `product-images` bucket. The product's `images[0]` is the largest webp URL,
 * which is what the storefront reads.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { agorot, agorotToIls } from '@/lib/commerce/money'
import { assertPublishable, buildProductMoneyWrite } from '@/lib/commerce/product-money'
import { processImage } from '@/lib/images/process'
import type { Database } from '@/types/database'
import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { checkSeedTarget, refusalMessage } from './seed-target-guard.mjs'
import { loadEnv } from './seed/demo-catalog-env'
import {
  type ImageSink,
  createR2Sink,
  createSupabaseStorageSink,
  isR2Env,
  storeImageSet,
} from './seed/demo-catalog-images'
import { toMediaAssetRow } from './seed/demo-catalog-rows'

type Admin = SupabaseClient<Database>
type ProductInsert = Database['public']['Tables']['products']['Insert']
type SupplierInsert = Database['public']['Tables']['suppliers']['Insert']

const LAUNCH_ID_PREFIX = 'de30de30-0000-4000-8000-3'
function launchId(index: number): string {
  return `${LAUNCH_ID_PREFIX}${String(index).padStart(11, '0')}`
}

// `is_demo` is live in production (measured) but absent from src/types/database.ts,
// so it rides an intersection type and is cast away at the write.
const SUPPLIER: SupplierInsert & { id: string; is_demo: boolean } = {
  id: launchId(1),
  name: 'דמה - להחליף',
  contact_name: 'דמה - להחליף',
  contact_email: 'launch-seed@example.test',
  contact_phone: '050-0000000',
  whatsapp: '050-0000000',
  address: 'רחוב לדוגמה 1',
  city: 'תל אביב',
  website: null,
  business_id: '000000000',
  status: 'active',
  is_demo: true,
}

type LaunchCoupon = {
  index: number
  slug: string
  nameHe: string
  shortDescriptionHe: string
  descriptionHe: string
  /** The online charge, agorot. */
  paidAgorot: number
  /** The face value struck through on the card, agorot. */
  originalAgorot: number
  couponExpiryDays: 30 | 60 | 90
  categorySlug: string
  /** sha256 prefix of the old-site attachment under wp_import/media. */
  imageSha: string
  imageAltHe: string
}

const PLATFORM_PERCENT = 15
const STOCK = 50

const COUPONS: LaunchCoupon[] = [
  {
    index: 1,
    slug: 'launch-italian-dinner-tlv',
    nameHe: 'ארוחת זוגית איטלקית - תל אביב',
    shortDescriptionHe:
      'ארוחה זוגית במסעדה איטלקית בתל אביב: שתי מנות ראשונות, שתי עיקריות וקינוח לשניים.',
    descriptionHe:
      'ארוחה זוגית במסעדה איטלקית בלב תל אביב. השובר כולל שתי מנות ראשונות לבחירה, שתי מנות עיקריות מהתפריט וקינוח אחד לשניים. בתיאום מראש מול המסעדה.',
    paidAgorot: 11900,
    originalAgorot: 24000,
    couponExpiryDays: 90,
    categorySlug: 'restaurants-cafes',
    imageSha: 'db5fd07a89165e23',
    imageAltHe: 'ארוחה זוגית במסעדה איטלקית',
  },
  {
    index: 2,
    slug: 'launch-swedish-massage-60',
    nameHe: 'עיסוי שוודי שעה - פאטאיה סטייל',
    shortDescriptionHe: 'עיסוי שוודי מלא של 60 דקות בסטודיו מקצועי, כולל שמנים ארומטיים.',
    descriptionHe:
      'עיסוי שוודי בן 60 דקות בסגנון פאטאיה, בסטודיו מקצועי עם מטפל מוסמך. כולל שמנים ארומטיים ושתייה חמה בסיום. בתיאום מראש.',
    paidAgorot: 14900,
    originalAgorot: 32000,
    couponExpiryDays: 60,
    categorySlug: 'beauty-health',
    imageSha: 'aeebab5ec8c2fb75',
    imageAltHe: 'עיסוי שוודי בסטודיו',
  },
  {
    index: 3,
    slug: 'launch-north-cabin-2-nights',
    nameHe: 'לינה בצימר צפון - 2 לילות',
    shortDescriptionHe: 'שני לילות לזוג בצימר בצפון, כולל ג׳קוזי פרטי וארוחת בוקר כפרית.',
    descriptionHe:
      'שני לילות לזוג בצימר מאובזר בצפון הארץ: ג׳קוזי פרטי, מרפסת נוף וארוחת בוקר כפרית בכל בוקר. אמצע שבוע, בתיאום מראש מול בעל הצימר.',
    paidAgorot: 79000,
    originalAgorot: 140000,
    couponExpiryDays: 90,
    categorySlug: 'vacation',
    imageSha: 'b41ac0e6d36a9289',
    imageAltHe: 'צימר בצפון עם ג׳קוזי',
  },
]

const ARGS = new Set(process.argv.slice(2))
const APPLY = ARGS.has('--apply')
const REMOVE = ARGS.has('--remove')
const CHECK = ARGS.has('--check') || (!APPLY && !REMOVE)

function resolveTarget(env: Record<string, string | undefined>): { url: string; key: string } {
  const url = env.SEED_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    console.error('seed-launch: no SEED_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.')
    process.exit(1)
  }
  const key = env.SEED_SUPABASE_URL
    ? env.SEED_SUPABASE_SERVICE_KEY
    : (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY)
  if (!key) {
    console.error('seed-launch: no service key (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY).')
    process.exit(1)
  }
  const verdict = checkSeedTarget({ url, override: env.SEED_ALLOW_PRODUCTION })
  if (!CHECK && !verdict.allowed) {
    console.error(refusalMessage(verdict.ref))
    process.exit(1)
  }
  console.log(`target project ${verdict.ref ?? 'unknown'}${verdict.allowed ? '' : ' (read-only)'}`)
  return { url, key }
}

function sourceImage(sha: string): Buffer {
  const dir = resolve('wp_import/media')
  const name = `${sha}`
  // The manifest stores the full sha256; the dataset keeps the 16-char prefix
  // and the file is matched on it. Two files sharing a 16-hex prefix is not a
  // thing that happens.
  const { readdirSync } = require('node:fs') as typeof import('node:fs')
  const match = readdirSync(dir).find(
    (f) => f.startsWith(name) && f.endsWith('.webp') && !/\.(card|thumb|og)\.webp$/.test(f),
  )
  if (!match) throw new Error(`no wp_import/media file for sha ${sha}`)
  return readFileSync(resolve(dir, match))
}

/**
 * The public bucket lists the MIME types it accepts, and `image/avif` is not
 * among them (measured 05.11.2026: the first upload answered "mime type
 * image/avif is not supported"). The admin action has the same gap on this
 * sink; here the avif renditions are dropped for a Supabase sink that refuses
 * them, and the webp set, which is what the storefront reads, goes through.
 */
async function avifAccepted(sink: ImageSink, admin: Admin): Promise<boolean> {
  if (sink.name !== 'supabase' || !sink.bucket) return true
  const { data } = await admin.storage.getBucket(sink.bucket)
  const allowed = data?.allowed_mime_types
  return !Array.isArray(allowed) || allowed.length === 0 || allowed.includes('image/avif')
}

function webpOnly<T extends { renditions: { format: string }[] }>(processed: T): T {
  return { ...processed, renditions: processed.renditions.filter((r) => r.format === 'webp') }
}

function pickSink(env: Record<string, string | undefined>, admin: Admin): ImageSink {
  if (isR2Env(env)) {
    console.log(`images -> R2 bucket ${env.R2_BUCKET}`)
    return createR2Sink(env)
  }
  console.log('images -> Supabase Storage product-images (R2 not configured)')
  return createSupabaseStorageSink(admin)
}

function couponRow(
  coupon: LaunchCoupon,
  ctx: { categoryId: string; imageUrl: string; supplierLogoUrl: string; now: Date },
): ProductInsert & { is_demo: boolean } {
  const paidIls = agorotToIls(agorot(coupon.paidAgorot))
  const faceIls = agorotToIls(agorot(coupon.originalAgorot))
  const money = buildProductMoneyWrite({
    type: 'coupon',
    kenyonPrice: faceIls,
    platformPercent: PLATFORM_PERCENT,
    supplierSplitPercent: null,
    discountPercent: null,
    couponPriceIls: paidIls,
    couponExpiryDays: coupon.couponExpiryDays,
  })
  if (!money.ok) throw new Error(`${coupon.slug}: ${money.message}`)
  const gate = assertPublishable({
    type: 'coupon',
    priceIls: money.fields.price_ils,
    platformPercent: money.fields.platform_percent,
    supplierSplitPercent: money.fields.supplier_split_percent,
    discountPercent: money.fields.discount_percent,
    couponPriceIls: money.fields.coupon_price_ils,
    couponExpiryDays: money.fields.coupon_expiry_days,
    supplier: {
      id: SUPPLIER.id,
      name: SUPPLIER.name,
      phone: SUPPLIER.contact_phone ?? null,
      address: SUPPLIER.address ?? null,
      logoUrl: ctx.supplierLogoUrl,
      status: 'active',
    },
  })
  if (!gate.ok)
    throw new Error(`${coupon.slug}: ${gate.blockers.map((b) => b.message).join(' · ')}`)
  const nowIso = ctx.now.toISOString()
  return {
    id: launchId(coupon.index + 1),
    slug: coupon.slug,
    name_he: coupon.nameHe,
    short_description_he: coupon.shortDescriptionHe,
    description_he: coupon.descriptionHe,
    seo_description: coupon.shortDescriptionHe,
    type: 'coupon',
    status: 'active',
    approval_status: 'approved',
    approved_at: nowIso,
    published_at: nowIso,
    category_id: ctx.categoryId,
    supplier_id: SUPPLIER.id,
    city: SUPPLIER.city,
    images: [ctx.imageUrl],
    tags: ['launch-seed'],
    is_demo: true,
    is_featured: false,
    kenyon_price: paidIls,
    full_price: faceIls,
    ...money.fields,
    is_coupon_enabled: true,
    requires_shipping: false,
    stock_quantity: STOCK,
    redemption_instructions_he: `יש להציג את קוד השובר בבית העסק ${SUPPLIER.name}, ${SUPPLIER.address}, ${SUPPLIER.city}, בתיאום מראש.`,
    coupon_terms_he: 'השובר אישי, ניתן למימוש פעם אחת, ואינו ניתן להמרה למזומן.',
  }
}

type CheckRow = {
  id: string
  slug: string
  status: string
  is_demo: boolean | null
  kenyon_price: number | null
  coupon_price_ils: number | null
  full_price: number | null
  platform_percent: number | null
  coupon_expiry_days: number | null
  stock_quantity: number | null
  images: unknown
}

async function check(admin: Admin): Promise<void> {
  const ids = COUPONS.map((c) => launchId(c.index + 1))
  const { data, error } = await admin
    .from('products')
    .select(
      'id, slug, status, is_demo, kenyon_price, coupon_price_ils, full_price, platform_percent, coupon_expiry_days, stock_quantity, images',
    )
    .in('id', ids)
    .returns<CheckRow[]>()
  if (error) throw new Error(error.message)
  const { data: sup } = await admin
    .from('suppliers')
    .select('id, name, status, is_demo')
    .eq('id', SUPPLIER.id)
    .returns<{ id: string; name: string; status: string; is_demo: boolean | null }[]>()
    .maybeSingle()
  console.log(`supplier: ${sup ? `${sup.name} (${sup.status}, is_demo=${sup.is_demo})` : 'absent'}`)
  console.log(`launch coupons present: ${data?.length ?? 0} of ${COUPONS.length}`)
  for (const row of data ?? []) {
    const image = Array.isArray(row.images) ? String((row.images as unknown[])[0] ?? '-') : '-'
    console.log(
      `  ${row.slug}: ${row.status}, is_demo=${row.is_demo}, paid ${row.coupon_price_ils} / face ${row.full_price}, platform ${row.platform_percent}%, ${row.coupon_expiry_days}d, stock ${row.stock_quantity}, image ${image}`,
    )
  }
}

async function apply(env: Record<string, string | undefined>, admin: Admin): Promise<void> {
  const now = new Date()
  const sink = pickSink(env, admin)
  const keepAvif = await avifAccepted(sink, admin)
  if (!keepAvif) console.log('bucket refuses image/avif: storing the webp renditions only')
  const prepare = async (sha: string) => {
    const processed = await processImage(sourceImage(sha))
    return keepAvif ? processed : webpOnly(processed)
  }

  const slugs = COUPONS.map((c) => c.categorySlug)
  const { data: cats, error: catError } = await admin
    .from('categories')
    .select('id, slug')
    .in('slug', slugs)
  if (catError) throw new Error(catError.message)
  const categoryIds = new Map((cats ?? []).map((c) => [c.slug, c.id]))
  for (const s of slugs) if (!categoryIds.has(s)) throw new Error(`category ${s} not found`)

  // Supplier logo: an old-site photo, because the publish gate needs a logo
  // and the only images allowed here come from wp_import.
  const logo = await storeImageSet(
    sink,
    'launch-seed/supplier-logo',
    await prepare(COUPONS[0]!.imageSha),
  )
  const { error: supError } = await admin
    .from('suppliers')
    .upsert({ ...SUPPLIER, logo_url: logo.mainUrl } as SupplierInsert, { onConflict: 'id' })
  if (supError) throw new Error(`supplier: ${supError.message}`)
  console.log(`supplier ${SUPPLIER.name} upserted (${SUPPLIER.id})`)

  for (const coupon of COUPONS) {
    const processed = await prepare(coupon.imageSha)
    const set = await storeImageSet(sink, `launch-seed/${coupon.slug}`, processed)
    const { error: assetError } = await admin.from('media_assets').upsert(
      toMediaAssetRow({
        id: launchId(coupon.index + 10),
        altHe: coupon.imageAltHe,
        basePath: `launch-seed/${coupon.slug}`,
        provider: sink.name === 'r2' ? 'r2' : 'supabase',
        bucket: sink.bucket,
        mainUrl: set.mainUrl,
        blurDataURL: set.blurDataURL,
        width: set.width,
        height: set.height,
        webp: set.webp,
        avif: set.avif,
      }),
      { onConflict: 'id' },
    )
    if (assetError) throw new Error(`${coupon.slug} media: ${assetError.message}`)

    const row = couponRow(coupon, {
      categoryId: categoryIds.get(coupon.categorySlug)!,
      imageUrl: set.mainUrl,
      supplierLogoUrl: logo.mainUrl,
      now,
    })
    const { error } = await admin
      .from('products')
      .upsert(row as ProductInsert, { onConflict: 'id' })
    if (error) throw new Error(`${coupon.slug}: ${error.message}`)
    console.log(
      `  ${coupon.slug}: paid ${row.coupon_price_ils} / face ${row.full_price} ILS, ${coupon.couponExpiryDays}d, image ${set.mainUrl}`,
    )
  }
  console.log(`RESULT: ${COUPONS.length} launch coupons upserted`)
}

async function remove(admin: Admin): Promise<void> {
  const ids = COUPONS.map((c) => launchId(c.index + 1))
  const { data: referenced, error: refError } = await admin
    .from('order_items')
    .select('product_id')
    .in('product_id', ids)
    .limit(1)
  if (refError) throw new Error(refError.message)
  if ((referenced ?? []).length > 0) {
    console.error('REFUSING: an order references a launch coupon; archive it instead of deleting.')
    process.exit(1)
  }
  const { error: pErr } = await admin.from('products').delete().in('id', ids)
  if (pErr) throw new Error(pErr.message)
  const { error: mErr } = await admin
    .from('media_assets')
    .delete()
    .in(
      'id',
      COUPONS.map((c) => launchId(c.index + 10)),
    )
  if (mErr) throw new Error(mErr.message)
  const { error: sErr } = await admin.from('suppliers').delete().eq('id', SUPPLIER.id)
  if (sErr) throw new Error(sErr.message)
  console.log(
    `RESULT: removed ${ids.length} launch coupons, their media rows and the dummy supplier`,
  )
}

async function main(): Promise<void> {
  const env = loadEnv()
  const target = resolveTarget(env)
  const admin = createClient<Database>(target.url, target.key, { auth: { persistSession: false } })
  if (REMOVE) return remove(admin)
  if (APPLY) return apply(env, admin)
  return check(admin)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
