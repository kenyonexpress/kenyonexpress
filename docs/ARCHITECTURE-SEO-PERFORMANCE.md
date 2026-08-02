# ARCHITECTURE: SEO + Performance

ארכיטקטורת SEO וביצועים לחנות KenyonExpress (Next.js App Router).

Status: **BINDING** · Updated: 2026-08-02  
Scope: docs only.

Companions:

```
docs/ARCHITECTURE-SEO.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-GROWTH-SEO.md
docs/ARCHITECTURE-PERFORMANCE.md
```

Stack: Next.js App Router, RSC, Meilisearch, R2/images, עברית RTL, Heebo, מותג `#fed700` / ink `#333e48`.

עקרון: **Web = ערוץ רכישה SEO.** אפליקציה לא מחליפה אינדוקס.

---

## 0. יעדי Lighthouse + Core Web Vitals

| מדד | יעד |
|---|---|
| LCP (mobile, דפי מפתח) | ≤ **2.5s** |
| CLS | ≤ **0.1** |
| INP | ≤ **200ms** |
| TTFB (p75, catalog ציבורי) | ≤ **800ms** |
| Lighthouse Performance (home / PDP) | ≥ **90** (או חריג מתועד ב-Go-Live) |
| Lighthouse Accessibility | ≥ **90** |
| Lighthouse CI | home + coupon PDP + category |
| רגרסיית Perf ב-PR | נכשל אם יורד **> 5 נקודות** מול baseline בלי הצדקה |
| דפים אינדקסביליים | home, category, product, content |

שערי מדידה:

| כלי | שימוש |
|---|---|
| Lighthouse CI | PR על home + product + category |
| `compare.mjs` / `refs/` | רגרסיה ויזואלית |
| Search Console | אחרי DNS / cutover |
| Web Vitals RUM | אופציונלי אחרי GA |

---

## 1. אסטרטגיית ISR / cache

### 1.1 מטריצה מחייבת

| Page | Mode | `revalidate` | Tags |
|---|---|---|---|
| `/` | ISR | **120s** | `home` |
| `/category/[slug]` | ISR | **300s** | `category:{id}`, `catalog` |
| `/product/[slug]` | ISR | **120s** | `product:{id}`, `catalog` |
| `/products` (או קטלוג מקביל) | ISR | **180s** | `catalog` |
| `/cart`, `/checkout*`, `/account/**` | dynamic private | `no-store` | לעולם לא HTML ב-CDN |
| `/search` | dynamic | SWR קצר | **noindex** |
| `/sitemap.xml` | ISR | **3600s** | `sitemap` |

On-demand אחרי publish/unpublish באדמין:

```
revalidateTag('product:{id}')
revalidateTag('category:{id}')
revalidateTag('catalog')
revalidateTag('sitemap')
revalidateTag('home')  // אם הבית מציג את המוצר
```

יעד: PDP מתעדכן תוך ~דקה (בדיקה S6).

### 1.2 כללי cache

1. Catalog ציבורי: RSC + cache tags; לא `adminClient` בנתיב רנדור בלי צורך.
2. Account/checkout: cookies + private; `no-store`.
3. Meilisearch לחיפוש; לא לגרור את כל הקטלוג לדפדפן.
4. Invalidation לפי tag, לא "purge הכל" כברירת מחדל.

הערה: מסמכי performance ישנים עם 300s/3600s על home/PDP **נדחים** מול המטריצה הזו כשיש סתירה.

---

## 2. JSON-LD schemas

הזרקה ב-RSC body:

```html
<script type="application/ld+json">…</script>
```

לא דרך Metadata API. Helpers יעד:

```
src/lib/seo/*
```

### 2.1 לפי דף

| דף | Types |
|---|---|
| Home | `Organization` + `WebSite` (+ `SearchAction` אם יש `/search`) |
| Category | `BreadcrumbList` + `ItemList` (URLs בלבד, בלי מחירים מזויפים ברשימה) |
| Product / coupon PDP | `BreadcrumbList` + `Product` + `Offer` |
| Coupon deal (אופציונלי) | `Offer.seller` = `LocalBusiness` רק עם geo מאומת מספק |

### 2.2 חוזה מחיר ב-Offer

| שדה | ערך |
|---|---|
| `price` | מה שהלקוח משלם **באתר** (`coupon_price` / kenyon on-site), לא מחירון מלא |
| `priceCurrency` | `ILS` |
| `availability` | לפי מלאי/סטטוס אמיתי |
| `inLanguage` (WebSite) | `he-IL` |

אסור:

- `aggregateRating` / `review` מזויפים
- לשים `full_price` / מחירון כ-`Offer.price` כשהלקוח משלם מחיר קופון
- JSON-LD באנגלית כברירת מחדל לתוכן עברי

