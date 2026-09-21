# ביצועים: המפה והמדידה (‏SECTIONS 84)

נמדד ‏22.09.2026 מול ‏`pnpm start` של ה-build הנוכחי על המחשב הזה. המסמך
הזה הוא האינדקס לשמונת הפריטים של הסעיף; המספרים המלאים והשיטה
ב-`PERFORMANCE-REPORT.md`, למה המספר המדומה אינו יעד ב-`PERFORMANCE-BUDGET.md`,
המטמון ב-`CACHING.md`, האינדקסים ב-`INDEX-USAGE-REPORT.md` ו-`LOAD-TEST-RESULTS.md` §3.

## 1. הסעיף, שורה מול מה שיש

| מה הסעיף ביקש | מצב | הראיה |
| --- | --- | --- |
| ‏edge caching | **חלקי, מבנית.** ‏`cacheComponents` נותן קליפה סטטית ‏(‏PPR) ורצועות ‏`'use cache'` ‏(‏18 קבצים, ‏32 ‏`cacheLife`); **המסמך עצמו** יוצא ‏`private, no-store` כי ה-layout קורא עוגיות ‏(עגלה, סשן). ב-Vercel הקליפה מוגשת מהקצה והחורים זורמים; ‏localhost לא מראה את זה. | כותרות ‏`/` ו-`/product/*` מה-build |
| ‏ISR revalidate-on-write עם ‏tags | **יש.** תג קטלוג אחד ו-66 קריאות ‏`updateTag`/`revalidateTag`; שער ‏`cache-invalidation-gate` ב-lint מכריח כל כתיבה לטבלה ממוטמנת לבטל. | ‏`CACHING.md` |
| אינדקסים מ-pg_stat_statements | **נמדד ב-42, אין מה להוסיף.** שאילתת אפליקציה אחת מעל ‏100ms, ‏1.4ms ביצוע, ‏5 ‏buffers; אינדקס לא היה משנה. | ‏`LOAD-TEST-RESULTS.md` §3 |
| ‏Supavisor pooling | **לא רלוונטי כאן.** האפליקציה מדברת ‏PostgREST ‏(‏supabase-js), לא ‏Postgres ישיר; ה-pool הוא של ‏PostgREST. אין ‏`DATABASE_URL` בקוד. | ‏`grep -r DATABASE_URL src` ריק |
| תקציב ‏bundle | **יש שער ומדידה.** ‏`bundle-gate.mjs`, ‏`bundle-report.mjs`. היום: ‏390 ‏kB ‏gzip ראשוני בכל ‏route, ‏132 ‏kB מהם ‏Sentry ‏(נמדד ונבחר ב-62). | ‏§2 |
| ‏Heebo תת-קבוצה עברית | **יש.** ‏`next/font` עם ‏`subsets: ['latin', 'hebrew']`, חמישה ‏woff2 של ‏12 עד ‏30 ‏kB. | ‏`.next/static/media` |
| ביקורת ‏sizes לתמונות | **נמדד: החנות נקייה.** כל ‏`fill` בחנות נושא ‏`sizes` מדוד ‏(‏`ProductCard` מתעד ‏14 רוחבי חלון). שני ‏preview באדמין קיבלו ‏`sizes` היום. | ‏§3 |
| ‏INP < 200ms | **לא ניתן למדידה במעבדה.** ‏INP הוא מדד שדה; ‏Lighthouse מדווח ‏TBT כתחליף. ‏TBT ב-`provided` למטה. | |
| ‏Lighthouse 95+ מובייל בבית/מוצר/קופה | **מדומה: ‏61 / ‏81 / ‏54. ללא סימולציה: ראה ‏§2.** נגישות ‏100 ו-SEO ‏100 בבית ובמוצר. הפער הוא הסימולציה, כפי ש-`PERFORMANCE-BUDGET.md` הוכיח; היעד צריך פריסה, לא עוד מדידה מקומית. | ‏`scripts/lighthouse-smoke.mjs` |

## 2. המספרים של היום

**‏Lighthouse מובייל, ‏`simulate` ‏(ברירת המחדל):** בית ‏61, מוצר ‏81, ‏`/checkout`
‏54 ‏(ה-SEO ‏69 שם הוא ‏noindex מכוון). **‏`--throttling-method=provided`, אותו
build ואותו שרת:** בית ‏**100** ‏(‏LCP ‏0.2 שניות, ‏TBT ‏0 ‏ms, ‏CLS ‏0.002), מוצר
‏**100** ‏(‏LCP ‏0.1 שניות, ‏TBT ‏0, ‏CLS ‏0.001). הפער כולו הוא סימולציית הרשת של
‏Lighthouse על מסמך של ‏56 ‏kB ו-390 ‏kB ‏JS, לא זמן שרת: ‏`PERFORMANCE-BUDGET.md`
אומר למה אין לכוונן מול המספר המדומה ומה כן ‏(‏JS ראשוני, ‏Sentry).

**‏JS ראשוני, ‏gzip:** ‏`/` ‏390.2 ‏kB, ‏`/products` ‏388.4, ‏`/checkout` ‏393.5,
‏`/cart` ‏387.1; ‏27 ‏chunks, ‏413.6 ‏kB סך הכל. הגדולים: ‏132.2 ‏(Sentry), ‏62.8,
‏38.5, ‏34.2. **המסמך של הבית:** ‏592.7 ‏kB גולמי, ‏~56 ‏kB ‏gzip; ההרכב
ב-`PERFORMANCE-REPORT.md` §2 ‏(‏49% ‏RSC flight, ‏14% ‏SVG inline).

**כותרות מטמון מה-build:** ‏`/` ו-`/product/*`: ‏`private, no-cache, no-store`;
‏`/category/*` ‏404 ‏(‏slug לא קיים) עם ‏`s-maxage=3600, stale-while-revalidate`;
‏`/api/health`: ‏`no-store`.

## 3. ביקורת התמונות

‏31 שימושי ‏`next/image`. סורק שמתעלם מהערות ‏(הראשון נפל על ‏`->` בתוך הערת
המדידה של ‏`ProductCard`, ולכן דיווח שקר) מוצא: ‏`SmartImage` ‏(עטיפה שמעבירה
‏props, לא ממצא), ו-`ImageUploader` + ‏`CouponDealForm` באדמין עם ‏`fill` בלי
‏`sizes`, שהיו מבקשים מועמד ברוחב החלון לתיבה של ‏160/320 ‏px. תוקנו.

## 4. מה לא נבנה, ולמה

- **‏nonce/edge לקליפה:** המסמך יישאר ‏no-store כל עוד ה-layout קורא את העגלה
  מעוגייה; זו ההחלטה של ‏PPR: קליפה מהקצה, מסמך מהשרת.
- **קיצוץ ‏Sentry:** נמדד ב-62 ונבחר במכוון.
- **‏Lighthouse 95:** יעד שנמדד על פריסה אמיתית. ‏`PERFORMANCE-BUDGET.md`
  אומר איך לרשום אותו כשיהיה ‏URL.
