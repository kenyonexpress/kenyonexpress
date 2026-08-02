# ARCHITECTURE-PERFORMANCE-SEO: ביצועים + SEO (מסמך מאוחד)

**סטטוס:** מחייב (Binding). Design only. אפס יישום בקובץ זה.
**תאריך:** 2026-07-20. ענף: `phase5/homepage`.
**בעלים:** Performance + SEO Architect.
**דומיין:** `kenyonexpress.co.il` (עברית RTL, Next.js 16.2.4, Supabase, Vercel).

## Authority

המסמך הזה הוא מקור האמת המאוחד לביצועים ולמכניקת SEO בזמן ריצה
(רינדור, cache, CWV, meta, JSON-LD, sitemap/robots, 301, ניטור).

| מסמך | מעמד מול המסמך הזה |
|---|---|
| `docs/ARCHITECTURE-PERFORMANCE.md` | נבלע. מספרים ותוכנית אינדקסים 038 נשארים; בכל סתירה המסמך הזה גובר |
| `docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md` §3 | מכניקת SEO (slugs, canonical, JSON-LD בסיס). גובר על מודל קטלוג/חיפוש. המסמך הזה מרחיב ומקבע את שכבת הריצה |
| `docs/ARCHITECTURE-GROWTH-SEO.md` §1 | שימור דירוגים במעבר, מלאי URL, ניטור 30 יום, JSON-LD מורחב. נשאר בתוקף; המסמך הזה מקבע את שכבת האכיפה והמטא |
| `ARCHITECTURE-WP-MIGRATION.md` / `docs/ARCHITECTURE-WP-DATA-MIGRATION.md` | חילוץ, curation, cutover. M8 (301 ב-proxy) מאושרר כאן |
| `docs/ARCHITECTURE-TESTING-CICD.md` | שער CI. Lighthouse: אזהרה בלילי עד ייצוב (D8/D26). גובר על דרישת "חוסם PR" הישנה ב-PERFORMANCE D-9 |
| `ARCHITECTURE-ANALYTICS-BI.md` §7 | `web_vital`, Speed Insights כן / Web Analytics לא. מאושרר |
| `docs/ARCHITECTURE-SECURITY.md` | CSP / security headers ב-proxy. גובר בכל בקרת אבטחה |

**עקרון על:** רציפות SEO היא הכנסה. האתר הישן מדורג. כל אחוז תנועה
אורגנית שאבד ביום המעבר נקנה אחר כך בכסף. שער השיגור: אפס URL ישן בלי
הכרעה (301 / התאמה חיה / 410 מודע).

---

## 0. תמצית החלטות (TL;DR)

| # | החלטה | ערך |
|---|-------|-----|
| PS-1 | אכיפת 301 | `public.seo_redirects` + lookup ב-`src/proxy.ts` על 404. אסור `vercel.json` redirects ואסור `redirects()` ב-`next.config` |
| PS-2 | מבנה URL קנוני | `/products/[slug]` (רבים), `/category/[slug]`, `/coupons/[slug]`. `/product/[slug]` → 301 קבוע ל-`/products/[slug]` |
| PS-3 | שפה | חד-לשוני עברית. **אין אשכול hreflang**. סיגנלים: `lang=he` `dir=rtl`, `og:locale=he_IL`, JSON-LD `inLanguage: he-IL` |
| PS-4 | Cache | `cacheComponents: true` + PPR. פרופילי `home` / `catalog` / `coupons`. אינבלידציה ב-tags ממוטציות אדמין |
| PS-5 | תמונות | הכל דרך `next/image` (SmartImage). AVIF+WebP. `preload` על LCP hero בלבד. גריד lazy |
| PS-6 | OG | נגזרת סטטית 1200×630 בעת העלאה (מקור אמת לוואטסאפ). `@vercel/og` כנתיב משני עם cache ל-overlay מחיר |
| PS-7 | JSON-LD | Product + Offer (בלי ratings), Organization + WebSite, BreadcrumbList, LocalBusiness כ-seller לדילים. ערכים חסרים = השמטה, לא זיוף |
| PS-8 | RUM | Speed Insights ראשי + `web_vital` first-party בדגימת 25% תחת הסכמה |
| PS-9 | Lighthouse CI | תקציבים מספריים כאן; ב-CI: אזהרה ב-`nightly.yml` עד ייצוב, אחר כך חוסם. לא חוסם PR לפי D8/D26 |
| PS-10 | Redis | לא עכשיו. טריגרים מדידים כמו PERFORMANCE 2.4 |

---

## 1. SEO Migration Safety

### 1.1 מיפוי URL: ישן → חדש

מקור האמת למלאי: `wp_import.url_inventory` (032). שלושה מקורות בסדר הרצה
(GSC 12 חודשים → sitemap Yoast → crawl Screaming Frog), כמפורט ב-
`docs/ARCHITECTURE-GROWTH-SEO.md` §1.1.

טבלת דפוסים קבועים (נטענים ל-`seo_redirects` עם `source='wordpress_import'`):

