# INFRA-TASKS: משימות תשתית backend

רשימת משימות תשתית ממוספרות ל-backend של KenyonExpress.
מבוצעות לפי הסדר, אחת בכל פעם, לפי חוקי CLAUDE.md.
מקור הממצאים: INFRA-AUDIT.md (טבלת הממצאים + פרק 1).

## משימה 1: endpoint לרענון ISR לפי דרישה (on-demand revalidation)

**סטטוס:** פתוח.

**הבעיה:** אין
`src/app/api/revalidate/route.ts`
(נמדד 03.09: הקובץ לא קיים). דפי ISR מתעדכנים רק לפי טיימר, ועריכת תוכן
ב-Supabase לא משתקפת באתר עד פקיעת ה-revalidate.

**הפתרון (לפי הספק שכבר כתוב ב-INFRA-AUDIT.md, פרק "Revalidate endpoint"):**

1. יצירת
   `src/app/api/revalidate/route.ts`
   עם: POST בלבד, `runtime = 'nodejs'`, השוואה בזמן קבוע של הכותרת
   `x-revalidate-secret`
   מול
   `REVALIDATE_SECRET`
   באמצעות
   `crypto.timingSafeEqual`,
   ואז `revalidateTag` לפי ה-`table` שב-payload.
2. מפת תגיות: `products` ו-`product_variants` אל התג `products`,
   `categories` אל `categories`,
   `coupon_deals` / `coupons` / `coupon_codes` אל `coupons`.
3. תיעוד `REVALIDATE_SECRET` ב-`.env.example`.
4. הגדרת Database Webhooks ב-Supabase (אחד לכל טבלה) לפי הבלוק המוכן
   ב-INFRA-AUDIT.md. שלב זה תלוי בפרודקשן חי, ולכן מתועד ולא מורץ.

**הגדרת סיום:** הקובץ קיים, בקשת POST עם secret שגוי מחזירה 401,
עם secret נכון מחזירה 200 ומריצה `revalidateTag`, טסטים ירוקים
(`pnpm test`, `pnpm type-check`, `pnpm lint`).

## משימה 2: מיגרציית אימות לכיסוי RLS (assertion migration)

**סטטוס:** פתוח.

**הבעיה:** אין מיגרציה שנועלת את כיסוי ה-RLS כקוד
(נמדד 03.09: אין קובץ `rls_coverage` תחת
`supabase/migrations/`
או
`migrations/`,
והמספר 032 שהוצע ב-INFRA-AUDIT.md כבר תפוס על ידי
`032_wp_import_staging.sql`).
ה-RLS עצמו נכון (נבדק ב-audit ומחוזק במיגרציות 111 ו-122), אבל שום דבר
לא אוכף את זה קדימה: טבלה חדשה שתיווצר בלי RLS תעבור בשקט.

**הפתרון (לפי שורת הממצא P2 בטבלת INFRA-AUDIT.md):**

1. כתיבת מיגרציית אימות אידמפוטנטית, בלי שום שינוי סכימה, תחת
   `migrations/pending/`
   עם המספר הפנוי הבא אחרי האחרון ב-`migrations/applied/` (לא 032):
   בלוק `DO $$` שסורק את `pg_catalog.pg_tables` בסכימת `public` ומרים
   `EXCEPTION` עם רשימת הטבלאות אם קיימת טבלה עם `rowsecurity = false`.
2. בלי לקבע את מספר הטבלאות בקוד. הסכימה בפרודקשן היא lineage שונה
   מקבצי `supabase/migrations/` (ראה DB-DRIFT-AUDIT.md), ולכן האימות
   חייב להיות דינמי על כל הטבלאות שקיימות בפועל.
3. הקובץ ממתין לאישור לפי חוקי CLAUDE.md: אין `db push` ואין הרצת
   migration על פרודקשן בלי אישור.

**הגדרת סיום:** קובץ המיגרציה קיים ב-`migrations/pending/`, עומד בחוקי
האידמפוטנטיות של supabase-migrations, טסטים ירוקים
(`pnpm test`, `pnpm type-check`, `pnpm lint`).

## משימה 3: שדרוג CSP ל-nonce פר-בקשה עם strict-dynamic

**סטטוס:** פתוח.

**הבעיה:** ה-CSP הגלובלי עדיין מכיל
`'unsafe-inline'`
ב-`script-src` וב-`style-src`
(נמדד 03.09: ההערה בראש בלוק ה-headers ב-
`next.config.ts`
מתעדת את זה במפורש כ-fallback). INFRA-AUDIT.md, פרק
"Security headers", רשם את זה כסטייה מהספק וקבע את השדרוג כ-follow-up
ברמת P1: header סטטי ב-config לא יכול לשאת nonce שמתחלף בכל בקשה,
ולכן הפתרון עובר דרך
`src/proxy.ts`.

**הפתרון (לפי הסטייה המתועדת ב-INFRA-AUDIT.md, פרק 2):**

1. יצירת nonce אקראי פר-בקשה ב-
   `src/proxy.ts`
   (16 בייטים מ-`crypto.getRandomValues`, מקודדים base64), וכתיבת
   header תגובה
   `Content-Security-Policy`
   עם
   `script-src 'self' 'nonce-<value>' 'strict-dynamic'`
   במקום
   `'unsafe-inline'`.
