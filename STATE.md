Updated: 2026-09-25 (סשן `audit/final-audit`, Fable 5.1, תור `~/ke-goals/final-queue.txt`, M04-c1)

## המשך מ:

**M04-c1 DONE (25.09): היגיינת תלויות.** `pnpm audit` 0 חולשות לפני ואחרי; 30
חבילות עודכנו ב-patch/minor (בהן `next` 16.3.6, React 19.3.0, `@supabase/supabase-js`
2.117.1, `lucide-react` 1.47.0), 14 major ו-3 נוספות דולגו בכוונה, הפירוט ברשומה
למטה. ארבעת השערים ירוקים (test 601 / 7,162 / 12, build `hB3Kgl84w8-Yye69Aqgh2`)
ושער ההשוואה 8.44 / 9.03 / 3.82 בבית, 2.79 במוצר, ללא שינוי. ה-goal הבא:
**M05-c1** (Database audit: `get_advisors` ב-MCP של Supabase לקריאה בלבד, אבטחה
וביצועים; לכל WARN קובץ מיגרציה ב-`migrations/pending` בלבד, לעולם לא להחיל;
עדכון docs). שימו לב: ה-MCP של Supabase דורש הרשאה בסשן לא-אינטראקטיבי, ובלעדיה
החלופה היא ה-management API עם token מה-keychain של ה-CLI. הדומיין עדיין מאציל
ל-`ns1/ns2.vercel.com` (נמדד 25.09 ב-M02-c1); פריסת HEAD לפרודקשן חסומה
ב-preflight (M01-c1, בארכיון).

ההיסטוריה המלאה (Q01..Q24, B01, B03..B10, M01-c1..M03-c1, תור 23.09, וכל מה שקדם)
ב-`docs/STATE-ARCHIVE.md`, החדש למעלה. הקובץ הזה מחזיק רק את מה שחי.

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


## M04-c1 - DONE (25.09) - היגיינת תלויות: 0 חולשות, 30 חבילות עודכנו ב-patch/minor, ארבעת השערים ושער ההשוואה ירוקים

**נמדד על העץ.** HEAD `092ff2517` שווה ל-`origin/audit/final-audit` אחרי
`git fetch`, עץ נקי בתחילת הפריט; STATE.md 235 שורות, בלי צורך בארכוב בפתיחה.

**`pnpm audit`, לפני ואחרי:** `No known vulnerabilities found`, exit 0 בשתי הריצות.

**`pnpm outdated`:** 47 חבילות מאחור, חולקו לשלוש קבוצות:

1. **עודכנו, 30, patch ו-minor בלבד** (`pnpm add` ברשימה מפורשת, לא `pnpm update`,
   כדי שרק החבילות הנקובות יזוזו; ה-lockfile השתנה ב-2,084 שורות, כולן מהן):

| חבילה | מ | אל |
|---|---|---|
| `next` (pin מדויק נשמר), `@next/mdx` | 16.3.3, 16.3.0 | 16.3.6 |
| `react`, `react-dom` (pin מדויק נשמר), `@types/react`, `@types/react-dom` | 19.2.4, 19.2.14, 19.2.3 | 19.3.0 |
| `@radix-ui/react-dialog` / `-dropdown-menu` / `-label` / `-toast` | 1.1.15 / 2.1.16 / 2.1.8 / 1.2.15 | 1.1.23 / 2.1.24 / 2.1.15 / 1.2.23 |
| `@radix-ui/react-select`, `@radix-ui/react-slot` | 2.2.6, 1.2.4 | 2.3.7, 1.3.3 |
| `@supabase/supabase-js` | 2.105.4 | 2.117.1 |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | 3.1127.0 | 3.1139.0 |
| `lucide-react` | 1.16.0 | 1.47.0 |
| `next-intl` | 4.12.0 | 4.14.6 |
| `posthog-js` | 1.427.2 | 1.434.12 |
| `react-hook-form` | 7.76.0 | 7.88.0 |
| `@simplewebauthn/server`, `sonner`, `zustand` | 14.0.1, 2.0.7, 5.0.14 | 14.0.2, 2.0.8, 5.0.15 |
| `drizzle-orm`, `drizzle-kit` | 0.45.2, 0.31.10 | 0.45.3, 0.31.11 |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.0 | 4.3.3 |
| `@testing-library/react`, `fast-xml-parser`, `lighthouse`, `@axe-core/playwright` | 16.3.2, 5.10.1, 13.4.1, 4.12.1 | 16.3.3, 5.11.1, 13.5.0, 4.13.0 |

