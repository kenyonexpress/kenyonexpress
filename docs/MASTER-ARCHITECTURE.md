# MASTER ARCHITECTURE: מסמך האב המאוחד (גרסה 2)

מסמך הכרעות מחייב. מאחד את כל מסמכי הארכיטקטורה:
`docs/COMMERCE-ARCHITECTURE.md` (טיוטת 026),
`docs/SUPPLIER-REDEMPTION-ARCHITECTURE.md` (טיוטת 027),
`docs/AI-AGENTS-ARCHITECTURE.md` (טיוטת 028),
`docs/ACCOUNT-IDENTITY-ARCHITECTURE.md` (טיוטת 029),
`docs/CATALOG-SEARCH-SEO-ARCHITECTURE.md` (טיוטת 030),
`docs/NOTIFICATIONS-MARKETING-ARCHITECTURE.md` (טיוטת 031),
`docs/WP-DATA-MIGRATION-ARCHITECTURE.md` (טיוטת 032),
`docs/ANALYTICS-BI-ARCHITECTURE.md` (טיוטת 033),
`docs/PRODUCTION-OPS-ARCHITECTURE.md` (ללא מיגרציה),
`docs/TESTING-CICD-ARCHITECTURE.md` (ללא מיגרציה),
`docs/SUPERAPP-MOBILE-ARCHITECTURE.md` (ללא מיגרציה),
`docs/product-page/` (מאסטר דף מוצר),
ואת המיגרציות 001 עד 025 (מוחלות) + הטיוטות 026-033 (לא מוחלות).

תאריך: 2026-07-09. ענף: `phase5/homepage`.
גרסה זו מחליפה במלואה את גרסת 2026-07-08 של מסמך זה. הגרסה הקודמת נכתבה כשהיו רק טיוטות 026-028 וקבעה מספור סופי שכבר אינו תקף (ראו סתירה 1.19). דומייני ייבוא ה-WordPress (032) והאנליטיקה (033) נוספו ב-2026-07-09 במקביל לכתיבת מסמך זה ונקלטו לתוכו (חלק ד).

כל סתירה בין מסמך זה למסמכי המקור או לגרסה הקודמת: **מסמך זה גובר**. הטיוטות עצמן לא שונו; ההוראות בסעיף 2 מגדירות מה לשנות בהן לפני החלה.

---

## 1. ביקורת סתירות (Conflict Audit): הכרעה לכל סתירה

### חלק א: ליבת המסחר (026 מול 027 מול 028)

#### 1.1 התנגשות enum בשם `payout_status` (026 מול 027)

- 026 מגדירה: `('draft','approved','paid','cancelled')`.
- 027 מגדירה: `('draft','pending_approval','approved','paid','cancelled')`.
- שתיהן עטופות ב-guard של `duplicate_object`: השנייה שתרוץ היא no-op שקט, וה-casts שלה יתפוצצו בזמן ריצה.

**הכרעה:** הערך הקנוני הוא של 027 (חמשת הערכים, כולל `pending_approval`). הגדרת ה-enum נמחקת מ-026 לחלוטין; הבעלים היחיד הוא `027_suppliers.sql`.

#### 1.2 שני מנועי settlement מקבילים