### 2.3 דוגמה (קופון)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "ארוחה זוגית",
  "inLanguage": "he-IL",
  "offers": {
    "@type": "Offer",
    "price": "50.00",
    "priceCurrency": "ILS",
    "availability": "https://schema.org/InStock",
    "url": "https://kenyonexpress.co.il/product/…"
  }
}
```

`price` כאן = תשלום באתר (agorot/100), לא face.

---

## 3. Hebrew metadata

### 3.1 Root / locale

| מפתח | ערך |
|---|---|
| `<html lang>` | `he` |
| `dir` | `rtl` (ב-HTML, לא אחרי paint ב-JS) |
| `og:locale` | `he_IL` |
| BCP47 | `he-IL` |
| שם אתר | `קניון אקספרס` |
| Title template | `%s \| קניון אקספרס` (או `: קניון אקספרס` לפי סגנון נעול ב-SEO.md) |

פונט: Heebo דרך `next/font`, `display: swap`, subset.

### 3.2 כל דף ציבורי

| שדה | כלל |
|---|---|
| `title` | ייחודי בעברית; ~עד 60 תווים; מותג בסוף |
| `description` | 140 עד 160 תווים בעברית; מחיר/ערך תואם קופה (`coupon_price`) |
| `alternates.canonical` | URL אבסולוטי על דומיין הפרוד |
| Open Graph / Twitter | תמונה אמיתית של מוצר/קטגוריה; כותרת בעברית |
| `robots` | `noindex` על `/account/**`, `/checkout/**`, `/admin/**`, `/supplier/**`, APIs, חיפוש |

### 3.3 תבניות תוכן (מחייב כיוון)

| ישות | Title (דוגמה) |
|---|---|
| Home | קניון אקספרס \| קופונים ומבצעים |
| Category | `{name_he} \| קניון אקספרס` |
| Product / coupon | `{name_he} ב-{price} ש"ח \| קניון אקספרס` |
| Overrides | `seo_title`, `seo_description` אם קיימים ב-DB |

שדות תוכן קטלוג: `*_he`.  
Slugs: לטיניים יציבים (לא URL עברי כברירת מחדל).  
אין hreflang (שפה יחידה).

### 3.4 robots / sitemap

```
/robots.txt  → Allow / ; Disallow account, checkout, admin, supplier
/sitemap.xml → products + categories + static (chunked אם >50k)
```

`lastmod` מ-`updated_at`.  
רענון sitemap אחרי publish (tag `sitemap`, revalidate 3600s).

### 3.5 תוכן on-page

- H1 יחיד בעברית
- `alt` לתמונות בעברית תיאורית
- טקסט קטגוריה קצר מעל/מתחת לגריד (לא חוסם LCP)
- בלי ספאם מילות מפתח במקום תיאור אמיתי

---

## 4. ביצועים (תקציבים תפעוליים)

### 4.1 LCP

- תמונת hero אחת עם `priority` / preload; השאר lazy
- Heebo לא חוסם render
- אין third-party כבד ב-home לפני idle/consent
- Cardcom רק ב-checkout

### 4.2 CLS

- מימדי תמונה שמורים (כרטיסי מוצר לפי מדידות Electro / refs)
- בלי badges שמוזרקים מאוחר על ה-hero

### 4.3 INP

- מינימום client components ב-first paint
- Zustand cart קטן; לא לגרור checkout ל-home
- אנליטיקה אחרי idle + consent

### 4.4 Images / R2

- `remotePatterns` רק ל-hosts מאושרים (R2 / Supabase storage)
- AVIF/WebP; לא לשלוח מקור 4000px לכרטיס מובייל
- PDP: תמונה ראשית priority מעל הקיפול; גלריה lazy

---

## 5. הפניות WP

טבלת מיפוי (ממסמך מיגרציית WP) מניעה 301:

```
/product-category/... → /category/...
/product/...          → /product/...
```

מפה שבורה = soft-404. מעקב ב-Search Console אחרי cutover.

---

## 6. אנטי-דפוסים אסורים

1. מחיר ב-meta/JSON-LD שלא תואם את מה שמשלמים באתר
2. Index ל-URLs עם session/cart params
3. Eager לכל סליידר הבית (רק slide פעיל ל-LCP)
4. Make/Zapier ל-sitemap
5. `dir=rtl` רק אחרי hydration

---

## 7. מפת קבצים (יעד)

```
src/app/sitemap.ts
src/app/robots.ts
src/app/**/product/[slug]/page.tsx   metadata + JSON-LD
src/app/layout.tsx                   lang/dir + fonts
src/lib/seo/*
next.config.ts                       images remotePatterns
```

---

## 8. טסטים

| # | בדיקה |
|---|---|
| S1 | canonical + title עברי על PDP |
| S2 | noindex על `/account` |
| S3 | JSON-LD `Offer.price` = מחיר קופון באתר |
| S4 | Lighthouse perf ≥ 90 / a11y ≥ 90 על preview |
| S5 | compare.mjs home/product תחת סף |
| S6 | `revalidateTag` אחרי publish מעדכן PDP תוך דקה |
| S7 | robots Disallow ל-checkout/admin/supplier |
| S8 | `<html lang="he" dir="rtl">` בלי flash LTR |

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Binding ב-`ke-arch` + rev B: ISR matrix, CWV, R2, WP redirects |
| 2026-08-02 | הועתק/עודכן ל-repo: Lighthouse targets, ISR, JSON-LD, Hebrew metadata כחוזה מחייב |
