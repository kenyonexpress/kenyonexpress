# MASTER ARCHITECTURE: מסמך האב המאוחד

מסמך הכרעות מחייב. מאחד את:
`docs/COMMERCE-ARCHITECTURE.md` (טיוטת 026),
`docs/SUPPLIER-REDEMPTION-ARCHITECTURE.md` (טיוטת 027),
`docs/AI-AGENTS-ARCHITECTURE.md` (טיוטת 028),
`docs/ACCOUNT-IDENTITY-ARCHITECTURE.md` (מפנה ל"029" שטרם נכתבה),
`docs/product-page/` (מאסטר דף מוצר),
ואת כל המיגרציות 001 עד 025 (מוחלות) + הטיוטות 026-028 (לא מוחלות).

תאריך: 2026-07-08. ענף: `phase5/homepage`.
סטטוס קבצים בפועל: קיימות טיוטות `026_commerce.sql`, `027_suppliers.sql`, `028_agents.sql` בלבד. `029_accounts.sql` מתוכננת במסמך החשבון אך לא נכתבה; "030" לא קיימת בשום מקום. מסמך זה מקצה להן מספרים סופיים.

כל סתירה בין מסמך זה למסמכי המקור: **מסמך זה גובר**. הטיוטות עצמן לא שונו; ההוראות כאן מגדirot מה לשנות בהן לפני החלה.

---

## 1. ביקורת סתירות (Conflict Audit): הכרעה לכל סתירה

### 1.1 התנגשות enum בשם `payout_status` (026 מול 027)

- 026 מגדירה: `('draft','approved','paid','cancelled')`.
- 027 מגדירה: `('draft','pending_approval','approved','paid','cancelled')`.
- שתיהן עטופות ב-guard של `duplicate_object`, כך שהשנייה שתרוץ תיכשל בשקט וה-casts שלה יתפוצצו בזמן ריצה.

**הכרעה:** הערך הקנוני הוא של 027 (חמשת הערכים, כולל `pending_approval`). הגדרת ה-enum נמחקת מ-026 לחלוטין ועוברת להיות בבעלות מיגרציית הספקים בלבד.

### 1.2 שני מנועי settlement מקבילים

- 026: `supplier_payouts` + `supplier_payout_items` + זרימת draft→approved→paid.
- 027: `payout_statements` + `payout_statement_lines` + `generate/approve/mark_paid/cancel` + מחלוקות + `bank_snapshot` + `statement_number` + שורות קופון אינפורמטיביות + שורות `adjustment`.

**הכרעה:** מנוע `payout_statements` של 027 הוא הקנוני. מ-026 נמחקים: סעיף 8 כולו (שתי הטבלאות), ה-RLS שלהן, וה-trigger בשם `audit_supplier_payouts`. סעיפים 2.7 ו-5.5 במסמך ה-commerce בטלים. פונקציות ה-server actions מקבלות את שמות 027: `generatePayoutStatement`, `approvePayoutStatement`, `markPayoutStatementPaid`, `cancelPayoutStatement`.

### 1.3 כפילות snapshot כספי על `order_items`

- 026 מוסיפה חמש עמודות חדשות: `platform_percent`, `platform_fee_ils`, `supplier_due_ils`, `charged_on_site_ils`, `balance_due_at_business_ils`, ומכריזה על `commission_percent`+`supplier_payout_ils` (מ-007) כ-deprecated.
- 027 בנויה הפוך: `generate_payout_statement` קוראת דווקא את `commission_percent` ו-`supplier_payout_ils` ומתעדת אותן כ"עמודות הייעודיות".

**הכרעה:** חמש העמודות של 026 הן הקנוניות (רק הן נושאות את פיצול הקופון: מה שולם באתר ומה נגבה בעסק). ה-checkout כותב את שתי המשפחות במקביל (`commission_percent = platform_percent`, `supplier_payout_ils = supplier_due_ils`) לתאימות דוחות ישנים. `generate_payout_statement` משוכתבת לקרוא `platform_fee_ils` + `supplier_due_ils` עם `COALESCE` לעמודות הישנות עבור שורות היסטוריות.

### 1.4 צורת `products.platform_percent`

- 026: `NOT NULL DEFAULT 10`.
- 027: nullable, עם שרשרת fallback: מוצר → `suppliers.commission_percent` → 10, דרך `product_platform_percent()`.

**הכרעה:** הצורה של 027 (nullable + fallback) היא הקנונית: היא היחידה שמשמרת משמעות לברירת מחדל פר ספק. בלוק העמודה ב-026 מוחלף בנוסח של 027, והפונקציה `product_platform_percent()` עוברת למיגרציית ה-commerce (היא תשתית checkout, ו-`suppliers` קיימת מ-005). ה-checkout קורא אך ורק דרך הפונקציה ומקפיא את התוצאה ב-snapshot.

### 1.5 `coupon_deals.platform_percent` מול העמודות המחושבות של 015

015 הגדירה על `coupon_deals` את `platform_price` כ-GENERATED (תמיד 10% מהמחיר) ואת `discount_percentage` כ-GENERATED (תמיד 90.00). 026 מוסיפה `platform_percent` דינמי, ואז שתי העמודות המחושבות משקרות לכל אחוז שאינו 10.