| דפוס WP ישן | יעד חדש | status |
|---|---|---|
| `/product/<slug-עברי-encoded>/` | `/products/<latin-slug>` | 301 |
| `/product-category/<slug>/` | `/category/<mapped-slug>` | 301 |
| `/shop/` | `/products` | 301 |
| `/cart/`, `/checkout/` | `/cart`, `/checkout` | 301 |
| `/my-account/*` | `/account` (או תת-נתיב ממופה) | 301 |
| `/tag/<x>/`, `/author/<x>/` | קטגוריה קרובה או `/` | 301 |
| מדיה עם קליקים ב-GSC | URL ב-Storage (`product-images/wp/...`) | 301 |
| תוכן בלי יעד ענייני | (ריק) | 410 |
| `/product/:slug` (Next הישן, יחיד) | `/products/:slug` | 301 קבוע |

קובץ curation: `docs/growth/redirects/redirect-map.csv` (פורמט GROWTH §1.2).
שרשראות נקרסות בטעינה (A→B→C הופך ל-A→C). לולאה = כשל טעינה.

### 1.2 אסטרטגיית 301: middleware (proxy) מול vercel.json

**הכרעה סופית (M8 + PS-1): רק `seo_redirects` + `src/proxy.ts`.**

| אפשרות | למה נדחתה / התקבלה |
|---|---|
| `vercel.json` redirects | סטטי, בלי hits, בלי curation runtime, מפצל מקור אמת |
| `next.config` `redirects()` | מחזיר 308 בברירת מחדל, בלי ספירת hits, בלי DB |
| **`proxy.ts` על 404 בלבד** | 301 מדויק, `touch_seo_redirect()` מעדכן hits, מקור אמת אחד, ניתן להוסיף שורות אחרי השקה בלי deploy |

כללי אכיפה ב-proxy (להוסיף ליד session/auth הקיימים):

1. נרמול path: percent-decode, הסרת trailing slash, lower-case ללטיני בלבד.
2. Lookup רק כשה-route handler/App Router מחזיר 404 (או לפני `notFound`),
   לא על כל בקשה מוצלחת (חיסכון latency + DB).
3. תגובה: `301` / `410` לפי `status_code`. כותרת `Cache-Control: public, max-age=86400`
   ל-301 יציבים (source wordpress_import / slug_change).
4. דפוס קבוע `/product/:slug` → `/products/:slug` יכול להיות hard-coded
   ב-proxy לפני ה-DB lookup (תנועה פנימית גבוהה, אפס תלות בטבלה).

**אסור** לערבב מקורות. אם שורה קיימת גם ב-CSV וגם בטבלה, הטבלה גוברת
אחרי טעינה; ה-CSV הוא כלי עבודה בלבד.

### 1.3 sitemap.xml

מימוש: `src/app/sitemap.ts` (App Router MetadataRoute).

| Sitemap לוגי | תוכן | lastModified | changeFrequency / priority (רמז בלבד) |
|---|---|---|---|
| categories | `categories` פעילות (`taxonomy` + `collection`) | `updated_at` | weekly / 0.8 |
| products | `products` עם `status='active'` ו-`deleted_at IS NULL` | `updated_at` | daily / 0.9 |
| coupons | `coupon_deals` פעילים בחלון `valid_from`..`valid_until` | `updated_at` | hourly / 0.7 |
| static | `/`, עמודים משפטיים (תקנון, פרטיות, משלוחים, צור קשר) | git/deploy | monthly / 1.0 בית |

כללים:

1. מעל ~45k URLs: `generateSitemaps()` עם קבצים פר סוג (מגבלת soft של גוגל
   היא 50k / 50MB לקובץ).
2. מוצר `out_of_stock` נשאר ב-sitemap (הדף חי עם Offer OutOfStock).
   `sold_out` / `draft` / soft-deleted: לא נכנסים.
3. אחרי flip: הגשה ידנית ב-GSC של `/sitemap.xml`; הסרת sitemap Yoast הישן
   מרישום GSC (לא מהאתר: הוא כבר לא מוגש).
4. אין URLs עם query (`?page`, `?sort`, פילטרים) ב-sitemap.

### 1.4 robots.txt

מימוש: `src/app/robots.ts`.

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /account
Disallow: /supplier
Disallow: /api
Disallow: /search
Disallow: /auth
Disallow: /checkout
Disallow: /cart
Disallow: /r/
Disallow: /login
Disallow: /signup

Sitemap: https://kenyonexpress.co.il/sitemap.xml
```

נימוק: עגלה/צ'קאאוט/חשבון הם דינמיים + אין ערך אינדוקס; `/search` ממילא
noindex; `/r/` הוא דילול crawl. Host יחיד: apex `kenyonexpress.co.il`
(www → apex ב-Vercel domain settings, לא ב-robots).

### 1.5 Canonical

| מצב | canonical | robots |
|---|---|---|
| `/` | עצמו | index,follow |
| `/category/x` | עצמו | index,follow |
| `/category/x?page=2` | עצמו (כולל page) | index,follow |
| `/category/x?sort=...` | `/category/x` | index,follow |
| `/category/x?f_*=...` | `/category/x` | **noindex,follow** |
| `/products/y` | עצמו | index,follow |
| `/products/y?variant=` | `/products/y` | index,follow |
| `/search?q=` | אין / self | noindex,follow |
| כל URL עם `utm_*` | בלי utm (מוחרג מנרמול) | לפי הדף |

כללים נוספים:

1. `metadataBase` = `https://kenyonexpress.co.il` (כבר ב-root layout).
2. סדר query מנורמל אלפביתית לפני בניית URL (מניעת duplicate variants).
3. מוצר שנמחק: 301 לקטגוריה הראשית (ברירת מחדל) או 410 (החלטת אדמין).
   השורה ב-`seo_redirects` נכתבת במוטציית המחיקה.