2. **דולגו, major, 14, מחוץ לפריט לפי הגדרתו:** `@biomejs/biome` 1.9 -> 2.5,
   `@hookform/resolvers` 3 -> 5, `@sentry/nextjs` + `@sentry/node` 10 -> 11,
   `@testing-library/jest-dom` 6 -> 7, `@types/node` 20 -> 26, `@vitejs/plugin-react`
   4 -> 6, `vitest` + `@vitest/coverage-v8` 4 -> 5, `jsdom` 25 -> 30, `lint-staged`
   15 -> 17, `tailwind-merge` 2 -> 3, `typescript` 5 -> 7, `zod` 3 -> 4.
3. **דולגו בהחלטה, 3:** `@anthropic-ai/sdk` 0.122 -> 0.128 ו-`@supabase/ssr`
   0.10.3 -> 0.12.7, כי minor בקו 0.x הוא שבירה לפי semver ו-`ssr` יושב על מסלול
   ה-auth; `@playwright/test` 1.60.0 -> 1.63.0, כי הוא דורש הורדת Chromium חדש
   (המטמון מחזיק 1223 ו-1243 בלבד) ברשת שענתה ב-10-38 שניות לבקשת registry, ושער
   ההשוואה רץ עליו.

**ארבעת השערים אחרי העדכון, בחזית:**

| שער | תוצאה |
|---|---|
| `pnpm audit` | 0 חולשות |
| `pnpm type-check` | exit 0 |
| `pnpm lint` | exit 0, 0 אזהרות, 12 השערים נקיים (i18n 627/627, he-IL 134, docs-index 281); `pnpm` פרש מחדש את `onlyBuiltDependencies` לשש שורות ו-`biome format package.json` החזיר אותו |
| `pnpm test` | exit 0, **601 קבצים / 7,162 ירוקים / 12 מדולגים** (153.0s), 0 שורות stderr |
| `pnpm build` | exit 0, BUILD_ID `hB3Kgl84w8-Yye69Aqgh2`, 336 שורות, 0 ERROR, 11 WARN (7 `db.query_slow`, 4 `db.optional_column_missing`, כמו ב-M03-c1) |

`ExperimentalWarning: ML-DSA-44` עדיין 8 פעמים: `@simplewebauthn/server` 14.0.2 לא
שינה זאת, המקור הוא `@peculiar/x509` תחת Node 25.9, והתיקון הוא דגל Node או major.

**שער ההשוואה בחזית על 3431** (ה-HTML המוגש מכיל את BUILD_ID `hB3Kgl84w8-Yye69Aqgh2`,
אומת ב-curl לפני המדידה), `--baseline`: **בית 380 ‏8.44% PASS, ‏768 ‏9.03% PASS,
‏1440 ‏3.82% PASS; מוצר 1440 ‏2.79% PASS** (`refs/live-product.png`,
`COMPARE_ALLOW_GRID_MISMATCH=1`). זהים לשלוש הספרות ל-M02-c1 למרות `lucide-react`
1.16 -> 1.47, radix ו-React 19.3. שורות 06:02-06:08 UTC ב-`docs/UI-PARITY-REPORT.md`
על `092ff2517-dirty` (dirty כי `package.json` וה-lockfile טרם נכנסו ל-commit במדידה).

**החלטות שהתקבלו לבד:** (א) רשימה מפורשת ולא `pnpm update`, ראו למעלה. (ב) שלוש
הדילוגים בקבוצה 3. (ג) השרת שלי על 3431 (pid 88634) נעצר בסיום; שלושת השרתים הזרים
(pid 23687/46969/99846) לא נגעתי בהם.

**תחזוקה:** גיבוי היום קיים (`kenyonexpress-backup-2026-09-25-0931.tar.gz`, שלושה
בסך הכל, אין מה למחוק), `caffeinate` חי (pid 959), `SleepDisabled 1`,
`dns-watch.sh` חי (pid 999).

## B02 - DONE (25.09) - BACKLOG EMPTY