**הכרעה:** במיגרציית ה-commerce, `platform_price` ו-`discount_percentage` מומרות מעמודות GENERATED לעמודות רגילות (הערכים הקיימים נשמרים), והאפליקציה מחשבת אותן בכתיבה מתוך `platform_percent`. `coupon_deals.platform_percent` נשארת nullable עם fallback ל-10 (אין לה ספק קנוני עד איחוד vendors, סעיף 1.12).

### 1.6 שתי פונקציות מימוש ושתי טבלאות לוג

- 026: `fn_redeem_coupon` (RETURNS TABLE, הרשאה דרך `profiles.supplier_id`+role, כותבת `coupon_redemptions` בהצלחה בלבד).
- 027: `redeem_coupon` (RETURNS jsonb, הרשאה דרך `supplier_members`, כותבת `coupon_scan_events` על כל ניסיון כולל כשלונות, אנטי-אנומרציה).

**הכרעה:** `redeem_coupon` של 027 היא נקודת המימוש היחידה, בתוספת אחת: בהצלחה היא מוסיפה גם שורת `coupon_redemptions` (ה-UNIQUE על `coupon_code_id` הוא מחסום ה-replay השני והבלתי תלוי מ-T1, וה-RLS שלה נותן לבעל הקופון לראות את המימוש שלו). `fn_redeem_coupon` נמחקת מ-026. טבלת `coupon_redemptions` נשארת ב-026 (owner read + admin read); policy הקריאה לספק עובר למיגרציית הספקים ומבוסס `is_supplier_member`. שתי הטבלאות חיות זו לצד זו בתפקידים שונים: `coupon_scan_events` = יומן ניסיונות (כולל fraud), `coupon_redemptions` = רשומת אמת של מימוש.

### 1.7 rate limit לסריקה: 20 מול 30 לדקה

**הכרעה:** 30 לדקה (027). המספר 20 נמחק מכל מקום.

### 1.8 מודל ההרשאה לספק: `profiles.supplier_id` מול `supplier_members`

026 כותבת policies על בסיס `profiles.supplier_id` + `role IN ('vendor','content_uploader')`. 027 קובעת ש-`supplier_members` הוא מקור האמת. 028 מגדרת עם `is_supplier_member_compat` שעובדת בשני המצבים.

**הכרעה:** חברות (`supplier_members` + `is_supplier_member/is_supplier_owner`) היא מודל ההרשאה היחיד לספקים. כל policy בסגנון 026 משוכתב לחברות. `profiles.supplier_id` נשאר מסונכרן לאחור בלבד ואסור להשתמש בו ב-policy חדש. `is_supplier_member_compat` נמחקת מ-028: בסדר הקנוני מיגרציית הספקים קודמת למיגרציית ה-agents, אז `is_supplier_member` קיימת תמיד.

### 1.9 מימוש בידי אדמין

026 מאפשרת לאדמין לממש קופון של כל ספק (`public.is_admin() OR ...` בתוך ה-UPDATE). 027 לא.

**הכרעה:** אין עקיפת אדמין. מימוש כפוף לחברות בלבד (027). אדמין שצריך לממש מצרף את עצמו כ-member. זה משאיר את ה-audit trail נקי ואת ה-anti-enumeration עקבי.

### 1.10 זהות עסקת Cardcom: `payments.cardcom_transaction_id` מול `orders.cardcom_payment_id`

026 יוצרת את `payments` עם `cardcom_transaction_id UNIQUE` (נכתב רק על ידי webhook מאומת). 027 בונה את ה-reconciliation על `orders.cardcom_payment_id` (עמודת 007, בלי unique), והשאלה הפתוחה 9.7 שלה תוהה על ייחודיות.

**הכרעה:** `payments` היא הרשומה הקנונית של כל עסקת Cardcom. `reconcile_cardcom_settlement` משוכתבת: JOIN על `payments.cardcom_transaction_id` (בסטטוס `succeeded`), וההזמנה נגזרת מ-`payments.order_id`; fallback ל-`orders.cardcom_payment_id` רק לשורות שקדמו ל-`payments`. שאלה 9.7 סגורה: הייחודיות קיימת ב-`payments`. `orders.cardcom_payment_id` נשאר write-through לתאימות בלבד.

### 1.11 מקור ברירת המחדל לעמלה: `vendors.commission_rate` מול `suppliers.commission_percent`

מסמך ה-commerce מדבר על `vendors.commission_rate` כברירת מחדל לטופס (ושאלה O1: ‏10 או 90). מסמך הספקים בונה על `suppliers.commission_percent`.

**הכרעה:** `suppliers.commission_percent` הוא ברירת המחדל היחידה פר ספק. `vendors.commission_rate` מת (vendors היא legacy). O1 סגורה: `platform_percent` פירושו תמיד **חלק הפלטפורמה**, ברירת מחדל 10; המספר 90 בטופס האדמין היה תצוגת חלק הספק ויש להפוך אותו ב-UI, לא בסכימה.

### 1.12 כפילות ישויות `vendors` מול `suppliers`

כל ה-FK הכספיים (products, order_items, coupon_codes) מפנים ל-`suppliers`; רק `coupon_deals.vendor_id` מפנה ל-`vendors`. ה-policy מ-014 ("products: vendor read own") משווה `products.supplier_id` מול `vendors.id`, השוואה שבורה בין טבלאות (027 כבר מחליפה אותה).

