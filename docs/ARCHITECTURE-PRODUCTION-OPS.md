# ארכיטקטורת תשתית פרודקשן ותפעול - KenyonExpress

מסמך תכנון תשתית. סטטוס: DESIGN. אין בו מיגרציות ואין בו קוד להחלה.
תאריך: 2026-07-08. ענף: `phase5/homepage`.
מסמכים קשורים: `ARCHITECTURE-COMMERCE.md` (026), `ARCHITECTURE-SUPPLIER-REDEMPTION.md` (027), `ARCHITECTURE-AI-AGENTS.md` (028).

> מטרת המסמך: להעביר את KenyonExpress מפרויקט dev לאתר פרודקשן שמחליף אתר WordPress חי
> ב-`kenyonexpress.co.il` ללא downtime, עם מודל עלות ברור מתי Supabase Pro הופך לחובה.

---

## 0. עובדות מוצא (הבסיס לכל השאר)

מה שנמצא בפועל בריפו ובפרויקט, לא מה שהיה אמור להיות:

| רכיב | מצב בפועל | השלכה |
|---|---|---|
| Framework | **Next.js 16.2.4** (לא 15), React 19.2.4, App Router | ה-middleware הוא `src/proxy.ts` (לא `middleware.ts`). Caching model חדש. |
| Hosting | Vercel (מיועד), אין `vercel.json` | אין headers, אין cron, אין region pin |
| Supabase | פרויקט `ixvwfbuvfxxsjiywhbbb`, **FREE tier**, region `eu-north-1` (סטוקהולם), Postgres 17.6 | ראו סעיף 6: מגבלות free חוסמות פרודקשן |
| תשלומים | Cardcom, **טרם מומש** (env keys ב-comment ב-`.env.example`, אין `src/server/actions/payments/`) | ה-webhook + אימות חתימה נכתבים כחלק מ-Phase 2 |
| Middleware | `src/proxy.ts`: refresh session, auth gating ל-`/account` `/checkout` `/admin`, guest cookie `ke_session_id`. **אין security headers.** | ראו סעיף 4 |
| Rate limit | `002` (IP) + `019` (user). helper `rate-limit.ts` **fails open** בשגיאת RPC. `checkUserRateLimit` מוגדר אך **אין לו קוראים**. | ראו סעיף 4.2 |
| Caching | **אפס** `revalidate` / `dynamic` / `generateStaticParams` בכל `src/app`. הכול ברירת מחדל Next. | כל דף שקורא cookies (Supabase server client) הופך dynamic. ראו סעיף 3 |
| תמונות | Supabase Storage, public URL, `next/image` optimization ON, `sharp` מותקן. `storage.image_transformation` disabled ב-config. | egress חינם 5GB יתפוצץ. ראו סעיף 3.3 + 6 |
| SEO | אין `sitemap.ts`, אין `robots.ts`, אין `public/robots.txt`, אין metadata generation | חוסם קאטאובר מ-WordPress עם SEO. ראו סעיף 2 |
| CI/CD | אין `.github/workflows`. husky + lint-staged pre-commit בלבד. | ראו סעיף 1.4 |
| Observability | **אין** Sentry / APM / error tracking / uptime | ראו סעיף 5 |
| ENV vars | 4 בלבד: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` | ראו סעיף 1.2 |
| Migrations drift | היסטוריית מיגרציות במרוחק לא מסונכרנת (2 רשומות מול 31 קבצים). `coupons` קיימת ב-DB למרות ש-008 מוחקת. 026/027/028 טיוטות לא מוחלות, 026↔027 מתנגשות (`payout_status`). | ראו סעיף 1.3 |

---

## 1. סביבות (Environments)

### 1.1 שלוש סביבות, שני פרויקטי Supabase

הבעיה: Supabase branching (סביבת DB חולפת פר PR) **דורש Pro** ($25/חודש). ב-free אין branching בכלל.

ההחלטה: **שני פרויקטים נפרדים, לא branching.** זה גם עדיף מבחינת בידוד: פרודקשן לעולם לא חולק state עם dev.

```
┌─────────────┬──────────────────────┬─────────────────────────────┬────────────────────┐
│ סביבה       │ Next.js              │ Supabase                    │ דומיין             │
├─────────────┼──────────────────────┼─────────────────────────────┼────────────────────┤
│ local       │ next dev (localhost) │ ixvwfbuvfxxsjiywhbbb (dev)   │ localhost:3000     │
│ preview      │ Vercel Preview (PR)  │ אותו dev project            │ *.vercel.app       │
│ production   │ Vercel Production    │ פרויקט חדש נפרד (PROD)       │ kenyonexpress.co.il│
└─────────────┴──────────────────────┴─────────────────────────────┴────────────────────┘
```

- **local + preview חולקים את פרויקט ה-dev הקיים.** preview deployments הם לבדיקת UI/flow, לא לבדיקת דאטה אמיתי. מקובל ש-preview נוגע ב-dev DB (לא בפרודקשן).
- **production מקבל פרויקט Supabase חדש ונקי**, שנוצר עם החלת כל 28 המיגרציות מאפס (בלי ה-drift שהצטבר ב-dev). זו ההזדמנות היחידה להתחיל DB נקי; לנצל אותה.
- אזהרה: הפרויקט הקיים ב-region `eu-north-1` (סטוקהולם). לקהל ישראלי עדיף `eu-central-1` (פרנקפורט) - latency נמוך יותר (~50ms מול ~70ms). את פרויקט הפרודקשן החדש **ליצור ב-`eu-central-1`**, ולפין את Vercel לאותו region (`fra1`).

### 1.2 ניהול משתני סביבה

היום 4 משתנים. פרודקשן מלא (עם Cardcom + agents) דורש:

```
# Supabase (public - נחשפים לדפדפן)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

