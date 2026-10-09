# ARCHITECTURE-CATEGORY-PAGE.md


> <!-- v1-final-banner:2026-09-01 -->
> ⚠️ **This document names tables that do not exist in production.**
>
> | Named here | In production |
> |---|---|
> | `admin_audit_log` | `audit_log` |
> | `cart_items` | `carts.items`, a jsonb column |
> | `notification_events` | `notification_outbox` |
>
> The design below may still be sound; the schema it assumes was not built, or
> was built under another name. Verify against `docs/DATA-MODEL.md` before
> writing a query, and see `docs/SCHEMA-REALITY-CHECK.md` for the full mapping.

ארכיטקטורת דף קטגוריה KenyonExpress: **1:1 מול electro home-v7 / shop-archive**.

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-arch-category` · branch `arch/category-page` (2026-07-30)
Scope: **docs only** in this worktree. הקוד בתיעוד הוא מפרט יישום (TypeScript מלא); לא מריצים ולא משנים `src/` כאן.
Canonical route: `/category/[slug]`
Stack: Next.js 15 App Router (RSC), Hebrew RTL, Drizzle ORM → Postgres/Supabase, design tokens (`brand` yellow `#fed700`).

---

## 0. יעדים ומודל כסף

| יעד | פירוט |
|---|---|
| Visual 1:1 | Sidebar filters + toolbar + product grid כמו electro shop-archive (לא דשבורד) |
| Server-driven | סינון, מיון, pagination בשרת; URL הוא מקור האמת |
| RTL | `dir="rtl"`; logical CSS (`ps`/`pe`/`ms`/`me`) |
| SEO | metadata, canonical, JSON-LD `ItemList` + `CollectionPage` |
| כסף | קופון: מחיר באתר = `coupon_price_ils` (מלא). פיזי: מחיר אחרי `discount_percent`. בלי Escrow. `platform_percent` דינמי לא מוצג ללקוח בכרטיס |

Badges:

- קופון → תווית "קופון"
- פיזי → תווית "משלוח" / "פיזי" (לפי מלאי)
- מבצע → כש-`discount_percent > 0` או `compare_at` / מחיר רגיל > מחיר באתר

---

## 1. מיפוי electro → KenyonExpress

| Electro (home-v7 / shop) | KE |
|---|---|
| Left vertical categories / widgets | `CategorySidebar` (עץ קטגוריות + ספקים + מחיר) |
| Top sort + result count | `CategorySortBar` |
| Product grid (4–5 cols desktop) | `CategoryProductGrid` + `CategoryProductCard` |
| Pagination | `CategoryPagination` (server) |
| Query string filters | `?page=&sort=&min=&max=&supplier=&type=` |
| Promo left rail (optional) | לא ב-v1 של דף קטגוריה (נשאר בבית) |

Layout (desktop, RTL: sidebar בצד ימין ויזואלית = `aside` ראשון ב-DOM ל-RTL):

```
[ CategoryBreadcrumb ]
[ H1 + count ]
+------------------+----------------------------------+
| Sidebar filters  | SortBar                          |
| - categories     | Grid                             |
| - price min/max  | Pagination                       |
| - suppliers      |                                  |
| - type coupon/   |                                  |
|   physical       |                                  |
+------------------+----------------------------------+
```

Mobile: filters ב-drawer / `<details>`; grid 2 עמודות.

---

## 2. URL state (חוזה)

Base: `/category/[slug]`

| Param | Type | Default | SEO |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | page≥2: canonical עצמי עם page; index,follow |
| `sort` | enum | `newest` | **canonical בלי sort** → noindex,follow כששונה |
| `min` | ILS number | omit | כמו sort (פילטר → noindex,follow) |
| `max` | ILS number | omit | כמו sort |
| `supplier` | uuid (חוזר: `supplier=a&supplier=b`) | omit | כמו sort |
| `type` | `coupon` \| `physical` | omit | כמו sort |

Sort enum:

```ts
export const CATEGORY_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'name_asc',
  'popular', // is_featured desc, then newest
] as const
```

Parser חייב:

- לזרוק ערכים לא חוקיים (לא 500)
- `min`/`max` כמספרים ≥ 0; אם `min > max` → החלפה או התעלמות מ-max
- `page` גדול מדי → empty state (לא crash)

---

## 3. סכמה: מלאי הטבלאות (קטלוג + מסחר)

> ‏**נמדד מול פרודקשן 01.09.2026: ‏61 טבלאות ב-`public`, ‏RLS דלוק על כולן.**
> ‏המספר ‏33 שמופיע להלן היה יעד התכנון של המסמך הזה ואינו מתאר את המצב.

ה-worktree מבוסס `main` מציג ב-`database.ts` תת-קבוצה (~14). המפרט מחייב את **מלאי היעד** של KenyonExpress (33) לדף הקטגוריה ולתלויותיו. עמודות כסף דינמיות (`coupon_price_ils`, `platform_percent`, `discount_percent`, `supplier_split_percent`) הן חלק מהמודל המחייב גם אם עדיין לא בכל מיגרציית main הישנה.

