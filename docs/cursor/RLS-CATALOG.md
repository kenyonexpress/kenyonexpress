# RLS catalog (four pack roles)

Live numbers (2026-09-01, project
`ixvwfbuvfxxsjiywhbbb`):
61 base tables in
`public`,
RLS **enabled on all**, 0 disabled, 133 policies. Views are
`security_invoker`
(a view cannot read past base RLS).

Postgres roles (connection):
`anon`,
`authenticated`,
`service_role`
(BYPASSRLS, server only,
`src/lib/supabase/admin.ts`).

Application roles in this pack:

| Pack | `profiles.role` / membership | Helper |
|---|---|---|
| customer | `customer` | `auth.uid()` on owner rows. **Never** `has_role('customer')` (that returns true for every signed-in profile). |
| content-uploader | `content_uploader` | `has_role('content_uploader')` also true for admin / super_admin |
| coupon-partner | `vendor` and/or row in `supplier_members` | `is_supplier_member(uuid)`, `is_supplier_order(uuid)`, `is_supplier_owner(uuid)`. Scanner is `supplier_member_role`, not a profile role. |
| admin | `admin`, `super_admin` | `is_admin()`. `support` is **not** admin: `is_support()` is the expanded read set. |

Legend: **R** read (SELECT), **C** insert, **U** update, **D** delete.
**own** = only rows where `user_id` / `id` = `auth.uid()`.
**pub** = catalogue predicate `active AND deleted_at IS NULL` (or equivalent public read).
**mem** = supplier membership scoped.
**rpc** = only via `SECURITY DEFINER` / service_role (no client policy).
**—** = deny.

`service_role` is omitted from every row: it bypasses RLS. Triggers still fire (status guards, append-only, conservation CHECKs).

---

## 0. Load-bearing facts before the matrix

1. Migration `126_revoke_authenticated_dml` is applied, but **authenticated still holds I/U/D grants on 56 relations**, including money tables. RLS is the only stop. Treat a missing write policy as a live hole.
2. Helper EXECUTE grants are the real access surface. 61 DEFINER functions, all with pinned `search_path`. `anon` EXECUTE: `is_admin()`, `is_supplier_member(uuid)`, `fn_record_recent_search(text)`, plus three inert trigger functions (`enqueue_search_index`, `payment_events_append_only`, `refunds_force_due_by`) that return `trigger`.
3. `check_rate_limit` is **service_role only** (migration 127). Public RPC returns 401/42501.
4. Unified policy names are `<table>_<cmd>_unified` except catalogue SELECT, which is split `_select_anon` / `_select_authenticated` on `products`, `product_variants`, `categories`, `popular_searches`.
5. `auth.uid()` is wrapped in a scalar subquery so it becomes an InitPlan, not a per-row call.

---

## 1. Catalogue and content

| Table | customer | content-uploader | coupon-partner | admin | Reasoning / flag |
|---|---|---|---|---|---|
| `products` | R pub | R + C/U/D staff | R pub; U mem if member policy allows own supplier drafts | R + C/U/D | Public read is `active AND deleted_at IS NULL`. Writes re-check `is_admin()` or membership inside the policy. |
| `product_variants` | R pub | R + C/U/D staff | R pub | R + C/U/D | Same split SELECT as products. |
| `product_images` | R pub | C/U/D staff | R pub | C/U/D | **Flag:** DB-SECURITY lists ALL four commands as `public` (policy applies to every PG role). Inner USING must stay tight. If inner ever becomes `true`, anon can write images. |
| `categories` | R pub | C/U/D staff | R pub | C/U/D | DML listed `public` with inner staff check. Same class of flag as images. |
| `media_assets` | R pub (`public read`) | C (`staff insert`) U (`staff update`) | — | D (`admin delete`) | Correctly split. |
| `suppliers` | R pub | C/U staff | R pub; U mem | C/U/D | Soft-delete hidden from public. |
| `supplier_branches` | R active | C/U staff | R + C/U mem | R + C/U/D | |
| `coupon_deals` | R pub | C/U/D staff | R pub | C/U/D | Points at legacy `vendors`. |
| `coupons` | R (`Public can view coupons`) | — | — | R | 0 rows. Fossil. No client DML. |
| `homepage_sections` | R when `is_active` | — | — | C/U/D | Live view `v_homepage_sections_live`. |
| `banners` | R when `is_active` | — | — | C/U/D | Live view `v_banners_live`. |
| `popular_searches` | R | C/U/D staff | R | C/U/D | Split SELECT anon/auth. |
| `seo_redirects` | R (anon+auth, one policy) | — | — | rpc | No client DML. |
| `cashback_rules` | R pub | C/U/D staff | R | C/U/D | |

---

## 2. Identity, cart, account

