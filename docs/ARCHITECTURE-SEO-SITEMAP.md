# ARCHITECTURE-SEO-SITEMAP: sitemap, structured data, meta ו-Core Web Vitals

תאריך: 2026-07-29 | ענף: `arch/mega-docs` | סטטוס: **מסמך מחייב, שכבת מימוש**

כפיפות סמכות. כפוף ל-`docs/MASTER-ARCHITECTURE.md` ול-
`docs/CONTRADICTIONS.md`. מרחיב את `docs/ARCHITECTURE-SEO.md` (מכניקת
זמן ריצה) ואת `docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md` (‏slugs,
canonical, `seo_redirects`), וגובר עליהם בפרטי המימוש של sitemap,
structured data ו-metadata פר-דף בלבד. הכרעות slug ו-redirect נשארות
שלהם. שימור SEO ב-cutover שייך ל-`docs/ARCHITECTURE-WP-MIGRATION.md`.

---

## 0. מצב הפתיחה, מאומת מהקוד

נמדד ב-2026-07-29 מול קוד ה-branch והפרויקט `ixvwfbuvfxxsjiywhbbb`.

| מה | מצב | קובץ |
|---|---|---|
| `sitemap.ts` | **קיים**, קובץ יחיד, ‏`revalidate = 3600` | `src/app/sitemap.ts` |
| `robots.ts` | **קיים**, עם disallow על `/redeem/` | `src/app/robots.ts` |
| `metadataBase` | **קיים** ב-root layout | `src/app/layout.tsx` |
| `lang="he" dir="rtl"` | **קיים** | `src/app/layout.tsx` |
| `generateMetadata` | קיים ב-**4 דפים בלבד** | product, category, search, coupons/[id] |
| ‏JSON-LD / structured data | **אפס. אין ולו בלוק אחד בכל הריפו** | - |
| ‏canonical | **אין** באף דף | - |
| ‏`hreflang` | **אין** | - |
| ‏OG / Twitter tags | **אין** באף דף | - |
| `seo_title` / `seo_description` על `products` | **קיימות** ב-DB ונקראות | `product/[slug]/page.tsx` |
| ‏`seo_redirects` | **לא קיימת** | - |
| ‏sitemap index | אין. קובץ יחיד עד 45,000 URL | `sitemap.ts` |

השורה החשובה כאן היא **אפס structured data**. בלי `Product` ו-`Offer`,
תוצאות החיפוש של האתר לא מציגות מחיר, לא זמינות ולא דירוג, וזה ההבדל
הגלוי ביותר בין תוצאה שנלחצת לתוצאה שנגללת. זו הפעולה עם יחס
עלות-לתועלת הגבוה ביותר בכל המסמך הזה.

---

## 1. Sitemap

### 1.1 מה שיש היום, ומה שבור בו

`src/app/sitemap.ts` פולט קובץ אחד: 3 כניסות סטטיות, כל הקטגוריות
הפעילות, וכל המוצרים ב-`status='active'` עד 45,000. הוא קורא דרך
`createAdminClient()` בכוונה, כדי שהפלט לא יהיה תלוי במקרה ש-RLS
אנונימי חושף מוצרים.

שלוש בעיות ממשיות:

1. **קטגוריות בלי סינון.** ‏`admin.from('categories').select(...)`
   מושך גם `is_active = false`. הטבלה ריקה היום (0 שורות), אז זה לא
   מזיק כרגע; ברגע שהייבוא ירוץ, קטגוריה מוסתרת תופיע ב-sitemap ותייצר
   soft-404. גם `deleted_at` לא נבדק.
2. **הכל תמיד `daily`.** ‏`changeFrequency: 'daily'` על קטגוריה שלא
   השתנתה חודשיים הוא רעש. גוגל מתעלם מהשדה כשהוא לא מתאם ל-
   `lastModified` בפועל.
3. **`/coupons` בתוך ה-sitemap הסטטי, בלי הדפים הבנים.** ‏`/coupons/[id]`
   הוא דף אמיתי עם `generateMetadata` ואינו נכלל.

### 1.2 החוק: מה נכנס ומה לא

הכניסה ל-sitemap היא הצהרה. דף שנכנס אליו ומחזיר משהו שאינו 200 עם
תוכן ייחודי הוא נזק, לא הזדמנות.

**נכנס:**

| נתיב | תדירות | עדיפות | `lastModified` |
|---|---|---|---|
| `/` | `daily` | 1.0 | ‏max(updated_at) של מוצר |
| `/products` | `daily` | 0.9 | ‏max(updated_at) של מוצר |
| `/coupons` | `daily` | 0.9 | ‏max(updated_at) של מוצר קופון |
| `/category/<slug>` | `weekly` | 0.8 | ‏`categories.updated_at` |
| `/product/<slug>` | `weekly` | 0.7 | ‏`products.updated_at` |
| `/coupons/<id>` | `weekly` | 0.7 | ‏`updated_at` |
| עמודי legal (‏`/legal/*`, ‏`/accessibility`) | `yearly` | 0.3 | קבוע |

