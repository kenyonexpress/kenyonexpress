# Migration Backlog

מצב המיגרציות ב-`supabase/migrations/` מול הפרודקשן החי.

נמדד 2026-07-29 מול הפרויקט
`ixvwfbuvfxxsjiywhbbb`
‏(eu-north-1, ‏Postgres 17.6.1).

**דוקומנטציה בלבד. לא הורץ שום DDL.** כל הממצאים כאן מבוססים על קריאה בלבד מתוך
`information_schema`,
`pg_type`,
`pg_proc`,
`pg_constraint`,
`pg_views`
ו-
`supabase_migrations.schema_migrations`.

מחליף את
`docs/DB-DRIFT-AUDIT.md`
כמקור האמת על סטטוס ההחלה. אותו מסמך נמדד ב-28.07, לפני 092/093/094, ושלוש
מהקביעות שלו התבררו כשגויות (ראה "תיקונים למסמכים קיימים").

## שיטת המדידה, ולמה היא שונה מהאודיט הקודם

האודיט הקודם השווה **שמות** של אובייקטים: אם קיים
`expire_vouchers`
בפרודקשן, המיגרציה שמצהירה עליו נחשבה מוחלת. זה נכון לטבלאות ולעמודות, ושגוי
לכל מיגרציה שכתובה כ-
`CREATE OR REPLACE FUNCTION`
או
`CREATE OR REPLACE VIEW`,
כי שם קיים לא מעיד על גוף עדכני.

כאן כל מיגרציה שהיא הגדרה-מחדש נבדקה מול **הגוף החי**
(`pg_get_functiondef`, `pg_views.definition`).
זה חשף ארבע מיגרציות שסריקת-שמות מסמנת כמוחלות ואינן: 068, 082, 088, 089, 092.

## המספרים

| | כמות |
|---|---|
| קבצי מיגרציה ב-repo | 89 |
| רשומות ב-`schema_migrations` בפרודקשן | 32 (‏093 רשומה פעמיים) |
| טבלאות ב-`public` בפרודקשן | 33 |
| ‏views ב-`public` בפרודקשן | 3 |
| ‏enums ב-`public` בפרודקשן | 26 |
| פונקציות ב-`public` בפרודקשן | 32 |
| טבלאות + views ב-`wp_import` | 14 + 5 |
| **קבצים מוחלים במלואם** | **48** |
| **קבצים חלקיים** | **5** |
| **קבצים שלא הוחלו** | **32** |
| קבצים שהם no-op (083, 084) | 2 |
| קבצים מבוטלים רשמית (079, 080) | 2 |

## טבלת סטטוס מלאה

מקרא:
`APPLIED` מוחל ואומת מול ה-DB.
`PARTIAL` חלק מהאובייקטים קיימים.
`MISSING` לא הוחל.
`CANCELLED` בוטל רשמית, אסור להחיל.
`NO-OP` הוחל בפועל דרך מיגרציה אחרת, הקובץ עצמו מיותר.