| Table | customer | content-uploader | coupon-partner | admin | Reasoning / flag |
|---|---|---|---|---|---|
| `profiles` | R own, U own (non-privilege cols) | same | same | R + U including `role` | INSERT is `handle_new_user` trigger. `enforce_profile_privilege_columns` blocks self-promotion. **Flag:** U own without the trigger would be privilege escalation. service_role skips the trigger (`auth.uid()` NULL). |
| `carts` | R/C/U/D own or guest session | same if they shop | same | R all | **The only table anon may write.** Lines are `items` jsonb. **Flag:** a broken owner predicate is a cross-cart overwrite. Guest session cookie is the anon identity. |
| `user_addresses` | R/C/U/D own | own | R mem for physical ship-to | R | `is_supplier_shipping_order` for partner address read. |
| `push_tokens` | R/C/U/D own | own | own (till device) | R | |
| `user_recent_searches` | R/D own; C via `fn_record_recent_search` | own | own | R | Insert denied on the table; RPC is granted to anon+auth on purpose. |
| `newsletter_subscribers` | R own | — | — | R | Insert via actions / DEFINER, not table policy. |

---

## 3. Commerce and money

| Table | customer | content-uploader | coupon-partner | admin | Reasoning / flag |
|---|---|---|---|---|---|
| `orders` | R own | — (no extra) | R mem **paid+** (`is_supplier_order`, status in paid/partial/fulfilled, not deleted) | R + C/U/D | Writes in policies are admin-gated. Checkout uses service_role. **Flag:** authenticated GRANT still includes I/U/D; policy must stay admin-only. |
| `order_items` | R own (via order) | — | R mem | R + C/U/D admin | Money row. Same grant flag. No conservation CHECK (see money invariants). |
| `payments` | R own | — | — | R | **No client write policy.** Correct. |
| `payment_events` | R own | — | — | R staff | Append-only trigger. Client cannot U/D even if they guess the grant. |
| `payment_webhook_events` | — | — | — | rpc | **0 policies.** Deny-all to clients. |
| `payment_tokens` | R own; U/D own (revoke, default) | own | — | R | No client insert (Cardcom webhook / checkout writes). |
| `refunds` | R own | — | — | R staff; C/U via action | CHECKs are the law, not RLS. |
| `invoices` | R own | — | — | R | No client DML. |
| `settlement_events` | — | — | — | rpc | Restrictive `USING (false)` or equivalent deny. |
| `split_executions` | R own | — | R mem | R | No client DML. |
| `escrow_holds` | R own | — | R mem | R | Fossil. 2 rows. No writer. Read is harmless. |
| `stock_reservations` | — | — | — | rpc | Server deny. |
| `vouchers` | R own | — | R **only after** `redeemed_by_supplier_id` set | R | **No client C/U/D.** Redeem is `redeem_voucher` RPC. Partner cannot list outstanding issued liability. That is deliberate. |
| `voucher_redemptions` | R own (limited) | — | R mem | R | Insert via RPC only. |
| `coupon_codes` | R own | — | — | R | Pre-voucher fossil (2 rows). |
| `subscriptions` | R own | — | — | R | Token charges are cron / service. |
| `subscription_charges` | R own | — | — | R | Split CHECK exact. |

---

## 4. Wallet (two models)

| Table | customer | content-uploader | coupon-partner | admin | Reasoning / flag |
|---|---|---|---|---|---|
| `wallet_accounts` | R own | own | own | R | **Live.** No client C/U/D. |
| `wallet_entries` | R own | own | own | R | **Live.** Signed amounts. Server write only. |
| `wallet_balances` | R/C/U/D own (policies exist) | same | same | R + DML | **Fossil, 0 rows.** **OVER-PERMISSIVE:** authenticated DML policies on a ledger that must not be the source of truth. A future writer using this pair bypasses the live append-only style of `wallet_entries`. |
| `wallet_transactions` | R/C/U/D own | same | same | R + DML | **Fossil, 0 rows.** Same flag as balances. |

---

## 5. Partner, growth, admin

| Table | customer | content-uploader | coupon-partner | admin | Reasoning / flag |
|---|---|---|---|---|---|
| `supplier_members` | — | — | R/C/U/D self or owner | R + DML | Owner invites. Scanner cannot add owners. |
| `supplier_staff` | — | — | R mem; PIN via `set_supplier_staff_pin` | R | No client insert on the table. |
| `supplier_leads` | C via `submitSupplierLead` (action) | — | — | R staff; U staff | Public form does not use a wide INSERT policy. |
| `vendors` | — | — | — | C/U/D **super_admin** | Legacy. 6 rows. `coupon_deals` still FK here. |
| `affiliates` | R own if any | — | — | R + DML | |
| `referrals` | R own; C own code | — | — | R + DML | Signals table is separate and server-only. |
| `referral_signals` | — | — | — | rpc | Anti-fraud. Deny clients. |
| `referral_program_settings` | — | — | — | R | Singleton. No client write. |
| `discount_campaigns` | — | — | — | R | Writes via admin actions. |
| `discount_redemptions` | R own | — | — | R | |
| `abandoned_cart_nudges` | — | — | — | R | Cron writes. |
| `email_suppressions` | — | — | — | R | |
| `notification_outbox` | — | — | — | R (admin inside policy) | Drain is cron / service. |
| `search_events` | — | — | — | R staff | Aggregate, not a raw log. |
| `audit_log` | — | — | — | R | C/U/D policies are **deny** (`USING false`). Trigger is the only writer. |
| `rate_limits` | — | — | — | rpc | 0 policies. |
| `user_rate_limits` | — | — | — | rpc | 0 policies. |
| `search_index_outbox` | — | — | — | rpc | 0 policies. `product_id` is not a FK. |
| `search_index_dlq` | — | — | — | rpc | Restrictive deny. |
| `legacy_percent_archive_112` | — | — | — | rpc | Frozen archive. |

