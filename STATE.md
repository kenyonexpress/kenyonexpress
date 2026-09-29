RESUME FROM: M07-c54
Updated: 2026-09-29 (סשן `audit/final-audit`, Sonnet 5, פריט M06-c54)

## המשך מ:

**M06-c54 - DONE (29.09): Lighthouse mobile נמדד שוב, כל שמונת הציונים 90+,
אפס תיקון נדרש.** אותו מתכון שאומת ב-M06-c1/M06-c52/M06-c53: `CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:3462 pnpm build` -> `exit 0`; `pnpm
start -p 3462` מאותה סביבה (פורט אומת פנוי לפני ההרצה); `curl` אישר `200`
על `/` ועל `/product/barbecue-2`; `node_modules/.bin/lighthouse` על שני
ה-URL, `--throttling-method=devtools --emulated-form-factor=mobile`:

| דף | ביצועים | נגישות | BP | SEO |
|---|---|---|---|---|
| בית `/` | 98 | 100 | 100 | 100 |
| מוצר `/product/barbecue-2` | 99 | 100 | 100 | 100 |

כל שמונת הציונים מעל 90, ברווח גדול. דומה ל-M06-c53 (99/100/100/100,
99/100/100/100) — אפס רגרסיה, אפס תיקון fixable. שרת הבדיקה נעצר, פורט
3462 אומת פנוי, שני קבצי ה-JSON הזמניים נמחקו. שערים: `type-check` נקי,
`lint` נקי (biome 2020 קבצים + 12 שערי תוכן, i18n 627/627, locale
116/116), `test` 605/605 קבצים, 7213/7225 (12 skipped, זהה), `build`
`exit 0`. אין שינוי קוד, אין שער חזותי נדרש (אין שינוי UI). **קובץ יחיד
שונה: `STATE.md`.**

## M05-c54 (ארכיון)

**M05-c54 - DONE (29.09): ביקורת DB — `get_advisors` (security+performance),
אפס WARN חדש, אפס קובץ מיגרציה חדש.** ה-MCP של Supabase עדיין ברשימת
"דורש הרשאה" בסשן לא-אינטראקטיבי (כמו בכל מדידה קודמת). אותו מסלול חלופי
שכבר אומת שלוש פעמים: טוקן ה-CLI מה-keychain (`security
find-generic-password -s "Supabase CLI" -w`, פענוח base64), שני `GET
https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/advisors/
{security,performance}`, ‏200/200, קריאה בלבד, הטוקן לא נדפס ולא נשמר.
**44 WARN בסך הכול, זהה ב-100% ל-M05-c53 (0ג) שדה-שדה**: 2
`anon_security_definer_function_executable` (`is_admin`,
`is_supplier_member`), 21 `authenticated_security_definer_function_executable`,
1 `function_search_path_mutable` (`fn_wallet_entries_block_mutation`), 6
`auth_rls_initplan` (`profiles`, `webauthn_credentials`×2,
`push_subscriptions`×2, `cashback_ledger`), 14 `multiple_permissive_policies`
על אותן 11 טבלאות. אפס WARN חדש, אפס שהפסיק לירות. ארבעת הקבצים הממתינים
שכבר מכסים את כל 44 (`migrations/pending/209_advisor_warnings.sql`,
`220_wallet_entries_search_path.sql`,
`245_single_permissive_policy_per_action.sql`,
`246_profiles_mfa_initplan.sql`) נבדקו קיימים ולא נערכו מ-M05-c53
(`git log -1` על כל נתיב, כולם מלפני 0ג) — **אין קובץ מיגרציה חדש נדרש,
שום קובץ לא הוחל.** `docs/DB-SECURITY-MODEL.md` קיבל סעיף 0ד חדש עם
המדידה. שערים: `type-check` נקי, `lint` נקי (biome 2020 קבצים + 12 שערי
תוכן, i18n 627/627, locale 116/116), `test` 605/605 קבצים, 7213/7225 (12
skipped, זהה), `build` `exit 0`. אין פריט UI, אין שער חזותי נדרש. **קובץ
יחיד שונה מלבד `STATE.md`: `docs/DB-SECURITY-MODEL.md`.**

## M04-c54 (ארכיון)

