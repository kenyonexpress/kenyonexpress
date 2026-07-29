# ARCHITECTURE-SEO-PERFORMANCE.md

ארכיטקטורת SEO וביצועים ל-KenyonExpress (מסמך מחייב).

Status: BINDING for `arch/admin-supplier` (2026-07-30)
Worktree בלבד: `/Users/ofir/kenyonexpress-web/ke-arch`. **Documentation only.**
Stack: **Next.js 15** App Router (RSC), עברית RTL, host קנוני `kenyonexpress.co.il`.
Companions: `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-MOBILE-APP.md`, `docs/ARCHITECTURE-WP-MIGRATION.md`.

---

## 0. כסף על משטחי SEO

| סוג | מחיר ב-Offer / meta | אסור |
|---|---|---|
| קופון | `coupon_price_ils` (תשלום מלא באתר) | לגזור אחוז משווי; Escrow; `platform_percent` ללקוח |
| פיזי | מחיר אחרי `discount_percent` | לקרוא אחוז חי אחרי קנייה במקום סנאפשוט |

ארגון ב-JSON-LD של הבית = המרקטפלייס. `seller` ב-PDP = הספק. אין עמלה קבועה בטקסט.

---

## 1. Next.js 15: SSR / ISR לפי סוג דף

| דף | נתיב | מצב | `revalidate` / cache | למה |
|---|---|---|---|---|
| בית | `/` | **ISR** | 120s; tag `home` | דילים טריים בלי DB בכל request |
| קטגוריה | `/category/[slug]` | **ISR** | 300s; `category:{id}`, `catalog` | קטלוג משתנה לאט יותר מ-PDP |
| מוצר (קופון/פיזי) | `/product/[slug]` | **ISR** | 120s; `product:{id}`, `catalog` | שינוי מחיר/תוכן → on-demand revalidate |
| אינדקס מוצרים | `/products` | **ISR** | 180s; `catalog` | רשימה |
| עגלה | `/cart` | **Dynamic SSR** פרטי | `private, no-store` | סשן/קוקי; אסור CDN ציבורי |
| checkout / account | `/checkout*`, `/account/**` | Dynamic פרטי | `private, no-store` | כסף + auth |
| חיפוש | `/search` | Dynamic | `s-maxage=30, swr=60` | noindex; Meilisearch |
| sitemap | `/sitemap.xml` | ISR | 3600s; `sitemap` | קריאה מ-Supabase |
| admin / supplier | `/admin/**`, `/supplier/**` | Dynamic פרטי | `private, no-store` | צוות |

כללי זהב:

- נתיב קטלוג ציבורי: לקוח anon/RLS + `next: { tags, revalidate }`. **בלי** service-role ב-HTML ציבורי.
- אחרי פרסום באדמין: `revalidateTag` למוצר, catalog, sitemap, ו-home אם featured.
- HTML של עגלה לא משותף בין משתמשים ב-edge.

---

## 2. SEO עברי RTL

Root: `lang="he"` `dir="rtl"`.

### 2.1 Meta (`generateMetadata`)

| Meta | מוצר | קטגוריה | בית | עגלה |
|---|---|---|---|---|
| `title` | `seo_title` או `{name_he} \| קניון אקספרס` | `{name_he} \| קניון אקספרס` | מותג + ערך | כותרת + noindex |
| `description` | 120–160 תווים עברית | תיאור קטגוריה | ברירת מחדל עברית | n/a |
| `canonical` | `/product/{slug}` | `/category/{slug}` | `/` | self + noindex |
| `og:locale` | `he_IL` | `he_IL` | `he_IL` | |
| `og:image` | גלריה R2 מוחלט | קטגוריה / OG אתר | OG / hero | |
| `robots` | index אם published | index | index | `noindex,nofollow` |

מחיר בתיאור (אופציונלי): רק סכום לתשלום באתר ב-`₪X.XX`.

### 2.2 hreflang

