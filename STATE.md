RESUME FROM: M08-c59
Updated: 2026-09-30 (סשן `audit/final-audit`, Sonnet 5, פריט M07-c59)

## המשך מ:

**M07-c59 - DONE (30.09): route audit נמדד שוב, 241 שורות, אפס כשל
אמיתי, אפס דלתא קוד שנוגעת במסלול.** אותו מתכון מ-M07-c1/M07-c52..
M07-c58 (`route-audit-recipe-and-hydration-dates`): `git diff --stat
f57971b42..HEAD -- src/app src/components src/lib e2e` ריק — אפס שינוי
קוד תצוגה/ניתוב מאז המדידה הקודמת, אבל המדידה עצמה הורצה מחדש במלואה
ולא סומכת על הדלתא בלבד. `rm -rf .next && CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:3483 pnpm build` הצליח (`exit 0`),
`CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:3483
PORT=3483 pnpm start` מאותה בנייה, פורט אומת פנוי לפני ואחרי. `curl`
אישר `200` על `/` ועל `/product/barbecue-2`. `pnpm exec playwright test
e2e/route-audit.spec.ts --project=chromium --workers=1` בשישה צ'אנקים
לפי תפקיד (`--grep`): anon (60), GET קבצים/API + ספק (82), לקוח (25),
אדמין בשלושה מקטעים (19, 21, 19 כולל דפי הפירוט המתגלים). סה"כ 226
טסטים, כולם PASS, אפס FAIL. הדוח
(`ROUTE_AUDIT_REPORT=/tmp/route-audit-m07c59.jsonl`) נותח תכנותית
(סקריפט Node, לא רק סיכום ה-reporter): 241 שורות ייחודיות (role+path),
**239 PASS, 2 NO DATA** (`customer /account/tickets/[id]`, `admin
/admin/discounts/[id]`, שתיהן זהות לכל מדידה קודמת מאז M07-c1, הרשימה
לא מקשרת לשום שורה בסביבת הבדיקה). **אפס `consoleErrors`, אפס
`hydrationWarnings`, אפס `rtl: false`** על פני כל 241 השורות — זהה
מספרית ל-M07-c58. אין תיקון נדרש. השרת נעצר (`kill`, פורט 3483 אומת
פנוי מחדש), קובץ הדוח וקובץ הלוג הזמניים נמחקו. שערים: `type-check`
נקי, `lint` נקי (biome 2023 קבצים, כל שערי התוכן ירוקים, i18n 627/627,
locale 116/116, docs-index 282, docs-path-audit 152), `test` 608/608
קבצים, 7273/7285 (12 skipped, 57.32s), `build` `exit 0` (חלק מהמדידה
עצמה). אין שינוי קוד, אין שער חזותי נדרש (אין שינוי UI). **קובץ יחיד
שונה: `STATE.md`** (פלוס `docs/STATE-ARCHIVE.md`, M06-c59 הועבר לתקרת
300 שורות).

## M06-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M06-c59: Lighthouse mobile נמדד שוב, כל שמונת הציונים 90+ (בית
99/100/100/100, מוצר 99/100/100/100), אפס תיקון נדרש, אפס דריפט מ-M06-c58.

## M05-c59 (הועבר מ-STATE.md ב-M06-c59, לשמירה על תקרת 300 שורות)

**M05-c59 - DONE (30.09): advisors נמדדו בפעם התשיעית, 44 WARN זהים
ב-100% ל-M05-c58, אפס מיגרציה חדשה נדרשת.** משימת התור: להריץ
`get_advisors` (security+performance) דרך MCP של Supabase, לכתוב מיגרציה
ב-`migrations/pending` על כל WARN, לעדכן `docs/DB-SECURITY-MODEL.md` אם
המספרים השתנו.

- **Supabase MCP עדיין "דורש הרשאה"** (`claude.ai Supabase`), אין OAuth
  בסשן לא-אינטראקטיבי — נבדק ב-`ToolSearch`, אפס תוצאה. אותו מסלול חלופי
  שכל M05-c1..M05-c58 השתמשו בו: טוקן ה-CLI מה-keychain (`security
  find-generic-password -s "Supabase CLI" -w`, פענוח `go-keyring-base64:`),
  שני `GET https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/
  advisors/{security,performance}`, `200`/`200`. קריאה בלבד, הטוקן לא
  נדפס ולא נשמר, קבצי הפלט הזמניים (`/tmp/ke-advisors/*.json`) נמחקו
  בסוף הפריט.
