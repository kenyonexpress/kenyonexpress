# ARCHITECTURE: Security RLS Matrix

מטריצת RLS מחייבת ל-**44 טבלאות** ב-`public` (ליבה פרודקשן + קטלוג/כסף/ספק/ארנק).

Status: **BINDING** · Updated: 2026-08-03
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-SECURITY.md
docs/DB-SCHEMA.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-WALLET-LEDGER.md
```

## 0. Principals וקודים

| Principal | משמעות |
|---|---|
| `anon` | JWT חסר / תפקיד anon של PostgREST |
| `authenticated` | לקוח מחובר; `auth.uid()` |
| `supplier` | חבר פעיל ב-`supplier_members` (`is_supplier_member`) |
| `admin` | `is_admin()` = role `admin` או `super_admin` |
| `service_role` | מפתח שרת; **עוקף RLS**; נתיב יחיד לכתיבות כסף |

| קוד בתא | משמעות |
|---|---|
| `-` | אין policy / אסור ללקוח |
| `Y` | מותר לתפקיד (לרוב עם פילטר) |
| `own` | רק שורות של `auth.uid()` / בעלות |
| `pub` | רק שורות מפורסמות/פעילות לקטלוג |
| `mem` | רק דרך membership לספק של השורה |
| `lim` | מוגבל (לא שדות כסף/בנק) |
| `opt` | אופציונלי לקריאה אם rule פעיל |
| `soft` | soft-delete / שינוי status |
| `rpc` | רק SECURITY DEFINER / Route Handler |
| `bypass` | service_role עוקף RLS |

Helpers מחייבים:

```
is_admin()
is_support()
is_supplier_member(supplier_id)
is_supplier_owner(supplier_id)
current_supplier_id()
```

כללי ברזל:

1. אין כתיבת כסף מ-JWT לקוח על `orders` / `payments` / `vouchers` / `wallet_*` / payouts.
2. `platform_percent` ו-`coupon_price_ils` נכתבים רק מנתיב admin (service אחרי `requireAdminSession`).
3. Redeem רק RPC עם user JWT + membership; לא `supplier_id` מה-body.
4. `FORCE ROW LEVEL SECURITY` על טבלאות כסף רגישות כשאפשר.
5. מודל קופון: No Escrow; טבלת `escrow_holds` היסטורית בלבד.

## 1. מטריצה (44 טבלאות × פעולות)

פורמט תא: `anon|authenticated|supplier|admin|service_role`.

| # | Table | SELECT | INSERT | UPDATE | DELETE | Notes |
|---:|---|---|---|---|---|---|
| 1 | `affiliates` | -|own|-|Y|bypass | -|-|-|Y|bypass | -|own|-|Y|bypass | -|-|-|soft|bypass | own + admin; support SELECT |
| 2 | `audit_log` | -|-|-|Y|bypass | -|-|-|-|rpc | -|-|-|-|- | -|-|-|-|- | append-only via definer/service |
| 3 | `cart_items` | -|own|-|Y|bypass | -|own|-|-|bypass | -|own|-|-|bypass | -|own|-|-|bypass | via cart ownership |
| 4 | `carts` | -|own|-|Y|bypass | -|own|-|-|bypass | -|own|-|-|bypass | -|own|-|-|bypass | anon: no client write policy |
| 5 | `cashback_rules` | -|opt|-|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | admin manages rules |
| 6 | `categories` | pub|pub|-|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | catalog taxonomy |
| 7 | `coupon_codes` | -|own|lim|Y|bypass | -|-|-|-|rpc | -|-|-|-|rpc | -|-|-|-|- | legacy + checkout path |
| 8 | `coupon_deals` | pub|pub|-|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | legacy deals |
| 9 | `coupons` | -|own|-|Y|bypass | -|-|-|-|rpc | -|-|-|-|rpc | -|-|-|-|- | legacy; prefer vouchers |
| 10 | `escrow_holds` | -|-|-|Y|bypass | -|-|-|-|rpc | -|-|-|-|rpc | -|-|-|-|- | historical; No Escrow coupon model |
| 11 | `hero_slides` | pub|pub|-|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | homepage |
| 12 | `idempotency_keys` | -|-|-|Y|bypass | -|-|-|-|bypass | -|-|-|-|bypass | -|-|-|-|bypass | server only |
| 13 | `media_assets` | -|own|-|Y|bypass | -|own|-|Y|bypass | -|own|-|Y|bypass | -|own|-|Y|bypass | CDN URLs public |
| 14 | `notification_outbox` | -|-|-|Y|bypass | -|-|-|-|rpc | -|-|-|-|bypass | -|-|-|-|- | trigger enqueue; worker drain |
| 15 | `order_items` | -|own|mem|Y|bypass | -|-|-|-|rpc | -|-|-|-|rpc | -|-|-|-|- | snapshots after paid |
| 16 | `orders` | -|own|mem|Y|bypass | -|-|-|-|rpc | -|-|-|-|rpc | -|-|-|-|- | no client status forge |
| 17 | `payment_tokens` | -|own|-|Y|bypass | -|-|-|-|bypass | -|-|-|-|bypass | -|own|-|Y|bypass | token col revoked from clients |
| 18 | `payment_webhook_events` | -|-|-|Y|bypass | -|-|-|-|bypass | -|-|-|-|bypass | -|-|-|-|- | Cardcom journal |
| 19 | `payments` | -|own|-|Y|bypass | -|-|-|-|bypass | -|-|-|-|bypass | -|-|-|-|- | service finalize only |
| 20 | `payout_statement_lines` | -|-|own|Y|bypass | -|-|-|-|bypass | -|-|-|-|bypass | -|-|-|-|- | physical residual lines |
| 21 | `payout_statements` | -|-|own|Y|bypass | -|-|-|-|bypass | -|-|-|Y|bypass | -|-|-|-|- | mark paid: super_admin path |
| 22 | `product_categories` | Y|Y|-|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | M2M catalog |
| 23 | `product_images` | pub|pub|mem|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | follows product visibility |
| 24 | `product_variants` | pub|pub|mem|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | -|-|-|Y|bypass | follows product |
| 25 | `products` | pub|pub|mem|Y|bypass | -|-|lim|Y|bypass | -|-|lim|Y|bypass | -|-|-|Y|bypass | money fields admin-only write |
| 26 | `profiles` | -|own|-|Y|bypass | -|-|-|-|rpc | own|-|-|Y|bypass | -|-|-|-|- | role changes admin only |
| 27 | `rate_limits` | -|-|-|-|bypass | -|-|-|-|rpc | -|-|-|-|rpc | -|-|-|-|rpc | IP limiter; no client SELECT |
| 28 | `referrals` | -|own|-|Y|bypass | -|own|-|-|bypass | -|-|-|-|bypass | -|-|-|-|- |  |
| 29 | `security_events` | -|-|-|Y|bypass | -|-|-|-|bypass | -|-|-|-|- | -|-|-|-|- | append-only |
| 30 | `split_executions` | -|-|-|Y|bypass | -|-|-|-|bypass | -|-|-|-|bypass | -|-|-|-|- | physical split audit |
| 31 | `supplier_applications` | -|own|-|Y|bypass | -|own|-|-|bypass | lim|-|-|Y|bypass | -|-|-|-|- | approve/reject admin |
| 32 | `supplier_bank_accounts` | -|-|own|Y|bypass | -|-|own|Y|bypass | -|-|lim|Y|bypass | -|-|own|Y|bypass | scanner: no access |
| 33 | `supplier_members` | -|-|mem|Y|bypass | -|-|own|Y|bypass | -|-|own|Y|bypass | -|-|own|Y|bypass | is_active gates redeem |
| 34 | `suppliers` | pub|pub|mem|Y|bypass | -|-|-|Y|bypass | -|-|own|Y|bypass | -|-|-|soft|bypass | public PDP fields only |
| 35 | `user_addresses` | -|own|-|Y|bypass | -|own|-|-|bypass | -|own|-|-|bypass | -|own|-|-|bypass |  |
| 36 | `user_notification_preferences` | -|own|-|Y|bypass | -|own|-|-|bypass | -|own|-|-|bypass | -|-|-|-|- |  |
| 37 | `user_rate_limits` | -|-|-|-|bypass | -|-|-|-|rpc | -|-|-|-|- | -|-|-|-|rpc | no client SELECT |
| 38 | `vendors` | -|-|-|Y|bypass | -|-|-|-|- | -|-|-|Y|bypass | -|-|-|-|- | legacy; use suppliers |
| 39 | `voucher_redemptions` | -|own|mem|Y|bypass | -|-|-|-|rpc | -|-|-|-|- | -|-|-|-|- | insert on redeem only |
| 40 | `vouchers` | -|own|mem|Y|bypass | -|-|-|-|rpc | -|-|-|-|rpc | -|-|-|-|- | UPDATE only via redeem_voucher |
| 41 | `wallet_accounts` | -|own|-|Y|bypass | -|-|-|-|rpc | -|-|-|-|rpc | -|-|-|-|- | balance via entries |
| 42 | `wallet_balances` | -|own|-|Y|bypass | -|-|-|-|rpc | -|-|-|-|rpc | -|-|-|-|- | deprecated legacy |
| 43 | `wallet_entries` | -|own|-|Y|bypass | -|-|-|-|rpc | -|-|-|-|- | -|-|-|-|- | append-only double-entry |
| 44 | `wallet_transactions` | -|own|-|Y|bypass | -|-|-|-|rpc | -|-|-|-|- | -|-|-|-|- | deprecated legacy |

## 2. פירוט לטבלאות קריטיות

### 2.1 `products`

| Action | anon | authenticated | supplier | admin | service_role |
|---|---|---|---|---|---|
| SELECT | published only | published | own `supplier_id` via mem | all | bypass |
| INSERT | - | - | draft via Server Action (service) | Y (service path) | Y |
| UPDATE | - | - | non-money via action | money + all | Y |
| DELETE | - | - | - | archive/soft | Y |

אסור לספק: `platform_percent`, `supplier_split_percent`, `coupon_price_ils`, `discount_percent`.

### 2.2 `orders`

| Action | anon | authenticated | supplier | admin | service_role |
|---|---|---|---|---|---|
| SELECT | - | `user_id = auth.uid()` | orders עם item ב-mem | all | bypass |
| INSERT | - | - | - | - | Y (checkout) |
| UPDATE | - | - | - | limited via action | Y (finalize/refund) |
| DELETE | - | - | - | - | - |

### 2.3 `vouchers`

| Action | anon | authenticated | supplier | admin | service_role |
|---|---|---|---|---|---|
| SELECT | - | owner | mem על `supplier_id` | all | bypass |
| INSERT | - | - | - | - | Y / issue RPC |
| UPDATE | - | - | - | - | רק `redeem_voucher` |
| DELETE | - | - | - | - | - |

`wrong_supplier` חוזר חיצונית כ-`not_found`.

### 2.4 `wallet_entries`

| Action | anon | authenticated | supplier | admin | service_role |
|---|---|---|---|---|---|
| SELECT | - | own account | - | all | bypass |
| INSERT | - | - | - | - | `fn_wallet_transfer` only |
| UPDATE | - | - | - | - | - |
| DELETE | - | - | - | - | - |

סכומים: integer agorot. אין משיכה החוצה.

### 2.5 `supplier_members`

| Action | anon | authenticated | supplier | admin | service_role |
|---|---|---|---|---|---|
| SELECT | - | - | same supplier mem | all | bypass |
| INSERT | - | - | owner invite via action | Y | Y |
| UPDATE | - | - | owner (`is_active`, role) | Y | Y |
| DELETE | - | - | soft deactivate | Y | Y |

### 2.6 `notification_outbox`

| Action | anon | authenticated | supplier | admin | service_role |
|---|---|---|---|---|---|
| SELECT | - | - | - | Y | bypass |
| INSERT | - | - | - | - | trigger/definer |
| UPDATE | - | - | - | - | worker claim/sent/dead |
| DELETE | - | - | - | - | - |

### 2.7 `payments`

| Action | anon | authenticated | supplier | admin | service_role |
|---|---|---|---|---|---|
| SELECT | - | own order | - | all | bypass |
| INSERT | - | - | - | - | Y |
| UPDATE | - | - | - | - | Y (webhook) |
| DELETE | - | - | - | - | - |

### 2.8 `payout_statements`

| Action | anon | authenticated | supplier | admin | service_role |
|---|---|---|---|---|---|
| SELECT | - | - | owner | all | bypass |
| INSERT | - | - | - | - | Y (generator) |
| UPDATE | - | - | - | mark paid (super_admin path) | Y |
| DELETE | - | - | - | - | - |

קופון: אין שורות payout. פיזי בלבד אחרי `platform_percent` מצולם.

## 3. רשימת 44 הטבלאות (אלפביתי)

1. `affiliates`
2. `audit_log`
3. `cart_items`
4. `carts`
5. `cashback_rules`
6. `categories`
7. `coupon_codes`
8. `coupon_deals`
9. `coupons`
10. `escrow_holds`
11. `hero_slides`
12. `idempotency_keys`
13. `media_assets`
14. `notification_outbox`
15. `order_items`
16. `orders`
17. `payment_tokens`
18. `payment_webhook_events`
19. `payments`
20. `payout_statement_lines`
21. `payout_statements`
22. `product_categories`
23. `product_images`
24. `product_variants`
25. `products`
26. `profiles`
27. `rate_limits`
28. `referrals`
29. `security_events`
30. `split_executions`
31. `supplier_applications`
32. `supplier_bank_accounts`
33. `supplier_members`
34. `suppliers`
35. `user_addresses`
36. `user_notification_preferences`
37. `user_rate_limits`
38. `vendors`
39. `voucher_redemptions`
40. `vouchers`
41. `wallet_accounts`
42. `wallet_balances`
43. `wallet_entries`
44. `wallet_transactions`

## 4. מחוץ לספירה

מיגרציות כוללות גם agents, analytics partitions, `ledger_*`, notification מורחב, reconciliation, Cardcom settlements וכו'. לא במטריצת 44; RLS שלהן: service/admin עד מסמך נפרד.

## 5. Acceptance

- [ ] לכל אחת מ-44 הטבלאות: RLS enabled (+ FORCE על כסף)
- [ ] אין policy שמאפשרת ל-authenticated לעדכן `orders.status` / `vouchers.status` / wallet balances
- [ ] ספק לא כותב `platform_percent`
- [ ] anon לא כותב cart/money
- [ ] outbox + webhook journals בלי כתיבת לקוח

## 6. Revision

| Date | Change |
|---|---|
| 2026-08-03 | ke-arch docs-lifecycle: מטריצת RLS ל-44 טבלאות |