| # | Table | תפקיד לדף קטגוריה |
|---|---|---|
| 1 | `profiles` | לא נקרא ב-SSR ציבורי |
| 2 | `suppliers` | פילטר ספקים + שם בכרטיס |
| 3 | `vendors` | legacy; לא בפילטר החדש |
| 4 | `supplier_members` | לא ב-SSR ציבורי |
| 5 | `categories` | slug נוכחי + עץ sidebar |
| 6 | `products` | שורות ה-grid |
| 7 | `product_variants` | אופציונלי למחיר מ-min variant |
| 8 | `product_images` | תמונה ראשית אם לא `images[]` |
| 9 | `product_categories` | M2M עתידי; v1 = `products.category_id` |
| 10 | `attribute_definitions` | facets עתידי |
| 11 | `category_attributes` | facets עתידי |
| 12 | `product_attribute_values` | facets עתידי |
| 13 | `coupons` | legacy |
| 14 | `coupon_codes` / `vouchers` | לא ב-grid |
| 15 | `coupon_deals` | legacy deals |
| 16 | `orders` | לא ב-SSR קטגוריה |
| 17 | `order_items` | `popular` עתידי (counts) |
| 18 | `carts` | ATC בצד לקוח |
| 19 | `cart_items` | ATC |
| 20 | `wallets` | לא |
| 21 | `wallet_transactions` | לא |
| 22 | `payments` | לא |
| 23 | `payment_tokens` | לא |
| 24 | `addresses` | לא |
| 25 | `audit_log` | לא |
| 26 | `admin_audit_log` | לא |
| 27 | `referrals` | לא |
| 28 | `affiliates` | לא |
| 29 | `auth_rate_limits` | לא |
| 30 | `seo_redirects` | middleware 301 |
| 31 | `notification_events` | לא |
| 32 | `notification_log` | לא |
| 33 | `search_documents` / Meili mirror | related / popular אופציונלי |

### 3.1 עמודות `products` הרלוונטיות ל-grid

| Column | שימוש |
|---|---|
| `id`, `slug`, `name_he` / `title_he` | קישור + כותרת |
| `type` | badge קופון/פיזי |
| `status`, `deleted_at` | רק `active` + null |
| `category_id` | סינון קטגוריה (+ ילדים) |
| `supplier_id` | פילטר ספק |
| `price_ils` / `kenyon_price` | מחיר רגיל / תצוגה |
| `coupon_price_ils` | מחיר באתר לקופון |
| `discount_percent` | פיזי + badge |
| `platform_percent` | לא מוצג ללקוח |
| `images` / gallery | תמונה |
| `stock_quantity` | אזל מהמלאי |
| `is_featured`, `created_at` | מיון |
| `compare_at_price` / `compare_at_price_ils` | מחיר לפני הנחה |

מחיר לתצוגה (display):

```
coupon:   display = coupon_price_ils
          strike  = price_ils if price_ils > coupon_price_ils
physical: display = price_ils * (1 - discount_percent/100)
          strike  = price_ils if discount_percent > 0
```

---

## 4. Drizzle schema (קטלוג)

קובץ יעד: `src/server/db/schema/catalog.ts`

```typescript
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from 'drizzle-orm/pg-core'

export const productTypeEnum = pgEnum('product_type', ['coupon', 'physical', 'service'])
export const productStatusEnum = pgEnum('product_status', [
  'draft',
  'active',
  'paused',
  'sold_out',
  'archived',
])

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id'),
    slug: text('slug').notNull().unique(),
    nameHe: text('name_he').notNull(),
    descriptionHe: text('description_he'),
    imageUrl: text('image_url'),
    iconUrl: text('icon_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('categories_parent_idx').on(t.parentId)],
)

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  contactPhone: text('contact_phone'),
  address: text('address'),
  city: text('city'),
  logoUrl: text('logo_url'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id').references(() => suppliers.id),
    categoryId: uuid('category_id').references(() => categories.id),
    type: productTypeEnum('type').notNull(),
    status: productStatusEnum('status').notNull().default('draft'),
    slug: text('slug').notNull().unique(),
    nameHe: text('name_he').notNull(),
    descriptionHe: text('description_he'),
    priceIls: numeric('price_ils', { precision: 12, scale: 2 }).notNull(),
    kenyonPrice: numeric('kenyon_price', { precision: 12, scale: 2 }),
    couponPriceIls: numeric('coupon_price_ils', { precision: 12, scale: 2 }),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }),
    platformPercent: numeric('platform_percent', { precision: 5, scale: 2 }),
    supplierSplitPercent: numeric('supplier_split_percent', { precision: 5, scale: 2 }),
    compareAtPriceIls: numeric('compare_at_price_ils', { precision: 12, scale: 2 }),
    stockQuantity: integer('stock_quantity'),
    images: jsonb('images').$type<string[]>().notNull().default([]),
    isFeatured: boolean('is_featured').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('products_category_id_idx').on(t.categoryId),
    index('products_supplier_id_idx').on(t.supplierId),
    index('products_status_idx').on(t.status),
  ],
)
```