2. בניית מחרוזת ה-CSP נשארת ב-
   `src/lib/security/frame-policy.ts`,
   שכבר היום בונה את החלק תלוי-הנתיב (חריגי ה-framing של Cardcom),
   כדי שהמדיניות תישאר במקום אחד. ה-proxy דורס (לא מוסיף) את ה-header,
   מאותה סיבה שמתועדת שם: שני headers של CSP נאכפים שניהם והמחמיר מנצח.
3. **מוקש מדוד שחובה לבדוק לפני מימוש:** השחלת ה-nonce לתגי
   `<script>`
   דורשת קריאת state פר-בקשה בעץ הרינדור (למשל `headers()`), וזה מחזיר
   את מסלולי ה-`(store)` הסטטיים לרינדור דינמי, בדיוק מה שהוסר בעבודת
   ה-ISR (ראה ההערה בראש
   `src/app/(store)/layout.tsx`).
   אם המדידה מאשרת את הרגרסיה, הפתרון השמרני הוא nonce על המסלולים
   הדינמיים בלבד (דרך ה-proxy) והשארת המדיניות הנוכחית על הסטטיים,
   עם תיעוד ההחלטה.

**הגדרת סיום:** על מסלול דינמי, ה-header
`Content-Security-Policy`
מכיל `nonce` ו-`'strict-dynamic'` בלי `'unsafe-inline'` ב-`script-src`;
פלט `pnpm build` מראה שהמסלולים הסטטיים של `(store)` נשארו סטטיים;
חריגי ה-framing של Cardcom ממשיכים לעבוד; טסטים ירוקים
(`pnpm test`, `pnpm type-check`, `pnpm lint`, וגם `pnpm build` כשער נפרד).

## משימה 4: מיגרציית תזמון ה-cron (המספר השמור 162) מעל pg_cron + pg_net

**סטטוס:** פתוח.

**הבעיה:** שנים עשר מסלולי cron קיימים תחת
`src/app/api/cron/`
(כולם GET עם
`Authorization: Bearer <CRON_SECRET>`,
נמדד 03.09: ‏12 קובצי route, ‏12 עם GET, ‏0 עם POST), ואין להם מתזמן ב-DB:
‏STATE.md ‏(03.09) מתעד ש-
`select count(*) from cron.job`
מחזיר 0 וש-`vercel.json` לא מגדיר אף cron. מיגרציה
`161_enable_pg_cron_pg_net.sql`
כבר הוחלה בפרודקשן (‏`pg_cron` ‏1.6.4, ‏`pg_net` ‏0.20.0, ו-grant על
סכימת `cron` ל-postgres) והכותרת שלה מפנה במפורש ל-162 כמי שתתזמן.
המספר 162 שמור לזה ב-STATE.md ‏(סעיף "מספור": ‏160 ו-161 תפוסות, האינדקסים
עברו ל-163), אבל נמדד 03.09: אין שום קובץ 162 לא ב-
`migrations/pending/`
ולא ב-
`migrations/applied/`.
המספר שמור, הקובץ לא קיים, והעבודות לא רצות.

**הפתרון:**

1. כתיבת
   `migrations/pending/162_schedule_cron_jobs.sql`
   שרושמת את שנים עשר הג'ובים בדיוק כפי שהם מוגדרים ב-
   `scripts/cron-jobs.json`
   (מקור האמת היחיד לפי ההערה בראשו): לכל ג'וב קריאת
   `cron.schedule('<name>', '<cron>', $$ select net.http_get(...) $$)`
   כשה-URL הוא `defaultBaseUrl` ועליו ה-path מה-JSON, וה-headers כוללים
   `Authorization: Bearer <CRON_SECRET>`.
   ‏`cron.schedule` בשמות היא upsert לפי שם ב-pg_cron, וזה מה שנותן את
   האידמפוטנטיות: הרצה חוזרת מעדכנת ולא משכפלת.
2. **אסור שהסוד יופיע בקובץ.** הריפו ציבורי ל-git, וקובץ מיגרציה עם
   `CRON_SECRET`
   מוטבע הוא הדלפה. בדיקה מדודה לפני מימוש: האם
   `supabase_vault`
   מותקן בפרודקשן (‏`select extname from pg_extension`; לא נמדד עד כה,
   אין שום אזכור Vault במיגרציות). אם כן, פקודת הג'וב קוראת את הסוד
   בזמן ריצה מ-
   `vault.decrypted_secrets`
   והקובץ נקי לחלוטין. אם לא, הקובץ נושא placeholder מפורש
   (`{{CRON_SECRET}}`)
   שמוחלף רק בזמן ההחלה, עם הערת אזהרה בראש הקובץ.
3. הרחבת
   `src/__tests__/cron-schedule-inventory.test.ts`
   כך שגם 162 נבדקת מול ה-JSON. הטסט הזה כבר אוכף היום ש-
   `docs/CRON-EXTERNAL.md`,
   ‏`.github/workflows/cron.yml`
   והמסלולים לא סוטים מהמקור; מיגרציה עם לוחות זמנים מוטבעים היא עותק
   חמישי, ובלי השער הזה היא תתיישן בשקט.
