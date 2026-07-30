# ARCHITECTURE-SEO-PERFORMANCE.md

ארכיטקטורת **SEO + ביצועים** לחנות KenyonExpress (Next.js 15 App Router).

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד.  
Companions: `ARCHITECTURE-PERFORMANCE.md` (ke-arch-performance), `ARCHITECTURE-SEO.md` / sitemap, `refs/` visual gates, Go-Live checklist.

Stack: Next.js App Router, RSC, Meilisearch (חיפוש), R2/images, Hebrew RTL, Heebo, brand `#fed700`.

---

## 0. יעדים

| מדד | יעד |
|---|---|
| LCP (mobile, מפתח) | ≤ 2.5s |
| CLS | ≤ 0.1 |
| INP | ≤ 200ms |
| Lighthouse Perf (home/PDP) | ≥ 90 (או חריג מתועד ב-Go-Live) |
| Lighthouse a11y | ≥ 90 |
| Core pages indexable | home, category, product, content |
| Visual diff vs refs | לפי סף `compare.mjs` בדפי מפתח |

עקרון: **Web = ערוץ רכישה SEO.** אפליקציה לא מחליפה אינדוקס.

---

## 1. SEO טכני

### 1.1 Metadata

כל דף ציבורי:

- `title` ייחודי בעברית (תבנית: `{שם} | KenyonExpress`)
- `description` 140–160 תווים, מחיר/ערך בלי לשקר מול `coupon_price`
- `alternates.canonical` אבסולוטי על דומיין הפרוד
- Open Graph + Twitter עם תמונה אמיתית של המוצר/קטגוריה
- `robots`: noindex על `/account/**`, `/checkout/**`, `/admin/**`, `/supplier/**`, APIs

### 1.2 URL

| ישות | תבנית |
|---|---|
| בית | `/` |
| קטגוריה | `/category/[slug]` או הקיים בפרויקט |
| מוצר | `/product/[slug]` |
| חיפוש | `/search?q=` (noindex או index עם זהירות על פרמטרים) |

חוקים: slug יציב בעברית/לטינית; הפניות 301 מ-WP ישן לפי טבלת מיפוי; בלי query כפול לתוכן קנוני.

### 1.3 Sitemap / robots

```
/robots.txt  → Allow / ; Disallow account, checkout, admin, supplier
/sitemap.xml → products + categories + static (chunked אם >50k)
```

רענון sitemap אחרי publish מוצר.  
`lastmod` מ-`updated_at`.

### 1.4 Structured data (JSON-LD)

| דף | סוג |
|---|---|
| מוצר | `Product` + `Offer` (מחיר = מחיר לתשלום באתר לקופון: `coupon_price`) |
| ארגון | `Organization` בבית |
| פירורים | `BreadcrumbList` |

אסור לשים מחיר מחירון כ-Offer אם הלקוח משלם באתר רק את מחיר הקופון.

### 1.5 תוכן SEO

- H1 יחיד לכל דף
- תיאור מוצר אמיתי (לא רק ספאם מילות מפתח)
- תמונות עם `alt` בעברית תיאורי
- דפי קטגוריה: טקסט קצר מעל/מתחת לגריד (לא חוסם LCP)

---

## 2. ביצועים (App Router)

### 2.1 רינדור

| משטח | אסטרטגיה |
|---|---|
| Home / category / PDP | RSC + cache tags; revalidate on publish |
| חיפוש | edge/server עם Meili; לא לגרור את כל הקטלוג לדפדפן |
| Account / checkout | dynamic, noindex |
| תמונות | `next/image` או loader ל-R2; sizes נכונים ל-RTL grid |

### 2.2 תקציב JS

- הימנע מ-client components כבדים ב-hero
- Zustand cart: bundle קטן; לא לגרור את כל עמוד התשלומים ל-home
- Fonts: Heebo דרך `next/font` עם subset
- שלישיים: Cardcom רק ב-checkout; אנליטיקה אחרי idle/consent

### 2.3 תמונות ו-LCP

- Hero: עדיפות `priority` / preload לתמונה אחת בלבד
- שאר הגריד: lazy
- פורמט AVIF/WebP
- מימדים שמורים למניעת CLS (חשוב לכרטיסי מוצר 485px וכו' לפי מדידות)

### 2.4 Caching

```
CDN (Vercel) → RSC payload / static
Supabase → לא לחשוף service role
Meilisearch → אינדקס נפרד, לא DB לכל keystroke בלי debounce
```

Tag invalidation: `product:{id}`, `category:{slug}`, `home`.

---

## 3. מדידה ושערים

| כלי | שימוש |
|---|---|
| Lighthouse CI | PR על home + product |
| `compare.mjs` | רגרסיה ויזואלית מול `refs/` |
| Web Vitals (RUM) | אופציונלי אחרי GA |
| Search Console | אחרי DNS |

שערי Go-Live: ראה `ARCHITECTURE-GO-LIVE-CHECKLIST.md` §7.

---

## 4. RTL / מותג והשפעה על perf

- `dir=rtl` ב-`<html>` (לא JS שמחליף אחרי paint)
- Heebo לא חוסם: `display: swap` / next/font
- צהוב `#fed700` ב-CSS variables (לא תמונות ענק למותג)

---

## 5. אנטי-דפוסים אסורים

1. מחיר ב-meta/JSON-LD שלא תואם קופה
2. `adminClient` בנתיב רנדור ציבורי בלי צורך
3. טעינת כל הסליידר ב-eager (רק slide פעיל ל-LCP)
4. Index ל-URLs עם session/cart params
5. Make/Zapier ל-sitemap

---

## 6. מפת קבצים (יעד)

```
src/app/sitemap.ts / sitemap/*.ts
src/app/robots.ts
src/app/(store)/product/[slug]/page.tsx  metadata + JSON-LD
src/app/(store)/layout.tsx               fonts
src/lib/seo/*
next.config.ts                           images remotePatterns
```

---

## 7. טסטים

| # | בדיקה |
|---|---|
| S1 | canonical + title על PDP |
| S2 | noindex על `/account` |
| S3 | JSON-LD Offer = coupon_price לקופון |
| S4 | Lighthouse perf/a11y על preview |
| S5 | compare.mjs home/product תחת סף |

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-07-31 | רענון מחייב SEO+Performance ל-`arch/docs-queue` |