---

## 5. URL parser + סוגי נתונים

קובץ יעד: `src/lib/category/search-params.ts`

```typescript
import { z } from 'zod'

export const CATEGORY_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'name_asc',
  'popular',
] as const

export type CategorySort = (typeof CATEGORY_SORTS)[number]

export const categorySearchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  sort: z.enum(CATEGORY_SORTS).catch('newest').default('newest'),
  min: z.coerce.number().nonnegative().optional().catch(undefined),
  max: z.coerce.number().nonnegative().optional().catch(undefined),
  type: z.enum(['coupon', 'physical']).optional().catch(undefined),
  supplier: z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
    .catch([]),
})

export type CategorySearchParams = z.infer<typeof categorySearchParamsSchema>

export function parseCategorySearchParams(
  raw: Record<string, string | string[] | undefined>,
): CategorySearchParams {
  const parsed = categorySearchParamsSchema.parse({
    page: raw.page,
    sort: raw.sort,
    min: raw.min,
    max: raw.max,
    type: raw.type,
    supplier: raw.supplier,
  })
  if (
    parsed.min !== undefined &&
    parsed.max !== undefined &&
    parsed.min > parsed.max
  ) {
    return { ...parsed, min: parsed.max, max: parsed.min }
  }
  return parsed
}

export function categoryHasActiveFilters(p: CategorySearchParams): boolean {
  return (
    p.sort !== 'newest' ||
    p.min !== undefined ||
    p.max !== undefined ||
    p.type !== undefined ||
    p.supplier.length > 0
  )
}

export const PAGE_SIZE = 24
```

---

## 6. שאילתות Drizzle

קובץ יעד: `src/server/category/queries.ts`

```typescript
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { db } from '@/server/db'
import { categories, products, suppliers } from '@/server/db/schema/catalog'
import {
  PAGE_SIZE,
  type CategorySearchParams,
  type CategorySort,
} from '@/lib/category/search-params'

/** Display price expression (ILS numeric) for sort/filter. */
function displayPriceSql() {
  return sql<string>`
    case
      when ${products.type} = 'coupon'
        then coalesce(${products.couponPriceIls}, ${products.kenyonPrice}, ${products.priceIls})
      else (
        ${products.priceIls} * (1 - coalesce(${products.discountPercent}, 0) / 100.0)
      )
    end
  `
}

async function categorySubtreeIds(rootId: string): Promise<string[]> {
  // depth-2 adjacency: root + children (electro categories are shallow)
  const children = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.parentId, rootId), eq(categories.isActive, true)))
  return [rootId, ...children.map((c) => c.id)]
}

function sortClause(sort: CategorySort): SQL[] {
  const price = displayPriceSql()
  switch (sort) {
    case 'price_asc':
      return [asc(price), desc(products.createdAt)]
    case 'price_desc':
      return [desc(price), desc(products.createdAt)]
    case 'name_asc':
      return [asc(products.nameHe)]
    case 'popular':
      return [desc(products.isFeatured), desc(products.createdAt)]
    case 'newest':
    default:
      return [desc(products.createdAt)]
  }
}

export type CategoryProductRow = {
  id: string
  slug: string
  nameHe: string
  type: 'coupon' | 'physical' | 'service'
  priceIls: string
  couponPriceIls: string | null
  discountPercent: string | null
  kenyonPrice: string | null
  compareAtPriceIls: string | null
  images: string[]
  stockQuantity: number | null
  isFeatured: boolean
  supplierId: string | null
  supplierName: string | null
  displayPriceIls: string
}

export async function getCategoryBySlug(slug: string) {
  const [row] = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      nameHe: categories.nameHe,
      descriptionHe: categories.descriptionHe,
      imageUrl: categories.imageUrl,
      iconUrl: categories.iconUrl,
      parentId: categories.parentId,
    })
    .from(categories)
    .where(and(eq(categories.slug, slug), eq(categories.isActive, true)))
    .limit(1)
  return row ?? null
}

export async function listCategoryProducts(
  categoryId: string,
  params: CategorySearchParams,
): Promise<{ rows: CategoryProductRow[]; total: number }> {
  const ids = await categorySubtreeIds(categoryId)
  const price = displayPriceSql()

  const filters: SQL[] = [
    inArray(products.categoryId, ids),
    eq(products.status, 'active'),
    isNull(products.deletedAt),
  ]

  if (params.type) filters.push(eq(products.type, params.type))
  if (params.supplier.length) filters.push(inArray(products.supplierId, params.supplier))
  if (params.min !== undefined) filters.push(gte(price, String(params.min)))
  if (params.max !== undefined) filters.push(lte(price, String(params.max)))

  const whereExpr = and(...filters)

  const [totalRow] = await db
    .select({ value: count() })
    .from(products)
    .where(whereExpr)

  const total = Number(totalRow?.value ?? 0)
  const offset = (params.page - 1) * PAGE_SIZE

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      nameHe: products.nameHe,
      type: products.type,
      priceIls: products.priceIls,
      couponPriceIls: products.couponPriceIls,
      discountPercent: products.discountPercent,
      kenyonPrice: products.kenyonPrice,
      compareAtPriceIls: products.compareAtPriceIls,
      images: products.images,
      stockQuantity: products.stockQuantity,
      isFeatured: products.isFeatured,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      displayPriceIls: price,
    })
    .from(products)
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(whereExpr)
    .orderBy(...sortClause(params.sort))
    .limit(PAGE_SIZE)
    .offset(offset)

  return { rows: rows as CategoryProductRow[], total }
}

export async function listSidebarCategories() {
  return db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      slug: categories.slug,
      nameHe: categories.nameHe,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.nameHe))
}

export async function listSidebarSuppliers(categoryId: string) {
  const ids = await categorySubtreeIds(categoryId)
  return db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      productCount: count(products.id),
    })
    .from(suppliers)
    .innerJoin(products, eq(products.supplierId, suppliers.id))
    .where(
      and(
        inArray(products.categoryId, ids),
        eq(products.status, 'active'),
        isNull(products.deletedAt),
        or(eq(suppliers.status, 'active'), isNull(suppliers.status)),
      ),
    )
    .groupBy(suppliers.id, suppliers.name)
    .orderBy(asc(suppliers.name))
}

export async function priceBoundsForCategory(categoryId: string) {
  const ids = await categorySubtreeIds(categoryId)
  const price = displayPriceSql()
  const [row] = await db
    .select({
      min: sql<string>`min(${price})`,
      max: sql<string>`max(${price})`,
    })
    .from(products)
    .where(
      and(
        inArray(products.categoryId, ids),
        eq(products.status, 'active'),
        isNull(products.deletedAt),
      ),
    )
  return {
    min: row?.min ? Number(row.min) : 0,
    max: row?.max ? Number(row.max) : 0,
  }
}
```

