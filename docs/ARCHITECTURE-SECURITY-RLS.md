# ארכיטקטורה: אבטחת RLS (Security RLS)

סיכום מחייב של מדיניות RLS. **מטריצה מלאה:** `docs/ARCHITECTURE-RLS-MATRIX.md`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-RLS-MATRIX.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-TRUST-SAFETY.md
docs/ARCHITECTURE-RBAC.md
docs/CONTRADICTIONS.md
```

---

## 0. החלטה (RLS1 עד RLS8)

| # | הכרעה |
|---|---|
| RLS1 | אין כתיבת כסף מ-JWT על orders/payments/vouchers/wallet. |
| RLS2 | Redeem רק RPC SECURITY DEFINER + membership. |
| RLS3 | `platform_percent` כתיבה admin/service בלבד. |
| RLS4 | `FORCE ROW LEVEL SECURITY` על טבלאות כסף. |
| RLS5 | service_role עוקף RLS; נתיב שרת בלבד. |
| RLS6 | anon לא כותב cart/money. |
| RLS7 | notification_outbox: enqueue definer; drain service. |
| RLS8 | טבלה חדשה → שורה ב-RLS-MATRIX לפני soft-open. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| RLS רק על חלק מהטבלאות | bypass על כסף |
| policies permissive OR מתרחבות | SEC-06; union leak |
| client UPDATE על voucher status | race redeem |
| GRANT כתיבה ל-authenticated על ledger | RLS1 |
| security definer בלי SET search_path | search_path injection |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.**

טבלאות P0 (כסף/זהות): `orders`, `order_items`, `payments`, `payment_webhook_events`, `vouchers`, `voucher_redemptions`, `wallet_accounts`, `wallet_entries`, `payment_tokens`, `payout_statements`, `settlement_events`, `audit_log`.

Helpers: `is_admin()`, `is_supplier_member(id)`, `current_user_supplier_id()`.

**מטריצה מלאה (48+ טבלאות):** `docs/ARCHITECTURE-RLS-MATRIX.md`

---

## 3. מטריצה מקוצרת (ליבה)

| Table | customer | supplier | client write money? |
|---|---|---|---|
| `orders` | own read | mem read | **no** (service/rpc) |
| `payments` | own read | - | **no** |
| `vouchers` | own read | mem read | insert/update: rpc only |
| `wallet_entries` | own read | - | append rpc only |
| `products` | pub read | mem non-money | money: service |
| `notification_outbox` | - | - | service/d definer |

קוד תא: `-` = אין · `own` = בעלות · `mem` = membership · `pub` = published

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| RLS-E1 | FORCE RLS שובר SECURITY DEFINER ישן | staged rollout + tests |
| RLS-E2 | supplier A redeem voucher of B | `not_found` חיצוני |
| RLS-E3 | authenticated SELECT payment_tokens.token col | REVOKE column |
| RLS-E4 | orphan cart NULL owner | SEC-09; service cleanup |
| RLS-E5 | policy OR expands admin to all rows | audit policies quarterly |
| RLS-E6 | webhook insert as anon | service route only |
| RLS-E7 | content_uploader UPDATE platform_percent | blocked; SEC-UPLOADER |

---

## 5. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | FORCE על כל 33 טבלאות public | 2026-08-12 |
| O2 | CI test suite RLS matrix automated | 2026-08-12 |
| O3 | ledger extended tables row in MATRIX | 2026-08-12 |

---

## 6. Acceptance

- [ ] `NOT rowsecurity` על public = 0
- [ ] אין policy מ-authenticated על money write
- [ ] ספק לא כותב platform_percent
- [ ] RLS-MATRIX מעודכן לכל טבלה חדשה

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING; הפניה ל-RLS-MATRIX |