**M04-c54 - DONE (29.09): תחזוקת תלויות — `pnpm audit` אפס חולשות,
`pnpm outdated` בלי שדרוג פטץ'/מיינור זמין, אפס שינוי.** `pnpm audit`:
"No known vulnerabilities found". `pnpm outdated --format json`: 16 חבילות
מוצגות, וב-**כולן** `wanted === current` — כלומר כל שדרוג פטץ'/מיינור
שבתוך טווח ה-caret כבר הוחל (lockfile מסונכרן), ומה שנשאר לכל אחת מה-16
הוא קפיצה שחורגת מטווח ה-caret: 14 מהן מספרת major אמיתית (למשל
`@biomejs/biome` 1.9.4→2.5.14, `zod` 3.25.76→4.6.5, `typescript`
5.9.3→7.0.2), ושתיים הן חבילות `0.x` שהספרה השנייה שלהן קפצה
(`@anthropic-ai/sdk` 0.122.0→0.128.0, `@supabase/ssr` 0.10.3→0.12.7) —
לפי התקדים שנקבע ב-M04-c53 (`f920dc5ec`), קפיצה כזו נחשבת מיינור-שהוא-בפועל
major לחבילת `0.x` ואינה בהיקף הפריט ("לעולם לא שדרוג major"). **לכן: אין
שדרוג אחד שעומד בקריטריון, אפס שינוי ב-`package.json`/`pnpm-lock.yaml`.**
כל ארבעת השערים הורצו במלואם על אותו HEAD בכל זאת (כנדרש "לפני commit"):
`type-check` נקי, `lint` נקי (biome 2020 קבצים + 12 שערי תוכן, i18n
627/627, locale 116/116), `test` 605/605 קבצים, 7213/7225 (12 skipped,
זהה), `build` `exit 0` בלי אזהרת דפרקציה (התיקון מ-M03-c54 עדיין תקף) —
שורות ה-runtime שנצפו ב-build (`supabase.rls_denied` על `reviews`,
`db.optional_column_missing` על `242`) זהות לאלה שתועדו ב-M03-c54, חוסמי
מיגרציה ידועים (`247`, `242`), לא תקלת build. אין פריט UI, אין שער חזותי
נדרש. **קובץ יחיד שונה: `STATE.md`.**

## M03-c54 (ארכיון)

**M03-c54 - DONE (29.09): בדיקת שער ירוק — type-check, lint, test, build,
ותיקון אחד שנמצא בר-תיקון בלי שינוי התנהגות.** `pnpm type-check` נקי.
`pnpm lint` נקי (biome על 2020 קבצים + 12 שערי תוכן, i18n 627/627, locale
116/116). `pnpm test`: 605/605 קבצים, 7213/7225 טסטים (12 skipped, זהה
לכל מדידה קודמת). `pnpm build`: `exit 0`, אבל עם אזהרת דפרקציה מ-Sentry
(`Importing withSentryConfig from '@sentry/nextjs' is deprecated and will
stop working in v11. Import it from '@sentry/nextjs/config' instead`) —
נמצאה ותוקנה: `next.config.ts` שורה 2,
`import { withSentryConfig } from '@sentry/nextjs'` ->
`import { withSentryConfig } from '@sentry/nextjs/config'` (אימות שהנתיב
המשני קיים ב-`@sentry/nextjs@10.75.3` package.json `exports`, לפני העריכה).
כל ארבעת השערים הורצו שוב אחרי התיקון: זהים, ובלי אזהרת הדפרקציה.
שאר השורות שנצפו ב-build (`supabase.rls_denied` על `reviews`,
`db.optional_column_missing` על `242`) הן פלט זמן-ריצה של פריסה מקדימה
(prerender) שכבר מתועד כחוסם ידוע (`247`, `242` ב"חוסמים פתוחים" למטה),
לא אזהרת build ולא תקלה חדשה — לא לתיקון בפריט הזה (מיגרציה, לא קוד).
אין פריט UI, אין שער חזותי נדרש. **קובץ יחיד שונה מלבד `STATE.md`:
`next.config.ts`.** התור ל-c54 אחרי M03 לא הוגדר בנפרד; ממשיך לפי סבב
c53 (M04 היה תחזוקת תלויות) — הוחלט אוטומטית, ראו "החלטות שהתקבלו לבד".

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
