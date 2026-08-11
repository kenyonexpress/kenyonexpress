# ARCHITECTURE: SEO + Performance

ארכיטקטורת SEO וביצועים ל-KenyonExpress (Next.js App Router).

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-MARKETING.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-MOBILE-APP.md
docs/LAUNCH-DAY.md
```

Stack: Next.js App Router, RSC, `next/font` (Heebo + hebrew), R2 images, Meilisearch, RTL `lang="he" dir="rtl"`.  
יישום ייחוס:

```
feat/seo-performance
```

קבצים מרכזיים:

```
src/lib/seo/json-ld.ts
src/app/sitemap.ts
src/app/robots.ts
src/app/layout.tsx
src/app/(store)/page.tsx
src/app/(store)/product/[slug]/page.tsx
src/app/(store)/category/[slug]/page.tsx
```

עקרון: **Web = ערוץ SEO ורכישה.** האפליקציה הנייטיבית לא מחליפה אינדוקס.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| SEO1 | Metadata ו-JSON-LD נגזרים מאותם ערכים שהעמוד מציג ושהקופה גובה. אין חישוב מחיר שני. |
| SEO2 | קופון ב-Offer: `price` = שולם באתר (`paidOnlineIls` / `coupon_price`). לא מחירון כ-Offer יחיד. |
| SEO3 | עמודים עם `searchParams` משתנים (קטגוריה מסוננת, חיפוש) = dynamic; לא ISR HTML אחד. |
| SEO4 | `noindex` + `robots.txt` Disallow על account/checkout/admin/supplier/coupon/redeem. |
| SEO5 | עברית בכל metadata ציבורי; `locale: he_IL`; `inLanguage: he-IL` ב-JSON-LD. |
| SEO6 | יעד Lighthouse Performance / Accessibility / SEO ≥ **90** על home + PDP קופון + category (mobile). |

---

## 1. Lighthouse 90+ strategy

### 1.1 תקציבים (mobile, מפתח)

| מדד | יעד | אכיפה |
|---|---|---|
| Performance | ≥ 90 | CI על PR; רגרסיה > 5 נקודות בלי הצדקה = כשל |
| Accessibility | ≥ 90 | CI |
| Best Practices | ≥ 90 | אזהרה ב-PR |
| SEO (LH category) | ≥ 90 | canonical, title, robots |
| LCP | ≤ 2.5s | hero/PDP `priority` יחיד; Heebo `next/font` + `display: swap` |
| CLS | ≤ 0.1 | מימדי תמונה שמורים; בלי badges מאוחרים על ה-hero |
| INP | ≤ 200ms | מינימום client ב-first paint; analytics אחרי idle/consent |
| TTFB p75 (catalog) | ≤ 800ms | ISR/CDN על home + PDP |

### 1.2 משטחי מדידה חובה

| עמוד | CI |
|---|---|
| `/` | כן |
| `/product/{slug}` (קופון מייצג) | כן |
| `/category/{slug}` | כן (או מדגם) |
| `/checkout` | לא (dynamic, noindex; smoke בלבד) |

### 1.3 אסטרטגיה להגעה ל-90+

| שכבה | פעולה |
|---|---|
| Fonts | Heebo מ-`next/font`, subsets `latin`+`hebrew`, `display: swap`; בלי Google Fonts חוסם |
| Images | R2 + `next/image`; רוחב מתאים למובייל; רק LCP image עם `priority` |
| JS | בלי Cardcom / analytics ב-bundle של הבית; dynamic import אחרי אינטראקציה/consent |
| CSS | איחוד chunks חוסמים ב-home; בלי החלפת `dir` ב-JS אחרי paint |
| HTML | ISR על home/PDP (`revalidate = 120`); category עם filters נשאר dynamic |
| Third-party | defer / partytown / אחרי idle; לא ב-critical path |
| RTL | `dir="rtl"` ב-HTML הראשוני מהשרת |

### 1.4 אנטי-דפוסים ששוברים Lighthouse

1. שלושה CSS chunks חוסמים ב-home
2. Eager על כל סליידר ה-hero (רק slide פעיל ל-LCP)
3. Cardcom / אנליטיקה ב-bundle של הבית
4. תמונות 4000px לכרטיסי מובייל
5. החלפת `dir` ב-JS אחרי paint
6. מחיר ב-meta/JSON-LD שלא תואם קופה (SEO category נכשל אמון)

### 1.5 שערי Go-Live

- LCP/CLS/INP עומדים ביעד או חריג מתועד ב-LAUNCH-DAY / Go-Live checklist
- Visual diff מול `refs/` תחת סף `compare.mjs` בדפי מפתח
- Search Console מחובר אחרי DNS

---

## 2. Metadata (עברית)

### 2.1 Root (`src/app/layout.tsx`)

| שדה | חוזה |
|---|---|
| `<html>` | `lang="he"` `dir="rtl"` |
| `metadataBase` | `NEXT_PUBLIC_APP_URL` או `https://kenyonexpress.co.il` |
| title.default | `קניון אקספרס \| קופונים ומבצעים` |
| title.template | `%s \| קניון אקספרס` |
| description | עברית, ערך אמיתי, בלי הבטחת אחוז קבוע |
| openGraph.locale | `he_IL` |
| openGraph.siteName | `קניון אקספרס` |
| twitter.card | `summary_large_image` |

