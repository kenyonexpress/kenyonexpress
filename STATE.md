RESUME FROM: M09-c113
Updated: 2026-10-19 (סשן אחר, `kenyonexpress-c5`, לפי הוראה מפורשת של אופיר בצ'אט, לא לולאת האוטופיילוט של `audit/final-audit`; פריט M08-c113 DONE: ח.פ 033798513 בשורת המוכר, PR #89 ממתין למיזוג אופיר)

## המשך מ:

**S24 - DONE (04.11.2026): אבטחה.** נמדד קודם. שלושה מתוך ארבעה כבר היו קיימים. **rate limits:** ‏auth, ‏checkout ו-redeem כולם עוברים ב-limiter אחד (Upstash, אחריו Postgres, אחריו open). **פער:** ב-Vercel production אין `UPSTASH_REDIS_REST_*`, ולכן פרודקשן מגביל דרך ה-fallback של Postgres. ‏**CSP ו-HSTS** חיים (נמדד ב-curl). טסט חדש מקבע HSTS ו-CSP בכל entry של `headers()`. **gitleaks:** ‏`security.yml` היה YAML לא תקין מאז 22.09 (`workflow_dispatch` כפול), ולכן gitleaks וה-audit לא רצו שישה שבועות. תוקן, ושני ה-jobs ירוקים ב-CI על `6a4c1b1a1`. 76 ממצאים בהיסטוריה מוינו ל-`.gitleaksignore`. **שבעה הם סודות אמיתיים בריפו ציבורי:** ‏3×CRON_SECRET (אחד שווה ל-`.env.local`), ‏VOUCHER_QR_SECRET, סיסמת ה-protection של Vercel, ה-OLD_SECRET שלה, וקטע מ-VERCEL_API_TOKEN. **ה-audit שחזר לרוץ מצא את next 16.3.7 עם 2 קריטיים.** שודרג ל-16.4.5, יחד עם node-forge, ‏dompurify ו-source-map-js. ל-zod יש תיקון רק ב-v4, ולכן הוא מאושר עד 31.12.2026 ב-`ACCEPTED` שפג מעצמו. **RLS smoke חדש** (`scripts/rls-smoke.mjs`): ‏anon ושלושה לקוחות לא קוראים אף שורה של משתמש אחר ב-orders/vouchers/wallet, ולא כותבים כלום. בקרת service-role רואה 1032 הזמנות של אחרים. build 0, ‏tsc 0, ‏lint 0, ‏vitest ‏682/683, ‏8121 טסטים. שער ההקפאה: רק קבצים חדשים. הוכחה: `docs/S24-security.md`.
**החלטה שהתקבלה לבד:** הסודות הדולפים לא הוחלפו ולא נוספו ל-`compromised-keys.mjs`. ‏CRON_SECRET משותף עם ה-vault של pg_cron, ו-VOUCHER_QR_SECRET חותם קופונים שכבר הונפקו. החלפה חד-צדדית שוברת את שניהם, והוספה לרשימה הייתה חוסמת כל פריסה. הם רשומים בחוסם 17. next 16.4.5 לא נפרס: פרודקשן ב-MAINTENANCE_MODE והפריסה היא צעד נפרד.
**הבא: S25** מתור ה-S.

**S23 - DONE (04.11.2026): ארנק וקאשבק.** נמדד מול פרודקשן: הספר כבר באגורות (`wallet_entries.amount_ils_agorot` עמודה מחושבת, 1352 שורות, 0 שברי אגורה), ו-`cashback_percent` הוא NOT NULL DEFAULT 0. **באג שתוקן:** הקופה והעגלה התעלמו מ-`products.cashback_enabled`, ולכן 3 מוצרים פעילים עם מתג כבוי ו-5% שילמו 5% קאשבק בכל רכישה. `effectiveCashbackPercent` החדש (`src/lib/cashback/product.ts`) מזין עכשיו את הקופה, את העגלה ואת שמירת האדמין, שגוזרת את המתג מהאחוז. שום שורה לא שונתה. מיגרציה 260 **הוחלה** אחרי BEGIN/ROLLBACK: ‏`v_wallet_ledger` קיבל `amount_agorot`/`signed_amount_agorot`, וההרשאות של anon ושל הכתיבה הוסרו. ‏`getWalletLedger` קורא אגורות, ונופל לשקלים רק ב-42703. ל-hook של תשלום שותף לארנק (`pay.ts`) נכתבו טסטים ראשונים. **נמצא ולא תוקן:** בפרודקשן אין טבלת `affiliates`. היא נמחקה מחוץ להיסטוריית המיגרציות, ולכן אי אפשר לשלם עמלה. ה-finalize לא נפגע. vitest ‏680/681, ‏8101 טסטים, tsc 0, lint 0, build 0. שער ההקפאה: רק קבצים חדשים. הוכחה: `docs/S23-wallet.md`.
**החלטה שהתקבלה לבד:** תוכנית השותפים לא נבנתה מחדש בתוך S23. צריך להקים מחדש טבלה שנמחקה בלי תיעוד, עם enum ו-policy של עדכון עצמי, ו-244 לא תוחל כמו שהיא כתובה, כי היא מתנגשת עם `affiliate_campaigns` במבנה של 283. זו החלטה ברמת התוכנית ולא ברמת ה-hook. שלוש השורות עם `false / 5.00` נשארו כמו שהן ומשלמות 0, כמו שהמתג שלהן אומר.
**הבא: S24** מתור ה-S.

**S20 - DONE (04.11.2026): תזכורות תפוגה.** ‏`/api/cron/expiry` חדש: ‏`?days=7` או `?days=1` מכניס את הדלי שלו לתור דרך `enqueue_expiring_voucher_notices`, ומיד מרוקן את ה-outbox באותה קריאה. push כברירת מחדל, מייל רק ללקוח שהדליק אותו (מתג חדש ב-`/account/notifications`, כבוי כברירת מחדל), והפעמון באתר. מיגרציה 258 **הוחלה**: ‏`ke-expiry-t7` ‏(23:20 UTC) ו-`ke-expiry-t1` ‏(23:25 UTC) כ-GET דרך ה-vault, ‏`APP_BASE_URL` הוחלף מה-apex ל-www, והמשימה המתה `push-expiry-reminders` הוסרה. קריאה ידנית באותה צורה ל-`/api/cron/health` החזירה 503 עם גוף ה-health, ולכן ה-bearer מה-vault תואם ל-Vercel. ‏`/api/cron/expiry` מחזיר 404 עד הפריסה. **נמצא:** 162 כן הוחלה, וכל 12 המשימות שלה הן POST ועונות 405 (‏258 שורות ב-`net._http_response`). ה-drain וה-sweep מעולם לא רצו. vitest ‏670/671, ‏8017 טסטים, tsc 0, השערים 0. שער ההקפאה: רק קבצים חדשים. הוכחה: `docs/S20-expiry.md`.
**החלטה שהתקבלה לבד:** תזכורת במייל היא opt-in, כי לפי S12 אישור הרכישה הוא המייל האוטומטי היחיד. "מייל לפי העדפה" מתקיים כשהמתג של הלקוח הוא הדבר היחיד ששולח אותו. 12 משימות ה-POST לא תוקנו, כי זה מחוץ ל-S20 ודורש מיגרציה משלו.
**הבא: S21** מתור ה-S.

**S19 - DONE (04.11.2026): כניסה.** נמדד מול פרודקשן: סיסמה מחזירה session (200) למשתמש ה-E2E, ו-Google מפנה ב-302 ל-accounts.google.com עם client id אמיתי. **ספק הטלפון ב-Supabase כבוי**, ולכן קוד WhatsApp לא יכול לעבור דרכו. נבנה קוד שש-ספרתי משלנו: challenge חתום ב-HMAC בעוגיית httpOnly, בלי טבלה ובלי מיגרציה, שנשלח כתבנית authentication דרך Meta Cloud API. אחרי אימות, החשבון שמחזיק את המספר ב-`profiles` נפתח באמצעות magic-link token שמונפק בשרת. כשאחד משלושת משתני ה-env חסר, אותו טופס עובר לקוד באימייל, וכך זה עובד בפרודקשן היום. Passkey נרשם עכשיו במקום, בדף החזרה של הקנייה הראשונה, ו-`hasPasskeys` מועבר לבאנר. vitest ‏667/668 (1 skipped), ‏7993 טסטים, tsc 0, biome ו-12 השערים 0 על העץ המנוהל. שער ההקפאה: רק קבצים חדשים. הוכחה: `docs/S19-auth.md`.
**החלטה שהתקבלה לבד:** מספר טלפון לא יוצר חשבון, כי משתמש Supabase צריך אימייל כדי לקבל את ה-token. מספר בלי חשבון, או מספר שרשום ביותר מחשבון אחד, מופנה לכניסה באימייל. נוספה מדיניות `otp-verify-email` (5 בשעה לכתובת). README עודכן ל-301 מסמכים.
**הבא: S20** מתור ה-S.

**S18 - DONE (04.11.2026): דפים משפטיים.** ארבעת הנתיבים קיימים: ‏`/terms`, ‏`/privacy` ו-`/returns` מפנים ב-308 לדפים הקנוניים, ו-`/accessibility` הוא דף. גיל 18, סעיף 14ג (14 יום, שני ימים שאינם ימי מנוחה, דמי ביטול min(5%, ₪100)) וסמכות שיפוט בתל אביב כבר היו בתוכן. **חסר היה רק ח.פ 033798513.** הוא נוסף לתקנון, למדיניות העוגיות ולבלוק יצירת הקשר בכל הדפים המשפטיים, כתוכן בלבד. טסט חדש נועל את ארבעת הסעיפים. vitest ‏245/246, tsc 0, lint נקי מחוץ ל-`.lighthouseci/`. הוכחה: `docs/S18-legal.md`.
**החלטה שהתקבלה לבד:** הנוסח הוא "עוסק מורשה, ח.פ 033798513". כך הוא תואם לחוק הבעלים וגם שומר את הצורה המשפטית. שומר הטלפונים בטסט קרא את המספר כ-03-379-8513, ולכן הוחרגה רק המחרוזת המדויקת.
**הבא: S19** מתור ה-S.

**S17 - DONE (04.11.2026): הצטרפות ספקים.** ‏`/supplier/apply` חדש ב-`(supplier-public)`, ומשתמש בויזארד הקיים (קפוא, יובא ולא נערך) עם הסכם הספק כ-click-wrap. כל הסכמה נרשמת ב-`agreement_acceptances`: גרסה, SHA-256 שמחושב בשרת, זמן מה-DB, IP ו-user agent. הטבלה append-only בטריגר, גם ל-service_role. נוסף hook לאימות כרטיס ב-₪1: חיוב של 100 אגורות וביטול באותו יום (`src/lib/suppliers/card-verification.ts`), ב-sandbox בלבד. ‏`cardCheckAvailable` מסרב גם ל-sandbox שאליו פרודקשן נופל. מיגרציה 257 **הוחלה**, וה-append-only הוכח בבלוק שבוטל. **נמצא:** ‏`supplier_card_verifications` כבר תפוסה בפרודקשן בטבלה ישנה (0 שורות, אין כותב), וההחלה הראשונה נכשלה ב-42703 והתגלגלה אחורה. הטבלה החדשה היא `supplier_application_card_checks`. עוגיית ה-Turnstile עברה ל-path ‏`/`, כדי שהשער לא ייכנס ללולאה ב-`/supplier/apply`. vitest ‏662/663 (1 skipped), tsc 0, שערי ה-lint 0 על העץ המנוהל. שער ההקפאה: רק קבצים חדשים. הוכחה: `docs/S17-supplier.md`.
**החלטה שהתקבלה לבד:** אימות ₪1 מול המסוף האמיתי לא נכתב, כי הוא דורש סבב דרך הדף המתארח של Cardcom, ואין credentials בשום סביבה. מול כל ספק שאינו mock ה-hook מחזיר unavailable. הטבלה הישנה לא נמחקה. README תוקן ל-299 מסמכים (הספירה פיגרה מאז S16).
**הבא: S18** מתור ה-S.

**S16 - DONE (04.11.2026): העלאת מוצרים באדמין.** ‏`/admin/products/new` כבר כלל סוג (קופון או פיזי), ‏`platform_percent`, תוקף 30/60/90, דמי משלוח, חלון ביטול ותמונות דרך צינור S04, ולא נבנה מחדש. ה-CSV ב-`/admin/products/import` קיבל שלוש עמודות: דמי משלוח (באגורות דרך money.ts), חלון ביטול (רצפה של 14) וקישורי תמונות (מופרדים ב-|, עד 8, כל אחד עובר את רשימת ה-hosts). עד עכשיו הייבוא כתב תמונות ריקות תמיד. **נמצא:** בפרודקשן לא הייתה `refund_policy`, ולכן כל שמירה עם דמי משלוח או חלון ביטול נדחתה עם הודעת 243. מיגרציה 256 **הוחלה**: העמודה, CHECK של `payout_cadence` כולל per_order, ורצפה של 14 יום. הוכחה בכתיבות שבוטלו. vitest ‏660/660, ‏7929 עברו, 22 טסטים חדשים, tsc 0, שערי ה-lint 0 על העץ המנוהל. שער ההקפאה נקי. הוכחה: `docs/S16-admin-upload.md`.
**החלטה שהתקבלה לבד:** כתבתי 256 במקום להחיל את 243, כי ה-CHECK של 243 היה נחתך עם ה-CHECK החי ומפיל את biweekly. **אין להחיל את 243 על פרודקשן.** עמודת התמונות ב-CSV מקבלת רק קישורים שכבר מתארחים. העלאת קבצים בכמות נשארת במסך `/admin/products/images`.
**הבא: S17** מתור ה-S.

**S15 - DONE (04.11.2026): מימוש קופון אצל שותף.** ‏`/partner/redeem` לחבר פעיל ב-`supplier_members`: סריקת QR או הקלדת ‏`partner_pin` בן 8 ספרות. ה-pin מתורגם לקוד רק בתוך העסקים של המשתמש. מפתח idempotency חובה, וניסיון חוזר מחזיר את התשובה הראשונה. כל ניסיון נרשם ב-`vouchers_redemption_events`, ומימוש כפול נחסם ב-RPC. **נמצא:** ‏`redeem_voucher_locked` החי לא רץ אף פעם (העביר inet לפרמטר text ונכשל ב-42883), ולכן הטבלה הייתה ריקה. מיגרציה 255 תיקנה אותו, **הוחלה**, והוכחה כחבר אמיתי בבלוק שבוטל: success, אחריו replay, אחריו already_redeemed, ושלוש שורות אירוע. בדרך הוסר אירוע `voucher_redeemed` כפול במסלול הספק. vitest ‏658/658, ‏7907 עברו, tsc 0, build 0, שערי ה-lint 0 על העץ המנוהל (‏`.lighthouseci/` הלא-מנוהל מפיל את biome ולא נמחק). שער הקפאה נקי. הוכחה: `docs/S15-redeem.md`.
**החלטה שהתקבלה לבד:** "שותף קופון" הוא חבר פעיל ב-`supplier_members` בכל תפקיד, ולא תפקיד חדש ב-`user_role`. תרגום ה-pin נעשה באפליקציה ולא ב-SQL. ה-push דרך SSH נדחה (publickey) ועבר ב-HTTPS עם ה-credential של gh.
**הבא: S16** מתור ה-S.

**S14 - DONE (04.11.2026): העברת קופון.** העברה למייל, איסוף על ידי המקבל והסטטוס `transferred` כבר היו קיימים מ-S10 (מיגרציה 254 הוחלה): שורת השולח עוברת ל-transferred, והמקבל מקבל שורה חדשה עם קוד, QR ו-pin חדשים. נסגרו שני פערים. (1) "למייל אחר" לא נאכף: אפשר היה לשלוח לכתובת של עצמך. עכשיו מוחזר `SELF`. (2) שולח שפתח את הקישור של עצמו היה "אוסף" אותו, מקבל שורה חדשה לעצמו ושורף את הקישור של המקבל. עכשיו מוחזר `OWN_GIFT` בלי RPC. בדיקה לקריאה בלבד מול פרודקשן: ה-enum וה-RPC חיים, ורק service_role יכול להריץ את ה-RPC. vitest ‏655/655, ‏7883 עברו, 5 טסטים חדשים, tsc 0, שערי ה-lint 0. אין מיגרציה ואף רכיב לא נגע. הוכחה: `docs/S14-transfer.md`.
**החלטה שהתקבלה לבד:** קישור האיסוף נשאר bearer token ולא נקשר לכתובת המקבל, כי המקבל עשוי להתחבר עם כתובת אחרת מזו שהשולח מכיר. הקישור נשלח רק לכתובת שהוקלדה, נשמר כ-hash, והשולח יכול לבטל אותו עד שהוא נאסף.
**הבא: S15** מתור ה-S.

**S13 - DONE (04.11.2026): ביטול והחזר.** הבקשה של הלקוח, חישוב דמי הביטול באגורות, שורת `refunds` וקריאת ה-refund במתאם כבר היו קיימים. הפער: `refundOrder`, שמזיז את הכסף, לא בדק את סעיף 14ג בכלל, וגם החזר ביום 40 עבר כביטול סטטוטורי עם דמי ביטול. עכשיו ביטול מרצון עובר דרך `decideCancellation14g` (‏14 יום מהתשלום ואף שובר לא מומש), ומחוץ לתנאים מוחזר POLICY_REFUSED בלי לקרוא לספק. טענת פגם לא כפופה לחלון ונגבים עליה 0 דמי ביטול. נוספה עקיפת מנהל (`override`): החזר מלא בכל מועד, בלי דמי ביטול, `ground=goodwill`, עם תיבה במסך ההזמנה באדמין. ‏`refunds.decided_by` נרשם עכשיו, ובקשה ממתינה ב-`refund_requests` נסגרת כ-approved עם תשלום ההחזר. ‏`refund.sandbox.test.ts` מריץ את `getPaymentProvider` האמיתי במצב sandbox. vitest ‏655/655, ‏7878 עברו, ‏13 טסטים חדשים, tsc 0, biome 0 על כל הקבצים המעוקבים, כל השערים 0. אין מיגרציה. הוכחה: `docs/S13-cancel.md`.
**החלטה שהתקבלה לבד:** הלקוח לא מזיז כסף בעצמו, ומפעיל מבצע את ההחזר. העקיפה לא מגיעה לשובר שמומש או שפג, וזה נשאר MANUAL_RESOLUTION, כי "בכל מועד" פירושו כל תאריך ולא כל מצב. Sandbox פירושו המתאם המדומה, כי אין בשום סביבה פרטי Cardcom, והקריאה ל-terminal חי חסומה ב-#41.

**S12 - DONE (04.11.2026): מייל אישור רכישה.** המייל בן שש השורות כבר היה קיים מ-Q09: הוא יוצא מה-outbox כ-`order_paid` או `voucher_issued`, אחד לכל רכישה, וכבר כלל ח.פ 033798513. תוקנו שלושה פערים. (1) "המייל האוטומטי היחיד" לא התקיים: `voucher_expiring` נשלח במייל, ו-cron העגלה הנטושה שלח מייל ישיר. עכשיו יש מקור אחד, `src/lib/email/automatic-email-policy.ts`, ושניהם כבויים במייל. (2) שורת הביטול לא כללה את התנאים "לא מומש" ו"לא בתוך 2 ימי עסקים לפני שירות מוזמן". (3) הסכומים הוצגו עם אגורות, ועכשיו הם בשקלים שלמים. שליחה חיה במצב בדיקה של Resend ל-`delivered@resend.dev` התקבלה, id ‏`01a1a5e2-…`. vitest ‏654/654, ‏7864 עברו, tsc 0, כל השערים 0. biome נכשל רק על `.lighthouseci/` הלא-מעוקב. הוכחה: `docs/S12-email.md`.
**החלטה שהתקבלה לבד:** "אוטומטי" פירושו שהמערכת החליטה לשלוח (טריגר, cron או sweep). מתנה שהקונה שלח, איפוס סיסמה ו-magic link נשארו, כי אדם ביקש אותם. תזכורת התפוגה ממשיכה ב-push וב-in-app. קוד העגלה הנטושה נשאר, חסום בשער.

**S11 - DONE (04.11.2026): דף ההזמנה.** QR, תוקף, Waze וכפתור העברה כבר היו בדף. נוספו: החלטת ביטול טהורה לפי סעיף 14ג (`decideCancellation14g`: ‏14 יום מהתשלום, אף שובר לא מומש, לא פחות מ-2 ימי עסקים לפני שירות מוזמן, דמי ביטול min(5%, ₪100) באגורות), שורת ביטול עם מועד אחרון ודמי ביטול וכפתור שקופץ לטופס, אכיפה בשרת ב-`requestRefund` לסיבה `changed_mind`, ה-pin בן 8 הספרות, כתובת בית העסק ושורת placeholder לחשבונית. אף רכיב לא נגע, ושער ההקפאה מראה רק את שני קבצי turnstile החדשים. vitest ‏654/654, ‏7861 עברו, 22 טסטים חדשים, tsc 0, כל השערים 0. הוכחה: `docs/S11-order.md`.
**החלטה שהתקבלה לבד:** רק `changed_mind` כפוף ל-14ג, כי טענות פגם (לא הגיע, פגום, חיוב כפול) אינן ביטול מרצון וחייבות להישאר פתוחות אחרי 14 יום. בסכימה אין מועד שירות מוזמן, לכן `bookedServiceAt` מועבר כ-null בשני המקומות עד שיהיה. חגים לא ממודלים.
**הבא: S12** מתור ה-S.

**S10 - DONE (04.11.2026): שוברים על הזמנת קופון ששולמה.** ההנפקה כבר הייתה מחוברת ב-finalize (QR חתום, ‏`expires_at`, תקרת replay). הפערים שתוקנו: (1) תוקף 30/60/90, ברירת מחדל 90. הכלל הישן C7 סירב להנפיק כשהתוקף NULL, וזה היה המצב ב-88 מתוך 126 מוצרים. עכשיו NULL = ‏90, ומיגרציה 254 מגדירה DEFAULT 90 ו-CHECK. ‏(2) הקוד בן 8 הספרות הוא `partner_pin`. העמודה, האינדקס והטריגר היו חיים בפרודקשן ולא בריפו, ונכתבו לתוכו. המנפיק מייצר את ה-pin בעצמו. ‏(3) נוסף הסטטוס `transferred`: קבלת מתנה מעבירה את שורת הקונה ל-transferred ומנפיקה למקבל שורה חדשה עם קוד, QR ו-pin חדשים, דרך RPC של service_role בטרנזקציה אחת. בלי זה הקונה יכול היה לממש את ה-QR מהמייל אחרי שהמקבל קיבל את המתנה. 254 הוחלה והוכחה ב-BEGIN/ROLLBACK על פרודקשן. vitest 653/653, ‏7839 עברו, 21 טסטים חדשים, tsc 0, כל השערים 0. הוכחה: `docs/S10-vouchers.md`.
**החלטה שהתקבלה לבד:** 254 הגדירה בהתחלה NOT NULL על `coupon_expiry_days`. זה היה שובר כל שמירה של מוצר פיזי, כי מוצר פיזי כותב NULL, ולכן זה בוטל תוך דקות. העמודה nullable, ו-NULL בקופון נקרא כ-90. ה-pin עוד לא מוצג במסכי החשבון והאדמין, כי הם קפואים או בתור ה-V.
**הבא: S11** מתור ה-S.

**S08 - DONE (04.11.2026): מתאם התשלומים.** נוסף `src/server/payments/adapter.ts` שעוטף את מה שכבר קיים (ספק Cardcom/mock, יומן ה-webhook, מכונת המצבים, finalize) ולא מחליף אותו: `resolvePaymentMode` מחזיר live או sandbox מה-env ולעולם לא זורק; `createPayment` מסרב עם CHECKOUT_DISABLED לפני שהספק נקרא; `journalWebhookEvent` מחזיר new, replay או failed (ה-route משתמש בו, ו-failed עדיין עונה 503); `guardOrderTransition` מחזיר תוצאה במקום לזרוק; `planTokenization` מחליט על שמירת הכרטיס, ו-beginCheckout קורא לו. הבאג שנמצא: build של פרודקשן בלי `CARDCOM_TERMINAL_NUMBER` זרק `Missing required env`, וכל קופה וכל webhook ענו 500. עכשיו זה sandbox עם קופה סגורה ו-refusedReason גלוי. `getPaymentProvider` מסרב ל-sandbox הזה, כדי שה-cron של stranded-payments, החידוש, ה-reconcile וה-DLQ לא יאמתו ולא יחייבו מול mock שמאשר הכל. גם עותק החוק ב-CSP (`frame-policy.ts`) עודכן. tsc 0, vitest 651/651, 7788 עברו, 24 טסטים חדשים, אין מיגרציה. שער ההקפאה מראה רק את 2 קבצי S05. הוכחה: `docs/S08-payment.md`.
**החלטה שהתקבלה לבד:** "sandbox בלבד" לא פותח קופה ב-deploy שמשרת לקוחות, כי sandbox שמקבל הזמנות בדומיין האמיתי מנפיק שוברים בלי חיוב (נמדד ב-10.09). כדי לפתוח קופה צריך את ארבעת משתני Cardcom ו-`CHECKOUT_ENABLED=true`. `pnpm lint` עצמו נכשל רק על `.lighthouseci/` ו-`android/` הלא-מעוקבים, שלא נוצרו כאן. כל השערים על קוד מעוקב עוברים. README עודכן ל-290 מסמכים.
**הבא: S09** מתור ה-S.

**S04 - BLOCKED (04.11.2026): צינור העלאה ל-R2.** הקוד גמור. `src/lib/storage/r2.ts` עבר ל-`@aws-sdk/client-s3`, קורא `R2_BUCKET_NAME` (ואם הוא חסר, `R2_BUCKET`), ומעלה גרסאות AVIF+WebP דרך `uploadImageVariants`. נוספה פעולת אדמין חדשה, `uploadImageToR2` (`src/server/actions/admin/r2-upload.ts`). 11 טסטים עם client ממוקק. tsc 0, vitest 641/641. הוכחה: `docs/S04-r2.md`.
**חסום:** ה-smoke לא רץ. (1) מפתחות R2 קיימים רק כ-Secret ב-Vercel, ו-env pull מחזיר `[SENSITIVE]`. בעותק המקומי אין `R2_ACCESS_KEY_ID`. (2) `cdn.kenyonexpress.co.il` יושב ב-DNS של Vercel ומחזיר `DEPLOYMENT_NOT_FOUND`, כך שה-URL הציבורי לא יחזיר 200 גם אחרי העלאה מוצלחת. הפקודה לסגירה: `node scripts/r2-smoke.mjs --env-file=<file>`.
**החלטה שהתקבלה לבד:** לא פתחתי endpoint בפרודקשן רק בשביל ה-smoke. ב-action קראתי ל-`updateTag(CATALOGUE_TAG)` במקום להוסיף חריג רביעי למקסימום 3 של שער ה-cache. `pnpm lint` נופל על `.lighthouseci/` ו-`android/`, תיקיות untracked שלא שלי. הגייטים על הקבצים שלי נקיים.
**הבא: S05** מתור ה-S.

**S03 - DONE (04.11.2026): בדיקת env בפרודקשן.** פרויקט `kenyonexpress`: 58 מפתחות. הקוד קורא 119. כל 8 מפתחות ה-preflight מוגדרים, וגם Turnstile ו-R2. נוסף `NEXT_PUBLIC_SITE_URL=https://kenyonexpress.co.il`. סודות חסרים (Upstash, QStash, webhooks, wallet, CAPI) ברשימת HOLD. אף אחד מהם לא חוסם קופה. tsc 0, vitest 640/640. הוכחה: `docs/S03-env.md`.
**החלטה שהתקבלה לבד:** לא הוספתי `NEXT_PUBLIC_GA4_MEASUREMENT_ID`. ה-ID יושב בשם `NEXT_PUBLIC_GA_MEASUREMENT_ID`, ששום קוד לא קורא, וה-CSP חוסם את googletagmanager. צריך את שניהם יחד ב-item נפרד. בנוסף, www עונה 503 עם retry-after 300 (MAINTENANCE_MODE), ו-/api/health עונה 200.
**הבא: S04** מתור ה-S.

**S02 - DONE (04.11.2026): ענף הפרודקשן ב-Vercel הוא `closeout/v1-final`.** GET מאשר `link.productionBranch`. commit ריק `c9a3754b8` בנה git production `dpl_DhJJBn82dFLA3HMtWvEuMXPWFzZY`, READY תוך 2 דקות, משויך ל-kenyonexpress.co.il ול-www, ו-/api/health מחזיר 200. מעכשיו כל push לענף הזה הוא דיפלוי לפרודקשן. אסור `vercel --prod` עם upload. הוכחה: `docs/S02-vercel.md`.
**החלטה שהתקבלה לבד:** ה-API דחה PATCH ל-`/v9/projects` עם `link` (400). השתמשתי ב-`PATCH /v9/projects/{id}/branch` עם `{"branch":...}`, אותו endpoint כמו ב-L02. בילדי ה-preview נכשלים ב-preflight כי משתני Cardcom ו-QR מוגדרים רק ל-production. זה צפוי, ולא נגעתי בזה.
**הבא: S03** מתור ה-S.

**M08-c113 - DONE (19.10.2026): סגר חוסם 9. `purchaseConfirmation.sellerName` ב-`messages/he.json` כולל עכשיו ח.פ 033798513; אין שינוי קוד אחר.**
משימת המקור: לא `final-queue.txt` (ראו "החלטה שהתקבלה לבד" למטה) — הוראה מפורשת של אופיר בצ'אט, כולל המספר עצמו.
**החלטה שהתקבלה לבד:** `~/ke-goals/final-queue.txt` כבר לא מחזיק את תור ה-M, הוא הוחלף בחזרה לרשימת F01-F40 הישנה (40 שורות, MVP-מאפס) — אי אפשר
לקרוא "הפריט הבא" ממנו יותר. לא ניסיתי לשחזר את התור; הפריט הבא (M09-c113) צריך להגיע מרשימת "חוסמים פתוחים" כאן או מאופיר, לא מהקובץ.
עבדתי ב-worktree נקי חדש `wt-audit-final-audit` (detached על `origin/audit/final-audit`@`1e84df0e5`, לא על העץ הראשי של `closeout/v1-final`);
`refs/`, `supabase/.temp` ו-`.env.local` הועתקו מהעץ הראשי (שלושתם ב-gitignore, לא קיימים ב-worktree נקי).
**שערים**: type-check **0**; test **640/640, 7674 עברו, 12 דולגו**; `rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: **0**, אפס `Invalid API key`,
`BUILD_ID` `ftJKu0L9eG_KNHglEI0Wo`; lint: שאר השערים נקיים, docs-path-audit נכשל רק על 7 נתיבי `refs/` שלא קיימים גם בעץ הראשי (ישן, לא drift מהשינוי הזה).
**שינוי מהותי בתהליך, לא שלי:** דחיפה ישירה (`fast-forward`) ל-`origin/audit/final-audit` **נדחתה** — הענף הפך מוגן ב-GitHub (PR + אישור אדם אחד),
לא רק `main`. נפתח PR #89 מענף `fix/seller-registration-number` לבסיס `audit/final-audit`. CI על ה-PR: Typecheck ו-E2E ירוקים; `Migration dry-run`
אדום (65 קבצים ב-`migrations/pending/`, 5 hard + 99 soft, לא קשור לשינוי כאן); `Diff-scoped lint gates` אדום (אותו docs-path-audit, ~84 נתיבים —
ל-CI אין את `refs/` המקומי כלל, אז הוא רואה את הרשימה המלאה; זה יכשל על כל PR לענף הזה כרגע, לא ספציפי ל-PR הזה). Build/Bundle/Lighthouse/E2E-full
דולגו בגלל הכשלים למעלה. **אופיר ממזג בעצמו** (required_approving_review_count: 1, אין לסוכן הרשאה לעקוף).
**ממצא נוסף, לא שלי לתקן:** שלוש שרשראות ענפים חיות במקביל על הריפו הזה — `closeout/v1-final` (686 commits ש-`main` לא), `main` (256 commits עם
מיגרציות 235/240/241 שסומנו "הוחלו בפרודקשן" ש-`closeout` לא), ו-`audit/final-audit` (זה, מה שבאמת פרוס). לא בוצע מיזוג בין אף שניים מהם.

**M07-c113 - DONE (06.10.2026): סריקת TODO/FIXME/HACK/XXX ב-HEAD `6ae2b05de`: שני סמנים אמיתיים בלבד, שניהם כבר ב-`docs/BACKLOG.md` סעיף 6; אפס חדשים, אין שינוי קוד.**
משימת התור: "Scan TODO FIXME older than 7 days resolve or file in docs/BACKLOG.md". HEAD `6ae2b05de` = `origin/audit/final-audit` (אחרי `git fetch`).
העץ הראשי עדיין על `main` `3f6ca53c3` (שם אין `docs/BACKLOG.md` ו-STATE.md בן 21134 שורות); **החלטה שהתקבלה לבד:** כמו M04..M06-c113, לא נגעתי בו,
והעבודה נעשתה ב-worktree נקי חדש `/tmp/ke-m07-c113` (detached על `origin/audit/final-audit`), נדחף כ-fast-forward בלבד.
**סריקה** (`git grep -nwE "TODO|FIXME|XXX|HACK"` על כל העץ במעקב): `src/lib/payments/cardcom.ts:254` (`git blame`: 2026-07-24) ו-`:319` (2026-08-07),
שניהם `TODO(cardcom)`, ישנים משבעה ימים, ודורשים טרמינל Cardcom חי, ולכן לא ניתנים לפתרון כאן ונשארים רשומים ב-BACKLOG סעיף 6 (נוספה שורת M07-c113).
שאר ההתאמות אינן סמני עבודה: `05X-XXX-XXXX` (פורמט טלפון, 3 מקומות), `'TODO'` ב-`whatsapp.test.ts:91` (מחרוזת בדיקה), תיעוד ובדיקות של `final-audit-lib.mjs`.
`node scripts/final-audit.mjs`: **0 סמנים לא-מתועדים מתוך 2**. אין שינוי UI, ולכן `compare.mjs` לא נדרש.
**שערים** (אותו worktree, `refs/` הועתק מהעץ הראשי): type-check **0**; test **640/640, 7674 עברו, 12 דולגו**; `rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: **0, 340/340**, אפס `Invalid API key`, `BUILD_ID` `DKqbpm_dcCSltGloedjIm`;
lint: שאר השערים נקיים, docs-path-audit נכשל ב-worktree רק על `supabase/.temp` (ב-gitignore), אותו כשל תלוי סביבה כמו ב-M04..M06-c113, ולא drift.
**STATE.md:** הרשומות M03-c113..M18-c112 הועברו לראש `docs/STATE-ARCHIVE.md` כדי להישאר מתחת ל-300 שורות. הפריט הבא ב-`final-queue.txt` (קריאה בלבד) הוא M08-c113.


**M06-c113 - DONE (06.10.2026): `pnpm build` רץ על worktree נקי של HEAD `86137f52a`, exit 0, 340/340 דפים, אפס `Invalid API key`, אפס drift; אין שינוי קוד.**
משימת התור: "pnpm build fix drift commit". HEAD `86137f52a` = `origin/audit/final-audit` (אחרי `git fetch`). העץ הראשי עדיין על `main` `3f6ca53c3`
(ahead 193, behind 110 מול `origin/main`), ושם STATE.md הוא הגרסה הישנה בת 21134 שורות. **החלטה שהתקבלה לבד:** כמו ב-M05-c113, לא נגעתי בעץ הראשי
ולא באף ref מקומי; העבודה וה-commit נעשו ב-worktree הנקי `/tmp/ke-m01-c113`, ונדחפו כ-fast-forward ל-`origin/audit/final-audit` בלבד.
**שערים** (אותו worktree, `env -i`): `rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: **0, 340/340**, אפס `Invalid API key`, `BUILD_ID` `AaY8VeWt_iKKzFOWAQHfg`;
type-check **0**; test **640/640, 7674 עברו, 12 דולגו**; lint: שאר השערים נקיים, docs-path-audit נכשל ב-worktree רק על `supabase/.temp`
(ב-gitignore, לא קיים ב-worktree), אותו כשל תלוי סביבה שתועד ב-M04-c113 וב-M05-c113, ולא drift. אין שינוי UI, ולכן `compare.mjs` לא נדרש.
**ידני לאופיר (עדיין פתוח):** להחזיר את `audit/final-audit` המקומי ל-`origin/audit/final-audit` ואת העץ הראשי לענף הזה.

**M05-c113 - DONE (06.10.2026): `pnpm test` רץ על worktree נקי של HEAD `b93675616`, 640/640 קבצים, 7674 עברו, 12 דולגו, אפס כשלים, אפס drift; אין שינוי קוד.**
משימת התור: "pnpm test fix drift commit". `pwd` אומת, HEAD `b93675616` = `origin/audit/final-audit` (אחרי `git fetch`). ה-worktree הנקי
`/tmp/ke-m01-c113` הועבר מ-`f0c73423f` ל-`b93675616` (detached; ההפרש הוא `STATE.md` בלבד). **שערים** (אותו worktree, `env -i`):
test **640/640, 7674 עברו, 12 דולגו** (163.6s, זהה ל-M04-c113); type-check **0**; lint: biome ושאר השערים נקיים, docs-path-audit
נכשל ב-worktree רק על `supabase/.temp` (ב-gitignore, לא קיים ב-worktree). בעץ הראשי docs-path-audit מדווח "NO LONGER dangling" על
`refs/electro_product.html`, כי הקובץ קיים שם מקומית (`refs/` ב-gitignore, לא במעקב). **החלטה שהתקבלה לבד:** לא להריץ `--write`,
כי ב-checkout נקי הנתיב כן תלוי וה-ledger נכון לריפו; שני הכשלים תלויי סביבה ולא drift. `rm -rf .next` ואז build עם
`CARDCOM_USE_MOCK=true`: 0, 340/340, אפס `Invalid API key`, `BUILD_ID` `paYZ7N8R0vQB_YZ0G2MjR`. אין שינוי UI, ולכן `compare.mjs` לא נדרש.
**חריגה בזמן הריצה, לא שלי:** ב-17:29 וב-17:30 תהליך אחר הריץ בעץ הראשי `reset` של `audit/final-audit` ל-`origin/main` (פעמיים),
וב-17:31 `checkout main` (ה-reflog של העץ הראשי). ה-ref המקומי `audit/final-audit` מצביע עכשיו על `7b7e01494` (= `origin/main`),
העץ הראשי על `main` `3f6ca53c3`, וה-WIP הזר ב-`docs/UI-PARITY-REPORT.md` כבר לא שם. `origin/audit/final-audit` לא נפגע (`b93675616`).
**החלטה שהתקבלה לבד:** לא נגעתי בעץ הראשי ולא באף ref מקומי; ה-commit הזה נעשה ב-worktree הנקי ונדחף כ-fast-forward
ל-`origin/audit/final-audit` בלבד. **ידני לאופיר:** לבדוק מי הזיז את `audit/final-audit` המקומי, ולהחזיר אותו ל-`origin/audit/final-audit`
לפני הפריט הבא, אחרת M06-c113 ירוץ על `main`. **החלטה שהתקבלה לבד:** הפריט הבא ב-`~/ke-goals/final-queue.txt` (קריאה בלבד) הוא
M06-c113, ולכן `RESUME FROM` עודכן ל-M06-c113. ל-M16-c111 עדיין אין commit עם ראיה; הפער רשום כאן ולא נסגר.

**M11-c110 - DONE** (sitemap.xml טרי, 98/98 כתובות 200, ממצא apex→www ב-BACKLOG),
ו-W14..W01, M01-c96, L12, L11 וכל מה שקדם: ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, החדש למעלה.

## טבלת מצב לתור `final-queue.txt`

התור נסגר (B10 היה האחרון). כל השורות (Q01..Q24, B01..B10, M01-c1..M09-c1,
M11-c51..M15-c52) הועברו ל-`docs/STATE-ARCHIVE.md` ב-M14-c53 לשמירה על
תקרת 300 שורות; שום שורה לא נמחקה, רק הוזזה. **LAUNCH-READY: pending-cardcom (L12, 05.10.2026; L06/L08/L09 BLOCKED גם).**
SHOWABLE: no, ראו "חוסמים
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
2. **RESOLVED ב-L01 (05.10):** פרודקשן מגיש את HEAD (`e1719ad66`,
   `dpl_FxGwtE5H6hw4L9ccU4yJNYmuhVni`), `robots.txt` ו-`sitemap.xml` החיים
   כבר בגרסת HEAD. הטקסט שמתחת הוא ההיסטוריה עד 05.10 בבוקר. **M14-c95:** משתני ה-env שחסמו את ה-preflight נסגרו;
   החוסם עכשיו הוא `refs` ב-`.vercelignore` (`39eb43947`), ראו DEPLOY-UNBLOCK
   למעלה. הטקסט שמתחת הוא ההיסטוריה עד 04.10. **פריסת פרודקשן של HEAD (285 קומיטים אחרי `a388118f1` החי, ספירת git
   בלבד, עודכן ב-M01-c65 מ-267 שנמדד ב-M01-c64; ניסיון הפריסה הידני האחרון
   היה ב-M01-c55, 105 קומיטים אז)**:
   נוסתה לאחרונה ב-M01-c55 (Vercel MCP, `create_deployment`, `gitSource`
   github, `audit/final-audit`@`291bc2d88`) **וסורבה ב-`deploy-preflight`**
   באותה סיבה בדיוק, פעם חמישית ברציפות (M01-c1, M01-c52, M01-c53, M01-c54,
   M01-c55): `dpl_FJYf483tkqSNf5pkG9MenghGQF46`, `BUILD_UTILS_SPAWN_1`.
   **מ-M01-c56 ועד M01-c65 לא נוסה ניסיון פריסה ידני נוסף** (כלל "goal שנתקע
   פעמיים, לדלג", מוחל מ-M01-c55, פעם אחת-עשרה ב-M01-c65, כולל דחיית משימת
   התור שביקשה בפירוש build+deploy חדש, ראו M01-c65 למעלה), אך התנאי נבדק
   שוב בקריאה בלבד בכל פעם ואושר ללא שינוי: `CARDCOM_TERMINAL_NUMBER`,
   `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` עדיין חסרים ב-Production
   (קיימים במקומם `CARDCOM_MERCHANT_ID`/`CARDCOM_CLIENT_ID`/`CARDCOM_API_KEY`
   שהקוד לא קורא) ו-`ALLOW_INCOMPLETE_ENV` עדיין מוגדר שם (Vercel MCP,
   `filter_project_envs`, קריאה בלבד, M01-c65).
   **`list_deployments` (target=production, 5 אחרונות) מראה בדיוק את
   אותן חמש פריסות `ERROR` שנמדדו ב-M01-c61 עד M01-c64**, שום push מאז
   לא הפעיל build אוטומטי חדש (`1083b8d8d`, `99b2079cb`, `0bcbdac18`,
   `291bc2d88` פעמיים), כולן `ERROR` באותה סיבה, נמדד שוב M01-c65.
   עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה; פרודקשן נשאר על
   `a388118f1` (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, READY, מאושר שוב
   ב-M01-c65 דרך `curl` ישיר על `www.kenyonexpress.co.il`). **DNS
   אינו קשור לחוסם הזה**, נמדד שוב ב-M01-c65: `www.kenyonexpress.co.il`
   מחזיר 200 עם התוכן החי, `kenyonexpress.co.il` מפנה 308 ל-`www`, ה-NS
   עדיין `ns1/ns2.vercel-dns.com`. **תוצאה קונקרטית נוספת, M12-c68**:
   `robots.txt` החי עדיין בגרסת `a388118f1`, בלי שלוש כתובות-האסימון
   (`/gift/`,`/order/`,`/wishlist/s/`) ו-`/debug/` שתוקנו ב-M12-c67 — ונבדק
   חי ששלושתן מחזירות `200` בפרודקשן כרגע, בלי כיסוי `Disallow`. **עוד
   תוצאה קונקרטית, M11-c73**: `sitemap.xml` החי גם הוא עדיין בגרסת
   `a388118f1` — `urlset` שטוח, לא `sitemapindex` (סעיף 79, 09.09), וחמשת
   נתיבי תתי-המפות של הקוד הנוכחי מחזירים `404` בפרודקשן **נסגר, M11-c110 (06.10): החי הוא
   `sitemapindex` עם חמש תתי-מפות, 98/98 כתובות 200.**
3. **מיגרציות ממתינות**: **218 (טריגר `enforce_profile_privilege_columns` מפיל כל
   עדכון פרופיל של לקוח ב-42703; נמדד 25.09 ב-M05-c1, 5 מ-5 לקוחות, בניגוד לרישום
   "הוחלה" מ-21.09)**, 245 ו-246 (advisors, M05-c1; 245 אחרי 209 ואחרי 203), 204 (הצטרפות ספקים והסכם click-wrap; בלעדיה הטופס
   עונה "עדיין לא פעיל"), 240 (הסכמת "הכל באפליקציה"), 241 (עיר משלוש
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר), 244 (קמפיינים
   והמרות של תוכנית השותפים; בלעדיה התוכנית "עדיין לא פתוחה"), 247 (`anon`
   בלי הרשאת SELECT על `reviews`, נמדד M18-c52; בלעדיה דף הביקורות הציבורי
   נכשל תמיד, ללא תלות בשום קובץ אחר). סדר והתנאים
   ב-`docs/RUNBOOK.md`, סקירה ב-`docs/MIGRATION-REVIEW.md`. **אומת שוב
   M10-c112 (06.10, בדיקה ישירה מול פרודקשן דרך CLI-keychain-token, קריאה
   בלבד, 17 אובייקטים של 15 קבצים): אף קובץ לא הוחל; החוסם עכשיו 23 קבצים
   (19 הקודמים + 249, 250, 251, 252).**
   65 קבצים ב-`migrations/pending/`, `git log -1` הוא `3043995e9` (252).
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
6. **`RESEND_API_KEY` בפרודקשן אינו תקף, נמדד.** L08 (05.10): שליחה אמיתית
   מ-server action חי החזירה מ-Resend `401 API key is invalid`
   (`email.refused` בלוג הפרודקשן). עד מפתח חדש ב-Vercel Production שום
   מייל אינו יוצא: צור קשר, קופון, magic link, איפוס סיסמה ו-outbox (72
   שורות `dead`). ההיסטוריה: השם קיים מ-25.09 (Q24), הערך לא נקרא.
7. **`SUPABASE_SECRET_KEY` חשוף ודורש רוטציה** (CLAUDE.md, `RUNBOOK`);
   `deploy-preflight` מסרב לבנות איתו, ומ-B01 (25.09) הוא רץ בפועל לפני
   `pnpm build` ב-`vercel.json`. **נמדד ב-M01-c1: הסריקה על סביבת Production
   של Vercel לא מצאה את המפתח החשוף** (אף שורת `COMPROMISED`), כלומר החשיפה
   נוגעת לעותקים מקומיים ולנוהל, לא לפריסה.
8. **Cardcom בפרודקשן: אישורים לא-מאומתים.** עד 04.10 ספק התשלום היה
   mock (נמדד 25.09 על `/checkout` החי, `frame-src ... 'self'`; 24 תשלומי
   `mock-` ו-0 אמיתיים). **L11 (05.10):** ה-build החי כבר אינו mock
   (`frame-src https://secure.cardcom.solutions`, `/api/ready` ‏`cardcom: ok`),
   אך `CARDCOM_TERMINAL_NUMBER`/`API_NAME`/`API_PASSWORD`/`SANDBOX` נוצרו
   ב-04.10 21:40 על ידי סשן סוכן בענן "כדי לעבור את ה-preflight", הם Sensitive
   ואינם ניתנים לקריאה, ואין אישור אמיתי או סנדבוקס במכונה. עד שאופיר יזין
   ערכים אמיתיים ויבצע הזמנת ₪1 וזיכוי, סליקה אמיתית אינה מוכחת
   (BACKLOG סעיף 6; השמות הישנים `API_KEY`/`CLIENT_ID`/`MERCHANT_ID`, סעיף 19).
9. **סגור, M08-c113 (19.10.2026).** מספר עוסק/ח.פ לשורת המוכר באישור הרכישה
   (Q09): אופיר מסר את המספר (033798513) בצ'אט; `purchaseConfirmation.sellerName`
   ב-`messages/he.json` עודכן ל-"קניון אקספרס (KenyonExpress) ח.פ 033798513".
   PR #89 נגד `audit/final-audit`, מיזוג בידי אופיר.
10. **המתזמן מתוזמן ונדחה** (Q24, נמדד שוב L09 05.10): `cron.yml` על `main`
    נכשל בכל ריצה, האחרונה 04.10 19:11 UTC (`abandoned-cart -> 401`), כל 21
    הנתיבים עונים 401 גם לסוד המקומי; סוד Vercel הוא Sensitive ולא נקרא.
    72 הודעות `dead` ב-`notification_outbox`, 0 חדשות ב-24 שעות;
    `expire-vouchers` ושאר 20 העבודות לא רצות. pg_cron מחזיק רק
    `report_tables_nightly` (רץ). תיקון: אותו ערך בשני המקומות. אופיר בלבד.
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

14. **`kenyonexpress.co.il` עצמו נסרב כ-live reference ב-`scripts/compare.mjs`
    (נמדד לראשונה ב-Q31, 01.10.2026, `--page=home`)**: ה-DNS כבר מצביע
    לפריסת Vercel שלנו (חוסם #2 למעלה), כך שניווט חי לדף הבית מחזיר את
    הבנייה שלנו ("live side is our-build", REFUSED, לא PASS שקרי). מאותו
    רגע **כל מדידה על `home` חייבת `--baseline='refs/ke_live_{width}.png'`**
    (קיים בשלושת הרוחבים, נבדק PASS ב-Q31: `8.51%`/`9.02%`/`3.95%`). לדף
    המוצר יש כבר באותו תבנית (`refs/ke_live_product_{width}.png`, Q05b).
    **`category` נסגר כבר ב-Q27**: `refs/electro_shop_{width}.png`
    (Electro `/shop/`) קיים בשלושת הרוחבים, נבדק PASS שוב ב-M03-c66
    (01.10.2026, אפס דריפט: 3.53%/2.52%/1.69%). **לא נבדק**: אם
    `products`/`search` נתקלים באותו סירוב — יש להם רק צילום בודד
    לא-ממותג-רוחב (`refs/live-{products,search}.png`), לא `{width}` לכל
    רוחב, כך שהם עלולים להיתקע ללא reference תקין בכלל. בדיקה והקפאת
    reference תלת-רוחבי לשניהם, אם יידרש מדד חזותי עליהם, היא עבודה של
    פריט עתידי.
    **L07 (05.10):** הצד הנמדד יכול להיות פרודקשן עצמו
    (`LOCAL_BASE=https://www.kenyonexpress.co.il`) מאז שתיקון `shoot()`
    גוזר את הצד מהקורא ולא מה-hostname; נמדד 7.91 / 8.98 / 4.09 PASS.
    **M01-c96 (05.10):** אותו reference, build מקומי של HEAD על 3396:
    8.58 / 9.01 / 4.16 PASS.
    **W01 (05.10):** אחרי בניית שורת האייקונים מחדש, אותו reference ואותו
    מסלול: 8.60 / 9.02 / 4.16 PASS.

15. **אין מסד פיתוח, ולכן קטלוג הדמו (W04) אינו זרוע בשום מקום** (05.10):
    `scripts/seed-demo-catalog.ts --apply` מסרב לפרודקשן בכוונה, Docker לא רץ,
    ואין פרויקט Supabase חד-פעמי. יצירת פרויקט כזה והזנת `SEED_SUPABASE_URL`
    + `SEED_SUPABASE_SERVICE_KEY` היא של אופיר; אז ההרצה ואימות הרינדור נמדדים.

16. **תזכורות התפוגה מתוזמנות (S20, 258 הוחלה).** פתוח: 12 משימות 162 שולחות POST
    ועונות 405. צריך להמיר אותן ל-`net.http_get`, כי ה-vault כבר על www. ראו `docs/S20-expiry.md`.

17. **שבעה סודות אמיתיים בהיסטוריה של ריפו ציבורי (S24).** ‏CRON_SECRET (צריך להחליף ב-Vercel וב-vault באותו צעד), ‏VOUCHER_QR_SECRET (צריך חלון של שני מפתחות), סיסמת ה-protection וה-API token של Vercel. ‏Upstash לא מוגדר בפרודקשן. ‏zod 4 עד 31.12. הפירוט ב-`docs/S24-security.md`.

## ידני לאופיר, לפי סדר קריטיות

הרשימה המלאה, ממוזגת עם `docs/LAUNCH-READINESS.md` וללא כפילויות, עברה
ל-`docs/BACKLOG.md` (M15-c51). לא נשמר עותק כאן, כדי שלא ייסטה שוב.
