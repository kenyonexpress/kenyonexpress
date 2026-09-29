RESUME FROM: M11-c54
Updated: 2026-09-29 (סשן `audit/final-audit`, Sonnet 5, פריט M10-c54)

## המשך מ:

**M10-c54 - test(refund): כיסוי ענפים לשני מודולי ה-refund (29.09).**
המשימה: למצוא את המודול הקריטי עם הכיסוי הנמוך ביותר מבין
`packages/money` (`src/lib/money.ts`), פיצול תשלום (`src/lib/checkout/split.ts`),
מכונת המצבים של שוברים (`src/server/domain/vouchers/state-machine.ts`),
מכונת המצבים של הזמנות (`src/server/domain/orders/state-machine.ts`),
refunds (`src/server/domain/orders/refund.ts` + `refund-request.ts`)
ו-RLS helpers (`src/lib/supabase/rls-report-fetch.ts`), ולהוסיף טסטים
עד כיסוי ענפים מלא. נמדד עם `vitest run --coverage` ו-`--coverage.include`
ממוקד לכל מודול בנפרד (הדוח הגלובלי ב-`vitest.config.ts` מציג רק
`orders/**`, כי הראשי מכסה רק את נתיב הכסף): חמשת המודולים האחרים
עמדו על **100% ענפים** כל אחד (money.ts 21/21, split.ts 4/4,
voucher state-machine 22/22, order state-machine 19/19,
rls-report-fetch.ts 37/37). המודול הנמוך ביותר היה **refunds**:
`refund-request.ts` 93.75% (21/24 → חסר את ה-`instanceof Date` האמיתי
ב-paidAt, שורה 89, כי כל הטסטים העבירו מחרוזת) ו-`refund.ts` 96.36%
(53/55 → חסר את זריקת `INVALID_AMOUNT` בשורה 291 ואת הענף
לא-חוסם/`hasBlocking=false` של הודעת `NOT_REFUNDABLE` בשורה 265).
**נוספו 4 טסטים**: `refund-request.test.ts` — קבלת `Date` ממשי
כ-paidAt (בתוך החלון ומחוץ לו, טסט אחד); `refund.test.ts` — refund
חלקי גדול מהחיוב, refund חלקי שלילי, והודעת "אין שורות שניתן
להחזיר" כששורה כבר `refunded`/`cancelled` בלי חסימה אמיתית (שלושה
טסטים). שני המודולים עכשיו **100% ענפים** (refund-request.ts 24/24,
refund.ts 55/55, יחד 71/71 כשנמדדים במשותף). שערים: `type-check`
נקי, `lint` נקי (biome 2020 קבצים + 12 שערי תוכן, i18n 627/627,
locale 116/116), `test` 605/605 קבצים, 7217/7229 (12 skipped — עלה
ב-4 מ-7213, תואם ל-4 הטסטים החדשים), `build` `exit 0`. אין שינוי UI,
אין שער חזותי נדרש. קבצים ששונו: `src/server/domain/orders/refund.test.ts`,
`src/server/domain/orders/refund-request.test.ts`.

## M09-c54 (ארכיון)