---

## 6. Over-permissive and trap list (ranked)

| # | Finding | Why it matters | Direction |
|---|---|---|---|
| 1 | authenticated I/U/D **grants** on 56 tables including `orders`, `order_items`, `vouchers`, wallet | RLS is single-layer. One bad `USING (true)` is a money incident | Do not "simplify" unified policies. Revoke remaining grants only with a measured follow-up (125 already taught that over-revoke breaks the anonymous catalogue) |
| 2 | Fossil `wallet_balances` / `wallet_transactions` still have client DML policies | Two ledgers. Drift view `v_wallet_balance_drift` exists because disagreement was expected | Deny client DML on the fossil pair; keep live pair read-only to clients |
| 3 | `product_images` / `categories` DML policies attached to `public` | Relies entirely on inner `is_admin()` / membership. Easy to copy-paste wrong | Prefer authenticated-only DML policies even if inner checks exist |
| 4 | `has_role('customer')` is true for every profile | A policy written as "customers only" grants staff | Use `user_id = (SELECT auth.uid())` for ownership |
| 5 | `has_role` hierarchy omits `support` | Staff-wide policies that use `has_role('vendor')` silently drop support; `is_support()` silently includes admins | Pick the helper on purpose |
| 6 | `carts` anon ALL | Required for guest shop. Also the widest anon write in the database | Session id must stay unguessable; never log it |
| 7 | `vouchers` has no status trigger | RPC + `WHERE status = 'issued'` is the lock. A service_role script can set any enum value | Do not add a second client update policy "for convenience" |
| 8 | `is_admin()` / `is_supplier_member()` EXECUTE granted to **anon** | Required: RLS under anon must call them (they return false). Not a hole by itself | Do not revoke; 165 was cancelled because revoking helpers 42501'd the anonymous catalogue |
| 9 | Admin client in the browser | If `SUPABASE_SERVICE_ROLE_KEY` is ever `NEXT_PUBLIC_`, boot must refuse (leaky-name guard). BypassRLS plus a leaked key is catastrophic | Rotation: see risk register |
| 10 | Coupon-partner cannot SELECT issued vouchers | Looks like a bug, is a fraud control (no liability dump) | Lookup RPC is the "is this valid?" path without a dump |

---

## 7. Server-only deny set (all four pack roles: deny all)

`payment_webhook_events`, `rate_limits`, `user_rate_limits`, `search_index_outbox`, `search_index_dlq`, `settlement_events`, `stock_reservations`, `referral_signals`, `legacy_percent_archive_112`.

Two shapes: zero policies, or a single RESTRICTIVE `USING (false)`. Both deny clients. Migration 144 revoked underlying grants on several of these so adding a read policy later cannot quietly restore INSERT.

---

## 8. RPCs coupon-partners actually call

| Function | Grant | Why it is not a table policy |
|---|---|---|
| `redeem_voucher` | authenticated | Atomic consume. Writes vouchers + redemptions under DEFINER |
| `verify_supplier_staff_pin` | authenticated | Till identity. Not a login |
| `supplier_app_context` | authenticated | What the till may show |

Customer checkout does **not** go through those. It uses service_role in server actions.

---

## 9. What this catalog is not

It is not a substitute for
`pg_policies`
on production. Counts move when a migration lands. Re-run the verification query in
`docs/DATA-MODEL.md`
§9 after any apply. This pack does not apply migrations.

---

## 10. content-uploader vs money (explicit deny)

content-uploader is staff for **catalogue**. It is not a wallet operator.

| Surface | content-uploader |
|---|---|
| `refunds`, `payments`, `vouchers` DML | deny (admin actions `requireSection` money) |
| `wallet_*` DML | deny |
| `updateUserRole` | deny |
| `retryFinalizePayment` | deny |
| `products` / `categories` / images | allow via staff policies |
| `/admin/payments`, `/admin/payouts` | proxy may let them **hit** `/admin/*` (role is in the optimistic set). Page + action must 403. If a page forgets `requireSection`, this is the hole to test first |

coupon-partner is **not** `content_uploader`. A restaurant scanner with a
`supplier_members`
row and
`profiles.role = customer`
is the common case. Gating the till on
`vendor`
alone would lock them out.

---

## 11. Migration 165 (do not "tighten" anon helpers)

165 would have revoked public EXECUTE on helpers that public SELECT policies call. Measured result: anonymous catalogue
`42501`.
Cancelled. An audit that counts "anon EXECUTE on DEFINER" as a finding is counting the RLS implementation, not a leak. Real leaks are §6 items 1–3.