4. **מוקש מתועד:** ‏`defaultBaseUrl` הוא
   `https://kenyonexpress.vercel.app`,
   והפניית ה-DNS לדומיין הסופי היא שלב ידני שממתין לאישור. הג'ובים
   מתוזמנים מול כתובת ה-vercel.app, ואחרי ה-cutover תידרש מיגרציית
   עדכון כתובות. לתעד את זה בראש הקובץ, לא לנחש את הדומיין מראש.
5. הקובץ ממתין לאישור לפי חוקי CLAUDE.md: אין `db push` ואין הרצת
   migration על פרודקשן בלי אישור.

**הגדרת סיום:** הקובץ קיים ב-`migrations/pending/` עם שנים עשר הג'ובים,
שמות, נתיבים ולוחות זמנים זהים אחד לאחד ל-
`scripts/cron-jobs.json`;
אף מחרוזת סוד לא מופיעה בקובץ; טסט האינוונטר המורחב עובר; טסטים ירוקים
(`pnpm test`, `pnpm type-check`, `pnpm lint`).

## משימה 5: שער boot נגד checkout חי מעל ספק מדומה

**סטטוס:** פתוח.

**מקור:** החוסם המתועד ב-STATE.md ‏(‏02.09, סגירת v1.0), לא טבלת
INFRA-AUDIT.md, שכל שורותיה הפתוחות כבר מכוסות במשימות 1 עד 4 או סגורות
(נמדד 03.09: ‏logger, ‏CI, ‏instrumentation, ‏JSON-LD ו-openGraph קיימים).

**הבעיה:** בפרודקשן מוגדרים גם
`CHECKOUT_ENABLED="true"`
וגם
`CARDCOM_USE_MOCK="true"`
‏(STATE.md ‏02.09). נמדד 03.09 בקוד:
`loadCardcomEnv`
ב-
`src/lib/payments/env.ts`
(שורות 61 עד 64) מחזיר `useMock: true` בכל פעם ש-
`CARDCOM_USE_MOCK === 'true'`,
בלי שום סייג לפרודקשן, ו-`checkoutEnabled` נקבע בנפרד. השילוב הוא צ'קאאוט
חי מול ספק מדומה שמחזיר `success: true` לכל קריאה: לקוח משלים רכישה, מקבל
שובר, ואף כרטיס לא מחויב. ה-`superRefine` ב-
`src/lib/env.ts`
כבר מפיל boot בפרודקשן על
`CARDCOM_SANDBOX === 'true'`
(מאותו נימוק בדיוק, מתועד שם), אבל לא בודק את
`CARDCOM_USE_MOCK`
בכלל. תיקון ה-env עצמו (מחיקת הדגל + אישורי טרמינל אמיתיים) נשאר שינוי
ידני שממתין לאישור; המשימה כאן היא שהקוד יסרב לרוץ במצב הזה במקום לסמוך
על זיכרון.

**הפתרון:**

1. הוספת בדיקה ל-`superRefine` ב-
   `src/lib/env.ts`,
   צמוד לבדיקת
   `CARDCOM_SANDBOX`
   הקיימת: בפרודקשן, `CARDCOM_USE_MOCK === 'true'` מפיל את ה-boot עם
   הודעה מפורשת.
2. **מוקש מדוד שקובע את המיקום:** ‏`next start` מקומי הוא גם הוא
   `NODE_ENV=production`,
   וכל סוויטת ה-E2E ומדידות ה-Lighthouse רצות ככה עם המוק. שער שנבדק
   לפי `NODE_ENV` בלבד מנתק את כולן (נמדד בעבר, מתועד בהערה בראש אותו
   `superRefine`: ‏`pnpm start` ענה 500 על כל מסלול). לכן הבדיקה חייבת
   לשבת מאחורי אותו escape hatch קיים,
   `ALLOW_INCOMPLETE_ENV === 'true'`,
   כמו שאר בדיקות הפרודקשן באותו בלוק. אין להמציא דגל חדש.
3. **מוקש סדר פעולות:** הדיפלוי הנוכחי ב-vercel.app רץ היום עם
   `CARDCOM_USE_MOCK="true"`,
   ולכן דיפלוי של השער לפני עדכון ה-env בפרודקשן יפיל את ה-boot של
   הדיפלוי הבא. השער נכנס לקוד עכשיו; ה-deploy לפרודקשן מתואם עם עדכון
   ה-env, שממילא נופל תחת מצב העצירה "push לפרודקשן" בחוקי CLAUDE.md.
4. טסטי יחידה על הסכימה: פרודקשן עם
   `CARDCOM_USE_MOCK="true"`
   נכשל; אותו env עם
   `ALLOW_INCOMPLETE_ENV="true"`
   עובר; מחוץ לפרודקשן עובר.

**הגדרת סיום:** ‏parse של env עם `NODE_ENV=production` ו-
`CARDCOM_USE_MOCK="true"`
בלי waiver זורק עם הודעה שמזכירה את שם המשתנה; עם
`ALLOW_INCOMPLETE_ENV="true"`
עובר; בדיקת ה-`CARDCOM_SANDBOX` הקיימת לא נשברת; טסטים ירוקים
(`pnpm test`, `pnpm type-check`, `pnpm lint`).

## משימה 6: אבחון צינור הדיפלוי של Vercel ואימות יעד הדומיין

**סטטוס:** פתוח.