| קובץ | סטטוס | מה חסר / הערה |
|---|---|---|
| `001_initial_schema.sql` | PARTIAL | חסרים `wallets`, enum `vendor_status`, `generate_order_number` |
| `002_auth_rate_limits.sql` | APPLIED | |
| `003_rbac.sql` | PARTIAL | חסרה `admin_audit_log` |
| `004_storage_buckets.sql` | APPLIED | 6 buckets קיימים |
| `005_products_schema.sql` | APPLIED | |
| `006_wallet_schema.sql` | APPLIED | |
| `0075_categories_icon_url.sql` | APPLIED | |
| `007_orders_schema.sql` | APPLIED | |
| `008_coupons_schema.sql` | APPLIED | |
| `009_addresses_schema.sql` | APPLIED | |
| `010_referrals_affiliates_schema.sql` | APPLIED | |
| `011_audit_log_schema.sql` | APPLIED | |
| `012_categories_v2.sql` | MISSING | אין `categories.deleted_at`, אין `set_categories_updated_at` |
| `013_vendors_v2.sql` | APPLIED | |
| `014_products_v2.sql` | APPLIED | |
| `015_coupon_deals.sql` | APPLIED | |
| `016_products_code_sync.sql` | APPLIED | |
| `017_hero_slides.sql` | MISSING | אין `hero_slides` |
| `018_seed_categories.sql` | APPLIED | seed |
| `019_user_rate_limits.sql` | APPLIED | |
| `020_storage_product_images_admin.sql` | APPLIED | |
| `021_products_coupons_buckets.sql` | APPLIED | |
| `022_seed_demo_coupons_vendors.sql` | APPLIED | seed |
| `023_fix_new_user_wallet_and_seed_vendors.sql` | APPLIED | |
| `024_seed_demo_products.sql` | APPLIED | seed |
| `025_consolidation.sql` | APPLIED | |
| `026_commerce.sql` | PARTIAL | **DRAFT.** חסרים `cart_items`, `coupon_redemptions`, `supplier_payouts`, `supplier_payout_items`, enum `wallet_reason`, `fn_redeem_coupon` |
| `027_suppliers.sql` | PARTIAL | **DRAFT.** 19 אובייקטים חסרים. מנוע ה-payout כולו. פירוט למטה |
| `028_agents.sql` | MISSING | **DRAFT.** 13 אובייקטים |
| `029_accounts.sql` | MISSING | **DRAFT.** 13 אובייקטים |
| `030_catalog.sql` | MISSING | **DRAFT.** 14 אובייקטים |
| `031_notifications.sql` | MISSING | **DRAFT.** 27 אובייקטים |
| `032_wp_import_staging.sql` | APPLIED | schema `wp_import` |
| `033_analytics.sql` | MISSING | **DRAFT.** 21 אובייקטים |
| `034_analytics_bi.sql` | MISSING | **DRAFT.** 11 אובייקטים |
| `035_security_hardening.sql` | MISSING | 7 אובייקטים |
| `041_seed_suppliers_link_products.sql` | APPLIED | seed |
| `042_commerce_core.sql` | MISSING | 10 אובייקטים. **זה מה ש-Drizzle מנהל** |
| `044_link_products_to_vendors.sql` | APPLIED | seed |
| `045_restore_carts.sql` | APPLIED | |
| `046_checkout_runtime.sql` | APPLIED | |
| `047_checkout_settlement.sql` | APPLIED | |
| `048_products_content_fields.sql` | APPLIED | |
| `049_media_assets.sql` | APPLIED | |
| `050_platform_percent_required.sql` | PARTIAL | הפונקציה תואמת (הגיעה מ-070). **חסר**: `platform_percent` עדיין nullable, `commission_percent` עדיין עם DEFAULT |
| `051_payout_terms.sql` | MISSING | 4 פונקציות. חסום על 027 |
| `052_product_approval_workflow.sql` | APPLIED | |
| `053_admin_rbac_support.sql` | APPLIED | |
| `0545_voucher_redemption.sql` | APPLIED | |
| `054_section2_product_coupon_price_fields.sql` | APPLIED | |
| `055_account_wallet.sql` | APPLIED | |
| `056_analytics_v3.sql` | MISSING | 7 אובייקטים. חסום על 033/034 |
| `057_wp_migration_log.sql` | APPLIED | |
| `058_ledger_core.sql` | MISSING | 10 אובייקטים |
| `059_money_integer_units.sql` | MISSING | אין `fn_money_col_to_int`, אין `product_platform_bp`, אין `coupon_deals.coupon_price_agorot` |
| `060_idempotency_keys.sql` | MISSING | אין `idempotency_keys` |
| `061_coupon_single_use.sql` | MISSING | אין `coupon_redemptions` |
| `062_settlement_batches.sql` | MISSING | 5 אובייקטים |
| `063_reconciliation.sql` | MISSING | 4 אובייקטים |
| `064_money_rls.sql` | MISSING | **ייכשל כרגע.** נוגע ב-9 טבלאות שאף אחת מהן לא קיימת |
| `065_fn_post_journal.sql` | MISSING | חסום על 058 |
| `066_coupon_layer_types.sql` | MISSING | `product_type` החי הוא coupon/physical/service, בלי subscription |
| `067_coupon_layer_data.sql` | MISSING | חסום על 066 |
| `068_voucher_expiry_sweep.sql` | MISSING | הגוף החי הוא הגרסה חסרת-הארגומנט מ-0545. העומס `(integer)` לא קיים |
| `070_product_dynamic_split.sql` | APPLIED | כל 4 ה-constraints במצב validated |
| `071_settlement_status_platform_settled.sql` | APPLIED | |
| `072_027subset_supplier_members.sql` | APPLIED | |
| `073_vouchers_escrow_model.sql` | APPLIED | |
| `074_voucher_redemption_rpcs.sql` | APPLIED | |
| `075_cardcom_account_id.sql` | APPLIED | |
| `076_vouchers_reconcile_054_constraints.sql` | APPLIED | |
| `077_orders_supplier_read_no_recursion.sql` | APPLIED | |
| `078_supplier_scoped_order_read.sql` | APPLIED | |
| `079_payout_escrow_release.sql` | CANCELLED | בוטל 28.07. אסור להחיל |
| `080_ledger_escrow_held_account.sql` | CANCELLED | בוטל 28.07. אסור להחיל |
| `081_payout_no_escrow.sql` | MISSING | חסום על 027 |
| `082_fix_wallet_account_provisioning.sql` | MISSING | הגוף החי הוא הגרסה הפשוטה בלי הענף. **התנהגותית זהה** כי `wallet_accounts.owner_type` לא קיים |
| `083_payout_status_pending_approval.sql` | NO-OP | הערך קיים דרך 091 |
| `084_product_status_sold_out.sql` | NO-OP | הערך קיים |
| `085_voucher_scan_audit_and_no_escrow.sql` | MISSING | אין `voucher_redemptions.ip_address`, אין `voucher_scan_ip` |
| `086_triggers_post_059_money_columns.sql` | MISSING | חסום על 042 ו-031 |
| `087_vouchers_platform_bp_guard.sql` | MISSING | **ייכשל כרגע.** מפנה ל-`vouchers.platform_bp` ו-`vouchers.platform_percent_legacy`, שתיהן לא קיימות |
| `088_expire_vouchers_unambiguous.sql` | MISSING | חסום על 068 |
| `089_wallet_transfer_agorot.sql` | MISSING | החתימה החיה היא `p_amount_ils numeric` |
| `090_profiles_no_self_role_change.sql` | APPLIED | |
| `091_supplier_payout_enums.sql` | APPLIED | |
| `092_wallet_ledger_view_agorot.sql` | MISSING | ה-view החי הוא גרסת ה-ILS מ-055 |
| `093_product_commission_type.sql` | APPLIED | 61 שורות: 15 coupon, 46 physical. ה-CHECK במצב validated |
| `094_settlement_events.sql` | MISSING | אין `settlement_events` |