# Supabase (server-only - סוד)
SUPABASE_SERVICE_ROLE_KEY

# App
NEXT_PUBLIC_APP_URL          # production: https://kenyonexpress.co.il

# Cardcom (Phase 2, server-only - סוד)
CARDCOM_TERMINAL
CARDCOM_USERNAME
CARDCOM_API_NAME
CARDCOM_API_PASSWORD
CARDCOM_WEBHOOK_SECRET       # חדש: לאימות חתימת webhook, ראו 4.3

# Agents (Phase 5, server-only - סוד)
ANTHROPIC_API_KEY
SUPPLIER_QR_SIGNING_KEY      # Ed25519 private key, חתימת QR קופונים (027)

# Cron (server-only - סוד)
CRON_SECRET                  # מגן על Vercel cron routes, ראו 4.5
```

כללי ברזל:
1. **כל מה שאין לו `NEXT_PUBLIC_` הוא סוד server-side בלבד.** `SUPABASE_SERVICE_ROLE_KEY` עוקף RLS לגמרי; דליפה שלו = כל ה-DB חשוף. אסור שיגיע לבנדל הלקוח לעולם.
2. ב-Vercel: להגדיר משתנים ב-3 scopes נפרדים (Production / Preview / Development). ה-secrets של פרודקשן שונים מ-dev. `NEXT_PUBLIC_APP_URL` שונה פר סביבה.
3. אימות בזמן build: להוסיף `src/lib/env.ts` עם סכמת zod שנכשלת מהר אם משתנה חסר, במקום `undefined` שקט בזמן ריצה.
4. `.env.local` מוגן ב-gitignore (מאומת). `.env.example` נשאר מסמך המפתחות בלבד, בלי ערכים.

### 1.3 seed data ומצב ה-DB לפרודקשן

- פרויקט הפרודקשן החדש נבנה בהחלת **001 עד 028 לפי הסדר** דרך `apply_migration`, בלי ה-drift של dev.
- **לפני החלה חייבים לסגור את התנגשות 026↔027** (שתיהן מגדירות `payout_status` עם ערכים שונים ושני מנועי settlement). לפי `ARCHITECTURE-AI-AGENTS.md` שאלה 9.1: 027 היא העדכנית, לעדכן את 026 להסיר את החלק החופף. זה חוסם פרודקשן מסחרי.
- seed לפרודקשן: קטגוריות (018), platform wallet accounts (026), hero slides (017). **לא** להריץ את seed הדמו (022/024 - vendors/coupons/products דמו). מוצרי הפרודקשן נכנסים דרך האדמין או ייבוא מבוקר.
- הדאטה מ-dev (12 קטגוריות, 31 מוצרים) הם נתוני בדיקה. להחליט פר-שורה מה עובר לפרודקשן; לא migration של ה-DB כולו.

### 1.4 CI/CD

אין היום. מינימום לפני פרודקשן, workflow ב-`.github/workflows/ci.yml`:

```
on: pull_request + push to main
jobs:
  - pnpm install --frozen-lockfile
  - pnpm type-check          # tsc --noEmit
  - pnpm lint                # biome
  - pnpm test                # vitest
  - pnpm build               # next build (מגלה שגיאות build לפני deploy)
```

Vercel מחבר את ה-deploy אוטומטית ל-Git. חוק: **merge ל-main נחסם אם CI אדום** (branch protection ב-GitHub). המיגרציות **לא** רצות ב-CI (אין `db push` בגלל drift) - הן מוחלות ידנית דרך MCP `apply_migration`, מתועדות ב-STATE.md.

---

## 2. קאטאובר מ-WordPress (zero-downtime)

זה החלק הכי מסוכן: אתר חי עם תעבורה ו-SEO קיים ב-`kenyonexpress.co.il`.

### 2.1 עקרון: אימות מלא לפני החלפת DNS

```
שלב 0  אתר Next חי על staging domain (staging.kenyonexpress.co.il או vercel.app)
       → בדיקת כל הזרימות מול פרויקט PROD Supabase
       ↓