```html
<link rel="alternate" hreflang="he-IL" href="https://kenyonexpress.co.il/..." />
<link rel="alternate" hreflang="he" href="https://kenyonexpress.co.il/..." />
<link rel="alternate" hreflang="x-default" href="https://kenyonexpress.co.il/..." />
```

בלי חלופה באנגלית עד שתהיה חנות EN.

### 2.3 On-page

H1 יחיד = `name_he`. פירורי לחם בעברית. slug יציב ASCII. פרטי ספק בכל PDP.

נתיבים פרטיים (`/cart`, `/checkout`, `/account`, `/admin`, `/supplier`, `/redeem`, `/search`): noindex (+ disallow ב-robots לפי הטבלה למטה).

---

## 3. JSON-LD: Product / Offer / Organization

מחירים: מחרוזת עשרונית ILS. `priceCurrency`: `"ILS"`.

### Organization (בית)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "קניון אקספרס",
  "url": "https://kenyonexpress.co.il/",
  "logo": "https://cdn…/logo.png"
}
```

### Product + Offer (PDP)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "{name_he}",
  "image": ["https://r2…/…"],
  "description": "{short}",
  "offers": {
    "@type": "Offer",
    "url": "https://kenyonexpress.co.il/product/{slug}",
    "priceCurrency": "ILS",
    "price": "{on_site_charge_ils}",
    "availability": "https://schema.org/InStock",
    "seller": {
      "@type": "Organization",
      "name": "{supplier.name}",
      "telephone": "{supplier.phone}",
      "address": "{supplier.address}"
    }
  }
}
```

| סוג | `offers.price` |
|---|---|
| קופון | `coupon_price_ils` |
| פיזי | מחיר אחרי הנחה |

בלי `AggregateRating` מזויף. בלי `platform_percent` ב-Offer. BreadcrumbList: בית → קטגוריה → מוצר.

---

## 4. Core Web Vitals + תמונות (R2 + next/image)

### יעדים (p75 מובייל)

| מדד | יעד |
|---|---|
| LCP | &lt; 2.5s |
| CLS | &lt; 0.1 |
| INP | &lt; 200ms |

### לפי דף

| דף | LCP | CLS | INP |
|---|---|---|---|
| בית | hero עם `priority` | יחס קבוע ל-hero | מינימום JS |
| קטגוריה | שורת כרטיסים ראשונה | `aspect-ratio` לכרטיס | רשימת RSC |
| מוצר | `gallery[0]` priority | גלריה + בלוק מחיר יציבים | ATC קטן |
| עגלה | פרטי; INP חשוב מ-SEO | שורות יציבות | בלי צד ג' כבד |

### R2 + `next/image`

- אחסון ב-Cloudflare R2; `R2_PUBLIC_BASE_URL` ציבורי.
- `images.remotePatterns` מאפשר את ה-host.
- AVIF → WebP → fallback.
- Srcset בערך: 320, 640, 960, 1280, 1920; כרטיסים עד ~640.
- Alt בעברית; OG = URL מוחלט ל-R2 (לא URL של האופטימייזר).
- רק first viewport עם `priority`.

אסור בקטלוג: תמונות בלי מידות, כותרת/מחיר client-only, צ'אט חוסם LCP.

---

## 5. Sitemap + robots מ-Supabase

### `src/app/sitemap.ts`

| מקטע | מקור | priority |
|---|---|---|
| `/` + משפטי | סטטי | 1.0 / 0.5 |
| קטגוריות | קטגוריות חיות | 0.8 |
| מוצרים | published/active בלבד | 0.9 |

`lastModified` = `updated_at`. ISR 3600 + tag `sitemap`.

**לא לכלול:** טיוטות, archived, needs-pricing, `/redeem`, `/search`, `/cart`, `/checkout`, `/account`, `/admin`, `/supplier`, API.

### `src/app/robots.ts`