## חמש המיגרציות שסריקת-שמות משקרת עליהן

זה החלק שהאודיט הקודם פספס, וזה החלק המסוכן: מי שסומך על "השם קיים" יסיק
שהמנוע מעודכן, ויקרא לפונקציה עם חתימה שלא קיימת.

| קובץ | מה הריפו חושב | מה באמת רץ בפרודקשן |
|---|---|---|
| `068` | `expire_vouchers(p_limit integer)` מחזירה jsonb | רק `expire_vouchers()` חסרת-ארגומנט מ-0545, מחזירה integer |
| `088` | אותה פונקציה בלי DEFAULT | אותו דבר. 088 חסומה על 068 |
| `082` | `fn_ensure_wallet_account` עם ענף `owner_type` | הגרסה הפשוטה. זהה התנהגותית היום |
| `089` | `fn_wallet_transfer(p_amount_agorot integer)` | `fn_wallet_transfer(p_amount_ils numeric)` |
| `092` | `v_wallet_ledger` באגורות | ה-view של 055, עם `amount_ils numeric` |

**המשמעות הכספית של 089 ו-092:** כל שכבת הכסף בפרודקשן עדיין
`numeric` ‏ILS, לא `integer` אגורות. ההכרעה "כל כסף באגורות integer"
מ-
`docs/CONTRADICTIONS.md`
מיושמת בקוד ובקבצי המיגרציה, ולא בסכימה החיה.

## שתי מיגרציות ששבורות מול הפרודקשן

אלה לא "ממתינות להחלה", אלה ייפלו אם ינסו להחיל אותן כמו שהן.

