RESUME FROM: M05-c57
Updated: 2026-09-30 (סשן `audit/final-audit`, Sonnet 5, פריט M04-c57)

## המשך מ:

**M04-c57 - DONE (30.09): תחזוקת תלויות, שני עדכוני minor בטווח 0.x
הוחלו (`@anthropic-ai/sdk` 0.122.0→0.129.0, `@supabase/ssr` 0.10.3→0.12.7),
`pnpm audit` אפס חולשות לפני ואחרי.**
המשימה: להריץ `pnpm audit` ו-`pnpm outdated`, להחיל עדכוני patch/minor
ששומרים type-check/test/build ירוקים, לעולם לא major, לתעד ב-STATE.md.

- `pnpm audit`: אפס חולשות, לפני ואחרי השינוי.
- `pnpm outdated`: 16 חבילות מיושנות, אך ל-14 מהן `wanted == current`
  (הטווח ב-`package.json` כבר נעול על ה-patch העדכני) וה-`latest` הוא
  קפיצת major אמיתית (`@biomejs/biome` 1→2, `@hookform/resolvers` 3→5,
  `@sentry/nextjs`/`@sentry/node` 10→11, `@testing-library/jest-dom` 6→7,
  `@types/node` 20→26, `@vitejs/plugin-react` 4→6, `@vitest/coverage-v8`
  4→5, `jsdom` 25→30, `lint-staged` 15→17, `tailwind-merge` 2→3,
  `typescript` 5→7, `vitest` 4→5, `zod` 3→4) — כולן נדחו, אסור major.
- שתי החבילות הנותרות הן `0.x` עם עלייה בספרה השנייה (`minor` לפי
  semver קפדני, ה-`major` נשאר `0` בשתיהן): `@anthropic-ai/sdk`
  0.122.0→0.128.0/0.129.0 (גרסה חדשה יצאה תוך כדי הפריט; הוחל 0.129.0)
  ו-`@supabase/ssr` 0.10.3→0.12.7. שתיהן היו מחוץ לטווח ה-caret
  הקיים (`^0.x.y` על חבילת `0.x` נועל patch בלבד), ולכן `wanted`
  זהה ל-`current` ב-`pnpm outdated` — נדרשה עריכת `package.json`
  בפועל, לא `pnpm update` רגיל.
- **`@anthropic-ai/sdk`**: שימוש יחיד ב-`src/server/ai/client.ts`,
  גרסאות רציפות בין 0.122 ל-0.129 (אין דילוג), הוחל וסומן safe.
- **`@supabase/ssr`**: שימוש רחב וקריטי (עוגיות אימות, לקוח/שרת/proxy,
  11 קבצים כולל טסטים). קיים דילוג בגרסאות שם החבילה
  (0.10.3 → 0.12.0 ישירות, אין `0.11.x` שפורסמה) — נבדק במפורש לפני
  ההחלה כי זה סימן סיכון. הוחל בכל זאת כי הבדיקה האמפירית (type-check,
  lint, 608/608 קבצי טסט זהה במדויק ל-7242/7254, build עם 337/337
  נתיבים ו-`exit 0`) יצאה נקייה בלי שום שינוי קוד נדרש.
- **`pnpm build`**: אותן שורות `supabase.rls_denied`/`db.optional_
  column_missing`/`phases.not_applied` תפעוליות שתועדו ב-M03-c57 —
  זהות, לא רגרסיה חדשה.
- **קבצים:** `package.json`, `pnpm-lock.yaml`, `STATE.md`.

## M03-c57, M02-c57 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M03-c57: שער ירוק, `type-check`/`lint`/`test`/`build` — כל הארבעה
נקיים, אפס תיקון נדרש, זהה במהות ל-M03-c56. M02-c57: שער חזותי, בית
ומוצר, שלושה רוחבים, אפס רגרסיה, זהה בדיוק ל-M02-c56. שניהם DONE, אפס
שינוי UI. הועברו ב-M04-c57 לשמירה על תקרת 300 שורות.