**M09-c54 - STATE CLEAN (29.09): backlog נמדד מחדש בפעם החמש-עשרה
ברציפות, אפס פריט שלב 1 בידי הסוכן.** המשימה: לקחת את הפריט הפתוח בעל
ההשפעה הגבוהה ביותר הרשום ב-`STATE.md` שסוכן קוד יכול לבצע בלי אופיר,
לממש במלואו עם טסטים; אם אין — STATE CLEAN. `CLAUDE.md`, `STATE.md`
(כולל כל 12 "חוסמים פתוחים") ו-`docs/BACKLOG.md` (15 סעיפים) נקראו
במלואם, וכן `git log -20`. `git log -5 -- docs/BACKLOG.md
docs/POST-LAUNCH-BACKLOG.md docs/MIGRATION-BACKLOG.md` מאשר אפס דחיפה
חדשה מאז `b96a4e8d4` (M15-c53) לפני העריכה הזו. כל 15 הסעיפים נבדקו שוב
מול תנאי העצירה: env/secret של Vercel (2,3,6,8,9), פריסת HEAD (4),
מיגרציה על פרודקשן (5), הכרעת מפעיל על קטלוג (7), חשבון Cloudflare
חיצוני (10), מיזוג ענף (11), בדיקת תהליך רקע (12), ערך שרק אופיר מחזיק
(13), ספק SMS חיצוני (14), מחיקת נתונים הדורשת אישור (15) — אף אחד לא
שלב 1 בידי הסוכן. **בדיקה עצמאית נוספת (שונה מ-M08-c54, שכבר כיסה
TODO/FIXME ו-`test.skip`): `git stash list` — 32 stash-ים, לא 10 כפי
שהיה רשום ב-`docs/BACKLOG.md` סעיף 15** (מספר ישן, מהרשימה בארכיון תחת
Q01; המחיקה עצמה עדיין אסורה בלי אישור אופיר לפי כלל הפרויקט, כך שזו
תיקון תיעוד בלבד, לא ביצוע). **תוקן ב-`docs/BACKLOG.md`.** אין פריט אחר
שדורש שינוי. **זו הפעם החמש-עשרה ברציפות** שאותה מסקנה נמדדת (M08-c1..
M08-c54, ועכשיו M09-c54). שערים: `type-check` נקי, `lint` נקי (biome
2020 קבצים + 12 שערי תוכן, i18n 627/627, locale 116/116), `test` 605/605
קבצים, 7213/7225 (12 skipped, זהה), `build` `exit 0`. אין שינוי קוד
יישומי, אין שער חזותי נדרש (אין שינוי UI). **קובץ שונה מלבד `STATE.md`:
`docs/BACKLOG.md`** (תיקון מספר stash-ים).

## M08-c54 (ארכיון)

