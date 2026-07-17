# ARCHITECTURE-PERFORMANCE: ארכיטקטורת ביצועים מחייבת

**סטטוס:** מחייב (Binding). כל סעיף כאן הוא החלטה סגורה, לא הצעה.
**תאריך:** 2026-07-17
**בעלים:** Performance Architect
**תלות:** נכתב מול Next.js 16.2.4 (נבדק מול `node_modules/next/dist/docs/`), Supabase Postgres 17.6, Vercel, מיגרציות 001-035.
**הערת בעלות:** מסמך זה חי ב-`perf-arch/` בלבד. שינויי קוד ומיגרציות המפורטים כאן מיושמים על ידי בעלי `src/` ו-`supabase/` בהתאמה. SQL מוצע כאן מסומן כטיוטה למיגרציה 037+.

---

## 0. תמצית החלטות (TL;DR)

| # | החלטה | ערך |
|---|-------|-----|
| D-1 | מודל caching | `cacheComponents: true` (Cache Components + PPR). לא המודל הישן. מופעל עכשיו, לפני בניית checkout |
| D-2 | דף הבית | PPR: שלד סטטי + `use cache` עם revalidate של 300 שניות |
| D-3 | דף מוצר | `use cache` עם revalidate של 3600 שניות + אינבלידציה מיידית בכל מוטציית אדמין (`updateTag`) ובכל webhook תשלום (`revalidateTag`) |
| D-4 | קטגוריה | עמוד 1 ללא פילטרים cached (3600 שניות + tags); פילטר/מיון/עמוד 2+ דינמי בתוך Suspense |
| D-5 | עגלה/צ'קאאוט/חשבון/אדמין | דינמי מלא, ללא cache, עטוף Suspense |
| D-6 | Redis (Upstash) | לא עכשיו. טריגרים מדידים בסעיף 2.4 |
| D-7 | תמונות | הכל עובר ל-`next/image` (כולל כרטיסי מוצר וגלריה). AVIF+WebP, `qualities: [60, 75, 90]`. GIF בהירו מוחלף ב-video או AVIF סטטי |
| D-8 | תקציב LCP דף בית | p75 עד 2.0 שניות, תמונת הירו עד 200KB, עם `preload` על הסלייד הפעיל |
| D-9 | RUM | Vercel Speed Insights (ראשי) + `useReportWebVitals` אל `/api/a` (משני) + Lighthouse CI חוסם ב-PR |
| D-10 | Pooling | בזמן ריצה: PostgREST בלבד (supabase-js). אסור pg driver ישיר בפונקציות Vercel. Supavisor transaction mode רק אם יידרש SQL ישיר בעתיד |
| D-11 | אינדקסים | 8 אינדקסים חדשים (סעיף 5.2), טיוטת מיגרציה 037 |
| D-12 | יעד עומס | תכנון ל-30,000 סשנים ביום באירוע מכירה, שיא 100 RPS קטלוג עם פגיעת CDN של 90% ומעלה |

---

## 1. אסטרטגיית רינדור לכל ראוט

### 1.1 ההחלטה המערכתית: Cache Components מופעל עכשיו

ב-Next 16 יש שני עולמות caching שאינם מתקיימים יחד. מופעל `cacheComponents: true` ב-`next.config.ts` באופן מיידי, לפני בניית checkout וה-listing, משלוש סיבות:

1. אין בקוד אף `export const revalidate` או `dynamic` (נבדק: אפס hits בכל `src/`), כלומר אין עלות מיגרציה. זה הרגע הזול ביותר להחליף מודל.
2. תחת Cache Components, PPR הוא ברירת המחדל: שלד סטטי מה-CDN + חורים דינמיים בסטרימינג. זה בדיוק הפרופיל הנכון לחנות שבה הקטלוג ציבורי והמשתמש (header, עגלה) אישי.
3. המודל הישן (`export const revalidate`) מוגדר בתיעוד Next 16 כ-"Previous Model" ו-`unstable_cache` מסומן כמוחלף. לא בונים על API יוצא.

השלכות מחייבות על הקוד (בעלי `src/` מיישמים):