### 1.6 שפה ו-hreflang

**אין תגי hreflang.** האתר חד-לשוני על דומיין יחיד. hreflang מיועד
למיפוי בין גרסאות שפה מקבילות; עם גרסה אחת הוא רעש שמייצר שגיאות
ולידציה ב-GSC (הכרעת GROWTH G3 + קטלוג 3.8).

סיגנלי שפה מחייבים בכל דף ציבורי:

1. `<html lang="he" dir="rtl">` (קיים ב-root layout).
2. `og:locale = he_IL`.
3. JSON-LD `WebSite.inLanguage = "he-IL"`.
4. `Content-Language` לא נשלח (deprecated).

אם תקום גרסת שפה שנייה בעתיד: hreflang דו-כיווני + `x-default` לעברית,
ב-`generateMetadata` המשותף, בלי שינוי URLs קיימים. עד אז: אסור להוסיף
`hreflang="he-IL"` עצמי "ליתר ביטחון".

### 1.7 שער cutover SEO (T-0)

צ'קליסט מלא: GROWTH §2.2. חובה לפני DNS flip:

1. `08-verify` ירוק כולל 100% כיסוי `url_inventory` (301→200, בלי שרשראות).
2. דגימת top-10 לפי GSC clicks: curl -IL.
3. הגשת sitemap + robots חי.
4. URL Inspection לבית + 5 קטגוריות ראשיות.
5. שיתוף וואטסאפ אמיתי של דיל (OG).

ירידת SEO ≠ rollback DNS. Rollback רק על כשל תפעולי או כשל redirects
רוחבי >10% שלא נפתר ב-24 שעות (GROWTH G6).

---

## 2. Structured Data (JSON-LD)

### 2.1 עקרונות

1. ייצור ב-Server Components בלבד (`<script type="application/ld+json">`).
2. דאטה מ-DB בלבד. מפתח חסר = השמטה. **אסור לזייף**.
3. **אין `aggregateRating`, אין `review`** (אין מערכת ביקורות; זיוף =
   עבירת Rich Results על כל הדומיין).
4. `@id` יציבים לאיחוד גרפים:
   - `https://kenyonexpress.co.il/#org`
   - `https://kenyonexpress.co.il/#website`
   - `https://kenyonexpress.co.il/products/<slug>#product`
   - `https://kenyonexpress.co.il/suppliers/<id>#business`
5. מחיר ב-Offer = מה שמשולם באתר (`kenyon_price` / `platform_price`).
   `full_price` לא נכנס ל-JSON-LD.
6. טקסט עברי: `name` / `description` מ-`*_he`. ניקוי HTML לפני description
   (קיטום ~300 תווים למוצר).
7. ולידציה: Rich Results על 5 דגימות פר סוג לפני flip; CI מריץ ajv מול
   סכימות מצומצמות על ה-helpers (אזהרה, לא חוסם PR עד ייצוב).

### 2.2 מטריצת ישויות פר סוג דף

| דף | ישויות |
|---|---|
| בית `/` | `Organization` + `WebSite` (+ `SearchAction`) |
| קטגוריה | `BreadcrumbList` + `ItemList` (url בלבד, בלי מחירים כפולים) |
| מוצר פיזי | `BreadcrumbList` + `Product` + `Offer` (seller = Organization) |
| דיל/קופון | `BreadcrumbList` + `Product` + `Offer` + `LocalBusiness` כ-seller |
| ספק (עתידי) | `LocalBusiness` מלא (אותו `@id`) |
| משפטי / חשבון / עגלה | ללא |

### 2.3 תבניות מחייבות

**Organization + WebSite (בית):**

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://kenyonexpress.co.il/#org",
      "name": "קניון EXPRESS",
      "url": "https://kenyonexpress.co.il/",
      "logo": "https://kenyonexpress.co.il/images/logo-600.png",
      "sameAs": ["<facebook>", "<instagram>"]
    },
    {
      "@type": "WebSite",
      "@id": "https://kenyonexpress.co.il/#website",
      "url": "https://kenyonexpress.co.il/",
      "name": "קניון EXPRESS",
      "inLanguage": "he-IL",
      "publisher": { "@id": "https://kenyonexpress.co.il/#org" },
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://kenyonexpress.co.il/search?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    }
  ]
}
```

**Product + Offer (פיזי):**

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://kenyonexpress.co.il/products/<slug>#product",
  "name": "<name_he>",
  "image": ["<og_or_primary>", "<images[1..n]>"],
  "description": "<description_he נקי>",
  "sku": "<sku או מושמט>",
  "brand": { "@type": "Brand", "name": "<brand>" },
  "offers": {
    "@type": "Offer",
    "url": "https://kenyonexpress.co.il/products/<slug>",
    "priceCurrency": "ILS",
    "price": "<kenyon_price>",
    "availability": "https://schema.org/<InStock|LimitedAvailability|OutOfStock|SoldOut>",
    "itemCondition": "https://schema.org/NewCondition",
    "seller": { "@id": "https://kenyonexpress.co.il/#org" }
  }
}
```