ISR: `export const revalidate = 300` + `revalidateTag('category:'+id)` בפרסום אדמין.

---

## 7. מחיר תצוגה (shared)

קובץ יעד: `src/lib/category/pricing.ts`

```typescript
export type GridMoneyInput = {
  type: 'coupon' | 'physical' | 'service'
  priceIls: number
  couponPriceIls?: number | null
  discountPercent?: number | null
  kenyonPrice?: number | null
}

export function gridDisplayMoney(p: GridMoneyInput): {
  displayIls: number
  strikeIls: number | null
  badgeDiscountPercent: number | null
} {
  if (p.type === 'coupon') {
    const display = Number(p.couponPriceIls ?? p.kenyonPrice ?? p.priceIls)
    const strike = p.priceIls > display ? p.priceIls : null
    const badge =
      strike && strike > 0 ? Math.round((1 - display / strike) * 100) : null
    return { displayIls: display, strikeIls: strike, badgeDiscountPercent: badge }
  }
  const d = Number(p.discountPercent ?? 0)
  const display = p.priceIls * (1 - d / 100)
  return {
    displayIls: Math.round(display * 100) / 100,
    strikeIls: d > 0 ? p.priceIls : null,
    badgeDiscountPercent: d > 0 ? d : null,
  }
}

export function formatIls(n: number): string {
  return `₪${n.toLocaleString('he-IL', {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}
```

---

## 8. Components (TypeScript מלא)

### 8.1 Page RSC

קובץ יעד: `src/app/(store)/category/[slug]/page.tsx`

```typescript
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CategoryBreadcrumb } from '@/components/category/CategoryBreadcrumb'
import { CategoryEmptyState } from '@/components/category/CategoryEmptyState'
import { CategoryPagination } from '@/components/category/CategoryPagination'
import { CategoryProductGrid } from '@/components/category/CategoryProductGrid'
import { CategorySidebar } from '@/components/category/CategorySidebar'
import { CategorySortBar } from '@/components/category/CategorySortBar'
import { CategoryJsonLd } from '@/components/category/CategoryJsonLd'
import {
  categoryHasActiveFilters,
  parseCategorySearchParams,
  PAGE_SIZE,
} from '@/lib/category/search-params'
import {
  getCategoryBySlug,
  listCategoryProducts,
  listSidebarCategories,
  listSidebarSuppliers,
  priceBoundsForCategory,
} from '@/server/category/queries'

export const revalidate = 300

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const raw = await searchParams
  const filters = parseCategorySearchParams(raw)
  const category = await getCategoryBySlug(slug)
  if (!category) return { title: 'קטגוריה' }

  const base = `https://kenyonexpress.co.il/category/${category.slug}`
  const canonical =
    filters.page > 1 ? `${base}?page=${filters.page}` : base
  const noindex = categoryHasActiveFilters(filters)

  return {
    title: `${category.nameHe} | קניון אקספרס`,
    description: category.descriptionHe ?? `מוצרים בקטגוריית ${category.nameHe}`,
    alternates: { canonical },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: category.nameHe,
      description: category.descriptionHe ?? undefined,
      locale: 'he_IL',
      url: canonical,
      type: 'website',
    },
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const filters = parseCategorySearchParams(await searchParams)
  const category = await getCategoryBySlug(slug)
  if (!category) notFound()

  const [{ rows, total }, tree, supplierFacets, bounds] = await Promise.all([
    listCategoryProducts(category.id, filters),
    listSidebarCategories(),
    listSidebarSuppliers(category.id),
    priceBoundsForCategory(category.id),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-page px-4 py-6" dir="rtl" lang="he">
      <CategoryJsonLd
        category={category}
        products={rows}
        page={filters.page}
        total={total}
      />
      <CategoryBreadcrumb category={category} />
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-heading">{category.nameHe}</h1>
        {category.descriptionHe ? (
          <p className="mt-1 text-sm text-muted">{category.descriptionHe}</p>
        ) : null}
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <CategorySidebar
          slug={category.slug}
          categories={tree}
          suppliers={supplierFacets}
          bounds={bounds}
          current={filters}
        />

        <div className="min-w-0 flex-1">
          <CategorySortBar
            slug={category.slug}
            total={total}
            current={filters}
          />

          {rows.length === 0 ? (
            <CategoryEmptyState slug={category.slug} hasFilters={categoryHasActiveFilters(filters)} />
          ) : (
            <CategoryProductGrid products={rows} />
          )}

          <CategoryPagination
            slug={category.slug}
            page={filters.page}
            pageCount={pageCount}
            current={filters}
          />
        </div>
      </div>
    </div>
  )
}
```

### 8.2 Loading

קובץ יעד: `src/app/(store)/category/[slug]/loading.tsx`

```typescript
import { CategoryLoadingSkeleton } from '@/components/category/CategoryLoadingSkeleton'

export default function CategoryLoading() {
  return <CategoryLoadingSkeleton />
}
```

```typescript
// src/components/category/CategoryLoadingSkeleton.tsx
export function CategoryLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-page animate-pulse px-4 py-6" dir="rtl" aria-busy="true">
      <div className="mb-4 h-8 w-48 rounded bg-track" />
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="hidden w-64 shrink-0 space-y-3 lg:block">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 rounded bg-track" />
          ))}
        </aside>
        <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded bg-track" />
          ))}
        </div>
      </div>
    </div>
  )
}
```

### 8.3 Breadcrumb

```typescript
// src/components/category/CategoryBreadcrumb.tsx
import Link from 'next/link'