**התוצאה: אין פריט פתוח של שלב 1 בידי הסוכן.** נבדק מחדש מול העץ, מול
‏`git log -20`, מול הרשת ומול הפנקסים, לא מול רשומת B01.

**המאגר שנסרק, ולמה כל פריט נפסל:**

| מקור | מה נמצא | למה לא נבחר |
|---|---|---|
| `docs/BACKLOG.md` | לא קיים (אומת שוב: לא בעץ, לא ב-`origin/main`, לא ב-`~/ke-goals`). | אין קובץ. |
| `docs/POST-LAUNCH-BACKLOG.md` | 19 אזהרות policy, ‏89-92 PHASE2, ועוד. | לפי כותרתו "כל מה שנדחה במכוון"; הפריט מדלג על נדחים ועל שלב 2. |
| `docs/MIGRATION-BACKLOG.md` | כותרות "שלב 1 שרשרת ה-payout" / "שלב 2 הכסף באגורות". | באנר 01.09 בראש הקובץ: "The backlog is empty. All of it is applied." |
| חוסמים 1-10 ב-STATE, 1-8 ב-`LAUNCH-READINESS` | DNS, פריסת HEAD, מיגרציות 204/223/224/234-236/239-244, ‏R2, ‏refs ל-380/768, ‏`RESEND_API_KEY`, רוטציה, ‏Cardcom, מספר עוסק, ‏`CRON_SECRET`. | כל אחד הוא או פעולה של אופיר (רשם, דשבורד, ערך סוד, החלטה עסקית) או אחד מארבעת מצבי העצירה (פריסה, migration). |
| חוסם 5, refs לדף המוצר ב-380/768 | `refs/ke_live_product_{380,768,1440}.png` קיימים מ-23.09 07:05, ‏1000px גובה, לא במעקב. | הארכיון (שורה 1469) מתעד שהם רונדרו מ-`ke_live_product.html` שנשמר **בלי stylesheets** ואינם reference תקף; האתר החי שממנו אפשר לצלם אינו מתרגם. אין מקור. |
| פריט ידני 9 ב-`LAUNCH-READINESS`, שבעה נתיבי cron ב-`main` | `main` מונה 25 עבודות, ‏HEAD 21; ‏`origin/main...HEAD` = ‏109 / 398 קומיטים. | התיקון חי על `main` (מוגן, ‏PR + 4 בדיקות, ענף אחר); הפריט מוגבל לענף הנוכחי. ב-HEAD המלאי עקבי (`cron-schedule-inventory.test.ts` ירוק). |
| CLAUDE.md "הפתוח לפי סדר דחיפות" 1-6 | קטלוג (25 שורות), ‏169/170/171/162, רוטציה, דלתא Elementor. | הכרעות מפעיל, מיגרציות, סוד; הדלתא מתועדת ב-`docs/LIVE-DELTA.md`. |

**תנאי פתיחה מחדש (מתי B03+ יכול למצוא פריט):** ‏(א) ‏`docs/BACKLOG.md` נוצר;
‏(ב) אופיר סגר חוסם ומה שמאחוריו נפתח לסוכן, למשל אחרי DNS יש מקור לצלם
ממנו refs ב-380/768 ואחרי החלת 241-243 יש מה למדוד בפרודקשן; ‏(ג) שער אדום
בריצת ה-B הבאה.

**החלטות שהתקבלו לבד:** (א) לא נוצר `docs/BACKLOG.md`: הפריט מגדיר אותו כקלט,
לא כתוצר, וקובץ חדש ב-`docs/` מפעיל את שערי המלאי בלי תוכן שמצדיק אותו.
‏(ב) לא נגעתי ב-`scripts/dns-watch.sh` (pid 957) ולא ב-stash-ים: מחיקה היא
מצב עצירה. ‏(ג) השערים והשער החזותי רצו במלואם למרות שהשינוי הוא ב-STATE.md
בלבד, כי חוקי הפריט דורשים את המספרים בכל ריצה.

