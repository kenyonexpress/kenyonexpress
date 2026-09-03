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
