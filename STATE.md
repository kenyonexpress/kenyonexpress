Updated: 2026-09-25 (סשן `audit/final-audit`, Fable 5.1, תור `~/ke-goals/final-queue.txt`)

## המשך מ:

**Q06 DONE.** הבא בתור: **Q07** (הטבלה מסמנת אותו DONE ב-`9fe2ca441`; לאמת על
העץ ולסגור לפי כלל "פריט שכבר נעשה: לאמת, לרשום, לסיים").

ההיסטוריה המלאה (Q01..Q05, תור 23.09, וכל מה שקדם, 24,310 שורות) עברה
ל-`docs/STATE-ARCHIVE.md` באותו קומיט. הקובץ הזה מחזיק רק את מה שחי.

## SHOWABLE: no

**Q06 (25.09): נבדק מול הרשת, מול Vercel, מול git ומול שער ההשוואה, לא מול
הרישומים הקודמים.** Q03, Q04 ו-Q05 עשויים ומאומתים בקוד; Q02 חסום. לכן לא
`yes`. מה שחסר, במדויק, לפי פריט:

| פריט | מה יש (ראיה) | מה חסר ל-SHOWABLE |
|---|---|---|
| Q02 | build ירוק ב-Vercel, פריסת פרודקשן `dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa` READY מ-git sha `a388118f1`, ‏200 על `https://kenyonexpress.vercel.app/` (נמדד עכשיו). | (א) **הדומיין לא מתרגם**: `dig +short A kenyonexpress.co.il @1.1.1.1` ריק, `www` ריק ב-8.8.8.8, `curl https://kenyonexpress.co.il/` ו-`www` מחזירים exit 6. הרשם (`dig NS @ns1.ns.il`) עדיין מאציל ל-`ns1.vercel.com`/`ns2.vercel.com`; ה-zone הנכון עונה SOA ב-`ns1.vercel-dns.com`. **פעולה של אופיר בלבד.** (ב) **הפריסה החיה היא `a388118f1`, ארבעה קומיטים מאחורי HEAD** (`0f981138e`, `6fb5fe971` Q04, `8d924b196` Q03, `2ee29bc90` Q05). ב-HTML החי: `0` ‏`pdp-small-print` ב-`/product/barbecue-2`, ‏`0` ‏`p_con__city` בדף הבית, ‏30 תמונות `ke-live-deal-N.webp` (הגריד הקפוא). פריסה לפרודקשן היא אחד מארבעת מצבי העצירה ואינה חלק מ-Q06; נרשמת כאן כפריט ידני. |
| Q03 | `8d924b196` על origin. **שער נמדד בסשן הזה על HEAD נקי, `pnpm build` (BUILD_ID `LaycI8sfKnHf2W15yrW5Z`), `pnpm start` על 3311, `--widths=380,768,1440 --baseline=refs/ke_live_{width}.png`, בחזית: 380 ‏8.44% PASS, ‏768 ‏9.03% PASS, ‏1440 ‏3.82% PASS**, exit 0. השורות ב-`docs/UI-PARITY-REPORT.md` 19:59-20:02 UTC; הראשונה `2ee29bc90` נקי, השתיים אחריה `-dirty` רק כי השורה הראשונה כבר שינתה את הפנקס עצמו. | **עיר על הכרטיס בפרודקשן**: `products.city` הוא NULL בכל 46 השורות הפעילות, ‏`241_seed_product_city_from_title.sql` ממתינה ולא הוחלה (ממלאת 3), והשאר דורש מילוי בטופס Q05 אחרי פריסה. עד אז שורת המטא בפרודקשן מציגה קטגוריה בלבד. |
| Q04 | `6fb5fe971` על origin: מקור מחיר רגיל, קישור ביקורות גוגל, אותיות קטנות, ‏242 ממתינה. | (א) **השער בדף המוצר נמדד ב-1440 בלבד** (2.79% PASS, reference `refs/live-product.png` של מוצר אחר, עם `COMPARE_ALLOW_GRID_MISMATCH=1`); **380 ו-768 REFUSED**, "capture is 1440px", אין צילום reference ברוחבים האלה. "same compare gate" אינו ניתן למדידה מלאה בלי צילום מוצר ב-380 וב-768. (ב) מקור המחיר וקישור הביקורות מרונדרים ריק בפרודקשן עד החלת 242 ועד שיהיו ערכים. |
| Q05 | `2ee29bc90` על origin. `ProductForm.tsx` + `product-form-schema.ts` + `product-terms.ts` + `actions/admin/products.ts` מכילים את כל השדות (נבדק ב-grep: city, cashback_percent, original_price_source(+url), shipping_price, supplier_transfer_days, payout_cadence, cancellation_window_days, refund_policy, platform_percent, coupon_expiry, category, supplier, ImageUploader). ‏243 ממתינה. | (א) **242 ו-243 לא הוחלו**: ערך שאינו ברירת מחדל בשני שדות המקור ובחמשת התנאים נדחה בשמירה עם שם קובץ המיגרציה (`optional-column-groups.ts`). (ב) **R2 לא מופעל בחשבון** (נמדד 10.09, 403 code 10042), ההעלאה נופלת ל-Supabase Storage. שניהם פעולות של אופיר. |