**שערים:** `pnpm type-check` נקי, `pnpm lint` נקי, `pnpm test` **600 קבצים /
7,158 ירוקים / 12 מדולגים**, `pnpm build` ירוק (BUILD_ID `sLgAYYrF1tJwPwe3TN95l`).
שער ההשוואה בחזית על 3341, `--baseline`: **380 ‏8.44% PASS, ‏768 ‏9.03% PASS,
‏1440 ‏3.82% PASS**, exit 0, שורות 03:31-03:34 UTC ב-`docs/UI-PARITY-REPORT.md`
על `d70ccf492`.

## טבלת מצב לתור `final-queue.txt` (ראיה מ-`git log`, מהעץ ומהרשת, 25.09)

| פריט | מצב | ראיה |
|---|---|---|
| Q01 | DONE | סדר בעץ, טבלה זו. פירוט בארכיון. |
| Q02 | BLOCKED, DNS אצל הרשם | build ירוק, פרוס מ-git (`a388118f1`, READY), 200 על vercel.app. הדומיין לא מתרגם: NS ברשם `ns1/ns2.vercel.com` במקום `ns1/ns2.vercel-dns.com`. נמדד שוב 25.09 (Q06), ללא שינוי. |
| Q03 | DONE (25.09) | `8d924b196`. גריד מהקטלוג, עיר בשורת המטא. שער על קומיט נקי (Q06): 380 8.44%, 768 9.03%, 1440 3.82%, PASS. |
| Q04 | DONE (25.09) | `6fb5fe971`. שער: 1440 2.79% PASS (reference של מוצר אחר, grid override); 380/768 REFUSED, אין reference. 242 pending. |
| Q05 | DONE (25.09) | `2ee29bc90`. כל השדות בטופס, Zod (`productExtrasSchema`), RLS דרך user client, 243 pending. +26 טסטים. |
| Q06 | DONE (25.09) | הרשומה הזו. SHOWABLE: no, עם פירוט החסר. |
| Q07 | DONE (אומת 25.09) | `9fe2ca441` (23.09) על הענף. `ProductShareRow` ב-`ProductInfo`: WhatsApp ראשון ובולט, Share נייטיב, fallback פייסבוק/טלגרם/מייל, העתקת קישור עם toast `הקישור הועתק`. 16 טסטים ירוקים. שער מוצר 1440 ‏2.79% PASS על `5d22aa60e` נקי. |
| Q08 | DONE (25.09) | הרשומה למעלה. חשבונית חתומה (קיים), שדות מע"מ לעסק בקופה (חדש), wa.me עם פריטים וסכום (חדש), ביטול לפי 14ג בדף ההזמנה ובדף התודה (חדש). +8 טסטים. שער 8.44/9.03/3.82 PASS. |
| Q09 | DONE (25.09) | הרשומה למעלה. מייל רק ל-5: אישור 6 שורות, איפוס סיסמה (Resend + fallback), תזכורת תפוגה, התראת אבטחה, מתנה למקבל. 11 סוגי push לדף ההזמנה, תיקון `data.url`. +37 טסטים. שער 8.44/9.03/3.82 PASS. |
| Q10 | DONE (אומת 25.09) | `f6392ed6e` (29.07). קופת אורח (`/checkout` מחוץ ל-`needsAuth`, 200 אנונימי), Google בלחיצת התשלום עם `resume=1`, `PaymentProvider` עם mock, אין מינימום הזמנה. שער: home 8.44/9.03/3.82, cart 1440 1.47%, checkout 1440 0.94%, PASS. `compare.mjs` תוקן ל-`--baseline` בסל ובקופה. |
| Q11 | DONE (אומת 25.09) | `185b904a4` (09.09) + `1e9b4f0e2`. `/suppliers/apply` עם `CONTRACT_TEXT`, hash SHA-256 מהקבוע בשרת, `accepted_at DEFAULT now()` ו-`client_ip inet` ב-204 (pending). כותרת "הצטרפו כעסקים". +9 טסטים. שער 8.44/9.03/3.82 PASS. |
| Q12 | DONE (אומת 25.09) | `c03a59f6b`, `a6d3608ac`. ארבעה דפים 200 מ-`LegalArticle`, `/legal/*` 308. "עד 5% ממחיר העסקה או 100 שקלים חדשים, לפי הנמוך" ב-`returns.ts` 157, תואם `refund.ts`; קופון ניתן להעברה ב-`terms.ts` 177; `#cookies` ו-`#how-to-cancel` בפוטר. שער 8.44/9.03/3.82 PASS. |
| Q13 | DONE (אומת 25.09) | `bf0effa2e`, `02cb65fb3`, `ace712504`. `/contact` 200 עם חמשת הנושאים מ-`DEFAULT_CONTACT_CHANNELS`, 25 קישורי `wa.me`, `support@kenyonexpress.co.il`, אפס `tel:`. דף מוצר: `product-question-link` + `ask-business` עם `data-via="customer_service"`. שער 8.44/9.03/3.82 PASS. |
| Q14 | DONE (25.09) | הרשומה למעלה. מתנה בקופה קיימת (`078a3de6d`, 108 מוחלת, 226 ממתינה לתזמון). חדש: `transferVoucher`/`revokeVoucherTransfer` + `/account/coupons/[id]/gift`; צ'יפים פתוח בסופ"ש (תג `open-weekend`), משלוח חינם (fallback ל-243), קרוב אליי. +41 טסטים. שער 8.44/9.03/3.82 PASS. |
| Q15 | DONE (25.09) | הרשומה למעלה. T-7/T-1 קיימים (`expire-vouchers` + outbox, מייל ופוש; pg_cron ב-162 pending, חלון ב-227 pending). `cashback_percent` פר מוצר DEFAULT 0 קיים (042, צילום בקופה, זיכוי ב-finalize). חדש: `lib/club/tiers.ts`, `getClubStanding`, `ClubTierCard` בסקירת החשבון. +17 טסטים. שער 8.44/9.03/3.82 PASS. |
| Q16 | DONE (25.09) | הרשומה למעלה. קונסולה קיימת (`fc9da36dc`); חדש: הצטרפות, ייחוס בקופה, 244 pending (קמפיינים+המרות), `lib/affiliates/commission.ts`, זיכוי דרך `fn_wallet_transfer`, תור אדמין, קוד על הקישור בשיתוף. +49 טסטים. שער 8.44/9.03/3.82 PASS, מוצר 1440 2.79% PASS. |
| Q17 | DONE (25.09) | הרשומה למעלה. קיים: סיסמה/Google/מפתח גישה/קישור קסם, OTP בטלפון מאחורי `PHONE_AUTH_ENABLED` (`67bc68025`), 2FA אדמין (`af64d96e7`), מתג "הכל באפליקציה" עם הסכמה (`719fc6dff`, 240 pending). חדש: `lib/pwa/snooze.ts`, "לא עכשיו" ל-30 יום בבאנר, בפוש ובדיאלוג המפתח, באנר גם ב-`/account`. +24 טסטים. שער 8.44/9.03/3.82 PASS. |
| Q18 | DONE (25.09) | הרשומה למעלה. קיים: manifest, `public/sw.js` (push + notificationclick), `InstallPrompt`, `PushOptIn` לדפדפן הזה, `savePushSubscription`/`removePushSubscription`, שולח VAPID עם ניקוי 404/410, 179 מוחלת. חדש: רשימת "דפדפנים מחוברים" בכל המכשירים (`loadPushSubscriptions` תחת RLS, `removePushSubscriptionById`, `PushDevices`, `lib/push/device-label.ts`), הכותרת הכפולה בדף ההתראות הוסרה. +15 טסטים, תקרת i18n 628 -> 627. שער 8.44/9.03/3.82 PASS. |
| Q19 | DONE (25.09) | הרשומה למעלה. קיים ופרוס: `redeem_voucher` אטומי + טריגר 166 (נמדד בפרודקשן), מגבלות קצב login/checkout/redeem, `velocity.ts`, רשימת חסימה 234. חדש: `ספק מאומת` מאישור אנושי או מימוש אמיתי (1 מ-7 היום), `N נרכשו השבוע` מחיובים אמיתיים בלבד (18/18 mock מוחרגות). +25 טסטים. שער 8.44/9.03/3.82 PASS, מוצר 1440 2.79% PASS. |
| Q20 | DONE (אומת 25.09) | `29b921163`, `bf9f2ca09`. מכירות/מימושים/זיכויים/תשלומים ב-`(supplier)/supplier/*`, אגורות בלבד, אפס policy כתיבה לספק (נמדד בפרודקשן). קריאות על service role עם נעילת tenant ולא RLS: RLS חי היה מעלים 2 שורות `refunded` מתוך 19 (נמדד). שער 8.44/9.03/3.82 PASS. |
| Q21 | DONE (נמדד 25.09) | הרשומה למעלה. axe WCAG 2.1 AA: 36 עברו / 0 נכשלו על 19 מסלולים. מטא, JSON-LD (Product+Offer, `highPrice` -> `StrikethroughPrice`), sitemap 5 חלקים, robots. שער 8.44/9.03/3.82 PASS, מוצר 1440 2.79% PASS. |
| Q22 | DONE (נמדד 25.09) | הרשומה למעלה. E2E על build עם mock: בית+קטגוריה+מוצר 82/82, סל+קופה+מסלול 40 עברו / 3 דולגו לפי viewport, אורח עד ה-stub ומימוש 2/2. שני פגמים תוקנו (גריד האזור האישי, מרוץ strict-mode). Lighthouse mobile מקומי: בית 73-77, מוצר 76-80 (מדומה), 100/100 ללא סימולציה; alias פרודקשן 90-93 / 87-92. שער 8.44/9.03/3.82 PASS, מוצר 2.79 PASS. |
| Q23 | DONE (25.09) | הרשומה למעלה. `docs/AUTOPILOT-DIFF.md`: autopilot כולו כבר ב-`origin/main`; closeout = +1 קומיט מקומי; 22 מיגרציות במספרים תפוסים; שווה לשמור: 9 טסטי actions, תיקון פנקס, Telegram/UptimeRobot, RLS-AUDIT. |
| Q24 | DONE (25.09) | הרשומה למעלה. `docs/LAUNCH-READINESS.md` נכתב מחדש: NOT READY על שלוש שורות (דומיין, mock, cron 401 עם 72 הודעות תקועות), 8 חוסמים עם ראיה, 13 פריטים ידניים. שער 8.44/9.03/3.82 PASS. |
| B01 | DONE (25.09) | הרשומה למעלה. `vercel.json` מריץ `deploy-preflight` לפני `pnpm build`; +9 טסטים. שער 8.44/9.03/3.82 PASS. |
| B02 | DONE (25.09) | **BACKLOG EMPTY.** הרשומה למעלה: שבעה מאגרים נסרקו, אפס פריטי שלב 1 בידי הסוכן. שער 8.44/9.03/3.82 PASS. |
| B03 | DONE (25.09) | **BACKLOG EMPTY**, מאומת מחדש. פירוט בארכיון. |
| B04 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם השלישית. פירוט בארכיון. |
| B05 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם הרביעית. פירוט בארכיון. |
| B06 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם החמישית. פירוט בארכיון. |
| B07 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם השישית. פירוט בארכיון. |
| B08 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם השביעית. פירוט בארכיון. |
| B09 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם השמינית. פירוט בארכיון. |
| B10 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם התשיעית: שלושת תנאי הפתיחה מחדש נבדקו ולא התקיימו. האחרון בתור. שער 8.44/9.03/3.82 PASS. |
| M01-c1 | BLOCKED, DNS אצל הרשם | פירוט בארכיון. dig SERVFAIL (EDE 22), NS ברשם `ns1/ns2.vercel.com`; curl exit 6 בשני המארחים. פריסת HEAD ל-Vercel נוסתה וסורבה ב-preflight (3 שמות Cardcom חסרים + waiver); פרודקשן נשאר `a388118f1`. שער 8.44/9.03/3.82 PASS. |
| M02-c1 | DONE (25.09) | בית 380 8.44%, 768 9.03%, 1440 3.82% PASS; מוצר 1440 2.79% PASS, 380/768 REFUSED (אין reference תקף). אין רגרסיה. פירוט בארכיון. |
| M03-c1 | DONE (25.09) | פירוט בארכיון. type-check נקי; lint 0 אזהרות; test 601/7,162; build 0 ERROR. +4 טסטים. אפס שינוי UI. |
| M04-c1 | DONE (25.09) | הרשומה למעלה. audit 0 חולשות; 30 חבילות patch/minor (next 16.3.6, React 19.3.0, supabase-js 2.117.1, lucide 1.47.0); 14 major + 3 דולגו. שער 8.44/9.03/3.82 PASS, מוצר 1440 2.79 PASS. |

