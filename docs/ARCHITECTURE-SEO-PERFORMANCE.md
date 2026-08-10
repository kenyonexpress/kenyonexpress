# ארכיטקטורה: SEO וביצועים

Metadata דינמי, JSON-LD, sitemap, OG, Core Web Vitals, ISR/cache, Meilisearch מול Google.

Status: **BINDING** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SEARCH-UX.md
docs/ARCHITECTURE-SEARCH.md
docs/ARCHITECTURE-GROWTH-SEO.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/RUNBOOK-PRODUCTION.md
```

עקרון: **Web = SEO + רכישה.** Meilisearch משרת חיפוש באתר; Google מאונדקס מ-HTML/sitemap/JSON-LD בלבד.

---

## 0. המלצה אחת (מחייבת)

**RSC + ISR על קטלוג ציבורי, `generateMetadata` מ-DB, JSON-LD מאותם ערכי קופה, sitemap דינמי שעתי, OG מתמונת המוצר, תקציב CWV פר דף ב-CI.**

אין SSG מלא של כל הקטלוג ב-build. אין מחיר שני ב-meta. אין אינדוקס Google דרך Meilisearch.

---

## 1. Metadata דינמי (עברית)

### 1.1 מוצר `/product/[slug]`

מקור: שדות `*_he` + מחיר מהמודל הכספי (לא חישוב נפרד).

```ts
// src/app/(store)/product/[slug]/page.tsx
export const revalidate = 120

