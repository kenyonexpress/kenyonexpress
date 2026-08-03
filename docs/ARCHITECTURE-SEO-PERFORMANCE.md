# ARCHITECTURE: SEO + Performance

ארכיטקטורת SEO וביצועים לחנות KenyonExpress (Next.js App Router).

Status: **BINDING** · Updated: 2026-08-03 (rev C)  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

עמודי תווך במסמך זה: **ISR**, **sitemap דינמי**, **schema.org בעברית RTL**, **Core Web Vitals**.

Companions:

```
docs/ARCHITECTURE-SEO.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-GROWTH-SEO.md
docs/ARCHITECTURE-PERFORMANCE.md
docs/ARCHITECTURE-MOBILE-APP.md
```

Stack: Next.js App Router, RSC, Meilisearch, R2/`next/image`, עברית RTL, Heebo (`next/font`), מותג `#fed700` / ink `#333e48`.

יישום ייחוס (קוד חי מחוץ לסקופ המסמך):

```
feat/seo-performance
src/lib/seo/json-ld.ts
src/app/sitemap.ts
src/app/robots.ts
src/app/layout.tsx
```

עקרון: **Web = ערוץ רכישה + SEO.** האפליקציה הנייטיבית לא מחליפה אינדוקס.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| SEO1 | יעד Lighthouse Performance / Accessibility / SEO ≥ **90** על home + PDP קופון + category (mobile). |
| SEO2 | Metadata ו-JSON-LD נגזרים מאותם ערכים שהעמוד מציג ושהקופה גובה. אין מחיר שני. |
| SEO3 | קופון ב-`Offer.price`: שולם באתר (`coupon_price` / `paidOnlineIls`). לא מחירון כ-Offer יחיד. |
| SEO4 | Catalog ציבורי יציב: **ISR**. דפים עם `searchParams` משתנים: dynamic. Account/checkout: `no-store`. |
| SEO5 | **Sitemap דינמי** מ-DB (`sitemap.ts`), לא קובץ סטטי ידני ולא Make/Zapier. |
| SEO6 | schema.org למוצרים בעברית RTL: `inLanguage: he-IL`, שמות/תיאורים מ-`*_he`, `lang="he"` `dir="rtl"` ב-HTML. |
| SEO7 | `noindex` + robots Disallow על account/checkout/admin/supplier/coupon/redeem/api. |

---

## 1. יעד Lighthouse 90+

### 1.1 תקציבים (mobile, דפי מפתח)

| מדד | יעד | אכיפה |
|---|---|---|
| Performance | ≥ **90** | CI על PR; רגרסיה > 5 נקודות בלי הצדקה = כשל |
| Accessibility | ≥ **90** | CI |
| Best Practices | ≥ 90 | אזהרה ב-PR |
| SEO (קטגוריית LH) | ≥ **90** | canonical, title, robots |
| LCP | ≤ 2.5s | hero/PDP `priority` יחיד; Heebo `display: swap` |
| CLS | ≤ 0.1 | מימדי תמונה שמורים; בלי badges מאוחרים על hero |
| INP | ≤ 200ms | מינימום client ב-first paint; analytics אחרי idle/consent |
| TTFB p75 (catalog) | ≤ 800ms | ISR/CDN על home + PDP |

חריג Go-Live מותר רק אם מתועד ב-checklist עם בעלים ותאריך תיקון.

### 1.2 משטחי מדידה

| עמוד | Lighthouse CI |
|---|---|
| `/` | כן |
| `/product/{slug}` (קופון מייצג) | כן |
| `/category/{slug}` | כן (או מדגם) |
| `/checkout` | לא (dynamic, noindex; smoke בלבד) |

כלים: Lighthouse CI, `pnpm lighthouse:smoke`, `.lighthouserc.cjs`, `compare.mjs` מול `refs/`, Search Console אחרי DNS.

### 1.3 אסטרטגיה להגעה ל-90+

| שכבה | פעולה |
|---|---|
| Fonts | Heebo מ-`next/font`, subsets `latin`+`hebrew`, `display: swap`; בלי Google Fonts חוסם |
| Images | R2 + `next/image`; רוחב מובייל; רק LCP image עם `priority` |
| JS | בלי Cardcom / analytics כבדים ב-bundle הבית; dynamic import אחרי אינטראקציה/consent |
| CSS | איחוד chunks חוסמים ב-home; בלי החלפת `dir` ב-JS אחרי paint |
| HTML | ISR על home/PDP (`revalidate = 120`) |
| Third-party | defer / אחרי idle; לא ב-critical path |
| RTL | `dir="rtl"` ב-HTML הראשוני מהשרת |

### 1.4 אנטי-דפוסים ששוברים את הציון

