# ארכיטקטורה: SEO

Metadata, Structured Data, Sitemap, Redirects, hreflang, OG images. מקור מימוש לשכבת SEO ב-Next.js App Router.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-GROWTH-SEO.md
docs/ARCHITECTURE-WP-DATA-MIGRATION.md
docs/ARCHITECTURE-PERFORMANCE.md
docs/DOCS-TEMPLATE-BINDING.md
```

מדיניות slugs/canonical/redirects/sitemap: `ARCHITECTURE-CATALOG-SEARCH-SEO.md` גובר.  
מסמך זה: **מימוש Next.js**.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| SEO1 | רציפות SEO = הכנסה. אפס URL ישן בלי הכרעה (301 / התאמה / 410). |
| SEO2 | locale יחיד `he-IL`; תוכן `*_he`; `dir=rtl`, `lang=he-IL`. |
| SEO3 | בסיס URL יחיד: `NEXT_PUBLIC_SITE_URL` (prod: `https://www.kenyonexpress.co.il`). |
| SEO4 | Metadata נגזר מ-DB (`generateMetadata`); לא hardcode per product. |
| SEO5 | trailing slash: **ללא** (`trailingSlash: false`); canonical ללא slash. |
| SEO6 | cart/checkout/account: `noindex`; checkout גם `nofollow`. |
| SEO7 | JSON-LD: Product+Offer, Breadcrumb, Organization; `<JsonLd>` עם escape ל-`<`. |
| SEO8 | sitemap דינמי מ-Supabase; `revalidate` 3600s; robots.ts disallow private paths. |
| SEO9 | 301 מ-WP: `seo_redirects` + middleware/proxy; cache map בזיכרון. |
| SEO10 | OG דינמי: `opengraph-image.tsx` 1200×630; Twitter `summary_large_image`. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| metadata סטטי לכל מוצר | לא scalable; generateMetadata. |
| hardcode דומיין בקוד | שbreak staging; env יחיד. |
| trailing slash כמו WP | canonical כפול; 301 + false explicit. |
| redirects() static ב-next.config ל-10k URLs | build איטי; middleware + DB map. |
| index על cart/checkout | thin/PII; noindex. |
| index על search results | duplicate/thin; noindex (SEARCH). |
| OG type `product` | לא סטנדרטי בכל crawlers; `website` בטוח. |
| sitemap ידני בלי updated_at | Google לא רואה refresh; DB driven. |

---

## 2. סכמת DB (קיים; אין DDL חדש במסמך זה)

| טבלה / שדה | שימוש SEO |
|---|---|
| `products.slug`, `name_he`, `description_he`, `status` | PDP metadata + sitemap |
| `products.seo_title`, `seo_description` | override אופציונלי |
| `products.updated_at` | sitemap lastModified |
| `categories.slug`, `name_he`, `is_active` | category metadata |
| `seo_redirects.from_path`, `to_path`, `status_code`, `hits` | 301 מ-WP |

קונסепט `seo_redirects`:

```sql
-- מוגדר ב-CATALOG-SEARCH-SEO; לא מיגרציה חדשה כאן
from_path text unique,
to_path text,
status_code smallint default 301,
hits integer default 0
```

---

## 3. Metadata לפי סוג עמוד

| סוג | canonical | index |
|---|---|---|
| Home `/` | `/` | כן |
| Category | `/category/{slug}` | כן (page1); page≥2 noindex אופציונלי |
| Product | `/product/{slug}` | כן אם published |
| cart | none | noindex, follow |
| checkout | none | noindex, nofollow |

קבועים:

```ts
// src/lib/seo/constants.ts
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!.replace(/\/$/, '')
export const LOCALE = 'he_IL'
export const LOCALE_BCP47 = 'he-IL'
```

hreflang היום:

```tsx
alternates: {
  canonical,
  languages: { 'he-IL': canonical, 'x-default': canonical },
}
```

---

## 4. JSON-LD

- Organization בשורש
- Product + Offer בעמוד מוצר (coupon vs physical: Voucher / shippingDetails)
- BreadcrumbList בקטגוריה ו-PDP
- מחיר ILS; `priceValidUntil` שנה קדימה

---

## 5. sitemap + robots

```
src/app/robots.ts   → disallow cart, checkout, account, admin, api
src/app/sitemap.ts  → static + categories + products; revalidate 3600
```

מעל 50k URL: `generateSitemaps` (פיצול 40k).

---

## 6. cutover WordPress

1. ייצוא URL מאונדקסים (Yoast + Search Console + crawl)
2. מיפוי slug אלגוריתמי + ידני
3. seed ל-`seo_redirects`
4. middleware: normalize trailing slash → lookup map → 301
5. ניטור 30 יום: hits, 404, Search Console

410 לתוכן שהוסר בכוונה (Gone).

---

## 7. מקרי קצה (טבלת תפעול)

| קוד | סימפטום | תגובה |
|---|---|---|
| `404_old_url` | WP URL בלי redirect | הוסף ל-seo_redirects |
| `redirect_loop` | A→B→A | תיקון map; audit |
| `canonical_with_query` | `/product/x?ref=` indexed | canonical ללא query |
| `duplicate_slash` | `/product/x/` | 301 ל-no slash |
| `draft_indexed` | product draft ב-sitemap | filter status=published |
| `og_hebrew_boxes` | ריבועים ב-OG edge | load Heebo ttf ב-ImageResponse |
| `jsonld_xss` | `<` ב-description | JsonLd escape |
| `sitemap_stale` | updated_at לא משתנה | trigger on publish |
| `noindex_leak` | checkout ב-GSC | robots + noindex verify |
| `hreflang_missing` | רק canonical | languages block |

---

## 8. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | `NEXT_PUBLIC_SITE_URL` vs `NEXT_PUBLIC_APP_URL` איחוד | CONTRADICTIONS |
| O2 | noindex על category page≥2: canonical ל-page1 vs self | ברירת מחדל: noindex page≥2 |
| O3 | sitemap index אוטומטי מתי catalog >40k | CATALOG-SEARCH-SEO |
| O4 | 410 routes ממופים מ-WP inventory | WP-MIGRATION |
| O5 | Rich Results monitoring אוטומטי | OBSERVABILITY |

עודכן: 2026-08-12.

---

## 9. Acceptance

- [ ] constants.ts + metadataBase בשורש
- [ ] generateMetadata product/category
- [ ] JsonLd + opengraph-image
- [ ] sitemap.ts + robots.ts
- [ ] seo_redirects + middleware
- [ ] trailingSlash false
- [ ] not-found עברית
- [ ] חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-23 | מסמך SEO מימוש מלא |
| 2026-08-12 | batch-2: שכתוב לפי תבנית חובה |
