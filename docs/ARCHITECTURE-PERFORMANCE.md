# ארכיטקטורה: ביצועים (Performance)

ארכיטקטורת ביצועים מחייבת ל-storefront KenyonExpress: CWV, ISR, תמונות, גופנים, bundle budgets, Supabase, Edge cache.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SEO.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-SEARCH.md
docs/PERFORMANCE-BUDGET.md
```

Stack: Next.js App Router (RSC), עברית RTL, Heebo, Supabase, Vercel Edge, R2 CDN לתמונות.

לפני שינוי cache APIs: לקרוא

```
node_modules/next/dist/docs/
```

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| PF1 | HTML קטלוג ציבורי cacheable (ISR + tags). Session HTML = `private, no-store`. |
| PF2 | אין service-role על נתיבי RSC ציבוריים. anon + RLS בלבד. |
| PF3 | מחירים ב-HTML ממוטמע = **display** בלבד. Checkout מחשב כסף מהשרת (agorot). |
| PF4 | תמונת LCP אחת לעמוד עם `priority`. השאר lazy. |
| PF5 | אין `<img>` גולמי. `next/image` בלבד. |
| PF6 | column-select בכל query. אין `select('*')` על hot paths. |
| PF7 | `revalidateTag` ראשי; `revalidate` time-based = safety net. |
| PF8 | Bundle budgets = gates. PR שמ regresses נכשל ב-CI. |
| PF9 | Cookie/session לא משנים HTML של ISR public (header island ב-client). |
| PF10 | Heebo 400+700 בלבד; `next/font`; preload; לא Google CSS runtime. |

### יעדי Core Web Vitals (field p75)

| Metric | Mobile | Desktop | Fail |
|---|---|---|---|
| LCP | ≤ 2.0s | ≤ 1.5s | > 2.5s mobile |
| INP | ≤ 150ms | ≤ 100ms | > 200ms |
| CLS | ≤ 0.05 | ≤ 0.05 | > 0.1 |
| TTFB | ≤ 600ms | ≤ 400ms | > 800ms mobile |

### מטריצת ISR (binding)

| עמוד | Mode | revalidate | Tags |
|---|---|---|---|
| Home `/` | ISR | 120s | `home`, `catalog` |
| Category | ISR | 300s | `category:{id}`, `catalog` |
| Product | ISR | 120s | `product:{id}`, `catalog` |
| Sitemap | ISR | 3600s | `sitemap` |
| Search | Dynamic קצר | CDN 30s | noindex |
| cart/checkout/account | Dynamic | no-store | n/a |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| SSR מלא לכל הקטלוג | TTFB גבוה; ISR + tags מספיקים. |
| CDN cache על cart/checkout | דליפת session/PII. |
| `select('*')` לנוחות | payload מנפח; egress + TTFB. |
| Google Fonts CSS runtime | RTT נוסף; FOIT/FOUT. |
| מחיר checkout מ-HTML cached | זיוף מחיר; PF3. |
| ISR לכל שילוב filter בקטגוריה | explosion של entries; client filter או CDN קצר. |
| middleware עם round-trip Supabase על catalog | latency; proxy זול בלבד. |
| quality 95 לכל התמונות | משקל בלי רווח visual; 60–75 binding. |

---

## 2. סכמת DB (קיים + אינדקסים מומלצים)

| טבלה / עמודה | תפקיד ביצועים |
|---|---|
| `products.sort_price_agorot` | ORDER BY תצוגה (trigger); לא checkout |
| `products.status`, `published_at`, `is_featured` | פילטר listing |
| `categories.slug` | lookup PDP/category |
| `home_hero_slides.is_active`, `sort_order` | hero rail |

אינדקסים (מיגרציה נפרדת, לא DDL במסמך זה):

```sql
CREATE INDEX IF NOT EXISTS products_published_category_published_at_idx
  ON public.products (category_id, published_at DESC)
  WHERE status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS products_slug_uidx ON public.products (slug);

CREATE INDEX IF NOT EXISTS products_published_sort_price_idx
  ON public.products (sort_price_agorot ASC)
  WHERE status = 'published';
```

`sort_price_agorot`: trigger מחזיק integer; checkout **לא** סומך עליו.

---

## 3. next/image (binding)

| שימוש | sizes | quality | priority |
|---|---|---|---|
| Home hero | `(max-width: 1024px) 100vw, 1200px` | 75 | slide ראשון |
| Product card | `(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw` | 60 | never |
| PDP main | `(max-width: 768px) 100vw, 600px` | 75 | yes (LCP) |
| Thumb | `80px` | 60 | never |

`next.config.ts`: formats AVIF/WebP; `qualities: [60,70,75]`; `minimumCacheTTL` 31d.

---

## 4. Bundle budgets (gzip, first-load JS)

| Route | Max |
|---|---|
| Home shell | 170 KB |
| Category | 190 KB |
| Product | 180 KB |
| Cart/checkout | 220 KB |

Admin/supplier: route group נפרד; לא ב-shared store chunks.

---

## 5. Vercel Edge + invalidation

```
Browser → Vercel Edge → Origin → Supabase/R2
```

| Admin event | Tags | Paths |
|---|---|---|
| Publish product | `product:{id}`, `catalog`, `sitemap` | `/product/{slug}` |
| Edit price | `product:{id}`, `catalog` | `/product/{slug}` |
| Category change | `category:{id}`, `catalog` | `/category/{slug}` |
| Hero edit | `home` | `/` |

אין `Vary: Cookie` על ISR public.

---

## 6. Streaming / Suspense

- LCP (hero/gallery) לא מחכה ל-related products.
- Skeletons עם aspect ratio קבוע (CLS).
- אל ת-stream LCP מאחורי Suspense מאוחר אם הנתונים כבר ב-query ראשי.

---

## 7. מקרי קצה (טבלת תפעול)

| קוד | סימפטום | תגובה |
|---|---|---|
| `isr_stale_price` | מחיר ישן אחרי publish | revalidateTag product |
| `cookie_varies_html` | cart cookie משנה HTML home | refactor ל-client island |
| `lcp_no_priority` | LCP > 2.5s | priority על תמונה ראשית |
| `cls_font_swap` | קפיצה בטעינת Heebo | adjustFontFallback |
| `bundle_regress` | JS > budget | block PR |
| `seq_scan_products` | EXPLAIN Seq Scan | index + column select |
| `service_role_public_rsc` | secret ב-server component public | CRITICAL fix |
| `search_isr_explosion` | אלפי ISR entries ל-filters | CDN קצר / client filter |
| `hero_unoptimized` | raw img ב-hero | next/image |
| `checkout_price_from_cache` | charge לפי HTML | bug; server re-resolve |

---

## 8. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | Lighthouse CI wired ב-GHA | scripts/perf/assert-cwv.ts |
| O2 | bundle analyzer export אוטומטי | check-bundle-budgets placeholder |
| O3 | CrUX field monitoring dashboard | OBSERVABILITY |
| O4 | PPR / Cache Components כש-stable ב-repo | Next מותאם |
| O5 | cursor pagination במקום count exact בקטגוריות גדולות | perf DB |

עודכן: 2026-08-12.

---

## 9. Acceptance

- [ ] ISR matrix + tags per route
- [ ] private routes no-store
- [ ] image sizes/quality binding
- [ ] Heebo 400+700 preload
- [ ] no select('*') hot paths
- [ ] bundle budgets per route
- [ ] admin revalidateTag on publish
- [ ] checkout server-side money
- [ ] חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-30 | Initial binding performance (arch/performance) |
| 2026-08-12 | batch-2: שכתוב עברית + תבנית חובה |
