# Data Model

Every table in production: what it holds, what it points at, and who can read
or write it.

Measured against `ixvwfbuvfxxsjiywhbbb` on **2026-09-01** through MCP.
**61 base tables, 12 views, RLS enabled on every table, 0 disabled, 133
policies.**

Companion documents: `docs/MONEY-MODEL.md` (the agorot columns),
`docs/ROLES-AND-PERMISSIONS.md` (who is who),
`docs/SCHEMA-REALITY-CHECK.md` (names the docs use that do not exist here).

---

## 1. Read this before using any table

**Three pairs of tables model the same thing twice.** In each pair one side is
live and the other is a fossil, and picking the wrong one gives you a query
that returns nothing and no error.

| Concept | Live | Fossil | Evidence |
|---|---|---|---|
| Wallet | `wallet_accounts` (13 rows) + `wallet_entries` (2) | `wallet_balances` (**0**) + `wallet_transactions` (**0**) | row counts |
| Coupon issuance | `vouchers` (0, awaiting first sale) | `coupon_codes` (2), `coupons` (0) | `coupon_codes` is the pre-voucher model |
| Supplier | `suppliers` (12) | `vendors` (6) | `products.supplier_id` points at `suppliers` |

The wallet duplication is the one that bites. Production has a view,
`v_wallet_balance_drift`, whose entire purpose is to detect the two sides
disagreeing, which is the clearest possible statement that both exist and that
somebody expected them to diverge. **Write `wallet_accounts` / `wallet_entries`.**

`vendors` is still populated and still referenced by `coupon_deals` and
`coupons`, so it is not dead, but `products` and `order_items` scope to
`suppliers`. Treat `vendors` as the legacy catalogue-owner concept.

---

## 2. The shape, in one diagram

```
auth.users
    │ 1:1
    ▼
 profiles ──┬─── orders ─────┬─── order_items ──┬── vouchers ── voucher_redemptions
            │      │         │        │         └── settlement_events
            │      │         │        └── split_executions
            │      │         ├─── payments ──┬── payment_events
            │      │         │               └── payment_webhook_events
            │      │         ├─── refunds
            │      │         ├─── invoices
            │      │         └─── stock_reservations
            │      └── user_addresses (orders.address_id)
            │
            ├── wallet_accounts ── wallet_entries          [live]
            ├── wallet_balances ── wallet_transactions     [empty, fossil]
            ├── carts (items jsonb)  ── abandoned_cart_nudges
            ├── payment_tokens ── subscriptions ── subscription_charges
            ├── referrals, referral_signals, affiliates
            └── push_tokens, newsletter_subscribers

 suppliers ─┬── supplier_members  (owner | manager | scanner)
            ├── supplier_branches
            ├── supplier_staff    (bcrypt PIN, till app)
            └── products ─┬── product_variants
                          ├── product_images
                          └── categories

 [server-only] rate_limits, user_rate_limits, search_index_outbox,
               search_index_dlq, notification_outbox, audit_log,
               seo_redirects, legacy_percent_archive_112
```

---

## 3. Every table

`Pol` is the policy count. `RLS` posture: **owner** = scoped to
`auth.uid()`; **public** = readable by `anon`; **staff** = admin or support
only; **supplier** = scoped through `supplier_members`; **server** = closed to
all client roles.

### 3.1 Commerce core

| Table | Cols | Pol | References | RLS posture |
|---|---|---|---|---|
| `orders` | 25 | 4 | `user_addresses` | owner + supplier (paid only) + staff; **writes admin-only** |
| `order_items` | 42 | 4 | `orders`, `products`, `product_variants`, `suppliers` | owner + supplier + support; writes admin-only |
| `payments` | 20 | 1 | `orders` | owner read + admin; no client write policy |
| `payment_events` | 15 | 2 | `orders`, `payments` | owner read + staff read; **append-only by trigger** |
| `payment_webhook_events` | 9 | **0** | `payments` | **server** |
| `payment_tokens` | 10 | 3 | `profiles` | owner |
| `refunds` | 19 | 2 | `orders`, `payments` | owner read + staff read |
| `invoices` | 20 | 1 | `orders`, `payments` | owner read |
| `settlement_events` | 15 | 1 | `orders`, `order_items`, `suppliers` | **server** (restrictive deny) |
| `split_executions` | 11 | 1 | `orders`, `order_items`, `payments`, `suppliers` | owner + supplier read |
| `escrow_holds` | 16 | 1 | `orders`, `order_items`, `suppliers`, `vouchers`, `coupon_codes` | owner + supplier read. **2 legacy rows, no writer** |
| `stock_reservations` | 10 | 1 | `orders`, `products`, `product_variants` | **server** (restrictive deny) |
| `carts` | 7 | 1 | `profiles` | owner or session. **The only table `anon` may write.** Lines are `items` jsonb |