### 2.2 תבניות לפי סוג דף

| דף | title | description / robots |
|---|---|---|
| Home | absolute: `קניון אקספרס \| קופונים ומבצעים` | משפט ערך ארצי |
| PDP | `seo_title` או `{name} ב-{price} ש"ח` (מחיר אתר) | `seo_description` → short → description |
| Category | שם הקטגוריה בעברית | טקסט קטגוריה קצר |
| Search | לפי הצורך | **robots noindex** |
| Account / Checkout / Admin | עברית תפעולית | **noindex** |

Canonical: path יחסי תחת `metadataBase` (למשל `/product/{slug}`), בלי query של מיון/עמוד כקנוניכשתוכן זהה.

### 2.3 Open Graph / Twitter

- תמונה אמיתית של המוצר/קטגוריה (R2); לא לוגו כברירת מחדל ב-PDP אם יש גלריה
- `locale: he_IL` תמיד במשטחים ציבוריים
- מחיר ב-OG לא סותר את ה-Offer ב-JSON-LD

### 2.4 robots / sitemap

`src/app/robots.ts` Disallow:

```text
/redeem/ /coupon/ /account/ /supplier/ /scan
/admin/ /checkout /cart /auth/ /api/
/reset-password /forgot-password
```

`sitemap.xml`: `/`, `/products`, `/coupons`, categories, active products.  
לא לכלול voucher URLs. `lastmod` מ-`updated_at`.  
`revalidate` יעד ל-sitemap: 3600.

### 2.5 תוכן on-page

- H1 יחיד בעברית
- `alt` בעברית תיאורי
- טקסט קטגוריה קצר שלא דוחה LCP
- הפניות 301 מ-WP לפי מפת המיגרציה (בלי שרשור)

---

## 3. JSON-LD

מימוש: `src/lib/seo/json-ld.ts`.  
פלט: `<script type="application/ld+json">` עם `jsonLdScript` (בריחת `<` → `\u003c`).

### 3.1 Home: Organization + WebSite

מ-`buildSiteJsonLd(siteUrl)`:

| שדה | ערך |
|---|---|
| Organization.name | `קניון אקספרס` |
| alternateName | `KenyonExpress` |
| url / logo | origin + `/logo.png` |
| inLanguage | `he-IL` |
| WebSite.potentialAction | `SearchAction` → `/search?q={search_term_string}` |

אסור להצהיר SearchAction על route שלא קיים.

### 3.2 Product + Offer (PDP)

מ-`buildProductJsonLd`, מאותו `CouponOffer` / מחיר שהעמוד מציג:

| סוג מוצר | `offers.price` | הערות |
|---|---|---|
| קופון sellable | `paidOnlineIls` (שולם באתר) | `highPrice` = מחירון אם גבוה יותר; `priceValidUntil` מתאריך ההצעה |
| קופון לא sellable | בלי מחיר; `availability: OutOfStock` | אסור `price: 0` |
| פיזי | מחיר האתר (`priceIls`) | stock → InStock/OutOfStock |

שדות משותפים: `name`, `description`, `url` (`/product/{slug}`), `image[]`, `sku`, `category`, `brand` = שם הספק (לא שם הפלטפורמה כברירת מחדל), `inLanguage: he-IL`, `priceCurrency: ILS`.

### 3.3 BreadcrumbList

מ-`buildBreadcrumbJsonLd`: בית → קטגוריה → מוצר (בסדר שמוצג ב-UI).  
כל `ListItem`: `position`, `name` בעברית, `item` מוחלט.

### 3.4 מה לא שמים ב-JSON-LD

