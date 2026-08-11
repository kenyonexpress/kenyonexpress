# ארכיטקטורה: SEO וביצועים

Metadata App Router, hreflang `he-IL`, JSON-LD Product/Offer/LocalBusiness, sitemap, CWV, ו-`seo_redirects`.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #41/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

לפני יישום API של Next: לאמת חתימות מול

```
node_modules/next/dist/docs/
```

מסמכים קשורים:

```
docs/PERFORMANCE-BUDGET.md
docs/ARCHITECTURE-SEARCH-UX.md
docs/ARCHITECTURE-GROWTH-SEO.md
docs/ARCHITECTURE-PRODUCTION-OPS.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-GEO-FEATURE.md
refs/electro-measurements-380.md
refs/electro-measurements-768.md
src/lib/seo/json-ld.ts
src/lib/seo/redirects.ts
supabase/migrations/030_catalog.sql
```

עקרון: **Web = SEO + רכישה.** Meilisearch = חיפוש באתר בלבד. Google מאונדקס מ-HTML / sitemap / JSON-LD.  
**No Escrow** בתיאורים. מחיר schema = מחיר קופה.

---

## 0. המלצה אחת

RSC + ISR על קטלוג, `generateMetadata` עברית מ-DB, `alternates.languages` ל-`he-IL`, JSON-LD Product+Offer (+ LocalBusiness כשיש geo), sitemap index עם קטגוריות, CWV לפי PERFORMANCE-BUDGET + layout מ-refs 380/768, ו-301/410 מ-`public.seo_redirects`.

### 0.1 שם מיגרציה

| בקשה נפוצה | מציאות |
|---|---|
| `095_seo_redirects` | **לא קיים** (095 = notification outbox) |
| טבלת redirects | `public.seo_redirects` ב-`030_catalog.sql` |
| runtime | `src/lib/seo/redirects.ts` |

---

## 1. Metadata

### 1.1 מוצר `/product/[slug]`

| שדה | כלל |
|---|---|
| `title` | עברית; ~60 תווים; מותג בסוף |
| `description` | מה מקבלים + **מחיר שנגבה באתר** |
| `canonical` | בלי query |
| `alternates.languages` | `he-IL` + `he` → אותו URL |
| `robots` | index רק אם active ולא מחוק |

קופון: תיאור = מחיר אתר + יתרה בעסק. אסור ניסוח Escrow / "הכסף אצלנו עד המימוש".

### 1.2 קטגוריה

`title` / `description` עברית; canonical בלי filters; פילטרים עמוקים = noindex.

### 1.3 Root

`lang="he"` + `dir="rtl"`.  
Base URL קנוני: `https://kenyonexpress.co.il`.

### 1.4 hreflang

ראשי `he-IL`; alias `he`; x-default = אותו URL עברי עד שיש locale שני אמיתי.

---

## 2. JSON-LD

בונה: `src/lib/seo/json-ld.ts` → `buildProductJsonLd`.

| כלל | פירוט |
|---|---|
| Product + Offer | `inLanguage: he-IL` |
| קופון Offer.price | **מחיר האתר בלבד** (agorot→ILS לתצוגה) |
| face | לא Offer יחיד על face כאילו שולם במלואו |
| פיזי | מחיר on-site |
| currency | ILS |
| LocalBusiness | רק עם כתובת/geo מאומתים; מקום מימוש, לא נאמן כספי |

---

## 3. Sitemap

```text
/sitemap.xml              → index
/sitemap-static.xml
/sitemap-categories.xml
/sitemap-products-{n}.xml
/sitemap-cities.xml       → אם published
```

נכנס: בית, קטגוריות פעילות, מוצרים active, ערי עיר מאושרות.  
לא נכנס: account, checkout, cart, admin, supplier, api, search, redeem.

`robots.ts`: Allow קטלוג; Disallow פרטי; מצביע ל-sitemap.

---

## 4. Core Web Vitals

מקור: `docs/PERFORMANCE-BUDGET.md`.

| מדד | יעד mobile p75 |
|---|---|
| LCP | ≤ 2.5s (קטגוריה ≤ 2.8s) |
| INP | ≤ 200ms |
| CLS | ≤ 0.1 |
| TTFB קטלוג | ≤ 800ms |

JS ראשוני gzip: home ≤ 180KB, category ≤ 200KB, product ≤ 220KB.

### 4.1 Layout budgets (380 / 768)

מ-`refs/electro-measurements-380.md` ו-`768`:

| אזור | 380 | 768 |
|---|---|---|
| Header | 380×55.52 | 768×55.52 |
| Hero slider | 348×192 | 688×287 |
| ProductCard | ~175×274 | ~172×271 |

שמירת גובה = CLS. Lighthouse לפחות על 380 ו-768.

---

## 5. `seo_redirects`

Lookup ב-`redirects.ts` (מפה + TTL). סטטוס 301 או 410.  
מקור: טבלה בלבד. WP import = `source=wordpress_import` (היסטוריה; הסטאק החי הוא Next).

אחרי שינוי slug: 301 אוטומטי.

---

## 6. ISR / cache

| דף | מדיניות |
|---|---|
| בית / PDP / קטגוריה | ISR + tags |
| search | dynamic + **noindex** |
| cart/checkout/account/admin | `no-store` |
| sitemaps | ISR ~3600s |

אחרי publish: `revalidateTag` על product/category/catalog/sitemap/home.

---

## 7. Meilisearch מול Google

| מערכת | תפקיד |
|---|---|
| Google | HTML + sitemap + JSON-LD |
| Meili | חיפוש פנימי באתר |

`/search` = noindex.  
דירוג Meili: **אין** boost לפי `platform_percent` / עמלה קבועה.

---

## 8. Acceptance

- [ ] metadata עברי + hreflang he-IL  
- [ ] JSON-LD Offer = מחיר קופה; בלי Escrow  
- [ ] sitemap + robots  
- [ ] CWV + layout 380/768  
- [ ] seo_redirects מ-030 (לא 095)  
- [ ] ISR קטלוג; checkout no-store  
- [ ] search noindex; אין boost עמלה  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | hreflang, LocalBusiness, 380/768, seo_redirects |
| 2026-08-12 | batch-2 #41: BINDING על arch/docs-batch-2; קישור PRODUCTION-OPS |