type Cat = { slug: string; nameHe: string }

export function CategoryBreadcrumb({ category }: { category: Cat }) {
  return (
    <nav className="mb-3 text-sm text-muted" aria-label="ניווט פירורים">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link href="/" className="hover:text-link">
            בית
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link href="/categories" className="hover:text-link">
            קטגוריות
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li className="font-medium text-heading">{category.nameHe}</li>
      </ol>
    </nav>
  )
}
```

### 8.4 Sidebar filters

```typescript
// src/components/category/CategorySidebar.tsx
import Link from 'next/link'
import type { CategorySearchParams } from '@/lib/category/search-params'
import { buildCategoryHref } from '@/lib/category/href'

type CatNode = {
  id: string
  parentId: string | null
  slug: string
  nameHe: string
  sortOrder: number
}

type SupplierFacet = { id: string; name: string; productCount: number }

type Props = {
  slug: string
  categories: CatNode[]
  suppliers: SupplierFacet[]
  bounds: { min: number; max: number }
  current: CategorySearchParams
}

export function CategorySidebar({
  slug,
  categories,
  suppliers,
  bounds,
  current,
}: Props) {
  const roots = categories.filter((c) => !c.parentId)
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id)

  return (
    <aside className="w-full shrink-0 space-y-6 lg:w-64" aria-label="סינון קטגוריה">
      <section>
        <h2 className="mb-2 text-sm font-bold text-heading">קטגוריות</h2>
        <ul className="space-y-1 text-sm">
          {roots.map((root) => (
            <li key={root.id}>
              <Link
                href={`/category/${root.slug}`}
                className={
                  root.slug === slug
                    ? 'font-bold text-heading'
                    : 'text-muted hover:text-link'
                }
              >
                {root.nameHe}
              </Link>
              <ul className="ms-3 mt-1 space-y-1">
                {childrenOf(root.id).map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/category/${child.slug}`}
                      className={
                        child.slug === slug
                          ? 'font-bold text-heading'
                          : 'text-muted hover:text-link'
                      }
                    >
                      {child.nameHe}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-heading">מחיר</h2>
        <form className="flex flex-col gap-2" method="get" action={`/category/${slug}`}>
          {current.sort !== 'newest' ? (
            <input type="hidden" name="sort" value={current.sort} />
          ) : null}
          {current.type ? <input type="hidden" name="type" value={current.type} /> : null}
          {current.supplier.map((id) => (
            <input key={id} type="hidden" name="supplier" value={id} />
          ))}
          <label className="text-xs text-muted">
            מ-
            <input
              name="min"
              type="number"
              min={0}
              step="1"
              defaultValue={current.min ?? bounds.min}
              className="mt-1 w-full rounded border border-rule px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-muted">
            עד-
            <input
              name="max"
              type="number"
              min={0}
              step="1"
              defaultValue={current.max ?? bounds.max}
              className="mt-1 w-full rounded border border-rule px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="min-h-11 rounded bg-brand px-3 py-2 text-sm font-bold text-brand-dark"
          >
            החל מחיר
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-heading">סוג</h2>
        <ul className="space-y-1 text-sm">
          {(
            [
              { value: undefined, label: 'הכל' },
              { value: 'coupon' as const, label: 'קופון' },
              { value: 'physical' as const, label: 'פיזי' },
            ] as const
          ).map((opt) => (
            <li key={String(opt.value)}>
              <Link
                href={buildCategoryHref(slug, {
                  ...current,
                  page: 1,
                  type: opt.value,
                })}
                className={
                  current.type === opt.value
                    ? 'font-bold text-heading'
                    : 'text-muted hover:text-link'
                }
              >
                {opt.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-heading">ספקים</h2>
        <ul className="max-h-64 space-y-1 overflow-auto text-sm">
          {suppliers.map((s) => {
            const active = current.supplier.includes(s.id)
            const next = active
              ? current.supplier.filter((id) => id !== s.id)
              : [...current.supplier, s.id]
            return (
              <li key={s.id}>
                <Link
                  href={buildCategoryHref(slug, {
                    ...current,
                    page: 1,
                    supplier: next,
                  })}
                  className={active ? 'font-bold text-heading' : 'text-muted hover:text-link'}
                >
                  {s.name}{' '}
                  <span className="text-xs text-muted">({s.productCount})</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      {categorySidebarClearLink(slug, current)}
    </aside>
  )
}

function categorySidebarClearLink(slug: string, current: CategorySearchParams) {
  const dirty =
    current.min !== undefined ||
    current.max !== undefined ||
    current.type !== undefined ||
    current.supplier.length > 0
  if (!dirty) return null
  return (
    <Link href={`/category/${slug}`} className="text-sm text-link hover:underline">
      נקה סינון
    </Link>
  )
}
```

### 8.5 href builder

```typescript
// src/lib/category/href.ts
import type { CategorySearchParams } from '@/lib/category/search-params'

export function buildCategoryHref(slug: string, p: CategorySearchParams): string {
  const qs = new URLSearchParams()
  if (p.page > 1) qs.set('page', String(p.page))
  if (p.sort !== 'newest') qs.set('sort', p.sort)
  if (p.min !== undefined) qs.set('min', String(p.min))
  if (p.max !== undefined) qs.set('max', String(p.max))
  if (p.type) qs.set('type', p.type)
  for (const id of p.supplier) qs.append('supplier', id)
  const s = qs.toString()
  return s ? `/category/${slug}?${s}` : `/category/${slug}`
}
```

### 8.6 Sort bar

```typescript
// src/components/category/CategorySortBar.tsx
import Link from 'next/link'
import { CATEGORY_SORTS, type CategorySearchParams } from '@/lib/category/search-params'
import { buildCategoryHref } from '@/lib/category/href'

const LABELS: Record<(typeof CATEGORY_SORTS)[number], string> = {
  newest: 'חדשים ביותר',
  price_asc: 'מחיר: מהנמוך לגבוה',
  price_desc: 'מחיר: מהגבוה לנמוך',
  name_asc: 'שם',
  popular: 'פופולרי',
}

export function CategorySortBar({
  slug,
  total,
  current,
}: {
  slug: string
  total: number
  current: CategorySearchParams
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
      <p className="text-sm text-muted">
        {total.toLocaleString('he-IL')} מוצרים
      </p>
      <div className="flex flex-wrap gap-2" role="list" aria-label="מיון">
        {CATEGORY_SORTS.map((sort) => (
          <Link
            key={sort}
            role="listitem"
            href={buildCategoryHref(slug, { ...current, page: 1, sort })}
            className={
              current.sort === sort
                ? 'rounded bg-brand px-3 py-1.5 text-xs font-bold text-brand-dark'
                : 'rounded border border-rule px-3 py-1.5 text-xs text-muted hover:text-heading'
            }
          >
            {LABELS[sort]}
          </Link>
        ))}
      </div>
    </div>
  )
}
```

### 8.7 Product card + grid

```typescript
// src/components/category/CategoryProductCard.tsx
import Image from 'next/image'
import Link from 'next/link'
import { formatIls, gridDisplayMoney } from '@/lib/category/pricing'
import type { CategoryProductRow } from '@/server/category/queries'

export function CategoryProductCard({ product }: { product: CategoryProductRow }) {
  const money = gridDisplayMoney({
    type: product.type,
    priceIls: Number(product.priceIls),
    couponPriceIls: product.couponPriceIls ? Number(product.couponPriceIls) : null,
    discountPercent: product.discountPercent
      ? Number(product.discountPercent)
      : null,
    kenyonPrice: product.kenyonPrice ? Number(product.kenyonPrice) : null,
  })
  const img = product.images?.[0]
  const soldOut =
    product.type === 'physical' &&
    product.stockQuantity !== null &&
    product.stockQuantity <= 0

  return (
    <article className="group flex flex-col border border-rule bg-page">
      <Link href={`/product/${product.slug}`} className="relative block aspect-square overflow-hidden">
        {img ? (
          <Image
            src={img}
            alt={product.nameHe}
            fill
            sizes="(max-width:768px) 50vw, 25vw"
            className="object-contain transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-track text-muted">אין תמונה</div>
        )}
        <div className="absolute start-2 top-2 flex flex-col gap-1">
          {product.type === 'coupon' ? (
            <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold text-brand-dark">
              קופון
            </span>
          ) : (
            <span className="rounded bg-heading px-1.5 py-0.5 text-[10px] font-bold text-page">
              פיזי
            </span>
          )}
          {money.badgeDiscountPercent ? (
            <span className="rounded bg-sale-badge px-1.5 py-0.5 text-[10px] font-bold text-page">
              -{Math.round(money.badgeDiscountPercent)}%
            </span>
          ) : null}
          {soldOut ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-page">
              אזל
            </span>
          ) : null}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {product.supplierName ? (
          <p className="text-[11px] text-muted">{product.supplierName}</p>
        ) : null}
        <Link href={`/product/${product.slug}`} className="line-clamp-2 text-sm font-medium text-heading">
          {product.nameHe}
        </Link>
        <div className="mt-auto flex items-baseline gap-2">
          <span className="text-base font-bold text-price">{formatIls(money.displayIls)}</span>
          {money.strikeIls ? (
            <span className="text-xs text-price-strike line-through">
              {formatIls(money.strikeIls)}
            </span>
          ) : null}
        </div>
        {product.type === 'coupon' ? (
          <p className="text-[11px] text-muted">יתרה בבית העסק בעת המימוש</p>
        ) : null}
      </div>
    </article>
  )
}
```

```typescript
// src/components/category/CategoryProductGrid.tsx
import { CategoryProductCard } from '@/components/category/CategoryProductCard'
import type { CategoryProductRow } from '@/server/category/queries'

export function CategoryProductGrid({ products }: { products: CategoryProductRow[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.id}>
          <CategoryProductCard product={p} />
        </li>
      ))}
    </ul>
  )
}
```

### 8.8 Pagination

```typescript
// src/components/category/CategoryPagination.tsx
import Link from 'next/link'
import type { CategorySearchParams } from '@/lib/category/search-params'
import { buildCategoryHref } from '@/lib/category/href'

export function CategoryPagination({
  slug,
  page,
  pageCount,
  current,
}: {
  slug: string
  page: number
  pageCount: number
  current: CategorySearchParams
}) {
  if (pageCount <= 1) return null
  const prev = page > 1 ? page - 1 : null
  const next = page < pageCount ? page + 1 : null

  return (
    <nav className="mt-6 flex items-center justify-center gap-3" aria-label="עמודים">
      {prev ? (
        <Link
          href={buildCategoryHref(slug, { ...current, page: prev })}
          className="min-h-11 rounded border border-rule px-4 py-2 text-sm"
          rel="prev"
        >
          הקודם
        </Link>
      ) : (
        <span className="min-h-11 px-4 py-2 text-sm text-muted">הקודם</span>
      )}
      <span className="text-sm text-muted">
        עמוד {page} מתוך {pageCount}
      </span>
      {next ? (
        <Link
          href={buildCategoryHref(slug, { ...current, page: next })}
          className="min-h-11 rounded border border-rule px-4 py-2 text-sm"
          rel="next"
        >
          הבא
        </Link>
      ) : (
        <span className="min-h-11 px-4 py-2 text-sm text-muted">הבא</span>
      )}
    </nav>
  )
}
```

### 8.9 Empty state

```typescript
// src/components/category/CategoryEmptyState.tsx
import Link from 'next/link'

export function CategoryEmptyState({
  slug,
  hasFilters,
}: {
  slug: string
  hasFilters: boolean
}) {
  return (
    <div className="border border-rule bg-page px-6 py-16 text-center">
      <p className="text-lg font-bold text-heading">לא מצאנו מוצרים</p>
      <p className="mt-2 text-sm text-muted">
        {hasFilters
          ? 'נסו להרחיב את טווח המחיר או לנקות סינון.'
          : 'בקרוב יתווספו מוצרים לקטגוריה הזו.'}
      </p>
      {hasFilters ? (
        <Link
          href={`/category/${slug}`}
          className="mt-4 inline-flex min-h-11 items-center rounded bg-brand px-4 text-sm font-bold text-brand-dark"
        >
          נקה סינון
        </Link>
      ) : (
        <Link href="/" className="mt-4 inline-flex min-h-11 items-center text-sm text-link">
          חזרה לבית
        </Link>
      )}
    </div>
  )
}
```

### 8.10 JSON-LD

```typescript
// src/components/category/CategoryJsonLd.tsx
import type { CategoryProductRow } from '@/server/category/queries'
import { gridDisplayMoney } from '@/lib/category/pricing'
import { PAGE_SIZE } from '@/lib/category/search-params'

type Cat = { slug: string; nameHe: string; descriptionHe: string | null }

export function CategoryJsonLd({
  category,
  products,
  page,
  total,
}: {
  category: Cat
  products: CategoryProductRow[]
  page: number
  total: number
}) {
  const base = `https://kenyonexpress.co.il/category/${category.slug}`
  const itemListElement = products.map((p, i) => {
    const money = gridDisplayMoney({
      type: p.type,
      priceIls: Number(p.priceIls),
      couponPriceIls: p.couponPriceIls ? Number(p.couponPriceIls) : null,
      discountPercent: p.discountPercent ? Number(p.discountPercent) : null,
      kenyonPrice: p.kenyonPrice ? Number(p.kenyonPrice) : null,
    })
    return {
      '@type': 'ListItem',
      position: (page - 1) * PAGE_SIZE + i + 1,
      url: `https://kenyonexpress.co.il/product/${p.slug}`,
      name: p.nameHe,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'ILS',
        price: money.displayIls.toFixed(2),
      },
    }
  })

  const payload = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: category.nameHe,
    description: category.descriptionHe ?? undefined,
    url: page > 1 ? `${base}?page=${page}` : base,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: total,
      itemListElement,
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  )
}
```

---

## 9. SEO (סיכום מחייב)

| מצב | robots | canonical |
|---|---|---|
| `/category/x` | index,follow | עצמו |
| `?page=2` | index,follow | עם page |
| `?sort=` / `min` / `max` / `supplier` / `type` | noindex,follow | `/category/x` (בלי פילטרים) |

`hreflang`: `he-IL`, `he`, `x-default` → URL הקנוני.

---

## 10. Loading / empty / edge cases

| מקרה | התנהגות |
|---|---|
| slug לא קיים | `notFound()` |
| קטגוריה ריקה בלי פילטרים | empty state ידידותי |
| פילטרים בלי תוצאות | empty + קישור ניקוי |
| `page` מעבר לסוף | grid ריק + pagination מציג עמוד נוכחי; אופציה: redirect לעמוד אחרון |
| ספק מושעה | לא מופיע ב-facet; מוצריו לא active |
| מחיר null / needs-pricing | לא `status=active` (שער פרסום) |
| תמונה שבורה | placeholder |
| service type | לא בפילטר v1 (רק coupon/physical) או מוצג כפיזי |
| Concurrent filter spam | RSC + cache tags; אין client waterfalls חובה |

---

## 11. אבטחה וביצועים

- קריאות anon/RLS ל-`status=active` בלבד.
- אף פעם לא service-role ב-RSC ציבורי.
- אינדקסים: `category_id`, `supplier_id`, `status`, `(status, deleted_at)`.
- `PAGE_SIZE=24`; בלי offset עמוק קיצוני (cursor בעתיד אם >10k).
- תמונות: `next/image` + R2 remotePatterns.

---

## 12. Acceptance checklist

- [ ] Sidebar: קטגוריות, מחיר, ספקים, סוג קופון/פיזי
- [ ] Grid + sort + pagination server-side
- [ ] URL state מלא לפי §2
- [ ] Drizzle queries על סכמת הקטלוג (מלאי 33)
- [ ] RTL מלא; badges קופון/פיזי
- [ ] metadata + canonical + JSON-LD ItemList/CollectionPage
- [ ] loading.tsx + empty states + edge cases
- [ ] TypeScript מלא לכל הקומפוננטות במסמך זה
- [ ] מחיר כרטיס = תשלום באתר; בלי Escrow / בלי הצגת platform_percent

---

## 13. Related

`docs/ARCHITECTURE-SEO-PERFORMANCE.md` (ב-`ke-arch`), electro shop-archive measurements, `ADMIN-PRODUCT-PAGE-SPEC` (שער פרסום + כסף דינמי).