**סיכום השורה התחתונה:** האתר ניתן להצגה **רק ב-`https://kenyonexpress.vercel.app`
ורק כפי שהיה ב-`a388118f1`** (בלי Q03/Q04/Q05). על הדומיין הרשמי הוא אינו
ניתן להצגה כלל.

## Q06 - DONE (25.09) - אימות Q02..Q05 מול ראיות, ‏SHOWABLE: no

**מה נמדד בסשן הזה (לא צוטט מרישומים):** DNS (ארבע שאילתות dig, שני curl),
פריסות הפרודקשן ב-Vercel דרך REST (חמש האחרונות, עם sha), HTML חי של דף
הבית ושל `/product/barbecue-2`, `git rev-parse HEAD origin/audit/final-audit`
(זהים, `2ee29bc90`), `git log a388118f1..HEAD` (4 קומיטים), נוכחות
`migrations/pending/241..243`, grep שדות הטופס, ושער ההשוואה המלא למעלה.

**שערים על העץ של הקומיט הזה:** `pnpm build` ירוק (BUILD_ID למעלה),
`pnpm type-check` נקי, `pnpm lint` נקי (i18n 632/632, docs-index 280,
docs-path-audit 154 רשומות), `pnpm test` **574 קבצים, 6,945 טסטים ירוקים,
12 מדולגים**. הקבצים ששונו: `STATE.md`, `docs/STATE-ARCHIVE.md`,
`docs/INDEX.md` (שורה לארכיון), `docs/known-dangling-paths.json` (40 נתיבים
היסטוריים מהארכיון, דרך `--write` של הסקריפט, אפס הסרות), `README.md`
(279 -> 280 מסמכים, שער `ci-docs-inventory`), `docs/UI-PARITY-REPORT.md`
(שלוש שורות השער).

**החלטות שהתקבלו לבד:**
- **לא נפרס `2ee29bc90` לפרודקשן.** Q06 מבקש לכתוב מה חסר, לא לסגור אותו,
  ופריסה היא מצב עצירה. הפקודה שעובדת רשומה בזיכרון
  `production-served-by-invisible-vercel-account` ובסעיף Q02 בארכיון.
- **STATE.md נגזם ל-<300 שורות** לפי כלל הפריט; שום שורה לא נמחקה, הכל
  ב-`docs/STATE-ARCHIVE.md` באותו קומיט.
- `docs/BACKLOG.md` שהפריט מבקש לקרוא **לא קיים** (גם לא בהיסטוריה של הענף);
  `packages/money.ts` לא קיים, המסלול הוא `src/lib/money.ts` ו-`src/lib/commerce/money.ts`.
- שער ההשוואה הורץ אף שהפריט אינו נוגע ב-UI, כי כל שורות Q03 בפנקס היו
  `-dirty` ולא הייתה מדידה על קומיט נקי. עכשיו יש.

## טבלת מצב לתור `final-queue.txt` (ראיה מ-`git log`, מהעץ ומהרשת, 25.09)