**M08-c54 - BACKLOG EMPTY (29.09): אפס פריט שלב 1 בידי הסוכן, נמדד
ישירות פעם נוספת ברצף.** המשימה: לקחת את פריט שלב 1 הפתוח בעל ההשפעה
הגבוהה ביותר מ-`docs/BACKLOG.md` (לא נדחה, לא שלב 2) ולממש אותו במלואו
עם טסטים; אם אין — לכתוב BACKLOG EMPTY. `CLAUDE.md`, `STATE.md` (כולל 12
"חוסמים פתוחים") ו-`docs/BACKLOG.md` (15 סעיפים) נקראו במלואם, וכן
`git log -20`. **`docs/BACKLOG.md` לא זז מאז `b96a4e8d4` (M15-c53)** —
`git log -5 -- docs/BACKLOG.md docs/POST-LAUNCH-BACKLOG.md
docs/MIGRATION-BACKLOG.md` מאשר. הקובץ עצמו אומר את זה במפורש בשורה 16-18:
"Nothing here is an action an agent may take alone" — כל 15 הסעיפים הם
env/secret של Vercel (2,3,6,8,9), פריסת HEAD (4), מיגרציה על פרודקשן
הדורשת אישור (5), הכרעת מפעיל על נתוני קטלוג (7), חשבון Cloudflare חיצוני
(10), מיזוג ענף (11), בדיקת תהליך רקע (12), ערך שרק אופיר מחזיק (13),
ספק SMS חיצוני (14), ומחיקת נתונים הדורשת אישור (15) — כל אחד מהם חוסם
לפי תנאי העצירה של CLAUDE.md, אף אחד לא שלב 1 בידי הסוכן. **זו הפעם
הארבע-עשרה ברציפות** שאותה מסקנה נמדדת (M08-c1..M09-c53, ועכשיו M08-c54).
מעבר לחזרה, שני בדיקות עצמאיות נוספות: `grep` על `TODO|FIXME|XXX` בכל
`src/` (20 תוצאות, לא 19 — הבדל בודד; נבדקו כולן: 18 הן placeholder-י
פורמט טלפון/קוד כמו `05XXXXXXXX`/`XXXXX-XXXXX`, לא markers, ו-2 הן
`TODO(cardcom)` אמיתיים ב-`src/lib/payments/cardcom.ts` שורות 254 ו-319 —
נקראו במלואם, שניהם מתועדים כחסומים על מפתחות Cardcom של פרודקשן שאין
לשום סביבה כאן גישה אליהם (Issue #41/#42, אותו חוסם 6 ב-BACKLOG.md, ולא
אינטגרציית ספק תשלום מותרת לפי חוקי הפריט), ו-`test.skip`/`it.todo` תחת
`e2e/` (57 תוצאות, כל דילוג מותנה בדגל סביבה/seed/fixture חסר, לא באג
שנשכח). **אפס פריט בר-ביצוע לסוכן.** שערים: `type-check` נקי, `lint` נקי
(biome 2020 קבצים + 12 שערי תוכן, i18n 627/627, locale 116/116), `test`
605/605 קבצים, 7213/7225 (12 skipped, זהה), `build` `exit 0`. אין שינוי
קוד, אין שער חזותי נדרש (אין שינוי UI). **קובץ יחיד שונה: `STATE.md`.**

## M07-c54 (ארכיון)

**M07-c54 - DONE (29.09): route audit נמדד מחדש, 241 מסלולים, אפס כשל
אמיתי.** אותו מתכון שאומת ב-M07-c1/M07-c53: `CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:3491 pnpm build` -> `exit 0`; `CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:3491 PORT=3491 pnpm start` (פורט אומת
פנוי לפני ההרצה, לא התנגש עם שש בניות אחרות שרצות במקביל בפורטים 3419-3488);
`curl` אישר `200` על `/` ועל `/product/barbecue-2`. `e2e/route-audit.spec.ts`
בשישה chunks בפורגראונד נגד אותו שרת, `ROUTE_AUDIT_REPORT=/tmp/route-audit.jsonl`,
`E2E_ADMIN_EMAIL=e2e-admin@kenyonexpress.co.il`, `E2E_FORWARDED_FOR` שונה
לכל chunk (10.77.0.31..36): `"anon /"` (59 עברו), `"GET /|route audit:
supplier|anon dynamic"` (83 עברו), `"route audit: customer"` (25 עברו),
שלושה chunks אדמין `"admin /admin$|admin /admin/(a|b|c|d)"` (23 עברו),
`"(f|g|h|i|o|p|q|r)"` (20 עברו), `"(s|u|v|w)|admin detail pages"` (16 עברו)
— **226/226 טסטים עברו, אפס כישלון**. ניתוח ה-jsonl (דה-דופ לפי role+path,
241 שורות ייחודיות): **239 PASS / 2 NO DATA / 0 FAIL** — שתי ה-NO DATA
זהות ל-M07-c53: `customer /account/tickets/[id]`, `admin
/admin/discounts/[id]` (רשימות ריקות, אין שורה לגלות ממנה id אמיתי, לא
תקלה). **אפס שגיאת קונסול, אפס אזהרת hydration, RTL תקין בכל דף HTML**
(74 שורות עם `rtl: null` הן נתיבי לא-HTML כמו `sitemap.xml`, `robots.txt`,
`manifest.webmanifest`, `api/*` — נכון שאין להן כיווניות, לא כשל). זהה
ב-100% לתוצאת M07-c53 (239/2/0, אותן שתי NO DATA). שרת הבדיקה נעצר, פורט
3491 אומת פנוי, קובץ ה-jsonl הזמני נמחק. **אין תיקון קוד נדרש.** שערים:
`type-check` נקי, `lint` נקי (biome 2020 קבצים + 12 שערי תוכן, i18n
627/627, locale 116/116), `test` 605/605 קבצים, 7213/7225 (12 skipped,
זהה), `build` `exit 0`. אין פריט UI, אין שער חזותי נדרש. **קובץ יחיד שונה:
`STATE.md`.**

## M03-c54..M06-c54 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M03-c54 (תיקון import דפרקציה של Sentry), M04-c54 (תחזוקת תלויות, אפס
שדרוג בהיקף), M05-c54 (ביקורת DB, 44 WARN זהה), M06-c54 (Lighthouse
mobile, כל שמונת הציונים 90+) — כולם DONE, אפס שינוי UI, ארבעתם עם
שערים ירוקים. הועברו ב-M08-c54 לשמירה על תקרת 300 שורות.

## M02-c54 (ארכיון)