**הכרעה:** `suppliers` קנונית. נקבעת מיגרציית איחוד ייעודית (029 בסדר הסופי, סעיף 2): יצירת שורת supplier לכל vendor פעיל, הוספת `coupon_deals.supplier_id` + backfill, הפיכת `vendor_id` ל-deprecated‏ (nullable, לא נקרא). `vendors` נשארת read-only עד מחיקה עתידית. האיחוד מוחל לפני בניית UI הפורטל (המלצת שאלה 9.1 של מסמך הספקים מתקבלת).

### 1.13 מי מסמן דוח כשולם

מסמך ה-commerce (5.5): `markPayoutPaid` בהרשאת super_admin בלבד. פונקציית 027: `is_admin()`.

**הכרעה:** שתי שכבות. ב-DB נשאר `is_admin()` (כמו 027). ב-server action נאכף `super_admin` בלבד. כסף שיוצא מהחברה דורש את הדרגה הגבוהה, אבל אין צורך לסבך את הפונקציה.

### 1.14 היכן נוצר קופון ומי חותם QR

מסמך ה-commerce (3.1): קודי קופון נוצרים בתוך טרנזקציית ה-webhook של המעבר ל-paid. מסמך הספקים (7.1): הנפקה + חתימת `qr_token` ב-server action עם מפתח Ed25519 מ-env.

**הכרעה:** אין סתירה אמיתית אלא חלוקת עבודה, והיא נקבעת כך: יצירת שורות `coupon_codes` (כולל snapshot כספי: `platform_percent`, `face_value_ils`, `platform_paid_ils`, `collect_amount_ils`) קורית בתוך טרנזקציית ה-webhook. חתימת ה-QR קורית באותו server action של ה-webhook, לפני ה-commit, כי המפתח הפרטי חי רק ב-env של השרת ולא ב-DB. אם החתימה נכשלת הטרנזקציה לא נכשלת: `qr_token` נשאר NULL ומושלם על ידי job (הקוד הידני תקף תמיד).

### 1.15 בעלות על `handle_new_user`

023 תיקנה אותה, 026 מחליפה אותה (מוסיפה `wallet_accounts`), מסמך החשבון נמנע בכוונה מלגעת בה ומוסיף trigger נפרד על `profiles` להעדפות התראות.

**הכרעה:** הגרסה של 026 היא הקנונית והיחידה שמחליפה את הפונקציה. מיגרציית החשבון מוסיפה trigger עצמאי בלבד. שום מיגרציה אחרת לא נוגעת ב-`handle_new_user`. ה-insert הישן ל-`wallet_balances` נשאר עד cutover הקוד ואז מוסר במיגרציה עתידית.

### 1.16 שימוש חוזר בשם `wallet_transactions`

026 משנה שם ל-006 (`wallet_transactions_legacy`) ויוצרת טבלה חדשה באותו שם עם סכימה אחרת. ה-policies הישנים נודדים עם הטבלה, כולל `wallet_transactions_admin_all` שמאפשר כתיבת אדמין.

**הכרעה:** נשאר כמו 026, בתוספת חובה: מיד אחרי ה-RENAME מוסרים מה-legacy את policy הכתיבה של האדמין (נשאר SELECT בלבד לכולם). ה-ledger החדש append-only ללא כל policy כתיבה, כולל אדמין. ה-UI עובד ב-feature detection (מסמך החשבון 3.2) עד סיום ה-cutover.

### 1.17 audit גנרי מול `payment_tokens`

התבנית הרווחת היא ה-trigger הגנרי מ-025 על כל טבלה רגישה. אבל ה-trigger הגנרי מתעד את השורה כולה ב-`changes`, כלומר היה שופך `cardcom_token` גולמי ל-audit_log.

**הכרעה:** על `payment_tokens` אסור לחבר את ה-trigger הגנרי לעולם. מיגרציית החשבון מתקינה trigger ייעודי שמתעד את הפעולה בלי עמודת הטוקן (כמסמך החשבון 5.1.3). זה החריג היחיד לתבנית.

### 1.18 הצטברות RLS חופפת מהמיגרציות הישנות

- `products`: שכבות 005 + 014 + 025 חיות במקביל (policies כפולים ל-SELECT ולכתיבה).
- `categories`: שכבות 005 + 012 במקביל.
- `vendors`: ‏001 `vendors: owner manage` (FOR ALL) חי לצד policies של 013 שהתכוונו להגביל כתיבה ל-super_admin, כלומר בעל vendor עדיין יכול לערוך את השורה שלו.

**הכרעה:** מיגרציית האיחוד (029 בסדר הסופי) מוסיפה סעיף ניקוי: הסרת `products_public_read`/`products_admin_write` (005), `categories_public_read`/`categories_admin_write` (005), ו-`vendors: owner manage` (001). הגרסאות המאוחרות (012/014/025) נשארות מקור אמת יחיד.

### 1.19 קבצים שהמסמכים מפנים אליהם ולא קיימים

מסמך החשבון מפנה ל-`029_accounts.sql` שלא נכתבה. "030" לא קיימת. בנוסף מסמך ה-agents מזהיר שהתנגשות 026/027 חוסמת החלה.