שלב 1  מיפוי URL מלא של WordPress הקיים (סעיף 2.3) + הקמת redirect map
       ↓
שלב 2  הורדת TTL של רשומת ה-DNS הקיימת ל-300 שניות, 48 שעות לפני הקאטאובר
       (כדי שהמעבר יתפשט מהר, ורולבק יהיה מהיר)
       ↓
שלב 3  קאטאובר: שינוי רשומת ה-DNS (A / CNAME) להצביע ל-Vercel
       ↓
שלב 4  ניטור צמוד 24 שעות: 404s, שגיאות, Core Web Vitals, שגיאות תשלום
       ↓
שלב 5  אחרי יציבות: החזרת TTL לערך רגיל (3600+)
```

### 2.2 DNS ורולבק

- ב-Vercel: להוסיף `kenyonexpress.co.il` + `www` כ-custom domains, לאמת בעלות דרך רשומת TXT (עוד לפני הקאטאובר, בזמן שהאתר הישן חי).
- שיטת הצבעה: **apex domain** דרך A record ל-IP של Vercel (`76.76.21.21`) או ALIAS/ANAME אם ה-registrar תומך; `www` דרך CNAME ל-`cname.vercel-dns.com`. להחליט לפי מה שה-registrar הישראלי (כנראה) תומך.
- **רולבק**: להשאיר את שרת ה-WordPress **חי ולא נגוע** לפחות שבועיים אחרי הקאטאובר. רולבק = החזרת רשומת ה-DNS ל-IP הישן. בזכות TTL=300 זה מתפשט תוך 5 דקות. אין למחוק את WordPress עד שבועיים של פרודקשן יציב.
- SSL: Vercel מנפיק Let's Encrypt אוטומטית אחרי אימות הדומיין. לוודא שההנפקה הצליחה **לפני** שינוי ה-A record (אחרת חלון של אזהרת certificate).

### 2.3 מפת redirect (301) לשימור SEO

זה הלב של שימור ה-SEO. כל URL ישן של WordPress שיש לו דירוג/קישורים חייב 301 ליעד החדש. WordPress טיפוסי:

| דפוס WordPress ישן | יעד Next חדש | סוג |
|---|---|---|
| `/?page_id=N`, `/?p=N` | המיפוי הספציפי לפי תוכן | 301 |
| `/product/<wp-slug>/` | `/product/<new-slug>` | 301 |
| `/product-category/<cat>/` | `/category/<slug>` | 301 |
| `/shop/` | `/products` | 301 |
| `/cart/`, `/checkout/` (WooCommerce) | `/checkout` (או `/cart`) | 301 |
| `/my-account/` | `/account` | 301 |
| `/coupons/`, `/deals/` | `/coupons` | 301 |
| דפי מידע (`/about`, `/contact`) | היעד המקביל או `/` | 301 |
| כל השאר שאין לו מקבילה | `/` | 301 (עדיף מ-404 עבור SEO) |

מימוש ב-Next 16: **`redirects()` ב-`next.config.ts`** למיפוי סטטי (מהיר, edge-level), ו-`proxy.ts` רק אם צריך לוגיקה דינמית (למשל lookup של slug ישן→חדש ב-DB). המלצה: לייצא את רשימת ה-URLים הישנים מ-WordPress (plugin או crawl של ה-sitemap הישן), למפות לטבלה, ולייצר את ה-`redirects()`.

```ts
// next.config.ts (דוגמת מבנה, לא ליישום כאן)
async redirects() {
  return [
    { source: '/shop', destination: '/products', permanent: true },     // 308/301
    { source: '/product-category/:cat', destination: '/category/:cat', permanent: true },
    // ... נטען מתוך מפת מיגרציה
  ]
}
```

הערה: Next `permanent: true` = 308 (לא 301). ל-SEO שניהם עוברים equity; אם צריך 301 מדויק, `proxy.ts` עם `NextResponse.redirect(url, 301)`.

### 2.4 sitemap + robots

חסרים לגמרי. חובה לפני קאטאובר:

- **`src/app/sitemap.ts`**: מייצר sitemap דינמי מ-DB - כל המוצרים ה-active, קטגוריות, דילים, דפים סטטיים. `next/image` ו-App Router תומכים ב-`MetadataRoute.Sitemap`. עם ISR (`revalidate`) כדי לא לפגוע ב-DB בכל בקשה.
- **`src/app/robots.ts`**: `Allow: /` על הציבורי, `Disallow` על `/admin`, `/account`, `/api`, `/auth`. הפניה ל-sitemap.
- אחרי הקאטאובר: להגיש את ה-sitemap ב-Google Search Console, ולוודא שה-property של הדומיין מאומת (רצוי עוד לפני, על ה-WordPress).
- metadata: היום אין `generateMetadata` בדפי מוצר/קטגוריה. חובה להוסיף title/description/OG/canonical פר דף לפני קאטאובר, אחרת אובדן דירוג.

---

## 3. ביצועים

### 3.1 אסטרטגיית caching / ISR פר סוג דף (Next 16)

היום אפס caching מוגדר. כל דף שמשתמש ב-Supabase server client קורא cookies ולכן **dynamic** (SSR פר בקשה) - זה יפיל את זמני התגובה תחת עומס ויכביד על ה-DB.

Next 16 מציע שני מודלים: Cache Components (`use cache` + `cacheLife`) או המודל הקודם (`export const revalidate`). כרגע הפרויקט לא מפעיל `cacheComponents`, לכן משתמשים ב-**route segment config** הקלאסי.

| סוג דף | route | אסטרטגיה | נימוק |
|---|---|---|---|
| דף בית | `/` | ISR `revalidate = 300` | תוכן קטלוג, משתנה לאט. חייב להתנתק מ-cookies (לפצל את חלק ה-header המחובר ל-client component) |
| דף מוצר | `/product/[slug]` | ISR `revalidate = 600` + `generateStaticParams` למוצרים החמים | קטלוג יציב; on-demand `revalidatePath` בעדכון אדמין |
| דף קטגוריה | `/category/[slug]` | ISR `revalidate = 600` | דומה. הזהירות: מיון/pagination דרך searchParams הופכים dynamic; לשקול לטעון את הבסיס סטטי ולסנן ב-client |
| רשימת מוצרים | `/products` | ISR `revalidate = 300` | |
| דילים/קופונים | `/coupons`, `/coupons/[id]` | ISR `revalidate = 300` | valid_until משתנה; לא קריטי לדקה |
| עגלה / checkout | `/cart`, `/checkout` | dynamic מלא (`no-store`) | פר-משתמש, מחירים חיים, לעולם לא cache |
| חשבון | `/account/*` | dynamic מלא | נתוני משתמש |
| אדמין | `/admin/*` | dynamic מלא | RBAC, נתונים חיים |
| API/webhook | `/api/*` | dynamic מלא | |

מפתח: **on-demand revalidation**. כשאדמין מעדכן מוצר/קטגוריה/דיל → server action קורא `revalidatePath('/product/[slug]')` או `revalidateTag('products')`. כך הקטלוג נשאר טרי בלי SSR בכל בקשה.

חובה: לפצל את ה-header (שמציג משתמש מחובר + עגלה) לרכיב client שנטען אחרי hydration, כדי שדף הבית וקטלוג יישארו סטטיים/ISR ולא ייהפכו dynamic בגלל קריאת ה-session.

### 3.2 pipeline תמונות

- מקור: Supabase Storage, public URL. `next/image` optimization פעיל (`sharp`).
- **בעיה**: `storage.image_transformation` **disabled** ב-`config.toml`, וב-free tier הטרנספורמציה של Supabase לא זמינה. לכן ה-resize/optimize כולו נופל על **Vercel Image Optimization**.
- **מלכודת עלות כפולה**:
  1. כל תמונה מקורית נמשכת מ-Supasbase Storage → נספר ב-**egress החינמי (5GB/חודש)** של Supabase.
  2. Vercel Image Optimization ב-free/Hobby מוגבל ל-1000 תמונות מקור ייחודיות; Pro נספר לפי שימוש.
- המלצה:
  - **להעלות תמונות כבר אופטימליות** (webp, גדלים סבירים) ל-Storage; לא לסמוך רק על optimization בזמן ריצה.
  - להגדיר `next/image` עם `sizes` מדויק פר שימוש (thumbnail בגריד מול תמונה מלאה בדף מוצר) כדי לא למשוך 2000px לתמונת 200px.
  - `qualities: [75]` מספיק לרוב; 90/95 רק לתמונת גיבור.
  - לשקול CDN caching ארוך: `next/image` ממילא מגיש דרך ה-CDN של Vercel עם cache; ה-egress מ-Supabase קורה רק פעם אחת פר תמונה עד שה-cache פג.
  - כשעוברים ל-Supabase Pro: להפעיל `image_transformation` ולהגיש transform URLs, מוריד עומס מ-Vercel.

### 3.3 תקציבי Core Web Vitals (מובייל ישראלי)

יעד: מובייל על רשת 4G ישראלית טיפוסית, מכשירי mid-range. יעדים לעמוד 75th percentile:

| מדד | תקציב | הערה |
|---|---|---|
| LCP | ≤ 2.5s | תמונת גיבור עם `priority`, preload; ISR מבטל את זמן ה-SSR |
| INP | ≤ 200ms | לצמצם JS; RSC by default, client components רק היכן שצריך |
| CLS | ≤ 0.1 | `width`/`height` על כל תמונה (SmartImage כבר עוזר), reserve space ל-hero slider |
| TTFB | ≤ 600ms | region pin ל-`fra1` + ISR (מגיש מ-CDN, לא SSR) |
| JS bundle (initial) | ≤ 200KB gzip | לבדוק את המשקל של Radix + dnd-kit; dnd-kit נצרך רק באדמין, לוודא code-split |

אכיפה: להוסיף **Vercel Speed Insights** (חלק מ-Vercel, זול) או Lighthouse CI ב-workflow. latency מ-`eu-central-1` לישראל ~50ms; זו הסיבה לפין ה-region.

---

## 4. הקשחת אבטחה (Security hardening)

### 4.1 Security headers + CSP

היום **אין ולו header אבטחה אחד**. חובה לפני פרודקשן. המימוש הנכון ב-Next 16 הוא `headers()` ב-`next.config.ts` (סטטי, edge-level) לכל ה-headers הקבועים, ו-`proxy.ts` רק ל-CSP nonce דינמי אם נדרש.

headers מינימליים:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY                          # או frame-ancestors ב-CSP
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), geolocation=(), microphone=()
                                               # camera=self עבור סורק הקופונים (027)
Content-Security-Policy: (ראו למטה)
```

CSP - נקודת הזהירות הגדולה בגלל Cardcom (iframe/redirect לעמוד סליקה) ו-Supabase:

```
default-src 'self';
script-src 'self' 'unsafe-inline' (או nonce);   # Next דורש inline/nonce ל-hydration
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://*.supabase.co https://*.unsplash.com;
connect-src 'self' https://*.supabase.co https://api.anthropic.com wss://*.supabase.co;
frame-src https://secure.cardcom.solutions;      # עמוד הסליקה של Cardcom
form-action 'self' https://secure.cardcom.solutions;
frame-ancestors 'none';
base-uri 'self';
```

מומלץ nonce-based script-src במקום `unsafe-inline` (Next 16 תומך דרך `proxy.ts` + `headers()`); זו העבודה היחרה, לכן כשלב ראשון `unsafe-inline` ואז להדק. לוודא מול הדומיינים המדויקים של Cardcom בזמן המימוש (סעיף 4.3).

### 4.2 Rate limiting (הרחבת תשתית 002/019)

התשתית קיימת אך בשימוש חלקי:
- **`checkRateLimit` (IP, 002)** נקרא רק ב-`auth.ts` (login/signup/magic/reset). תקין.
- **`checkUserRateLimit` (user, 019)** מוגדר אך **אין לו אף קורא**. זה הפער.
- שני ה-helpers **fail open** (מחזירים `true` בשגיאת RPC). בפרודקשן זו חשיפה: תקלת DB מבטלת את ה-rate limit. להחליט פר-פעולה: לתשלום וסריקת קופון עדיף **fail closed** (לחסום בספק), לצ'אט אפשר fail open.

חיווט נדרש לפני פרודקשן (מהמסמכים הקיימים):
| פעולה | limit | מקור |
|---|---|---|
| `coupon_scan` | 30/דקה למשתמש | 027 §3.3 |
| `beginCheckout` | סביר, ~10/דקה למשתמש | 026 |
| `agent_chat` | 20/שעה למשתמש | 028 §1.4 |
| `listing_draft` | 10/יום לספק | 028 §3 |
| webhook Cardcom | IP-based, גבוה | סעיף 4.3 |

הערה: `check_rate_limit`/`check_user_rate_limit` כותבים שורות; ב-free tier זה נספר במגבלת ה-DB. `cleanup_rate_limits` / `cleanup_user_rate_limits` **חייבים לרוץ מתוזמן** (סעיף 4.5), אחרת הטבלאות תופחות.

### 4.3 אימות חתימת webhook של Cardcom

טרם מומש (אין `/api/payments/cardcom/webhook`). התכנון מ-`ARCHITECTURE-COMMERCE.md` §2.3 + §6 T3 הוא הסטנדרט; לאכוף אותו בפרודקשן:

1. **אימות חתימה/secret ראשון**: כל בקשה נכנסת נבדקת מול `CARDCOM_WEBHOOK_SECRET`. חתימה לא תקינה → לוג עם `signature_valid=false`, החזר 200, drop (200 כדי שתוקף לא ילמד כלום).
2. **אימות server-to-server**: גם עם חתימה תקינה, קריאה חוזרת ל-API של Cardcom לפי `cardcom_low_profile_id` לשליפת הסכום והסטטוס האמיתיים. סומכים **רק** על התשובה הזו (`verified_against_api=true`). "paid" מזויף על 1 ILS בהזמנת 500 ILS נכשל בהתאמת סכום.
3. **anti-replay**: `payment_webhook_events` עם UNIQUE על `(provider, external_event_id)`. webhook כפול = conflict, יציאה לפני שינוי state.
4. **URLs מהדפדפן לעולם לא משנים state של הזמנה** (success/redirect URL הם UI בלבד).
5. **reconcile cron** (סעיף 4.5): webhook שלא הגיע → cron מתשאל את Cardcom להזמנות `redirected` מעל 10 דקות ומיישר.

ה-route הזה חייב `dynamic = 'force-dynamic'`, service role client, בלי CSRF token (זה server-to-server), ו-rate limit IP-based רופף.

### 4.4 סבב סודות (secrets rotation) + backup/DR

**סבב סודות:**
- `SUPABASE_SERVICE_ROLE_KEY` ו-anon key: ניתנים ל-rotation מ-Supabase dashboard (מנפיק JWT חדש). לתעד תהליך: rotate ב-Supabase → עדכון ב-Vercel env → redeploy. לתזמן פעם ברבעון או מיד עם חשד לדליפה.
- `CARDCOM_*`: rotation מול Cardcom, תיאום עם ה-PSP.
- `SUPPLIER_QR_SIGNING_KEY` (Ed25519): rotation דרך `qr_key_id` (027 §3.1) - מפתח חדש לקופונים חדשים, הישן ממשיך לאמת קיימים.
- `CRON_SECRET`, `ANTHROPIC_API_KEY`: rotation ב-Vercel + הספק.
- אף סוד לא ב-git. audit log על שינויי הרשאה כבר קיים (011/025).

**backup + DR - דגל אדום קריטי:**
> **ל-Supabase FREE tier אין גיבויים בכלל.** אין daily backup, אין Point-in-Time Recovery. אם ה-DB נמחק/נפגם - **הדאטה אבודה לצמיתות.** זו לבדה סיבה מספקת לעבור ל-Pro לפני שמקבלים תשלום אמיתי אחד.

- Pro tier: daily backups עם 7 ימי retention. PITR הוא add-on נפרד ($100/חודש) שנותן שחזור לנקודת זמן.
- עד המעבר ל-Pro (ובנוסף אליו): **`pg_dump` יומי מתוזמן** של פרויקט הפרודקשן ל-storage חיצוני (S3/GCS/אפילו Vercel Blob), עם retention של 30 יום. סקריפט + GitHub Action עם `schedule` cron. זה קו ההגנה עד שיש backups מובנים.
- DR runbook: לתעד את שלבי השחזור (create project → restore dump → repoint env → redeploy) ולהריץ תרגיל שחזור אחד לפני קאטאובר.

### 4.5 משימות מתוזמנות (cron)

היום אין. הפרודקשן דורש (Vercel Cron → route מוגן ב-`CRON_SECRET`, או pg_cron ב-Supabase):

| job | תדירות | מקור |
|---|---|---|
| `cleanup_rate_limits` + `cleanup_user_rate_limits` | כל שעה | 002/019 |
| ביטול הזמנות pending שפג `expires_at` | כל 10 דקות | 026 §3.1 |
| reconcile תשלומי Cardcom תקועים | כל 10 דקות | 026 §3.2 / 4.3 |
| `expire_coupons()` | יומי | 027 §7 |
| fraud_watch agent | יומי | 028 §5 |
| `pg_dump` גיבוי | יומי | 4.4 |
| integrity check ל-wallet ledger | לילי | 026 §2.6 |

הערה: Vercel Hobby מגביל cron ל-2 jobs וריצה יומית בלבד; **פרודקשן דורש Vercel Pro** (cron ללא הגבלה, תדירות חופשית). חלופה: pg_cron ב-Supabase (זמין, גם ב-free, אך מריץ SQL בלבד - לא מתאים ל-reconcile שקורא API חיצוני).

---

## 5. Observability (ניטור)

היום **אין כלום**. פרודקשן מסחרי חייב:

### 5.1 Error tracking
- **Sentry** (`@sentry/nextjs`) על client + server + edge. SDK רשמי ל-Next 16 עם `instrumentation.ts`. free tier של Sentry (5k events/חודש) מספיק להתחלה.
- ללכוד: שגיאות React, שגיאות server action, כשלי RPC (במיוחד ה-fail-open של rate-limit שהיום נבלע בשקט), כשלי webhook.
- לסמן PII: לא לשלוח נתוני תשלום/משתמש גולמיים ל-Sentry (scrubbing).

### 5.2 Uptime
- ניטור חיצוני (UptimeRobot / Better Stack, free tier) על `https://kenyonexpress.co.il` ועל endpoint בריאות ייעודי (`/api/health` שבודק חיבור DB). התראה למייל/טלגרם על downtime.
- Supabase status: להירשם ל-status page של Supabase; **התראה קריטית על pause** (סעיף 6).

### 5.3 התראות כשל תשלום
- כל `payment` שנכנס ל-`failed`, כל webhook עם `signature_valid=false`, כל שורת reconcile `unmatched`/`amount_mismatch` → התראה מיידית לאדמין (מייל/טלגרם). אלה אירועים כספיים; אסור שיישבו בשקט בטבלה.
- דוח יומי: כמה הזמנות pending פגו, כמה תשלומים נכשלו, יתרת cashback liability.

### 5.4 retention של audit_log
- `audit_log` (011) הוא append-only וגדל ללא הגבלה. ב-free tier (500MB) זה ממלא את ה-DB.
- מדיניות: `audit_log` הכספי/הרשאות **נשמר לתמיד** (רגולציה). הלוגים הרועשים (`agent_run_steps` מ-028, `coupon_scan_events` מ-027) עם **retention של 90 יום** ו-purge job, כפי שכבר מוצע ב-028 §9.4.
- כשה-DB מתקרב לתקרה: לייצא audit ישן ל-cold storage (dump ל-S3) ולמחוק מה-DB חם.

---

## 6. מודל עלות: מתי Supabase Pro הופך לחובה

הפרויקט על **FREE tier**. מה שובר, ובאיזה סדר:

### 6.1 מה שובר בפרודקשן על free tier (לפי דחיפות)

| # | מגבלת free | מה קורה כשחוצים | חוסם פרודקשן? |
|---|---|---|---|
| 1 | **אין גיבויים כלל** (לא daily, לא PITR) | אובדן דאטה בלתי הפיך בתקלה | **כן, מיידית** - לפני תשלום ראשון |
| 2 | **Pause אחרי 7 ימי חוסר פעילות** | הפרויקט מושהה, האתר נופל (DB לא נגיש) | **כן** - אתר חי חייב לא-pause. Pro לא משהה. |
| 3 | **5GB egress/חודש** | תמונות מ-Storage + API responses; חריגה → החיוב/חנק | **כן** - קטלוג עם תמונות יחצה מהר |
| 4 | **500MB DB** | audit_log + rate_limits + scan_events + orders תופחים | **כן, תוך שבועות** עם תעבורה |
| 5 | **1GB Storage** | תמונות מוצרים + מסמכי ספקים (supplier-docs) | בינוני - תלוי כמות מוצרים |
| 6 | **אין branching** | אין סביבת DB חולפת פר PR | לא חוסם (עוקפים עם 2 projects, סעיף 1.1) |
| 7 | **50,000 MAU auth** | נדיב; לא צוואר בקבוק ראשוני | לא בטווח הקרוב |
| 8 | **2 projects/org** | dev + prod = בדיוק 2. אין מקום ל-staging נפרד | בינוני - staging יושב על dev או דורש project שלישי (Pro) |
| 9 | **log retention יום אחד** | debug של אירוע מלפני יומיים בלתי אפשרי | בינוני - Sentry ממלא חלק |
| 10 | **אין custom SMTP / auth email rate נמוך** | מיילי אימות/reset נחנקים בעומס | בינוני - להגדיר SMTP חיצוני |

### 6.2 המסקנה

**Supabase Pro ($25/חודש) הוא חובה לפני קבלת התשלום המסחרי הראשון.** הטריגרים 1 (אין גיבוי) ו-2 (pause) לבדם מכריעים: אי אפשר להריץ חנות שגובה כסף בלי גיבוי ועם סיכון להשהיה. השלושה, הארבע והחמש (egress/DB/storage) יחצו תוך שבועות של תעבורה אמיתית.

**מודל עלות מינימלי לפרודקשן:**
| שירות | tier | עלות/חודש |
|---|---|---|
| Supabase | Pro | $25 (כולל 8GB DB, 100GB egress, daily backup 7d, ללא pause) |
| Supabase PITR | add-on | $100 (אופציונלי, מומלץ כשמחזור התשלומים גדל) |
| Vercel | Pro | $20/משתמש (cron ללא הגבלה, image optimization, analytics) |
| Sentry | free→team | $0 עד ~$26 |
| Anthropic API | usage | לפי 028 §1.4, תקציב יומי עם kill switch |
| **סה"כ בסיס** | | **~$45-70/חודש** לפני PITR ו-API |

מה שקורה בין free ל-Pro: אם משיקים על free "לבדיקה", חייבים מוניטור pause + `pg_dump` יומי חיצוני (4.4) כפתרון ביניים, ולעבור ל-Pro ברגע שהתשלומים נדלקים. אין דרך בטוחה לגבות כסף על free.

---

## 7. סיכום החלטות

1. **שני פרויקטי Supabase נפרדים** (dev+preview משותף, prod חדש ונקי ב-`eu-central-1`), לא branching (branching דורש Pro ומערבב state).
2. **קאטאובר DNS עם TTL=300 ורולבק מהיר**; WordPress נשאר חי שבועיים; redirect map מלא (301/308) לשימור SEO; sitemap+robots+metadata נבנים לפני הקאטאובר (חסרים היום).
3. **ISR פר סוג דף** (קטלוג 300-600s + on-demand revalidate; checkout/account/admin dynamic); פיצול ה-header המחובר ל-client כדי לא להפוך קטלוג ל-dynamic.
4. **תמונות**: להעלות pre-optimized ל-Storage, `sizes` מדויק, לצפות למלכודת egress כפולה (Supabase + Vercel); להפעיל Supabase image_transformation רק ב-Pro.
5. **Security headers + CSP** ב-`next.config.ts` (חסרים לגמרי), עם CSP שמתיר את דומייני Cardcom ו-Supabase; `Permissions-Policy: camera=self` לסורק.
6. **rate limit**: לחווט את `checkUserRateLimit` (מוגדר, לא בשימוש); fail-closed לתשלום/סריקה, fail-open לצ'אט.
7. **Cardcom webhook**: אימות חתימה + אימות server-to-server + anti-replay + reconcile cron, כפי שכבר תוכנן ב-026.
8. **גיבוי**: `pg_dump` יומי חיצוני מיידית; Supabase Pro לפני תשלום ראשון; PITR כשמחזור גדל.
9. **Observability**: Sentry + uptime חיצוני + התראות כשל תשלום + retention policy ל-audit/scan/agent logs.
10. **Supabase Pro חובה לפני התשלום המסחרי הראשון** (אין גיבוי + pause אחרי שבוע הם חוסמים מוחלטים).

---

## 8. Checklist טרום-שיגור (לפי עדיפות)

### P0 - חוסם, בלי זה אין פרודקשן שגובה כסף
- [ ] יצירת פרויקט Supabase PROD נפרד ב-`eu-central-1`, החלת 001-028 נקי דרך `apply_migration`
- [ ] סגירת התנגשות מיגרציות 026↔027 (`payout_status` + שני מנועי settlement) לפני החלה
- [ ] **מעבר Supabase ל-Pro** (או לכל הפחות `pg_dump` יומי חיצוני + מוניטור pause) לפני תשלום ראשון
- [ ] מימוש Cardcom webhook עם אימות חתימה + server-to-server + anti-replay (026 §2.3)
- [ ] Security headers + CSP ב-`next.config.ts` (כולל דומייני Cardcom)
- [ ] `env.ts` עם ולידציית zod לכל משתני הסביבה; הגדרת secrets ב-Vercel פר scope
- [ ] אימות ש-`SUPABASE_SERVICE_ROLE_KEY` לא דולף לבנדל הלקוח
- [ ] redirect map מלא מ-WordPress (301/308) + `sitemap.ts` + `robots.ts`
- [ ] `generateMetadata` (title/description/OG/canonical) בדפי מוצר/קטגוריה
- [ ] Vercel cron: ביטול הזמנות pending + reconcile Cardcom + cleanup rate limits

### P1 - חובה בשבוע הראשון
- [ ] Sentry על client+server+edge עם PII scrubbing
- [ ] uptime monitor חיצוני + `/api/health`
- [ ] התראות כשל תשלום (failed/signature_invalid/reconcile mismatch)
- [ ] חיווט `checkUserRateLimit` לפעולות (checkout, coupon_scan, agent_chat); fail-closed לכספי
- [ ] ISR + on-demand revalidate על דפי הקטלוג; פיצול header מחובר ל-client
- [ ] CI workflow (type-check + lint + test + build) + branch protection על main
- [ ] הורדת TTL של DNS ל-300 (48 שעות לפני קאטאובר)
- [ ] אימות דומיין + SSL ב-Vercel לפני שינוי ה-A record
- [ ] תרגיל שחזור DR אחד (dump → restore → repoint)

### P2 - יציבות והידוק אחרי שיגור
- [ ] retention policy: purge ל-`agent_run_steps`/`coupon_scan_events` (90 יום); audit_log לתמיד
- [ ] אופטימיזציית תמונות pre-upload + `sizes` מדויק; מדידת egress בפועל
- [ ] Vercel Speed Insights / Lighthouse CI מול תקציבי CWV
- [ ] הידוק CSP מ-`unsafe-inline` ל-nonce
- [ ] נוהל secrets rotation מתועד (רבעוני)
- [ ] Supabase PITR add-on כשמחזור התשלומים מצדיק
- [ ] החזרת TTL של DNS לערך רגיל; מחיקת WordPress אחרי שבועיים יציבים
- [ ] SMTP חיצוני ל-auth emails (עוקף את חנק ה-free tier)
