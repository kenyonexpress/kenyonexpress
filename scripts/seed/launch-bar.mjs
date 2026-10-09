/**
 * The launch bar for the catalogue, as one read-only SQL query and one pure
 * predicate per row.
 *
 * `docs/DATA-BASELINE.md` wrote the bar as prose and scored four of its rows
 * "כנראה" because nothing had counted them. Prose cannot regress and cannot
 * pass, so this module is the executable form: `auditSql()` emits a single
 * SELECT that returns one row of counts, and `evaluate()` turns that row into
 * pass/fail. Nothing here writes, and nothing here connects; the SQL is meant
 * for the Supabase SQL editor or any read-only client.
 *
 * Two things the 19.08 measurement changed about the bar itself:
 *
 *   - "15 קופונים פעילים" was scored as a row that passes on quantity. All 15
 *     are `demo-coupon-1..15`, one per category, identical shape, all picsum.
 *     Production has ZERO non-demo coupon deals, so the row counts
 *     `attributes.demo IS NOT 'true'` and nothing else.
 *   - "8 כרטיסי בית → 404" is 8, but only 2 are missing rows. The other 6 are
 *     `draft`, and `src/app/(store)/product/[slug]/page.tsx:29` calls
 *     notFound() on anything not active. A draft is a different repair from a
 *     missing row, so the two are counted separately.
 */

/**
 * The 12 rows of `categories`, and which of them a coupon deal is expected in.
 *
 * `hot-deals`, `under-99` and `new` are collections: membership is a rule
 * (price, recency) that `categories` has no column for, so a deal does not
 * fall into them on its own and they are not part of the coverage row.
 * `courses` is closed on purpose until there is a subscription product.
 */
export const CANONICAL_CATEGORIES = [
  { slug: 'hot-deals', kind: 'collection' },
  { slug: 'under-99', kind: 'collection' },
  { slug: 'new', kind: 'collection' },
  { slug: 'restaurants-cafes', kind: 'taxonomy' },
  { slug: 'beauty-health', kind: 'taxonomy' },
  { slug: 'phones-computers', kind: 'taxonomy' },
  { slug: 'baby-kids', kind: 'taxonomy' },
  { slug: 'vacation', kind: 'taxonomy' },
  { slug: 'pets', kind: 'taxonomy' },
  { slug: 'electronics', kind: 'orphan' },
  { slug: 'professionals', kind: 'taxonomy' },
  { slug: 'courses', kind: 'closed' },
]

/** The taxonomies a coupon-only soft launch has to fill. */
export const OPEN_TAXONOMIES = CANONICAL_CATEGORIES.filter((c) => c.kind === 'taxonomy').map(
  (c) => c.slug,
)

/**
 * The 32 slugs of the live home grid, in grid order.
 *
 * Duplicated from `src/lib/ke-live-deals-data.ts` on purpose: this module is
 * plain .mjs run by bare node, and importing a TS module would need a build
 * step the auditor does not have. `launch-bar.test.ts` imports both and
 * asserts they are the same list, so the copy cannot drift.
 */

/**
 * `reverse-withdrawal-payment` WAS IN THIS LIST AND WAS NEVER A PRODUCT.
 *
 * Removed 2026-09-04. It is Dokan bookkeeping -- the record of a reversed
 * payout -- and the WordPress importer has known that all along:
 * `scripts/wp-import/config.mjs` carries it in `excludeProductSlugs`, and
 * `scripts/wp-dry-run.mjs` says so in prose.
 *
 * This list and `KE_LIVE_DEALS` both mirrored the live DOM verbatim, so both
 * carried a row the importer was already excluding.
 *
 * The count is 32 again, and the 32nd is NOT the ledger row. Dropping to 31
 * left a 4-column grid one cell short and reflowed every row below the rail:
 * `--page=home` at 1440 measured 7.08% before and 14.48% after, against an 11%
 * gate, with the damage confined entirely to bands below y1400. The slot at
 * live's index 6 now holds `טיפול-פנים-עמוק`, a real product in live's own
 * catalogue, so the grid keeps live's shape without carrying live's artifact.
 * `KE_LIVE_DEALS` carries the same substitution and `launch-bar.test.ts`
 * asserts the two lists slug for slug, so they cannot drift apart.
 */