1. שלושה CSS chunks חוסמים ב-home  
2. Eager על כל סליידר ה-hero (רק slide פעיל ל-LCP)  
3. Cardcom / אנליטיקה ב-bundle של הבית  
4. תמונות 4000px לכרטיסי מובייל  
5. החלפת `dir` ב-JS אחרי paint  
6. מחיר ב-meta/JSON-LD שלא תואם קופה  

---

## 2. ISR / cache

### 2.1 מטריצה מחייבת

| Page | Mode | `revalidate` | Tags / הערות |
|---|---|---|---|
| `/` | ISR | **120s** | `home` |
| `/product/[slug]` | ISR | **120s** | `product:{id}`, `catalog`; `generateStaticParams` עד ~500 slugs פעילים |
| `/products` | ISR או dynamic | **180s** אם בלי filters; filters ב-query → dynamic | `catalog` |
| `/category/[slug]` | **force-dynamic** כשיש `searchParams` | data cache נפרד | `category:{id}`, `catalog` |
| `/search` | dynamic | SWR קצר | **noindex** |
| `/cart`, `/checkout*`, `/account/**`, `/admin/**`, `/supplier/**` | dynamic private | `no-store` | לעולם לא HTML ב-CDN |
| `/sitemap.xml` | ISR | **3600s** | `sitemap` |
| `/coupon/[id]`, `/redeem/**` | dynamic | | noindex; לא ב-sitemap |

הערה: מסמכי performance ישנים עם 300s/3600s על home/PDP **נדחים** מול המטריצה הזו כשיש סתירה.

### 2.2 On-demand revalidation

אחרי publish / unpublish / שינוי מחיר מהותי באדמין:

```
revalidateTag('product:{id}')
revalidateTag('category:{id}')
revalidateTag('catalog')
revalidateTag('sitemap')
revalidateTag('home')
revalidatePath('/product/{slug}')
```

יעד: PDP מתעדכן תוך ~דקה אחרי publish.

### 2.3 כללי cache

1. Catalog ציבורי: RSC + tags; `createPublicClient` (לא service role בדפדפן).  
2. Account/checkout: cookies + private; `no-store`.  
3. Meilisearch לחיפוש; לא לגרור את כל הקטלוג לדפדפן.  
4. Invalidation לפי tag, לא purge גלובלי כברירת מחדל.  
5. אם העמוד תלוי ב-`searchParams` משתנים → לא ISR של דף שלם.

---

## 3. Sitemap דינמי

### 3.1 חוזה

קובץ יעד:

```
src/app/sitemap.ts
```

| כלל | פירוט |
|---|---|
| מקור | שאילתת DB / public client למוצרים פעילים + קטגוריות + דפים סטטיים |
| פלט | `MetadataRoute.Sitemap` (Next מייצר `/sitemap.xml`) |
| `lastmod` | מ-`updated_at` של הישות |
| `revalidate` | 3600 + `revalidateTag('sitemap')` אחרי publish |
| Chunking | אם >50k URLs: sitemap index / מספר קבצים לפי מגבלת Google |
| אסור ב-sitemap | `/account/**`, `/checkout/**`, `/coupon/**`, `/redeem/**`, `/admin/**`, `/supplier/**`, `/api/**`, URLs עם session/cart params |

ערכים מינימליים:

```text
/
/products   (או מקבילים ציבוריים)
/coupons    (אם קיים כנתיב ציבורי)
/category/{slug}  × active categories
/product/{slug}   × active sellable products
```

### 3.2 robots

```
src/app/robots.ts
```

```text
Allow: /
Disallow: /account/ /checkout /cart /admin/ /supplier/
Disallow: /coupon/ /redeem/ /scan /auth/ /api/
Disallow: /reset-password /forgot-password
Sitemap: https://kenyonexpress.co.il/sitemap.xml
```

אין יצירת sitemap ב-Make/Zapier. אין קובץ XML ידני כמקור אמת אחרי cutover.

### 3.3 הפניות WP

301 לפי מפת מיגרציה:

```
/product-category/... → /category/...
/product/...          → /product/...
```

מפה שבורה = soft-404. מעקב ב-Search Console אחרי cutover.

---

## 4. schema.org למוצרים (עברית RTL)

### 4.1 הזרקה

ב-RSC body, לא דרך Metadata API בלבד:

```html
<script type="application/ld+json">…</script>
```

Helpers:

```
src/lib/seo/json-ld.ts
```

בריחת `<` → `\u003c` ב-serialization.

### 4.2 לפי דף