**מקור:** ‏STATE.md, שני ממצאים מדודים: כשל הדיפלויים (‏02.09, סעיף
"שער Vercel על PR #27 אדום") וחוסם מספר 3 מרשימת "ארבעה חוסמים" ‏(01.09):
לא ידוע לאיזה פרויקט Vercel הדומיין יוצמד. לא שורת INFRA-AUDIT.md; הטבלה
שם כבר מכוסה במלואה במשימות 1 עד 4.

**הבעיה:** כל דיפלוי מאז 01.09 נכשל בתוך שנייה (נמדד 02.09:
`created_at = updated_at`,
בילד Next לא הספיק לרוץ), כולל commit על
`origin/main`
‏(`9e76800c`, ‏01.09) ושש דגימות Preview מה-02.09. דיפלוי Production אחרון
שהצליח: ‏31.08 ‏(`9d920802`), והאתר החי עדיין עונה 200. כלומר push ל-main
לא מגיע לפרודקשן, ואף אחד לא יתריע: ‏Vercel אינו שער חובה ב-CI. בנוסף,
ה-API של Vercel מחזיר בחשבון פרויקט אחד בלבד,
`kenyonexpress-web`,
שמחובר לריפו אחר
(`kenyonexpress/kenyonexpress-web`)
וכל אחד עשר הדיפלויים שלו במצב `ERROR`, בעוד האתר החי מוגש מפרויקט בשם
`kenyonexpress`
שלא מופיע דרך ה-API. המיזוג ל-main הפיק דיפלוי `Preview`, ולכן main אינו
ה-Production Branch של הפרויקט החי. אין לוג בילד בלי
`VERCEL_TOKEN`,
וה-CLI המקומי לא מקושר (אין
`vercel link`
ואין token, נמדד).

**הפתרון (אבחון ותיעוד; הדיפלוי עצמו נשאר תחת מצב העצירה "push לפרודקשן"):**

1. שליפת השגיאה המדויקת של דיפלוי כושל אחד דרך ה-MCP של Vercel
   (`get_deployment`
   ואז
   `get_deployment_build_logs`),
   בלי להפעיל שום דיפלוי חדש. אם ה-MCP לא רואה את הפרויקט החי, לתעד את
   זה כראיה לכך שהוא יושב תחת scope אחר, וזה בעצמו ממצא.
2. מיפוי שני הפרויקטים: לאיזה ריפו כל אחד מחובר, מה ה-Production Branch
   של כל אחד, ומי מגיש בפועל את
   `kenyonexpress.vercel.app`.
   התוצר הוא טבלה קצרה ב-`docs/DEPLOYMENT.md`.
3. כתיבת סעיף מתוקן ב-`docs/DEPLOYMENT.md`: איזו פעולה נדרשת בלוח Vercel
   (חיבור הפרויקט החי לריפו הזה עם Production Branch ‏main, או העברת
   הדומיין), צעד אחר צעד. הפעולה בלוח היא ידנית ולא של סוכן: היא שקולה
   ל-push לפרודקשן.
4. **אסור:** להוסיף `deploy.yml` (אינטגרציית Git כבר מפעילה דיפלוי, נמדד
   ומתועד ב-STATE.md), לשנות את `vercel.json` בלי לוג בילד ביד, או למחוק
   פרויקט. אימות הצמדת הדומיין לפני הפניית ה-DNS הוא חלק מהמשימה; הפניית
   ה-DNS עצמה נשארת ידנית.

**הגדרת סיום:** סיבת הכשל של דיפלויי השנייה האחת נקובה עם ראיה (לוג בילד
או שדה שגיאה מה-API) או מתועדת כחסומה עם הראיה למה; ‏`docs/DEPLOYMENT.md`
מכיל את טבלת שני הפרויקטים ואת צעדי התיקון בלוח; מתועד לאיזה פרויקט
הדומיין חייב להיות מוצמד; לא הופעל אף דיפלוי; טסטים ירוקים
(`pnpm test`, `pnpm type-check`, `pnpm lint`).

## משימה 7: שער טריות דיפלוי: מסלול version מאומת והשוואה מתוזמנת מול main

**סטטוס:** פתוח.

**מקור:** אותו ממצא מדוד של משימה 6 ‏(STATE.md ‏02.09): פרודקשן מגיש את
בילד ה-31.08 ‏(`9d920802`) בזמן שכל דיפלוי מאז 01.09 נכשל בתוך שנייה,
והאתר עונה 200. משימה 6 מאבחנת למה הדיפלויים נכשלים; המשימה כאן סוגרת את
החצי השני של אותו ממצא: אף מנגנון לא מסוגל להבחין שפרודקשן נשאר מאחור.
לא שורת INFRA-AUDIT.md; הטבלה שם כבר מכוסה במשימות 1 עד 4.

**הבעיה:** כל הבדיקות הקיימות מודדות liveness בלבד, ודיפלוי תקוע עובר את
כולן. נמדד 03.09 בקוד:

1. `.github/workflows/production-smoke.yml`
   בודק ש-`/` ו-`/api/health` עונים 200, וההערה בראשו כבר מכריזה
   "It is not uptime monitoring". בילד בן שלושה ימים עונה 200 ועובר.
2. `src/app/api/health/route.ts`
   מסתיר בכוונה version ו-commit. זו החלטה מתועדת בהערת הראש שלו:
   המסלול לא מאומת בהכרח, וכל מה שהוא מחזיר הוא ציבורי, כך ש-sha חשוף
   הוא inventory חינם לתוקף. אסור "פשוט להוסיף sha" בלי לסתור אותה.