## M18-c56, M17-c56 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M18-c56: בדיקת אפס-פעילות בפעם השלישית, המחזור *לא* היה אפס-פעילות.
M17-c56: מעבר קופי ומשפטי בפעם הרביעית, אפס ממצא חדש. שניהם
`type-check`/`lint`/`test`/`build` ירוקים. הועברו ב-M03-c57 לשמירה על
תקרת 300 שורות.

## M16-c56 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

תברואת ריפו בפעם השישית, אפס דריפט מ-M16-c55: `git status` נקי, 43
ענפים מקומיים זהה בדיוק, כל ענף נבדק דחוף (32 עוקבים, 4 `arch/*`
עוקבים אחרי `origin/main` אך SHA זהה, 8 בלי upstream מקומי אך SHA
זהה, 6 בלי מקביל remote אך מוכלים בענפי remote אחרים), 24 PR פתוחים
זהה, 116 ענפי remote זהה, 11 ממוזגים ל-HEAD, 28 ישנים. `type-check`/
`lint`/`test`/`build` ירוקים. הועבר ב-M17-c56 לשמירה על תקרת 300
שורות.

## M15-c56 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

סנכרון תיעוד — `STATE.md`/`docs/LAUNCH-READINESS.md`/`docs/BACKLOG.md`
מול `git log` ומדידה ישירה, אפס פריט חדש. 14 קומיטים נבדקו
(M01-c56..M14-c56), שניים נוגעים בקוד (`posthog-js` פטץ',
`orders/status-transitions.ts` טסטים), אף אחד לא בשורת חסימה.
`type-check`/`lint`/`test` (608/608, 7242/7254)/`build` ירוקים. הועבר
ב-M16-c56 לשמירה על תקרת 300 שורות.

## M14-c56 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

ביצועים — bundle/צנרת תמונות/תגיות ISR/כותרות cache אומתו מחדש מול
build אמיתי, אפס דריפט מ-M14-c55: bundle 345.1kB/27 chunks זהה, אין
באג `fill`+px `sizes` חדש, `cache-invalidation-gate` נקי, כותרות cache
תואמות למדיניות. `type-check`/`lint`/`test` (608/608, 7242/7254)/
`build` ירוקים. הועבר ב-M15-c56 לשמירה על תקרת 300 שורות.

## M13-c56 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

CSP/HSTS/X-Frame-Options/Referrer-Policy ומגבלות קצב Upstash על
login/checkout/redeem אומתו מחדש מול build אמיתי, אפס דריפט מ-M13-c55:
כל ארבע כותרות האבטחה זהות על `/`/`/checkout`/`/login`/`/redeem/
[token]`, כל ארבע מגבלות הקצב (`login`/`begin_checkout`/`redeem`/
`voucher-redeem`) נאכפות באותן שורות קוד. `type-check`/`lint`/`test`
(608/608, 7242/7254)/`build` ירוקים, אפס שינוי קוד. הועבר ב-M14-c56
לשמירה על תקרת 300 שורות.

## M12-c56 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

SEO — meta/canonical/og/JSON-LD Product+Offer/sitemap/robots אומתו
מחדש מול build אמיתי, אפס דריפט מ-M12-c55: `sitemap/products.xml` 46
כתובות, `robots.txt` 11 Disallow, דף מוצר עם canonical/og/JSON-LD
תקינים, מוצר לא פעיל מחזיר `noindex`. `type-check`/`lint`/`test`
(608/608, 7242/7254)/`build` ירוקים, אפס שינוי קוד. הועבר ב-M13-c56
לשמירה על תקרת 300 שורות.