מיפוי מלאי → availability: לפי קטלוג §1.5 (`untracked`/`in_stock` → InStock,
`low_stock` → LimitedAvailability, `out_of_stock` → OutOfStock,
`sold_out` → SoldOut).

וריאציות עם מחירים שונים: `AggregateOffer` עם `lowPrice` / `highPrice`
במקום Offer יחיד.

**Offer לקופון:** כמו לעיל + `validFrom` / `priceValidUntil` מ-
`valid_from` / `valid_until`. seller = `LocalBusiness` כשיש ספק עם שם+עיר
מאומתים (לעולם לא מ-meta של WP; כלל C1 באג נהריה). `geo` רק עם lat/lng
אמיתיים מ-`suppliers`.

**BreadcrumbList:** בית → אב (אם יש) → קטגוריה → מוצר (בלי `item` על הרמה
האחרונה). שמות בעברית מ-`name_he`.

### 2.4 כללי תוכן עברי ב-structured data

1. אין לערבב אנגלית ב-`name`/`description` אלא אם זה מותג לטיני (`Samsung`).
2. מחיר כמספר עשרוני במחרוזת JSON (`"99.00"`), לא עם סימן ₪ בתוך השדה.
3. טלפון בפורמט E.164 כשמופיע (`+9725...`).
4. כתובת: `addressCountry: "IL"`, עיר מ-`suppliers.city` בלבד.

---

## 3. Meta System

### 3.1 תבנית `generateMetadata`

דפוס מחייב פר route:

1. Helper משותף `buildPageMetadata({ title, description, canonical, og, robots })`
   ב-`src/lib/seo/metadata.ts` (יישום עתידי).