3. אין אף מסלול אחר שמחזיר את זהות הבילד הרץ, ואין אף workflow שמשווה
   אותה ל-`origin/main`.

התוצאה היא בדיוק מה שנמדד ב-02.09: ‏main מתקדם, פרודקשן קפוא מ-31.08,
אפס התראות מכל כיוון.

**הפתרון:**

1. מסלול חדש
   `src/app/api/version/route.ts`
   לפי תבנית שנים עשר מסלולי ה-cron הקיימים: GET בלבד, אימות
   `Authorization: Bearer <CRON_SECRET>`
   עם
   `bearerMatches`
   מ-
   `src/lib/security/constant-time.ts`
   (אותו helper שכולם משתמשים בו), ‏401 בלי הסוד. עם הסוד: JSON עם
   `commitSha`
   מ-
   `process.env.VERCEL_GIT_COMMIT_SHA`,
   שמוזרק על ידי Vercel בזמן הבילד.
2. **מוקש מדוד שקובע את ההתנהגות המקומית:** ‏`pnpm start` מקומי רץ בלי
   המשתנה הזה, וכל סוויטת ה-E2E רצה ככה (ראה המוקש המקביל במשימה 5).
   לכן בהיעדרו המסלול מחזיר
   `"unknown"`
   מפורש עם 200, לא נכשל ולא ממציא ערך.
3. צעד freshness ב-
   `.github/workflows/nightly-health.yml`
   (שכבר מתריע ל-ntfy): שליפת ה-sha מהמסלול עם
   `CRON_SECRET`
   (כבר קיים כ-Actions secret, מתועד בראש
   `.github/workflows/cron.yml`),
   והשוואה ל-HEAD של
   `origin/main`.
   ‏**מוקש race:** דיפלוי לוקח דקות, ולכן push טרי חייב חלון חסד.
   ההתראה נשלחת רק כששני התנאים מתקיימים: ה-sha שונה, וגם commit ה-HEAD
   ישן משעתיים לפי ה-timestamp שלו דרך ה-API של GitHub, לא לפי שעון
   הריצה. ‏sha של `"unknown"` מפרודקשן הוא כשל בפני עצמו ומדווח.
4. **מוקש מדוד:** ‏workflows מתוזמנים רצים רק מה-default branch. הצעד לא
   יפעל עד שהקובץ מגיע ל-main, בדיוק כמו שמתועד בהערת הראש של
   `production-smoke.yml`.
   לתעד, לא לעקוף.
5. טסט על המסלול: בלי header מחזיר 401; עם הסוד מחזיר 200 עם sha או
   `"unknown"`.
6. **אסור:** להוסיף sha ל-`/api/health` (סותר החלטה מתועדת בקובץ);
   להוסיף `deploy.yml` (האיסור של משימה 6 בתוקף); להמציא secret חדש.

**הגדרת סיום:** המסלול קיים; ‏POST או GET בלי סוד מחזירים 401; ‏GET עם
הסוד מחזיר 200 עם sha אמיתי בסביבת Vercel או
`"unknown"`
מפורש מקומית; צעד ה-freshness קיים ב-workflow עם חלון החסד ותנאי
ה-`"unknown"`; טסטים ירוקים
(`pnpm test`, `pnpm type-check`, `pnpm lint`).

## משימה 8: גיבוי DB מתוזמן ומוצפן אל מחוץ ל-Supabase (offsite pg_dump)

**סטטוס:** פתוח.

**מקור:** ‏`docs/ARCHITECTURE-BACKUP-DR.md`, לא טבלת INFRA-AUDIT.md
(שכבר מכוסה במשימות 1 עד 4). המסמך עצמו קובע: ‏Supabase Free הוא בלי
גיבויים יומיים ובלי PITR, כלומר פרויקט שנמחק הוא אובדן נתונים סופי
(עיקרון 1 שם), ו-`pg_dump` חיצוני נדרש גם ב-Pro (עיקרון 3 שם). המסמך
מתאר את המדיניות; המשימה כאן היא שמשהו יריץ אותה בפועל.

**הבעיה (נמדד 03.09):**

1. `scripts/backup-schema.sh`
   קיים, אבל הוא **schema-only במוצהר** (הערת הראש שלו: הוא נכתב כי
   `supabase/migrations/`
   אינו lineage של פרודקשן, ראה DB-DRIFT-AUDIT.md), ושום דבר לא מריץ
   אותו: אפס אזכורי backup בכל שבעת קובצי
   `.github/workflows/`,
   אפס ב-
   `scripts/cron-jobs.json`,
   ואין תיקיית `backups/` בריפו. גיבוי **נתונים** לא קיים בכלל, בשום
   מנגנון.
2. ההשלכה חמורה מהרגיל דווקא בגלל הדריפט: כיוון שהמיגרציות לא מתארות
   את פרודקשן, אי אפשר לשחזר אפילו את הסכימה מהריפו. בלי dump חיצוני,
   אובדן הפרויקט הוא אובדן הסכימה והנתונים גם יחד.
