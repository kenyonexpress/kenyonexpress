# מצב השקה, 12.10.2026

נמדד בסשן הזה, מול `origin/main` ברגע `b6846d716` ועם PR 53 פתוח.
כל שורה מסומנת במה שנמדד בפועל ובמה שלא.

## PASS: עובד ונמדד

- **ענפים:** PR 52 מוזג. PR 49 נסגר. הענף הישן נשמר מקומית כ-`archive/feat-products-sort-infinite-scroll-2026-10-12`.
- **לולאות רקע:** `com.kenyon.final-loop`, `com.ke.final-guard`, `com.kenyonexpress.auto-merger`, `com.kenyonexpress.main-auto-pull` ו-`com.ke.notify-ofir` הועברו ל-`.disabled.2026-10-12`. אין תהליך ריצה תואם.
- **build נקי מ-main:** `pnpm install --frozen-lockfile` ו-`pnpm build` יצאו עם 0. ראו TODO על שבירות ה-build.
- **בריאות API (נמדד על `pnpm start`, פורט 3311):**
  - `/api/health` 200, מסד נתונים תקין.
  - `/api/ready` 200: מסד נתונים, redis ו-cardcom תקינים.
  - `/api/cart`, `/api/search`, `/api/search/suggest`, `/api/search/facets`, `/api/search/quick-links` מחזירים 200 עם JSON.
  - `/api/cron/health` מחזיר 401 בלי סוד, כמתוכנן.
- **באג אמיתי שנמצא ותוקן (PR 53):** בעמוד `/cart` ה-sidebar הדביק החליק מעל כפתור "המשך לתשלום" אחרי גלילה, ושורת הקופון חטפה את הלחיצה. נמדד: הבדיקה נכשלה דטרמיניסטית בשני הפרויקטים לפני התיקון, ועברה אחריו.
- **שער מעבר אורח:** `e2e/checkout.spec.ts` עבר 13 מתוך 14 בריצה מלאה אחרי התיקון, ובדיקת ה-CTA שנכשלה עברה בנפרד על שני הפרויקטים. לא הושגו שתי ריצות מלאות ירוקות ברצף, בגלל איטיות Supabase (ראו TODO).

## BLOCKED: דורש את אופיר

1. **Preview ב-Vercel לא נבנה.** ל-scope של Preview בפרויקט `kenyonexpress-prod` לא היה אף משתנה. הוספתי רק את שני המשתנים הציבוריים (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). ה-build עכשיו נופל על `SUPABASE_SECRET_KEY`, שהוא מפתח service-role של פרודקשן שעוקף RLS. לא העתקתי אותו ל-Preview, כי אז כל PR preview מחזיק אותו. החלטה: פרויקט Supabase נפרד ל-preview, או אישור מפורש להעתיק.
2. **בדיקות תשלום מלאות לא רצו.** `purchase-flow`, `full-purchase-redeem`, `physical-purchase` ו-`admin-refund` יוצרות הזמנות, שוברים ומיילים אמיתיים, ודורשות משתמשי `E2E_*`. מסד הנתונים היחיד שמחובר ל-`.env.local` הוא פרודקשן. נדרש מסד לא-פרודקשן או אישור מפורש להריץ מול פרודקשן.
3. **זרימת השקה מלאה (אורח, תשלום, קופון עם QR, מייל) לא נמדדה.** `full-purchase-redeem.spec.ts` כבר מכסה אותה מול מוק Cardcom. תלוי ב-(2).
4. **`/api/ready` מדווח `meilisearch` ו-`r2` כ-`not_configured`.** החיפוש עובד במסלול הגיבוי (תוצאות ריקות בשאילתת בדיקה), ותמונות לא עוברות דרך R2.
5. **פרטי Cardcom לפרודקשן, DNS ו-DKIM של Resend:** לא נבדקו בסשן הזה. הרשומות הקודמות ב-`STATE.md` ובזיכרון הפרויקט הן המקור, ולא אומתו מחדש.

## TODO POST-LAUNCH

- **עמוד המוצרים, מיון וגלילה אינסופית:** יעבור כ-PR ממוקד מעל main. ה-PR הישן נסגר.
- **`main` המקומי התפצל:** 193 קומיטים מקומיים בלבד, 114 מאחור. נשמר כ-`archive/local-main-diverged-2026-10-12`. לא אופס. העבודה בסשן הזה נעשתה מענפים על `origin/main`.
- **stash שנשמר:** שינויי `SiteFooter.tsx` ו-`UI-PARITY-REPORT.md` מהענף הישן. נקרא "pre-main-checkout 2026-10-12". קשור לשדה הניוזלטר ב-footer.
- **שבירות ה-build:** `pnpm build` מרנדר 272 עמודים מול מסד הפרודקשן, עם timeout של 10 שניות. שתיים מתוך ארבע ריצות נכשלו על `fetch failed` או timeout זמני. מומלץ לעבור על נתוני build מקומיים או ל-retry.
- **בדיקות E2E מול מסד איטי:** בזמן הריצות Supabase ענה בין 0.7 ל-2 שניות לבקשה, ובדיקות סל נכשלו לסירוגין. ראו שורת `playwright.config.ts` על `E2E_WORKERS`.
- **`refs/ke_live_*.png`:** לא הועברו. הקבצים לא במעקב git, והסקריפטים `scripts/compare.mjs` ו-`scripts/shoot-mine.mjs` קוראים אותם.
- **`com.ke.notify`:** נשאר טעון, כי הוא שונה מ-`com.ke.notify-ofir` שהתבקש.
- **קטלוג חי:** 25 ממצאים על 44 מוצרים פעילים. ראו `supabase/catalogue-known-issues.json`.