| פריט | מצב | ראיה |
|---|---|---|
| Q01 | DONE | סדר בעץ, טבלה זו. פירוט בארכיון. |
| Q02 | BLOCKED, DNS אצל הרשם | build ירוק, פרוס מ-git (`a388118f1`, READY), 200 על vercel.app. הדומיין לא מתרגם: NS ברשם `ns1/ns2.vercel.com` במקום `ns1/ns2.vercel-dns.com`. נמדד שוב 25.09 (Q06), ללא שינוי. |
| Q03 | DONE (25.09) | `8d924b196`. גריד מהקטלוג, עיר בשורת המטא. שער על קומיט נקי (Q06): 380 8.44%, 768 9.03%, 1440 3.82%, PASS. |
| Q04 | DONE (25.09) | `6fb5fe971`. שער: 1440 2.79% PASS (reference של מוצר אחר, grid override); 380/768 REFUSED, אין reference. 242 pending. |
| Q05 | DONE (25.09) | `2ee29bc90`. כל השדות בטופס, Zod (`productExtrasSchema`), RLS דרך user client, 243 pending. +26 טסטים. |
| Q06 | DONE (25.09) | הרשומה הזו. SHOWABLE: no, עם פירוט החסר. |
| Q07 | DONE | `9fe2ca441 feat(product): reorder share row - WhatsApp first, native Share API, Copy Link` (24.09). לאמת בפריט הבא. |
| Q08 | OPEN, חלקי | חשבונית חתומה להורדה קיימת (`8853cfa9d`, `4cc600d46`, `eb29504b4`). פנייה ב-wa.me (`1186084e9`). לא אומת: שדות מע"מ לעסק בקופה, בקשת ביטול לפי 14ג בדף ההזמנה. |
| Q09 | OPEN, חלקי | `RESEND_API_KEY` נקרא ב-3 מסלולים, 15 builders (`0ac09ff04`). `eae464b1a` (אין מייל ללקוח חוץ מאיפוס סיסמה, מדיניות בעלים) סותר את 6 שורות אישור הרכישה. דורש החלטת מפעיל. |
| Q10 | DONE | `f6392ed6e feat(checkout): guest checkout on measured Electro geometry`. תשלום ב-mock מאחורי ממשק. |
| Q11 | OPEN, חלקי | הסכם click-wrap עם hash ב-`lib/suppliers/contract.ts`, CTA `1e9b4f0e2`. לא אומת: שמירת timestamp + IP. |
| Q12 | DONE | `(legal)/legal`, `terms-and-conditions`, `privacy-policy`, `refund_returns`, `accessibility`, `c03a59f6b`. לא אומת בנפרד: 5% או 100 ש"ח בטקסט. |
| Q13 | DONE | `bf0effa2e`, `02cb65fb3`, כפתור שאלה על המוצר `ace712504`. |
| Q14 | OPEN, חלקי | `(store)/gift` + תזמון (`078a3de6d`), צ'יפים `dda866a5a`. אין ראיה להעברת קופון למשתמש אחר. |
| Q15 | OPEN, חלקי | crons קיימים (`expire-vouchers`, `notifications`, `weekly-digest`). אין ראיה ל-T-7/T-1 ב-pg_cron, club tiers, cashback לארנק. |
| Q16 | OPEN, חלקי | `fc9da36dc`, `2410c879d`. אין ראיה ל-commission per campaign ול-fraud checks. |
| Q17 | OPEN, חלקי | passkey (`c6dff8dc2`, `9b8c215f8`), 2FA (`af64d96e7`), מתג "הכל באפליקציה" עם הסכמה (`719fc6dff`, 240 pending). אין ראיה לאימות טלפון/OTP. |
| Q18 | DONE | `f08a701d1`, `86af4a7c3`, `be736f10f`. |
| Q19 | OPEN, חלקי | `58f920f8f feat(fraud)`, rate limit 10/h. לא אומת: single-use ב-DB, velocity, verified badge, "נקנה השבוע". |
| Q20 | DONE | `29b921163`, `bf9f2ca09`, `(supplier)/supplier/*`. |
| Q21 | OPEN, חלקי | sitemap, robots, `0f42ef81a`, `b591ba19a`. אין קומיט שמכריז WCAG 2.1 AA מלא. |
| Q22 | OPEN, חלקי | `e2e/` קיים, `31ada5313`. Lighthouse: `docs/LIGHTHOUSE-AUDIT.md`. אין ראיה ל-90+ mobile על דף מוצר. |
| Q23 | OPEN | `docs/AUTOPILOT-DIFF.md` לא קיים. |
| Q24 | OPEN | `docs/LAUNCH-READINESS.md` הוא צילום היסטורי (09.09, NOT READY). דורש כתיבה מחדש. |
| B01-B10 | OPEN, חסום | `docs/BACKLOG.md` לא קיים. מועמדים: `docs/POST-LAUNCH-BACKLOG.md`, `docs/MIGRATION-BACKLOG.md`. החלטה ב-B01. |