- Allow לקטלוג
- Disallow: `/admin`, `/account`, `/supplier`, `/api`, `/checkout`, `/cart`, `/login`, `/search`, `/redeem`
- `Sitemap: https://kenyonexpress.co.il/sitemap.xml`

### Revalidate

פרסום/הסרה באדמין → tags של מוצר + `sitemap` + `catalog`. ייבוא המוני → בסוף job. GSC ממקד ישראל; 301 מ-`seo_redirects` ב-edge אחרי cutover מ-WP.

---

## 6. Meilisearch וקישורים פנימיים

| משטח | התנהגות |
|---|---|
| `/search` | שאילתת Meilisearch; noindex |
| "מוצרים דומים" ב-PDP | related מ-Meili כ-`<a href="/product/{slug}">` עם עוגן עברי |
| קטגוריה דלה | הצעות sibling + top hits |
| מסילות בית | featured מ-DB; אופציונלי popular מ-Meili |

מסמך אינדקס: `id`, `slug`, `name_he`, קטגוריות, מחיר לתצוגה, `status`. בפרסום: upsert ל-Meili + revalidate HTML (HTML לא מחכה ל-Meili ל-ISR).

---

## 7. שכבות cache

```
Browser
  -> Vercel Edge (ISR HTML, static, next/image)
  -> Next data cache / fetch tags
  -> Upstash Redis (מפתחות חמים אופציונליים)
  -> Supabase / Meilisearch
```

| שכבה | מה | TTL / ביטול |
|---|---|---|
| Vercel Edge | ISR לפי §1; static immutable | on-demand tags |
| Next fetch | קריאות RSC עם tags | `revalidateTag` |
| Upstash | רשימות קטגוריה חמות, cache לתוצאות חיפוש פופולריות, מוני rate-limit | 30–300s + מחיקה בפרסום |
| Meilisearch | מסמכי חיפוש | upsert/delete לפי סטטוס |

לא לשמור HTML של cart/checkout/account ב-CDN ציבורי. לא לשמור כרטיסים או service-role ב-Redis.

---

## 8. Lighthouse CI (GitHub Actions)

Job על PRs שנוגעים ב-`src/app/**` / קומפוננטות / SEO (בהתחלה advisory; אחר כך required).

| נתיב | Performance | LCP | CLS | TBT |
|---|---|---|---|---|
| `/` | ≥ 0.85 | ≤ 2500ms | ≤ 0.1 | ≤ 300ms |
| קטגוריה דמו | ≥ 0.85 | ≤ 2500ms | ≤ 0.1 | ≤ 300ms |
| מוצר דמו | ≥ 0.85 | ≤ 2500ms | ≤ 0.1 | ≤ 350ms |
| `/cart` | ≥ 0.80 | n/a SEO | ≤ 0.1 | ≤ 400ms |

בדיקת עשן נוספת: `lang=he` / `dir=rtl` במסמך.

---

## 9. Edge + host

- `metadataBase` = host קנוני בלבד.
- Middleware/proxy: `seo_redirects` כ-301 לפני render; לא לקשח כ-200.
- אזור edge קרוב לישראל (לרוב `fra1`).

---

## 10. Acceptance

- [ ] מצבי ISR/SSR לפי §1 לבית/קטגוריה/מוצר/עגלה
- [ ] Meta עברי + `hreflang=he-IL` + canonical
- [ ] JSON-LD Offer במחיר תשלום באתר (ILS); seller = ספק
- [ ] Sitemap מ-Supabase; robots חוסם פרטיים
- [ ] R2 + next/image; LCP מתועדף
- [ ] קישורים פנימיים מ-Meilisearch כ-`<a href>`
- [ ] Edge + Upstash; עגלה לא ב-cache ציבורי
- [ ] תקציב Lighthouse CI מוגדר
- [ ] בלי Escrow / עמלה קבועה ב-meta או schema

---

## 11. Related

`docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-WP-MIGRATION.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-MOBILE-APP.md`.