**הכרעה:** טבלת המספור הסופית בסעיף 2 סוגרת את זה: מיגרציית החשבון נכתבת כ-`027_accounts.sql` (לא 029), והחסימה של מסמך ה-agents מסולקת על ידי ההכרעות 1.1-1.3.

### 1.20 רשימת drift מול ה-DB החי (לא סתירת מסמכים, חובה לבדוק לפני החלה)

1. טבלת `coupons` קיימת בפרודקשן למרות ש-008 מוחקת אותה בקבצים (כולל אולי trigger בשם `audit_coupons` חי). לא נוגעים בה; לא בונים עליה.
2. `product_type` ייתכן בעל 2 ערכים בלבד (`physical`,`coupon`) אם 001 רצה לפני 005 (הערך `service` אולי חסר). ה-drafts משתמשים רק ב-`physical`/`coupon`, אז אין חסימה; אם יידרש `service`, זו מיגרציית `ALTER TYPE ... ADD VALUE` נפרדת ועצמאית.
3. `product_status` ייתכן בלי `sold_out` מאותה סיבה. לא בשימוש ב-drafts.
4. היסטוריית המיגרציות במרוחק לא מסונכרנת: החלה אך ורק דרך Supabase MCP ‏`apply_migration`, לעולם לא `db push`.
5. תנאים מוקדמים חיים שאומתו: 016 (`name_he`), 019 (`check_user_rate_limit`), 025 (`audit_log_trigger_fn`).

---

## 2. סדר מיגרציות קנוני

עיקרון: כל קובץ = טרנזקציה אחת של `apply_migration`. אין `ALTER TYPE ... ADD VALUE` באף קובץ (כל ה-enums החדשים הם CREATE TYPE, בטוח באותה טרנזקציה). כל קובץ idempotent.

| # סופי | קובץ | מקור | מה נעשה בו |
|---|---|---|---|
| 026 | `026_commerce.sql` | עריכת הטיוטה הקיימת | ראו פירוט למטה |
| 027 | `027_accounts.sql` | קובץ חדש (מסעיף 6 של מסמך החשבון; המסמך קרא לו "029") | ללא שינוי תוכן מהותי מהמסמך |
| 028 | `028_suppliers.sql` | הטיוטה `027_suppliers.sql`, משונה שם + נערכת | ראו פירוט למטה |
| 029 | `029_vendors_unification.sql` | קובץ חדש | איחוד vendors→suppliers + ניקוי RLS ישן |
| 030 | `030_agents.sql` | הטיוטה `028_agents.sql`, משונה שם + עריכה קטנה | ראו פירוט למטה |

### 2.1 עריכות ל-`026_commerce.sql` (מהטיוטה הקיימת)

נמחק:
1. בלוק ה-enum ‏`payout_status` (עובר ל-028 בגרסת 5 הערכים). [1.1]
2. סעיף 8 כולו: `supplier_payouts`, `supplier_payout_items`, ה-RLS שלהן, `audit_supplier_payouts`. [1.2]
3. הפונקציה `fn_redeem_coupon` וה-REVOKE שלה (הטבלה `coupon_redemptions` נשארת). [1.6]
4. ה-policy ‏"redemptions: supplier read" (מבוסס `profiles.supplier_id`; עובר ל-028 בגרסת חברות). [1.8]

משתנה:
5. `products.platform_percent` הופך ל-nullable בנוסח 027, כולל ה-COMMENT. [1.4]
6. `coupon_deals.platform_percent` הופך ל-nullable ‏(fallback 10 באפליקציה) + המרת `platform_price` ו-`discount_percentage` מ-GENERATED לעמודות רגילות. [1.5]
7. נוספת הפונקציה `product_platform_percent()` (מועתקת מהטיוטה של הספקים). [1.4]
8. אחרי ה-RENAME של הארנק הישן: הסרת policy הכתיבה `wallet_transactions_admin_all` מהטבלה ה-legacy. [1.16]

נשאר כמות שהוא: enums ‏`payment_kind`/`payment_status`/`wallet_reason`, ‏`cart_items`, הרחבות `orders`/`order_items` (כולל חמשת עמודות ה-snapshot + backfill), `payments` + `payment_webhook_events`, ארנק double-entry ‏(`wallet_accounts`, `wallet_transactions`, `fn_wallet_transfer`, seed חשבונות פלטפורמה), `handle_new_user` המורחבת, `coupon_redemptions` (טבלה + owner/admin read), audit trigger על `payments`.

### 2.2 ‏`027_accounts.sql` (חדש)

בדיוק תכולת סעיף 6 של מסמך החשבון: enums ‏`deletion_request_status`/`notification_status`; ‏`profiles.anonymized_at`; ‏`user_notification_preferences` + trigger יצירה + backfill; ‏`account_deletion_requests`; ‏`notifications_outbox`; הקשחת `payment_tokens` (ביטול policy ‏"owner all", הרשאות עמודה בלי `cardcom_token`, ‏owner SELECT/DELETE בלבד, `fn_set_default_payment_token`, ‏audit ייעודי בלי הטוקן [1.17]); ‏`fn_merge_guest_cart` + דה-דופליקציה + unique חלקי על `carts(profile_id)`; פונקציות המחיקה `fn_request/cancel/execute_account_deletion`; ‏`fn_enqueue_coupon_expiry_reminders`.

