# ארכיטקטורה: SEO וביצועים

Metadata (Next.js 15 App Router), hreflang `he-IL`, JSON-LD Product/Offer/LocalBusiness לקופונים, sitemap לפי קטגוריה, תקציב Core Web Vitals לפי breakpoints שנמדדו (380/768), וטבלת `seo_redirects`.

Status: **BINDING** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
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
docs/SEO-CONTENT-STRATEGY.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/ARCHITECTURE-PRICING-RULES.md
refs/electro-measurements-380.md
refs/electro-measurements-768.md
refs/electro-components-map.md
src/lib/seo/json-ld.ts
src/lib/seo/redirects.ts
supabase/migrations/030_catalog.sql
```

עקרון: **Web = SEO + רכישה.** Meilisearch = חיפוש באתר בלבד. Google מאונדקס מ-HTML / sitemap / JSON-LD.

---

## 0. המלצה אחת (מחייבת)

**RSC + ISR על קטלוג, `generateMetadata` מ-DB, `alternates.languages` ל-`he-IL`, JSON-LD Product+Offer (+ LocalBusiness לספק כשיש geo), sitemap index עם קובץ קטגוריות, CWV לפי PERFORMANCE-BUDGET + layout budgets מ-refs 380/768, ו-301/410 מ-`public.seo_redirects` דרך `src/lib/seo/redirects.ts`.**

אין מחיר שני ב-meta. אין אינדוקס Google דרך Meili. **No Escrow** בתיאורים. מחיר schema = מחיר קופה (agorot→ILS לתצוגה בלבד).

### 0.1 הבהרת מספר מיגרציה (חשוב)

| בקשה / שם נפוץ | מציאות ב-ke-arch |
|---|---|
| "`095_seo_redirects`" | **לא קיים.** מיגרציה `095` = `095_notification_outbox.sql` |
| טבלת SEO redirects | `public.seo_redirects` נוצרת ב-`030_catalog.sql` |
| קוד runtime | `src/lib/seo/redirects.ts` (מפת in-memory + TTL) |

כל אזכור ל-`095_seo_redirects` במסמכים ישנים = טעות שם. המקור המחייב: **030 + redirects.ts**.

---

## 1. Metadata (Next.js 15 App Router)

### 1.1 מוצר `/product/[slug]`

```ts
export const revalidate = 120

export async function generateMetadata({ params }): Promise<Metadata> {
  // title: seo_title_he ?? `${name_he} | KenyonExpress`
  // description: seo_description_he ?? תקציר + מחיר אתר (עברית)
  // alternates.canonical: `${site}/product/${slug}`
  // alternates.languages: { 'he-IL': canonical, 'he': canonical }
  // openGraph / twitter מאותם ערכים + תמונה absolute
}
```

| שדה | כלל |
|---|---|
| `title` | עברית; ~60 תווים; מותג בסוף |
| `description` | עברית; מה מקבלים + מחיר שנגבה באתר |
| `canonical` | בלי query |
| `alternates.languages` | `he-IL` (ראשי) + `he` → אותו canonical |
| `robots` | index רק אם `status=active` ו-`deleted_at IS NULL` |

קופון: בתיאור **מחיר האתר** + יתרה בעסק; לא להציג face כאילו שולם במלואו. אסור ניסוח Escrow.

### 1.2 קטגוריה `/category/[slug]`

| שדה | כלל |
|---|---|
| `title` | `{name_he} · דילים \| KenyonExpress` |
| `description` | `description_he` או משפט קבוע בעברית |
| `canonical` | `/category/{slug}` בלי filters |
| `hreflang` | `he-IL` / `he` כמו במוצר |
| פילטרים עמוקים | **noindex** (page>1 + sort ייחודי) |

### 1.3 Root / layout

- `lang="he"` + `dir="rtl"` ב-root layout.
- פונט מותג מ-`next/font` (Heebo לפי DESIGN).
- Default metadata base URL = דומיין קנוני `https://kenyonexpress.co.il`.

### 1.4 hreflang `he-IL`

| כלל | פירוט |
|---|---|
| ערך ראשי | `he-IL` |
| alias | `he` מצביע לאותו URL |
| x-default | אותו URL עברי (אין אנגלית בפרוד בשלב זה) |
| אין | זוגות שפה מפוברקים ל-URLs שלא קיימים |

כשיתווסף locale שני: רק אז `languages` עם מפתחות נפרדים ו-canonical per locale.

---

## 2. JSON-LD: Product + Offer + LocalBusiness

בונה יחיד:

```
src/lib/seo/json-ld.ts → buildProductJsonLd
```

| כלל | פירוט |
|---|---|
| `@type` | `Product` + nested `Offer` |
| `inLanguage` | `he-IL` |
| `name` / `description` | מ-`name_he` / `description_he` |
| קופון `Offer.price` | **מחיר האתר בלבד** (agorot/100 לתצוגת schema) |
| face / השוואה | property נפרד או טקסט; **לא** Offer יחיד על face |
| פיזי `Offer.price` | מחיר on-site |
| `priceCurrency` | `ILS` |
| `availability` | InStock / OutOfStock; בלי Offer במחיר 0 |
| `seller` | ארגון/ספק |

### 2.1 LocalBusiness (ספק / נקודת מימוש)

כשיש כתובת + geo מאומתים לספק:

```json
{
  "@type": "LocalBusiness",
  "name": "{supplier_name_he}",
  "address": { "@type": "PostalAddress", "addressCountry": "IL", "addressLocality": "..." },
  "geo": { "@type": "GeoCoordinates", "latitude": 0, "longitude": 0 },
  "url": "https://kenyonexpress.co.il/..."
}
```

כללים:

- אין LocalBusiness בלי קואורדינטות/כתובת מאומתות.
- קופון: LocalBusiness = מקום המימוש, לא "הפלטפורמה מחזיקה כסף".
- אפשר `@graph` שמקשר Product → Offer → seller/LocalBusiness.

דוגמת Product+Offer (קופון):

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

קטגוריה: `CollectionPage` + `ItemList` של URL מוצרים פעילים.

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

## 4. Core Web Vitals + תקציבי layout לפי 380 / 768

מקור תקציב זמנים מחייב:

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

### 4.1 Layout budgets ממדדי electro (storefront 1:1)

מקור:

```
refs/electro-measurements-380.md
refs/electro-measurements-768.md
refs/electro-components-map.md
```

סוכן UI חייב לשמור מקום (CLS) לפי הקופסאות האלה ב-home:

| אזור | 380×667 | 768×1024 | השפעה על CWV |
|---|---|---|---|
| Header `#masthead` | **380×55.52** | **768×55.52** | שמירת גובה header קבוע (בלי קפיצה ל-110 desktop) |
| Hero slider | **348×192** | **688×287** | LCP candidate: aspect שמור לפני טעינת תמונה |
| Hero parent block | **380×895** | **768×648** | אל תזיין ל-512 desktop row |
| DealsRow carousel | **350×430.41** | **690×396.22** | skeleton באותו גובה |
| ProductCard | **175×273.75** (img **147×147**) | **172.5×271.25** | width/height על img |
| Footer `#colophon` | **380×576.3** | **768×511.73** | לא קריטי ל-LCP; כן ל-CLS בתחתית |
| `.site-main` width | **350** | **690** | gutter 15px |

מדידת Lighthouse CI: להריץ (לפחות) על viewport **380** ו-**768** בנוסף למובייל ברירת מחדל של הכלי. רגרסיית Performance > 5 נקודות בלי הצדקה = כשל PR.

Desktop (≥1200): מספרים מ-`DESIGN-MEASURED.md` / `ELECTRO_HERO` (למשל hero **743×377**, header **110**). לא לערבב עם 380/768.

---

## 5. `seo_redirects` (030 + redirects.ts)

### 5.1 טבלה

מ-`030_catalog.sql`:

```sql
public.seo_redirects (
  old_path UNIQUE CHECK (^/),
  new_path CHECK (^/),
  status_code IN (301, 302, 307, 308, 410),
  source IN ('manual', 'wordpress_import', 'slug_change'),
  hits, last_hit_at, ...
)
```

פונקציה: `touch_seo_redirect(old_path)` (SECURITY DEFINER) לספירת hits.

### 5.2 Runtime

```
src/lib/seo/redirects.ts
```

| כלל | פירוט |
|---|---|
| Lookup | מפת in-memory + TTL ~5 דקות (לא query פר request) |
| סטטוס בפועל | 301 או 410 (לא 308 מ-`next.config redirects()`) |
| מקור אמת | הטבלה בלבד (החלטת MASTER: לא לפצל ל-build artefact) |
| נתיב | proxy / middleware לפני ה-app |
| WP import | שורות `source=wordpress_import` מ-staging |

אחרי שינוי slug מוצר/קטגוריה: trigger כותב 301 אוטומטי (`slug_change`).

---

## 6. ISR / cache

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

## 7. Meilisearch ודפי SEO

| מערכת | תפקיד |
|---|---|
| Google | HTML + sitemap + JSON-LD |
| Meilisearch | חיפוש/השלמות **בתוך** האתר |

| סוג דף | אינדוקס |
|---|---|
| `/search?q=` | **noindex** |
| `/category/{slug}` | index |
| דפי עיר | index רק עם תוכן ייחודי |
| doorway מ-Meili hits | אסור |

דירוג Meili: רלוונטיות עברית; **אין** boost לפי `platform_percent`.

---

## 8. OG

מוצר: תמונה ראשית absolute 1200×630. קטגוריה: תמונת קטגוריה או מותג. `twitter:card = summary_large_image`.

---

## 9. Acceptance

- [ ] `generateMetadata` עברי + `alternates.languages` `he-IL`/`he`
- [ ] JSON-LD Offer = מחיר קופה; LocalBusiness רק עם geo מאומת
- [ ] sitemap index + `sitemap-categories.xml`
- [ ] CWV לפי PERFORMANCE-BUDGET
- [ ] Layout CLS budgets לפי טבלת 380/768 §4.1
- [ ] `seo_redirects` דרך redirects.ts (301/410); לא next.config 308
- [ ] אין בלבול עם מיגרציה 095 (outbox)
- [ ] ISR על PDP; checkout `no-store`
- [ ] `/search` noindex; Meili ≠ Google
- [ ] אין Escrow ב-meta/תיאורים

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | ISR / sitemap / schema / CWV |
| 2026-08-10 | metadata, JSON-LD, OG, תקציב פר דף, Meili מול Google |
| 2026-08-11 | sitemap לפי קטגוריה, PERFORMANCE-BUDGET, דפי SEO מול Meili |
| 2026-08-11 | דוגמת JSON-LD Product+Offer בעברית |
| 2026-08-11 | hreflang he-IL, LocalBusiness, CWV+layout @ 380/768 refs, seo_redirects מ-030 (תיקון שם 095) |
