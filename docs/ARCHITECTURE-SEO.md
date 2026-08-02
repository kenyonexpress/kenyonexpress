# ארכיטקטורת SEO (Metadata, Structured Data, Sitemap, Redirects)

מסמך תכנון מלא, מוכן ליישום. תאריך: 2026-07-23. ענף: `phase5/homepage`.

מסמכים קשורים:
`docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md` (מקור אמת ל-slugs, canonical, seo_redirects, sitemap),
`docs/ARCHITECTURE-GROWTH-SEO.md` (שימור דירוגים במעבר, מלאי URL),
`docs/ARCHITECTURE-WP-DATA-MIGRATION.md` (cutover ו-inventory של URL ישנים),
`docs/ARCHITECTURE-PERFORMANCE.md` (Cache Components, PPR, cache tags).

מעמד: מסמך זה הוא הרפרנס המעשי לשכבת ה-SEO ברמת Next.js App Router.
הוא מפרט קוד קונקרטי (metadata, JSON-LD, sitemap, robots, redirects) ואינו
סותר את ההכרעות של 030 ו-032; היכן שיש חפיפה, המסמכים ההם גוברים על מדיניות,
ומסמך זה גובר על צורת המימוש בקוד.

> **הערה על Next.js:** זו גרסת Next.js מותאמת (App Router, build שונה).
> לפני שינוי חתימות API יש לקרוא את `node_modules/next/dist/docs/01-app`.
> הדוגמאות כאן מבוססות על הקוד הקיים ב-`src/app/(store)`.

---

## 0. עקרונות על

1. **רציפות SEO היא הכנסה.** האתר החי `kenyonexpress.co.il` (WordPress) מדורג
   ומביא תנועה אורגנית. שער השיגור: אפס URL ישן בלי הכרעה (301 / התאמה חיה / 410 מודע).
2. **עברית תחילה, `he-IL` יחיד.** כל שדה תוכן הוא `*_he`. locale אחד היום,
   אבל המבנה נבנה כך שהוספת locale שני (למשל `ar-IL` או `en-IL`) לא תשבור URL קיים.
3. **מקור אמת אחד ל-URL.** בסיס האתר נקבע ממשתנה סביבה יחיד `NEXT_PUBLIC_SITE_URL`
   (בפרודקשן: `https://www.kenyonexpress.co.il`). אין hardcode של הדומיין בקוד.
4. **Metadata נגזר מהנתונים.** אין metadata כתוב ידנית לכל מוצר. הכול נגזר
   מ-Supabase (`products`, `categories`, `vendors`) דרך `generateMetadata`.
5. **RTL ולוקאל בשורש.** `dir="rtl"`, `lang="he-IL"`, גופן Heebo, מותג צהוב
   `#fed700` וסלייט `#333e48`. מוגדר פעם אחת ב-`src/app/layout.tsx`.

קבועים משותפים (מוצע: `src/lib/seo/constants.ts`):

```ts
// src/lib/seo/constants.ts
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.kenyonexpress.co.il'
).replace(/\/$/, '') // ללא trailing slash

export const SITE_NAME_HE = 'קניון אקספרס'
export const LOCALE = 'he_IL' // פורמט Open Graph
export const LOCALE_BCP47 = 'he-IL' // פורמט hreflang / html lang
export const BRAND = {
  yellow: '#fed700',
  slate: '#333e48',
} as const

/** בונה URL אבסולוטי קנוני מנתיב יחסי. תמיד ללא trailing slash. */
export function absoluteUrl(path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  const noTrailing = clean === '/' ? '/' : clean.replace(/\/$/, '')
  return `${SITE_URL}${noTrailing}`
}
```

---

## 1. אסטרטגיית Metadata API לפי סוג עמוד

### 1.1 שורש: `metadataBase` ו-defaults

מוגדר פעם אחת ב-`src/app/layout.tsx`. `metadataBase` הופך כל URL יחסי
ב-`openGraph`/`alternates`/`twitter` לאבסולוטי, ומונע כפילות דומיין.

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import { SITE_URL, SITE_NAME_HE, LOCALE } from '@/lib/seo/constants'