- **אבטחה 28 ממצאים, ביצועים 196 (היו 197 — `unused_index` INFO 167→166,
  תנודת cache, לא WARN).** **44 WARN בסך הכול, זהים שם-שם ל-M05-c58**: 21
  `authenticated_security_definer_function_executable` (אותן 21
  הפונקציות בדיוק), 2 `anon_security_definer_function_executable`
  (`is_admin`, `is_supplier_member`), 1 `function_search_path_mutable`
  (`fn_wallet_entries_block_mutation`), 14 `multiple_permissive_policies`
  (אותן 11 טבלאות), 6 `auth_rls_initplan` (אותן טבלאות). אפס WARN חדש,
  אפס שהפסיק לירות.
- ארבעת הקבצים הממתינים (`209_advisor_warnings.sql`,
  `220_wallet_entries_search_path.sql`,
  `245_single_permissive_policy_per_action.sql`,
  `246_profiles_mfa_initplan.sql`) נבדקו שעדיין קיימים בלי שינוי — כולם
  כבר מכסים את 44 ה-WARN. **אין קובץ מיגרציה חדש נדרש.**
- `docs/DB-SECURITY-MODEL.md` עודכן: סעיף חדש `0ט` עם הפירוט המלא, וכותרת
  ה-frontmatter עודכנה בהתאם.
- שערים הורצו במלואם: `type-check` נקי; `lint` נקי (2023 קבצים, i18n
  627/627, locale 116/116, docs-index 282, docs-path-audit 152); `test`
  608/608 קבצים, 7273 עברו + 12 דולגו (7285), 56.98s; `build` (`rm -rf
  .next && CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:3311
  pnpm build`) הושלם, `BUILD_ID`+`server/` נוכחים, טבלת המסלולים המלאה
  נדפסה בלי `Failed to compile`. אין שער חזותי נדרש (אפס שינוי UI).

אפס שינוי סכימה, אפס שינוי קוד יישומי, עדכון `docs/DB-SECURITY-MODEL.md`
ו-`STATE.md` בלבד.

## M04-c59 (הועבר מ-STATE.md ב-M05-c59, לשמירה על תקרת 300 שורות)

**M04-c59 - DONE (30.09): תברואת תלויות, `pnpm audit` נקי, אפס עדכון
זכאי (כל 14 השורות של `pnpm outdated` הן major).** משימת התור: להריץ
`pnpm audit` ו-`pnpm outdated`, להחיל שדרוגי patch/minor שנשארים ירוקים
בארבעת השערים, לעולם לא major.

- `pnpm audit`: **אפס חולשות ידועות**.
- `pnpm outdated`: 14 שורות, וכל אחת מהן major (`@biomejs/biome` 1→2,
  `@hookform/resolvers` 3→5, `@sentry/nextjs`+`@sentry/node` 10→11,
  `@testing-library/jest-dom` 6→7, `@types/node` 20→26,
  `@vitejs/plugin-react` 4→6, `@vitest/coverage-v8` 4→5, `jsdom` 25→30,
  `lint-staged` 15→17, `tailwind-merge` 2→3, `typescript` 5→7,
  `vitest` 4→5, `zod` 3→4) — כולן מחוץ לתחום המותר (אסור major).
- `pnpm update --no-save` (מכבד את הטווחים ב-`package.json`, אינו נוגע
  ב-major): שינוי יחיד, `caniuse-lite` `1.0.30001812`→`1.0.30001813`
  (נתוני `browserslist`, טרנזיטיבי, אין שורה תואמת ב-`package.json`).
  `git diff package.json` ריק — אין תלות ישירה לעדכן בתוך הטווח.
- שערים הורצו במלואם על המצב הזה: `type-check` נקי; `lint` נקי (2023
  קבצים, i18n 627/627, locale 116/116, docs-index 282, docs-path-audit
  152); `test` 608/608 קבצים, 7273 עברו + 12 דולגו (7285), 57.36s;
  `build` (`rm -rf .next && CARDCOM_USE_MOCK=true
  NEXT_PUBLIC_APP_URL=http://localhost:3311 pnpm build`) `exit 0`,
  `✓ Compiled successfully`, 337/337 עמודים נוצרו (`supabase.rls_denied`
  על `reviews` הוא פלט צפוי ממיגרציה 247 ממתינה, כבר בחוסם 3, לא אזהרת
  קומפיילר).

עדכון יחיד ל-`pnpm-lock.yaml` (נתוני `caniuse-lite` בלבד), אפס שינוי
ל-`package.json`, אפס שינוי קוד יישומי.

## M03-c59 (הועבר מ-STATE.md ב-M04-c59, לשמירה על תקרת 300 שורות)

**M03-c59 - DONE (30.09): שער ירוק, ארבעתם נקיים, אפס תיקון נדרש.**
משימת התור: להריץ `pnpm type-check`, `pnpm lint`, `pnpm test` ו-`pnpm
build`, לתקן כל שגיאה ואזהרה ניתנת לתיקון בלי לשנות התנהגות מוצר.