- מחיר מחירון כ-Offer יחיד לקופון
- `qr_payload` / קודי שובר / קישורי `/coupon/{id}`
- דירוגי AggregateRating מזויפים
- מחיר באגורות כמספר שלם בלי המרה (Schema מצפה ליחידות המטבע)

### 3.5 הטמעה

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: jsonLdScript(node) }}
/>
```

בדיקות יחידה: `src/lib/seo/json-ld.test.ts` (מחיר קופון = paid online; אין offer במחיר 0).

---

## 4. ISR strategy

### 4.1 מטריצה

| Page | Mode | `revalidate` / dynamic | Tags / הערות |
|---|---|---|---|
| `/` | ISR | `revalidate = 120` | tag יעד: `home` |
| `/product/[slug]` | ISR + partial static | `revalidate = 120`; `generateStaticParams` עד ~500 slugs פעילים | tags: `product:{id}`, `catalog` |
| `/products` | dynamic או ISR קצר | filters ב-query → dynamic | `catalog` |
| `/category/[slug]` | **force-dynamic** | קורא `searchParams` (page/sort/price/brand) | cache ברמת data (`getCategoryProductsCached`) |
| `/search` | dynamic | short SWR בצד שרת | **noindex** |
| `/cart`, `/checkout*`, `/account/**`, `/admin/**`, `/supplier/**` | dynamic private | `no-store` | לעולם לא CDN HTML מלא |
| `/sitemap.xml` | ISR | `revalidate = 3600` | tag: `sitemap` |
| `/coupon/[id]`, `/redeem/**` | dynamic | | noindex; לא ב-sitemap |

### 4.2 On-demand revalidation

אחרי publish / unpublish / שינוי מחיר מהותי באדמין:

```text
revalidatePath('/product/{slug}')
revalidatePath('/category/{slug}')  // אם רלוונטי
revalidatePath('/')                 // אם מופיע בhome
revalidateTag('catalog')
revalidateTag('sitemap')
```

Endpoint מתוכנן:

```
POST /api/admin/revalidate
```

(admin session או deploy secret; rate limit).

### 4.3 כללי בחירה

1. אם העמוד תלוי ב-`searchParams` משתנים → **לא** ISR של דף שלם
2. אם העמוד ציבורי, יציב, בלי session → ISR עם `revalidate` 120 עד 300 שניות
3. כסף/חשבון → תמיד dynamic
4. אחרי מיגרציית WP: 301 לפני רנדור כבד

### 4.4 Caching stack

```text
CDN (Vercel) → ISR HTML / RSC payload
Data cache → fetch/Supabase עם tags
Meilisearch → אינדקס חיפוש; לא DB לכל keystroke בלי debounce
```

אין service role בדפדפן. `createPublicClient` לנתיבי קטלוג ציבוריים.

---

## 5. מדידה ושערים

| כלי | שימוש |
|---|---|
| Lighthouse CI | PR: home + coupon PDP + category |
| `compare.mjs` | רגרסיה ויזואלית מול `refs/` |
| Web Vitals RUM | אופציונלי אחרי consent |
| Search Console | אחרי DNS; Coverage / 404 |

---

## 6. טסטים

| # | בדיקה |
|---|---|
| S1 | title + canonical בעברית על PDP |
| S2 | noindex / Disallow על `/account` ו-`/coupon/` |
| S3 | JSON-LD Offer לקופון = paid online; לא zero price |
| S4 | Home JSON-LD: Organization + WebSite SearchAction |
| S5 | Lighthouse perf/a11y ≥ 90 על preview |
| S6 | `revalidate = 120` על home/PDP; category נשאר dynamic עם filters |
| S7 | sitemap בלי account/redeem; robots מצביע ל-sitemap |

---

## 7. אנטי-דפוסים אסורים

1. מחיר ב-meta/JSON-LD שלא תואם קופה
2. ISR על דף עם `searchParams` משתנים
3. Index ל-URLs עם session/cart params
4. Make/Zapier ל-sitemap
5. Metadata באנגלית כברירת מחדל ללקוח ישראלי

---

## 8. Related

```
docs/ARCHITECTURE-MARKETING.md
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-E2E-TESTING.md
docs/LAUNCH-DAY.md
```

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-07-31 | רענון מחייב + ISR matrix ראשוני |
| 2026-08-02 | Lighthouse targets, ISR מול הקוד, JSON-LD, Hebrew metadata |
| 2026-08-03 | Lighthouse 90+ strategy section; refresh על `arch/docs-queue`; docs only |
