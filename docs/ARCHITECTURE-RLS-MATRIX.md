# ארכיטקטורה: מטריצת RLS (52 טבלאות)

טבלה × תפקיד × policy ל-52 טבלאות ליבה ב-`public`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-TRUST-SAFETY.md
docs/CONTRADICTIONS.md
```

יחס ל-`ARCHITECTURE-SECURITY-RLS.md`: שם סיכום מקוצר; **כאן** מטריצת 52 המחייבת. בהתנגשות על שורת טבלה גובר המסמך הזה.

מודל כסף: **No Escrow**. כתיבות כסף רק service/RPC. `escrow_holds` = legacy ללא מסלול מוצר.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| RM1 | כל טבלת `public` בשימוש מוצר חייבת RLS enabled (+ FORCE על כסף רגיש). |
| RM2 | Principals: `anon`, `customer` (authenticated), `supplier` (membership), `admin` (`is_admin`), `service_role` (bypass). |
| RM3 | אין כתיבת כסף מ-JWT על orders/payments/vouchers/wallet/payouts. |
| RM4 | Redeem רק RPC; ספק לא כותב `platform_percent`. |
| RM5 | רשימת 52 למטה = ליבת פרודקשן למעקב. טבלאות נוספות (agents/analytics/wp_import) בנספח עד שייכנסו למטריצה. |
| RM6 | שער חי: `SELECT count(*) FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity` = 0. |

### קודי תא (SIUD = Select/Insert/Update/Delete)

| קוד | משמעות |
|---|---|
| `-` | אין |
| `o` | own (`auth.uid()` / בעלות) |
| `p` | public/published/active catalog |
| `m` | supplier membership על `supplier_id` |
| `a` | admin/staff |
| `*` | הגבלה בהערות (meta-only / non-draft / non-money) |

`service_role`: תמיד bypass לכתיבות שרת מורשות. לא מוצג בכל שורה.

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| RLS כבוי + סינון באפליקציה בלבד | IDOR אם נשכח שער. |
| `profiles.role=vendor` כ-tenant | חסר; membership בלבד. |
| לקוח מעדכן `orders.status` | fraud. |
| ספק SELECT על issued של אחרים | enumeration. |
| מטריצה רק ל-20 טבלאות | לא מספיק לשיגור; 52 ליבה. |

---

## 2. סכמת עזר (קיים)

Helpers: `is_admin()`, `is_support()`, `is_supplier_member(uuid)`, `current_user_role()`.  
אין DDL במסמך זה.

---

## 3. מטריצת 52

| # | טבלה | תחום | anon S | customer SIUD | supplier SIUD | admin SIUD | הערות |
|---|---|---|---|---|---|---|---|
| 1 | `profiles` | identity | - | o/o/o/- | o/o/o/- | a/a/a/a | role pinned; שינוי role רק admin |
| 2 | `products` | catalog | p | p/-/-/- | m/m*/m*/- | a/a/a/a | *טיוטה לא-כסף; כסף admin/service |
| 3 | `product_images` | catalog | p | p/-/-/- | m/m/m/m | a/a/a/a | דרך בעלות מוצר |
| 4 | `product_variants` | catalog | p | p/-/-/- | m/-/-/- | a/a/a/a | כתיבה admin/service |
| 5 | `product_categories` | catalog | p | p/-/-/- | -/-/-/- | a/a/a/a | |
| 6 | `categories` | catalog | p | p/-/-/- | -/-/-/- | a/a/a/a | |
| 7 | `hero_slides` | catalog | p | p/-/-/- | -/-/-/- | a/a/a/a | פעילים בלבד ל-anon |
| 8 | `media_assets` | catalog | - | -/-/-/- | -/-/-/- | a/a/a/a | URL חתום; לא list ל-anon |
| 9 | `carts` | cart | - | o/o/o/o | -/-/-/- | a/-/-/- | אורח: service לפי cookie |
| 10 | `cart_items` | cart | - | o/o/o/o | -/-/-/- | a/-/-/- | legacy; אחרת jsonb ב-carts |
| 11 | `orders` | money | - | o/-/-/- | m/-/-/- | a/-/-/- | I/U service בלבד |
| 12 | `order_items` | money | - | o/-/-/- | m/-/-/- | a/-/-/- | אין כתיבת כסף מלקוח |
| 13 | `payments` | money | - | o/-/-/- | -/-/-/- | a/-/-/- | service write |
| 14 | `payment_tokens` | money | - | o*/-/-/- | -/-/-/- | a/-/-/- | *meta; לא עמודת token ללקוח |
| 15 | `payment_webhook_events` | money | - | -/-/-/- | -/-/-/- | a/-/-/- | service append |
| 16 | `idempotency_keys` | money | - | -/-/-/- | -/-/-/- | a/-/-/- | service; אין policy=deny |
| 17 | `vouchers` | coupon | - | o/-/-/- | m*/-/-/- | a/-/-/- | *לא issued זר; I/U rpc |
| 18 | `voucher_redemptions` | coupon | - | o/-/-/- | m/-/-/- | a/-/-/- | insert ב-redeem_voucher |
| 19 | `coupon_codes` | coupon | - | o/-/-/- | -/-/-/- | a/a/a/- | legacy |
| 20 | `coupon_deals` | coupon | p | p/-/-/- | -/-/-/- | a/a/a/a | legacy catalog |
| 21 | `coupons` | coupon | - | o/-/-/- | -/-/-/- | a/-/-/- | legacy |
| 22 | `coupon_redemptions` | coupon | - | o/-/-/- | m/-/-/- | a/-/-/- | legacy scan |
| 23 | `suppliers` | supplier | p | p/-/-/- | m/-/-/- | a/a/a/a | שדות ציבוריים פעילים |
| 24 | `supplier_members` | supplier | - | o/-/-/- | m/o*/o*/o* | a/a/a/a | *owner מנהל צוות |
| 25 | `supplier_bank_accounts` | supplier | - | -/-/-/- | o*/o*/o*/- | a/a/a/- | *owner; verified לא עצמי |
| 26 | `supplier_applications` | supplier | - | o/o/-/- | -/-/-/- | a/a/a/- | מועמד own |
| 27 | `vendors` | supplier | p | p/-/-/- | -/-/-/- | a/a/a/a | legacy אם קיים |
| 28 | `payout_statements` | payout | - | -/-/-/- | o*/-/-/- | a/-/-/- | *לא draft |
| 29 | `payout_statement_lines` | payout | - | -/-/-/- | o*/-/-/- | a/-/-/- | פיזי בלבד |
| 30 | `supplier_payouts` | payout | - | -/-/-/- | o/-/-/- | a/-/-/- | legacy |
| 31 | `supplier_payout_items` | payout | - | -/-/-/- | o/-/-/- | a/-/-/- | legacy |
| 32 | `settlement_batches` | payout | - | -/-/-/- | -/-/-/- | a/-/-/- | service |
| 33 | `settlement_items` | payout | - | -/-/-/- | -/-/-/- | a/-/-/- | service |
| 34 | `commission_ledger` | payout | - | -/-/-/- | -/-/-/- | a/-/-/- | service |
| 35 | `split_executions` | payout | - | -/-/-/- | -/-/-/- | a/-/-/- | service |
| 36 | `escrow_holds` | legacy | - | -/-/-/- | -/-/-/- | a/-/-/- | No Escrow; אין מסלול מוצר |
| 37 | `wallet_accounts` | wallet | - | o/-/-/- | -/-/-/- | a/-/-/- | mutate rpc |
| 38 | `wallet_balances` | wallet | - | o/-/-/- | -/-/-/- | a/-/-/- | cache |
| 39 | `wallet_entries` | wallet | - | o/-/-/- | -/-/-/- | a/-/-/- | append rpc |
| 40 | `wallet_transactions` | wallet | - | o/-/-/- | -/-/-/- | a/-/-/- | legacy |
| 41 | `cashback_rules` | wallet | - | p/-/-/- | -/-/-/- | a/a/a/a | כללים פעילים |
| 42 | `cashback_reversal_debts` | wallet | - | o/-/-/- | -/-/-/- | a/-/-/- | service mutate |
| 43 | `ledger_accounts` | ledger | - | -/-/-/- | -/-/-/- | a/-/-/- | service |
| 44 | `ledger_journals` | ledger | - | -/-/-/- | -/-/-/- | a/-/-/- | service |
| 45 | `ledger_journal_lines` | ledger | - | -/-/-/- | -/-/-/- | a/-/-/- | service |
| 46 | `notification_outbox` | notify | - | -/-/-/- | -/-/-/- | a/-/-/- | enqueue definer |
| 47 | `notifications_outbox` | notify | - | -/-/-/- | -/-/-/- | a/-/-/- | twin legacy |
| 48 | `notification_templates` | notify | - | -/-/-/- | -/-/-/- | a/a/a/a | admin |
| 49 | `user_notification_preferences` | notify | - | o/o/o/- | -/-/-/- | a/-/-/- | |
| 50 | `notification_delivery_events` | notify | - | -/-/-/- | -/-/-/- | a/-/-/- | service |
| 51 | `audit_log` | ops | - | -/-/-/- | -/-/-/- | a/-/-/- | append-only |
| 52 | `admin_audit_log` | ops | - | -/-/-/- | -/-/-/- | a/-/-/- | staff |

---

## 4. נספח: מחוץ ל-52 (עד שיוכנסו)

`agent_*`, `analytics_*` (partitions), `wp_import.*`, `search_*`, `seo_redirects`, `security_events`, `consent_events`, `rate_limits`, `reconciliation_*`, `cardcom_settlements*`, `account_deletion_requests`, `channel_suppressions`: כברירת מחדל **admin/service only** עד שורה במטריצה.

---

## 5. מקרי קצה

| קוד | תוצאה |
|---|---|
| `rls_disabled` | חוסם שיגור; תיקון מיידי |
| `policy_permits_money_update` | באג P0 |
| `supplier_reads_foreign_issued` | אסור |
| `anon_writes_cart` | רק service לפי cookie |
| `escrow_holds_client_path` | אסור |

---

## 6. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | ספירה חיה מול 52 (drift) | להריץ db-doc / SQL לפני GA; לעדכן מטריצה |
| O2 | איחוד `notification_outbox` twins | להשאיר שניהם חסומים ללקוח |
| O3 | הכנסת analytics_events למטריצה | admin/service עד אז |
| O4 | FORCE על כל טבלאות הכסף ב-52 | חובה לפני soft-open כסף מורחב |

עודכן: 2026-08-12.

---

## 7. Acceptance

- [ ] בדיוק 52 שורות ליבה  
- [ ] קודי SIUD מתועדים  
- [ ] אין כתיבת כסף מלקוח/ספק  
- [ ] escrow_holds legacy  
- [ ] חלופות + מקרי קצה + פתוחות  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | יצירת BINDING: מטריצת 52 |