`order_items` at 42 columns is the money row. It carries a **snapshot** of
everything settlement depends on so nothing is joined back to a live product:
`platform_percent`, `commission_percent_snapshot`, `upfront_percent`,
`supplier_split_percent`, the eight `_agorot` amounts, and supplier identity by
value (`supplier_name`, `supplier_phone`, `supplier_address`,
`supplier_logo_url`). Renaming a supplier does not rename the sale.

### 3.2 Vouchers

| Table | Cols | Pol | References | RLS posture |
|---|---|---|---|---|
| `vouchers` | 33 | 1 | `orders`, `order_items`, `products`, `suppliers` | owner, admin, **or supplier only after redeeming it** |
| `voucher_redemptions` | 14 | 1 | `vouchers`, `suppliers`, `supplier_staff` | supplier read; written by `redeem_voucher` |
| `coupon_codes` | 17 | 1 | `products`, `order_items`, `profiles`, `suppliers` | owner. **Pre-voucher model, 2 rows** |
| `coupons` | 17 | 1 | `vendors` | 0 rows |
| `coupon_deals` | 22 | 4 | `vendors` | public read. 8 rows |

The `vouchers` read policy is gated on `redeemed_by_supplier_id`, which is NULL
until redemption, so a supplier cannot enumerate outstanding liability against
their own business.

### 3.3 Catalogue

| Table | Cols | Pol | References | RLS posture |
|---|---|---|---|---|
| `products` | **81** | 5 | `categories`, `suppliers` | public: `status='active' AND deleted_at IS NULL`. Write: admin or `content_uploader` |
| `product_variants` | 18 | 5 | `products` | public read |
| `product_images` | 7 | 4 | | public read |
| `categories` | 13 | 5 | | public read |
| `media_assets` | 13 | 4 | | staff |
| `suppliers` | 19 | 4 | | public read where not soft-deleted |
| `supplier_branches` | 13 | 3 | `suppliers` | public read when active; member or admin write |
| `supplier_members` | 8 | 4 | `suppliers` | self or owner |
| `supplier_staff` | 11 | 1 | `suppliers` | supplier. `pin_hash` bcrypt, `failed_attempts`, `locked_until` |
| `supplier_leads` | 15 | 2 | | staff |
| `vendors` | 23 | 4 | `profiles` | legacy. 6 rows |

`products` at 81 columns is the widest table in the system. `anon` and
`authenticated` get **separate** SELECT policies rather than one with an `OR`,
so the anonymous plan stays simple.

### 3.4 Wallet, growth, marketing

| Table | Cols | Pol | Rows | Note |
|---|---|---|---|---|
| `wallet_accounts` | 7 | 1 | 13 | **live** |
| `wallet_entries` | 9 | 1 | 2 | **live**, signed amounts |
| `wallet_balances` | 9 | 4 | 0 | fossil |
| `wallet_transactions` | 16 | 4 | 0 | fossil |
| `cashback_rules` | 13 | 4 | | references `categories` |
| `referrals` | 20 | 4 | | `referral_status`: pending, completed, rejected, flagged |
| `referral_signals` | 7 | 1 | | **server**. Anti-fraud |
| `referral_program_settings` | 10 | 1 | | singleton config |
| `affiliates` | 17 | 4 | | `affiliate_status` |
| `discount_campaigns` | 20 | 1 | | `percent_bp` **or** `amount_agorot`, never both |
| `discount_redemptions` | 6 | 1 | | |
| `newsletter_subscribers` | 18 | 1 | | double opt-in |
| `email_suppressions` | 4 | 1 | | bounces and complaints |
| `abandoned_cart_nudges` | 11 | 1 | | |
| `push_tokens` | 12 | 4 | | till app and PWA |

`discount_campaigns_kind_shape` enforces the exclusivity in the schema:

```sql
(kind = 'percent' AND percent_bp IS NOT NULL AND amount_agorot IS NULL)
OR (kind = 'fixed' AND amount_agorot IS NOT NULL AND percent_bp IS NULL)
```

Note `percent_bp`: basis points. It is the **only** `_bp` column in production.
`platform_percent` everywhere else is a whole-percent `numeric`, and
`platform_bp` does not exist.

### 3.5 Subscriptions

| Table | Cols | Pol | References |
|---|---|---|---|
| `subscriptions` | 18 | 2 | `profiles`, `products`, `suppliers`, `orders`, `payment_tokens` |
| `subscription_charges` | 11 | 1 | `subscriptions` |

`subscription_charges_split_is_exact` enforces
`platform_fee_agorot + supplier_due_agorot = amount_agorot`.
`period_key` is a `timestamptz` used as the idempotency key for a billing
period, so a retried cycle cannot double-charge.

### 3.6 Search and content

| Table | Cols | Pol | Note |
|---|---|---|---|
| `search_index_outbox` | 9 | **0** | **server**. Durable reindex queue; `product_id` deliberately **not** a FK |
| `search_index_dlq` | 7 | 1 | **server** (restrictive deny) |
| `search_events` | 10 | 1 | **aggregate**, not an event log: `term`, `searches`, `empty_results`, `last_hits` |
| `popular_searches` | 7 | 5 | curated, public read |
| `user_recent_searches` | 6 | 2 | owner |
| `seo_redirects` | 12 | 1 | staff |
| `homepage_sections` | 11 | 2 | public read when `is_active`; admin write |
| `banners` | 14 | 2 | same |

`search_index_outbox.product_id` has no foreign key on purpose: a DELETE of the
product must leave the "remove this document" instruction behind, and
`ON DELETE CASCADE` would delete exactly the row carrying the work.

### 3.7 Platform

| Table | Cols | Pol | Note |
|---|---|---|---|
| `profiles` | 13 | 2 | 1:1 with `auth.users`. `role` is authoritative, not `app_metadata` |
| `user_addresses` | 16 | 4 | owner; supplier reads full address only for physical items |
| `audit_log` | 11 | 4 | `audit_action` enum, 9 values |
| `notification_outbox` | 17 | 1 | outbox with its own retry state. Email **and** push columns |
| `rate_limits` | 4 | **0** | **server** |
| `user_rate_limits` | 4 | **0** | **server** |
| `legacy_percent_archive_112` | 6 | 1 | **server**. Frozen archive |

---

## 4. Views

All 12 are `security_invoker`, so a view cannot be used to read past the RLS of
its base tables.

| View | Grants |
|---|---|
| `v_banners_live`, `v_homepage_sections_live`, `v_low_stock`, `v_wallet_ledger`, `v_admin_pending_queues` | `anon`, `authenticated`, `service_role` |
| `v_abandoned_cart_recovery`, `v_cart_reaper_backlog`, `v_discount_campaign_performance`, `v_newsletter_stats`, `v_referral_review_queue`, `v_referral_stats`, `v_wallet_balance_drift` | `service_role` only |

`v_wallet_balance_drift` exists to detect the two wallet models disagreeing
(§1).

---

## 5. Enums

```
order_status          pending, paid, partially_fulfilled, fulfilled, cancelled,
                      refunded, platform_settled
settlement_status     pending, paid, split_executed, escrow_held, escrow_released,
                      redeemed, refunded, cancelled, platform_settled
order_item_status     pending, issued, shipped, delivered, cancelled, refunded
payment_status        initiated, redirected, succeeded, failed, refunded,
                      platform_settled
payment_kind          charge, refund
voucher_status        issued, redeemed, expired, cancelled, refunded
voucher_scan_outcome  success, already_redeemed, expired, cancelled, refunded,
                      wrong_supplier, not_found, invalid_signature,
                      invalid_request, unauthorized, rate_limited
refund_state          requested, approved, rejected, executing, completed, failed
refund_ground         distance_sale_14d, defect, service_not_provided,
                      duplicate_charge, extended_window, goodwill
user_role             customer, content_uploader, vendor, admin, super_admin, support
supplier_member_role  owner, manager, scanner
product_type          coupon, physical, service, recurring
product_status        draft, active, paused, sold_out, archived
product_approval_status  draft, pending, approved, rejected
commission_type       coupon_absolute, physical_percent
escrow_status         held, released, refunded
coupon_status         issued, used, expired, refunded
audit_action          created, updated, deleted, restored, login, logout,
                      permission_change, status_change, manual_override
payment_event_type    38 values, checkout_started .. reconciliation_amount_differs
wallet_tx_type        earn, redeem, expire, refund
wallet_tx_source      cashback, referral, manual
```