export async function generateMetadata({ params }): Promise<Metadata> {
  // title: seo_title ?? `${name_he} | KenyonExpress`
  // description: seo_description ?? short_description_he (≤155)
  // alternates.canonical: `${site}/product/${slug}`
  // openGraph + twitter מאותם title/description/image
}
```

| שדה | כלל |
|---|---|
| `title` | עברית; עד ~60 תווים; כולל מותג בסוף |
| `description` | עברית; מה מקבלים + מחיר אתר |
| `canonical` | URL יציב בלי query |
| `robots` | index רק אם `status=active` ו-`deleted_at IS NULL` |

קופון: בתיאור מופיע **מחיר האתר** (`coupon_price_ils`) ויתרה בעסק; לא מציגים face כאילו שולם במלואו.

### 1.2 קטגוריה `/category/[slug]`

| שדה | כלל |
|---|---|
| `title` | `name_he` + "דילים ומבצעים \| KenyonExpress" |
| `description` | `description_he` או משפט קבוע בעברית עם שם הקטגוריה |
| `canonical` | `/category/{slug}` בלי filters ב-query |
| דף עם `searchParams` | אותו title בסיסי; **noindex** אם ה-URL הוא תוצאת פילטר עמוקה (page>1 עם sort ייחודי) |

`lang="he"` + `dir="rtl"` ב-layout השורש. פונט Heebo מ-`next/font`.

---

## 2. JSON-LD: Product + Offer

בונה יחיד:

```
src/lib/seo/json-ld.ts → buildProductJsonLd
```

| כלל | פירוט |
|---|---|
| `@type` | `Product` + `Offer` (או AggregateOffer רק אם יש טווח מחירים אמיתי) |
| `inLanguage` | `he-IL` |
| `name` / `description` | מ-`name_he` / `description_he` |
| קופון `Offer.price` | **`paidOnlineIls`** (`coupon_price`) בלבד |
| קופון הקשר | `highPrice` / strikethrough = face; לא Offer יחיד על face |
| פיזי `Offer.price` | מחיר on-site בפועל |
| `priceCurrency` | `ILS` |
| `availability` | InStock / OutOfStock לפי מלאי; **בלי Offer במחיר 0** |
| `brand` | שם הספק; לא "KenyonExpress" כברירת מחדל |

קטגוריה: `CollectionPage` / `ItemList` של URL מוצרים פעילים (עד N ראשונים), בלי מחירים שקריים.

מחיר ב-JSON-LD = מחיר שהקופה גובה. נקודה.

---

## 3. Sitemap דינמי

```
src/app/sitemap.ts
export const revalidate = 3600
```

| נכנס | לא נכנס |
|---|---|
| `/`, `/products`, `/coupons` | `/account/**`, `/checkout/**`, `/cart` |
| `/category/{slug}` פעיל | `/admin/**`, `/supplier/**`, `/api/**` |
| `/product/{slug}` עם `status=active` | `/coupon/**`, `/redeem/**`, `/search` |

`lastmod` מ-`updated_at`. אחרי publish: `revalidateTag('sitemap')`. מעל 45k URLs: פיצול ל-sitemap index (אותו מנגנון, קבצים נוספים).

robots:

```
src/app/robots.ts
```

Allow קטלוג ציבורי; Disallow על הנתיבים מהעמודה הימנית; `Sitemap: https://kenyonexpress.co.il/sitemap.xml`.

---

## 4. OG images

| דף | תמונה |
|---|---|
| מוצר | תמונה ראשית של המוצר (R2 + `next/image`); absolute URL ב-`openGraph.images` |
| קטגוריה | תמונת קטגוריה אם יש; אחרת ברירת מותג `#fed700` סטטית אחת |
| בית | hero / מותג קבוע |

אין OG דינמי מ-edge screenshot ב-MVP. מימדים מומלצים: 1200×630. תמונה בלי טקסט Eng שבור על רקע עברי. `twitter:card = summary_large_image`.

---

## 5. Core Web Vitals + תקציב פר דף

יעדי שדה (mobile, p75):

| מדד | יעד |
|---|---|
| LCP | ≤ 2.5s |
| INP | ≤ 200ms |
| CLS | ≤ 0.1 |
| TTFB (קטלוג) | ≤ 800ms |
| Lighthouse Performance / A11y / SEO | ≥ 90 |

תקציב פר דף (mobile):

| דף | JS קריטי | LCP image | הערות |
|---|---|---|---|
| `/` | ≤ 170KB gzip | hero slide פעיל אחד `priority` | בלי Cardcom ב-bundle הבית |
| `/product/[slug]` | ≤ 190KB gzip | תמונה ראשית אחת `priority` | קופה ב-dynamic import |
| `/category/[slug]` | ≤ 180KB gzip | כרטיס ראשון בלבד eager | פילטרים אחרי hydration |
| `/checkout` | לא ב-LH CI | n/a | `no-store`; smoke בלבד |

אכיפה: Lighthouse CI על home + PDP קופון + category; רגרסיית Performance > 5 נקודות בלי הצדקה = כשל PR.

---

## 6. ISR / cache פר סוג דף

| דף | מצב | `revalidate` |
|---|---|---|
| `/` | ISR | **120s** · tag `home` |
| `/product/[slug]` | ISR | **120s** · tags `product:{id}`, `catalog` |
| `/category/[slug]` בלי filters | ISR | **180s** · tag `category:{id}` |
| `/category` + `searchParams` | dynamic | data-cache קצר לqueries |
| `/search` | dynamic | **noindex** |
| `/cart`, `/checkout*`, `/account/**`, `/admin/**`, `/supplier/**` | dynamic private | `no-store` |
| `/sitemap.xml` | ISR | **3600s** · tag `sitemap` |

אחרי publish / שינוי מחיר:

```text
revalidateTag('product:{id}')
revalidateTag('category:{id}')
revalidateTag('catalog')
revalidateTag('sitemap')
revalidateTag('home')
```

יעד: PDP מעודכן תוך ~דקה.

---

## 7. Meilisearch מול Google

| מערכת | תפקיד | מה לא |
|---|---|---|
| **Google** | אינדוקס ציבורי דרך HTML + sitemap + JSON-LD | לא נשלח קטלוג מ-Meili |
| **Meilisearch** | חיפוש/השלמות/typos בתוך האתר | לא מקור ל-SEO; `/search` = noindex |

אינדוקס Meili: QStash → `/api/search/index-job` אחרי שינוי מוצר (אותו דפוס retry כמו התראות). מסמך Meili כולל `name_he`, facets, מחיר אתר לתצוגה; Google לא קורא אותו.

דירוג Google: תוכן עברי בשרת, canonical, CWV, מחיר עקבי. דירוג Meili: רלוונטיות עברית בלי boost לפי עמלה קבועה (`platform_percent` אינו גורם מיון ב-UX).

---

## 8. Acceptance

- [ ] `generateMetadata` עברי למוצר ולקטגוריה  
- [ ] JSON-LD Offer = מחיר קופה; קופון לא מפרסם face כ-price יחיד  
- [ ] sitemap דינמי בלי account/checkout/coupon/redeem  
- [ ] OG מתמונת מוצר absolute  
- [ ] LH ≥ 90 על home/PDP/category  
- [ ] ISR 120 על PDP; checkout `no-store`  
- [ ] Meili ≠ Google indexing  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | ISR / sitemap / schema / CWV (rev C) |
| 2026-08-10 | מסמך ממוקד מחייב: metadata, JSON-LD, OG, תקציב פר דף, Meili מול Google |