const heebo = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-heebo' })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'קניון אקספרס | שוברים ומוצרים במחירי קניון',
    template: '%s | קניון אקספרס',
  },
  description:
    'קניון אקספרס: מרקטפלייס שוברים ומוצרים פיזיים במחירים משתלמים, ' +
    'עם פרטי ספק מלאים לכל מוצר ומשלוח לכל הארץ.',
  applicationName: SITE_NAME_HE,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME_HE,
    locale: LOCALE,
    url: SITE_URL,
  },
  twitter: { card: 'summary_large_image' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he-IL" dir="rtl" className={heebo.variable}>
      <body>{children}</body>
    </html>
  )
}
```

מטריצת אחריות לפי סוג עמוד:

| סוג עמוד | מסלול | מקור metadata | canonical | index? |
|---|---|---|---|---|
| בית | `/` | סטטי ב-`(store)/page.tsx` | `/` | כן |
| קטגוריה | `/category/[slug]` | `generateMetadata` מ-`categories` | `/category/{slug}` | כן (עמוד 1); `noindex` על `?page>=2` אופציונלי |
| מוצר | `/product/[slug]` | `generateMetadata` מ-`products` | `/product/{slug}` | כן אם `status='active'` |
| רשימת מוצרים | `/products` | סטטי + פרמטרים | `/products` (ללא query) | כן |
| עגלה | `/cart` | סטטי | ללא canonical | `noindex, follow` |
| צ׳קאאוט | `/checkout` | סטטי | ללא canonical | `noindex, nofollow` |
| שיווקי/סטטי | `(marketing)/*` | סטטי לכל עמוד | `/{path}` | כן |

עגלה וצ׳קאאוט לעולם `noindex`:

```tsx
// src/app/(store)/cart/page.tsx
export const metadata = { title: 'עגלת הקניות', robots: { index: false, follow: true } }

// src/app/(store)/checkout/page.tsx
export const metadata = { title: 'תשלום', robots: { index: false, follow: false } }
```

### 1.2 עמוד מוצר: `generateMetadata`

מרחיב את המימוש הקיים ב-`src/app/(store)/product/[slug]/page.tsx`.
מטפל ב-`notFound` (כדי לא לפלוט metadata לעמוד 404), canonical, OG דינמי,
ומבחין בין `coupon` ל-`physical` בטקסט התיאור.

```tsx
// src/app/(store)/product/[slug]/page.tsx
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { absoluteUrl, SITE_NAME_HE, LOCALE } from '@/lib/seo/constants'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()

  const { data: p } = await supabase
    .from('products')
    .select(
      `slug, name_he, description_he, type, kenyon_price, images, status,
       categories(name_he), vendors(name_he)`,
    )
    .eq('slug', slug)
    .eq('status', 'active')
    .is('deleted_at', null)
    .single()

  if (!p) {
    return { title: 'מוצר לא נמצא', robots: { index: false, follow: false } }
  }

  const supplier = Array.isArray(p.vendors) ? null : p.vendors
  const kindHe = p.type === 'coupon' ? 'שובר' : 'מוצר'
  const price = p.kenyon_price != null ? `רק ₪${p.kenyon_price} ` : ''
  const supplierHe = supplier?.name_he ? ` מספק ${supplier.name_he}.` : ''

  const description =
    (p.description_he?.slice(0, 155) ??
      `${kindHe} ${p.name_he} ${price}בקניון אקספרס.${supplierHe}`).trim()

  const canonical = absoluteUrl(`/product/${p.slug}`)
  const ogImage = absoluteUrl(`/product/${p.slug}/opengraph-image`)

  return {
    title: p.name_he, // template בשורש מוסיף " | קניון אקספרס"
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website', // product לא נתמך כ-OG type סטנדרטי; website בטוח
      title: `${p.name_he} | קניון אקספרס`,
      description,
      url: canonical,
      siteName: SITE_NAME_HE,
      locale: LOCALE,
      images: [{ url: ogImage, width: 1200, height: 630, alt: p.name_he }],
    },
    twitter: {
      card: 'summary_large_image',
      title: p.name_he,
      description,
      images: [ogImage],
    },
  }
}
```

דוגמת פלט (מוצר מסוג `coupon`):

```text
<title>ארוחת זוגית במסעדת האחוזה | קניון אקספרס</title>
<meta name="description" content="שובר לארוחת זוגית במסעדת האחוזה רק ₪149 בקניון אקספרס. מספק מסעדת האחוזה בע״מ.">
<link rel="canonical" href="https://www.kenyonexpress.co.il/product/couple-dinner-haakhuza">
<meta property="og:locale" content="he_IL">
<meta property="og:image" content="https://www.kenyonexpress.co.il/product/couple-dinner-haakhuza/opengraph-image">
```

### 1.3 עמוד קטגוריה: `generateMetadata`

מרחיב את `src/app/(store)/category/[slug]/page.tsx`. עמוד 1 הוא canonical
לקטגוריה; לעמודים `?page>=2` אפשר להצהיר canonical עצמי או `noindex, follow`
כדי למנוע דילול (thin content) של דפדוף.

```tsx
// src/app/(store)/category/[slug]/page.tsx
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { absoluteUrl, SITE_NAME_HE, LOCALE } from '@/lib/seo/constants'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const { page } = await searchParams
  const pageNum = typeof page === 'string' ? Math.max(1, parseInt(page, 10) || 1) : 1

  const supabase = await createClient()
  const { data: c } = await supabase
    .from('categories')
    .select('name_he, description_he, slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!c) return { title: 'קטגוריה לא נמצאה', robots: { index: false, follow: false } }

  const suffix = pageNum > 1 ? ` (עמוד ${pageNum})` : ''
  const title = `${c.name_he}${suffix}`
  const description =
    c.description_he?.slice(0, 155) ??
    `כל המוצרים והשוברים בקטגוריית ${c.name_he} בקניון אקספרס. מחירים משתלמים ומשלוח לכל הארץ.`

  const canonical = absoluteUrl(`/category/${c.slug}`)

  return {
    title,
    description,
    alternates: { canonical }, // עמוד >1 מצביע לעמוד 1 כקנוני
    robots: pageNum > 1 ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      type: 'website',
      title: `${title} | קניון אקספרס`,
      description,
      url: canonical,
      siteName: SITE_NAME_HE,
      locale: LOCALE,
    },
  }
}
```

`generateStaticParams` (אופציונלי, ל-prerender של קטגוריות ידועות):

```tsx
export async function generateStaticParams() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('slug')
    .eq('is_active', true)
  return (data ?? []).map((c) => ({ slug: c.slug }))
}
```

### 1.4 עמודים שיווקיים/סטטיים

לכל עמוד ב-`(marketing)` יוצא `metadata` סטטי עם title, description ו-canonical
מפורש. דוגמה:

```tsx
// src/app/(marketing)/about/page.tsx
import type { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'אודות קניון אקספרס',
  description: 'הסיפור מאחורי קניון אקספרס: מרקטפלייס שוברים ומוצרים לצרכן הישראלי.',
  alternates: { canonical: '/about' },
}
```

---

## 2. Structured Data (JSON-LD)

מדיניות: JSON-LD מוזרק כ-`<script type="application/ld+json">` בתוך גוף העמוד
(Server Component), לא ב-metadata. כל אובייקט נבנה מ-helper טהור ב-
`src/lib/seo/jsonld.ts` שמקבל נתונים ומחזיר אובייקט, ומוזרק דרך רכיב `<JsonLd>`.

```tsx
// src/components/seo/JsonLd.tsx
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // ה-payload נבנה מנתוני DB בלבד; אסקייפ ל-< כדי למנוע שבירת script
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  )
}
```

### 2.1 Organization (גלובלי, בשורש)

מוזרק פעם אחת ב-`src/app/layout.tsx` או ב-`(store)/layout.tsx`.

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://www.kenyonexpress.co.il/#organization",
  "name": "קניון אקספרס",
  "url": "https://www.kenyonexpress.co.il",
  "logo": "https://www.kenyonexpress.co.il/logo.png",
  "sameAs": [
    "https://www.facebook.com/kenyonexpress",
    "https://www.instagram.com/kenyonexpress"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer service",
    "areaServed": "IL",
    "availableLanguage": ["he"]
  }
}
```

### 2.2 Product + Offer (עמוד מוצר)

Helper:

```ts
// src/lib/seo/jsonld.ts
import { absoluteUrl } from './seo/constants'

type OfferInput = {
  slug: string
  priceKenyon: number
  type: 'coupon' | 'physical'
  inStock: boolean
}

export function offerJsonLd(o: OfferInput) {
  const url = absoluteUrl(`/product/${o.slug}`)
  const availability = o.inStock
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock'

  const offer: Record<string, unknown> = {
    '@type': 'Offer',
    url,
    priceCurrency: 'ILS',
    price: o.priceKenyon.toFixed(2),
    availability,
    // תוקף מחיר: שנה קדימה, בטוח למחירי שוברים/מוצרים
    priceValidUntil: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
  }

  if (o.type === 'physical') {
    // מוצר פיזי: משלוח והחזרות רלוונטיים
    offer.itemCondition = 'https://schema.org/NewCondition'
    offer.shippingDetails = {
      '@type': 'OfferShippingDetails',
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IL' },
    }
  } else {
    // shober/coupon: מוצר דיגיטלי, אין משלוח פיזי, מימוש דיגיטלי
    offer.itemCondition = 'https://schema.org/NewCondition'
    offer.category = 'Voucher'
  }
  return offer
}
```

אובייקט Product מלא (מוצר `coupon`) שמוזרק בעמוד:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://www.kenyonexpress.co.il/product/couple-dinner-haakhuza/#product",
  "name": "ארוחת זוגית במסעדת האחוזה",
  "description": "שובר לארוחה זוגית הכוללת מנה ראשונה, עיקרית וקינוח.",
  "sku": "KE-CPN-1042",
  "image": [
    "https://xxxx.supabase.co/storage/v1/object/public/products/1042-a.jpg"
  ],
  "brand": { "@type": "Brand", "name": "מסעדת האחוזה" },
  "category": "מסעדות",
  "offers": {
    "@type": "Offer",
    "url": "https://www.kenyonexpress.co.il/product/couple-dinner-haakhuza",
    "priceCurrency": "ILS",
    "price": "149.00",
    "availability": "https://schema.org/InStock",
    "priceValidUntil": "2027-07-23",
    "itemCondition": "https://schema.org/NewCondition",
    "category": "Voucher"
  }
}
```

הבדל `physical`: מקבל `shippingDetails` עם `addressCountry: "IL"` ואת `weight`/
`hasMerchantReturnPolicy` אם קיימים, ו-`brand` מוחלף בשם הספק (`vendors.name_he`).
`coupon` מקבל `category: "Voucher"` ואין לו `shippingDetails`.

הזרקה בעמוד:

```tsx
// בתוך ProductPage, אחרי שליפת product ו-supplier
import { JsonLd } from '@/components/seo/JsonLd'
import { productJsonLd } from '@/lib/seo/jsonld'

<JsonLd data={productJsonLd(product, supplier, category)} />
<JsonLd data={breadcrumbJsonLd([
  { name: 'דף הבית', path: '/' },
  { name: category.name_he, path: `/category/${category.slug}` },
  { name: product.name_he, path: `/product/${product.slug}` },
])} />
```

### 2.3 BreadcrumbList

```ts
// src/lib/seo/jsonld.ts
import { absoluteUrl } from './seo/constants'

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  }
}
```

פלט לדוגמה:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "דף הבית",
      "item": "https://www.kenyonexpress.co.il/" },
    { "@type": "ListItem", "position": 2, "name": "מסעדות",
      "item": "https://www.kenyonexpress.co.il/category/restaurants" },
    { "@type": "ListItem", "position": 3, "name": "ארוחת זוגית במסעדת האחוזה",
      "item": "https://www.kenyonexpress.co.il/product/couple-dinner-haakhuza" }
  ]
}
```

הערה: הטקסט העברי נשמר כמות שהוא ב-JSON. `JSON.stringify` מטפל בבריחת יוניקוד;
אין צורך ב-encoding נוסף מעבר לאסקייפ של `<` שב-`<JsonLd>`.

---

## 3. `sitemap.xml` ו-`robots.txt` (App Router file conventions)

### 3.1 `app/robots.ts`

```ts
// src/app/robots.ts
import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/constants'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/cart', '/checkout', '/account/', '/admin/', '/api/', '/auth/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
```

### 3.2 `app/sitemap.ts` (דינמי מ-Supabase)

sitemap יחיד עד ~50k URL. מעבר לכך, מפצלים ל-sitemap index (סעיף 3.3).
משתמש ב-`updated_at` מ-DB ל-`lastModified`, כך ש-Google מזהה עדכוני מוצר.

```ts
// src/app/sitemap.ts
import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { absoluteUrl } from '@/lib/seo/constants'

// נבנה מחדש כל שעה (ISR) כדי לא לפגוע ב-DB בכל בקשת בוט
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()

  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/products'), changeFrequency: 'daily', priority: 0.8 },
    { url: absoluteUrl('/about'), changeFrequency: 'monthly', priority: 0.3 },
  ]

  const { data: categories } = await supabase
    .from('categories')
    .select('slug, updated_at')
    .eq('is_active', true)

  const { data: products } = await supabase
    .from('products')
    .select('slug, updated_at')
    .eq('status', 'active')
    .is('deleted_at', null)

  const categoryEntries: MetadataRoute.Sitemap = (categories ?? []).map((c) => ({
    url: absoluteUrl(`/category/${c.slug}`),
    lastModified: c.updated_at ? new Date(c.updated_at) : undefined,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const productEntries: MetadataRoute.Sitemap = (products ?? []).map((p) => ({
    url: absoluteUrl(`/product/${p.slug}`),
    lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticEntries, ...categoryEntries, ...productEntries]
}
```

### 3.3 סקייל: sitemap index מרובה קבצים

מעל 50k URL (יעד 030: 10k-50k מוצרים) עוברים ל-`generateSitemaps`:

```ts
// src/app/sitemap.ts (וריאנט מפוצל)
import type { MetadataRoute } from 'next'

const PER_SITEMAP = 40000

export async function generateSitemaps() {
  const supabase = await createClient()
  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  const pages = Math.ceil((count ?? 0) / PER_SITEMAP)
  return Array.from({ length: pages }, (_, id) => ({ id }))
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const from = id * PER_SITEMAP
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('slug, updated_at')
    .eq('status', 'active')
    .is('deleted_at', null)
    .range(from, from + PER_SITEMAP - 1)
  return (data ?? []).map((p) => ({
    url: absoluteUrl(`/product/${p.slug}`),
    lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
  }))
}
```

---

## 4. Canonical, Trailing Slash, ושימור URL חי

### 4.1 מדיניות trailing slash

מדיניות: **ללא trailing slash** (`/product/x`, לא `/product/x/`). מקובע במקום אחד
דרך `next.config.ts`:

```ts
// next.config.ts (תוספת ל-nextConfig הקיים)
const nextConfig: NextConfig = {
  trailingSlash: false, // ברירת מחדל, מפורש לתיעוד
  // ...turbopack, images הקיימים
}
```

WordPress חי לרוב מגיש URL *עם* trailing slash. לכן במפת ה-301 (סעיף 6)
כל URL ישן ממופה ליעד החדש ללא trailing slash, וה-proxy/redirect layer מבצע
נרמול (הסרת trailing slash) לפני התאמה. `absoluteUrl()` (סעיף 0) מבטיח שכל
canonical שנוצר בקוד הוא ללא trailing slash.

### 4.2 Canonical

כל עמוד מאונדקס מצהיר `alternates.canonical` מפורש (ראה סעיף 1). כללים:

- Canonical הוא תמיד אבסולוטי (נגזר מ-`metadataBase` + נתיב יחסי).
- עמוד מוצר: canonical ל-`/product/{slug}` בלי query params.
- קטגוריה עם פילטרים/מיון (`?sort=`, `?minPrice=`): canonical מצביע ל-slug הבסיסי
  ללא query, כדי למנוע אינדוקס של אינספור צירופי facets.
- דפדוף (`?page=2`): canonical עצמי אופציונלי, אבל ברירת המחדל כאן היא canonical
  לעמוד 1 + `noindex, follow` (ראה 1.3).

### 4.3 שימור URL של האתר החי

מקור אמת למיפוי: טבלת `seo_redirects` (מוגדרת ב-030, `docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md`).
מבנה קונספטואלי:

```sql
-- קונספט (המבנה המחייב ב-030). דוגמה בלבד, לא מיגרציה חדשה.
create table if not exists seo_redirects (
  id           bigserial primary key,
  from_path    text not null unique,        -- נתיב ישן מנורמל, למשל '/shop/couple-dinner'
  to_path      text not null,               -- נתיב חדש, למשל '/product/couple-dinner-haakhuza'
  status_code  smallint not null default 301,
  hits         integer  not null default 0, -- מונה פגיעות לניטור מעבר
  created_at   timestamptz not null default now()
);
create index if not exists seo_redirects_from_idx on seo_redirects (from_path);
```

---

## 5. hreflang, OG Images דינמיים, Twitter Cards

### 5.1 hreflang (`he-IL` יחיד, ניתן להרחבה)

היום locale אחד. עדיין מצהירים `hreflang` מפורש כדי לאותת ל-Google על השוק
הישראלי, ומשאירים `x-default`. כשיתווסף locale שני, מרחיבים את המפה בלבד.

```tsx
// דפוס בכל generateMetadata (מוצר/קטגוריה):
return {
  // ...
  alternates: {
    canonical,
    languages: {
      'he-IL': canonical,
      'x-default': canonical,
    },
  },
}
```

הרחבה עתידית (למשל `en-IL`): `languages` יקבל `'en-IL': absoluteUrl('/en/product/...')`
בלי לשנות את ה-`he-IL` הקיים, כך שאין שבירת URL.

### 5.2 OG Image דינמי לכל מוצר (`opengraph-image`)

קובץ קונבנציה `app/(store)/product/[slug]/opengraph-image.tsx` מייצר תמונת
1200x630 עם שם המוצר, מחיר, שם ספק ומיתוג צהוב/סלייט. משתמש ב-`ImageResponse`.

```tsx
// src/app/(store)/product/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'
import { BRAND } from '@/lib/seo/constants'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'קניון אקספרס'

export default async function OgImage({ params }: { params: { slug: string } }) {
  const supabase = await createClient()
  const { data: p } = await supabase
    .from('products')
    .select('name_he, kenyon_price, type, vendors(name_he)')
    .eq('slug', decodeURIComponent(params.slug))
    .single()

  const supplier = Array.isArray(p?.vendors) ? null : p?.vendors
  const kind = p?.type === 'coupon' ? 'שובר' : 'מוצר'

  return new ImageResponse(
    (
      <div
        dir="rtl"
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: 64,
          background: BRAND.slate, color: '#fff', fontFamily: 'Heebo',
        }}
      >
        <div style={{ fontSize: 34, color: BRAND.yellow, fontWeight: 800 }}>
          קניון אקספרס
        </div>
        <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1 }}>
          {p?.name_he ?? 'מוצר'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 30, opacity: 0.85 }}>
            {supplier?.name_he ? `${kind} מאת ${supplier.name_he}` : kind}
          </div>
          {p?.kenyon_price != null && (
            <div
              style={{
                fontSize: 56, fontWeight: 800, color: BRAND.slate,
                background: BRAND.yellow, padding: '8px 28px', borderRadius: 16,
              }}
            >
              ₪{p.kenyon_price}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  )
}
```

הערות מימוש:
- כדי שגופן Heebo יעבוד ב-edge צריך לטעון קובץ `.ttf` דרך `fetch` ולהעביר ב-`fonts`.
  אם לא נטען, יש להשאיר fallback ולוודא שהטקסט העברי מתרנדר (אחרת ריבועים).
- הנתיב `/product/{slug}/opengraph-image` הוא בדיוק מה ש-`generateMetadata` מפנה אליו
  ב-`openGraph.images` וב-`twitter.images` (סעיף 1.2).
- קטגוריה יכולה לקבל `app/(store)/category/[slug]/opengraph-image.tsx` באותו דפוס,
  או ליפול ל-OG סטטי גלובלי (`app/opengraph-image.png`).

### 5.3 Twitter Cards

`summary_large_image` כברירת מחדל בשורש, ומוגדר מפורשות בעמוד מוצר עם אותה
תמונת OG דינמית (סעיף 1.2). אין צורך בכרטיס נפרד; Twitter נופל חזרה ל-OG כשחסר,
אבל ההצהרה המפורשת מבטיחה כותרת ותיאור נכונים.

---

## 6. שימור URL במעבר מ-WordPress (מפת 301)

מטרה: אפס אובדן דירוג ביום ה-cutover. כל URL ישן מאונדקס מקבל הכרעה אחת:
301 ליעד חדש, התאמה חיה (אותו נתיב), או 410 מודע (תוכן שהוסר בכוונה).
פירוט תהליך המלאי וה-cutover ב-`docs/ARCHITECTURE-WP-DATA-MIGRATION.md`;
כאן שכבת המימוש ב-Next.js.

### 6.1 מקור המפה

`seo_redirects` (סעיף 4.3) הוא מקור האמת. אכלוס:

1. ייצוא כל ה-URL המאונדקסים מ-WordPress (Yoast sitemap + Search Console export + crawl).
2. מיפוי אלגוריתמי לפי slug (WooCommerce `/product/{slug}` -> `/product/{slug}` כשה-slug נשמר).
3. מיפוי ידני לשאריות (קטגוריות שהשם השתנה, עמודים שאוחדו).
4. טעינה ל-`seo_redirects` דרך seed/מיגרציה של דאטה (לא סכמה).

### 6.2 אכיפת ה-301 בזמן ריצה

מומלץ ב-Middleware (רץ לפני ה-render, זול, תומך ב-Edge). מנרמל trailing slash
ומחפש התאמה. לביצועים: קאש בזיכרון של המפה עם revalidate, לא שאילתת DB לכל בקשה.

```ts
// src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server'
import { getRedirectMap } from '@/lib/seo/redirects' // קאש עם revalidate מ-seo_redirects

export async function middleware(req: NextRequest) {
  const url = req.nextUrl
  // נרמול: הסרת trailing slash (למעט השורש)
  const path = url.pathname !== '/' ? url.pathname.replace(/\/$/, '') : '/'

  const map = await getRedirectMap()
  const hit = map.get(path)
  if (hit) {
    const dest = req.nextUrl.clone()
    dest.pathname = hit.to_path
    dest.search = '' // WordPress query strings לא נשמרים כברירת מחדל
    return NextResponse.redirect(dest, hit.status_code) // 301
  }
  return NextResponse.next()
}

export const config = {
  // לא מריצים על נכסים סטטיים ו-API
  matcher: ['/((?!_next/|api/|favicon.ico|.*\\.[\\w]+$).*)'],
}
```

חלופה סטטית: אם המפה קטנה ויציבה, אפשר להגדיר `redirects()` ב-`next.config.ts`.
לסקייל של אלפי redirects דינמיים מ-DB, Middleware עדיף.

### 6.3 ניטור אחרי cutover (30 יום)

- מונה `hits` ב-`seo_redirects` מזהה אילו URL ישנים עדיין נגישים (בוטים/backlinks).
- Search Console: מעקב אחר 404, coverage, ו-impressions לפני/אחרי.
- לוג של כל 404 שלא נמצא ב-`seo_redirects` -> תור להוספת redirect או 410 מודע.
- שער הצלחה: 0 URL ישן מאונדקס שמחזיר 404 בתום 30 יום.

### 6.4 עמוד 404 ו-410

- `app/not-found.tsx`: 404 ידידותי בעברית עם קישורים לקטגוריות מובילות וחיפוש,
  כדי לשמר משתמשים שהגיעו ל-URL שבור.
- 410 (Gone) לתוכן שהוסר בכוונה: מחזירים דרך route handler עם `status: 410`
  כדי לאותת ל-Google להסיר מהאינדקס מהר יותר מ-404.

---

## 7. צ׳קליסט יישום

1. `src/lib/seo/constants.ts`: `SITE_URL`, `absoluteUrl`, קבועי מותג.
2. `src/lib/seo/jsonld.ts`: helpers ל-Product, Offer, Breadcrumb, Organization.
3. `src/components/seo/JsonLd.tsx`: רכיב הזרקה עם אסקייפ.
4. שורש `layout.tsx`: `metadataBase`, title template, defaults, `lang=he-IL dir=rtl`, Organization JSON-LD.
5. מוצר/קטגוריה: `generateMetadata` מלא + הזרקת JSON-LD + `opengraph-image.tsx`.
6. `app/sitemap.ts` + `app/robots.ts`.
7. `next.config.ts`: `trailingSlash: false`.
8. `src/middleware.ts` + `src/lib/seo/redirects.ts`: אכיפת 301 מ-`seo_redirects`.
9. `app/not-found.tsx`: 404 בעברית; route ל-410 לפי הצורך.
10. אימות: Rich Results Test (Product/Breadcrumb), Search Console sitemap submit,
    בדיקת canonical/hreflang בכל סוג עמוד, בדיקת OG image render עם עברית.
```

**מקורות אמת גוברים:** מדיניות slugs/canonical/redirects/sitemap ב-030
(`docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md`); מלאי URL ו-cutover ב-032
(`docs/ARCHITECTURE-WP-DATA-MIGRATION.md`); שימור דירוגים וניטור ב-
`docs/ARCHITECTURE-GROWTH-SEO.md`. מסמך זה מפרט את שכבת המימוש ב-Next.js בלבד.