Two enums have **no tables behind them**: `payout_status`
(`draft, pending_approval, approved, paid, cancelled`) and `payout_line_type`
(`physical_delivery, coupon_redemption, adjustment`). There is no
`supplier_payouts` table and never has been in this lineage. See
`docs/SCHEMA-REALITY-CHECK.md` §4.

`escrow_held` and `escrow_released` in `settlement_status` are **dead labels
nothing can write**. `coupon_status` uses `used` where `voucher_status` uses
`redeemed`; they are different enums for different generations of the model.

---

## 6. Integrity worth knowing

Conservation, enforced as CHECK constraints:

```sql
vouchers_conservation                face_value = coupon_price + remaining_amount_due
split_executions_conservation        face_value = commission + supplier
subscription_charges_split_is_exact  platform_fee + supplier_due = amount
invoices_amounts_add_up              net + vat = total
escrow_holds_conservation            held = commission + release      [legacy]
```

Israeli consumer law, on `refunds`:

```sql
refunds_fee_within_statutory_cap
  cancellation_fee_agorot <= LEAST((requested_agorot + 19) / 20, 10000)
refunds_no_fee_when_our_fault
  ground NOT IN ('defect','duplicate_charge') OR cancellation_fee_agorot = 0
refunds_completed_has_money
  state <> 'completed' OR (granted_agorot IS NOT NULL AND completed_at IS NOT NULL)
```

Append-only, by trigger: `payment_events_append_only` refuses UPDATE and DELETE.
`settlement_events_no_rewrite` does the same for settlement.

**Soft delete** is `deleted_at IS NULL` on `products`, `suppliers`, `orders`,
`order_items`, `coupon_deals`, `wallet_*`, `vendors`, `supplier_staff`. Public
read policies check it; some support policies deliberately do not, so admins see
soft-deleted rows and support does not.

### What is missing

- **No conservation constraint on `order_items`**, although
  `face_value_agorot = paid_on_site_agorot + balance_due_agorot` holds in the
  application and in tests.
- **No sign constraint on any of the eight directly-written `_agorot` columns on
  `order_items`**, while `vouchers`, `split_executions` and `settlement_events`
  all constrain the same quantities. See `docs/MONEY-MODEL.md` §3.2.
- **Six foreign keys with no index**, two of them on money-path joins. See
  `docs/INDEX-USAGE-REPORT.md` §3.

---

## 7. Row counts, 2026-09-01

```
products 80 · wallet_accounts 13 · categories 12 · suppliers 12 · profiles 10
coupon_deals 8 · vendors 6 · orders 4 · order_items 3 · payments 2
coupon_codes 2 · escrow_holds 2 · wallet_entries 2

0 rows: vouchers, voucher_redemptions, payment_events, refunds, subscriptions,
        subscription_charges, supplier_branches, homepage_sections, banners,
        search_index_outbox, wallet_balances, wallet_transactions, coupons
```

Pre-launch. No customer has completed a coupon purchase. Most "the table is
empty" observations are correct rather than symptoms.

---

## 8. Other schemas

`wp_import` holds **14 tables** for the WordPress migration and does not appear
in a `list_tables` scoped to `public`: `categories`, `coupons`, `customers`,
`id_map`, `import_batches`, `issues`, `media`, `migration_log`, `order_items`,
`orders`, `products`, `url_inventory`, `validation_reports`, `vouchers`,
`wp_category_map`, `wp_product_map`, `wp_redirect_map`, plus five `v_*` views.

**`wp_import.orders`, `wp_import.products` and `wp_import.vouchers` shadow
`public` names.** Always schema-qualify when working near the import.

---

## 9. Verification

```sql
select c.relname,
  (select count(*) from information_schema.columns col
    where col.table_schema = 'public' and col.table_name = c.relname) as cols,
  coalesce((select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname), 0) as policies,
  c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
```