**לא נכנס, לעולם:**

`/account/**`, `/supplier/**`, `/admin/**`, `/checkout*`, `/cart`,
`/auth/**`, `/login`, `/signup`, `/reset-password`, `/forgot-password`,
`/search` (תוצאה דינמית לכל שאילתה, מלכודת תוכן דק קלאסית),
`/products?page=N` (ראה 1.5), ו**מעל לכל `/redeem/[token]`**.

הנימוק ל-`/redeem/[token]` כתוב בקוד עצמו והוא נכון: **הנתיב הזה הוא
טוקן השובר.** פרסום שלו ב-sitemap מוסר לזר את ה-QR של קופון שמישהו
שילם עליו. הוא נדחה בשלוש שכבות: אין ב-sitemap, `Disallow` ב-robots,
ו-`noindex` בדף עצמו. זו לא כפילות, זו הגנה נכונה: כל אחת מהשלוש
נשברת בנפרד.

### 1.3 המימוש המתוקן

```ts
// src/app/sitemap.ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { MetadataRoute } from 'next'

export const revalidate = 3600

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il')
    .replace(/\/+$/, '')
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  const admin = createAdminClient()

  const [{ data: products }, { data: categories }] = await Promise.all([
    admin
      .from('products')
      .select('slug, updated_at, type')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('slug', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(45_000),
    admin
      .from('categories')
      .select('slug, updated_at')
      .eq('is_active', true)          // תוקן: לא לפלוט קטגוריה מוסתרת
      .not('slug', 'is', null),
  ])

  // lastModified אמיתי, לא now(). דף רשימה מתיישן כשהתוכן שלו מתיישן.
  const newestProduct = products?.[0]?.updated_at
    ? new Date(products[0].updated_at)
    : new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`,         lastModified: newestProduct, changeFrequency: 'daily',  priority: 1 },
    { url: `${base}/products`, lastModified: newestProduct, changeFrequency: 'daily',  priority: 0.9 },
    { url: `${base}/coupons`,  lastModified: newestProduct, changeFrequency: 'daily',  priority: 0.9 },
  ]

  const categoryEntries: MetadataRoute.Sitemap = (categories ?? []).map((c) => ({
    url: `${base}/category/${encodeURIComponent(c.slug!)}`,
    lastModified: c.updated_at ? new Date(c.updated_at) : newestProduct,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  const productEntries: MetadataRoute.Sitemap = (products ?? []).map((p) => ({
    url: `${base}/product/${encodeURIComponent(p.slug!)}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : newestProduct,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  return [...staticEntries, ...categoryEntries, ...productEntries]
}
```

`encodeURIComponent` על ה-slug הוא חובה ולא קישוט: ה-slugs עבריים,
ו-XML של sitemap דורש URL מקודד. slug עברי גולמי בקובץ ה-XML הוא sitemap
שגוגל דוחה כולו, לא שורה אחת.

### 1.4 מתי לפצל ל-sitemap index

הגבול הקשיח של גוגל: 50,000 URL או 50MB לא דחוס לקובץ. ‏45,000 הוא
מרווח סביר. הקטלוג היום הוא 61 מוצרים, כלומר הפיצול רחוק.

הכלל: מפצלים ב-**20,000**, לא ב-45,000, ולא בגלל הגבול אלא בגלל
האבחון. ‏sitemap אחד ענק נותן שורה אחת בדוח הכיסוי של Search Console.
חמישה קבצים לפי סוג ישות נותנים חמש שורות, ואפשר לראות ש"הקטגוריות
נפלו" בלי לנחש.

```
/sitemap.xml                 (index)
  /sitemap/static.xml
  /sitemap/categories.xml
  /sitemap/products-0.xml    (20,000 לכל היותר)
  /sitemap/products-1.xml
  /sitemap/coupons.xml
```

עד אז: קובץ אחד. פיצול מוקדם הוא סיבוכיות בלי תמורה.

### 1.5 עימוד: `rel=canonical` ולא sitemap

`/products?page=2` **לא** נכנס ל-sitemap. הטיפול הנכון בעימוד:

- `page=1` הוא ה-canonical של עצמו.
- `page>1` הוא canonical של **עצמו**, לא של עמוד 1. ‏canonical לעמוד 1
  היה אומר לגוגל שהמוצרים בעמוד 2 לא קיימים, והם לא ייסרקו.
- `rel=prev` / `rel=next` הוצאו משימוש על ידי גוגל ב-2019. לא מוסיפים.
- כל עמוד מעבר לראשון מקבל `robots: { index: false, follow: true }`:
  אל תאנדקס את הרשימה, כן עקוב לקישורי המוצרים שבה.

### 1.6 robots.txt

הקובץ הקיים נכון. שני תיקונים:

```ts
disallow: [
  '/redeem/',          // טוקני שוברים חתומים
  '/account/', '/supplier/', '/admin/',
  '/checkout', '/cart', '/auth/', '/api/',
  '/reset-password', '/forgot-password',
  '/search',           // הוסף: תוצאות חיפוש = תוכן דק אינסופי
  '/*?*sort=',         // הוסף: פרמטרי מיון מייצרים כפילויות
]
```

ההערה שכבר בקוד ראויה לחזרה: **‏robots.txt הוא בקשה, לא בקרת גישה.**
כל מה שברשימה חסום גם בשרת. זה עוצר crawler מנומס מלבזבז תקציב סריקה,
לא תוקף.

### 1.7 שער ה-sitemap לפני שיגור

| בדיקה | איך |
|---|---|
| ‏XML תקין | ‏`curl -s $URL/sitemap.xml \| xmllint --noout -` |
| כל URL מחזיר 200 | סקריפט על כל הרשימה, אפס 3xx ואפס 4xx |
| אין URL חסום ב-robots | הצלבה מול `robots.txt` |
| אין URL עם `noindex` | ‏HEAD על מדגם, בדיקת `X-Robots-Tag` ו-meta |
| ‏slugs מקודדים | אפס תווים לא-ASCII גולמיים בקובץ |
| הוגש ל-GSC | ידנית, ומאומת ב-Sitemaps report |

**‏URL ב-sitemap שגם `noindex` הוא סתירה** שגוגל מדווח עליה. זה קורה
בדיוק כשמישהו מוסיף `noindex` לדף ושוכח את ה-sitemap.

---

## 2. Structured data (JSON-LD)

### 2.1 החלטות מסגרת

- **‏JSON-LD בלבד**, לא Microdata ולא RDFa. זה מה שגוגל ממליץ עליו,
  והוא מופרד מה-DOM כך שרינדור לא שובר אותו.
- מוזרק כ-`<script type="application/ld+json">` בתוך ה-Server Component
  של הדף, לא דרך `useEffect`. סכימה שנכתבת בצד לקוח לא נראית בסריקה
  הראשונה.
- **כל שדה חייב להתאים למה שנראה על המסך.** ‏`price` בסכימה שאינו
  המחיר בדף הוא הפרת המדיניות של גוגל וסיבה לענישה ידנית. המחיר בסכימה
  נגזר מאותה פונקציה שמזינה את התצוגה, לא משאילתה שנייה.
- לכל דף מוקנן `@graph` יחיד ולא כמה בלוקים נפרדים, כדי שההפניות
  ‏(`@id`) יעבדו בין הישויות.

### 2.2 ה-helper

```ts
// src/lib/seo/jsonld.ts
import 'server-only'

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // התוכן נבנה בשרת מדאטה שלנו. ההחלפה של "<" מונעת סגירת script
      // אם טקסט תיאור מכיל תגית.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  )
}
```

ה-`replace` הוא בקרת אבטחה. `description_he` מגיע מוורדפרס, כלומר קלט
לא אמין; מחרוזת שמכילה `</script>` הייתה סוגרת את הבלוק ומזריקה HTML.

### 2.3 `Organization` + `WebSite`, ב-root layout

מוזרק פעם אחת, בכל דף:

```ts
// src/app/layout.tsx
const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'

const siteGraph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${base}/#organization`,
      name: 'קניון אקספרס',
      alternateName: 'KenyonExpress',
      url: base,
      logo: { '@type': 'ImageObject', url: `${base}/logo.png`, width: 512, height: 512 },
      sameAs: [],                       // פרופילי רשתות, כשיהיו
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        availableLanguage: ['he', 'en'],
        areaServed: 'IL',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${base}/#website`,
      url: base,
      name: 'קניון אקספרס',
      inLanguage: 'he-IL',
      publisher: { '@id': `${base}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${base}/search?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ],
}
```

`SearchAction` הוא מה שמייצר את תיבת החיפוש בתוך תוצאת גוגל. הוא חייב
להצביע ל-`/search?q=` האמיתי, שקיים.

`sameAs` נשאר מערך ריק ולא מושמט: ריק הוא הצהרה שאין פרופילים; חסר הוא
שכחה. אף אחד מהם לא פוגע, אבל הראשון מתועד.

### 2.4 `Product` + `Offer`: דף המוצר

זה הבלוק שמחזיר את הכסף. הוא מוזרק ב-`(store)/product/[slug]/page.tsx`.

```ts
// src/lib/seo/product-jsonld.ts
export function productGraph(p: ProductForSeo, base: string) {
  const url = `${base}/product/${encodeURIComponent(p.slug)}`
  const images = (p.images ?? []).map((i) => i.url).filter(Boolean)

  // המחיר חייב לצאת מאותה פונקציה שמזינה את התצוגה.
  const price = p.type === 'coupon' ? p.coupon_price_ils : p.price_ils

  const availability =
    p.status === 'sold_out'                       ? 'https://schema.org/SoldOut'
    : p.stock_quantity === null                   ? 'https://schema.org/InStock'
    : p.stock_quantity > 0                        ? 'https://schema.org/InStock'
    :                                               'https://schema.org/OutOfStock'

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.name_he,
    description: p.seo_description ?? p.short_description_he ?? stripHtml(p.description_he),
    image: images,                        // מערך; הראשון הוא הראשי
    sku: p.sku ?? undefined,
    url,
    inLanguage: 'he-IL',
    brand: p.supplier_name
      ? { '@type': 'Brand', name: p.supplier_name }
      : undefined,
    category: p.category_name_he ?? undefined,
    offers: {
      '@type': 'Offer',
      '@id': `${url}#offer`,
      url,
      priceCurrency: 'ILS',
      price: agorotToDecimalString(price),   // "89.90", לא 89.9 ולא מספר
      availability,
      itemCondition: 'https://schema.org/NewCondition',
      // חובה כשיש price. תאריך בעבר גורם לגוגל להתעלם מההצעה.
      priceValidUntil: p.price_valid_until ?? plusDays(90),
      seller: { '@id': `${base}/#organization` },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'IL',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 14,            // חוק הגנת הצרכן, 14 יום
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/FreeReturn',
      },
    },
  }
}
```

חמש מלכודות שמפילות את הבלוק הזה בפועל:

1. **`price` כמחרוזת עשרונית.** ‏`"89.90"`, לא `89.9` ולא `8990`. הכסף
   אצלנו באגורות (integer), אז נדרשת המרה מפורשת. שגיאת עיגול כאן היא
   מחיר שגוי בתוצאת החיפוש.
2. **‏`priceValidUntil` חובה.** בלעדיו גוגל מתעלם מה-Offer כולו. תאריך
   בעבר עושה אותו דבר. ‏90 יום קדימה, מתחדש.
3. **מחיר קופון מול מחיר מוצר.** למוצר קופון, המחיר בתוצאת החיפוש חייב
   להיות `coupon_price_ils` (מה שהלקוח משלם באתר), לא `price_ils` (שווי
   הדיל). לפי `CONTRADICTIONS.md` C4, `coupon_price_ils` הוא הערך הקנוני
   שהמנוע מחייב לפיו. הצגת המחיר האחר היא בדיוק הבאג שבו הלקוח ראה ציטוט
   אחד וחויב באחר.
4. **‏`aggregateRating` ו-`review` מושמטים.** אין לנו ביקורות. סימון
   דירוג שאינו קיים בדף הוא הפרה מפורשת, וזו העילה הנפוצה ביותר לענישה
   ידנית על structured data.
5. **‏`availability` על מוצר `sold_out`.** ‏enum `product_status` כולל
   `sold_out` (‏084). דף שמציג "אזל" עם `InStock` בסכימה הוא סתירה
   שגוגל מדווח עליה.

### 2.5 `BreadcrumbList`

בכל דף מוצר וקטגוריה. משנה את איך שה-URL מוצג בתוצאה:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "דף הבית",  "item": "https://kenyonexpress.co.il/" },
    { "@type": "ListItem", "position": 2, "name": "מסעדות",   "item": "https://kenyonexpress.co.il/category/restaurants" },
    { "@type": "ListItem", "position": 3, "name": "שם המוצר" }
  ]
}
```

לפריט האחרון **אין `item`**. הוא הדף הנוכחי, והפניה עצמית שם היא שגיאה
נפוצה שמכשילה את הבדיקה. הפירורים חייבים להתאים לפירורים הנראים בדף.

### 2.6 `ItemList` בדפי רשימה

`/products`, `/category/[slug]`, `/coupons`. מקצר את הזמן עד שגוגל מגלה
את המוצרים:

```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "itemListOrder": "https://schema.org/ItemListOrderAscending",
  "numberOfItems": 24,
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "url": "https://kenyonexpress.co.il/product/x" }
  ]
}
```

רק `url`, בלי `Product` מקונן. סכימת מוצר מלאה על 24 מוצרים בדף רשימה
מנפחת את ה-HTML ומחזירה מעט, והמידע כבר נמצא בדף המוצר עצמו.

### 2.7 `LocalBusiness`: ההכרעה הלא-מובנת מאליה

`LocalBusiness` נראה מתאים כי הספקים הם עסקים פיזיים. הוא לא מתאים
לפלטפורמה עצמה, והנה למה:

**קניון אקספרס אינו עסק מקומי.** אין חנות פיזית עם שעות פתיחה שלקוח
נכנס אליה. סימון `LocalBusiness` על הפלטפורמה עם כתובת משרד הוא הצהרה
שגויה, וגוגל מסיק ממנה שאנחנו מתחרים על חיפוש מקומי במקום שאנחנו לא.

**הספק כן.** ‏11 הספקים החיים הם מסעדות ובתי עסק, ולקופון יש מקום מימוש
פיזי. הסימון הנכון הוא `LocalBusiness` **על הספק**, בתוך גרף המוצר,
כשהמוצר הוא קופון וכשיש לספק כתובת אמיתית:

```ts
const supplierPlace = supplier.address && supplier.name ? {
  '@type': 'LocalBusiness',
  '@id': `${base}/supplier/${supplier.id}#business`,
  name: supplier.name,
  address: {
    '@type': 'PostalAddress',
    streetAddress: supplier.address,
    addressLocality: supplier.city,
    addressCountry: 'IL',
  },
  telephone: supplier.contact_phone ?? undefined,
  geo: supplier.lat && supplier.lng
    ? { '@type': 'GeoCoordinates', latitude: supplier.lat, longitude: supplier.lng }
    : undefined,
  openingHoursSpecification: supplier.hours ?? undefined,
} : undefined
```

והוא נתלה על ההצעה:

```ts
offers: { ..., areaServed: supplierPlace, availableAtOrFrom: supplierPlace }
```

**התנאי המחייב: אין המצאה.** ‏6 מ-11 הספקים החיים חסרים טלפון וכולם
חסרים כתובת (‏STATE.md, 28.07). ספק בלי כתובת מאומתת **לא מקבל בלוק
`LocalBusiness` בכלל**. כתובת מנוחשת בסכימה היא לקוח שמגיע לכתובת
שגויה כדי לממש קופון, וזה נזק אמיתי ולא רק SEO.

לכן `LocalBusiness` חסום מאחורי שער דאטה: העמודות `address`, `city`,
`lat`, `lng` ו-`opening_hours` על `suppliers` חייבות להתמלא, והשלמות
שלהן היא **שער פרסום על מוצר קופון**, לא שדה אופציונלי.

### 2.8 `FAQPage`: לא

גוגל צמצם את תצוגת ה-FAQ ל-אתרי ממשל ובריאות בלבד (2023). סימון FAQ על
דפי מוצר מסחריים לא מייצר תוצאה עשירה ומוסיף תחזוקה. **לא מיישמים.**

### 2.9 אימות

| כלי | מה הוא נותן | מתי |
|---|---|---|
| ‏Rich Results Test | האם גוגל מזהה את הסוג | לכל תבנית, פעם |
| ‏Schema Markup Validator | תקינות מלאה מול schema.org | לכל תבנית |
| ‏GSC, ‏Enhancements | שגיאות על הקטלוג החי | שבועי אחרי שיגור |
| טסט יחידה | ‏snapshot של הגרף לכל טיפוס מוצר | ‏CI, חוסם |

טסט היחידה הוא החשוב מבין הארבעה, כי הוא היחיד שרץ לפני שהבאג עולה
לאוויר. ראה `ARCHITECTURE-TESTING.md` סעיף 3.6.

---

## 3. Metadata לכל דף

### 3.1 המצב, והחור

`generateMetadata` קיים ב-4 דפים. הוא **חסר** בדף הבית, `/products`,
`/coupons`, ובכל עמודי ה-legal. דף בלי `generateMetadata` יורש את
`title.default = 'KenyonExpress'` ואת התיאור הגנרי, כלומר שלושה דפים
שונים עם אותה כותרת ואותו תיאור בתוצאות החיפוש.

בנוסף, אף אחד מהארבעה לא מגדיר `canonical`, `openGraph` או `robots`.

### 3.2 הטבלה המחייבת

| נתיב | `title` | `description` | `canonical` | `robots` | ‏OG |
|---|---|---|---|---|---|
| `/` | `קניון אקספרס - קופונים ומבצעים` | קבוע, 150-160 תווים | `/` | index | ‏website |
| `/products` | `כל המוצרים` | קבוע | `/products` | ‏index (עמוד 1 בלבד) | ‏website |
| `/category/<slug>` | `categories.name_he` | `description_he` או תבנית | `/category/<slug>` | index | ‏website |
| `/product/<slug>` | `seo_title ?? name_he` | `seo_description ?? short_description_he` | `/product/<slug>` | index | **‏product** |
| `/coupons` | `קופונים ומבצעים` | קבוע | `/coupons` | index | ‏website |
| `/coupons/<id>` | שם הדיל | תיאור הדיל | `/coupons/<id>` | index | ‏product |
| `/search` | `חיפוש: <q>` | לא לאנדקס | אין | **noindex, follow** | אין |
| `/cart`, `/checkout*` | תיאורי | - | אין | **noindex, nofollow** | אין |
| `/account/**` | תיאורי | - | אין | **noindex, nofollow** | אין |
| `/redeem/<token>` | `מימוש שובר` | - | אין | **noindex, nofollow, noarchive** | אין |
| `/login`, `/signup` | תיאורי | - | עצמי | **noindex, follow** | אין |
| `/legal/*`, `/accessibility` | שם המסמך | תקציר | עצמי | index | ‏website |
| ‏404 | `הדף לא נמצא` | - | אין | **noindex** | אין |

### 3.3 התבנית

```ts
// src/app/(store)/product/[slug]/page.tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select('name_he, description_he, short_description_he, seo_title, seo_description, images, type, price_ils, coupon_price_ils')
    .eq('slug', slug)
    .eq('status', 'active')
    .is('deleted_at', null)
    .single()

  if (!data) {
    return { title: 'מוצר לא נמצא', robots: { index: false, follow: false } }
  }

  const title = data.seo_title ?? data.name_he ?? 'מוצר'
  const description = truncate(
    data.seo_description ?? data.short_description_he ?? stripHtml(data.description_he) ?? '',
    160,
  )
  const canonical = `/product/${encodeURIComponent(slug)}`
  const image = (data.images as ImageEntry[] | null)?.[0]

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonical,
      siteName: 'קניון אקספרס',
      locale: 'he_IL',
      images: image
        ? [{ url: image.og_url ?? image.url, width: 1200, height: 630, alt: image.alt ?? title }]
        : [],
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}
```

ארבע הערות שיוצאות מהקוד הזה:

**‏`.eq('status','active')` הוא תיקון נדרש.** ‏`generateMetadata` הנוכחי
שולף לפי slug בלבד, כלומר מוצר טיוטה או מחוק מחזיר כותרת אמיתית לדף
שהגוף שלו מחזיר 404. זה soft-404 עם metadata תקין, וגוגל סופר אותו
כשגיאת כיסוי.

**‏`canonical` יחסי.** ‏`metadataBase` כבר מוגדר ב-root layout, ו-Next
בונה את המוחלט. יחסי בטוח יותר: הוא לא נשבר כשהדומיין משתנה בין preview
לפרודקשן.

**‏OG type הוא `website` ולא `product`.** ‏`next/metadata` לא תומך
ב-`og:product` המורחב, וסימון חלקי גרוע מכלום. הנתונים המסחריים
(מחיר, זמינות) עוברים ב-JSON-LD, שם הם נקראים בפועל.

**התיאור נחתך ל-160.** תיאור ארוך יותר נחתך על ידי גוגל באמצע מילה.
`truncate` חותך על גבול מילה ומוסיף שלוש נקודות.

### 3.4 OG image: לא רק לגוגל

בישראל, שיתוף מוצר קורה ב-WhatsApp. התצוגה המקדימה שם מגיעה מ-
`og:image`, ו-WhatsApp מחמיר:

| דרישה | ערך |
|---|---|
| יחס | 1.91:1, כלומר 1200x630 |
| גודל | מתחת ל-600KB (מעל זה נחתך שקט) |
| פורמט | ‏JPEG או PNG. **WebP לא מוצג בחלק מהגרסאות** |
| ‏URL | מוחלט, ‏HTTPS, בלי redirect |

צינור התמונות של הייבוא מייצר `og.webp` ב-1200x630. **צריך להוסיף
נגזרת `og.jpg`**, כי WebP לא בטוח שם. זו משימה בסעיף 3 של
`ARCHITECTURE-WP-MIGRATION.md`.

`og_url` שעובר redirect לא נטען: WhatsApp לא עוקב. אחרי מעבר ל-R2 עם
דומיין `cdn.kenyonexpress.co.il`, ה-URL חייב להיות סופי.

---

## 4. hreflang ו-he-IL

### 4.1 ההכרעה: מצהירים, לא מסמנים חלופות

האתר הוא **חד-לשוני, עברית ישראלית**. יש `next-intl` בפרויקט ו-
`name_en` ב-`categories`, אבל אין גרסה אנגלית של אף דף.

מזה נובע:

**‏`hreflang` בין שפות: לא מיישמים.** ‏`hreflang` מצהיר על **גרסאות
חלופיות** של אותו תוכן. באתר חד-לשוני אין חלופה, ותגית `hreflang`
שמצביעה לעצמה בלבד היא רעש. ‏`hreflang` שמצביע לדף אנגלי שלא קיים היא
שגיאה שגוגל מדווח עליה.

**מה כן מצהירים, ובשלושה מקומות:**

```html
<html lang="he" dir="rtl">                          <!-- קיים ונכון -->
```

```ts
openGraph: { locale: 'he_IL' }                       // קו תחתון, לא מקף
```

```json
{ "inLanguage": "he-IL" }                            // ב-WebSite וב-Product
```

שלושת הפורמטים שונים בכוונה: HTML משתמש ב-`he`, ‏Open Graph ב-
`he_IL` עם קו תחתון, ו-schema.org ב-`he-IL` עם מקף. ערבוב ביניהם הוא
שדה שנקרא כלא-תקין ומושמט.

### 4.2 מה כן צריך תשומת לב ב-RTL

הבעיות האמיתיות של אתר עברי אינן `hreflang`:

| נושא | כלל |
|---|---|
| ‏`dir="rtl"` על `<html>` | קיים. חובה, לא על div פנימי |
| ‏slugs עבריים ב-URL | מקודדים ב-sitemap וב-canonical, מפוענחים בקוד |
| כיוון מספרים | מחיר הוא LTR בתוך משפט RTL. עוטפים ב-`<bdi>` |
| ‏`title` בעברית | 50-60 תווים. עברית צפופה יותר מאנגלית לפיקסל |
| ‏OG image עם טקסט | הטקסט חייב להיות RTL נכון בתמונה עצמה |
| ‏`geo.region` meta | מיושן. לא מוסיפים |

**מתי כן צריך `hreflang`.** ביום שיהיה `/en/**` אמיתי. אז, ובכל דף:

```html
<link rel="alternate" hreflang="he-IL" href="https://kenyonexpress.co.il/product/x" />
<link rel="alternate" hreflang="en"    href="https://kenyonexpress.co.il/en/product/x" />
<link rel="alternate" hreflang="x-default" href="https://kenyonexpress.co.il/product/x" />
```

הכלל שנשבר הכי הרבה: `hreflang` חייב להיות **הדדי**. אם העברי מצביע
לאנגלי, האנגלי חייב להצביע חזרה. חד-כיווני מתעלם ממנו לגמרי.

---

## 5. Core Web Vitals

### 5.1 היעדים

היעדים הם **‏p75 בשטח (‏CrUX / RUM)**, לא במעבדה. ‏Lighthouse על מכונת
מפתח מהירה הוא סימן, לא מדידה.

| מדד | יעד | סף כישלון | למה חשוב פה |
|---|---|---|---|
| **LCP** | ‏< 2.0s | ‏> 2.5s | תמונת המוצר היא ה-LCP בכל דף מוצר |
| **INP** | ‏< 150ms | ‏> 200ms | "הוסף לעגלה" הוא האינטראקציה הנמדדת |
| **CLS** | ‏< 0.05 | ‏> 0.1 | גריד מוצרים בלי מידות תמונה קופץ |
| **TTFB** | ‏< 500ms | ‏> 800ms | ‏Vercel fra1 מול Supabase eu-central-1 |
| **FCP** | ‏< 1.5s | ‏> 1.8s | |

תקציבי משאבים, נאכפים ב-CI:

| משאב | תקציב | הערה |
|---|---|---|
| ‏JS ראשוני (‏gzip) | ‏< 130KB | דף הבית ודף מוצר |
| ‏CSS ראשוני | ‏< 30KB | ‏Tailwind purged |
| תמונה ראשית | ‏< 120KB | ‏WebP, ‏q80, רוחב 800 בגריד |
| סה"כ העברה, דף מוצר | ‏< 600KB | |
| בקשות, דף מוצר | ‏< 40 | |
| גופנים | 1 משפחה, 2 משקלים | ‏Heebo, self-hosted |

### 5.2 מה כבר נכון

- **‏`next/font/google` עם Heebo.** ‏self-hosted בזמן build. אין קריאה
  ל-`fonts.googleapis.com`, ולכן אין origin חיצוני ב-CSP ואין round-trip
  ל-DNS. ‏`display: 'swap'` מונע טקסט בלתי נראה.
- **‏`images.remotePatterns`** מוגדר, כלומר `next/image` עובד על תמונות
  ה-R2 וה-Supabase.
- **‏`qualities: [75, 90, 95]`** מוגדר במפורש, כמו ש-Next 16 דורש.

### 5.3 מה חסר, לפי סדר תרומה

| # | פעולה | משפיע על | מאמץ |
|---|---|---|---|
| 1 | ‏`priority` על תמונת ה-LCP בדף מוצר ובכרטיס הראשון בגריד | **LCP** | דקות |
| 2 | ‏`width`/`height` (או `aspect-ratio`) על כל `next/image` | **CLS** | שעות |
| 3 | ‏`sizes` נכון לכל תמונה רספונסיבית | ‏LCP, העברה | שעות |
| 4 | `placeholder="blur"` עם blurDataURL מהצינור | ‏CLS נתפס | יום |
| 5 | ‏Cache Components + PPR (הכרעה 1.55) | **TTFB** | ימים |
| 6 | ‏`generateStaticParams` למוצרים החמים | ‏TTFB, ‏LCP | יום |
| 7 | קטלוג ציבורי דרך client אנונימי בלי cookies בתוך `use cache` | ‏TTFB | ימים |
| 8 | ‏Suspense סביב אזורים תלויי-משתמש (עגלה, פעמון) | ‏TTFB | ימים |
| 9 | ‏`preconnect` ל-`cdn.kenyonexpress.co.il` | ‏LCP | דקות |
| 10 | ‏Lighthouse CI כשער חוסם | הכל | יום |

**‏#1 הוא הפעולה היחידה עם יחס תשואה כזה.** בלי `priority`, ‏Next טוען
את תמונת הגיבור בעצלתיים, הדפדפן מגלה אותה רק אחרי פענוח ה-JS, וה-LCP
נדחה במאות מילישניות. שורה אחת.

**‏#2 הוא הפעולה שבלעדיה CLS לא ניתן לתיקון.** תמונה בלי מידות היא
גובה 0 עד שהיא נטענת, ואז הדף קופץ. בגריד של 24 מוצרים זה 24 קפיצות.

### 5.4 מדידה

| שכבה | כלי | תדירות | חוסם? |
|---|---|---|---|
| ‏CI, לפני merge | ‏Lighthouse CI על 3 נתיבים | כל PR | **כן** |
| ‏CI, גודל bundle | ‏`@next/bundle-analyzer` מול תקציב | כל PR | **כן** |
| שדה, ‏RUM | ‏`web-vitals` אל `/api/a` | רציף | לא |
| שדה, ‏CrUX | ‏GSC, דוח Core Web Vitals | שבועי | לא |
| ‏synthetic | ‏PageSpeed Insights על 5 נתיבים | שבועי | לא |

שלושת הנתיבים ב-CI: `/` (דף בית), `/product/<slug קבוע>` (דף מוצר),
`/category/<slug קבוע>` (רשימה). הם מייצגים את שלושת דפוסי הרינדור.

```js
// lighthouserc.js
module.exports = {
  ci: {
    collect: { url: [...], numberOfRuns: 3, settings: { preset: 'desktop' } },
    assert: {
      assertions: {
        'categories:performance':  ['error', { minScore: 0.9 }],
        'categories:accessibility':['error', { minScore: 1.0 }],  // LEG-03
        'categories:seo':          ['error', { minScore: 1.0 }],
        'largest-contentful-paint':['error', { maxNumericValue: 2000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
        'total-byte-weight':       ['error', { maxNumericValue: 600_000 }],
      },
    },
  },
}
```

נגישות ב-1.0 היא לא שאפתנות: `LEG-03` מסווג את היעדר ת"י 5568 כחוסם
שיגור, ו-Lighthouse הוא המדידה הזולה. ‏`axe-core` בטסטים הוא העמוקה
יותר, ראה `ARCHITECTURE-TESTING.md`.

`numberOfRuns: 3` כי ריצה אחת על runner משותף רועשת. ‏Lighthouse לוקח
את החציון.

### 5.5 המדד שאף אחד לא מודד: LCP על 3G

הקהל בישראל ניגש מהנייד, לפעמים ברשת גרועה. ‏Lighthouse ב-desktop preset
נותן ציון יפה שלא מתאר את זה. לכן ריצה שנייה, שבועית ולא חוסמת, בפרופיל
`mobile` עם throttling. הפער בין השניים הוא מספר שכדאי להסתכל עליו
לפני שמוסיפים עוד ספרייה.

---

## 6. פערים פתוחים

| # | פער | חומרה | סעיף |
|---|---|---|---|
| SEO-1 | אפס structured data בכל הריפו | **גבוה** | 2 |
| SEO-2 | אין `canonical` באף דף | **גבוה** | 3.3 |
| SEO-3 | אין `generateMetadata` בדף הבית, `/products`, `/coupons` | גבוה | 3.1 |
| SEO-4 | אין OG/Twitter tags: שיתוף ב-WhatsApp בלי תצוגה מקדימה | גבוה | 3.4 |
| SEO-5 | `generateMetadata` של מוצר לא מסנן `status`/`deleted_at` | בינוני | 3.3 |
| SEO-6 | ‏sitemap לא מסנן `is_active` על קטגוריות | בינוני | 1.1 |
| SEO-7 | אין `priority` על תמונת LCP | **גבוה** | 5.3 |
| SEO-8 | אין `width`/`height` על תמונות: CLS לא נשלט | **גבוה** | 5.3 |
| SEO-9 | אין Lighthouse CI: אין שער ביצועים | גבוה | 5.4 |
| SEO-10 | ‏`/search` לא `noindex` | בינוני | 1.6 |
| SEO-11 | אין נגזרת `og.jpg` (‏WebP לא בטוח ב-WhatsApp) | בינוני | 3.4 |
| SEO-12 | שער דאטה של ספק ל-`LocalBusiness` לא קיים | בינוני | 2.7 |
| SEO-13 | `seo_redirects` לא קיימת | **חוסם cutover** | ‏WP-MIGRATION |

---

מסמכים קשורים:
`docs/ARCHITECTURE-SEO.md` (מכניקת זמן ריצה),
`docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md` (‏slugs ו-canonical),
`docs/ARCHITECTURE-WP-MIGRATION.md` (‏301 ושימור דירוג),
`docs/ARCHITECTURE-TESTING.md` (שערי CI),
`docs/ARCHITECTURE-PERFORMANCE.md` (‏Cache Components ו-PPR).