הערת תלות: הקובץ רץ אחרי 026, ולכן `fn_execute_account_deletion` רשאית להפנות ל-`payments`/`coupon_redemptions` בלי guards.

### 2.3 עריכות ל-`028_suppliers.sql` (הטיוטה `027_suppliers.sql` בשמה החדש)

נמחק:
1. בלוק `ALTER TABLE products ADD COLUMN platform_percent` וה-COMMENT (כבר ב-026). [1.4]

משתנה:
2. `redeem_coupon`: בענף ההצלחה נוסף `INSERT INTO coupon_redemptions (...)` עם `amount_collected_ils = collect_amount_ils`. [1.6]
3. נוסף policy קריאת ספק על `coupon_redemptions` מבוסס `is_supplier_member`. [1.8]
4. `generate_payout_statement`: שורות physical קוראות `COALESCE(oi.platform_fee_ils, oi.total_price_ils - oi.supplier_payout_ils)` ו-`COALESCE(oi.supplier_due_ils, oi.supplier_payout_ils)`. [1.3]
5. `reconcile_cardcom_settlement`: התאמה דרך `payments.cardcom_transaction_id` (status ‏succeeded) והפניית `order_id` מ-`payments.order_id`; ‏fallback ל-`orders.cardcom_payment_id`. [1.10]

נשאר כמות שהוא: כל השאר, כולל `payout_status` בגרסת 5 הערכים (עכשיו המגדיר היחיד), `supplier_members` + פונקציות החברות, `supplier_applications`, `supplier_bank_accounts`, עמודות snapshot + QR על `coupon_codes`, ‏`coupon_scan_events`, ‏`update_shipping_status`, פונקציות ה-onboarding, מנוע `payout_statements`, ‏`cardcom_settlements`, ‏`supplier_disputes`, כל ה-RLS וה-audit triggers, ו-bucket ‏`supplier-docs`.

### 2.4 ‏`029_vendors_unification.sql` (חדש)

1. יצירת שורת `suppliers` לכל `vendors` פעיל שאין לו מקבילה (מיפוי שדות + הערת מקור).
2. `coupon_deals.supplier_id` חדש + backfill מ-`vendor_id` דרך המיפוי; ‏`vendor_id` נשאר nullable-deprecated.
3. `coupon_deals.platform_percent` מקבל fallback חדש: ‏`suppliers.commission_percent` של הספק המקושר.
4. ניקוי RLS מצטבר: הסרת policies ‏005 הכפולים על `products`/`categories`, והסרת `vendors: owner manage`. [1.18]
5. `vendors` מוקפאת: policy כתיבה יחיד לאדמין, תיעוד שהיא לקריאה בלבד עד מחיקה.

### 2.5 עריכות ל-`030_agents.sql` (הטיוטה `028_agents.sql` בשמה החדש)

1. מחיקת `is_supplier_member_compat`; ה-policy של `listing_drafts` עובר ל-`is_supplier_member` (קיימת מ-028 החדשה). [1.8]
2. כל השאר נשאר כמות שהוא.

### 2.6 בדיקות קדם (לא מיגרציה, להריץ מול ה-DB החי לפני 026)

```sql
SELECT unnest(enum_range(NULL::public.order_status));       -- מצפים ל-partially_fulfilled, fulfilled
SELECT unnest(enum_range(NULL::public.order_item_status));  -- מצפים ל-issued, shipped, delivered
SELECT unnest(enum_range(NULL::public.product_type));       -- physical + coupon לפחות
SELECT to_regclass('public.suppliers'), to_regclass('public.coupon_codes');
SELECT proname FROM pg_proc WHERE proname IN ('check_user_rate_limit','audit_log_trigger_fn','is_admin');
SELECT column_name FROM information_schema.columns
 WHERE table_name='products' AND column_name IN ('name_he','platform_percent');
```

אם ערך enum חסר (drift של 005/007): מיגרציית `ALTER TYPE ... ADD VALUE` ייעודית ונפרדת לפני 026, לעולם לא בתוך קובץ שמשתמש בערך.

---

## 3. ERD מאוחד (כל טבלה והדומיין שלה)

סימון: `A -> B` = ‏FK מ-A אל B. ‏(L) = legacy, קיים אך לא בונים עליו. המספר בסוגריים = המיגרציה המגדירה בסדר הסופי.