## M01-c56..M11-c56 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M11-c56: axe אומתה מחדש, 0 הפרות serious/critical (אדמין 57/57 דילוג,
כשל התחברות לא קשור לקוד). M10-c56: כיסוי ענפים,
`orders/status-transitions.ts` 66.66%→100%, `orders/order-transitions.ts`
83.33%→100%. M09-c56: STATE CLEAN, אפס פריט חדש. M08-c56: BACKLOG מלא
בפעם ה-17, אפס פריט חדש. M06-c56: Lighthouse mobile 90+ בשמונתם.
M05-c56: DB advisors 44 WARN זהה בפעם השישית. M04-c56: תלויות,
`posthog-js` patch יחיד הוחל. M03-c56: שער ירוק, אין מה לתקן. M02-c56:
שער חזותי אפס רגרסיה. M01-c56: DNS תקין, פריסת HEAD חסומה (Cardcom env),
HEAD 122 קומיטים לפני פרודקשן אז. כולם DONE, אפס שינוי UI. הועברו
ב-M15-c56 לשמירה על תקרת 300 שורות.

## M18-c55, M17-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M18-c55: בדיקת אפס-פעילות בפעם השנייה, המחזור *לא* היה אפס-פעילות
(שני קומיטי שינוי-קוד אמיתיים), MAINTENANCE IDLE לא נכתב. M17-c55:
מעבר קופי ומשפטי בפעם השלישית, אפס ממצא חדש, שער חזותי בית PASS
בשלושת הרוחבים. שניהם DONE, אפס שינוי UI. הועברו ב-M01-c56 לשמירה
על תקרת 300 שורות.

## M16-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

תברואת ריפו בפעם החמישית: git נקי, כל 43 הענפים המקומיים (עלה מ-40,
שלושה worktrees חדשים) נבדקו ב-SHA מול remote, 24 PR פתוחים, 116 ענפי
remote, אפס דריפט מ-M16-c54. הועבר ב-M17-c55 לשמירה על תקרת 300 שורות.

## M15-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

`STATE.md`/`docs/LAUNCH-READINESS.md`/`docs/BACKLOG.md` סונכרנו מול
`git log`; שני קומיטי שינוי-קוד מ-M15-c54 נבדקו (עדכון `posthog-js`,
טסטים ל-`refund-requests`), אף אחד לא נגע בשורת חסימה. פרודקשן מאחורי
HEAD 118 קומיטים (עלה מ-101, כולל תיקון ייחוס לממצא ישן שהיה קפוא על
87). הועבר ב-M16-c55 לשמירה על תקרת 300 שורות.

## M14-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

bundle/צנרת תמונות/תגיות ISR/כותרות cache נמדדו מחדש מול build אמיתי,
אפס דריפט מ-M14-c54: bundle 345.1kB/27 chunks זהה, אין באג `fill`+px
`sizes` חדש, `cache-invalidation-gate` נקי, כותרות cache תואמות
למדיניות. הועבר ב-M15-c55 לשמירה על תקרת 300 שורות.

## M13-c55, M12-c55, M10-c55, M09-c55, M08-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M09-c55: STATE CLEAN בפעם השש-עשרה ברציפות, אפס פריט שלב 1 בידי הסוכן;
בדיקת `filter_project_envs` בקריאה בלבד על 39 משתני הסביבה אישרה חוסמים
3/8 ללא שינוי. M08-c55: BACKLOG EMPTY בפעם החמש-עשרה, 23 TODO/FIXME
נבדקו (21 placeholder, 2 חסומים על Cardcom). שניהם DONE, אפס שינוי UI.
הועברו ב-M10-c55 לשמירה על תקרת 300 שורות.

## M07-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

route audit נמדד שוב, 242 שורות, אפס כשל אמיתי, אפס דלתא קוד שנוגעת
במסלול. הועבר ב-M09-c55 לשמירה על תקרת 300 שורות.

