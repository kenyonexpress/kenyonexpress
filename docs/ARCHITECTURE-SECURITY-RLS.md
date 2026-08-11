# ארכיטקטורה: מטריצת RLS

סיכום מחייב של מדיניות RLS לטבלאות ליבה (קטלוג / כסף / ספק / ארנק / התראות).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: `arch/docs-batch-2` · batch #30/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-TRUST-SAFETY.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/CONTRADICTIONS.md
```

---

## 0. Principals וקודים

| Principal | משמעות |
|---|---|
| `anon` | בלי session / תפקיד anon |
| `authenticated` | `auth.uid()` |
| `supplier` | חבר פעיל ב-`supplier_members` |
| `admin` | `is_admin()` (`admin` / `super_admin`) |
| `service_role` | מפתח שרת; **עוקף RLS**; נתיב יחיד לכתיבות כסף |

| קוד | משמעות |
|---|---|
| `-` | אין policy ללקוח |
| `own` | שורות בעלות/`auth.uid()` |
| `pub` | מפורסם/פעיל לקטלוג |
| `mem` | דרך membership לספק של השורה |
| `rpc` | רק SECURITY DEFINER / route |
| `bypass` | service_role |

Helpers: `is_admin()`, `is_support()`, `is_supplier_member(id)`, `current_user_supplier_id()`.

### כללי ברזל

1. אין כתיבת כסף מ-JWT על `orders` / `payments` / `vouchers` / `wallet_*` / payouts.  
2. `platform_percent` ושורות מחיר קופון: כתיבה רק admin/service אחרי session.  
3. Redeem רק RPC עם JWT + membership; לא `supplier_id` מה-body.  
4. `FORCE ROW LEVEL SECURITY` על טבלאות כסף רגישות.  
5. מודל קופון: שולם באתר + יתרה בעסק (טבלאות היסטוריות של החזקה לא בשימוש מוצר).

---

## 1. מטריצה מקוצרת (ליבה)

פורמט תא: SELECT · INSERT · UPDATE · DELETE (עבור authenticated / supplier / admin בקירוב; service תמיד bypass לכתיבות שרת).

| Table | customer | supplier | admin read | client write money? |
|---|---|---|---|---|
| `profiles` | own r/w (role pinned) | own | Y | role רק admin path |
| `products` | pub read | mem r/w לא-כסף | Y | money fields: service |
| `orders` | own read | mem read paid+ | Y | **no** (rpc/service) |
| `order_items` | own via parent | mem | Y | **no** |
| `payments` | own read | - | Y | **no** |
| `payment_tokens` | own meta (בלי token col) | - | Y | **no** |
| `payment_webhook_events` | - | - | Y | service only |
| `vouchers` / `coupon_codes` | own read | mem read | Y | insert/update: rpc |
| `voucher_redemptions` | own read | mem read | Y | insert: redeem rpc |
| `wallet_accounts` | own read | - | Y | rpc only |
| `wallet_entries` | own read | - | Y | append via transfer rpc |
| `suppliers` | pub fields | mem | Y | limited self / admin |
| `supplier_members` | self read | mem/owner | Y | owner/admin |
| `supplier_bank_accounts` | - | own lim | Y | no scanner |
| `carts` / `cart_items` | own | own | Y | guest: service only |
| `notification_outbox` | - | - | Y | enqueue definer + drain |
| `user_notification_preferences` | own | - | Y | own update |
| `audit_log` | - | - | Y | append-only definer |
| `rate_limits` / `user_rate_limits` | - | - | - | rpc/service |
| `payout_statements` | - | own read | Y | generator/service |
| `settlement_events` | - | - | Y | append service |
| `idempotency_keys` | - | - | Y | server only |

קטלוג (`categories`, `product_images`, `product_variants`, `hero_slides`): `pub` ל-anon/auth; כתיבה admin/service (ספק לפי mem על מוצריו).

---

## 2. פירוט קריטי

### `orders` / `payments`

| Action | authenticated | supplier | service |
|---|---|---|---|
| SELECT | `user_id = auth.uid()` | הזמנות עם item ב-mem | bypass |
| INSERT/UPDATE | - | - | checkout / webhook finalize |
| DELETE | - | - | - |

אין ללקוח לשנות `status` / `paid_at`.

### `vouchers`

| Action | authenticated | supplier | service/rpc |
|---|---|---|---|
| SELECT | owner | mem על `supplier_id` | all |
| INSERT | - | - | issue path |
| UPDATE | - | - | `redeem_voucher` בלבד |

`wrong_supplier` פנימי → תשובה חיצונית `not_found`.

### `wallet_entries`

Append-only דרך `fn_wallet_transfer` (service_role בלבד אחרי SEC-WALLET). סכומים integer agorot.

### `notification_outbox`

אין SELECT ללקוח (PII של אחרים). Drain = service. Enqueue = trigger/definer.

### `products` (כסף)

ספק לא כותב: `platform_percent`, `supplier_split_percent`, `coupon_price_ils` (או מקבילים).

---

## 3. מחוץ למטריצה המקוצרת

Agents, analytics partitions, ledger מורחב, reconciliation: RLS = admin/service עד מסמך ייעודי. כל טבלה חדשה חייבת שורה כאן או ticket עדכון לפני soft-open.

---

## 4. Acceptance

- [ ] `NOT rowsecurity` על `public` = 0  
- [ ] אין policy שמעדכנת `orders.status` / `vouchers.status` / wallet מ-authenticated  
- [ ] ספק לא כותב `platform_percent`  
- [ ] anon לא כותב cart/money  
- [ ] outbox + webhook journals בלי כתיבת לקוח  
- [ ] FORCE על טבלאות כסף רגישות  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #30/50: ריענון BINDING (סיכום מטריצה ממוקד) |