```
DOMAIN: זהות וחשבון
  auth.users (Supabase)
  profiles (001/003)                 -> auth.users; role: user_role; supplier_id (L, sync בלבד); anonymized_at (027)
  user_addresses (009)               -> auth.users
  payment_tokens (001, מוקשח 027)    -> profiles; cardcom_token חסום לדפדפן
  user_notification_preferences (027)-> auth.users
  account_deletion_requests (027)    -> auth.users
  notifications_outbox (027)         -> auth.users; dedupe_key UNIQUE
  carts (001)                        -> profiles | session_id; unique חלקי על profile_id (027)
  cart_items (026)                   -> carts, products, product_variants
  rate_limits (002)                  [IP]
  user_rate_limits (019)             [user+action]

DOMAIN: קטלוג
  categories (005/012, עץ עצמי)
  suppliers (005, מורחבת 028)        <- כל הכסף מפנה לכאן
  vendors (001/013) (L)              רק coupon_deals; מוקפאת ב-029
  products (005/014/016)             -> suppliers, categories; platform_percent (026, nullable)
  product_variants (005/014/016)     -> products
  product_images (005)               -> products, product_variants
  coupon_deals (015)                 -> vendors (L) + supplier_id (029); platform_percent (026)
  hero_slides (017)

DOMAIN: הזמנות ותשלומים
  orders (007, מורחבת 026)           -> auth.users, user_addresses; paid/cancelled/refunded/expires_at
  order_items (007, מורחבת 026+028)  -> orders, products, variants, suppliers;
                                        snapshot: platform_percent, platform_fee_ils, supplier_due_ils,
                                        charged_on_site_ils, balance_due_at_business_ils
                                        (+commission_percent, supplier_payout_ils כתאומים L);
                                        shipping: carrier, tracking, shipped_at, delivered_at (028)
  payments (026)                     -> orders, payment_tokens, payments (refund_of);
                                        cardcom_transaction_id UNIQUE = זהות העסקה הקנונית
  payment_webhook_events (026)       -> payments; UNIQUE(provider, external_event_id)

DOMAIN: ארנק (double-entry)
  wallet_accounts (026)              -> auth.users | code פלטפורמה (cashback_reserve/revenue/adjustments)
  wallet_transactions (026)          -> wallet_accounts x2, orders, order_items; append-only
  wallet_balances (006) (L)          עד cutover
  wallet_transactions_legacy (006) (L) read-only

DOMAIN: קופונים ומימוש
  coupon_codes (008, מורחבת 028)     -> products, order_items, auth.users, suppliers;
                                        snapshot: platform_percent, face_value_ils, platform_paid_ils,
                                        collect_amount_ils; qr_token, qr_key_id
  coupon_redemptions (026)           -> coupon_codes UNIQUE, order_items, suppliers, auth.users
  coupon_scan_events (028)           -> coupon_codes, suppliers, auth.users; append-only

DOMAIN: ספקים והתחשבנות
  supplier_applications (028)        -> auth.users
  supplier_members (028)             -> suppliers, auth.users; member_role
  supplier_bank_accounts (028)       -> suppliers; חשבון פעיל יחיד
  payout_statements (028)            -> suppliers; statement_number PS-######; bank_snapshot
  payout_statement_lines (028)       -> payout_statements, order_items, coupon_codes
  supplier_disputes (028)            -> suppliers, payout_statements(+lines), order_items, coupon_codes
  cardcom_settlements (028)
  cardcom_settlement_txns (028)      -> cardcom_settlements, orders (דרך payments, ראו 1.10)

DOMAIN: הפניות ושותפים
  referrals (010)                    -> auth.users x2, orders
  affiliates (010)                   -> auth.users

DOMAIN: AI Agents
  agent_prompts (030)                גרסה פעילה אחת פר agent_key
  agent_runs (030)                   -> agent_prompts, auth.users, suppliers
  agent_run_steps (030)              -> agent_runs; append-only
  agent_flags (030)                  -> agent_runs; dedup חי פר (kind, entity)
  listing_drafts (030)               -> suppliers, auth.users, agent_runs, products
  agent_escalations (030)            -> agent_runs, auth.users, order_items

DOMAIN: תפעול
  audit_log (011/025)                append-only, אדמין SELECT בלבד
  storage buckets: product-images, vendor-logos, category-icons (004), coupon-images (015),
                   products, coupons (021), supplier-docs (028, פרטי)
  drift: coupons (טבלת L חיה בפרודקשן, מחוץ לתכנון)
```

---

## 4. סדר בנייה: שלבים 2-5

כל צעד מציין: מיגרציות קדם + סעיפי המסמכים.

### שלב 2: עגלה

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| 2.0 | בדיקות קדם (2.6) + החלת `026_commerce` + ‏`generate_typescript_types` | 016/019/025 חיות | כאן 2.6 |
| 2.1 | שכתוב server actions של העגלה ל-`cart_items` (המרה הדרגתית מ-jsonb) | 026 | COMMERCE ‏2.2, 5.1 |
| 2.2 | החלת `027_accounts` + החלפת `mergeGuestCart` בקריאת `rpc('fn_merge_guest_cart')` | 026, 027 | ACCOUNT ‏2.3, 6 |