2. `generateMetadata` קורא **לאותן** פונקציות `use cache` כמו הדף
   (`getProductBySlug` וכו') + `React.cache()` לדדופ בתוך אותו pass.
   אסור שאילתת DB נפרדת ל-metadata.
3. Title template ב-root (להחליף את האנגלית הקיימת):

| שדה | ערך |
|---|---|
| `metadata.title.default` | `קניון EXPRESS: דילים וקופונים במחירים הכי טובים בישראל` |
| `metadata.title.template` | `%s: קניון EXPRESS` |
| מפריד | נקודתיים (לא מקף מיוחד) |

תבניות פר סוג (כש-`seo_title` / `seo_description` ריקים):

| דף | title | description |
|---|---|---|
| בית | default למעלה | תבנית שיווקית קבועה אחת |
| קטגוריה | `{name_he} במבצע` | `description_he` או ריק (גוגל גוזר) |
| קטגוריה עמוד N | `{name_he} עמוד {N}` | כמו קטגוריה |
| מוצר | `{name_he} ב-{price} ש"ח` | 155 תווים ראשונים מ-`description_he` נקי; ריק אם אין |
| קופון | `{title_he}: {discount}% הנחה` | `terms_he` מקוצר |
| חיפוש | `חיפוש: {q}` | noindex |

אורך יעד: title עד ~60 תווים לפני קיצוץ SERP; description עד ~155.
מותג תמיד בסוף דרך ה-template.

### 3.2 Open Graph + Twitter

| תג | כלל |
|---|---|
| `og:type` | `website` בבית/קטגוריה; `product` במוצר/דיל |
| `og:locale` | `he_IL` |
| `og:site_name` | `קניון EXPRESS` |
| `og:title` | כמו title בלי סיומת המותג |
| `og:description` | כולל מחיר בדיל ("רק 99 ש"ח במקום 199") |
| `og:image` | 1200×630, https מוחלט, public, בלי auth redirect |
| `og:image:width` / `:height` | חובה (וואטסאפ מציג בלי להוריד קודם) |
| `twitter:card` | `summary_large_image` |

מגבלת וואטסאפ: תמונה **מתחת ל-300KB**. מעל ~600KB השיתוף נכשל בשקט.
שינוי מהותי בתמונה/מחיר: `?v=<n>` על URL התמונה לשבירת cache וואטסאפ.

### 3.3 אסטרטגיית OG: סטטי ראשי + `@vercel/og` משני

| שכבה | מתי | איך |
|---|---|---|
| **A (מקור אמת)** | העלאת תמונה ראשית / ייבוא WP | נגזרת 1200×630 WebP/JPEG ≤300KB ל-Storage path `.../og.webp`. נשמר ב-`products.og_image_url` (או נגזר מקונבנציית path) |
| **B (אופציונלי)** | צורך ב-overlay מחיר/badge דינמי | Route Handler `GET /api/og/product/[slug]` עם `@vercel/og` (ImageResponse), Edge-compatible רק אם Cache Components מאפשר; אחרת Node. כותרות: `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` |

כללים:

1. `og:image` ב-metadata מצביע קודם ל-A. B מופעל רק כשאין A או כשדגל
   אדמין `use_dynamic_og=true` למוצר.
2. B חייב לעמוד בתקציב 300KB (quality/JPEG). אם הפלט חורג: נפילה חזרה ל-A.
3. אסור להסתמך על B בלבד ביום flip: cold start + כשל Edge = שיתוף שבור.

### 3.4 מצב היום (חוב)

Root layout עדיין עם `default: 'KenyonExpress'` ו-template אנגלי
`%s | KenyonExpress`. זה חוב יישום לפני production (PS-meta-he).

---

## 4. Core Web Vitals

### 4.1 תקציבים (p75, מובייל ישראלי, 4G)

| סוג דף | LCP | INP | CLS | TTFB |
|---|---|---|---|---|
| בית | ≤ 2.0s | ≤ 200ms | ≤ 0.05 | ≤ 300ms |
| קטגוריה / מוצר / קופונים | ≤ 2.2s | ≤ 200ms | ≤ 0.10 | ≤ 300ms |
| עגלה / צ'קאאוט / חשבון | ≤ 2.5s | ≤ 200ms | ≤ 0.10 | ≤ 700ms |
| אדמין / פורטל ספק | ≤ 3.0s | ≤ 250ms | ≤ 0.10 | ≤ 800ms |

תקציבים משלימים לחנות:

| מדד | תקציב |
|---|---|
| JS ראשוני (gzip) לדף חנות | ≤ 200KB |
| משקל בית מעל הקפל (HTML+CSS+JS+LCP image) | ≤ 1MB |
| תמונת hero LCP | ≤ 200KB |
| כרטיס מוצר בגריד | ≤ 40KB |

### 4.2 אסטרטגיית תמונות

```
מקור (Storage / public)
        │
        ▼
   next/image (Vercel Image Optimization)
   formats: AVIF → WebP
   qualities: [60, 75, 90]
   minimumCacheTTL: 2678400 (31 יום)
        │
        ▼
   SmartImage (width/height או fill + מיכל קבוע)
```

| שימוש | sizes | quality | preload? |
|---|---|---|---|
| Hero סלייד פעיל | `(max-width: 1024px) 100vw, 1200px` | 75 | **כן** (רק הוא) |
| שאר סליידי hero | אותו | 75 | לא (lazy) |
| כרטיס גריד | `50vw / 33vw / 25vw` | 60 | לא |
| גלריה ראשית PDP | `(max-width: 768px) 100vw, 600px` | 75 | כן אם מעל הקפל |
| thumbnails | `80px` | 60 | לא |
| אייקון קטגוריה | `80px`–`100px` | 75 | לא |

כללים מחייבים:

1. אפס `<img>` גולמי בכרטיסים/גלריה (היום זה באג הביצועים הגדול בקוד).
2. GIF מונפש אסור ב-hero. המרה ל-`<video muted autoplay loop playsinline>`
   או AVIF סטטי.
3. `preload` (Next 16; מחליף `priority`) רק על אלמנט ה-LCP האמיתי
   (הסלייד הפעיל, לא בהכרח אינדקס 0).
4. Supabase `storage.image_transformation`: כבוי ב-free. נדלק רק אחרי
   פגיעה בתקרת source images של Vercel + מעבר ל-Supabase Pro.
5. שינוי תוכן תמונה = שינוי path/שם קובץ (TTL ארוך). Unsplash יורד
   מ-`remotePatterns` לפני production.
6. `remotePatterns`: `*.supabase.co` בלבד בפרודקשן.

### 4.3 פונטים

מצב קיים (נכון, נשאר):

```ts
Heebo({ variable: '--font-heebo', subsets: ['latin', 'hebrew'], display: 'swap' })
```

כללים:

1. Heebo יחיד דרך `next/font`. אסור פונט שני בחנות.
2. `display: 'swap'` חובה (FOIT אסור).
3. Subset hebrew+latin בלבד (כבר). לא לטעון weights מיותרים: רק מה שבשימוש
   בפועל (לבדוק ב-build; יעד: 400 + 500 + 700 לכל היותר).
4. pretload של קובץ הפונט הראשי מגיע אוטומטית מ-`next/font`. אסור
   `<link>` ידני כפול.

### 4.4 גבולות RSC / Streaming (PPR)

תחת `cacheComponents: true`:

```
[CDN: שלד סטטי של הקטלוג]
        │
        ├── Suspense: Header user island (שם, מונה עגלה)
        ├── Suspense: בלוקים דינמיים (sort/page/filters)
        └── static: hero, גריד עמוד 1, PDP body, JSON-LD, metadata
```

כללים:

1. קריאות קטלוג אנונימיות: קליינט `src/lib/supabase/public.ts` (anon, בלי
   `cookies()`). רק כך מותר `use cache`.
2. קריאות משתמש: `server.ts` + `<Suspense>`.
3. Layouts של `(admin)`, `(account)`, supplier: `children` ב-Suspense.
4. Header: שלד סטטי + client island קטן למצב משתמש/עגלה.
5. `runtime: 'edge'` אסור בכל הפרויקט (לא נתמך עם Cache Components).
6. אסור לחתוך פרמטר `_rsc` או כותרת `rsc` ב-proxy/CDN.

### 4.5 תקציב bundle פר route group

| Route group | מה מותר ב-bundle | מה אסור |
|---|---|---|
| `(store)` / `(main)` | UI חנות, SmartImage, cart drawer קל | `dnd-kit`, טבלאות אדמין, radix כבד, charts |
| `(auth)` | טפסי login/OTP | אדמין, קטלוג מלא |
| cart / checkout | כסף + Cardcom iframe bootstrap | אדמין, חיפוש FTS |
| `(admin)` | tables, forms, dnd | לא משנה (לא נמדד מול תקציב חנות) |
| supplier portal | scanner/PWA קל | אדמין מלא |

אכיפה: `@next/bundle-analyzer` ב-CI אזהרה; assert ב-build שאין
`service_role` ב-`.next/static` (כבר ב-TESTING-CICD). יעד 200KB gzip
ל-JS ראשוני של דף חנות.

### 4.6 מדיניות third-party scripts

| סקריפט | מתי נטען | איך |
|---|---|---|
| Vercel Speed Insights | תמיד (אגרגטיבי, בלי עוגיות PII) | `@vercel/speed-insights` ב-root layout |
| Cardcom Low Profile | רק ב-checkout אחרי beginCheckout | iframe/redirect לדומיין Cardcom; אפס PAN אצלנו |
| Meta Pixel / CAPI | רק אחרי החלטת קמפיין בתשלום + הסכמה | GROWTH §5; עד אז אסור |
| Google Ads tags | לא בדפדפן; offline conversions מהשרת | GROWTH §5.3 |
| GA4 / Vercel Web Analytics | **אסור** | כפילות מול first-party |
| צ'אט / heatmaps / A-B | אסור עד הצדקה מדידה | כל סקריפט חדש = RFC קצר + תקציב INP |

כלל: כל third-party בחנות עובר (א) הסכמה אם עוגיות/מזהים, (ב) טעינה
אחרי hydration או אחרי אינטראקציה, (ג) מדידת INP לפני/אחרי ב-preview.

---

## 5. Caching Layers

### 5.1 פרופילי `cacheLife` (next.config)

```ts
cacheComponents: true,
cacheLife: {
  home:    { stale: 300,  revalidate: 300,  expire: 86400 },
  catalog: { stale: 300,  revalidate: 3600, expire: 86400 },
  coupons: { stale: 300,  revalidate: 300,  expire: 3600 },
}
```

ה-revalidate הזמני הוא רשת ביטחון. האינבלידציה האמיתית היא tags.

### 5.2 שכבות

| שכבה | מה | מי שולט |
|---|---|---|
| 1. Vercel CDN | שלד PPR, `/_next/static` immutable, Image Optimization | `cacheLife` אוטומטי + headers |
| 2. Next Data Cache (`use cache`) | פונקציות `src/server/data/*` | tags + cacheLife |
| 3. Supabase/PostgREST | מקור אמת; בלי cache אפליקטיבי נוסף | אינדקסים 038 |
| 4. Redis | לא עכשיו | טריגרי T-1/T-2/T-3 |

Route Handler יחיד עם CDN ידני: autocomplete
`Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.

Function region: `fra1` (MASTER). CDN גלובלי; קהל ישראלי על edge קרוב;
origin ליד Supabase `eu-central-1`.

### 5.3 פונקציות data + tags

| פונקציה | profile | tags |
|---|---|---|
| `getHomeFeed()` | home | `hero`, `products`, `deals` |
| `getProductBySlug` | catalog | `product:<id>`, `products` |
| `getRelatedProducts` | catalog | `category:<id>`, `products` |
| `getCategoryWithChildren` | catalog | `categories`, `category:<id>` |
| `getCategoryProductsPage1` | catalog | `category:<id>`, `products` |
| `getActiveCouponDeals` | coupons | `coupons` |
| `getCategoryTree` | catalog | `categories` |

לא נכנסים ל-cache: חיפוש, פילטרים, `page>1`, facets דינמיים, עגלה,
צ'קאאוט, חשבון, אדמין, ספק.

### 5.4 אינבלידציה ממוטציות

| אירוע | API | tags |
|---|---|---|
| אדמין CRUD מוצר | `updateTag` (Server Action) | `product:<id>`, `products`, `category:<id>` |
| אדמין קטגוריה | `updateTag` | `categories`, `category:<id>`, `products` |
| אדמין hero | `updateTag` | `hero` |
| אדמין דיל/קופון | `updateTag` | `coupons`, `coupon:<id>` |
| webhook תשלום (מלאי) | `revalidateTag(tag, 'max')` | `product:<id>` |
| `expire_coupons` cron | אין | נספג ב-revalidate 300s של coupons |

Next 16: הפרמטר השני של `revalidateTag` חובה. `updateTag` ב-actions
ל-read-your-writes בפאנל.

### 5.5 CDN headers (סיכום)

| נתיב | Cache-Control (יעד) |
|---|---|
| שלד PPR קטלוג | נגזר מ-cacheLife (s-maxage + SWR) |
| `/_next/static/*` | `public, max-age=31536000, immutable` |
| תמונות optimized | TTL 31 יום (images.minimumCacheTTL) |
| `/api/catalog/autocomplete` | `public, s-maxage=300, stale-while-revalidate=600` |
| `/api/og/*` | `public, s-maxage=3600, stale-while-revalidate=86400` |
| 301 מ-seo_redirects | `public, max-age=86400` |
| cart/checkout/account/admin | `private, no-store` |

---

## 6. Rendering Decision Table

| Route | מצב | revalidate / profile | tags | SEO index | הערות |
|---|---|---|---|---|---|
| `/` | PPR: שלד + `use cache` | home 300s | hero, products, deals | כן | LCP = hero פעיל |
| `/category/[slug]` עמוד 1 נקי | PPR cached | catalog 3600s | category, products | כן | |
| `/category/[slug]?sort\|page\|f_*` | דינמי ב-Suspense | אין | אין | page= כן; f_*= noindex | שלד כותרת נשאר סטטי |
| `/products` | PPR cached | catalog | products | כן | |
| `/products/[slug]` | PPR cached | catalog | product, category | כן | `generateStaticParams`: featured + בית; שאר on-demand. 301 מ-`/product/` |
| `/coupons`, `/coupons/[slug]` | PPR cached | coupons 300s | coupons | כן | חלון קצר בגלל valid_until |
| `/search` | דינמי מלא | אין | אין | noindex | |
| `/cart` | דינמי מלא | אין | אין | noindex + Disallow | |
| `/checkout*` | דינמי מלא | אין | אין | noindex + Disallow | מחיר רק ב-server ב-beginCheckout |
| `/account/*` | דינמי מלא | אין | אין | noindex + Disallow | |
| `/supplier/*` | דינמי מלא | אין | אין | noindex + Disallow | |
| `/admin/*` | דינמי מלא | אין | אין | Disallow | אמת תמיד; bundle מופרד |
| `/r/[code]` | דינמי 302 | אין | אין | noindex + Disallow | |
| `/login`, `/signup`, auth | דינמי | אין | אין | noindex | |
| `/api/*`, webhooks, cron | דינמי | CDN ידני רק ל-autocomplete/og | | Disallow | Node runtime |

`generateStaticParams` תחת Cache Components חייב לפחות פרמטר אחד
(מוצרים featured / מוצגי בית). השאר נבנים on-demand ונכנסים לקאש.

---

## 7. Monitoring

### 7.1 Web Vitals → אנליטיקה

מיישם ANALYTICS §7 + PERFORMANCE D-9:

1. **RUM ראשי:** `@vercel/speed-insights` ב-root layout. מקור האמת ל-p75
   פר route מול תקציבי §4.1. עובד גם בלי הסכמת אנליטיקה.
2. **RUM משני:** `useReportWebVitals` → אירוע `web_vital` אל `/api/a`:
   props: `metric` (LCP/CLS/INP/TTFB/FCP), `value`, `rating`, `route`.
   דגימה 25%. תחת gate הסכמה (`ke_consent`).
3. **עיון:** `v_web_vitals_daily` (view בטיוטת 034) מול תקציבים.
4. חריגת p75 מהתקציב 7 ימים רצופים = משימת ביצועים מעל פיצ'רים.

### 7.2 Lighthouse CI (יישור ל-TESTING-CICD)

| נושא | הכרעה |
|---|---|
| איפה רץ | `nightly.yml` job `lighthouse` (לא ב-`ci.yml` החוסם) |
| URLs | בית, קטגוריה לדוגמה, מוצר לדוגמה על Vercel Preview |
| פרופיל | מובייל |
| תקציבים | מספרי §4.1 (LCP/CLS/INP) + JS ≤200KB + LCP image ≤200KB |
| חומרת כשל | **אזהרה** עד ייצוב baseline (D8/D26). אחרי 2 שבועות ירוקים רצופים בפרודקשן: קידום לחוסם ב-nightly (עדיין לא ב-PR) |
| קובץ תקציב | `.lighthouserc.js` + `budget.json` (יישום עתידי; המספרים כאן הם המקור) |

סתירה ישנה: PERFORMANCE D-9 דרש חסימת PR. **בוטל לטובת D8/D26**
(דקות Actions + יציבות). המספרים נשארים; השער רך יותר עד שיש baseline.

### 7.3 ניטור SEO שוטף (אחרי flip)

| מדד | מקור | סף | פעולה |
|---|---|---|---|
| 404 על path מ-inventory | proxy logs × url_inventory | 0 | הוספת redirect באותו יום |
| קליקים אורגניים (ממוצע 7י) | GSC מול baseline T-7 | עד -20% בשבועיים | מעבר לזה: top-50 queries |
| Soft 404 / Redirect error | GSC Pages | 0 | תיקון באותו שבוע |
| `seo_redirects.hits` | DB | ירידה הדרגתית | עלייה פתאומית = מקור קישור ישן חדש |
| CWV | GSC + Speed Insights | ירוק | §4 / §7.1 |

קצב: יומי בשבוע 1, פעמיים בשבוע עד יום 30, דוח
`docs/growth/baseline/day30-report.md`.

### 7.4 בדיקת עומס לפני אירוע מכירה

k6 מול preview + DB ייעודי (לא dev משותף), שבוע לפני אירוע:

| תרחיש | עומס | סף |
|---|---|---|
| גלישה בית→קטגוריה→מוצר | 300 VU, 20 דק' | TTFB p95 < 800ms, אפס 5xx |
| checkout (Cardcom sandbox) | 10 VU | p95 < 2s, אפס כפילויות תשלום |
| WhatsApp blast על מוצר אחד | 0→100 RPS ב-60ש | CDN hit > 95% |

---

## 8. סדר יישום (בעלי src/ / CI / supabase)

| עדיפות | מה | תלות |
|---|---|---|
| P0 | `cacheComponents` + public supabase client + `use cache` לקטלוג + Suspense layouts + פיצול Header | לפני checkout כבד |
| P0 | `next/image` בכל כרטיס/גלריה + תיקון hero (GIF החוצה, preload על סלייד פעיל) | CWV |
| P0 | title template עברית + `generateMetadata` על בית/קטגוריה/מוצר | לפני אינדוקס |
| P1 | `seo_redirects` lookup ב-proxy + דפוס `/product`→`/products` | לפני flip; תלוי 030 |
| P1 | `sitemap.ts` + `robots.ts` + JSON-LD helpers | לפני flip |
| P1 | מיגרציה 038 (אינדקסים) + RPC `related_products` | PERFORMANCE |
| P1 | Speed Insights + Lighthouse nightly + budgets file | TESTING-CICD |
| P2 | `web_vital` → `/api/a` + `v_web_vitals_daily` | ANALYTICS 033/034 |
| P2 | `@vercel/og` משני (אחרי שכבת OG סטטית חיה) | |
| P2 | k6 לפני אירוע מכירה ראשון | |

---

## 9. חובות ידועים בקוד החי (לידיעת בעלי src/)

1. אפס תצורת caching בריפו; דפים שנוגעים ב-Supabase הם SSR פר בקשה.
2. דף מוצר: עד 5 סיבובי רשת עוקבים (metadata נפרד מהדף).
3. כרטיסים/גלריה: עדיין יש נתיבים עם `<img>` גולמי.
4. Hero: סיכון GIF/`priority` על אינדקס לא-פעיל (תועד ב-PERFORMANCE).
5. `proxy.ts` קיים ל-session/auth/cart cookie, **בלי** seo_redirects עדיין.
6. Title template באנגלית ב-root layout.
7. Route חי: `/product/[slug]` (יחיד) מול יעד קנוני `/products/[slug]`.

---

## 10. Open Questions

1. **הפעלת `cacheComponents: true` עכשיו מול אחרי סגירת cart/checkout UX:**
   PERFORMANCE דורש P0 לפני checkout. האם מאשרים הדלקה מיידית על
   `phase5/homepage` למרות ש-`(store)/product` ו-cart עדיין בתנועה, או
   מחכים ל-branch freeze קצר?

2. **מתי `/product/[slug]` עובר ל-`/products/[slug]`:** לפני איכלוס
   `seo_redirects` מוורדפרס, או באותו PR? ה-trigger ב-030 כותב `/products/`.

3. **OG דינמי (`@vercel/og`) ביום flip:** האם מספיק שכבה A (סטטי) לשיגור,
   ו-B רק אחרי שבוע יציב, או שיש דילים שחייבים overlay מחיר בוואטסאפ מייד?

4. **Lighthouse: אחרי כמה שבועות ירוקים מקדמים מ-warn ל-fail ב-nightly?**
   ברירת מחדל מוצעת: 14 יום רצופים אחרי production flip. לאשר.

5. **משקל Heebo:** האם מקבעים 400/500/700 בלבד עכשיו, או מודדים קודם
   ב-bundle analyzer אחרי P0 תמונות?

6. **GSC Domain property + SSH/DB לאתר הישן:** עדיין חוסם שלב 0 של מסלול W.
   בלי baseline GSC ב-T-7 אין מדידת הצלחת שימור SEO. מי מספק גישה ומתי?

7. **`web_vital` תחת הסכמה מול טלמטריה תפעולית:** ANALYTICS השאיר ייעוץ
   משפטי פתוח. אם ייעוץ יקבע פטור: אפשר לאסוף ב-100% בלי gate. עד אז נשארים
   שמרנים (25% + consent).

8. **עמודי תוכן משפטיים ב-sitemap:** האם נכנסים ל-static sitemap ב-T-0
   (חובה חוקית מינימלית לפני flip לפי WP migration) או רק אחרי ניסוח סופי?

---

## 11. סיכום הכרעות חדשות במסמך זה

| # | הכרעה |
|---|---|
| PS-1 | 301 רק דרך `seo_redirects` + proxy; לא vercel.json / next.config redirects |
| PS-2 | URL קנוני `/products/` רבים; 301 קבוע מ-`/product/` |
| PS-3 | אין hreflang; סיגנלי `he` / `he_IL` / `he-IL` בלבד |
| PS-4 | Cache Components + PPR + tags; Redis לא עכשיו |
| PS-5 | next/image + preload LCP + תקציבי CWV מספריים |
| PS-6 | OG סטטי ראשי; `@vercel/og` משני עם SWR |
| PS-7 | JSON-LD בלי ratings; LocalBusiness לדילים מנתוני ספק מאומתים |
| PS-8 | Speed Insights + web_vital 25% תחת הסכמה |
| PS-9 | Lighthouse budgets כאן; CI = nightly warn עד ייצוב (D8/D26 גובר) |
| PS-10 | טבלת רינדור מלאה לכל route group כולל supplier/admin |
| PS-11 | Third-party: Cardcom ב-checkout, Speed Insights תמיד; Pixel/GA אסורים עד טריגר |
| PS-12 | Title template עברית עם מפריד נקודתיים לפני production |
