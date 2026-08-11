# ארכיטקטורה: SEO וביצועים

Metadata (App Router), schema.org בעברית ל-Product/Offer, sitemap לפי קטגוריה, תקציב Core Web Vitals, ISR, ודפי SEO מול Meilisearch.

Status: **BINDING** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

לפני יישום API של Next: לאמת חתימות מול

```
node_modules/next/dist/docs/
```

(בילד מותאם; לא להניח Next "רגיל" מאימון).

מסמכים קשורים:

```
docs/PERFORMANCE-BUDGET.md
docs/ARCHITECTURE-SEARCH-UX.md
docs/ARCHITECTURE-SEARCH.md
docs/ARCHITECTURE-GROWTH-SEO.md
docs/SEO-CONTENT-STRATEGY.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CITY-LANDING-CONTENT.md
```

עקרון: **Web = SEO + רכישה.** Meilisearch = חיפוש באתר בלבד. Google מאונדקס מ-HTML / sitemap / JSON-LD.

---

## 0. המלצה אחת (מחייבת)

**RSC + ISR על קטלוג, `generateMetadata` מ-DB, JSON-LD Product+Offer בעברית מאותם מחירי קופה, sitemap דינמי (כולל פיצול לקטגוריות), תקציב CWV מ-PERFORMANCE-BUDGET, דפי נחיתה לחיפוש עם noindex על `/search` הדינמי.**

אין מחיר שני ב-meta. אין אינדוקס Google דרך Meili.

---

## 1. Metadata (App Router / Next 15+)

### 1.1 מוצר `/product/[slug]`

```ts
export const revalidate = 120

export async function generateMetadata({ params }): Promise<Metadata> {
  // title: seo_title_he ?? `${name_he} | KenyonExpress`
  // description: seo_description_he ?? תקציר + מחיר אתר (עברית)
  // alternates.canonical: `${site}/product/${slug}`
  // openGraph / twitter מאותם ערכים + תמונה absolute
}
```

| שדה | כלל |
|---|---|
| `title` | עברית; ~60 תווים; מותג בסוף |
| `description` | עברית; מה מקבלים + מחיר שנגבה באתר |
| `canonical` | בלי query |
| `robots` | index רק אם `status=active` ו-`deleted_at IS NULL` |

קופון: בתיאור **מחיר האתר** + יתרה בעסק; לא להציג face כאילו שולם במלואו.

### 1.2 קטגוריה `/category/[slug]`

| שדה | כלל |
|---|---|
| `title` | `{name_he} · דילים \| KenyonExpress` |
| `description` | `description_he` או משפט קבוע בעברית |
| `canonical` | `/category/{slug}` בלי filters |
| פילטרים עמוקים | **noindex** (page>1 + sort ייחודי) |

`lang="he"` + `dir="rtl"` ב-root layout. פונט מותג מ-`next/font`.

---

## 2. schema.org בעברית: Product + Offer

בונה יחיד:

```
src/lib/seo/json-ld.ts → buildProductJsonLd
```

| כלל | פירוט |
|---|---|
| `@type` | `Product` + nested `Offer` |
| `inLanguage` | `he-IL` |
| `name` / `description` | מ-`name_he` / `description_he` |
| קופון `Offer.price` | **מחיר האתר בלבד** (`coupon_price` / agorot→ILS לתצוגה schema) |
| face / השוואה | `property` נפרד או טקסט; **לא** Offer יחיד על face |
| פיזי `Offer.price` | מחיר on-site |
| `priceCurrency` | `ILS` |
| `availability` | InStock / OutOfStock; בלי Offer במחיר 0 |
| `seller` / `brand` | שם ספק; LocalBusiness+geo רק מקואורדינטות מאומתות |

קטגוריה: `CollectionPage` + `ItemList` של URL מוצרים פעילים.

מחיר ב-JSON-LD = מחיר שהקופה גובה.