| דף | Types |
|---|---|
| Home | `Organization` + `WebSite` (+ `SearchAction` אם `/search` חי) |
| Category | `BreadcrumbList` + `ItemList` (URLs בלבד; בלי מחירים מזויפים ברשימה) |
| Product / coupon PDP | `BreadcrumbList` + `Product` + `Offer` |

### 4.3 חוזה Product / Offer בעברית

| שדה | ערך |
|---|---|
| `name` | `name_he` (או `seo_title` אם קיים לתצוגה עקבית) |
| `description` | תיאור עברי אמיתי מהמוצר |
| `inLanguage` | `he-IL` |
| `url` | `https://kenyonexpress.co.il/product/{slug}` |
| `image` | URLs אמיתיים מ-R2 |
| `brand` | שם הספק בעברית (לא שם הפלטפורמה כברירת מחדל) |
| `offers.@type` | `Offer` |
| `offers.price` | מה שהלקוח משלם **באתר** (agorot/100), מחרוזת/מספר עשרוני במטבע. לקופון: `coupon_price` בלבד (לא face מלא) |
| `offers.priceCurrency` | `ILS` |
| `offers.availability` | לפי מלאי/סטטוס אמיתי (`InStock` / `OutOfStock`) |
| HTML page | `lang="he"` + `dir="rtl"` על המסמך; JSON-LD עם `inLanguage: he-IL` תואם לתצוגה |
| `offers.url` | אותו URL מוצר |

קופון:

- `price` = `coupon_price` / `paidOnlineIls`  
- מותר `highPrice` = מחירון אם גבוה יותר (לא כ-Offer יחיד מטעה)  
- לא sellable: בלי `price: 0`; `OutOfStock`  

פיזי: `price` = מחיר האתר המלא.

### 4.4 דוגמה (קופון)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "ארוחה זוגית",
  "description": "ארוחה זוגית בבית העסק, כולל שתייה.",
  "inLanguage": "he-IL",
  "url": "https://kenyonexpress.co.il/product/zugit-example",
  "image": ["https://cdn.example/products/zugit.jpg"],
  "brand": { "@type": "Brand", "name": "שם בית העסק" },
  "offers": {
    "@type": "Offer",
    "price": "50.00",
    "priceCurrency": "ILS",
    "availability": "https://schema.org/InStock",
    "url": "https://kenyonexpress.co.il/product/zugit-example"
  }
}
```

### 4.5 אסור ב-JSON-LD

- `aggregateRating` / `review` מזויפים  
- מחירון כ-`Offer.price` כשהלקוח משלם מחיר קופון  
- JSON-LD באנגלית כברירת מחדל לתוכן עברי  
- `qr_payload`, קודי שובר, קישורי `/coupon/{id}`  
- מחיר באגורות כמספר שלם בלי המרה ליחידות ILS  

### 4.6 RTL בדף עצמו (לא רק ב-schema)

| מפתח | ערך |
|---|---|
| `<html lang>` | `he` |
| `dir` | `rtl` ב-HTML מהשרת (לא אחרי hydration) |
| `og:locale` | `he_IL` |
| Title template | `%s \| קניון אקספרס` |
| H1 | יחיד בעברית |
| `alt` | עברית תיאורית |

אין hreflang (שפה יחידה). Slugs לטיניים יציבים.

---

## 5. Hebrew metadata

### 5.1 Root

| שדה | חוזה |
|---|---|
| title.default | `קניון אקספרס \| קופונים ומבצעים` |
| description | עברית, ערך אמיתי, בלי הבטחת אחוז קבוע |
| `metadataBase` | `NEXT_PUBLIC_APP_URL` או `https://kenyonexpress.co.il` |
| openGraph.siteName | `קניון אקספרס` |
| twitter.card | `summary_large_image` |

### 5.2 לפי דף

| דף | Title (דוגמה) | robots |
|---|---|---|
| Home | קניון אקספרס \| קופונים ומבצעים | index |
| Category | `{name_he} \| קניון אקספרס` | index |
| Product | `{name_he} ב-{price} ש"ח \| קניון אקספרס` | index |
| Search | לפי הצורך | **noindex** |
| Account / Checkout / Admin | עברית תפעולית | **noindex** |

Overrides מ-DB: `seo_title`, `seo_description` אם קיימים.  
Canonical: URL אבסולוטי על דומיין הפרוד, בלי query של מיון/עמוד כקנוני לתוכן זהה.

---

## 6. Core Web Vitals (מחייב)

שלושת מדדי השדה של Google. יעדי lab (Lighthouse) ו-field (CrUX / RUM) זהים בספיים למטה. חריגה מתועדת רק ב-Go-Live checklist.

### 6.1 תקציבים