## חוסמים פתוחים (לא בידי הסוכן)

1. **DNS אצל הרשם** (Q02): להחליף את שני ה-NS של `kenyonexpress.co.il`
   מ-`ns1.vercel.com`/`ns2.vercel.com` ל-`ns1.vercel-dns.com`/`ns2.vercel-dns.com`.
   אחרי ההתפשטות: `dig +short A kenyonexpress.co.il @1.1.1.1` צריך להחזיר
   `216.198.79.1`, ואז `curl -sI https://www.kenyonexpress.co.il/` ל-200.
   שום דבר בצד Vercel לא דורש שינוי.
2. **פריסת פרודקשן של `2ee29bc90`** (מצב עצירה, אישור נדרש): REST
   `POST /v13/deployments` עם `gitSource.sha`, `target=production`, כמו ב-Q02.
3. **מיגרציות ממתינות**: 240 (הסכמת "הכל באפליקציה"), 241 (עיר משלוש
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר). סדר והתנאים
   ב-`docs/RUNBOOK.md`, סקירה ב-`docs/MIGRATION-REVIEW.md`. לא הוחל דבר.
4. **R2 לא מופעל בחשבון Cloudflare** (10.09): תמונות המוצר נופלות ל-Supabase
   Storage, וגיבויי ה-DB החיצוניים אינם נכתבים כלל.
5. **צילום reference לדף מוצר ב-380 וב-768**: בלי זה השער בדף המוצר (Q04)
   נמדד ב-1440 בלבד.
6. **החלטת מפעיל על מיילים ללקוח** (Q09): מדיניות "אין מייל חוץ מאיפוס
   סיסמה" מול מפרט 6 שורות אישור רכישה.
7. **`SUPABASE_SECRET_KEY` חשוף ודורש רוטציה** (CLAUDE.md, `RUNBOOK`);
   `deploy-preflight` מסרב לבנות איתו.
8. **Cardcom בפרודקשן**: `CHECKOUT_ENABLED=false`, ספק התשלום ב-mock;
   שלוש credentials החיוב לא קיימות באף פרויקט Vercel.

## ידני לאופיר, לפי סדר קריטיות

1. DNS (חוסם 1). פעולה אחת בממשק הרשם.
2. אישור פריסה של HEAD (חוסם 2).
3. אישור והחלת 240..243 דרך MCP לפי `RUNBOOK`, ואז `pnpm db:types`.
4. רוטציית `SUPABASE_SECRET_KEY` (חוסם 7).
5. הפעלת R2 בדשבורד Cloudflare (חוסם 4).
6. Cardcom: `CARDCOM_USE_MOCK=false` + המפתחות + `CHECKOUT_ENABLED=true` (חוסם 8).
7. `scripts/dns-watch.sh` (pid 1033) עדיין רץ ומשגר סשן deploy כשיופיעו NS
   של Cloudflare; זה לא יירה על המעבר ל-vercel-dns. לבדוק לפני שמפעילים משהו.
8. עשרה stash-ים לא נמחקו (כלל: אין מחיקת נתונים); רשימה בארכיון תחת Q01.