export const GRID_SLUGS = [
  'עוזרת-אישית-שירותי-משרד',
  'תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה',
  'צימר-שוויץ-בצפון',
  'טיפול-פנים-copy',
  'קופון-טסט',
  'מוצר-לדוגמא',
  'טיפול-פנים-עמוק',
  'צימר-מאסטר-copy-copy',
  'צימר-מאסטר-copy',
  'חופשה-חלומית-באחוזת-דניאל',
  'תזונה-הוליסטית-טבעית-וצמחי-מרפא',
  'אבחון-ואבחוןטיפול-רפסולוגי',
  'עיסוי-מאסטר',
  'עיסוי-מפנק-לגבר-45-דקות-רק-ב108₪',
  'עיסוי-משולב-מפנק-לגבר-רק-108₪',
  'צימר-מאסטר',
  'קוסמטיקאית',
  'עיסוי-מפנק',
  'restaurants-meat-3',
  'restaurants-meat-2',
  'bar-drink',
  'island-of-maldives',
  'travelling-to-the-island-of-maldives',
  'pampers-premium-care-diaper-pants-medium',
  'barbecue-2',
  'barbecue',
  'מלון-5-כוכבים-בטבריה',
  'אייפון-13',
  'samsung-galaxy-s22-128gb-samsung-galaxy-s22-128gb-5g',
  'מלון-4-כוכבים-פלוס-ארוחת-בוקר',
  'אוזניות-איירפודס-3',
  'ארוחת-בוקר-זוגית-בקפה-קפה',
]

/**
 * A supplier is publishable when a customer can reach the business: name,
 * address, city, phone, logo. `docs/BUSINESS-MODEL.md` §2 also asks for
 * WhatsApp, opening hours and lat/lng; `suppliers` has a `whatsapp` column and
 * no column for the other two, so those are not counted here rather than
 * counted as always-missing.
 */
const SUPPLIER_COMPLETE = `
      s.name IS NOT NULL AND btrim(s.name) <> ''
  AND s.address IS NOT NULL AND btrim(s.address) <> ''
  AND s.city IS NOT NULL AND btrim(s.city) <> ''
  AND s.contact_phone IS NOT NULL AND btrim(s.contact_phone) <> ''
  AND s.logo_url IS NOT NULL AND btrim(s.logo_url) <> ''`

/** A row someone put in the catalogue to look at, not to sell. */
const NOT_DEMO = `coalesce(p.attributes->>'demo', 'false') <> 'true'`

function sqlList(values) {
  return values.map((v) => `(${quote(v)})`).join(',\n    ')
}

/** Postgres string literal. Doubling the quote is the whole escape. */
function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * One SELECT, one row, every number the bar needs.
 *
 * Read-only by construction: the only verbs are WITH and SELECT.
 */
export function auditSql() {
  return `-- Catalogue launch bar. Read-only: run in the Supabase SQL editor and
-- paste the single result row into scripts/audit-launch-bar.mjs.
WITH grid(slug) AS (VALUES
    ${sqlList(GRID_SLUGS)}
),
open_tax(slug) AS (VALUES
    ${sqlList(OPEN_TAXONOMIES)}
),
live AS (
  SELECT * FROM public.products WHERE deleted_at IS NULL
),
act AS (
  SELECT * FROM live p WHERE p.status::text = 'active'
),
real_act AS (
  SELECT * FROM act p WHERE ${NOT_DEMO}
)
SELECT
  (SELECT count(*) FROM live p) AS products_live,
  (SELECT count(*) FROM act p) AS products_active,
  (SELECT count(*) FROM real_act p) AS products_active_real,
  (SELECT count(*) FROM real_act p WHERE p.type::text = 'coupon') AS real_coupons,
  (SELECT count(*) FROM act p WHERE p.type::text = 'coupon') AS active_coupons_incl_demo,
  (SELECT count(*) FROM public.suppliers s WHERE s.deleted_at IS NULL) AS suppliers,
  (SELECT count(*) FROM public.suppliers s
     WHERE s.deleted_at IS NULL AND (${SUPPLIER_COMPLETE})) AS suppliers_complete,
  (SELECT count(DISTINCT p.supplier_id) FROM act p
     JOIN public.suppliers s ON s.id = p.supplier_id
    WHERE NOT (${SUPPLIER_COMPLETE})) AS suppliers_of_active_incomplete,
  (SELECT count(*) FROM act p WHERE p.images::text LIKE '%picsum%') AS picsum_active,
  (SELECT count(*) FROM live p WHERE p.platform_percent IS NULL) AS missing_platform_percent,
  (SELECT count(*) FROM live p WHERE p.category_id IS NULL) AS missing_category,
  (SELECT count(*) FROM grid g) AS grid_total,
  (SELECT count(*) FROM grid g JOIN act p ON p.slug = g.slug) AS grid_ok,
  (SELECT count(*) FROM grid g
    WHERE NOT EXISTS (SELECT 1 FROM live p WHERE p.slug = g.slug)) AS grid_missing,
  (SELECT count(*) FROM grid g
    WHERE EXISTS (SELECT 1 FROM live p WHERE p.slug = g.slug)
      AND NOT EXISTS (SELECT 1 FROM act p WHERE p.slug = g.slug)) AS grid_inactive,
  (SELECT count(*) FROM public.vouchers) AS vouchers,
  (SELECT count(*) FROM open_tax t
    WHERE EXISTS (
      SELECT 1 FROM real_act p
        JOIN public.categories c ON c.id = p.category_id
       WHERE c.slug = t.slug AND p.type::text = 'coupon')) AS taxonomies_with_real_coupon,
  (SELECT count(*) FROM open_tax t) AS taxonomies_open,
  (SELECT count(*) FROM (
     SELECT c.sort_order FROM public.categories c
      GROUP BY c.sort_order HAVING count(*) > 1) d) AS sort_order_collisions;`
}