## חוסמים פתוחים (לא בידי הסוכן)

1. **DNS אצל הרשם** (Q02): להחליף את שני ה-NS של `kenyonexpress.co.il`
   מ-`ns1.vercel.com`/`ns2.vercel.com` ל-`ns1.vercel-dns.com`/`ns2.vercel-dns.com`.
   אחרי ההתפשטות: `dig +short A kenyonexpress.co.il @1.1.1.1` צריך להחזיר
   `216.198.79.1`, ואז `curl -sI https://www.kenyonexpress.co.il/` ל-200.
   שום דבר בצד Vercel לא דורש שינוי. נמדד שוב 25.09 (M01-c1), ללא שינוי;
   פלט ה-dig המלא ברשומת M01-c1 בארכיון; נמדד שוב ב-M02-c1, ללא שינוי.
2. **פריסת פרודקשן של HEAD (`92f8b6904`, 33 קומיטים אחרי `a388118f1` החי)**:
   נוסתה ב-M01-c1 (REST `POST /v13/deployments`, `target=production`) **וסורבה
   ב-`deploy-preflight`**: `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`,
   `CARDCOM_API_PASSWORD` חסרים ב-Production ו-`ALLOW_INCOMPLETE_ENV=true` מוגדר
   שם. עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה.