**M02-c54 - DONE (29.09): שער חזותי נמדד מחדש, בית ומוצר, שלושה רוחבים,
אפס רגרסיה.** הרצה בפורגראונד על שרת `pnpm start` על פורט 3311
(`BUILD_ID=ucTZms1q6GMwozCalBEsz`, תואם ל-HEAD `7a57c8049`). הבסיס
ל-`--page=home` נשאר `refs/ke_live_{width}.png` (התקציב לפני חיתוך ה-DNS,
09.09) לפי ההחלטה התיעודית ב-`docs/PARITY-REFERENCE.md` (מסלול 3: שער
רגרסיה מול צילום קפוא, לא מול הדומיין החי — הדומיין החי עכשיו מגיש את
הבנייה שלנו עצמה ומסרב עם exit 5, נמדד גם כאן: `REFUSING to measure`).
הבסיס ל-`--page=product` נשאר `refs/electro_product_{width}.png` (Electro
v7 אמיתי, שלוש רוחבים, מ-25.09). **תוצאות, כולן PASS מתחת ל-11%:**

| עמוד | 380 | 768 | 1440 |
|---|---|---|---|
| בית | 8.51% | 9.02% | 3.95% |
| מוצר | 4.96% | 4.56% | 3.25% |

תואם בתוך רעש למדידה הקודמת (M02-c53: 8.51/9.19/3.95 בית,
4.96/4.56/3.25 מוצר) — אפס רגרסיה, אין צורך בתיקון UI. השער כתב שש שורות
חדשות ל-`docs/UI-PARITY-REPORT.md` בעצמו (כולל שורת REFUSED אחת על ניסיון
ראשון ללא `--baseline`, exit 5 תקין). שערים: `type-check` נקי, `lint` נקי
(ביומי + 12 שערי תוכן, i18n 627/627), `test` 605/605 קבצים, 7213/7225 (12
skipped, זהה), `build` `exit 0`. אין שינוי קוד נדרש. **קובץ יחיד שונה מלבד
`STATE.md`: `docs/UI-PARITY-REPORT.md`** (נכתב אוטומטית ע"י השער).

## M01-c54 (ארכיון)

M01-c54 היה בדיקת פרודקשן: build+deploy לפרודקשן, ואז `dig`/`curl` על שני
הדומיינים. **DNS: עדיין תקין**, נמדד שוב היום — `kenyonexpress.co.il` ->
`216.198.79.1`/`216.198.79.65`, NS `ns1/ns2.vercel-dns.com`,
`www.kenyonexpress.co.il` -> `64.29.17.1`/`64.29.17.65`.
`curl https://www.kenyonexpress.co.il` **200** עם HTML אמיתי (`lang="he"
dir="rtl"`, לוגו קניון EXPRESS); `curl https://kenyonexpress.co.il` (בלי
www) **308** ל-`https://www.kenyonexpress.co.il/` (הפניה תקינה של Vercel,
לא כשל). **לא DNS BLOCKER** — אין מה לכתוב שם. **פריסה: נוסתה בפועל**
דרך Vercel MCP `create_deployment`, `gitSource` github,
`audit/final-audit`@`0bcbdac18` (HEAD), `target=production`, פרויקט
`kenyonexpress` (`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`) — **וסורבה שוב**, אותו
קוד שגיאה בדיוק: `dpl_BjMEzT55uBAcYWotmvpZkAuzmNdR`, `state=ERROR`,
`errorCode=BUILD_UTILS_SPAWN_1`, `errorMessage="Command \"node
scripts/deploy-preflight.mjs && pnpm build\" exited with 1"`.
`filter_project_envs` (קריאה בלבד, אין שינוי) מאשר שהסיבה לא זזה:
`CARDCOM_MERCHANT_ID`/`CLIENT_ID`/`API_KEY` עדיין קיימים ב-Production במקום
`CARDCOM_TERMINAL_NUMBER`/`API_NAME`/`API_PASSWORD` שהקוד קורא, ו-
`ALLOW_INCOMPLETE_ENV` עדיין מוגדר שם. **זו הפעם הרביעית** שאותו חוסם נמדד
(M01-c1, M01-c52, M01-c53, ועכשיו M01-c54) — אין פעולה חדשה לנסות, הפתרון
תלוי אך ורק בעדכון סביבת Vercel בידי אופיר (`docs/BACKLOG.md` סעיף 3).
נבדק גם שפרודקשן לא נפגע: `dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa` עדיין
`READY` ומחזיק את כל ה-aliases (`www.kenyonexpress.co.il` וכו'), עדיין על
`a388118f1`, עכשיו **87** קומיטים מאחורי HEAD (היה 83 ב-M01-c53/M15-c53).
אין שינוי קוד, אין שער חזותי נדרש (לא UI). פריט תיעוד/מדידה בלבד, קובץ
יחיד שונה: `STATE.md`.

## M11-c53..M18-c53 (ארכיון)

M11-c53: עדיין לא קיים ב-`HEAD`/`origin` (נבדק שוב עם `git fetch` ב-M16-c53).
פריטים M12-c53..M18-c53 בוצעו מחוץ לסדר לפי הקצאה מפורשת, כמו שתועד בכל אחד.

**M18-c53 - DONE (29.09): בדיקת אפס-פעילות (idle check) — המחזור לא היה
אפס-פעילות, אין שיפור מומחש.** המשימה: אם כל פריטי המחזור (c53) לא הפיקו
שינוי קוד, לכתוב "MAINTENANCE IDLE" ואז לחפש שיפור המרה אחד אמיתי בעמוד
הבית או המוצר לפי Electro v7. **נמדד ישירות מול `git log`, לא הונח:**
ארבעה קומיטים ב-c53 כן הפיקו שינוי קוד אמיתי — `f920dc5ec` (M04, שדרוגי
תלות), `27b03f812` (M10, 18 טסטים חדשים ל-`refund.ts`, 67.1%→100% ענפים),
`e371afd2f` (M14, תיקון באג `fill`+px `sizes` בשני רכיבי אדמין, bundle
ירד), `15c97abff` (M17, שלושה תיקוני קופי אמיתיים כולל שינוי קוד ב-
`CheckoutForm.tsx`). תנאי ה-idle הוא `false` — **לא** נכתב MAINTENANCE
IDLE, ולפי הניסוח המותנה של המשימה השיפור המומחש רלוונטי רק לענף ה-true.
עמוד הבית ועמוד המוצר נסקרו בכל זאת (`src/app/(store)/page.tsx`,
`ProductInfo.tsx`, `ProductCard.tsx`, `product/[slug]/page.tsx`) לוודא
שאין החמצה: שניהם כבר נושאים כוכבי דירוג, מחסור מלאי חי, "נקנה השבוע",
wishlist, שיתוף, related products, ותגי הנחה — כל תוספת חזותית נוספת
דורשת מדידת שער חזותי (11%) שקומיטים קודמים (M14-c53 ועוד) מראים שהיא
שוברת בקלות (שורת ה-city ב-`page.tsx` שורה ~90: 9.77%→21.65% מאותה תוספת
50px בודדת). לא הוספתי UI לא-נמדד כדי "למלא" את הענף השגוי של תנאי.
שערים: `type-check` נקי, `lint` נקי (biome + 12 שערי תוכן, i18n 627/627),
`test` 605/605 קבצים, 7213/7225 (12 skipped, זהה), `build` `exit 0`. אין
שינוי קוד, אין שער חזותי נדרש (אין שינוי UI). **קובץ יחיד שונה: `STATE.md`.**

**M12-c53..M17-c53 פירוט מלא בארכיון** (`docs/STATE-ARCHIVE.md`, הועברו ב-M17-c53 לשמירה על תקרת 300 שורות; שום שורה לא נמחקה, רק הוזזה).

ההיסטוריה המלאה (Q01..Q24, B01..B10, M01-c1..M11-c53, תור 23.09, וכל מה שקדם) ב-`docs/STATE-ARCHIVE.md`, החדש למעלה. הקובץ הזה מחזיק רק את מה שחי.

## טבלת מצב לתור `final-queue.txt`

התור נסגר (B10 היה האחרון). כל השורות (Q01..Q24, B01..B10, M01-c1..M09-c1,
M11-c51..M15-c52) הועברו ל-`docs/STATE-ARCHIVE.md` ב-M14-c53 לשמירה על
תקרת 300 שורות; שום שורה לא נמחקה, רק הוזזה. SHOWABLE: no, ראו "חוסמים
פתוחים" למטה.

## חוסמים פתוחים (לא בידי הסוכן)

1. **DNS אצל הרשם — RESOLVED (29.09, M01-c52).** ה-NS של `kenyonexpress.co.il`
   כבר `ns1.vercel-dns.com`/`ns2.vercel-dns.com` (לא `ns1/ns2.vercel.com`
   כפי שנמדד בכל בדיקה מ-25.09 ועד M18-c51). `dig +short A` מחזיר
   `216.198.79.1`/`216.198.79.65`, `curl` ל-`www.kenyonexpress.co.il` מחזיר
   `200` עם תוכן אמיתי (`lang="he" dir="rtl"`, כותרת קניון EXPRESS). מי שינה
   ומתי — לא נמדד, רק התוצאה. **לחשבון שלושה פרויקטי Vercel; רק הפרויקט
   בשם `kenyonexpress` (`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`) מחזיק את הדומיין
   — `kenyonexpress-prod` הוא פרויקט אחר שמחזיק רק `.vercel.app`, אל תבלבלו
   ביניהם.** פירוט מלא ברשומת M01-c52.
2. **פריסת פרודקשן של HEAD (87 קומיטים אחרי `a388118f1` החי, עודכן M01-c54)**:
   נוסתה שוב ב-M01-c54 (Vercel MCP, `create_deployment`, `gitSource` github,
   `audit/final-audit`@`0bcbdac18`) **וסורבה שוב ב-`deploy-preflight`**
   באותה סיבה בדיוק, פעם רביעית ברציפות (M01-c1, M01-c52, M01-c53, M01-c54):
   `dpl_BjMEzT55uBAcYWotmvpZkAuzmNdR`, `BUILD_UTILS_SPAWN_1`.
   `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`
   עדיין חסרים ב-Production (קיימים במקומם
   `CARDCOM_MERCHANT_ID`/`CLIENT_ID`/`API_KEY` שהקוד לא קורא) ו-
   `ALLOW_INCOMPLETE_ENV=true` עדיין מוגדר שם (נמדד עם `filter_project_envs`,
   קריאה בלבד). עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה;
   פרודקשן נשאר על `a388118f1` (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, READY)
   ולא נפגע מהניסיון. **DNS אינו קשור לחוסם הזה** — נמדד שוב ב-M01-c54,
   `www.kenyonexpress.co.il` מחזיר 200 עם התוכן החי (`a388118f1`).
3. **מיגרציות ממתינות**: **218 (טריגר `enforce_profile_privilege_columns` מפיל כל
   עדכון פרופיל של לקוח ב-42703; נמדד 25.09 ב-M05-c1, 5 מ-5 לקוחות, בניגוד לרישום
   "הוחלה" מ-21.09)**, 245 ו-246 (advisors, M05-c1; 245 אחרי 209 ואחרי 203), 204 (הצטרפות ספקים והסכם click-wrap; בלעדיה הטופס
   עונה "עדיין לא פעיל"), 240 (הסכמת "הכל באפליקציה"), 241 (עיר משלוש
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר), 244 (קמפיינים
   והמרות של תוכנית השותפים; בלעדיה התוכנית "עדיין לא פתוחה"), 247 (`anon`
   בלי הרשאת SELECT על `reviews`, נמדד M18-c52; בלעדיה דף הביקורות הציבורי
   נכשל תמיד, ללא תלות בשום קובץ אחר). סדר והתנאים
   ב-`docs/RUNBOOK.md`, סקירה ב-`docs/MIGRATION-REVIEW.md`. לא הוחל דבר.
4. **R2 לא מופעל בחשבון Cloudflare** (10.09): תמונות המוצר נופלות ל-Supabase
   Storage, וגיבויי ה-DB החיצוניים אינם נכתבים כלל.
5. **צילומי reference ב-380 וב-768 לסל ולקופה**: קיימים רק ב-1440
   (`refs/live-cart.png`, `refs/live-checkout.png`), ולכן השער של Q10 נמדד ב-1440
   בלבד. **דף המוצר נסגר ב-Q05b (25.09)** עם reference של Electro v7 בשלושת
   הרוחבים (`refs/electro_product_{380,768,1440}.png`, נוצר מחדש בפקודה
   ב-`docs/MISSING-ASSETS.md` סעיף 1; `refs/` אינו ב-git). **לסל ולקופה נוסה
   ב-M09-c1 (25.09): הדמו עונה `403 - Forbidden` על `/cart/` ועל `/checkout/`, עם
   seed ובלי, בעוד המוצר נפתח.** הסקריפט כבר יודע לזרוע (`--add-to-cart=2439`)
   והשער כבר מחווט; הפקודות ליום שהדמו יענה ב-`MISSING-ASSETS.md` סעיף 1b.
6. **`RESEND_API_KEY` בפרודקשן**: השם קיים ב-target Production של הפרויקט
   (נמדד 25.09, Q24; הערך לא נקרא). בלי ערך תקף כל חמשת המיילים נופלים
   בשקט ל-`skipped`, ואיפוס סיסמה חוזר ל-SMTP של Supabase.
7. **`SUPABASE_SECRET_KEY` חשוף ודורש רוטציה** (CLAUDE.md, `RUNBOOK`);
   `deploy-preflight` מסרב לבנות איתו, ומ-B01 (25.09) הוא רץ בפועל לפני
   `pnpm build` ב-`vercel.json`. **נמדד ב-M01-c1: הסריקה על סביבת Production
   של Vercel לא מצאה את המפתח החשוף** (אף שורת `COMPROMISED`), כלומר החשיפה
   נוגעת לעותקים מקומיים ולנוהל, לא לפריסה.
8. **Cardcom בפרודקשן**: ספק התשלום ב-mock, נמדד 25.09 על `/checkout` החי
   (`frame-src ... 'self'`); 24 תשלומי `mock-` ו-0 אמיתיים ב-30 יום. שמות
   `CARDCOM_API_KEY`/`CLIENT_ID`/`MERCHANT_ID`/`USE_MOCK` ו-`CHECKOUT_ENABLED`
   קיימים בפרויקט (ערכים לא נקראו).
9. **מספר עוסק/ח.פ לשורת המוכר** באישור הרכישה (Q09): אינו קיים בריפו.
   עריכה אחת ב-`messages/he.json`, `purchaseConfirmation.sellerName`.
10. **המתזמן מתוזמן ונדחה** (Q24): `cron.yml` על `main` נכשל 40/40, כל נתיב
    עונה 401 ל-`CRON_SECRET` של GitHub (סוד שונה מזה ב-Vercel). 72 הודעות
    `pending` ב-`notification_outbox` מאז 10.09; `expire-vouchers` ושאר 21
    העבודות לא רצות. תיקון: אותו ערך בשני המקומות. פעולה של אופיר בלבד.
11. **הקטלוג החי מכיל שורות תבנית וכפילויות** (`supabase/catalogue-known-issues.json`,
    **26** ממצאים על 44-46 מוצרים פעילים לפי המדידה — לא 25; ראו M15-c53
    למעלה): שלוש שורות `מאסטר`, חמש `-copy`/`-העתק`/`-לדוגמא`, שמות שסותרים
    slug, מחיר שסותר את הטקסט של עצמו, ותמונה חסרה (`מזקקת וויסקי`). **לא
    היה רשום כחוסם ב-STATE.md עד M15-c51** (נמדד ב-`docs/LAUNCH-READINESS.md`
    שורה חוסמת 6 ו-`CLAUDE.md` §"מצב נוכחי", ששניהם עדיין אומרים 25); שער
    `pnpm test src/lib/catalogue` ירוק מול הפנקס — הפנקס הוא הכרעת מפעיל,
    לא תקלה שנמדדת.
12. **`scripts/cron-jobs.json` ב-`main` מכיל שבעה נתיבים ש-HEAD אינו מגיש**
    (`search-reindex`, `job-dlq`, `search-outbox`, `cashback-settlement`,
    `email-retry`, `expire-cashback`, `expire-coupons`), כל אחד עונה 404 גם
    אחרי שחוסם 10 נסגר. נפתר מעצמו במיזוג הענף הזה ל-`main`. **לא היה רשום
    ב-STATE.md עד M15-c51** (נמדד ב-`docs/LAUNCH-READINESS.md` ידני 9).

## ידני לאופיר, לפי סדר קריטיות

הרשימה המלאה, ממוזגת עם `docs/LAUNCH-READINESS.md` וללא כפילויות, עברה
ל-`docs/BACKLOG.md` (M15-c51). לא נשמר עותק כאן, כדי שלא ייסטה שוב.