- 026: `supplier_payouts` + `supplier_payout_items` + זרימת draft→approved→paid.
- 027: `payout_statements` + `payout_statement_lines` + `generate/approve/mark_paid/cancel` + מחלוקות + `bank_snapshot` + `statement_number` (PS-######) + שורות `adjustment`.

**הכרעה:** מנוע `payout_statements` של 027 הוא הקנוני. מ-026 נמחק סעיף 8 כולו (שתי הטבלאות, ה-RLS שלהן וה-trigger בשם `audit_supplier_payouts`). סעיפים 2.7 ו-5.5 במסמך ה-commerce בטלים. ה-server actions מקבלים את שמות 027: `generatePayoutStatement`, `approvePayoutStatement`, `markPayoutStatementPaid`, `cancelPayoutStatement`. (זו גם המלצת מסמך ה-agents סעיף 9.1 ומסמך התפעול, והיא מתקבלת.)

#### 1.3 כפילות snapshot כספי על `order_items`

- 026 מוסיפה חמש עמודות: `platform_percent`, `platform_fee_ils`, `supplier_due_ils`, `charged_on_site_ils`, `balance_due_at_business_ils`, ומכריזה על `commission_percent` + `supplier_payout_ils` (מ-007) כ-deprecated.
- 027 בנויה הפוך: `generate_payout_statement` קוראת דווקא את `commission_percent` ו-`supplier_payout_ils`.

**הכרעה:** חמש העמודות של 026 הן הקנוניות (רק הן נושאות את פיצול הקופון: מה שולם באתר ומה נגבה בעסק). ה-checkout כותב את שתי המשפחות במקביל (`commission_percent = platform_percent`, `supplier_payout_ils = supplier_due_ils`) לתאימות דוחות ישנים. `generate_payout_statement` משוכתבת לקרוא `COALESCE(platform_fee_ils, ...)` ו-`COALESCE(supplier_due_ils, supplier_payout_ils)` עבור שורות היסטוריות.

#### 1.4 צורת `products.platform_percent`: שלוש הגדרות (026, 027, 030)

- 026: `NOT NULL DEFAULT 10`.
- 027: nullable, עם שרשרת fallback מוצר → `suppliers.commission_percent` → 10 דרך `product_platform_percent()`.
- 030: מוסיפה את אותה עמודה "הגנתית" בנוסח 027 (nullable, `IF NOT EXISTS`).

**הכרעה:** הצורה של 027 (nullable + fallback) קנונית, והבעלים היחיד הוא `026_commerce.sql` (בנוסח המתוקן). הבלוק נמחק גם מ-027 וגם מ-030. הפונקציה `product_platform_percent()` עוברת ל-026 (היא תשתית checkout, ו-`suppliers` קיימת מ-005). ה-checkout קורא אך ורק דרך הפונקציה ומקפיא את התוצאה ב-snapshot. עיקרון כללי: לעמודה יש בעלים אחד; אין "הוספות הגנתיות" כפולות.

#### 1.5 `coupon_deals.platform_percent` מול העמודות המחושבות של 015

015 הגדירה על `coupon_deals` את `platform_price` כ-GENERATED (תמיד 10% מהמחיר) ואת `discount_percentage` כ-GENERATED (תמיד 90.00). 026 מוסיפה `platform_percent` דינמי, ואז שתי העמודות המחושבות משקרות לכל אחוז שאינו 10.

**הכרעה:** במיגרציית ה-commerce, `platform_price` ו-`discount_percentage` מומרות מ-GENERATED לעמודות רגילות (הערכים הקיימים נשמרים), והאפליקציה מחשבת אותן בכתיבה מתוך `platform_percent`. `coupon_deals.platform_percent` נשארת nullable עם fallback ל-10 (ספק קנוני יתווסף לה רק ב-034, סתירה 1.12).

#### 1.6 שתי פונקציות מימוש ושתי טבלאות לוג

- 026: `fn_redeem_coupon` (RETURNS TABLE, הרשאה דרך `profiles.supplier_id` + role, כותבת `coupon_redemptions` בהצלחה בלבד).
- 027: `redeem_coupon` (RETURNS jsonb, הרשאה דרך `supplier_members`, כותבת `coupon_scan_events` על כל ניסיון כולל כשלונות, אנטי-אנומרציה).

**הכרעה:** `redeem_coupon` של 027 היא נקודת המימוש היחידה, בתוספת אחת: בהצלחה היא מוסיפה גם שורת `coupon_redemptions` (ה-UNIQUE על `coupon_code_id` הוא מחסום replay שני ובלתי תלוי, וה-RLS שלה נותן לבעל הקופון לראות את המימוש שלו). `fn_redeem_coupon` נמחקת מ-026. שתי הטבלאות חיות בתפקידים שונים: `coupon_scan_events` = יומן ניסיונות (כולל fraud), `coupon_redemptions` = רשומת אמת של מימוש.

#### 1.7 rate limit לסריקה: 20 מול 30 לדקה

**הכרעה:** 30 לדקה (027). המספר 20 נמחק מכל מקום. (מסמך התפעול כבר אימץ 30.)

#### 1.8 מודל ההרשאה לספק: `profiles.supplier_id` מול `supplier_members`

026 כותבת policies על בסיס `profiles.supplier_id` + `role IN ('vendor','content_uploader')`. 027 קובעת ש-`supplier_members` הוא מקור האמת. 028 מגדרת עם `is_supplier_member_compat` שעובדת בשני המצבים.

**הכרעה:** חברות (`supplier_members` + `is_supplier_member`/`is_supplier_owner`) היא מודל ההרשאה היחיד לספקים. כל policy בסגנון 026 משוכתב לחברות. `profiles.supplier_id` נשאר מסונכרן לאחור בלבד ואסור בשימוש ב-policy חדש. `is_supplier_member_compat` נמחקת מ-028: בסדר הקנוני 027 קודמת ל-028, אז `is_supplier_member` קיימת תמיד. (מסמך המובייל סעיף 2.2 מאמץ את אותה תבנית לוורטיקלים עתידיים: `courier_members`, `driver_members`.)

#### 1.9 מימוש בידי אדמין

026 מאפשרת לאדמין לממש קופון של כל ספק. 027 לא.

**הכרעה:** אין עקיפת אדמין. מימוש כפוף לחברות בלבד (027). אדמין שצריך לממש מצרף את עצמו כ-member. זה משאיר audit trail נקי ואנטי-אנומרציה עקבית.

#### 1.10 זהות עסקת Cardcom: `payments.cardcom_transaction_id` מול `orders.cardcom_payment_id`

026 יוצרת את `payments` עם `cardcom_transaction_id UNIQUE` (נכתב רק על ידי webhook מאומת). 027 בונה את ה-reconciliation על `orders.cardcom_payment_id` (עמודת 007, בלי unique).

**הכרעה:** `payments` היא הרשומה הקנונית של כל עסקת Cardcom. `reconcile_cardcom_settlement` משוכתבת: JOIN על `payments.cardcom_transaction_id` (בסטטוס `succeeded`), וההזמנה נגזרת מ-`payments.order_id`; fallback ל-`orders.cardcom_payment_id` רק לשורות שקדמו ל-`payments`. שאלה 9.7 של מסמך הספקים סגורה. `orders.cardcom_payment_id` נשאר write-through לתאימות בלבד.

#### 1.11 מקור ברירת המחדל לעמלה: `vendors.commission_rate` מול `suppliers.commission_percent`

**הכרעה:** `suppliers.commission_percent` הוא ברירת המחדל היחידה פר ספק. `vendors.commission_rate` מת (vendors היא legacy). שאלה O1 של מסמך ה-commerce סגורה: `platform_percent` פירושו תמיד **חלק הפלטפורמה**, ברירת מחדל 10; המספר 90 בטופס האדמין היה תצוגת חלק הספק ויש להפוך אותו ב-UI, לא בסכימה.

#### 1.12 כפילות ישויות `vendors` מול `suppliers`

כל ה-FK הכספיים (products, order_items, coupon_codes) מפנים ל-`suppliers`; רק `coupon_deals.vendor_id` מפנה ל-`vendors`. ה-policy מ-014 ("products: vendor read own") משווה `products.supplier_id` מול `vendors.id` (השוואה שבורה בין טבלאות; 027 כבר מחליפה אותה).

**הכרעה:** `suppliers` קנונית. נקבעת מיגרציית איחוד ייעודית `034_vendors_unification.sql` (סעיף 2.9): יצירת שורת supplier לכל vendor פעיל, הוספת `coupon_deals.supplier_id` + backfill, הפיכת `vendor_id` ל-deprecated (nullable, לא נקרא). `vendors` מוקפאת לקריאה בלבד עד מחיקה עתידית. האיחוד מוחל לפני בניית UI הפורטל.

#### 1.13 מי מסמן דוח כשולם

מסמך ה-commerce (5.5): הרשאת super_admin בלבד. פונקציית 027: `is_admin()`.

**הכרעה:** שתי שכבות. ב-DB נשאר `is_admin()` (כמו 027). ב-server action נאכף `super_admin` בלבד. כסף שיוצא מהחברה דורש את הדרגה הגבוהה, בלי לסבך את הפונקציה.

#### 1.14 היכן נוצר קופון ומי חותם QR

מסמך ה-commerce (3.1): קודי קופון נוצרים בטרנזקציית ה-webhook של המעבר ל-paid. מסמך הספקים (7.1): הנפקה + חתימת `qr_token` ב-server action עם מפתח Ed25519 מ-env.

**הכרעה:** חלוקת עבודה, לא סתירה: יצירת שורות `coupon_codes` (כולל snapshot כספי: `platform_percent`, `face_value_ils`, `platform_paid_ils`, `collect_amount_ils`) קורית בתוך טרנזקציית ה-webhook. חתימת ה-QR קורית באותו server action, לפני ה-commit, כי המפתח הפרטי חי רק ב-env של השרת. אם החתימה נכשלת הטרנזקציה לא נכשלת: `qr_token` נשאר NULL ומושלם על ידי job (הקוד הידני תקף תמיד).

#### 1.15 בעלות על `handle_new_user`

023 תיקנה אותה, 026 מחליפה אותה (מוסיפה `wallet_accounts`), 029 נמנעת בכוונה מלגעת בה ומוסיפה trigger נפרד על `profiles` להעדפות התראות (`create_notification_prefs`).

**הכרעה:** הגרסה של 026 היא היחידה שמחליפה את הפונקציה. 029 מוסיפה trigger עצמאי בלבד (כפי שכבר כתוב בטיוטה). שום מיגרציה אחרת לא נוגעת ב-`handle_new_user`. ה-insert הישן ל-`wallet_balances` נשאר עד cutover הקוד ואז מוסר במיגרציה עתידית.

#### 1.16 שימוש חוזר בשם `wallet_transactions`

026 משנה שם ל-006 (`wallet_transactions_legacy`) ויוצרת טבלה חדשה באותו שם עם סכימה אחרת. ה-policies הישנים נודדים עם הטבלה, כולל `wallet_transactions_admin_all` שמאפשר כתיבת אדמין.

**הכרעה:** נשאר כמו 026, בתוספת חובה: מיד אחרי ה-RENAME מוסרים מה-legacy את policy הכתיבה של האדמין (נשאר SELECT בלבד). ה-ledger החדש append-only ללא כל policy כתיבה, כולל אדמין. ה-UI עובד ב-feature detection (מסמך החשבון 3.2) עד סיום ה-cutover.

#### 1.17 audit גנרי מול `payment_tokens`

ה-trigger הגנרי מ-025 מתעד את השורה כולה ב-`changes`, כלומר היה שופך `cardcom_token` גולמי ל-audit_log.

**הכרעה:** על `payment_tokens` אסור לחבר את ה-trigger הגנרי לעולם. 029 מתקינה trigger ייעודי (`audit_payment_tokens_fn`) שמתעד בלי עמודת הטוקן. זה החריג היחיד לתבנית, וטיוטת 029 כבר מממשת אותו נכון.

#### 1.18 הצטברות RLS חופפת מהמיגרציות הישנות

- `products`: שכבות 005 + 014 + 025 חיות במקביל (policies כפולים ל-SELECT ולכתיבה).
- `categories`: שכבות 005 + 012 במקביל.
- `vendors`: policy `vendors: owner manage` (001, FOR ALL) חי לצד policies של 013 שהתכוונו להגביל כתיבה ל-super_admin.

**הכרעה:** `034_vendors_unification.sql` מוסיפה סעיף ניקוי: הסרת `products_public_read`/`products_admin_write` (005), `categories_public_read`/`categories_admin_write` (005), ו-`vendors: owner manage` (001). הגרסאות המאוחרות (012/014/025) נשארות מקור אמת יחיד.

### חלק ב: מספור, חשבונות והתראות (029, 031, הגרסה הקודמת של מסמך זה)

#### 1.19 המספור: תוכנית שינוי השמות בטלה, וגם 032/033 כבר תפוסים

שלוש שכבות של אותה סתירה:
- הגרסה הקודמת של מסמך זה קבעה סדר סופי עם שינויי שמות (027=חשבונות, 028=ספקים, 029=איחוד vendors, 030=agents). בפועל נוצרו `029_accounts.sql`, `030_catalog.sql`, `031_notifications.sql` במספור המקורי.
- ב-2026-07-09 סשנים מקבילים תפסו גם את 032 (`032_wp_import_staging.sql`, כבר בקומיט) ואת 033 (`033_analytics.sql`).
- הכותרת של 033 ומסמך האנליטיקה עדיין טוענים ש"032 שמור לאיחוד vendors", בעוד ש-032 הפיזי הוא ייבוא ה-WP.

**הכרעה:** הקבצים הפיזיים גוברים תמיד. 032 = ייבוא WP (staging), 033 = אנליטיקה, ומיגרציית איחוד ה-vendors מקבלת את המספר הפנוי הבא: `034_vendors_unification.sql`. הערת המספור בכותרת 033 מתוקנת (עריכה קוסמטית, סעיף 2.8). משמעת מספור מחייבת מעתה: לפני יצירת קובץ מיגרציה חדש בודקים `ls supabase/migrations/` ולוקחים את המספר הפנוי הבא, ומעדכנים את מסמך זה באותו commit.

#### 1.20 פיצול enum בשם `notification_status` בין 029 ל-031

- 029 יוצרת: `('queued','sent','failed','cancelled')`.
- 031 מרחיבה ב-`ALTER TYPE ... ADD VALUE IF NOT EXISTS 'dead'` ו-`'skipped'`, בניגוד לעיקרון "אין ADD VALUE באף קובץ" (ADD VALUE בתוך טרנזקציה אסור בשימוש באותה טרנזקציה, ומועד לתקלות ב-apply_migration).

**הכרעה:** מאחר ש-029 עוד לא הוחלה, ה-enum מוגדר מראש עם כל ששת הערכים ב-029: `('queued','sent','failed','cancelled','dead','skipped')`. שני משפטי ה-ALTER TYPE נמחקים מ-031. העיקרון נשמר: כל ה-enums נוצרים שלמים ב-CREATE TYPE.

#### 1.21 אילוץ הערוצים על `notifications_outbox.channel`

029 יוצרת CHECK עם `('email','inapp','push','sms')`. 031 מחליפה אותו ב-CHECK מורחב עם `'whatsapp'` (בלוק DROP CONSTRAINT + ADD CONSTRAINT שביר).

**הכרעה:** 029 מגדירה מראש את חמשת הערוצים `('email','inapp','push','sms','whatsapp')`. בלוק החלפת ה-CHECK נמחק מ-031. אותו עיקרון בעלות-יחידה כמו 1.20.

#### 1.22 פורמט dedupe_key לתזכורת 48 שעות

מסמך החשבון (4.3): `coupon_expiry_48h:<coupon_id>`. מסמך ההתראות (5.2) וקובץ 029 עצמו: `coupon_expiry_48h:<channel>:<coupon_id>`.

**הכרעה:** הפורמט המיושם בקובץ 029 הוא הקנוני (עם channel; ה-7d נשאר בלי channel כפי שכתוב). מסמך החשבון 4.3 מיושן בנקודה זו. אין עריכת קוד.

#### 1.23 חיווט WhatsApp לתזכורות פקיעה: פער בעלות

031 מוסיפה את עמודת ההעדפה `coupon_expiry_whatsapp` ואת שורת הניתוב במטריצה, אבל הפונקציה שמייצרת את התזכורות (`fn_enqueue_coupon_expiry_reminders`) שייכת ל-029 ומטפלת רק ב-email/inapp. 031 מצהירה במפורש שהיא לא עורכת אותה.

**הכרעה:** הפער נשאר פתוח בכוונה עד עליית ספק WhatsApp. החיווט יתבצע במיגרציית cutover עתידית (אחרי 034) שתחליף את גוף הפונקציה של 029, לעולם לא בעריכה שקטה מתוך 031. נרשם בסדר הבנייה (שלב 5C).

#### 1.24 `quiet_hours_override`: מסמך מול קובץ

מסמך ההתראות (4.1) מציין ארבע עמודות חדשות על `user_notification_preferences`, כולל `quiet_hours_override`. קובץ 031 מוסיף רק את שלוש עמודות ה-WhatsApp.

**הכרעה:** הקובץ קנוני. שעות השקט הן מדיניות גלובלית (`fn_in_marketing_window`); override פר משתמש נדחה עד שיוכח צורך. סעיף 4.1 במסמך ההתראות מתוקן בהתאם בקריאה (אין עריכת קובץ).

### חלק ג: דומיינים חדשים מול הליבה (030, superapp, ops, product-page)

#### 1.25 כפילות מנגנון הסכמה (consent): superapp מול 031

מסמך המובייל (4.3) מציע להוסיף על `user_notification_preferences` עמודות `marketing_opted_in`, `consent_source`, `consent_text_version`, `consented_at`, `revoked_at`. 031 כבר פותרת בדיוק את זה: מצב ההסכמה חי בבוליאנים של 029/031 (`marketing_email`, `marketing_sms`, `marketing_whatsapp`), והראיה המשפטית (חוק 30א) חיה ב-`consent_events` (append-only, עם source, wording_version, ip, user_agent).

**הכרעה:** הצעת המובייל נדחית. מקור אמת: מצב = ההעדפות (029/031), ראיה = `consent_events` (031). `fn_set_marketing_consent` היא נקודת הכתיבה היחידה מצד המשתמש. מסך ההסכמה של המובייל (שלב 1 שלו) משתמש בזה כמות שהוא.

#### 1.26 רישום מכשירים ו-push: שלושה מסמכים, אפס בעלים

מסמך המובייל מציע טבלת `push_subscriptions`; 029 שומרת ערוץ `push` ב-outbox בלי רישום מכשירים; מסמך ההתראות משאיר זאת כשאלה פתוחה (10.5); מסמך דף המוצר (15) מציע שדה "מזהה Push לספק" נפרד.

**הכרעה:** טבלת `push_subscriptions` (בנוסח מסמך המובייל: endpoint UNIQUE, p256dh, auth, platform web/apns/fcm, failed_count) תוגדר במיגרציית push עתידית (מספר לפי הפנוי בזמן הכתיבה [1.19]) בבעלות דומיין ההתראות, כתנאי קדם לשלב 1 של המובייל. היא ממוקדת-משתמש בלבד: סורק של ספק הוא משתמש רגיל עם מנוי push משלו. שדה "מזהה Push לספק" בדף המוצר נמחק מהאפיון; אין אחסון טוקנים כפול.

#### 1.27 מוסכמת שמות אירועי התראה: מפתחות שטוחים מול topics מנוקדים

מסמך המובייל (2.4) מציע `<vertical>.<entity>.<event>` (למשל `shop.order.paid`). 029/031 כבר מקודדים מפתחות שטוחים: `order_paid`, `coupon_delivered`, `abandoned_cart_1`, `winback`.

**הכרעה:** המפתחות השטוחים בסגנון snake_case הם הקנוניים; הם כבר טבועים ב-triggers, ב-dedupe keys ובניתוב של 031. המוסכמה המנוקדת נדחית למיגרציית הוורטיקלים העתידית (034), שתוסיף אותה כשדה נפרד ולא תשנה מפתחות קיימים.

#### 1.28 כתובת דף מוצר: `/product/[slug]` מול `/products/[slug]`

הקוד הקיים בנוי על יחיד; מסמך הקטלוג (3.2) ו-STATE מכריעים רבים, וה-trigger `record_slug_redirect` ב-030 כבר כותב קידומת `/products/`.

**הכרעה:** רבים (`/products/[slug]`) קנוני. העברת ה-route + ‏301 קבוע מהיחיד נכנסות לשלב הקטלוג (C1 בסדר הבנייה), לפני החלת ה-sitemap החדש.

#### 1.29 rate limit helpers במצב fail-open

ממצא מסמך התפעול (4.2): שני ה-helpers ב-`rate-limit.ts` מחזירים "מותר" כשה-RPC נכשל, ו-`checkUserRateLimit` בכלל חסר קוראים בקוד הקיים.

**הכרעה:** מדיניות דיפרנציאלית מחייבת: fail-closed (חסימה בעת כשל RPC) עבור `begin_checkout` ו-`coupon_scan` (כסף); fail-open עבור `agent_chat` ו-`consent_change` (חוויית שימוש). כל כשל RPC מדווח ל-Sentry. פעולת ה-checkout מקבלת מפתח פורמלי: `begin_checkout`, ‏10 לדקה למשתמש (מספרו של מסמך התפעול מאומץ כמחייב).

#### 1.30 שני מנגנוני kill switch

028: ‏`agent_prompts.is_active`. מסמך המובייל: `verticals.status='paused'` (עתידי).

**הכרעה:** אין טבלת feature flags גנרית. שני המנגנונים נשארים, כל אחד בדומיין שלו; מיגרציית `verticals` נשארת עתידית (034) ואינה חלק מהרצף הנוכחי.

#### 1.31 מדיניות retention: מה נשמר לנצח ומה נמחק

מסמך התפעול קובע 90 יום ל-`agent_run_steps` ו-`coupon_scan_events`; מסמך המובייל שואל על יומני התראות; 031 לא קובעת.

**הכרעה (רישום מחייב):** נשמר לנצח: `audit_log`, `consent_events`, `wallet_transactions`, `payments`, `payout_statements(+lines)`, `coupon_redemptions`, `notification_conversions`, `analytics_daily` (רולאפ יומי). נמחק אחרי 90 יום (cron חודשי): `agent_run_steps`, `coupon_scan_events`, `notification_delivery_events`, שורות `notifications_outbox` בסטטוס סופי. `search_queries`: 6 חודשים (דרישת מגמות של דוח איכות החיפוש ב-033; מעדכן את 90 הימים שנקבעו קודם [1.37]). `notification_events`: שנה. `analytics_events` הגולמית: 13 חודשים (הפלת partitions חודשיים דרך `fn_drop_old_analytics_partitions`). מחיקת חשבון (029) מנקה PII בכל מקרה.

#### 1.32 `set_updated_at()` מוגדרת מחדש בשמונה טיוטות

026, 027, 028, 029, 030, 031, 032, 033 כולן עושות `CREATE OR REPLACE` לאותה פונקציה גלובלית.

**הכרעה:** מותר ונשאר (זה מה שמאפשר סדר החלה גמיש ופרויקט פרודקשן טרי), בתנאי קשיח אחד: הגוף חייב להישאר זהה בייט-בייט לגרסת 001 בכל הקבצים. שינוי עתידי לפונקציה: אך ורק במיגרציה ייעודית משלה.

#### 1.33 `sold_count` ומיון "פופולרי"

מסמך הקטלוג (6.5) משאיר פתוח אם `sold_count` היא עמודה מתוחזקת או נגזרת.

**הכרעה:** נגזרת. אין עמודה. מיון `popular` מחושב מ-`order_items` (026) דרך view/שאילתה עם cache; אם יוכח צורך ביצועים, עמודה מתוחזקת תתווסף במיגרציה עתידית. אין כתיבה כפולה של מונים.

#### 1.34 cutover של `carts.items` (jsonb) מול `cart_items`

`fn_enqueue_abandoned_cart_reminders` (031) ו-`fn_merge_guest_cart` (029) קוראות את `carts.items` הישן, בעוד 026 מציגה `cart_items` מנורמל וסדר הבנייה ממיר אליו את העגלה.

**הכרעה:** שתי הפונקציות נשארות על `carts.items` עד סיום ה-cutover של שלב 2 (הקוד כותב לשני המקומות בתקופת המעבר). אחרי שהעגלה חיה ב-`cart_items` בלבד, מיגרציית cutover עתידית משכתבת את שתי הפונקציות ומוחקת את `carts.items`. נרשם כחוב מתועד, לא נחסם עליו כלום.

#### 1.35 רשימת drift מול ה-DB החי (חובה לבדוק לפני החלה)

1. טבלת `coupons` קיימת בפרודקשן למרות ש-008 מוחקת אותה בקבצים. לא נוגעים בה; לא בונים עליה.
2. `product_type` ייתכן בעל 2 ערכים בלבד (`physical`,`coupon`) אם 001 רצה לפני 005 (הערך `service` אולי חסר). ה-drafts משתמשים רק ב-`physical`/`coupon`; אם יידרש `service`, זו מיגרציית ADD VALUE נפרדת ועצמאית.
3. `product_status` ייתכן בלי `sold_out` מאותה סיבה (030 מפנה אליו בתצוגת מלאי; לבדוק לפני שלב הקטלוג).
4. היסטוריית המיגרציות במרוחק לא מסונכרנת: החלה אך ורק דרך Supabase MCP בכלי `apply_migration`, לעולם לא `db push`.
5. תנאים מוקדמים חיים שאומתו: 016 (`name_he`), 019 (`check_user_rate_limit`), 025 (`audit_log_trigger_fn`). ל-030 נדרש גם `pg_trgm` (לוודא זמינות extension).

### חלק ד: אנליטיקה וייבוא WordPress ‏(032, 033; נוספו 2026-07-09)

#### 1.36 יתרות ארנק מיובאות מול `v_wallet_ledger_drift`

026 זורעת `wallet_accounts` מ-`wallet_balances` עם היתרה בעמודת ה-cache, אבל בלי שורות פתיחה ב-ledger. ה-view של 033 (`v_wallet_ledger_drift`) משווה cache מול סכימת ה-ledger, ולכן כל חשבון שהיגר עם יתרה חיובית יסומן drift מהיום הראשון.

**הכרעה:** עריכה נוספת ל-026 (סעיף 2.1, פריט 9): מיד אחרי זריעת החשבונות נוצרות שורות פתיחה ב-`wallet_transactions`: ‏debit = ‏`platform:adjustments`, ‏credit = חשבון המשתמש, ‏amount = היתרה שהועברה, ‏reason = ‏`manual_adjust`, ‏idempotency_key = ‏`legacy_opening:<user_id>` (רק ליתרות גדולות מאפס). כך ledger = cache מרגע האפס וה-view נקי.

#### 1.37 ‏retention של `search_queries`: ‏90 יום מול 6 חודשים

הכרעה 1.31 המקורית קבעה 90 יום; מסמך האנליטיקה קובע 6 חודשים (ה-view ‏`v_search_quality_daily` צריך מגמות).

**הכרעה:** 6 חודשים. הצרכן (033) קובע את ה-retention של מקור שהוא קורא. 1.31 עודכנה בהתאם.

#### 1.38 הערת המספור בכותרת 033 והסדר סביב איחוד ה-vendors

כותרת 033 ומסמך האנליטיקה כותבים "032 שמור לאיחוד vendors" וסדר החלה "... → 032 (איחוד) → 033". בפועל 032 היא ייבוא ה-WP והאיחוד הוא 034, כלומר האיחוד רץ אחרי 033.

**הכרעה:** הסדר המספרי גובר (026→...→033→034). אין תלות סכימתית של 033 באיחוד: ה-views דינמיים, וברגע ש-034 עושה backfill לספקים הם נקלטים אוטומטית ב-`v_supplier_leaderboard_30d`. הכותרת של 033 מתוקנת קוסמטית (סעיף 2.8). עד החלת 034, נתוני ספקים שמקורם ב-vendors בלבד פשוט חסרים בלוח, וזה מצב ביניים מקובל.

---

## 2. סדר מיגרציות קנוני

עיקרון: כל קובץ = טרנזקציה אחת של `apply_migration`. אין `ALTER TYPE ... ADD VALUE` באף קובץ (כל ה-enums נוצרים שלמים ב-CREATE TYPE). כל קובץ idempotent. אין שינויי שם לקבצים קיימים.

| # | קובץ | פעולה | תלות קשיחה |
|---|---|---|---|
| 026 | `026_commerce.sql` | עריכה בתוך הקובץ (2.1) | בסיס 001-025 |
| 027 | `027_suppliers.sql` | עריכה בתוך הקובץ (2.2) | 026 (בגלל `coupon_redemptions`) |
| 028 | `028_agents.sql` | עריכה קטנה (2.3) | 027 (בגלל `is_supplier_member`) |
| 029 | `029_accounts.sql` | עריכה בתוך הקובץ (2.4) | בסיס בלבד |
| 030 | `030_catalog.sql` | עריכה קטנה (2.5) | בסיס בלבד (016, 025, pg_trgm) |
| 031 | `031_notifications.sql` | עריכה בתוך הקובץ (2.6) | 029 (בדיקת runtime קיימת בקובץ) |
| 032 | `032_wp_import_staging.sql` | קיימת, ללא עריכות (2.7) | אין (עצמאית לחלוטין) |
| 033 | `033_analytics.sql` | תיקון כותרת בלבד (2.8) | 026, 027 (בדיקת fail-fast בקובץ); 030 אופציונלית |
| 034 | `034_vendors_unification.sql` | קובץ חדש (2.9) | 027 |

עתידיות (מחוץ לרצף הנוכחי, לפי הצורך; המספרים ייקבעו לפי הפנוי בזמן הכתיבה [1.19]): רישום מכשירים push (לפני שלב מובייל 1), רישום ורטיקלים + `orders.vertical`, מיגרציות cutover (מחיקת `carts.items` ושכתוב הפונקציות התלויות [1.34], חיווט WhatsApp לתזכורות [1.23], הסרת `wallet_balances` מ-`handle_new_user` [1.15], מחיקת `vendors`).

### 2.1 עריכות ל-`026_commerce.sql`

נמחק:
1. בלוק ה-enum ‏`payout_status` (עובר לבעלות 027 בגרסת 5 הערכים). [1.1]
2. סעיף 8 כולו: `supplier_payouts`, `supplier_payout_items`, ה-RLS שלהן, `audit_supplier_payouts`. [1.2]
3. הפונקציה `fn_redeem_coupon` וה-REVOKE שלה (הטבלה `coupon_redemptions` נשארת). [1.6]
4. ה-policy ‏"redemptions: supplier read" (מבוסס `profiles.supplier_id`; עובר ל-027 בגרסת חברות). [1.8]

משתנה:
5. `products.platform_percent` הופך ל-nullable בנוסח 027, כולל ה-COMMENT. [1.4]
6. `coupon_deals.platform_percent` הופך ל-nullable (fallback 10 באפליקציה) + המרת `platform_price` ו-`discount_percentage` מ-GENERATED לעמודות רגילות. [1.5]
7. נוספת הפונקציה `product_platform_percent()` (מועתקת מ-027). [1.4]
8. אחרי ה-RENAME של הארנק הישן: הסרת policy הכתיבה `wallet_transactions_admin_all` מהטבלה ה-legacy. [1.16]
9. אחרי זריעת חשבונות המשתמשים: שורות פתיחה ב-ledger (‏debit ‏`platform:adjustments` → ‏credit חשבון המשתמש, ‏reason ‏`manual_adjust`, ‏idempotency_key ‏`legacy_opening:<user_id>`) לכל יתרה חיובית שהועברה. [1.36]

נשאר כמות שהוא: enums ‏`payment_kind`/`payment_status`/`wallet_reason`; ‏`cart_items`; הרחבות `orders`/`order_items` (כולל חמש עמודות ה-snapshot + backfill); `payments` + `payment_webhook_events`; ארנק double-entry (`wallet_accounts`, `wallet_transactions`, `fn_wallet_transfer`, seed חשבונות פלטפורמה); `handle_new_user` המורחבת; `coupon_redemptions` (טבלה + owner/admin read); audit trigger על `payments`.

### 2.2 עריכות ל-`027_suppliers.sql`

נמחק:
1. בלוק `ALTER TABLE products ADD COLUMN platform_percent` וה-COMMENT (כבר ב-026). [1.4]
2. הפונקציה `product_platform_percent()` (עברה ל-026; אם מוגדרת פעמיים בגוף זהה אין נזק, אך הבעלים הוא 026). [1.4]

משתנה:
3. `redeem_coupon`: בענף ההצלחה נוסף `INSERT INTO coupon_redemptions (...)` עם `amount_collected_ils = collect_amount_ils`. [1.6]
4. נוסף policy קריאת ספק על `coupon_redemptions` מבוסס `is_supplier_member`. [1.8]
5. `generate_payout_statement`: שורות physical קוראות `COALESCE(oi.platform_fee_ils, oi.total_price_ils - oi.supplier_payout_ils)` ו-`COALESCE(oi.supplier_due_ils, oi.supplier_payout_ils)`. [1.3]
6. `reconcile_cardcom_settlement`: התאמה דרך `payments.cardcom_transaction_id` (status ‏succeeded) והפניית `order_id` מ-`payments.order_id`; ‏fallback ל-`orders.cardcom_payment_id`. [1.10]

נשאר כמות שהוא: `payout_status` בגרסת 5 הערכים (המגדיר היחיד), `supplier_members` + פונקציות החברות, `supplier_applications`, `supplier_bank_accounts`, עמודות snapshot + QR על `coupon_codes`, עמודות המשלוח על `order_items`, ‏`coupon_scan_events`, ‏`update_shipping_status`, פונקציות ה-onboarding, מנוע `payout_statements`, ‏`cardcom_settlements`, ‏`supplier_disputes`, כל ה-RLS וה-audit triggers, ו-bucket ‏`supplier-docs`.

### 2.3 עריכות ל-`028_agents.sql`

1. מחיקת `is_supplier_member_compat`; ה-policy של `listing_drafts` עובר ל-`is_supplier_member` (קיימת מ-027). [1.8]
2. כל השאר נשאר כמות שהוא (שש הטבלאות, חמשת ה-enums, ‏`fn_log_agent_run`, ‏RLS, ‏audit).

### 2.4 עריכות ל-`029_accounts.sql`

1. ה-enum ‏`notification_status` נוצר עם ששת הערכים: `('queued','sent','failed','cancelled','dead','skipped')`. [1.20]
2. ה-CHECK של `notifications_outbox.channel` נוצר עם חמשת הערוצים: `('email','inapp','push','sms','whatsapp')`. [1.21]

נשאר כמות שהוא: `deletion_request_status`; ‏`profiles.anonymized_at`; ‏`user_notification_preferences` + trigger ‏`create_notification_prefs` + backfill; ‏`account_deletion_requests`; ‏`notifications_outbox`; הקשחת `payment_tokens` (כולל ה-trigger הייעודי [1.17] ו-`fn_set_default_payment_token`); ‏`fn_merge_guest_cart` + דה-דופליקציה + unique חלקי על `carts(profile_id)`; פונקציות המחיקה; ‏`fn_enqueue_coupon_expiry_reminders` (פורמט ה-dedupe הקיים קנוני [1.22]).

### 2.5 עריכות ל-`030_catalog.sql`

1. מחיקת בלוק `ALTER TABLE products ADD COLUMN platform_percent` (הבעלים: 026). [1.4]
2. כל השאר נשאר כמות שהוא: הרחבות `categories` (kind/rule/seo), הרחבות `products` (brand, search_keywords, seo, low_stock_threshold, has_variants, variant_axes, search_vector), ‏`product_variants.option_values`, הרחבות `coupon_deals` (slug/seo/search_vector), שש הטבלאות החדשות, פונקציות החיפוש (`he_tsquery`, `search_products`, `autocomplete_products`, `category_facets`), ‏redirects (`record_slug_redirect`, `touch_seo_redirect`), ‏RLS, ‏audit.

### 2.6 עריכות ל-`031_notifications.sql`

נמחק:
1. שני משפטי `ALTER TYPE public.notification_status ADD VALUE` (הערכים נולדים ב-029). [1.20]
2. בלוק החלפת ה-CHECK של `notifications_outbox.channel` (מוגדר סופית ב-029). [1.21]

נשאר כמות שהוא: בדיקת התלות הקשיחה ב-029; הרחבות העמודות על `notifications_outbox` ועל `user_notification_preferences` (שלוש עמודות WhatsApp בלבד [1.24]); `notification_events` + triggers על orders/order_items/coupon_codes; ‏`notification_templates` + ‏`fn_activate_template`; ‏`consent_events` + ‏`fn_set_marketing_consent`/`fn_unsubscribe_marketing`; ‏`channel_suppressions` + ‏`notification_delivery_events` + ‏`fn_ingest_delivery_event`; מנוע ה-worker (`fn_fanout_notification_events`, ‏`fn_claim_notification_batch`, ‏`fn_mark_notification_sent/failed/skipped`, ‏`fn_requeue_dead_notification`); שעות שקט ומכסות (`fn_in_marketing_window`, ‏`fn_next_marketing_window`, ‏`fn_marketing_frequency_ok`); מסעות (`fn_enqueue_abandoned_cart_reminders`, ‏`fn_enqueue_winback_reminders`); ‏views ‏`v_notification_kpis`, ‏`v_journey_revenue`; ‏`notification_conversions`.

### 2.7 ‏`032_wp_import_staging.sql` (קיימת, ללא עריכות)

סכימת `wp_import` נפרדת (12 טבלאות + 2 views, ‏RLS ‏admin-read, כתיבה service_role בלבד), לא חשופה ל-PostgREST, לא נוגעת ב-public (מלבד re-assert של `set_updated_at` [1.32]). עצמאית לחלוטין: ניתנת להחלה בכל נקודה ברצף; נשארת במקומה המספרי. ההשקות שלה לדומיינים אחרים (הזרקת `seo_redirects` עם ‏source='wordpress_import', שרשרת השוברים החיים דרך orders/order_items/coupon_codes, לקוחות דרך Auth Admin API עם ‏marketing_*=false) הן סקריפטי אפליקציה בשלב W של סדר הבנייה, לא חלק מהמיגרציה.

### 2.8 עריכות ל-`033_analytics.sql`

1. תיקון קוסמטי בכותרת: ההערה "032 שמור לאיחוד vendors" מוחלפת ב"034 = איחוד vendors" [1.19]. אין שינוי תוכן נוסף.
2. תזכורת תלות: הקובץ בודק בעצמו (fail-fast) את 026 ו-027; חייב לרוץ אחריהן.

נשאר כמות שהוא: רישום האירועים (`analytics_event_definitions` + ‏12 האירועים הקנוניים), `analytics_events` המחולקת לפי חודשים + פונקציות ה-partitions, ‏`fn_ingest_analytics_events`, ‏`fn_rollup_analytics_daily` + ‏`analytics_daily`, עמודת `orders.attribution`, כל ה-views (כולל `v_owner_dashboard` ו-`v_money_alarms`), ‏RLS.

### 2.9 ‏`034_vendors_unification.sql` (קובץ חדש)

1. יצירת שורת `suppliers` לכל `vendors` פעיל שאין לו מקבילה (מיפוי שדות + הערת מקור).
2. `coupon_deals.supplier_id` חדש + backfill מ-`vendor_id`; ‏`vendor_id` נשאר nullable-deprecated.
3. `coupon_deals.platform_percent`: ‏fallback דרך `suppliers.commission_percent` של הספק המקושר.
4. ניקוי RLS מצטבר: הסרת policies ‏005 הכפולים על `products`/`categories`, והסרת `vendors: owner manage`. [1.18]
5. `vendors` מוקפאת: policy כתיבה יחיד לאדמין, תיעוד שהיא לקריאה בלבד עד מחיקה.

### 2.10 בדיקות קדם (להריץ מול ה-DB החי לפני 026)

```sql
SELECT unnest(enum_range(NULL::public.order_status));       -- מצפים ל-partially_fulfilled, fulfilled
SELECT unnest(enum_range(NULL::public.order_item_status));  -- מצפים ל-issued, shipped, delivered
SELECT unnest(enum_range(NULL::public.product_type));       -- physical + coupon לפחות
SELECT unnest(enum_range(NULL::public.product_status));     -- האם sold_out קיים (נדרש לשלב הקטלוג)
SELECT to_regclass('public.suppliers'), to_regclass('public.coupon_codes');
SELECT proname FROM pg_proc WHERE proname IN ('check_user_rate_limit','audit_log_trigger_fn','is_admin');
SELECT column_name FROM information_schema.columns
 WHERE table_name='products' AND column_name IN ('name_he','platform_percent');
SELECT name, installed_version FROM pg_available_extensions WHERE name = 'pg_trgm';
```

אם ערך enum חסר (drift של 005/007): מיגרציית ADD VALUE ייעודית ונפרדת לפני הקובץ שצורך את הערך, לעולם לא בתוך אותו קובץ.

### 2.11 כללי החלה

1. אך ורק Supabase MCP בכלי `apply_migration`, קובץ אחרי קובץ, בסדר 026 → 027 → 028 → 029 → 030 → 031 → 032 → 033 → 034. אסור `db push`.
2. ההחלה מתבצעת בסשן אחד (כל הקבצים מוכנים אחרי עריכות סעיף 2); טבלאות שעוד אין להן UI פשוט ממתינות. 032 עצמאית וניתנת להחלה גם מוקדם יותר אם ייבוא ה-WP מקדים את הלוח, אבל ברירת המחדל היא הסדר המספרי.
3. אחרי הרצף כולו: `generate_typescript_types` ועדכון `src/types/database.ts` פעם אחת.
4. הטיוטות בריפו לא מוחלות כמות שהן: קודם מבצעים את העריכות. מסמך זה הוא ה-checklist.
5. אימות לפני החלה על המרוחק: ‏harness המיגרציות של מסמך הבדיקות (TESTING-CICD) מריץ את הרצף המלא פעמיים על ‏stack מקומי נקי (בדיקת idempotency) ומאמת `pg_policies` יציב. ה-stack המקומי הוא סביבת CI בלבד; ההחלה על המרוחק נשארת דרך MCP.

---

## 3. ERD מאוחד (כל טבלה והדומיין שלה)

סימון: `-> B` = ‏FK אל B. ‏(L) = legacy, קיים אך לא בונים עליו. ‏(P) = מתוכנן, אין קובץ. המספר = המיגרציה המגדירה/המרחיבה.

```
DOMAIN: זהות וחשבון
  auth.users (Supabase)
  profiles (001/003, +anonymized_at 029)     -> auth.users; role: user_role; supplier_id (L, sync בלבד)
  user_addresses (009)                       -> auth.users
  payment_tokens (001, מוקשח 029)            -> profiles; cardcom_token חסום לדפדפן; audit ייעודי
  account_deletion_requests (029)            -> auth.users; pending יחיד פר משתמש
  carts (001, unique חלקי 029)               -> profiles | session_id; items jsonb עד cutover [1.34]
  cart_items (026)                           -> carts, products, product_variants
  rate_limits (002)                          [IP]
  user_rate_limits (019)                     [user+action]

DOMAIN: קטלוג, חיפוש ו-SEO
  categories (005/012, +kind/rule/seo 030)   עץ עצמי, עומק 2; taxonomy|collection
  suppliers (005, מורחבת 027)                <- כל הכסף מפנה לכאן
  vendors (001/013) (L)                      רק coupon_deals; מוקפאת ב-034
  products (005/014/016, +026 percent,       -> suppliers, categories; search_vector; has_variants,
            +030 brand/seo/וריאציות)            variant_axes; low_stock_threshold
  product_variants (005/014/016, +030)       -> products; option_values (price_modifier deprecated)
  product_images (005)                       -> products, product_variants
  product_categories (030)                   -> products, categories (שיוך משני)
  attribute_definitions (030)                סכימת פילטרים
  category_attributes (030)                  -> categories, attribute_definitions
  coupon_deals (015, +026 percent,           -> vendors (L) + supplier_id (034); slug + search_vector
               +030 slug/seo, +034 supplier)
  hero_slides (017)
  search_synonyms (030)                      מילון הרחבת שאילתות
  search_queries (030)                       append-only; דוח אפס תוצאות
  seo_redirects (030)                        301/308/410; wordpress_import | slug_change | manual

DOMAIN: הזמנות ותשלומים
  orders (007, מורחבת 026, +attribution 033) -> auth.users, user_addresses; expires_at
  order_items (007, +026 snapshot,           -> orders, products, variants, suppliers;
               +027 shipping)                   snapshot: platform_percent, platform_fee_ils,
                                                supplier_due_ils, charged_on_site_ils,
                                                balance_due_at_business_ils
                                                (+commission_percent, supplier_payout_ils כתאומים L);
                                                shipping: carrier, tracking, shipped_at, delivered_at
  payments (026)                             -> orders, payment_tokens, payments (refund_of);
                                                cardcom_transaction_id UNIQUE = זהות העסקה [1.10]
  payment_webhook_events (026)               -> payments; UNIQUE(provider, external_event_id)

DOMAIN: ארנק (double-entry)
  wallet_accounts (026)                      -> auth.users | code פלטפורמה (cashback_reserve/revenue/adjustments)
  wallet_transactions (026)                  -> wallet_accounts x2, orders, order_items; append-only
  wallet_balances (006) (L)                  עד cutover
  wallet_transactions_legacy (006) (L)       read-only

DOMAIN: קופונים ומימוש
  coupon_codes (008, מורחבת 027)             -> products, order_items, auth.users, suppliers;
                                                snapshot: platform_percent, face_value_ils,
                                                platform_paid_ils, collect_amount_ils; qr_token, qr_key_id
  coupon_redemptions (026, policy ספק 027)   -> coupon_codes UNIQUE, order_items, suppliers, auth.users
  coupon_scan_events (027)                   -> coupon_codes, suppliers, auth.users; append-only; 90 יום

DOMAIN: ספקים והתחשבנות
  supplier_applications (027)                -> auth.users
  supplier_members (027)                     -> suppliers, auth.users; member_role; מקור ההרשאה [1.8]
  supplier_bank_accounts (027)               -> suppliers; חשבון פעיל יחיד
  payout_statements (027)                    -> suppliers; statement_number PS-######; bank_snapshot
  payout_statement_lines (027)               -> payout_statements, order_items, coupon_codes
  supplier_disputes (027)                    -> suppliers, payout_statements(+lines), order_items, coupon_codes
  cardcom_settlements (027)
  cardcom_settlement_txns (027)              -> cardcom_settlements; התאמה דרך payments [1.10]

DOMAIN: הפניות ושותפים
  referrals (010)                            -> auth.users x2, orders
  affiliates (010)                           -> auth.users

DOMAIN: AI Agents
  agent_prompts (028)                        גרסה פעילה אחת פר agent_key; kill switch
  agent_runs (028)                           -> agent_prompts, auth.users, suppliers
  agent_run_steps (028)                      -> agent_runs; append-only; 90 יום
  agent_flags (028)                          -> agent_runs; dedup חי פר (kind, entity)
  listing_drafts (028)                       -> suppliers, auth.users, agent_runs, products
  agent_escalations (028)                    -> agent_runs, auth.users, order_items

DOMAIN: התראות ושיווק
  user_notification_preferences (029, +031)  -> auth.users; בוליאנים פר ערוץ+נושא; locale
  notifications_outbox (029, +031 worker)    -> auth.users, notification_events, notification_templates;
                                                dedupe_key UNIQUE; claim/attempts/provider
  notification_events (031)                  append-only; אירועי דומיין; dedupe_key UNIQUE; שנה
  notification_templates (031)               גרסה פעילה פר (template_key, channel, locale)
  consent_events (031)                       -> auth.users; append-only; ראיה משפטית 30א; לנצח
  channel_suppressions (031)                 UNIQUE(channel, address); bounce/complaint/STOP
  notification_delivery_events (031)         -> notifications_outbox; UNIQUE(provider, external_event_id); 90 יום
  notification_conversions (031)             -> notifications_outbox, orders UNIQUE; ייחוס הכנסה
  v_notification_kpis, v_journey_revenue     views (security_invoker)

DOMAIN: אנליטיקה ו-BI
  analytics_event_definitions (033)          registry אירועים; מקור אמת לטקסונומיה; audit
  analytics_events (033)                     גולמי, PARTITION BY RANGE(occurred_at) חודשי;
                                                PK (occurred_at, event_id); 13 חודשים
  analytics_events_default (033)             partition ביטחון (חייב להישאר ריק; מנוטר ב-alarms)
  analytics_daily (033)                      רולאפ יומי (יום עסקים ישראלי); לנצח
  views: v_owner_dashboard, v_money_alarms, v_revenue_daily, v_refunds_daily,
         v_wallet_liability, v_wallet_ledger_drift [1.36], v_coupon_funnel_monthly,
         v_supplier_leaderboard_30d, v_cohort_ltv_monthly, v_channel_revenue_weekly,
         v_funnel_daily, v_search_quality_daily (מותנית ב-030)

SCHEMA: wp_import (032; ארכיון + staging, לא חשוף ל-PostgREST, service_role בלבד)
  import_batches, id_map, products, categories, customers, orders, order_items,
  coupons, vouchers, media, url_inventory, issues + v_reconciliation, v_open_issues
  השקות ל-public רק דרך סקריפטי שלב W: seo_redirects (030), שרשרת שוברים חיים (026/027),
  לקוחות דרך Auth Admin API (marketing_*=false)

DOMAIN: תפעול
  audit_log (011/025)                        append-only, אדמין SELECT בלבד; לנצח
  storage buckets: product-images, vendor-logos, category-icons (004), coupon-images (015),
                   products, coupons (021), supplier-docs (027, פרטי)
  drift: coupons (טבלת L חיה בפרודקשן, מחוץ לתכנון)

PLANNED (אין קובץ; לא חלק מהרצף הנוכחי; מספר לפי הפנוי בזמן הכתיבה)
  push_subscriptions (P)                     -> auth.users; endpoint UNIQUE; web|apns|fcm [1.26]
  verticals + orders.vertical (P)            רישום ורטיקלים + kill switch [1.30]
```

---

## 4. סדר בנייה: שלבים 2-5

כל צעד מציין: מיגרציות קדם + סעיפי המסמכים. מסלול התפעול (CI, ‏Sentry, גיבויים, פרויקט PROD, ‏cutover מ-WordPress) רץ במקביל לפי PRODUCTION-OPS סעיף 8 (P0 לפני שיגור), ומסלול הבדיקות לפי TESTING-CICD (צינור ‏ci.yml, מטריצת ‏RLS הצהרתית, ‏harness מיגרציות, ‏fake ל-Cardcom, ‏DoD פר שלב); שניהם אינם חוסמים את השלבים כאן, למעט האמור בהם במפורש. חובה אחת מוקדמת ממסמך הבדיקות: מודול הכסף הטהור `src/lib/money/` נכתב עם 22 מקרי הבדיקה שלו (M1-M22) לפני `beginCheckout` (שלב 3.2).

### שלב 2.0: תשתית (חד פעמי)

| צעד | תוכן | מקור |
|---|---|---|
| 2.0.1 | בדיקות קדם (2.10) מול ה-DB החי | כאן |
| 2.0.2 | ביצוע עריכות סעיף 2 בטיוטות 026-031 ו-033 + כתיבת 034 | כאן 2.1-2.9 |
| 2.0.3 | החלת 026→034 בסדר, ואז `generate_typescript_types` | כאן 2.11 |

### שלב 2: עגלה

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| 2.1 | שכתוב server actions של העגלה ל-`cart_items` (כתיבה כפולה ל-`carts.items` בתקופת המעבר [1.34]) | 026 | COMMERCE ‏2.2, 5.1 |
| 2.2 | החלפת `mergeGuestCart` בקריאת `rpc('fn_merge_guest_cart')` | 029 | ACCOUNT ‏2.3, 6 |

### שלב 3: ‏checkout + Cardcom

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| 3.1 | `requireUserSession()` ב-`lib/admin/rbac.ts` + אכיפת login בלחיצת תשלום | אין | ACCOUNT ‏2.2 |
| 3.2 | ספריית חישוב אגורות (round_half_up פר שורה) + `beginCheckout` (טרנזקציה: ולידציה, snapshot דרך `product_platform_percent`, orders+order_items+payments, ‏Low Profile) + rate limit ‏`begin_checkout` ‏fail-closed [1.29] | 026 | COMMERCE ‏4, 5.2, T4; OPS ‏4.2 |
| 3.3 | ‏webhook route: חתימה + אימות server-to-server, dedup, טרנזקציית paid (תשלום succeeded, חיוב ארנק, הנפקת `coupon_codes` + חתימת QR ‏[1.14], ‏cashback, מלאי, audit). ה-triggers של 031 פולטים `notification_events` אוטומטית | 026, 031 | COMMERCE ‏3.1-3.2, T2-T3; SUPPLIER ‏3.1; NOTIF ‏3.2 |
| 3.4 | `chargeWithToken` + ‏`refundPayment` (אדמין; קופון רק במצב issued) | 026 | COMMERCE ‏3.2, 5.2 |
| 3.5 | ‏crons: פקיעת הזמנות pending ‏(30 דק') + ‏reconcile ל-redirected מעל 10 דק' | 026 | COMMERCE ‏3.1-3.2 |
| 3.6 | צנרת התראות טרנזקציוניות v1: ‏cron ‏fanout (דקה) + ‏worker שליחה (Resend, ‏email+inapp) + פעמון in-app, כדי שאישור הזמנה נשלח מהיום הראשון | 029, 031 | NOTIF ‏3.1, 3.3; ACCOUNT ‏4.3 |

### שלב 4: אזור אישי

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| 4.1 | layout ‏`(account)` + ‏`/account/orders` + פירוט הזמנה (ציר זמן משלוח / מצב קופון) | 026, 029 | ACCOUNT ‏3.1 |
| 4.2 | `/account/wallet` ‏(feature detection ישן/חדש) | 026, 029 | ACCOUNT ‏3.2 |
| 4.3 | `/account/payment-methods` ‏(select עמודות מפורש; ברירת מחדל דרך `fn_set_default_payment_token`; הוספה דרך Low Profile) | 029 | ACCOUNT ‏3.3; סקיל cardcom-payments |
| 4.4 | `/account/profile` + כתובות + `/account/notifications` (העדפות + הסכמת שיווק דרך `fn_set_marketing_consent`, route הסרה חתום) | 029, 031 | ACCOUNT ‏3.4-3.5; NOTIF ‏4.1-4.3 |
| 4.5 | `/account/coupons` גרסה 1: קוד ידני + סטטוסים (QR יתווסף בשלב 5א) | 026, 029 | ACCOUNT ‏4.1 |
| 4.6 | `/account/privacy`: מחיקת חשבון (re-auth ‏15 דק', חלון 30 יום) + ‏cron מחיקה + ‏cron תזכורות פקיעה + הקשחת worker (retry/backoff/dead, ‏webhooks של ספק המשלוח ל-`notification_delivery_events`) | 029, 031 | ACCOUNT ‏2.4, 4.3, 5.4; NOTIF ‏3.3, 6.1 |

### שלב C (מסלול קטלוג/חיפוש/SEO; רץ במקביל לשלבים 3-4, אחרי 2.0)

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| C1 | העברת ‏route ‏`/product/[slug]` → ‏`/products/[slug]` + ‏301 + ‏lookup של `seo_redirects` ב-`src/proxy.ts` ‏[1.28] | 030 | CATALOG ‏3.2-3.3 |
| C2 | חיפוש: ‏UI + ‏`search_products`/`autocomplete_products` + ‏`log_search_query` + ‏fallback אפס תוצאות | 030 | CATALOG ‏2 |
| C3 | דפי listing: פילטרים (`category_facets`), מיון, ‏pagination ‏(24), ‏ISR לפי טבלת ה-cache | 030 | CATALOG ‏1.3, 4 |
| C4 | ‏SEO: ‏JSON-LD, ‏meta פר סוג דף, ‏canonical, ‏sitemaps + ‏robots, ‏OG ל-WhatsApp | 030 | CATALOG ‏3.4-3.8; OPS ‏2.4 |
| C5 | אדמין: מאפיינים (`attribute_definitions`), מילון מילים נרדפות, ‏redirects, אוספים חכמים (kind='collection') + ייבוא מפת WordPress | 030 | CATALOG ‏1.1, 1.3, 2.3; OPS ‏2.3 |

### שלב 5א: ספקים

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| 5.1 | ‏onboarding: טופס בקשה + תור אדמין (approve/reject) | 027, 034 | SUPPLIER ‏2.3 |
| 5.2 | פורטל: ‏dashboard, הזמנות למשלוח (`update_shipping_status`), הגדרות (בנק ל-owner, צוות) | 027 | SUPPLIER ‏4, 2.4-2.5 |
| 5.3 | מסך סריקה PWA ‏(`redeem_coupon`, ‏fail-closed ‏[1.29], ירוק/אדום, ‏offline banner) + שדרוג QR בהנפקה וב-`/account/coupons` | 027 | SUPPLIER ‏3; ACCOUNT ‏4.2 |
| 5.4 | דוחות: יצירה/אישור/תשלום (super_admin ב-action ‏[1.13]) + מחלוקות + ‏PDF ל-bucket | 027, 034 | SUPPLIER ‏5.1-5.2, 4.2 |
| 5.5 | ‏reconciliation ‏Cardcom (קליטת דוח, `reconcile_cardcom_settlement`, תור unmatched + התראת אדמין) + ‏cron ‏`expire_coupons` | 027 | SUPPLIER ‏5.3; OPS ‏5.3 |

### שלב 5ב: ‏AI Agents

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| 5.6 | ‏seed גרסאות prompt + ‏eval harness ‏(`evals/agents/`) + שערי כניסה | 028 | AGENTS ‏1.2, 1.6 |
| 5.7 | ‏shopping: ווידג'ט צ'אט + כלי קריאה ציבוריים (`search_products` מ-030 משמש גם כאן) + ‏SSE | 028, 030 | AGENTS ‏2 |
| 5.8 | ‏support: צ'אט `/account` עם ה-client של המשתמש + ‏refund intake | 028 | AGENTS ‏4 |
| 5.9 | ‏supplier_ops: טיוטת מוצר + ‏benchmark + אישור אדמין → ‏products draft | 028 | AGENTS ‏3 |
| 5.10 | ‏fraud_watch: גלאי SQL + טריאז' LLM + ‏cron יומי + מסך flags (גלאי ארנק אחרי cutover ‏026) | 028 | AGENTS ‏5 |

### שלב 5ג: אוטומציית שיווק

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| 5.11 | מסע עגלה נטושה (cron יומי 08:00 + מגעים 1h/24h) + ‏win-back רבעוני; מכסות תדירות ושעות שקט חיות | 031 | NOTIF ‏5.1, 5.3-5.5 |
| 5.12 | ייחוס הכנסות: פרמטר `?ke_n=<outbox_id>` + ‏cookie ‏7 ימים + ‏`notification_conversions`; דשבורד ‏KPI מה-views | 031 | NOTIF ‏6 |
| 5.13 | ‏WhatsApp: חיבור Meta Cloud API + תבניות + מיגרציית cutover שמחווטת `coupon_expiry_whatsapp` לתוך `fn_enqueue_coupon_expiry_reminders` ‏[1.23] | 031 + מיגרציה עתידית | NOTIF ‏2.2, 5.2 |
| 5.14 | ‏cron ‏retention חודשי לפי הרישום ‏[1.31] | 031, 033 | OPS ‏5.4 |

### שלב A (אנליטיקה; מתחיל אחרי שלב 3, במקביל לשאר)

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| A1 | ‏SDK לקוח + ‏route ‏`/api/a` ‏(batch עד 50, ‏120/דקה/IP) + ‏banner הסכמה + כתיבת `orders.attribution` ב-`beginCheckout` | 033 | ANALYTICS ‏2.1-2.3 |
| A2 | ‏crons: ‏rollup יומי ‏02:10, תחזוקת ‏partitions חודשית, קריאת ‏`v_money_alarms` + התראת אדמין | 033 | ANALYTICS ‏6; OPS ‏5.3 |
| A3 | דשבורד הבעלים (`v_owner_dashboard`) + עיון שבועי (כולל שימוש חוזר ב-`v_notification_kpis`/`v_journey_revenue` של 031) | 033 | ANALYTICS ‏4 |

### שלב W (ייבוא WordPress ו-cutover; לוח זמנים עצמאי)

לפי `docs/WP-DATA-MIGRATION-ARCHITECTURE.md` שלבים 0-5: גישה ו-dump → ‏032 מוחלת (כבר ברצף) → טעינת staging + ‏curation → הקרנה ל-public בסביבת dev (קטלוג/לקוחות: מיד; ‏redirects: אחרי 030; שוברים חיים: אחרי 026+027) → אימות (ספירות, checksums, ‏spot-checks, כיסוי `url_inventory` מלא) → ‏cutover ‏DNS לפי PRODUCTION-OPS ‏2. כל המיובאים ‏marketing_*=false ‏[חוק 30א].

### שלב 6 (עתידי, מחוץ להיקף הנוכחי)

‏PWA/מובייל שלב 1 (דורש מיגרציית push), חנויות אפליקציות (TWA/Capacitor), ורטיקלים, לפי SUPERAPP-MOBILE סעיף 6.

---

## 5. רישום חוצה-מערכת (מקור אמת יחיד)

### 5.1 תפקידים (RBAC)

| תפקיד | סוג | משמעות | אכיפה |
|---|---|---|---|
| `customer` | ‏`user_role` (ברירת מחדל) | לקוח | ‏RLS בעלות |
| `vendor` | ‏`user_role` | שער גס לניתוב `/supplier` בלבד; לא הרשאה | ‏proxy + ‏policies ישנים |
| `content_uploader` | ‏`user_role` | ניהול תוכן קטלוג (שורות שלו) | ‏has_role + ‏policies ‏014/025 |
| `admin` | ‏`user_role` | ניהול מלא | ‏`is_admin()` |
| `super_admin` | ‏`user_role` | כמו admin + כתיבת vendors ‏(013) + סימון דוח כשולם ‏[1.13] | ‏`has_role` + ‏server actions |
| `owner` | ‏`supplier_member_role` | בנק, צוות, מחלוקות, דוחות | ‏`is_supplier_owner()` |
| `manager` | ‏`supplier_member_role` | תפעול: הזמנות, סריקה, דוחות | ‏`is_supplier_member()` |
| `scanner` | ‏`supplier_member_role` | סריקה + צפייה בהזמנות בלבד | ‏`is_supplier_member()` + ‏UI |

חוק העל: הרשאת ספק נקבעת אך ורק ב-`supplier_members` ‏(is_active). ‏`profiles.supplier_id` הוא sync לאחור, אסור ב-policy חדש. ורטיקלים עתידיים משכפלים את התבנית (`courier_members`, `driver_members`), לא מוסיפים ערכי `user_role`.

פונקציות הרשאה: ‏`is_admin()`, ‏`has_role(text)` (היררכי: ‏customer < vendor < content_uploader < admin < super_admin), ‏`current_user_role()`, ‏`is_supplier_member(uuid)`, ‏`is_supplier_owner(uuid)`, ‏`current_supplier_id()`.
‏guards באפליקציה: ‏`requireAdminSession` (קיים), ‏`requireUserSession` (שלב 3.1), ‏`requireRecentAuth(15)` (שלב 4.6).
‏service role בלבד: ‏webhook ‏Cardcom, ‏webhooks של ספקי משלוח התראות (`fn_ingest_delivery_event`), ‏crons (פקיעות, מחיקות, תזכורות, ‏fanout, מסעות, ‏fraud, ‏retention), ‏`fn_log_agent_run`, ‏`fn_execute_account_deletion`, ‏`fn_unsubscribe_marketing`, ‏`expire_coupons`, כתיבת ‏`payment_tokens`.

### 5.2 ‏enums (כולם, עם הבעלים בסדר הסופי)

| enum | ערכים | בעלים | הערה |
|---|---|---|---|
| `user_role` | customer, content_uploader, vendor, admin, super_admin | 001/003 | |
| `product_type` | coupon, physical, service | 001/005 | ‏drift: ‏service אולי חסר בחי |
| `product_status` | draft, active, paused, sold_out, archived | 001/005 | ‏drift: ‏sold_out אולי חסר |
| `order_status` | pending, paid, partially_fulfilled, fulfilled, cancelled, refunded | 007 | |
| `order_item_status` | pending, issued, shipped, delivered, cancelled, refunded | 007 | |
| `coupon_status` | issued, used, expired, refunded | 008 | |
| `audit_action` | created, updated, deleted, restored, login, logout, permission_change, status_change, manual_override | 011 | |
| `referral_status` | pending, completed, rejected | 010 | |
| `affiliate_status` | pending_review, approved, rejected, suspended | 010 | |
| `payment_kind` | charge, token_charge, refund | 026 | |
| `payment_status` | initiated, redirected, succeeded, failed, cancelled, refunded | 026 | |
| `wallet_reason` | cashback_earn, order_spend, expire, refund_credit, referral_bonus, manual_adjust | 026 | ורטיקלים עתידיים מוסיפים ערכים במיגרציה ייעודית |
| `supplier_status` | active, suspended, closed | 027 | |
| `supplier_application_status` | pending, approved, rejected | 027 | |
| `supplier_member_role` | owner, manager, scanner | 027 | |
| **`payout_status`** | **draft, pending_approval, approved, paid, cancelled** | **027 בלבד** | הכרעה 1.1 |
| `payout_line_type` | physical_delivery, coupon_redemption, adjustment | 027 | |
| `dispute_status` | open, in_review, resolved_accepted, resolved_rejected | 027 | |
| `scan_result` | success, not_found, already_used, expired, refunded, wrong_supplier, unauthorized, rate_limited | 027 | |
| `settlement_match_status` | unmatched, matched, amount_mismatch | 027 | |
| `agent_key` | shopping, supplier_ops, support, fraud_watch | 028 | |
| `agent_run_status` | running, succeeded, failed, escalated, rejected | 028 | |
| `agent_flag_status` | open, reviewing, confirmed, dismissed | 028 | |
| `listing_draft_status` | draft, pending_admin, approved, rejected | 028 | |
| `escalation_status` | open, in_progress, resolved, dismissed | 028 | |
| `deletion_request_status` | pending, cancelled, completed | 029 | |
| **`notification_status`** | **queued, sent, failed, cancelled, dead, skipped** | **029 בלבד** | הכרעה 1.20; ‏031 לא נוגעת |
| ‏(L) ‏`vendor_status` | pending, active, suspended | 001 | מת: ‏013 עברה ל-text |
| ‏(L) ‏`wallet_tx_type` | earn, redeem, expire, refund | 006 | ‏legacy עד cutover |
| ‏(L) ‏`wallet_tx_source` | cashback, referral, manual | 006 | ‏legacy עד cutover |

סטים מבוססי CHECK (לא enum, אותו מעמד מחייב):
`notifications_outbox.channel`: ‏email, inapp, push, sms, whatsapp ‏(029, ‏[1.21]).
`consent_events`: ‏channel ‏(email, sms, whatsapp, all); ‏topic ‏(marketing, order_updates, coupon_expiry, wallet); ‏action ‏(opt_in, opt_out); ‏source ‏(account_page, checkout, unsubscribe_link, sms_reply, whatsapp_reply, complaint_webhook, admin) ‏(031).
`channel_suppressions.reason`: ‏hard_bounce, complaint, manual, stop_reply ‏(031).
`notification_delivery_events.event`: ‏delivered, bounced, complained, opened, clicked, read, failed ‏(031).
`categories.kind`: ‏taxonomy, collection ‏(030). ‏`attribute_definitions.value_type`: ‏text, number, boolean, enum ‏(030).
`search_queries.source`: ‏search, autocomplete, zero_fallback ‏(030). ‏`seo_redirects.source`: ‏manual, wordpress_import, slug_change; ‏status_code: ‏301, 302, 307, 308, 410 ‏(030).
`wallet_accounts.owner_type`: ‏user, platform ‏(026). שיטת מימוש: ‏camera, manual ‏(026/027).
`agent_runs.trigger`: ‏chat, form, cron, admin; ‏`agent_escalations.kind`: ‏general, refund_intake, complaint, sales; ‏severity: ‏low, medium, high ‏(028).
`analytics_events.source`: ‏web, pwa, server; ‏`analytics_event_definitions.origin`: ‏client, server, derived; שם אירוע לפי regex ‏`^[a-z][a-z0-9_]{2,49}$` ‏(033).
סטים פנימיים של `wp_import` (032, לא חשופים): ‏batches.kind, ‏id_map.entity, ‏media.status, ‏issues.severity וכו'; אינם חלק מה-API הציבורי.

### 5.3 סוגי אירועים

**‏audit_log:** הטיפוס הוא enum ‏`audit_action` ‏(9 ערכים). אין להוסיף ערכים בלי מיגרציה ייעודית; כל אירוע ממופה לתשעת הקיימים (`status_change` לשינויי סטטוס יזומים, ‏`manual_override` להתערבות אדמין). ה-writer היחיד: ‏`audit_log_trigger_fn()` ‏(025) + כתיבות יזומות מפונקציות definer.

טבלאות עם ה-trigger הגנרי: ‏products, vendors, profiles, coupon_deals ‏(baseline); ‏payments ‏(026); ‏suppliers, supplier_applications, supplier_members, supplier_bank_accounts, payout_statements, supplier_disputes ‏(027); ‏agent_prompts, agent_flags, listing_drafts, agent_escalations ‏(028); ‏account_deletion_requests ‏(029); ‏attribute_definitions, search_synonyms ‏(030); ‏notification_templates ‏(031); ‏analytics_event_definitions ‏(033).
חריג יחיד: ‏`payment_tokens` עם trigger ייעודי בלי הטוקן ‏(029) ‏[1.17].
לא מקבלות audit trigger (הן עצמן יומן append-only): ‏audit_log, wallet_transactions, coupon_scan_events, coupon_redemptions, agent_run_steps, payment_webhook_events, notifications_outbox, notification_events, consent_events, notification_delivery_events, notification_conversions, search_queries, analytics_events, analytics_daily, וכל סכימת wp_import.
מחיקת חשבון מנקה PII מתוך `changes`/`ip_address`/`user_agent` ‏(029).

**אירועי אנליטיקה (033):** מקור האמת הוא הטבלה `analytics_event_definitions`; ‏12 האירועים הקנוניים: ‏page_view, view_product, view_category, add_to_cart, remove_from_cart ‏(client); ‏begin_checkout ‏(server); ‏purchase, refund, coupon_scan, wallet_earn, wallet_spend, search ‏(derived: לעולם לא נכתבים ל-`analytics_events`, נגזרים מטבלאות האמת ב-views). אירוע חדש = שורה ב-registry, לא מיגרציה.
**התראות כסף (`v_money_alarms`):** ‏failed_payments_24h, invalid_webhook_signatures_24h, payments_stuck_redirected_10m, pending_orders_past_expiry_1h, wallet_ledger_drift_accounts, analytics_default_partition_rows.

**‏notification_events (event_type):** ‏order_paid, order_refunded, order_item_shipped, order_item_delivered, coupon_delivered, coupon_refunded ‏(031). ‏entity_type: ‏order, order_item, coupon_code.
**מפתחות kind/template_key ב-outbox:** הטרנזקציוניים = ששת ה-event_type; תזכורות: ‏coupon_expiry_7d, coupon_expiry_48h ‏(029); שיווק: ‏abandoned_cart_1, abandoned_cart_2, winback ‏(031). מפתחות שטוחים בלבד ‏[1.27].
**‏journey_key:** ‏abandoned_cart, winback ‏(+coupon_expiry לתזכורות; ‏direct כ-fallback ב-view).
**תבניות dedupe_key:** ‏`<event_type>:<entity_id>` לאירועים; ה-fanout מוסיף ‏`:<channel>`; תזכורות: ‏`coupon_expiry_7d:<id>`, ‏`coupon_expiry_48h:<channel>:<id>` ‏[1.22]; מסעות: ‏`abandoned_cart_1:<cart_id>:<update_date>`, ‏`winback:<user_id>:<year-quarter>`.

### 5.4 ‏rate limits (כולם)

תשתית: ‏`check_rate_limit(key, max, window)` ‏(002, לפי IP, ברירת מחדל 10 ל-3600 שניות); ‏`check_user_rate_limit(user, action, limit, window)` ‏(019, ברירת מחדל 100 ל-3600). מדיניות כשל RPC: ‏fail-closed לכסף, ‏fail-open לצ'אט ‏[1.29]; כל כשל מדווח ל-Sentry.

| action | מכסה | חלון | צרכן | כשל RPC | מקור |
|---|---|---|---|---|---|
| `coupon_scan` | **30** | 60 שניות | `redeem_coupon` | closed | הכרעה 1.7 |
| `begin_checkout` | 10 | 60 שניות | ‏`beginCheckout` ‏(app) | closed | הכרעה 1.29; OPS ‏4.2 |
| `account_deletion` | 3 | 24 שעות | ‏`fn_request_account_deletion` | closed | ACCOUNT ‏2.4 |
| `consent_change` | 20 | 3600 שניות | ‏`fn_set_marketing_consent` | open | NOTIF ‏4.2 |
| `agent_chat` | 20 | 3600 שניות | ‏shopping + ‏support ‏(app) | open | AGENTS ‏1.4 |
| `listing_draft` | 10 | 24 שעות | ‏supplier_ops ‏(app) | open | AGENTS ‏3 |
| ‏ingest אנליטיקה `/api/a` | 120 | 60 שניות (פר IP) | ‏SDK הלקוח | open (איבוד אירועים מותר) | ANALYTICS ‏2.1 |
| שכבת IP כללית | 10 | 3600 שניות | ‏auth + ‏routes רגישים | closed | 002 |

תקרות מדיניות (לא rate limit, אותו רישום):
כסף/הזמנות: כמות 1-99 לפריט בעגלה; פקיעת pending אחרי 30 דקות; ‏reconcile ל-redirected אחרי 10 דקות; חלון החזרה לפני settlement ‏14 יום; ‏payout_terms_days ברירת מחדל 15.
חשבון: חלון חרטה למחיקה 30 יום; ‏re-auth תקף 15 דקות.
התראות ושיווק: תזכורות פקיעה 7 ימים + 48 שעות עם dedupe; שעות שקט לשיווק 09:00-21:00 ‏Asia/Jerusalem, שישי עד 15:00, שבת מ-20:30; מכסת שיווק 1 ליום ו-3 לשבוע פר משתמש; ‏retry ‏backoff ‏5min×2^attempts עד 6 שעות, ‏dead אחרי 5 ניסיונות; נעילת worker נגנבת אחרי 10 דקות; עגלה נטושה: מגע 1 אחרי שעה, מגע 2 אחרי 24 שעות, חלון עד 72 שעות; ‏win-back: הזמנה אחרונה מעל 90 יום, פעם ברבעון; ‏SMS עד 134 תווים.
‏agents: צעדי כלים 6 (צ'אט) / 10 ‏(supplier_ops); ‏max_output_tokens ברירת מחדל 2048; ‏fraud_watch עד 50 מועמדות לריצה; עד 5 תמונות לטיוטה.
קטלוג: עמוד 24 מוצרים; ‏autocomplete ‏8 שורות, מינימום 2 תווים, ‏debounce ‏150ms; סף trigram ‏0.35; ‏low_stock_threshold ברירת מחדל 3; יעדי מעבר למנוע חיצוני: אפס-תוצאות מעל 12% חודשי או ‏p95 מעל 250ms או מעל ‏30k מוצרים פעילים.
אנליטיקה: ‏batch ‏ingest ‏1-50 אירועים; ‏props עד 4KB; חלון `occurred_at` ‏[עכשיו-7 ימים, עכשיו+5 דקות]; ‏IP נחתך ל-/24 (‏v4) או ‏/48 (‏v6); ‏rollup יומי ‏02:10 שעון ישראל; ‏partitions: יצירה חודשית מראש (2), הפלה אחרי 13 חודשים; ספי התראת משלוח התראות: ‏email מתחת ל-95%, ‏WhatsApp מתחת ל-90% ‏(031).
‏retention: לפי הכרעה 1.31 (כולל עדכון 1.37).

---

## 6. נספח: מיפוי מסמך → מיגרציה → שלב בנייה

| מסמך | מיגרציה | שלבי בנייה |
|---|---|---|
| COMMERCE | 026 (ערוכה) | 2, 3 |
| ACCOUNT-IDENTITY | 029 (ערוכה) | 2.2, 4 |
| SUPPLIER-REDEMPTION | 027 (ערוכה) + 034 | 5א |
| AI-AGENTS | 028 (ערוכה) | 5ב |
| CATALOG-SEARCH-SEO | 030 (ערוכה) | C |
| NOTIFICATIONS-MARKETING | 031 (ערוכה) | 3.6, 4.4, 4.6, 5ג |
| WP-DATA-MIGRATION | 032 (כמות שהיא) | W |
| ANALYTICS-BI | 033 (תיקון כותרת) | A |
| PRODUCTION-OPS | אין (תפעול) | מסלול מקביל; P0 לפני שיגור |
| TESTING-CICD | אין (בדיקות/CI) | מסלול מקביל; מודול הכסף לפני 3.2; harness לפני 2.0.3 |
| SUPERAPP-MOBILE | עתידיות (push, verticals) | שלב 6 |
| product-page | אין (אפיון UI) | C, ‏5א (שדה push לספק בוטל [1.26]) |