דוגמה מקוצרת (קופון):

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "inLanguage": "he-IL",
  "name": "ארוחה זוגית",
  "description": "קופון לארוחה זוגית. משלמים באתר; יתרה בעסק.",
  "offers": {
    "@type": "Offer",
    "priceCurrency": "ILS",
    "price": "149.00",
    "availability": "https://schema.org/InStock",
    "url": "https://kenyonexpress.co.il/product/example"
  }
}
```

`offers.price` = מחיר האתר (agorot/100 לתצוגה), לא face.

---

## 3. Sitemap לפי קטגוריה

```text
/sitemap.xml                 → sitemap index
/sitemap-static.xml          → בית, משפטי, FAQ
/sitemap-categories.xml      → כל /category/{slug} פעיל
/sitemap-products-{n}.xml    → מוצרים (chunk ≤ 45k)
/sitemap-cities.xml          → דפי עיר (אם published)
```

יישום: `src/app/sitemap.ts` או route handlers מפוצלים עם `revalidate = 3600`.

| נכנס | לא נכנס |
|---|---|
| `/`, קטגוריות פעילות, מוצרים active | `/account/**`, `/checkout/**`, `/cart` |
| דפי עיר מאושרים | `/admin/**`, `/supplier/**`, `/api/**` |
| | `/search`, `/redeem/**` |

`lastmod` מ-`updated_at`. אחרי publish: `revalidateTag('sitemap')`.

`robots.ts`: Allow קטלוג; Disallow פרטי; `Sitemap: https://kenyonexpress.co.il/sitemap.xml`.

---

## 4. Core Web Vitals (תקציב)

מקור מספרים מחייב:

```
docs/PERFORMANCE-BUDGET.md
```

| מדד | יעד (mobile p75) |
|---|---|
| LCP | ≤ 2.5s (קטגוריה ≤ 2.8s) |
| INP | ≤ 200ms |
| CLS | ≤ 0.1 |
| TTFB קטלוג | ≤ 800ms |

תקציב JS ראשוני (gzip): home ≤ 180KB, category ≤ 200KB, product ≤ 220KB.  
Lighthouse CI על home + PDP + category; רגרסיית Performance > 5 נקודות בלי הצדקה = כשל PR.

---

## 5. ISR / cache

| דף | מצב | `revalidate` |
|---|---|---|
| `/` | ISR | 120s · tag `home` |
| `/product/[slug]` | ISR | 120s · `product:{id}`, `catalog` |
| `/category/[slug]` | ISR | 180s · `category:{id}` |
| `/category` + filters | dynamic | data-cache קצר |
| `/search` | dynamic | **noindex** |
| cart/checkout/account/admin | private | `no-store` |
| sitemaps | ISR | 3600s · `sitemap` |

אחרי publish / שינוי מחיר:

```text
revalidateTag('product:{id}')
revalidateTag('category:{id}')
revalidateTag('catalog')
revalidateTag('sitemap')
revalidateTag('home')
```

---

## 6. Meilisearch ודפי SEO

| מערכת | תפקיד |
|---|---|
| Google | HTML + sitemap + JSON-LD |
| Meilisearch | חיפוש/השלמות/typos **בתוך** האתר |

| סוג דף | אינדוקס |
|---|---|
| `/search?q=` | **noindex** (תוצאות דינמיות) |
| `/category/{slug}` | index (תוכן יציב) |
| דפי עיר / קולקציה | index רק עם תוכן ייחודי + דילים |
| "דף SEO" מלאכותי שמעתיק Meili hits ל-HTML בלי ערך | אסור (doorway) |

אינדוקס Meili: job אחרי שינוי מוצר (QStash/Worker). מסמך Meili כולל `name_he`, facets, מחיר אתר; Google לא קורא אותו.

דירוג Meili: רלוונטיות עברית; **אין** boost לפי `platform_percent`.

---

## 7. OG

מוצר: תמונה ראשית absolute 1200×630. קטגוריה: תמונת קטגוריה או מותג. `twitter:card = summary_large_image`.

---

## 8. Acceptance

- [ ] `generateMetadata` עברי למוצר ולקטגוריה  
- [ ] JSON-LD Offer = מחיר קופה; קופון לא מפרסם face כ-price יחיד  
- [ ] sitemap index + קובץ קטגוריות נפרד  
- [ ] CWV לפי PERFORMANCE-BUDGET  
- [ ] ISR על PDP; checkout `no-store`  
- [ ] `/search` noindex; Meili ≠ Google  
- [ ] אין Escrow ב-meta/תיאורים  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | ISR / sitemap / schema / CWV |
| 2026-08-10 | metadata, JSON-LD, OG, תקציב פר דף, Meili מול Google |
| 2026-08-11 | sitemap לפי קטגוריה, קישור PERFORMANCE-BUDGET, דפי SEO מול Meili, הערת Next docs |
| 2026-08-11 | דוגמת JSON-LD Product+Offer בעברית (מחיר אתר) |