| Vital | יעד (mobile, p75) | איך נמדוד | פעולות מחייבות |
|---|---|---|---|
| **LCP** | ≤ 2.5s | LH CI + CrUX אחרי DNS | תמונת LCP יחידה עם `priority`; Heebo `next/font` + `display: swap`; ISR HTML על home/PDP |
| **CLS** | ≤ 0.1 | LH CI + CrUX | width/height או aspect-ratio על תמונות כרטיס/hero; בלי badges/fonts שדוחפים layout אחרי paint |
| **INP** | ≤ 200ms | CrUX / RUM (lab: TBT כפרוקסי חלש) | מינימום client ב-first paint; cart קטן; analytics/consent אחרי idle; בלי Cardcom ב-home |

TTFB (לא CWV רשמי אבל חוסם LCP): catalog ציבורי p75 ≤ 800ms דרך ISR/CDN.

### 6.2 מיפוי דף → סיכון

| דף | סיכון עיקרי | הקלה |
|---|---|---|
| Home | LCP מסליידר / CSS חוסם | slide פעיל בלבד ל-LCP; איחוד CSS |
| PDP | LCP מתמונה + CLS מגלריה | `priority` על ראשית; lazy לגלריה; מימדים שמורים |
| Category | INP מפילטרים + TTFB מ-filters | force-dynamic לדף; cache לנתונים; hydrate מאוחר לפילטרים |

### 6.3 RUM / שערים

| כלי | שימוש |
|---|---|
| Lighthouse CI | PR: home + coupon PDP + category (lab) |
| CrUX / Search Console | אחרי DNS: field LCP/CLS/INP |
| Web Vitals RUM | אופציונלי אחרי consent; דיווח ל-Sentry/analytics |
| `compare.mjs` | רגרסיה ויזואלית (לא מחליף CWV) |

כשל PR: ירידת Performance > 5 נקודות מול baseline בלי הצדקה, או LCP/CLS מחוץ ליעד על דף המדגם.

### 6.4 Images / R2 (תמיכה ב-LCP/CLS)

- `remotePatterns` רק ל-hosts מאושרים  
- AVIF/WebP; לא מקור 4000px לכרטיס מובייל  
- PDP: תמונה ראשית priority מעל הקיפול; גלריה lazy  
- Cardcom רק ב-checkout (לא ב-critical path של catalog)

---

## 7. מפת קבצים (יעד)

```
src/app/sitemap.ts
src/app/robots.ts
src/app/**/product/[slug]/page.tsx
src/app/**/category/[slug]/page.tsx
src/app/layout.tsx
src/lib/seo/json-ld.ts
src/lib/seo/*
next.config.ts
.lighthouserc.cjs
```

---

## 8. טסטים

| # | בדיקה |
|---|---|
| S1 | canonical + title עברי על PDP |
| S2 | noindex על `/account` ו-Disallow ל-`/coupon/` |
| S3 | JSON-LD `Offer.price` = מחיר קופון באתר; לא zero |
| S4 | Home: Organization + WebSite (+ SearchAction אם קיים) |
| S5 | Lighthouse perf/a11y/SEO ≥ 90 על preview (home + PDP + category) |
| S6 | `revalidate = 120` על home/PDP; category עם filters נשאר dynamic |
| S7 | sitemap דינמי בלי account/redeem; robots מצביע ל-sitemap |
| S8 | `<html lang="he" dir="rtl">` בלי flash LTR |
| S9 | invalidation אחרי publish מעדכן PDP + sitemap tag |

---

## 9. אנטי-דפוסים אסורים

1. מחיר ב-meta/JSON-LD שלא תואם את מה שמשלמים באתר  
2. ISR על דף עם `searchParams` משתנים  
3. Index ל-URLs עם session/cart params  
4. Make/Zapier ל-sitemap  
5. `dir=rtl` רק אחרי hydration  
6. Metadata באנגלית כברירת מחדל ללקוח ישראלי  

---

## 10. Related

```
docs/ARCHITECTURE-SEO.md
docs/ARCHITECTURE-PERFORMANCE.md
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-WP-DATA-MIGRATION.md
```

---

## 11. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Binding + ISR matrix ראשוני |
| 2026-08-02 | Lighthouse targets, JSON-LD, Hebrew metadata |
| 2026-08-03 | Lighthouse 90+ strategy, ISR מחייבת, sitemap דינמי, schema.org מוצרים בעברית RTL; docs-only ב-`ke-arch` |
| 2026-08-03 | rev B: סעיף Core Web Vitals מחייב (LCP/CLS/INP, מיפוי דפים, RUM/שערים) |
| 2026-08-03 | rev C: נעילת עמודי תווך ISR + sitemap + schema.org RTL + CWV; מחיר Offer = on-site בלבד |