**`087_vouchers_platform_bp_guard.sql`** מפנה ל-
`vouchers.platform_bp`
ול-
`vouchers.platform_percent_legacy`.
בפרודקשן הטבלה מחזיקה
`platform_percent numeric NOT NULL`
בלבד. המיגרציה מניחה שינוי-שם עמודה שמעולם לא קרה, ולכן
`UPDATE ... SET platform_bp = ...`
יזרוק
`42703 undefined_column`.
צריך או לכתוב אותה מחדש מול השם הקיים, או להקדים לה את המיגרציה שמשנה את השם.

**`064_money_rls.sql`** מפעילה RLS על תשע טבלאות
(`ledger_accounts`, `ledger_journals`, `ledger_journal_lines`,
`idempotency_keys`, `coupon_redemptions`, `settlement_batches`,
`settlement_items`, `reconciliation_runs`, `reconciliation_discrepancies`)
שאף אחת מהן לא קיימת. חסומה על 058, 060, 061, 062, 063.

## מנוע ה-payout: מה בדיוק חסר ב-027

זו תת-המערכת היחידה שמתה לגמרי, והכל תלוי בקובץ אחד שכתוב עליו בשורה 3
`DRAFT: do NOT apply yet`.

**enum חסר:** `settlement_match_status` (ערכים `unmatched`, `matched`,
`amount_mismatch`). ‏091 החילה שישה enums מ-027 והשאירה את השביעי.

**טבלאות חסרות:** `supplier_applications`, `supplier_bank_accounts`,
`coupon_scan_events`, `payout_statements`, `payout_statement_lines`,
`cardcom_settlements`, `cardcom_settlement_txns`, `supplier_disputes`.
בנוסף מ-026: `supplier_payouts`, `supplier_payout_items`.

**פונקציות חסרות:** `generate_payout_statement`, `approve_payout_statement`,
`mark_payout_statement_paid`, `cancel_payout_statement`,
`approve_supplier_application`, `reject_supplier_application`,
`reconcile_cardcom_settlement`, `update_shipping_status`, `redeem_coupon`,
`expire_coupons`. מ-051 בנוסף: `add_business_days`, `payout_available_at`,
`enforce_payout_availability`.

מה שכן הוחל מ-027: ‏`supplier_members` והפונקציות
`is_supplier_member`, `is_supplier_owner`, `current_supplier_id`
דרך תת-הקבוצה ב-072, ושישה enums דרך 091.

## סדר ההחלה המומלץ

לא הורץ. הסדר נגזר מתלויות אמיתיות, לא ממספרי הקבצים.

### שלב 0 — מה שאפשר להחיל היום, בלי חסימות

**‏1. ‏`050_platform_percent_required.sql`.**
עד היום הוא נחסם בכוונה: הוא זורק אם יש מוצר חי בלי
`platform_percent`.
**החסימה הזאת כבר לא קיימת.** נמדד עכשיו: 61 מוצרים, מהם **0** בלי
`platform_percent`
ו-**0** בלי
`supplier_split_percent`.
הבדיקה תעבור והעמודה תהפוך ל-NOT NULL. זו המיגרציה עם התשואה הגבוהה ביותר
ביחס לסיכון בכל הרשימה.

**‏2. ‏`settlement_match_status`** כ-enum בודד, לסגור את הפער ש-091 השאירה.

**‏3. ‏`017_hero_slides.sql`** ו-**`012_categories_v2.sql`** — עצמאיות לגמרי.

**‏4. ‏`035_security_hardening.sql`** — כל משפט בה עטוף בבדיקת קיום, ולכן היא
בטוחה גם כשהטיוטות 026-034 לא הוחלו.

**‏5. ‏`060_idempotency_keys.sql`** — עצמאית.

### שלב 1 — שרשרת ה-payout

חייב את הסדר הזה בדיוק:

```
027 (enums -> טבלאות -> פונקציות)
  -> 026 (החלקים החסרים: cart_items, coupon_redemptions, supplier_payouts)
  -> 051 (מגדירה מחדש generate_payout_statement)
  -> 081 (הצורה הנוכחית, ללא escrow)
```

**‏079 ו-080 מדולגות.** שתיהן מבוטלות רשמית מ-28.07. ‏081 היא הצורה המחייבת.