3. שנים עשר מסלולי ה-cron אינם פתרון: פונקציית serverless בלי בינארי
   `pg_dump`
   ועם timeout לא יכולה להפיק dump. המתזמן שכבר קיים לעבודות ריפו הוא
   GitHub Actions
   (‏`cron.yml` ו-`nightly-health.yml` רצים שם היום).

**הפתרון:**

1. workflow חדש
   `.github/workflows/db-backup.yml`:
   ‏schedule יומי + ‏workflow_dispatch. הצעדים: ‏dump מלא (סכימה ונתונים)
   עם
   `pg_dump --format=custom`
   מול secret חדש
   `SUPABASE_DB_URL`,
   ולצידו dump סכימה דרך הסקריפט הקיים. אימות לפני שמירה, באותה גישה
   שכבר כתובה ב-
   `scripts/backup-schema.sh`:
   גודל מינימלי, ‏`pg_restore --list` מצליח, והרשימה מכילה את אובייקטי
   מסלול הכסף שהסקריפט כבר מגדיר (‏vouchers, ‏payments, ‏order_items,
   ‏settlement_status). קובץ שנכשל באימות לא נשמר.
2. **מוקש קובע-עיצוב: הריפו ציבורי** (נמדד:
   `gh repo view`
   מחזיר
   `"isPrivate": false`).
   ‏artifacts של ריפו ציבורי ניתנים להורדה על ידי כל אחד, ו-dump נתונים
   מכיל PII של לקוחות ואת מסלול הכסף. לכן הצפנה סימטרית של הקובץ עוד על
   ה-runner
   (‏`openssl enc -aes-256-cbc -pbkdf2` עם secret חדש
   `BACKUP_PASSPHRASE`)
   היא חובה, ו-upload-artifact מקבל **אך ורק** את הקובץ המוצפן, עם
   retention של 14 יום. ה-dump הגלוי לא עוזב את ה-runner.
3. שני ה-secrets נוצרים בלוח GitHub ביד (סיסמת ה-DB אינה בידי סוכן),
   ולכן זהו צעד ידני מתועד. עד שהם קיימים ה-workflow **נכשל בקול** עם
   הודעה שנוקבת בשם ה-secret החסר, לא מדלג בשקט, ושולח התראת כשל
   ל-ntfy באותה תבנית שכבר קיימת ב-
   `nightly-health.yml`
   (‏topic דרך
   `vars.CRON_NTFY_TOPIC`
   עם fallback ל-`kenyon-ofir-limit`).
4. **מוקש מדוד:** ‏workflows מתוזמנים רצים רק מה-default branch (מתועד
   בהערת הראש של
   `production-smoke.yml`
   ובמשימה 7 סעיף 4). לתעד בראש הקובץ, לא לעקוף.
5. עדכון
   `docs/ARCHITECTURE-BACKUP-DR.md`:
   סעיף "מה ממומש" עם נוהל השחזור המלא (פקודת הפענוח ופקודת
   `pg_restore`),
   והצעדים הידניים בלוח. תרגיל שחזור אמיתי אל DB זמני מתועד שם
   כ-follow-up ידני; הסוכן לא מריץ שחזור, בהתאם למצבי העצירה של
   CLAUDE.md.

**הגדרת סיום:** ‏`db-backup.yml` קיים עם schedule ו-dispatch; ה-dump
מאומת ומוצפן לפני העלאה ואף קובץ גלוי לא עולה כ-artifact; היעדר secret
מפיל את הריצה עם הודעה מפורשת והתראת ntfy; נוהל השחזור מתועד
ב-`docs/ARCHITECTURE-BACKUP-DR.md`; טסטים ירוקים
(`pnpm test`, `pnpm type-check`, `pnpm lint`).

## משימה 9: שער אימות ה-cutover של הדומיין והסבת הניטור אל kenyonexpress.co.il

**סטטוס:** פתוח.

**מקור:** ‏STATE.md (שלב 99: הכל סגור, מחכים להפניית ה-DNS, שהיא צעד
ידני מאושר בלבד) ו-`docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md` סעיפים 1
ו-2.2. לא טבלת INFRA-AUDIT.md, שכבר מכוסה במשימות 1 עד 4.

**הבעיה (נמדד 03.09):**

1. שורות שער הדומיין בצ'קליסט (‏DOM1 עד DOM4, ‏SSL3, ‏SSL8, ‏VCL6,
   ‏VCL7) קיימות רק כפקודות `dig` ו-`curl` להרצה ידנית, ועמודת הסימון
   שלהן ריקה. אין אף סקריפט ב-`scripts/` שבודק DNS (‏grep על
   `dig`/`resolveDns`/`dns`: אפס פגיעות), ומצב האוטונומיה של CLAUDE.md
   קובע שאין מי שיריץ אותן ביד: בדיקות `dig` הן חלק מה-goals במפורש.
2. אחרי ה-cutover כל הניטור ממשיך לכוון אל המארח הישן:
   `production-smoke.yml`
   קורא את `vars.PRODUCTION_URL` עם fallback קשיח ל-
   `https://kenyonexpress.vercel.app`
   (הודעת ה-notice שלו עצמה מודה בסיכון של "stale host"), ו-`cron.yml`
   קורא את `vars.CRON_BASE_URL`. המארח ב-vercel.app ימשיך לענות 200
   לנצח גם אם ה-cutover של co.il שבור, ולכן cutover כושל בלתי נראה לכל
   מנגנון קיים: ‏smoke ירוק, ‏cron ירוק, ‏nightly ירוק.