### שלב 3: ‏checkout + Cardcom

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| 3.1 | `requireUserSession()` ב-`lib/admin/rbac.ts` + אכיפת login בלחיצת תשלום | אין | ACCOUNT ‏2.2 |
| 3.2 | ספריית חישוב אגורות (round_half_up פר שורה) + `beginCheckout` (טרנזקציה: ולידציה, snapshot דרך `product_platform_percent`, orders+order_items+payments, ‏Low Profile) | 026 | COMMERCE ‏4, 5.2, T4 |
| 3.3 | ‏webhook route: חתימה + אימות server-to-server, dedup, טרנזקציית paid (תשלום succeeded, חיוב ארנק, הנפקת `coupon_codes` + חתימת QR ‏[1.14], ‏cashback, מלאי, audit) | 026 | COMMERCE ‏3.1-3.2, T2-T3; SUPPLIER ‏3.1 |
| 3.4 | `chargeWithToken` + ‏`refundPayment` (אדמין; קופון רק במצב issued) | 026 | COMMERCE ‏3.2, 5.2 |
| 3.5 | ‏crons: פקיעת הזמנות pending‏ (30 דק') + ‏reconcile ל-redirected מעל 10 דק' | 026 | COMMERCE ‏3.1-3.2 |

### שלב 4: אזור אישי

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| 4.1 | layout ‏`(account)` + ‏`/account/orders` + פירוט הזמנה (ציר זמן משלוח / מצב קופון) | 026, 027 | ACCOUNT ‏3.1 |
| 4.2 | `/account/wallet` ‏(feature detection ישן/חדש) | 026, 027 | ACCOUNT ‏3.2 |
| 4.3 | `/account/payment-methods` ‏(select עמודות מפורש; ברירת מחדל דרך fn; הוספה דרך Low Profile) | 027 | ACCOUNT ‏3.3; סקיל cardcom-payments |
| 4.4 | `/account/profile` + כתובות + `/account/notifications` | 027 | ACCOUNT ‏3.4-3.5 |
| 4.5 | `/account/coupons` גרסה 1: קוד ידני + סטטוסים (QR יתווסף ב-5א אחרי 028) | 026, 027 | ACCOUNT ‏4.1 |
| 4.6 | `/account/privacy`: מחיקת חשבון (re-auth ‏15 דק', חלון 30 יום) + ‏cron מחיקה + ‏cron תזכורות פקיעה + ‏worker ‏outbox | 027 | ACCOUNT ‏2.4, 4.3, 5.4 |

### שלב 5א: ספקים

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| 5.1 | החלת `028_suppliers` ואז `029_vendors_unification` + טיפוסים | 026, 027 | כאן 2.3-2.4 |
| 5.2 | ‏onboarding: טופס בקשה + תור אדמין (approve/reject) | 028 | SUPPLIER ‏2.3 |
| 5.3 | פורטל: ‏dashboard, הזמנות למשלוח (`update_shipping_status`), הגדרות (בנק ל-owner, צוות) | 028 | SUPPLIER ‏4, 2.4-2.5 |
| 5.4 | מסך סריקה PWA ‏(`redeem_coupon`, ירוק/אדום, ‏offline banner) + שדרוג QR בהנפקה וב-`/account/coupons` | 028 | SUPPLIER ‏3; ACCOUNT ‏4.2 |
| 5.5 | דוחות: יצירה/אישור/תשלום (super_admin ב-action ‏[1.13]) + מחלוקות + ‏PDF ל-bucket | 028, 029 | SUPPLIER ‏5.1-5.2, 4.2 |
| 5.6 | ‏reconciliation ‏Cardcom (קליטת דוח, `reconcile_cardcom_settlement`, תור unmatched) + ‏cron ‏`expire_coupons` | 028 | SUPPLIER ‏5.3 |

### שלב 5ב: ‏AI Agents

| צעד | תוכן | קדם | מסמך |
|---|---|---|---|
| 5.7 | החלת `030_agents` + טיפוסים + ‏seed גרסאות prompt | 028 (חברות) | AGENTS ‏1 |
| 5.8 | ‏eval harness ‏(`evals/agents/`) + שערי כניסה | אין | AGENTS ‏1.6 |
| 5.9 | ‏shopping: ווידג'ט צ'אט + כלי קריאה ציבוריים + ‏SSE | 030 | AGENTS ‏2 |
| 5.10 | ‏support: צ'אט `/account` עם ה-client של המשתמש + ‏refund intake | 030 | AGENTS ‏4 |
| 5.11 | ‏supplier_ops: טיוטת מוצר + ‏benchmark + אישור אדמין -> ‏products draft | 030 | AGENTS ‏3 |
| 5.12 | ‏fraud_watch: גלאי SQL + טריאז' LLM + ‏cron יומי + מסך flags (גלאי ארנק אחרי cutover ‏026) | 030 | AGENTS ‏5 |

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

חוק העל: הרשאת ספק נקבעת אך ורק ב-`supplier_members` ‏(is_active). ‏`profiles.supplier_id` הוא sync לאחור, אסור ב-policy חדש.

פונקציות הרשאה: ‏`is_admin()`, ‏`has_role(text)` (היררכי: ‏customer < vendor < content_uploader < admin < super_admin), ‏`current_user_role()`, ‏`is_supplier_member(uuid)`, ‏`is_supplier_owner(uuid)`, ‏`current_supplier_id()`.
‏guards באפליקציה: ‏`requireAdminSession` (קיים), ‏`requireUserSession` (שלב 3.1), ‏`requireRecentAuth(15)` (שלב 4.6).
‏service role בלבד: ‏webhook ‏Cardcom, ‏crons (פקיעות, מחיקות, תזכורות, ‏fraud), ‏`fn_log_agent_run`, כתיבת ‏`payment_tokens`.

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
| `wallet_reason` | cashback_earn, order_spend, expire, refund_credit, referral_bonus, manual_adjust | 026 | |
| `deletion_request_status` | pending, cancelled, completed | 027 | |
| `notification_status` | queued, sent, failed, cancelled | 027 | |
| `supplier_status` | active, suspended, closed | 028 | |
| `supplier_application_status` | pending, approved, rejected | 028 | |
| `supplier_member_role` | owner, manager, scanner | 028 | |
| **`payout_status`** | **draft, pending_approval, approved, paid, cancelled** | **028 בלבד** | הכרעה 1.1 |
| `payout_line_type` | physical_delivery, coupon_redemption, adjustment | 028 | |
| `dispute_status` | open, in_review, resolved_accepted, resolved_rejected | 028 | |
| `scan_result` | success, not_found, already_used, expired, refunded, wrong_supplier, unauthorized, rate_limited | 028 | |
| `settlement_match_status` | unmatched, matched, amount_mismatch | 028 | |
| `agent_key` | shopping, supplier_ops, support, fraud_watch | 030 | |
| `agent_run_status` | running, succeeded, failed, escalated, rejected | 030 | |
| `agent_flag_status` | open, reviewing, confirmed, dismissed | 030 | |
| `listing_draft_status` | draft, pending_admin, approved, rejected | 030 | |
| `escalation_status` | open, in_progress, resolved, dismissed | 030 | |
| ‏(L) ‏`vendor_status` | pending, active, suspended | 001 | מת: ‏013 עברה ל-text |
| ‏(L) ‏`wallet_tx_type` | earn, redeem, expire, refund | 006 | ‏legacy עד cutover |
| ‏(L) ‏`wallet_tx_source` | cashback, referral, manual | 006 | ‏legacy עד cutover |

### 5.3 סוגי אירועי `audit_log`

הטיפוס: ‏enum ‏`audit_action` (9 הערכים למעלה). אין להוסיף ערכים בלי מיגרציית ‏ADD VALUE נפרדת; עד אז כל אירוע ממופה לתשעת הקיימים (`status_change` לשינויי סטטוס יזומים, ‏`manual_override` להתערבות אדמין).

ה-writer היחיד: ‏`audit_log_trigger_fn()` ‏(025) שממפה ‏INSERT/UPDATE/DELETE ל-‏created/updated/deleted, בתוספת כתיבות יזומות מפונקציות ‏definer.

טבלאות עם ה-trigger הגנרי: ‏products, vendors, profiles, coupon_deals ‏(baseline); ‏payments ‏(026); ‏suppliers, supplier_applications, supplier_members, supplier_bank_accounts, payout_statements, supplier_disputes ‏(028); ‏agent_prompts, agent_flags, listing_drafts, agent_escalations ‏(030).
חריג יחיד: ‏`payment_tokens` עם trigger ייעודי בלי הטוקן ‏(027) ‏[1.17].
לא מקבלות audit trigger (הן עצמן יומן append-only): ‏`audit_log`, ‏`wallet_transactions`, ‏`coupon_scan_events`, ‏`coupon_redemptions`, ‏`agent_run_steps`, ‏`payment_webhook_events`, ‏`notifications_outbox`.
מחיקת חשבון מנקה ‏PII מתוך ‏`changes`/`ip_address`/`user_agent` ‏(027) ‏[מסמך החשבון 2.4].

### 5.4 ‏rate limits (כולם)

תשתית: ‏`check_rate_limit(key, max, window)` ‏(002, לפי IP, ברירת מחדל 10 ל-3600 שניות, ניקוי אחרי שעתיים); ‏`check_user_rate_limit(user, action, limit, window)` ‏(019, ברירת מחדל 100 ל-3600, ניקוי אחרי 24 שעות).

| action | מכסה | חלון | צרכן | מקור |
|---|---|---|---|---|
| `coupon_scan` | **30** | 60 שניות | `redeem_coupon` | הכרעה 1.7 |
| `agent_chat` | 20 | 3600 שניות | ‏shopping + ‏support | AGENTS ‏1.4 |
| `listing_draft` | 10 | 24 שעות | ‏supplier_ops | AGENTS ‏3 |
| `account_deletion` | 3 | 24 שעות | ‏`fn_request_account_deletion` | ACCOUNT ‏2.4 |
| שכבת IP כללית | 10 | 3600 שניות | ‏auth + ‏routes רגישים | 002 |

תקרות מדיניות (לא rate limit אבל באותו רישום): כמות בעגלה 1-99 לפריט; פקיעת הזמנה pending אחרי 30 דקות; ‏reconcile לתשלום redirected אחרי 10 דקות; חלון החזרה לפני settlement ‏14 יום; ‏payout_terms_days ברירת מחדל 15; חלון חרטה למחיקת חשבון 30 יום; ‏re-auth תקף 15 דקות; תזכורות פקיעת קופון 7 ימים + 48 שעות עם dedupe; צעדי כלים ל-agent: ‏6 (צ'אט) / 10 ‏(supplier_ops); ‏max_output_tokens ברירת מחדל 2048; ‏fraud_watch עד 50 מועמדות לריצה; עד 5 תמונות לטיוטת מוצר.

---

## 6. כללי החלה

1. אך ורק ‏Supabase MCP ‏`apply_migration`, קובץ אחרי קובץ, בסדר הסופי ‏026 → 027 → 028 → 029 → 030. אסור ‏`db push` (היסטוריה לא מסונכרנת).
2. לפני 026: בדיקות הקדם של סעיף 2.6.
3. אחרי כל קובץ: ‏`generate_typescript_types` ועדכון ‏`src/types/database.ts`.
4. הטיוטות בריפו לא מוחלות כמות שהן: קודם מבצעים את העריכות של סעיף 2. מסמך זה הוא ה-checklist.