לפני שנוגעים ב-027 צריך הכרעה אחת: **האם סימון ה-DRAFT בשורה 3 עדיין תקף.**
הקובץ נכתב לפני היפוך המודל של 28.07, ומנוע ה-payout שבו מניח escrow.

### שלב 2 — הכסף באגורות

```
042 (commission_ledger, cashback_reversal_debts)
  -> 058 (ledger core) -> 065 (fn_post_journal)
  -> 059 (המרת עמודות הכסף) -> 089 (fn_wallet_transfer) -> 092 (v_wallet_ledger)
  -> 086 (triggers שתלויים ב-059) -> 094 (settlement_events)
  -> 062 -> 063 -> 061 -> 064 (RLS, אחרון: הוא נוגע בכל מה שמעליו)
```

‏059 היא נקודת האל-חזור: אחרי שהיא רצה, כל קוד שכותב
`numeric` ILS
נשבר. צריך cutover של ה-server actions באותו חלון.

### שלב 3 — תת-מערכות עצמאיות

לפי סדר עולה של תלות:
`030` קטלוג, `029` חשבונות, `031` נוטיפיקציות, `028` סוכנים,
`033` -> `034` -> `056` אנליטיקה.

### שלב 4 — התיקונים הקטנים

`068` -> `088` ‏(סדר חובה), `082`, `085`, `066` -> `067`,
ו-`087` רק אחרי שכותבים אותה מחדש.

## שדות חדשים שההחלה תוסיף

מה שמוסיפים השלבים 0 ו-1, כלומר מה שנוגע בטבלאות שכבר חיות:

| טבלה | שדה | מקור | הערה |
|---|---|---|---|
| `products` | `platform_percent` | 050 | קיים. הופך ל-NOT NULL |
| `products` | `commission_percent` | 050 | קיים. יורד ה-DEFAULT, מסומן deprecated |
| `categories` | `deleted_at` | 012 | חדש |
| `suppliers` | `min_payout_ils` | 051 | חדש. ברירת מחדל 100 |
| `suppliers` | `payout_hold_business_days` | 051 | חדש. ברירת מחדל 3 |
| `payout_statements` | `available_at` | 051 | טבלה חדשה מ-027 |
| `payout_statement_lines` | `available_at` | 051 | טבלה חדשה מ-027 |
| `order_items` | `shipping_carrier` | 027 | חדש |
| `coupon_codes` | `redeemed_by_merchant_user_id` | 061 | חדש |
| `coupon_deals` | `coupon_price_agorot` | 059 | חדש |
| `voucher_redemptions` | `ip_address` | 085 | חדש |
| `payout_statement_lines` | `voucher_id` | 079 | **מבוטל, לא יתווסף** |
| `vouchers` | `platform_bp` | 087 | **שבור, לא יתווסף כמו שהוא** |

## Supabase החי מול סכימת Drizzle

### מה Drizzle בכלל מנהל

`drizzle.config.ts`
טוען
`src/db/schema/commerce-managed.ts`,
והקובץ הזה מייצא בדיוק ארבעה אובייקטים:

```ts
export {
  cashbackReversalDebts,
  commissionLedger,
  commissionLedgerEvent,
  commissionLedgerStatus,
} from './commerce'
```

זו הגבלה מכוונת ונכונה: היא מונעת מ-
`drizzle-kit`
להפיל עמודות שמיגרציות ידניות מחזיקות.

**הבעיה: כל ארבעת האובייקטים האלה לא קיימים בפרודקשן.** הם מוגדרים ב-
`042_commerce_core.sql`,
שלא הוחלה. כלומר סכימת ה-Drizzle המנוהלת מתארת 100 אחוז דמיון.
`drizzle-kit push`
מול הפרודקשן היום היה מנסה ליצור את שניהם מאפס.

### ההצהרות הלא-מנוהלות ב-`commerce.ts`

הקובץ מצהיר גם על
`products`, `orders`, `order_items`, `suppliers`
כ"‏query projections". הן לא נטענות ל-drizzle-kit, אבל **הטיפוסים שנגזרים מהן
משמשים בקוד**, ולכן פער מולן הוא באג טיפוסים שקט. הפער גדול:

| טבלה.עמודה ב-Drizzle | מה Drizzle אומר | מה יש בפרודקשן | חומרה |
|---|---|---|---|
| `products.platform_percent` | `NOT NULL DEFAULT '10'` | nullable, **בלי DEFAULT** | **גבוהה.** ה-DEFAULT הזה הוא בדיוק הליטרל 10 ש-C1 אוסר |
| `products.coupon_expiry_days` | `NOT NULL` | nullable (46 מ-61 ריקות) | גבוהה |
| `products.supplier_id` | `NOT NULL` | nullable | בינונית |
| `products.commission_type` | לא קיים | `NOT NULL` + CHECK | בינונית. 093 לא שוקפה ל-Drizzle |
| `products.supplier_split_percent` | לא קיים | קיים | בינונית. 070 לא שוקפה |
| `orders.subtotal_agorot` | `integer NOT NULL` | **לא קיים.** יש `subtotal_ils numeric` | **גבוהה** |
| `orders.discount_agorot` | `integer NOT NULL` | **לא קיים.** יש `discount_ils` | גבוהה |
| `orders.wallet_applied_agorot` | `integer NOT NULL` | **לא קיים.** יש `cashback_applied_ils` | גבוהה |
| `orders.customer_pays_now_agorot` | `integer NOT NULL` | **לא קיים.** יש `total_ils` | גבוהה |
| `order_items.unit_price_agorot` | `integer NOT NULL` | **לא קיים.** יש `unit_price_ils numeric` | **גבוהה** |
| `order_items.customer_pays_now_agorot` | `integer NOT NULL` | **לא קיים.** יש `paid_on_site_agorot` | גבוהה |
| `order_items.platform_fee_agorot` | `integer NOT NULL` | **לא קיים.** יש `commission_agorot` | גבוהה |
| `order_items.supplier_due_agorot` | `integer NOT NULL` | **לא קיים.** יש `supplier_immediate_agorot` | גבוהה |
| `order_items.face_value_agorot` | `integer NOT NULL` | קיים אבל **nullable** | בינונית |
| `order_items.cashback_amount_agorot` | `integer NOT NULL` | קיים אבל **nullable** | בינונית |
| `order_items.platform_percent` | `NOT NULL` | nullable | בינונית |
| `commission_ledger` (כל הטבלה) | 20 עמודות | **הטבלה לא קיימת** | גבוהה |
| `cashback_reversal_debts` (כל הטבלה) | 8 עמודות | **הטבלה לא קיימת** | גבוהה |
| enum `commission_ledger_event` | קיים | **לא קיים** | גבוהה |
| enum `commission_ledger_status` | קיים | **לא קיים** | גבוהה |

הדפוס אחיד: **‏Drizzle מתאר את העולם שאחרי 042 ו-059, ופרודקשן נמצא לפניהם.**
ארבע עמודות ב-
`orders`
ושמונה ב-
`order_items`
נקראות בקוד תחת שמות שלא קיימים ב-DB. זה לא יתגלה בקומפילציה, כי הטיפוסים
נגזרים מההצהרה ולא מה-DB.

### מה כן תואם

enum
`product_type`
תואם בשלושת הערכים coupon/physical/service.
`order_status`
ו-
`order_item_status`
תואמים במלואם. שאר ה-CHECK constraints ב-
`commerce.ts`
מתארים טבלאות שלא קיימות, ולכן לא סותרים כלום.

## תיקונים למסמכים קיימים

### `docs/DB-DRIFT-AUDIT.md`

**‏1. `product_type.service` כן קיים.** האודיט קבע שהערך "שקוף" על ידי 001
ושכל כתיבה שלו תזרוק
`22P02`.
נמדד: ה-enum החי הוא
`coupon, physical, service`.
ההצהרה של 005 היא זאת שניצחה בפרודקשן, לא של 001. הניתוח הסטטי הניח סדר הרצה
לפי מספרי קבצים, וה-DB הזה לא רץ בסדר הזה.

**‏2. ‏085 אינה "חצי מוחלת".** האודיט הסיק זאת מכך ש-
`voucher_scan_outcome`
ו-
`log_voucher_scan`
חיים. שניהם מגיעים מ-0545 ומ-073, לא מ-085. ‏085 לא הוחלה כלל.