## M03-c55, M04-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M04-c55: תחזוקת תלויות, עדכון פטץ' יחיד בהיקף (`posthog-js`), `pnpm
audit` אפס חולשות. M03-c55: שער ירוק (`type-check`/`lint`/`test`/
`build`), אין מה לתקן. שניהם DONE, אפס שינוי UI. הועברו ב-M06-c55
לשמירה על תקרת 300 שורות.

## M05-c55, M06-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M06-c55: Lighthouse mobile, כל שמונת הציונים 90+ (בית 93/100/100/100,
מוצר 99/100/100/100), אפס תיקון נדרש. M05-c55: ביקורת DB, 44 WARN זהה
שדה-שדה למדידה הרביעית, אפס WARN חדש, אפס קובץ מיגרציה חדש. שניהם DONE,
אפס שינוי UI. הועברו ב-M07-c55 לשמירה על תקרת 300 שורות.

## M02-c55, M01-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M02-c55: שער חזותי, בית ומוצר, שלושה רוחבים, אפס רגרסיה. M01-c55: DNS
תקין, פריסת HEAD דרך Vercel MCP סורבה בפעם החמישית ברציפות (`CARDCOM_
TERMINAL_NUMBER`/`API_NAME`/`API_PASSWORD` חסרים, `ALLOW_INCOMPLETE_ENV`
מוגדר), פרודקשן לא נפגע. **כאן הוחל לראשונה כלל "goal שנתקע פעמיים —
לדלג"**, ומאז ניסיון פריסה לא רץ שוב. שניהם `type-check`/`lint`/`test`/
`build` ירוקים. הועברו ב-M03-c55 לשמירה על תקרת 300 שורות.

ההיסטוריה המלאה (Q01..Q24, B01..B10, M01-c1..M18-c55, תור 23.09, וכל מה שקדם,
כולל M11-c53..M18-c53 ו-M01-c54..M18-c54 שהפסקאות שלהן הוסרו מכאן — עד
M10-c54 ב-M01-c56, ומ-M11-c54 עד M18-c54 ב-M08-c56, שתיהן לשמירה על תקרת
300 שורות — נשארות שלמות בארכיון, לא נמחקו)
ב-`docs/STATE-ARCHIVE.md`, החדש למעלה. הקובץ הזה מחזיק רק את מה שחי.

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
2. **פריסת פרודקשן של HEAD (136 קומיטים אחרי `a388118f1` החי — ספירת git
   בלבד, M15-c56; ניסיון הפריסה עצמו האחרון היה ב-M01-c55, 105 קומיטים
   אז)**:
   נוסתה לאחרונה ב-M01-c55 (Vercel MCP, `create_deployment`, `gitSource`
   github, `audit/final-audit`@`291bc2d88`) **וסורבה ב-`deploy-preflight`**
   באותה סיבה בדיוק, פעם חמישית ברציפות (M01-c1, M01-c52, M01-c53, M01-c54,
   M01-c55): `dpl_FJYf483tkqSNf5pkG9MenghGQF46`, `BUILD_UTILS_SPAWN_1`.
   **ב-M01-c56 לא נוסה ניסיון פריסה נוסף** (כלל "goal שנתקע פעמיים —
   לדלג", מוחל מ-M01-c55), אך התנאי נבדק שוב בקריאה בלבד ואושר ללא
   שינוי: `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`,
   `CARDCOM_API_PASSWORD` עדיין חסרים ב-Production (קיימים במקומם
   `CARDCOM_MERCHANT_ID`/`CLIENT_ID`/`API_KEY` שהקוד לא קורא) ו-
   `ALLOW_INCOMPLETE_ENV=true` עדיין מוגדר שם (`filter_project_envs`,
   קריאה בלבד). עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה;
   פרודקשן נשאר על `a388118f1` (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, READY,
   אושר שוב ב-M01-c56 עם `list_deployments`). **DNS אינו קשור לחוסם הזה**
   — נמדד שוב ב-M01-c56, `www.kenyonexpress.co.il` מחזיר 200 עם התוכן
   החי (`a388118f1`), `kenyonexpress.co.il` מפנה 308 ל-`www`, ה-NS עדיין
   `ns1/ns2.vercel-dns.com`.
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