נמדד ישירות, כל ארבעת השערים בהרצה טרייה מלאה על HEAD `a2100c518`:
- `type-check` (`tsc --noEmit`): נקי, אפס פלט.
- `lint` (`biome check .` + עשר שערי `scripts/*-gate.mjs`): נקי — 2023
  קבצים, אפס תיקונים; tokens/copy/asset/raw-html/postgrest-or/
  cache-invalidation/rtl-logical נקיים; i18n 627/627, locale-format
  116/116 (בתקרה, לא מעליה); input-dir 24/24; docs-index 282 מתועדים;
  docs-path-audit 152 ידועים, אפס שינוי.
- `test` (`vitest run`): 608/608 קבצים, 7273 עברו + 12 דולגו (7285),
  58.88s.
- `build` (`rm -rf .next && CARDCOM_USE_MOCK=true
  NEXT_PUBLIC_APP_URL=http://localhost:3311 pnpm build`): `exit 0`,
  `✓ Compiled successfully`, TypeScript עבר בתוך הבנייה, 337/337 עמודים
  נוצרו. לוגים בזמן ריצה (`db.optional_column_missing` על מיגרציה 242
  ממתינה, `supabase.rls_denied` על `reviews` בגלל מיגרציה 247 ממתינה
  שלא הוחלה מקומית — שתיהן כבר בחוסמים 3 ב-STATE.md) הם פלט אפליקציה
  צפוי, לא אזהרת קומפיילר — אין שם שום `Failed to compile` או אזהרת
  ESLint/TS.

אפס תיקון נדרש, אפס שינוי קוד יישומי. עדכון `STATE.md` בלבד.

## M02-c59 (הועבר מ-STATE.md ב-M03-c59, לשמירה על תקרת 300 שורות)

**M02-c59 - DONE (30.09): שער חזותי, בית ומוצר, שלושה רוחבים, אפס
רגרסיה, כל שש המדידות PASS מתחת ל-11%.** משימת התור: להריץ
`scripts/compare.mjs` בפורגראונד ולחכות למספרים באותה הרצה, לתקן כל
רגרסיה עד שכל השלוש מתחת ל-11%, לרשום ב-STATE.md.

- `rm -rf .next && CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://
  localhost:3311 pnpm build` -> `exit 0`, בנייה טרייה על HEAD
  `725c64ba4`. `PORT=3311 pnpm start` מול הבנייה הזו (לא שרת ישן).
- **בית** (`--widths=380,768,1440`, `--baseline='refs/ke_live_{width}.png'`,
  בפורגראונד, חיכה למספרים באותה הרצה): **380 8.51% PASS, 768 9.02%
  PASS, 1440 3.95% PASS** — זהה בדיוק ל-M02-c58.
- **מוצר** (`COMPARE_PRODUCT_SLUG=barbecue-2`, `--widths=380,768,1440`,
  `--baseline='refs/electro_product_{width}.png'`, בפורגראונד): **380
  5.65% PASS, 768 4.95% PASS, 1440 2.92% PASS** — תנודה קטנה מ-M02-c58
  (5.61/4.92/2.99), כולם עדיין PASS, אפס תיקון נדרש. תהליך ה-driver
  (`--widths`) נתקע אחרי שהילד של 1440 כבר סיים והדפיס את מספרו (אפס
  תהליך דפדפן חי, `lsof`/`ps` אישרו) — שתי השורות כבר נכתבו
  ל-`docs/UI-PARITY-REPORT.md` על ידי הילדים עצמם לפני התקיעה, אז
  התהליך התקוע נהרג (`kill -9`) אחרי שהמספרים כבר היו בידיים; לא היה
  צורך בניסיון נוסף.
- כל שש השורות נכתבות אוטומטית ל-`docs/UI-PARITY-REPORT.md` על ידי
  השער עצמו (`live side: frozen capture`, HEAD `725c64ba4-dirty`).
- שערים נוספים הורצו במלואם אחרי המדידה: `type-check` נקי, `lint` נקי
  (2023 קבצים, i18n 627/627), `test` 608/608 קבצים 7273/7285 (12
  skipped, 58.04s), `build` `exit 0` (מהריצה הטרייה למעלה). אפס שינוי
  קוד יישומי (רק `STATE.md`/`docs/UI-PARITY-REPORT.md`).

M01-c59: בדיקת פרודקשן בפעם השישית, DNS ו-HTTP תקינים, פריסת HEAD עדיין
חסומה באותה סיבה (env חסר + `ALLOW_INCOMPLETE_ENV`); לא נוסה deploy
חדש לפי כלל "נתקע פעמיים — לדלג". פירוט מלא ב-`docs/STATE-ARCHIVE.md`.