3. **מיגרציות ממתינות**: 204 (הצטרפות ספקים והסכם click-wrap; בלעדיה הטופס
   עונה "עדיין לא פעיל"), 240 (הסכמת "הכל באפליקציה"), 241 (עיר משלוש
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר), 244 (קמפיינים
   והמרות של תוכנית השותפים; בלעדיה התוכנית "עדיין לא פתוחה"). סדר והתנאים
   ב-`docs/RUNBOOK.md`, סקירה ב-`docs/MIGRATION-REVIEW.md`. לא הוחל דבר.
4. **R2 לא מופעל בחשבון Cloudflare** (10.09): תמונות המוצר נופלות ל-Supabase
   Storage, וגיבויי ה-DB החיצוניים אינם נכתבים כלל.
5. **צילומי reference ב-380 וב-768 לדף המוצר, לסל ולקופה**: קיימים רק
   ב-1440 (`refs/live-product.png`, `refs/live-cart.png`,
   `refs/live-checkout.png`). בלי זה השערים של Q04 ו-Q10 נמדדים ב-1440 בלבד.
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

## ידני לאופיר, לפי סדר קריטיות

1. DNS (חוסם 1). פעולה אחת בממשק הרשם.
2. `CRON_SECRET` זהה ב-GitHub וב-Vercel (חוסם 10); הריצה הבאה של "Scheduled jobs"
   צריכה להראות `notifications -> 200`.