**‏3. שיטת ההשוואה מפספסת גופים.** ראה "חמש המיגרציות שסריקת-שמות משקרת
עליהן".

### `docs/CONTRADICTIONS.md`

**‏1. ‏070 כן הוחלה.** המסמך אומר פעמיים "‏070 טרם הוחלה" (שורות 143 ו-197).
היא רשומה ב-
`schema_migrations`
כ-
`20260727033456 070_product_dynamic_split`,
וכל ארבעת ה-constraints שלה קיימים ובמצב validated.

**‏2. הספירה של האחוזים התהפכה.** המסמך מצטט מדידה שבה
`platform_percent`
מאוכלס ב-0 שורות מתוך 61 ו-
`supplier_split_percent`
ב-61. נמדד עכשיו: **שתיהן מאוכלסות ב-61 מתוך 61.** ה-backfill של 070 עשה את
העבודה. זו הסיבה ש-050 חדלה להיות חסומה.

**‏3. הפתיח של "פתוח" מיושן.** נכתב "‏050, 051, 070, 079, 080 טרם הוחלו".
מתוכן: ‏070 הוחלה, ‏079 ו-080 בוטלו רשמית. נשארו 050 ו-051 בלבד.

### `STATE.md`

הקביעה בשורה 1685 ש"מיגרציה 050 לא הוחלה בכוונה, כי היא זורקת אם קיים מוצר חי
בלי `platform_percent`" נכונה עובדתית אבל **הנימוק פג**. אין יותר מוצר כזה.

## מלכודות שיישארו גם אחרי כל ההחלות

### המספור לא ניתן לתיקון דרך ה-CLI

הפרודקשן מחזיקה 32 רשומות עם version בן 14 ספרות
(`20260622132032` עד `20260729032538`).
הקבצים המקומיים ממוספרים
`001` עד `094`.
ה-CLI גוזר version מהספרות שלפני הקו התחתון הראשון, ולכן הוא רואה
`001`, `094`,
ולא מוצא אף אחת מהן בהיסטוריה המרוחקת. כל version מקומי ממוין **לפני** האחרון
המרוחק, ולכן
`supabase db push`
מסרב ודורש
`--include-all`,
שהיה מריץ מחדש את
`001_initial_schema.sql`
על DB שכבר מחזיק חלק ממנה.

הערוץ הבטוח היחיד הוא
`apply_migration`
ממוקד. כל קריאה כזאת רושמת version מבוסס-תאריך ומרחיבה את הפער. זה tradeoff
מקובל, לא תקלה.

**‏093 רשומה פעמיים** (`20260729031546` ו-`20260729032538`). המיגרציה
אידמפוטנטית ולכן זה לא הזיק, אבל זה מדגים בדיוק את הבעיה.

### מיון הקבצים אינו לקסיקוגרפי-נאיבי

`0075` ממוין לפני `007`, ו-`0545` לפני `054` בהשוואת מחרוזות רגילה
(`'5' < '_'`).
שני הקבצים נוצרו בכוונה בצורה הזאת, ו-
`0545_voucher_redemption.sql`
מתעד למה: שני קבצים שתבעו את version 054 הפילו את
`supabase db reset`
לגמרי. כל סקריפט שממיין את התיקייה חייב להשתמש במיון ה-version של ה-CLI ולא
ב-`ls`.

### שני enums שחסרים להם ערך בפרודקשן

`payment_status` חסר `cancelled`, ו-`payment_kind` חסר `token_charge`. שניהם
נובעים מכך ש-046 רצה ו-026 לא. שניהם אינרטיים היום: אף מסלול קוד לא כותב אותם.
הם הופכים לבאג חי ברגע ש-026 מוחלת בצורה שמניחה שההצהרה שלה ניצחה.

### שתי טבלאות שוברים במקביל

`public.vouchers`
(‏26 עמודות, 0 שורות, המסלול החי) ו-
`public.coupon_codes`
(‏16 עמודות, 2 שורות, קריאה בלבד). איחודן הוא מיגרציית נתונים ולא DDL.

### שתי עמודות מחיר על המוצר

`products.price_ils`
ו-
`products.kenyon_price`,
שוות בכל 61 השורות, והקוד נשען על שתיהן.