3. רדיוס הפגיעה הוא מסלול הכסף: ‏DOM8 (כתובות Success/Fail/Webhook של
   Cardcom) ו-DOM5 (‏redirect allowlist של Supabase Auth) הם צעדי לוח
   במערכות אחרות. שום דבר בריפו לא יכול לבצע אותם, אבל גם שום דבר לא
   מאמת אותם.

**הפתרון:**

1. סקריפט חדש
   `scripts/verify-cutover.mjs`
   לפי תבנית סקריפטי ה-mjs הקיימים (‏`compare.mjs`, ‏`sentry-verify.mjs`):
   ‏`node:dns/promises` ו-fetch, בלי תלות חדשה. הבדיקות, לפי סדר: רזולוציית
   apex ו-www; ‏redirect ‏301/308 מ-http ל-https; ‏TLS תקין בשני המארחים;
   ‏`/` עונה 200; ‏`/api/health` עונה 200 עם `database: ok`; וזהות: התשובה
   מ-co.il נושאת כותרת `x-vercel-id` וגוף ה-health שלה תואם את זה של
   ‏kenyonexpress.vercel.app. אימות לפי התנהגות ולא לפי IP קשיח, כי כתובות
   ה-anycast של Vercel שלהם לשנות, והצ'קליסט עצמו כותב "לפי UI Domains".
2. שלושה מצבי יציאה נקובים, לא הצלחה/כישלון בינארי: ‏0 = הופנה ותקין;
   ‏2 = טרם הופנה (‏NXDOMAIN או רזולוציה שלא אל Vercel, המצב הצפוי היום,
   וההודעה אומרת זאת); ‏1 = הופנה אבל שבור (רזולוציה אל Vercel אך TLS,
   ‏200 או הזהות נכשלים, וזה המצב שמתריעים עליו). שער בינארי היה הופך
   את התקופה שלפני ה-cutover לקיר אדום שמאלף את כולם להתעלם מהסקריפט.