3. **סביבת Production ב-Vercel לפני כל פריסה** (חוסם 2, נמדד M01-c1): להוסיף
   `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` (השמות
   שהקוד קורא; `CARDCOM_API_KEY`/`CLIENT_ID`/`MERCHANT_ID` הקיימים אינם נקראים)
   ולהסיר `ALLOW_INCOMPLETE_ENV`. אחרי זה פריסה של HEAD: REST `POST /v13/deployments`
   עם `gitSource.sha`, `target=production`, כמו ב-Q02.
4. אישור והחלת 240..243 דרך MCP לפי `RUNBOOK`, ואז `pnpm db:types`.
5. רוטציית `SUPABASE_SECRET_KEY` (חוסם 7).
6. הפעלת R2 בדשבורד Cloudflare (חוסם 4).
7. Cardcom: `CARDCOM_USE_MOCK=false` + המפתחות + `CHECKOUT_ENABLED=true` (חוסם 8).
8. `scripts/dns-watch.sh` (pid 957) עדיין רץ ומשגר סשן deploy כשיופיעו NS
   של Cloudflare; זה לא יירה על המעבר ל-vercel-dns. לבדוק לפני שמפעילים משהו.
9. עשרה stash-ים לא נמחקו (כלל: אין מחיקת נתונים); רשימה בארכיון תחת Q01.
10. כניסה בטלפון (Q17): ספק SMS בהגדרות ה-auth של Supabase ואז `PHONE_AUTH_ENABLED=true`
   ב-Vercel. בלעדיהם הכפתור מוסתר והשאר עובד.
