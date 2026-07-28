# ARCHITECTURE-DEPLOYMENT

תאריך: 2026-07-28. מסמך על: תשתית הפריסה של kenyonexpress.co.il.
גובר על `DEPLOYMENT.md` (לפני המיזוג) בכל סתירה; `docs/DEPLOY.md` נשאר מדריך
הפקודות המעשי. אפס קוד במסמך הזה.

כל מספר כאן נמדד מול העץ ומול ה-DB החי ב-2026-07-28, לא הועתק מגרסה קודמת.
המקומות שבהם הגרסה הקודמת טעתה מסומנים במפורש, כי טעות במסמך פריסה נקראת
כאמת בדיוק ביום שבו אין זמן לבדוק אותה.

## 1. טופולוגיה

| שכבה | ספק | הערות |
|---|---|---|
| Frontend + API routes | Vercel (Next.js App Router) | build מ-`phase5/homepage` |
| DB / Auth / Storage | Supabase | פרויקט יחיד `ixvwfbuvfxxsjiywhbbb`; אין branches בפרודקשן |
| PSP | Cardcom | **ה-API הישן**, ראה 1.1 |
| תמונות | Cloudflare R2 (fallback: Supabase Storage) | presigned PUT מהשרת בלבד |
| חיפוש | Meilisearch (fallback: Postgres LIKE) | **צד שרת בלבד**, ראה 3.1 |
| ניטור | Sentry (`@sentry/node`) | צד שרת בלבד, אינרטי בלי `SENTRY_DSN` |

### 1.1 תיקון: Cardcom הוא ה-API הישן, לא v11 JSON

הגרסה הקודמת של המסמך כתבה "ה-client בעץ עובד מול ה-v11 JSON API". זה שגוי.
‏`src/lib/payments/cardcom.ts` קורא לארבעה endpoints, וכולם מהממשק הישן:

```
/Interface/LowProfile.aspx
/Interface/GetLpResult.aspx
/Interface/ChargeToken.aspx
/Interface/RefundDeal.aspx
```

למה זה משנה ביום העלייה: התיעוד, הפרמטרים ומבנה התשובה של v11 שונים לגמרי,
וכל מי שיפתח את המסמכים של Cardcom לפי המשפט הקודם יקרא את המסמך הלא נכון
בזמן שהתשלומים לא עובדים. בנוסף, ה-webhooks בממשק הזה **אינם חתומים**, ולכן
`CARDCOM_WEBHOOK_SECRET` הוא סוד משותף בשאילתה ולא אימות קריפטוגרפי.

## 2. משתני סביבה

הרשימה הקנונית ב-`.env.example` (221 שורות, מכסה Supabase, Cardcom, R2,
Meilisearch, Voucher QR, WhatsApp, Sentry, WP-import). כללי ברזל:

- שום secret לא מתחיל ב-`NEXT_PUBLIC_`.
- `SUPABASE_SERVICE_ROLE_KEY` (או `SUPABASE_SECRET_KEY`) חי רק ב-Vercel server env.
- `VOUCHER_QR_SECRET` חובה למסלול הוואוצ'רים; אין default, חתימה בלעדיו נכשלת
  קשה. רוטציה דרך `VOUCHER_QR_SECRET_PREVIOUS` + `VOUCHER_QR_KEY_ID`.

### 2.1 מלכודת: `CHECKOUT_ENABLED` פתוח כברירת מחדל

`src/lib/payments/env.ts:27` קובע:

```
const checkoutEnabled = source.CHECKOUT_ENABLED !== 'false'
```

כלומר **היעדר המשתנה פירושו שהצ'קאאוט פעיל**. זה ההפך ממה שצ'קליסט העלייה
מניח כשהוא אומר "להשאיר כבוי עד שער התשלומים". כדי לכבות חייבים להציב את
המחרוזת `false` במפורש; משתנה ריק, חסר, או `0` יפעילו את הצ'קאאוט.

## 3. Security headers (מיושמים ב-`next.config.ts`)

מקור האמת הוא הקוד. נכון ל-2026-07-28:

| Header | ערך |
|---|---|
| Content-Security-Policy | ראה 3.1 |
| Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=(self)` |

### 3.1 ה-CSP, ומה שנראה כמו פער בו ואינו

```
default-src 'self'
script-src  'self' 'unsafe-inline'
style-src   'self' 'unsafe-inline'
img-src     'self' data: blob: *.supabase.co images.unsplash.com plus.unsplash.com
font-src    'self'
connect-src 'self' *.supabase.co
frame-src   secure.cardcom.solutions
form-action 'self' secure.cardcom.solutions
frame-ancestors 'none' | base-uri 'self' | object-src 'none' | upgrade-insecure-requests
```

שלוש נקודות שנבדקו ואינן תקלות:

1. **`img-src` צר מ-`remotePatterns`.** ‏`next.config.ts` מתיר ב-`remotePatterns`
   גם `picsum.photos`, `*.r2.dev` ו-`*.kenyonexpress.co.il`, ואילו ה-CSP לא.
   אין סתירה כל עוד כל תמונה עוברת דרך `next/image`: האופטימיזציה מגישה אותה
   מ-origin שלנו, ולכן `'self'` מכסה. **הרגע שבו זה נשבר** הוא `<img>` רגיל או
   `unoptimized` על מקור חיצוני. ‏45 מתוך 61 המוצרים הפעילים מצביעים היום על
   `picsum.photos`, כך שהחשיפה אמיתית אם מישהו יעקוף את `next/image`.
2. **`connect-src` בלי Meilisearch, וזה נכון.** החיפוש רץ בשרת בלבד
   (`src/lib/search-server.ts` קורא `process.env.MEILISEARCH_API_KEY`). מפתח
   החיפוש הוא סוד שרת ואסור שיגיע לדפדפן. אין לפתוח את `connect-src` עבורו.
3. **`connect-src` בלי Sentry, וזה נכון.** החבילה היא `@sentry/node`, נטענת רק
   ב-`instrumentation.ts` וב-route handlers. אין SDK דפדפן.

חוב ידוע: ‏script/style עדיין `unsafe-inline` עד nonce פר-בקשה דרך
`src/proxy.ts` (‏`INFRA-AUDIT.md` §2). כשה-R2 יופעל להגשה ישירה, יש להוסיף את
`R2_PUBLIC_BASE_URL` ל-`img-src`.

## 4. מסד נתונים

### 4.1 מצב מדוד של הפרודקשן (2026-07-28)

| בדיקה | תוצאה |
|---|---|
| טבלאות ב-public בלי RLS | **0** |
| מוצרים פעילים | 61 |
| מוצרים בלי `platform_percent` | **0** |
| מוצרים בלי `supplier_split_percent` | **0** |
| קופונים פעילים | 15 |
| קופונים בלי `coupon_price_ils` | **0** |
| ספקים בלי כתובת או לוגו | **11 מתוך 11** |
| `products.price_ils` קיימת | כן (059 לא הוחלה) |

שלושה מהשערים שצ'קליסט העלייה עוד מנה כמשימות פתוחות כבר עברו: מילוי
`platform_percent`, מילוי `coupon_price_ils`, ו-RLS מלא. הם נשארים בצ'קליסט
כאימות ולא כעבודה.

השורה שנשארה אדומה: אף אחד מ-11 הספקים אינו נושא כתובת ולוגו. שער הפרסום
בקוד דורש אותם, אבל הוא נאכף רק על כתיבה חדשה דרך טופס האדמין; 61 המוצרים
שכבר פעילים עברו מתחתיו ומוצגים ללקוחות עם עמוד ספק חסר.

### 4.2 ✅ התנגשות מספרי מיגרציה בין ענפים — נפתרה במיזוג

היה חוסם מיזוג. שני ענפים הגדירו את אותם מספרים על קבצים שונים:

| מספר | `phase5/homepage` | `feat/admin-core` |
|---|---|---|
| 090 | `090_wallet_ledger_view_agorot.sql` | `090_profiles_no_self_role_change.sql` |
| 091 | `091_supplier_payout_enums.sql` | `091_product_commission_type.sql` |

**ההכרעה לא נעשתה לפי ענף אלא לפי מה שכבר הוחל.** ledger המיגרציות בפרודקשן
נקרא ישירות, ובו שתי רשומות רלוונטיות: `091_supplier_payout_enums`
(`20260728015905`) ו-`profiles_no_self_role_change` (`20260728142542`).
כלומר בכל אחד משני הזוגות **קובץ אחד כבר הוחל וקובץ אחד לא**, ולא נכון היה
למספר מחדש זוג שלם: מספור מחדש של קובץ שהוחל מנתק את השם שבו הוא רשום ב-ledger
מהשם שבעץ, וזו בדיוק הדרך שבה מיגרציה מוחלת פעמיים.

לכן מוספר מחדש בכל זוג הקובץ **שלא הוחל**:

| היה | הפך ל- | סיבה |
|---|---|---|
| `090_wallet_ledger_view_agorot.sql` | `092_wallet_ledger_view_agorot.sql` | לא הוחלה |
| `091_product_commission_type.sql` | `093_product_commission_type.sql` | לא הוחלה (טיוטה) |

`090_profiles_no_self_role_change` ו-`091_supplier_payout_enums` נשארו במספרם,
כי הם רשומים כך בפרודקשן. אף קובץ אינו קיים היום פעמיים תחת שני מספרים.

### 4.3 משפחת האגורות (058-065): עדיין לא להחיל

‏059 משנה שמות עמודות שהקוד הרץ קורא. אומת ב-2026-07-28 ש-`products.price_ils`
עדיין קיימת בפרודקשן ו-`price_agorot` אינה, כלומר 059 לא הוחלה. ההחלה שלה היא
פרויקט נפרד: קוד קורא `*_agorot` -> מיזוג -> החלה -> ניקוי `*_legacy`.

הריפו כבר נכווה מהפער הזה: עמוד המוצר החזיר 404 על כל מוצר פעמיים באותו שבוע,
פעם כי הקוד ביקש `price_ils` ופעם כי ביקש `price_agorot`, כל אחת כתיקון
לשנייה. הקוד קורא היום את שתיהן בגישוש ולא לפי שם קבוע.

אסור בשום שלב: ‏`supabase db push`, ‏`drizzle-kit push/migrate` מול DB אמיתי.

## 5. Cron ורקע

- `supabase/schedules/analytics_cron.sql`: תזמוני pg_cron לאגרגציות; מוחל ידנית
  אחרי 056, לא חלק מרצף המיגרציות.
- **`vercel.json` אינו קיים בעץ** (נבדק 2026-07-28). הגרסה הקודמת כתבה "אם
  קיים"; אין. כל cron של Vercel חייב להיווצר לפני go-live, אחרת סריקת פקיעת
  הוואוצ'רים לא תרוץ ושוברים שפגו יישארו `issued` וייספרו כפעילים.

## 6. אימות פריסה

```
pnpm type-check && pnpm vitest run && pnpm build
supabase db reset --local
```

‏E2E ‏(Playwright): ‏`pnpm test:e2e`. ידוע: הסוויטה ירוקה רק כש-`.next` כבר
קומפל; בריצה קרה נופלים כ-17 מ-53 בגלל `DISCOVERY_TIMEOUT` קצר מזמן הקומפילציה
הראשונה, לא בגלל רגרסיה. ‏CI על מכונה נקייה יהיה אדום עד שיריצו `next build`
לפני הסוויטה.

**אזהרת cache:** ב-2026-07-28 התברר ש-`.next` שרד כמה החלפות branch והגיש CSS
עם פלטה זרה שאינה קיימת ב-`src/`, כך שאף טוקן מ-`@theme` לא התקמפל ו-
`bg-brand-secondary` הוחזר שקוף. כל מדידה ויזואלית שנעשית בלי `rm -rf .next`
אחרי החלפת branch מתארת עמוד שאיש לא יראה.

צ'קליסט יום ההעלאה: ‏`GO-LIVE.md`.