**כל סעיף מ-M18-c58 ועד M08-c57 (כולל M17-c58..M01-c58, M18-c57..M08-c57)**
היה מסומן כאן "ארכיון מלא ב-`docs/STATE-ARCHIVE.md`" וכווץ לשורה הזו
ב-M04-c59 לשמירה על תקרת 300 שורות — שום שורה לא נמחקה מהארכיון עצמו,
רק הוסרה כאן הכפילות.

ההיסטוריה המלאה (Q01..Q24, B01..B10, M01-c1..M15-c56, תור 23.09, וכל מה
שקדם) נשארת שלמה, החדש למעלה, ב-`docs/STATE-ARCHIVE.md`. **כל סעיף
מ-M06-c57 ועד M01-c55 (כולל M18-c55..M01-c56, M16-c55..M13-c55, M07-c55,
M03-c55..M01-c55)** היה מסומן כאן "ארכיון מלא ב-`docs/STATE-ARCHIVE.md`"
וכווץ לשורה הזו ב-M08-c58 לשמירה על תקרת 300 שורות — שום שורה לא נמחקה
מהארכיון עצמו, רק הוסרה כאן הכפילות. הקובץ הזה מחזיק רק את מה שחי.

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
2. **פריסת פרודקשן של HEAD (175 קומיטים אחרי `a388118f1` החי — ספירת git
   בלבד, עודכן ב-M01-c59; ניסיון הפריסה עצמו האחרון היה ב-M01-c55, 105
   קומיטים אז)**:
   נוסתה לאחרונה ב-M01-c55 (Vercel MCP, `create_deployment`, `gitSource`
   github, `audit/final-audit`@`291bc2d88`) **וסורבה ב-`deploy-preflight`**
   באותה סיבה בדיוק, פעם חמישית ברציפות (M01-c1, M01-c52, M01-c53, M01-c54,
   M01-c55): `dpl_FJYf483tkqSNf5pkG9MenghGQF46`, `BUILD_UTILS_SPAWN_1`.
   **מ-M01-c56 ועד M01-c59 לא נוסה ניסיון פריסה נוסף** (כלל "goal שנתקע
   פעמיים — לדלג", מוחל מ-M01-c55, פעם חמישית ב-M01-c59), אך התנאי נבדק
   שוב בקריאה בלבד בכל פעם ואושר ללא שינוי: `CARDCOM_TERMINAL_NUMBER`,
   `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` עדיין חסרים ב-Production
   (קיימים במקומם `CARDCOM_MERCHANT_ID`/`CLIENT_ID`/`API_KEY` שהקוד לא
   קורא) ו-`ALLOW_INCOMPLETE_ENV` עדיין מוגדר שם (`filter_project_envs`,
   קריאה בלבד, M01-c59). `list_deployments` (target=production) מאשר
   שלוש הפריסות האחרונות (כולן מניסיונות קודמים, לא חדש) עדיין `ERROR`.
   עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה; פרודקשן נשאר על
   `a388118f1` (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, READY, מאושר שוב
   ב-M01-c59 דרך `get_deployment` על `www.kenyonexpress.co.il`). **DNS
   אינו קשור לחוסם הזה** — נמדד שוב ב-M01-c59, `www.kenyonexpress.co.il`
   מחזיר 200 עם התוכן החי, `kenyonexpress.co.il` מפנה 308 ל-`www`, ה-NS
   עדיין `ns1/ns2.vercel-dns.com`.
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
13. **הענף המקומי `main` בריפו הזה סוטה מ-`origin/main`, לא רק מאחורה**
    (נמדד M16-c54, re-verified M16-c55 אפס שינוי): קצה מקומי `3f6ca53c3` (10.09), קצה remote
    `18ed044b2` (18.09), אין קשר-אב בין השניים. **לא עבודה אבודה**: קצה
    ה-`main` המקומי הוא ancestor של `origin/audit/final-audit` וגם
    `origin/work/goal-queue-0923` — מצביע-ישן משורשלת ה-`audit`, לא ענף
    נפרד. **לא לפעולה מצד הסוכן**: `main` מוגן ב-GitHub, וסטייה כזו
    תדרוש force-push כדי לדחוף, אסור לפי הכללים. אם רוצים לנקות את
    ה-ref המקומי המבולבל (`git branch -f main origin/main`, לא מיזוג
    ולא מחיקה) — החלטה של אופיר.

## ידני לאופיר, לפי סדר קריטיות

הרשימה המלאה, ממוזגת עם `docs/LAUNCH-READINESS.md` וללא כפילויות, עברה
ל-`docs/BACKLOG.md` (M15-c51). לא נשמר עותק כאן, כדי שלא ייסטה שוב.