3. **מוקש מדוד: propagation הוא יחסי ל-resolver.** ‏runner של GitHub
   פותר דרך ה-resolvers של ה-DC שלו, ו-TTL ישן (שורת DOM4 בצ'קליסט)
   משאיר caches מקומיים מאחור. הפלט נוקב באיזה resolver נעשתה הבדיקה,
   ו"הופנה" הוא היגד על אותו resolver בלבד, לא אמת גלובלית.
4. צעד ב-
   `production-smoke.yml`
   (שכבר רץ יומית מול פרודקשן): כאשר `vars.PRODUCTION_URL` מוגדר על
   co.il, מצב יציאה 1 מפיל את הריצה דרך מנגנון ה-issue הקיים; כל עוד
   המשתנה לא הוגדר, הסקריפט רץ במצב דיווח בלבד ומדפיס את מצב 2 בלי
   להיכשל. המוקש הקבוע בתוקף: ‏workflows מתוזמנים רצים רק מ-main
   (מתועד בהערת הראש של אותו קובץ). לתעד, לא לעקוף.
5. תיעוד: שורות DOM1 עד SSL8 בצ'קליסט מקבלות הפניה לסקריפט במקום
   פקודות להעתקה ידנית, ו-`docs/DEPLOYMENT.md` מקבל את רשימת ההסבה
   ליום שאחרי: החלפת `vars.PRODUCTION_URL` ו-`vars.CRON_BASE_URL` בלוח
   GitHub, ‏`NEXT_PUBLIC_APP_URL` בסביבת Vercel, ‏DOM5 ו-DOM8 בלוחות
   Supabase ו-Cardcom. כל צעדי הלוח ידניים בהגדרה, והפניית ה-DNS עצמה
   נשארת ידנית לפי CLAUDE.md: הסקריפט מאמת בלבד ולעולם לא משנה DNS.

**הגדרת סיום:** ‏`verify-cutover.mjs` קיים עם שלושת מצבי היציאה והודעה
נקובה לכל בדיקה; הרצה היום מחזירה מצב 2 עם הודעת "טרם הופנה" מפורשת;
צעד ה-smoke קיים וממותג על המשתנה; הצ'קליסט ו-`docs/DEPLOYMENT.md`
מפנים לסקריפט; טסטים ירוקים
(`pnpm test`, `pnpm type-check`, `pnpm lint`).

## משימה 10: שער דליפת סודות אל ה-client bundle (סריקת הארטיפקט הבנוי)

**סטטוס:** פתוח.

**מקור:** ‏`docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md` סעיף 3, שורות ENV14
ו-ENV15, וסעיף התחזוקה של CLAUDE.md שמונה "סריקת סודות" כחלק
מה-goals (אין מי שיריץ אותה ביד). לא טבלת INFRA-AUDIT.md, שכבר מכוסה
במשימות 1 עד 4.

**הבעיה (נמדד 03.09):**

1. בלוק "בדיקת דליפה" בסעיף 3 של הצ'קליסט הוא שורת הערה ריקה: כותרת
   "אין service role / Cardcom password ב-client bundle" בלי אף פקודה
   מתחתיה, ושורות ENV14 ו-ENV15 בלי עמודת סימון. אף סקריפט לא סורק את
   הארטיפקט הבנוי:
   `scripts/bundle-gate.mjs`
   קורא את `.next` אבל מודד גודל gzip בלבד (הערת הראש שלו), ו-grep על
   ‏leak/secret-scan ב-`scripts/` מחזיר אפס פגיעות.
2. השומר הקיים ב-
   `src/lib/env.ts`
   (שורות 99 עד 107) חוסם לפי צורת שם בלבד: משתנה `NEXT_PUBLIC_` ששמו
   מכיל SECRET, ‏PASSWORD וכדומה מפיל את ה-boot. הוא לא רואה ערך סוד
   שהגיע ל-chunk ציבורי במסלול אחר: literal שהודבק בקומפוננטת client,
   או אובייקט env שסודר (serialized) לתוך props. והוא רץ ב-boot, אחרי
   הדיפלוי, לא כשער על הבילד לפני שהוא נשלח.
3. רדיוס הפגיעה: ‏`SUPABASE_SECRET_KEY` ב-chunk ציבורי הוא עקיפת RLS
   מלאה לכל גולש; ‏`CARDCOM_API_PASSWORD` הוא מסלול הכסף. ‏chunks של
   ‏`.next/static/` מוגשים לכל דפדפן בהגדרה, כך שדליפה אחת היא ציבורית
   מיידית.

**הפתרון:**

1. סקריפט חדש
   `scripts/secret-leak-gate.mjs`
   לפי תבנית
   `scripts/bundle-gate.mjs`
   הקיימת: לא בונה בעצמו אלא קורא את תוצר ה-`pnpm build` האחרון, ויוצא
   במצב 2 עם הודעה מפורשת כש-`.next` חסר. רשימת המועמדים נגזרת מה-env
   בזמן הריצה: כל משתנה ששמו תואם
   ‏SECRET, ‏PASSWORD, ‏SERVICE_ROLE, ‏PRIVATE_KEY, ‏API_KEY או TOKEN,
   אינו מתחיל ב-`NEXT_PUBLIC_`, וערכו באורך 8 תווים ומעלה (ערכים
   קצרים כמו "true" מייצרים false positives). הסריקה עוברת על קובצי
   הטקסט תחת
   `.next/static/`
   בלבד, והדיווח נוקב בשם המשתנה בלבד. הערך עצמו לעולם לא מודפס.
2. **מוקש מדוד שקובע את מקור הרשימה:** גזירת שמות מ-grep על הקוד
   מחטיאה: ‏audit קודם מצא 96 מתוך 129 משתנים, כי
   `loadCardcomEnv`
   ודומיו קוראים `env.X` מתוך `ProcessEnv` שמועבר כפרמטר. לכן הרשימה
   נגזרת ממפתחות `process.env` בזמן הסריקה, לא מסריקת מקור.
3. **מוקש תיחום:** סריקת
   `.next/server/`
   הייתה מסמנת כל סוד שרת לגיטימי; גבול ה-client הוא
   `.next/static/`.
   בנוסף לערכים נסרקים גם **שמות** ששת סודות ה-P0 מהצ'קליסט
   ‏(ENV2, ‏ENV3, ‏ENV5, ‏ENV6 וחבריהם): שם שמופיע ב-chunk ציבורי הוא
   סימן לאובייקט env שסודר בשלמותו, שנושא שמות לצד ערכים. ‏payload של
   ‏RSC בזמן ריצה הוא מחוץ לתחום של שער בילד, וההודעה של הסקריפט
   אומרת זאת במפורש.
4. **מוקש כנות של השער:** הסקריפט מוכיח דליפה רק של ערכים שקיימים
   ב-env של הבילד הנסרק. ריצת CI עם env חלקי מוכיחה בעיקר את המנגנון
   ואת סריקת השמות; הריצה המחייבת היא על בילד עם env בצורת פרודקשן,
   וזה נכתב גם בפלט וגם בצ'קליסט.
5. חיווט: ‏script ב-`package.json`, וצעד ב-
   `.github/workflows/ci.yml`
   מיד אחרי צעד ה-`pnpm build` הקיים (job ה-build שם), באותה ריצה כדי
   לא לבנות פעמיים (המוקש הקבוע: בילדים מקבילים דורסים זה את זה).
6. תיעוד: בלוק הפקודה הריק בסעיף 3 של הצ'קליסט מקבל את הפקודה בפועל,
   ‏ENV14 מפנה לשומר ב-`src/lib/env.ts` ולשער הזה, ו-ENV15 (השוואת לוח
   ‏Vercel מול הסעיף) נשאר ידני במוצהר ומתועד ככזה.
7. טסטים על fixture, בלי סודות אמיתיים: תיקיית `.next/static` מזויפת
   עם ערך שתול יוצאת במצב 1 ונוקבת בשם המשתנה; ‏fixture נקי יוצא
   במצב 0; היעדר התיקייה יוצא במצב 2.

**הגדרת סיום:** ‏`secret-leak-gate.mjs` קיים עם שלושת מצבי היציאה;
הרצה היום אחרי `pnpm build` מקומי מחזירה 0; טסט ה-fixture מוכיח את
המסלול האדום; הצעד קיים ב-`ci.yml` אחרי הבילד; סעיף 3 בצ'קליסט מפנה
לסקריפט במקום בלוק ההערה הריק; טסטים ירוקים
(`pnpm test`, `pnpm type-check`, `pnpm lint`).