- כל קריאת קטלוג אנונימית עוברת לקליינט Supabase ללא עוגיות (קובץ חדש `src/lib/supabase/public.ts` עם `createClient` על anon key בלבד, בלי `cookies()`). רק כך מותר לקרוא נתונים בתוך scope של `use cache`.
- כל קריאה תלוית משתמש (session, עגלה, הרשאות) נשארת על `src/lib/supabase/server.ts` ועטופה `<Suspense>`.
- ה-layouts של הקבוצות `(admin)` ו-`(account)` עוטפים את `children` ב-`<Suspense fallback={null}>`: כל הקבוצה דינמית בכוונה, בלי שגיאות build של `blocking-route`.
- ה-Header נחתך: שלד סטטי בשרת, ומצב משתמש + מונה עגלה כ-client island קטן (נדרש ממילא לפי ARCHITECTURE-API-CONTRACTS, אחרת שום דף קטלוג לא ייכנס לשלד הסטטי).

פרופילי `cacheLife` מוגדרים ב-`next.config.ts`:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheLife: {
    home:    { stale: 300, revalidate: 300,  expire: 86400 },   // דף בית
    catalog: { stale: 300, revalidate: 3600, expire: 86400 },   // מוצר, קטגוריה, עץ קטגוריות
    coupons: { stale: 300, revalidate: 300,  expire: 3600 },    // רשימות קופונים
  },
}
```

### 1.2 טבלת ראוטים מחייבת

הנימוק לזמני revalidate: מוצרים ומחירים משתנים אך ורק דרך פאנל האדמין (עשרות מוצרים, אין סנכרון חי; `scripts/sync-live-products.mjs` הוא כלי השוואה לקריאה בלבד). לכן האינבלידציה האמיתית היא מבוססת tags בכל מוטציה, וה-revalidate הזמני הוא רשת ביטחון בלבד. קופונים ודילים כן פגים מעצם חלוף הזמן (`valid_until`, `expires_at`), ולכן מקבלים חלון קצר של 300 שניות.

| ראוט | מצב רינדור | revalidate | tags | הערות |
|------|-----------|-----------|------|-------|
| `/` (בית) | PPR: שלד + סקשנים cached | `home` (300s) | `hero`, `products`, `deals` | ההירו, פס הקטגוריות ו-DealsOfTheDay נכנסים לשלד. כשהגריד יעבור מ-constants ל-DB: פונקציה אחת `use cache` עם שאילתה אחת |
| `/category/[slug]` עמוד 1 נקי | PPR: גריד cached | `catalog` (3600s) | `category:<id>`, `products` | כולל breadcrumb ותתי קטגוריות |
| `/category/[slug]` עם `?sort` / `?page` | דינמי בתוך Suspense | אין | אין | searchParams אוסרים cache. שלד העמוד (כותרת, צ'יפים) נשאר סטטי |
| `/products` | PPR: גריד cached | `catalog` (3600s) | `products` | |
| `/products/[slug]` (מוצר; כולל 301 מ-`/product/[slug]`) | PPR: מוצר + related cached | `catalog` (3600s) | `product:<id>`, `category:<id>` | `generateStaticParams` מחזיר את המוצרים המוצגים בבית + `is_featured` (חובה לפחות פרמטר אחד תחת Cache Components). השאר נבנים on-demand |
| `/coupons`, `/coupons/[slug]` | PPR: רשימה cached | `coupons` (300s) | `coupons`, `coupon:<id>` | חלון קצר בגלל `valid_until` |
| `/search` | דינמי מלא | אין | אין | RSC על RPC `search_products`. noindex |
| `/api/catalog/autocomplete` | Route Handler + CDN | אין (CDN בלבד) | אין | `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` (כבר מוגדר בחוזים) |
| `/cart`, `/checkout*` | דינמי מלא | אין | אין | תלוי עוגייה וזהות. אסור לכל שכבת cache לגעת במחירי checkout: המחיר נפתר בשרת בתוך `beginCheckout` |
| `/account/*` | דינמי מלא | אין | אין | |
| `/admin/*` | דינמי מלא | אין | אין | `requireAdminSession` בכל בקשה. אין cache בכוונה: אדמין רואה תמיד אמת עדכנית. `dnd-kit` וטבלאות האדמין חייבים להישאר מחוץ ל-bundle של החנות (code-split ברמת route group, לוודא ב-bundle analyzer) |
| `/r/[code]` | דינמי (redirect 302) | אין | אין | |
| `/auth/callback`, cron, webhooks | דינמי מלא | אין | אין | Node runtime. `runtime: 'edge'` אסור בכל הפרויקט (לא נתמך עם Cache Components) |

### 1.3 אינבלידציה: מי מפיל איזה tag

| אירוע | קריאה | tags |
|-------|-------|------|
| אדמין יוצר/מעדכן/מוחק מוצר | `updateTag` בתוך ה-Server Action (read-your-writes בפאנל) | `product:<id>`, `products`, `category:<id>` של הקטגוריות המשויכות |
| אדמין מעדכן קטגוריה | `updateTag` | `categories`, `category:<id>`, `products` |
| אדמין מעדכן hero slide | `updateTag` | `hero` |
| אדמין מעדכן דיל/קופון | `updateTag` | `coupons`, `coupon:<id>` |
| webhook תשלום מוריד מלאי / sold_out | `revalidateTag('product:<id>', 'max')` בתוך ה-Route Handler | `product:<id>` |
| `expire_coupons()` (cron) | אין קריאה יזומה | מתכסה על ידי revalidate של 300s ברשימות קופונים |

כלל: ב-Server Actions משתמשים ב-`updateTag` (מיידי + רענון באותה בקשה). ב-Route Handlers משתמשים ב-`revalidateTag(tag, 'max')`. ב-Next 16 הפרמטר השני חובה; קריאה בפרמטר יחיד היא deprecated.

---

## 2. שכבות Caching

### 2.1 שכבה 1: Vercel CDN (Edge)

- דפי PPR עם שלד סטטי מקבלים מ-Next כותרות `s-maxage` + `stale-while-revalidate` אוטומטית מתוך `cacheLife`. אין לגעת בזה ידנית.
- `/_next/static/*` מקבל `immutable` שנה. תמונות `public/` מקבלות cache דרך Vercel Image Optimization (סעיף 3).
- Route Handler יחיד עם CDN cache ידני: autocomplete (לפי החוזה B2).
- Function region: `fra1` (הוחלט ב-MASTER). ה-CDN גלובלי ממילא; קהל ישראלי מקבל edge קרוב, ו-origin בפרנקפורט מול Supabase ב-`eu-central-1` באותו אזור.
- אסור לחתוך את פרמטר `_rsc` או את כותרת `rsc` בשום שכבת proxy או CDN חיצוני עתידי (שובר ניווט client-side).

### 2.2 שכבה 2: Next.js Data Cache (`use cache`)

שכבת הנתונים היחידה של הקטלוג. פונקציות ב-`src/server/data/` (או מקבילה שיקבעו בעלי `src/`), כולן על הקליינט האנונימי ללא עוגיות:

| פונקציה | פרופיל | tags |
|---------|--------|------|
| `getHomeFeed()` (הירו + דילים + קטגוריות, שאילתה אחת לכל סקשן) | `home` | `hero`, `products`, `deals` |
| `getProductBySlug(slug)` | `catalog` | `product:<id>`, `products` |
| `getRelatedProducts(productId, categoryId)` | `catalog` | `category:<id>`, `products` |
| `getCategoryWithChildren(slug)` | `catalog` | `categories`, `category:<id>` |
| `getCategoryProductsPage1(categoryId)` | `catalog` | `category:<id>`, `products` |
| `getActiveCouponDeals()` | `coupons` | `coupons` |
| `getCategoryTree()` (ניווט) | `catalog` | `categories` |

כללים:

- `generateMetadata` קורא לאותן פונקציות cached כמו הדף. זה מחסל את השאילתה הכפולה הקיימת היום בדפי מוצר וקופון (metadata + page רצים היום כל אחד עם שאילתה משלו).
- בנוסף, כל פונקציה עטופה גם ב-`React.cache()` לדדופ בתוך אותו render pass.
- חיפוש, פילטרים, עמוד 2+ ו-facets דינמיים: לא נכנסים ל-cache (המפתח משתנה יותר מדי, פגיעה נמוכה).
- `'use cache: remote'` ו-`'use cache: private'` לא בשימוש בשלב זה.

### 2.3 שכבה 3: דפוסי שאילתות Supabase

- זמן ריצה: PostgREST בלבד דרך `@supabase/ssr` / `supabase-js`. בלי חיבורי Postgres ישירים מפונקציות Vercel. החבילות `drizzle-orm` ו-`postgres` שקיימות ב-`package.json` אסורות לשימוש בזמן ריצה (מותרות בסקריפטים מקומיים בלבד); אם לא ייכנסו לשימוש עד גמר ה-checkout, להסירן.
- דף מוצר יורד מ-5 סיבובי רשת עוקבים ל-2 מקביליים: `getProductBySlug` (מוצר + variants + קטגוריה ב-select אחד עם embed) ו-`getRelatedProducts` (RPC יחיד, סעיף 5.3), שניהם מתוך ה-cache ברוב הבקשות.
- pagination בקטגוריה נשאר offset עם `count: 'exact'` עד 30,000 מוצרים פעילים (סף Meilisearch שכבר נקבע). אין לגעת.

### 2.4 שכבה 4: Upstash Redis. החלטה: לא עכשיו

בהיקף הנוכחי (עשרות מוצרים, אלפי לקוחות) Redis הוא הנדסת יתר. Rate limiting נשאר על טבלאות Postgres (`rate_limits`, `user_rate_limits`, `check_my_rate_limit`) עם ניקוי שעתי ב-cron כמתוכנן.

מכניסים Upstash Redis (ל-rate limiting תחילה) כאשר מתקיים אחד מאלה, לפי מדידה ולא לפי תחושה:

| טריגר | מדד | סף |
|-------|-----|-----|
| T-1 | כתיבות לטבלאות rate-limit בשיא (pg_stat_statements) | מעל 25 כתיבות בשנייה למשך 10 דקות רצופות |
| T-2 | CPU של ה-DB בשיא שבועי | מעל 60% כאשר פונקציות rate-limit בין 5 הכבדות ב-total_exec_time |
| T-3 | תנועה | מעל 200,000 אירועי analytics בחודש (הסף שכבר קבוע ב-ARCHITECTURE-ANALYTICS) |

הבדיקה רבעונית, ובחובה שבוע לפני כל אירוע מכירה מתוכנן.

---

## 3. צינור תמונות

### 3.1 תצורת `next.config.ts` (מחייב)

```ts
images: {
  formats: ['image/avif', 'image/webp'],
  qualities: [60, 75, 90],          // ברירת מחדל ב-Next 16 היא [75] בלבד; 95 מבוטל
  minimumCacheTTL: 2678400,          // 31 ימים; תמונות מוצר אינן משתנות תחת אותו URL
  remotePatterns: [
    { protocol: 'https', hostname: '*.supabase.co' },
  ],
},
```

- דומייני unsplash יורדים מה-allowlist לפני production (נכסי דמו בלבד).
- שינוי גרסת תמונה נעשה תמיד על ידי שינוי נתיב/שם קובץ, לא על ידי החלפת תוכן באותו URL (בגלל ה-TTL הארוך).
- ב-Next 16 הפרופ `priority` הוחלף ב-`preload`. כל שימוש חדש כותב `preload`.

### 3.2 מקור התמונות

- מוצרים חיים: Supabase Storage, bucket `product-images`, מועלים כ-WebP מוכן, רוחב מקסימלי 1600px, איכות 80 (כפי שנקבע במסמך המיגרציה). `next/image` מבצע את ההקטנה וההמרה ל-AVIF. `storage.image_transformation` נשאר כבוי (free tier); נדלק רק אם ניפגע בתקרת source images של Vercel (1,000 ב-Hobby), וגם אז רק אחרי מעבר ל-Supabase Pro.
- נכסי דף הבית (הירו, דילים סטטיים): נשארים ב-`public/images/` וזה נכון. הם מוגשים דרך Vercel Image Optimization באותו מנגנון.

### 3.3 מטריצת פורמט/גודל (מחייב)

כל התמונות עוברות ל-`next/image` (דרך `SmartImage`). היום כרטיסי המוצר והגלריה משתמשים ב-`<img>` גולמי בלי srcset ובלי מידות: זה באג הביצועים הגדול ביותר בקוד הקיים אחרי היעדר ה-cache.

| שימוש | sizes | quality | פורמט מוגש | תקציב משקל לתמונה |
|-------|-------|---------|------------|---------------------|
| כרטיס מוצר בגריד (2-4 עמודות) | `(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw` | 60 | AVIF (WebP fallback) | עד 40KB |
| תמונת גלריה ראשית בדף מוצר | `(max-width: 768px) 100vw, 600px` | 75 | AVIF | עד 120KB |
| thumbnails בגלריה | `80px` | 60 | AVIF | עד 10KB |
| סליידר הירו | `(max-width: 1024px) 100vw, 1200px` | 75 | AVIF | עד 200KB |
| באנרים צדדיים / אייקוני קטגוריה | `100px` / `80px` | 75 | AVIF | עד 15KB |
| OG / WhatsApp | 1200x630 קבוע | 75 | WebP/JPEG | עד 300KB (חוזה קיים) |

- `loading="lazy"` (ברירת המחדל של next/image) לכל מה שמתחת לקפל; `preload` רק לתמונת ה-LCP.
- לכל תמונה נקבעים `width`/`height` או `fill` בתוך מיכל עם מידות קבועות. אפס תמונות בלי רזרבציית שטח (CLS).

### 3.4 הירו ותקציב LCP

מצב היום: הסלייד הראשון הוא GIF מונפש המוגש `unoptimized`, וה-`priority` מוצמד לאינדקס 0 בעוד שהסלייד ההתחלתי בפועל הוא `rs-19`. כלומר תמונת ה-LCP לא מקבלת קדימות והמשקל לא חסום. שתי תקלות, שני תיקונים מחייבים:

1. GIF מונפש אסור בהירו. ההנפשה מומרת ל-`<video muted autoplay loop playsinline poster=...>` (H.264/WebM) או מוחלפת ב-AVIF סטטי. יעד: עד 300KB לוידאו של הסלייד, עד 200KB לתמונה.
2. הסלייד ההתחלתי (ולא בהכרח אינדקס 0) מקבל `preload` + נשלח כ-HTML בשלד הסטטי. שאר הסליידים `loading="lazy"` ונטענים אחרי hydration.

תקציב LCP להירו: אלמנט ה-LCP בדף הבית הוא תמונת הסלייד הפעיל. תקציב הרכיבים:

| רכיב | תקציב |
|------|-------|
| TTFB (שלד מ-CDN) | עד 300ms |
| הורדת תמונת הירו (4G, p75) | עד 1,200ms (עד 200KB) |
| render + decode | עד 500ms |
| **סה"כ LCP p75** | **עד 2.0 שניות** |

---

## 4. תקציבי Core Web Vitals

### 4.1 יעדים מספריים (p75, מובייל ישראלי, 4G, מכשיר בינוני)

| סוג דף | LCP | INP | CLS | TTFB |
|--------|-----|-----|-----|------|
| דף בית | ≤ 2.0s | ≤ 200ms | ≤ 0.05 | ≤ 300ms |
| קטגוריה / רשימת מוצרים | ≤ 2.2s | ≤ 200ms | ≤ 0.10 | ≤ 300ms |
| דף מוצר | ≤ 2.2s | ≤ 200ms | ≤ 0.10 | ≤ 300ms |
| קופונים | ≤ 2.2s | ≤ 200ms | ≤ 0.10 | ≤ 300ms |
| עגלה / צ'קאאוט | ≤ 2.5s | ≤ 200ms | ≤ 0.10 | ≤ 700ms |
| חשבון | ≤ 2.5s | ≤ 200ms | ≤ 0.10 | ≤ 700ms |
| אדמין | ≤ 3.0s | ≤ 250ms | ≤ 0.10 | ≤ 800ms |

תקציבים משלימים לחנות (לא לאדמין):

- JS ראשוני: עד 200KB gzip לכל דף חנות (התקציב שכבר נקבע ב-MASTER). `dnd-kit`, radix מורכבים וטבלאות אדמין חייבים להיעדר מה-bundle של החנות.
- משקל דף בית כולל (HTML+CSS+JS+תמונות מעל הקפל): עד 1MB בטעינה ראשונה.
- פונט: Heebo יחיד דרך `next/font` (קיים). אסור להוסיף פונט שני.

### 4.2 מדידה

1. **RUM ראשי: Vercel Speed Insights.** מותקן `@vercel/speed-insights` ב-root layout. זה מקור האמת ל-p75 לפי route. דורש Vercel Pro (ממילא חובה ל-cron).
2. **RUM משני, בבעלותנו:** `useReportWebVitals` שולח `web_vital` (metric, value, rating, route, device) אל `/api/a` (חוזה K1) לתוך `analytics_events`. נותן retention של 13 חודשים, פילוח לפי קמפיין/מקור, והצלבה מול conversion באותו מחסן. נכנס לתוקף כשה-endpoint נבנה; עד אז Speed Insights לבדו.
3. **CI: Lighthouse CI** ב-`.github/workflows/ci.yml` על דף בית + קטגוריה + מוצר (עמוד preview), פרופיל מובייל, עם assertions על התקציבים בסעיף 4.1. חריגה חוסמת merge.
4. **שגרה:** בדיקת Speed Insights שבועית. חריגת p75 מהתקציב במשך 7 ימים רצופים פותחת משימת ביצועים בעדיפות מעל פיצ'רים.

---

## 5. ביצועי DB

### 5.1 ביקורת אינדקסים מול דפוסי השאילתות

מה שקיים ותקין (אין לגעת): החיפוש מכוסה היטב (GIN על `search_vector` + trgm + `products_active_price_idx`), קופונים מכוסים (`idx_coupon_codes_code` UNIQUE, `idx_coupon_codes_expires_active` חלקי ל-cron), התורים מכוסים (partial indexes על `notifications_outbox`, `notification_events`), analytics מחולק חודשית עם אינדקסים יורשים, והעגלה מכוסה (`carts_one_per_profile_idx`, unique משולש על `cart_items`).

פערים שנמצאו מול דפוסי השאילתות בחוזים ובקוד:

| # | דפוס שאילתה | פער |
|---|-------------|-----|
| G-1 | רשימות "חדש באתר" ודף `/products`: `status='active' AND deleted_at IS NULL ORDER BY created_at DESC` | אין אינדקס ממוין. `idx_products_published` החלקי מכסה רק `published_at` ובלי תנאי `deleted_at` |
| G-2 | גריד קטגוריה: אותו פילטר + `category_id`, מיון לפי `created_at` | אין אינדקס מורכב |
| G-3 | מיון קטגוריה לפי מחיר (`filter_products`, `?sort=price_asc`) | `products_active_price_idx` הוא על מחיר בלבד, בלי `category_id` |
| G-4 | דוחות ספק/אדמין על קופונים לפי מוצר | `coupon_codes.product_id` ללא אינדקס |
| G-5 | FK ללא אינדקס | `order_items.variant_id`, `payments.token_id`, `payments.refund_of_payment_id`, `notification_conversions.outbox_id` |
| G-6 | מיון לפי שם בקטגוריה | ללא אינדקס, וזו החלטה: מתחת ל-30,000 מוצרים sort in-memory זול. לא מוסיפים |

### 5.2 טיוטת מיגרציה 037 (מיושמת על ידי בעלי `supabase/`)

```sql
-- 037_performance_indexes.sql (draft, owned by supabase/)

-- G-1: catalog "newest" listings
create index if not exists idx_products_active_created
  on public.products (created_at desc)
  where status = 'active' and deleted_at is null;

-- G-2: category grid, newest first
create index if not exists idx_products_active_category_created
  on public.products (category_id, created_at desc)
  where status = 'active' and deleted_at is null;

-- G-3: category grid, price sort
create index if not exists idx_products_active_category_price
  on public.products (category_id, kenyon_price)
  where status = 'active' and deleted_at is null;

-- G-4: coupon codes by product (supplier/admin reports)
create index if not exists idx_coupon_codes_product
  on public.coupon_codes (product_id);

-- G-5: unindexed FKs
create index if not exists idx_order_items_variant
  on public.order_items (variant_id) where variant_id is not null;
create index if not exists idx_payments_token
  on public.payments (token_id) where token_id is not null;
create index if not exists idx_payments_refund_of
  on public.payments (refund_of_payment_id) where refund_of_payment_id is not null;
create index if not exists idx_notification_conversions_outbox
  on public.notification_conversions (outbox_id);
```

בנוסף, אחרי עלייה לאוויר: ריצת `get_advisors` (Supabase) ו-`pg_stat_statements` אחת לחודש; אינדקס שלא נעשה בו שימוש 60 יום נמחק.

### 5.3 סיכוני N+1 והתיקונים

| מקום | מצב היום | החלטה |
|------|----------|-------|
| גריד דף הבית | אפס N+1 (מערך קבוע בזיכרון). כשעובר ל-DB: | שאילתה אחת ל-16 מוצרים, תמונות מתוך `products.images` (jsonb). אסור join ל-`product_images` פר כרטיס ואסור שאילתה פר כרטיס |
| מוצרים קשורים | 2 שאילתות עוקבות (קטגוריה, ואז backfill) | RPC יחיד `related_products(p_product_id, p_category_id, p_limit)`: שאילתת UNION אחת (same-category ואז newest, ללא המוצר עצמו). STABLE, SECURITY INVOKER. טיוטה נמסרת לבעלי `supabase/` יחד עם 037 |
| `generateMetadata` | שאילתה כפולה בכל דף מוצר/קופון | נעלם עם שכבת `use cache` + `React.cache()` (סעיף 2.2) |
| RBAC אדמין | `auth.getUser()` + שאילתת profiles בכל בקשה | מקובל בהיקף אדמין. לא מטפלים |
| דשבורד אדמין (`v_owner_dashboard`) | ~20 subqueries | נשאר view רגיל לפי הכלל הקיים: המרה ל-matview רק כששאילתה נמדדת מעל 200ms |

### 5.4 אסטרטגיית חיבורים (pooling)

- **זמן ריצה (Vercel Functions):** PostgREST בלבד. אין pool לנהל, אין תקרת חיבורים לשרוף. זו ההחלטה, והיא גם הסיבה שאסור להכניס `postgres`/`drizzle` לנתיב הריצה.
- **סקריפטים ומיגרציות (מקומי/CI):** session pooler (פורט 5432) עם service role, כפי שכבר נעשה בסקריפטי הייבוא.
- **אם אי פעם יידרש SQL ישיר מפונקציות serverless** (לא צפוי לפני Meilisearch): Supavisor transaction mode (פורט 6543) עם `prepare: false`. לא לפני שיש צורך מדוד.
- **pg_cron** נשאר בתוך ה-DB לעבודות SQL טהורות; Vercel cron לכל מה שנוגע ב-API חיצוני (החלוקה שכבר נקבעה).

---

## 6. יעדי עומס ותוכנית קיבולת

### 6.1 פרופיל תנועה ישראלי (הנחות תכנון)

- שבוע עבודה ישראלי: שיא יומי ראשון עד חמישי 20:00-23:00 (כ-25% מתנועת היממה בשלוש שעות). שפל בשישי אחר הצהריים ושבת; קפיצה במוצאי שבת מצאת השבת עד חצות.
- WhatsApp הוא ערוץ המכירה המרכזי: תנועה מגיעה בפרצים (blast של הודעות = מאות כניסות בדקות ספורות לאותו דף מוצר). זה מקרה בוחן מרכזי, ו-PPR פותר אותו: הדף מוגש כולו מ-CDN.
- אירועי שיא שנתיים: נובמבר (Black Friday/Shopping IL), ערבי חג (פסח, ראש השנה), חנוכה.

### 6.2 נקודות תכנון (design points)

| מדד | יום רגיל (השקה) | ערב שיא רגיל | אירוע מכירה (יעד תכנון) |
|------|------------------|---------------|--------------------------|
| סשנים ביום | 1,000-2,000 | 3,000-5,000 | 30,000 |
| משתמשים בו-זמנית (שיא) | 30-60 | 150-300 | עד 3,000 |
| בקשות דף בשיא | 2-5 RPS | 10-20 RPS | 100 RPS |
| מזה מגיע ל-origin (אחרי CDN, יעד פגיעה 90%+) | פחות מ-1 RPS | 1-2 RPS | עד 10-15 RPS |
| שאילתות DB דינמיות בשיא | זניח | 5-10 QPS | 30-50 QPS |
| הזמנות | בודדות ביום | עשרות ביום | 1-2 בשנייה בשיא |

מסקנת קיבולת: עם Cache Components, ה-origin וה-DB רואים סדר גודל אחד פחות מהתנועה הנצפית. Supabase Pro על compute הקטן + Vercel Pro מכסים את כל הטבלה עם מרווח. אין צורך בשדרוג compute או ב-read replicas לפני שטריגר נמדד.

### 6.3 טריגרים מדידים לשדרוג

| טריגר | פעולה |
|-------|-------|
| DB CPU p95 מעל 60% בשיא שבועי, שבועיים רצופים | שדרוג compute של Supabase דרגה אחת |
| פגיעת CDN בדפי קטלוג מתחת ל-80% שבוע רצוף | ביקורת tags/cacheLife (משהו מפיל cache לשווא) |
| מעל 30,000 מוצרים פעילים | Meilisearch (הוחלט כבר) |
| טריגרי T-1/T-2/T-3 מסעיף 2.4 | Upstash Redis ל-rate limiting |
| מעל 200,000 אירועי analytics בחודש | פתיחת החלטת first-party-only מחדש (הוחלט כבר) |

### 6.4 בדיקת עומס לפני אירוע מכירה (חובה, שבוע לפני)

k6 מול סביבת preview המחוברת ל-DB ייעודי (לא dev המשותף):

- תרחיש גלישה: 300 VU וירטואליים, 20 דקות, מסלול בית → קטגוריה → מוצר. סף: p95 של TTFB מתחת ל-800ms, אפס 5xx.
- תרחיש checkout: 10 VU, מסלול עגלה → beginCheckout (מול Cardcom sandbox). סף: p95 מתחת ל-2s לאורך הבדיקה, אפס כפילויות תשלום (אימות מול `payments.idempotency_key`).
- תרחיש blast: 0 עד 100 RPS בתוך 60 שניות על דף מוצר יחיד (סימולציית WhatsApp). סף: פגיעת CDN מעל 95% על הדף.

---

## 7. סדר יישום

1. **P0 (לפני checkout):** `cacheComponents: true` + קליינט אנונימי ללא עוגיות + שכבת `use cache` לקטלוג + Suspense ב-layouts הדינמיים + פיצול Header. (בעלי `src/`)
2. **P0:** תצורת `images` החדשה + מעבר כרטיסי מוצר וגלריה ל-`next/image` + תיקון הירו (GIF החוצה, `preload` על הסלייד הפעיל). (בעלי `src/`)
3. **P1:** מיגרציה 037 (אינדקסים) + RPC `related_products`. (בעלי `supabase/`)
4. **P1:** Speed Insights + Lighthouse CI עם התקציבים. (בעלי `src/` + CI)
5. **P2:** `web_vital` אל `/api/a` כשנבנה, בדיקת k6 ראשונה לפני אירוע המכירה הראשון.

## נספח: ממצאי ביקורת בקוד הקיים (לידיעת בעלי src/)

- אפס תצורת caching בכל הריפו; כל דף שנוגע ב-Supabase הוא SSR מלא פר בקשה.
- דף מוצר: עד 5 סיבובי רשת עוקבים (metadata, מוצר, variants, related פעמיים).
- כרטיסי מוצר וגלריה: `<img>` גולמי ללא srcset.
- הירו: GIF מונפש `unoptimized` כסלייד ראשון; `priority` על אינדקס 0 בעוד הסלייד ההתחלתי הוא אחר.
- אין `proxy.ts` בפועל בריפו למרות שהקוד ב-`server.ts` מניח שרענון session קורה ב-proxy (פער תפקודי, לא רק ביצועים; בבעלות `src/`).
- `quality={95}` בהירו חורג מ-`qualities` המתוכנן ויוחלף ב-75.