/**
 * The bar itself. Each row states what it needs and reads it off the counts;
 * no row reasons about a number it did not receive.
 *
 * `minRealCoupons` is the soft-launch floor from `docs/DATA-BASELINE.md` §2:
 * enough for a smoke run plus a few audited businesses, taken as 10.
 */
export function evaluate(m, { minRealCoupons = 10 } = {}) {
  const need = (label, requirement, actual, pass) => ({
    label,
    requirement,
    actual,
    pass,
  })

  return [
    need(
      'דילי קופון אמיתיים (לא demo)',
      `>= ${minRealCoupons}`,
      m.real_coupons,
      m.real_coupons >= minRealCoupons,
    ),
    need(
      'ספקים שלמים (שם, כתובת, עיר, טלפון, לוגו)',
      `${m.suppliers} מתוך ${m.suppliers}`,
      `${m.suppliers_complete} מתוך ${m.suppliers}`,
      m.suppliers > 0 && m.suppliers_complete === m.suppliers,
    ),
    need(
      'ספקים של מוצר פעיל שחסרים פרטים',
      '0',
      m.suppliers_of_active_incomplete,
      m.suppliers_of_active_incomplete === 0,
    ),
    need(
      'כרטיסי גריד הבית שנפתחים',
      `${m.grid_total} מתוך ${m.grid_total}`,
      `${m.grid_ok} מתוך ${m.grid_total}`,
      m.grid_ok === m.grid_total,
    ),
    need('כרטיסי גריד בלי שורה בכלל', '0', m.grid_missing, m.grid_missing === 0),
    need('כרטיסי גריד שהשורה שלהם לא active', '0', m.grid_inactive, m.grid_inactive === 0),
    need('תמונות picsum על מוצרים פעילים', '0', m.picsum_active, m.picsum_active === 0),
    need(
      'שורות בלי platform_percent',
      '0',
      m.missing_platform_percent,
      m.missing_platform_percent === 0,
    ),
    need('שורות בלי קטגוריה', '0', m.missing_category, m.missing_category === 0),
    need(
      'טקסונומיות פתוחות עם דיל קופון אמיתי',
      `${m.taxonomies_open} מתוך ${m.taxonomies_open}`,
      `${m.taxonomies_with_real_coupon} מתוך ${m.taxonomies_open}`,
      m.taxonomies_open > 0 && m.taxonomies_with_real_coupon === m.taxonomies_open,
    ),
    need('שובר smoke שהונפק', '>= 1', m.vouchers, m.vouchers >= 1),
    need(
      'sort_order ייחודי ל-12 הקטגוריות',
      '0 התנגשויות',
      m.sort_order_collisions,
      m.sort_order_collisions === 0,
    ),
  ]
}

/** Whether the catalogue clears every row. */
export function passes(metrics, options) {
  return evaluate(metrics, options).every((row) => row.pass)
}

/**
 * Production on 19.08.2026, measured through the MCP connection with exactly
 * the SQL `auditSql()` emits. Kept as data so the bar has a case it is known
 * to fail on, and so a later measurement can be diffed against it.
 */
export const MEASURED_2026_08_19 = {
  products_live: 80,
  products_active: 61,
  products_active_real: 27,
  real_coupons: 0,
  active_coupons_incl_demo: 15,
  suppliers: 11,
  suppliers_complete: 0,
  suppliers_of_active_incomplete: 11,
  picsum_active: 30,
  missing_platform_percent: 19,
  missing_category: 13,
  grid_total: 32,
  grid_ok: 24,
  grid_missing: 2,
  grid_inactive: 6,
  vouchers: 0,
  taxonomies_with_real_coupon: 0,
  taxonomies_open: 7,
  sort_order_collisions: 1,
}
