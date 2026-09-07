# Data flow: six money paths, table by table

Companion:
`docs/cursor/ARCHITECTURE-OVERVIEW.md`,
`docs/PAYMENT-FLOW.md`,
`docs/VOUCHER-LIFECYCLE.md`,
`docs/DB-SECURITY-MODEL.md`,
`docs/DATA-MODEL.md`.

Convention in this file:

- **Writer** is the process that issues the SQL (server action, webhook, RPC, cron, trigger).
- **Client role** is `anon` | `authenticated` | `service_role`. Application roles (customer, content-uploader, coupon-partner, admin) only matter where a policy names
  `is_admin()`,
  `has_role()`,
  `is_supplier_member()`,
  or
  `auth.uid()`.
- **Policy** is the live unified name where known. A dash in DML means the client cannot do that command; the writer must be
  `service_role`
  or a
  `SECURITY DEFINER`
  function.

`authenticated` still holds INSERT/UPDATE/DELETE **grants** on 56 relations, including orders, order_items, payments, vouchers, refunds, and every wallet table (migration 126 revoked server-only tables only). **RLS is the only stop.** A missing write policy on those tables is a live hole, not a defence-in-depth gap.

---

## 0. Shared checkout prelude (both coupon and physical)

Guest or signed-in. Prices never travel from the browser.

| Step | Writer | Tables written | RLS / gate |
|---|---|---|---|
| 1. Browse catalogue | RSC, anon client | none (read) | `products_select_anon` / `_select_authenticated`: `status = 'active' AND deleted_at IS NULL` |
| 2. Add line | `addToCart` | `carts` (`items` jsonb). **No `cart_items` table.** | `carts` ALL for owner or guest session. **The only table `anon` may write.** |
| 3. Update / remove / coupon code | cart actions | `carts` | same |
| 4. Sign-in at Pay (if guest) | `/auth/callback` → `mergeGuestCart` | `carts` (merge into user row); guest cookie cleared | owner policy; double-merge is tested |
| 5. `beginCheckout` | server action, **admin client** | `orders` (status `pending`), `order_items` (money snapshot), `payments` (`initiated`), `stock_reservations`, `payment_events` (`checkout_started`) | Client write policies on `orders` / `order_items` are admin-only. This path uses service_role. Stock reservation is server-only (`stock_reservations` restrictive deny / no client policy). |
| 6. Low Profile iframe **or** token charge | Cardcom / `submitCheckout` | `payments.status` → `redirected` (iframe) or `succeeded`/`failed` (token) | no client write on `payments` |

`beginCheckout` validates the cart **server-side**. The client contributes ids and consent. A line that fails
`validateCartView`
(implausible discount, missing `coupon_price_ils`, missing `platform_percent`, sold out) never opens Cardcom.

Stock TTL is 15 minutes, shorter than
`ORDER_EXPIRY_MINUTES`
on purpose: the reservation dies before the pending order does.

---

## 1. Coupon purchase

Product:
`product_type = 'coupon'`,
sellable only if
`coupon-offer.ts`
returns
`sellable: true`
(absolute
`coupon_price_ils`
present).

| Step | Writer | Tables written | What is snapshotted / moved | RLS / gate |
|---|---|---|---|---|
| 1. Prelude | §0 | `carts`, `orders`, `order_items`, `payments`, `stock_reservations` | `paid_on_site_agorot` = coupon_price × qty. `balance_due_agorot` = face − paid. `commission_agorot` = paid (platform keeps all). `supplier_immediate_agorot` = 0. `platform_percent` copied onto the line anyway so the catalogue invariant is one shape. Downstream reports `platformPercentBps = 10000` because that is the split that happened. | service_role writes |
| 2. Cardcom callback | `POST /api/payments/cardcom/webhook` | `payment_webhook_events` (raw, server-only), then `payment_events` (append-only trigger), then trusted `GetLpResult` | Body is not money. Amount taken from re-fetch. Dedup `(provider, external_event_id)`. Replay = 200 no-op. | `payment_webhook_events`: 0 policies, server. `payment_events`: owner/staff SELECT, trigger refuses UPDATE/DELETE |
| 3. `finalizeOrder` | `src/server/payments/finalize.ts` **only writer of `paid`** | `payments` → `succeeded`; `orders` → `paid`; `order_items` → `split_executed` (skips `paid` on the line when the engine goes pending→split); `settlement_events`; `vouchers` (one row per unit); `notification_outbox` (voucher email); `invoices` enqueue; `referrals` may complete (see §6) | Conservation on each voucher: `face = coupon_price + remaining_amount_due`. Remainder agora absorbed by first unit. | `settlement_events` server deny. `vouchers` INSERT: no client insert policy. service_role. `notification_outbox` admin-read, service write |
| 4. Cron `notifications` | `GET /api/cron/notifications` | `notification_outbox.done_at` / retry | **The only sender of the voucher email.** | Bearer `CRON_SECRET`. service_role drain |
| 5. Customer reads voucher | RSC `/account/vouchers` or `/coupon/[id]` | none | QR signed with `VOUCHER_QR_SECRET` | `vouchers` SELECT: owner (`user_id = auth.uid()`) or admin. Supplier cannot list outstanding issued vouchers (`redeemed_by_supplier_id` is NULL until scan) |

**What is never written on this path:** `escrow_holds` (fossil, 2 legacy rows, no writer). `supplier_payouts` (table does not exist). Wallet (unless a referral completes in the same finalize).

**Failure modes:** webhook secret mismatch → 401, order stays `pending`. GetLpResult amount ≠ snapshotted charge → `payments.failed`, no finalize. Replay → 200, no second voucher (`UNIQUE(code)` plus cap on `order_item_id`). Missing cron → paid order, customer has no email (voucher still in DB).

---

## 2. Physical purchase

Same prelude. Differences are the snapshot and the post-pay work, not the Cardcom boundary.

| Step | Writer | Tables written | Money | RLS / gate |
|---|---|---|---|---|
| 1. Prelude | §0 | same as coupon | `paid_on_site_agorot` = face. `balance_due_agorot` = 0. `commission_agorot` = `applyBp(face, platformPercentBp)`. `supplier_immediate_agorot` = face − commission. `platform_percent` **snapshotted**. Live product rate is never read again. | service_role |
| 2. Webhook + `finalizeOrder` | same as §1.2–1.3 | `payments`, `orders`, `order_items` (`split_executed`), `settlement_events`, `notification_outbox` (supplier ship notify + customer receipt) | **No voucher rows.** Physical has nothing to scan. | same server tables |
| 3. Fulfilment | admin / coupon-partner (`supplier` orders page) | `orders.status` `paid` → `partially_fulfilled` → `fulfilled`; `order_items` fulfilment columns | Illegal transitions raise `23514` from `fn_orders_status_guard` / `fn_order_items_settlement_status_guard`. Triggers fire for service_role too. | writes via admin actions (`requireSection`) or supplier member policies on paid orders (`is_supplier_order`) |
| 4. Address read | supplier packing | `user_addresses` SELECT | Supplier sees full address only for physical lines on their order | `user_addresses` owner + supplier-shipping-order helper |

**What is never written:** escrow. The physical residual is an accounting due, not a Cardcom split to a sub-merchant. Payout **actions** in
`admin/payouts.ts`
target tables that do not exist in production (`42P01`). Do not document a payout ledger as live.

Cashback snapshot sits on the line (`cashback_amount_agorot`). **Live code credits it inside `finalizeOrder`** via
`fn_wallet_transfer`
(idempotency
`order:<id>:cashback`).
Older briefs that delay credit until scan or shipment are describing a model this tree does not run. See §11.

---

## 3. Redemption scan

Only coupon vouchers. Physical has no scan.

Surfaces: `/supplier/scan`, `/scan`, till app
`apps/mobile`,
HTTP
`POST /api/supplier/vouchers/redeem`
(and batch / lookup).

The arbiter is the RPC
`redeem_voucher(code, method, idempotency, ip, ua)`
(`SECURITY DEFINER`, granted to
`authenticated`).
Application guards in
`vouchers/state-machine.ts`
mirror it. Under concurrency the SQL
`UPDATE ... WHERE status = 'issued'`
wins. There is **no** transition trigger on
`vouchers`.

| Step | Writer | Tables written | Outcome enum (`voucher_scan_outcome`) | RLS / gate |
|---|---|---|---|---|
| 1. Session | proxy + membership | none | `unauthorized` if no session or no `supplier_members` row | Route requires session. Supplier id is taken from `auth.uid()` **inside the RPC**, never from the body |
| 2. Rate limit | Upstash or `check_rate_limit` | `rate_limits` / Redis | `rate_limited` (30/min/user) | `rate_limits` server-only |
| 3. Lookup (optional) | `POST .../lookup` | none | Inspect without consume | same auth. Does not write `voucher_redemptions` |
| 4. Redeem | `redeem_voucher` **or** `redeemAdminVoucher` | `vouchers.status` `issued` → `redeemed`; `redeemed_by_supplier_id`, `redeemed_at`; `voucher_redemptions` insert (staff id if PIN was set; admin path inserts `scan_method = 'manual'` and audit `manual_override`); `order_items.settlement_status` may move to `redeemed` **on the RPC path**; `orders` may move to `partially_fulfilled` / `fulfilled`; `settlement_events` | `success`. Replay same idempotency key returns the first answer verbatim. Same key, different body → `invalid_request` (not an oracle). Admin path uses `WHERE status = 'issued'` without the RPC. | RPC is DEFINER: it bypasses the caller's INSERT denial on `vouchers` / `voucher_redemptions`. After success, supplier SELECT on that voucher becomes true because `redeemed_by_supplier_id` is now set. **Before** success the partner cannot enumerate issued liability. Admin path is service_role. See §12 |
| 5. Wrong shop | same RPC | none (no update) | `wrong_supplier` | Compare voucher.supplier_id to membership, not to a client-supplied id |
| 6. Past expiry / already used / cancelled / refunded | same | none | `expired`, `already_redeemed`, `cancelled`, `refunded`, `not_found`, `invalid_signature` | Terminal states stay terminal |
| 7. Staff PIN (optional) | `POST /api/supplier/app/pin` → `verify_supplier_staff_pin` | `supplier_staff.failed_attempts` / `locked_until` | PIN is **not a login**. Wrong PIN does not hide the scanner; the scan is recorded unnamed. 15 attempts/hour/staff | `supplier_staff` member read, PIN set via DEFINER |

Cash at the counter never enters platform tables. `remaining_amount_due_agorot` is a disclosure, not a Cardcom line.

Batch:
`/api/supplier/vouchers/redeem-batch`
for offline drain. Same RPC per code.

---

## 4. Refund to wallet

Used when a card refund is illegal or when the operator chooses goodwill after value was consumed.

Legal card refund requires **every** voucher on the line still
`issued`.
Once any unit is
`redeemed`
or
`expired`,
the business consumed value the platform cannot un-consume. Wallet credit is a **different money movement** and does not touch the voucher row (except when the operator also cancels leftover issued units).

| Step | Writer | Tables written | RLS / gate |
|---|---|---|---|
| 1. Request | `refundOrder` / admin | `refunds` (`requested`, `ground`, `requested_agorot`) | Client: owner SELECT, staff SELECT. INSERT is service_role / admin action (`requireSection` payments). CHECKs encode Israeli consumer law: fee cap 5% or ₪100 (`<= LEAST((requested+19)/20, 10000)`); fee must be 0 on `defect` / `duplicate_charge`; `completed` requires `granted_agorot` and `completed_at` |
| 2. Approve / reject | admin | `refunds.state` | staff/admin only |
| 3. Execute as wallet | same action, service_role | `wallet_accounts` (balance via generated twin), `wallet_entries` (signed amount, source `refund`), `refunds` → `completed`; `payment_events`; optionally `vouchers` leftover `issued` → `refunded` / `cancelled` | Wallet **live** pair is `wallet_accounts` + `wallet_entries`. Do not write `wallet_balances` / `wallet_transactions` (fossil, 0 rows). Entries are signed; a credit is positive, a spend is negative. `146_wallet_balance_floor` is the floor, not a `>= 0` on the entry column |
| 4. Customer spends later | checkout | `wallet_entries` debit; `payments` card charge reduced | Wallet is a **payment source only**. It never mutates line commission, supplier due, or the cashback snapshot. `walletApplied > customerPaysNow` throws |

Owner SELECT on
`wallet_accounts`
/
`wallet_entries`
is
`auth.uid()`.
No client INSERT policy on the live pair: the ledger is server-written. **Flag:** fossil pair
`wallet_balances`
/
`wallet_transactions`
still has authenticated DML policies. They are empty, but the grants plus policies are over-permissive relative to the live ledger. See
`docs/cursor/RLS-CATALOG.md`.

---

## 5. Refund to original method (Cardcom)

Only while every voucher on the line is still
`issued`
(coupon) or the physical line is still unconsumed under the refund policy.

| Step | Writer | Tables written | RLS / gate |
|---|---|---|---|
| 1. Request / approve | same `refunds` row | as §4.1–4.2 | same CHECKs |
| 2. Execute against Cardcom | `refund.ts`, service_role | Cardcom refund API using original terminal / transaction id; `payments.status` `succeeded` → `refunded` (trigger-guarded); `orders.status` → `refunded`; `order_items.settlement_status` → `refunded`; `vouchers` `issued` → `refunded`; `refunds` → `executing` then `completed`; `payment_events`; stock released | `fn_payments_status_guard` / `fn_orders_status_guard` / `fn_order_items_settlement_status_guard`. Illegal arrow → `23514`. service_role does not escape a trigger |
| 3. Provider failure | same | `refunds.state` → `failed`; payment_events | Order remains paid. Operator retries. Do not write a wallet credit "to compensate" without a new refund row: that double-pays |
| 4. After redeem/expiry | rejected by action | none of the card path | UI copy: goodwill is wallet (§4), not Cardcom |

Cancellation fee, when allowed, is deducted from
`granted_agorot`.
Statutory cap is in the CHECK, not in JS.

`refund_ground`
values:
`distance_sale_14d`,
`defect`,
`service_not_provided`,
`duplicate_charge`,
`extended_window`,
`goodwill`.
Fee must be 0 on
`defect`
and
`duplicate_charge`.
After any voucher left
`issued`,
only
`goodwill`
(wallet, §4) is honest. Do not send Cardcom a refund for a scanned unit and leave the partner unpaid at the counter.

---

## 6. Referral bonus

Tables:
`referrals`,
`referral_program_settings` (singleton, admin read),
`referral_signals` (server anti-fraud).

| Step | Writer | Tables written | RLS / gate |
|---|---|---|---|
| 1. Ensure code | `ensureMyReferralCode` | `profiles` / referrals code column (via DEFINER helper historically `fn_ensure_referral_code`) | Owner only. Self-referral blocked in application |
| 2. Click `?ref=` | storefront | `referral_signals` (server) and/or cookie | `referral_signals` restrictive deny / server-only. Client cannot insert a fake signal |
| 3. Invitee first **paid** order | `finalizeOrder` | `referrals.status` → `completed` (or stays `pending` if settings require admin); amounts in agorot | `referrals` authenticated DML is gated internally by owner/admin. Finalize uses service_role |
| 4. Credit | finalize or `approveReferral` (admin) | `wallet_entries` (source `referral`), `wallet_accounts`; `referrals.bonus_paid_*` | Never a card cash-out. Clawback on fraud/refund is admin (`rejectReferral`) |
| 5. Flag fraud | signals + admin | `referrals.status` `flagged` / `rejected` | admin section |

Attribution is last-click inside a documented window (settings row). Credit is wallet, full stop.

If settings require manual approve, money does **not** move in finalize. Admin
`approveReferral`
is the writer of the wallet entry.

---

## 7. Cross-cutting writers that sit on every path

| Writer | Tables | Notes |
|---|---|---|
| `payment_events_append_only` trigger | `payment_events` | Refuses UPDATE and DELETE |
| `settlement_events_no_rewrite` | `settlement_events` | Same |
| `audit_log_trigger_fn` | `audit_log` | Client INSERT/UPDATE/DELETE policies are `USING (false)` |
| `enqueue_search_index` | `search_index_outbox` | Catalogue change only. `product_id` is not a FK |
| `tg_*_status_guard` (migration 137) | `orders`, `order_items`, `payments` | Illegal status → `23514` even for service_role |
| `expire_vouchers` cron | `vouchers` `issued` → `expired`; optional goodwill wallet via `credit_expired_vouchers` | No voucher transition trigger; cron + `WHERE status = 'issued'` is the lock |

---

## 8. Paths this file does not treat as money

- Wishlist merge (`wishlists` / `wishlist_items` if present; guest is `localStorage` only). Not money.
- Newsletter, contact form, supplier lead. No agorot.
- Search index upsert/delete. No agorot.
- Image upload to R2. `media_assets` only.

Those belong in
`docs/cursor/API-SURFACE.md`,
not here.

---

## 9. Recovery and adjacent writers (learned from the API / cron surface)

| Path | Writer | Tables | RLS |
|---|---|---|---|
| Charged, not `paid` | `GET /api/cron/stranded-payments` then `finalizeOrder` | same as §1.3 | Bearer cron. Idempotent. Must not use webhook POST body as money |
| Operator retry | `retryFinalizePayment`, `retryDeadLetter` | `payments`, `orders`, `vouchers`, outbox | admin `requireSection` |
| Voucher expiry | `GET /api/cron/expire-vouchers` | `vouchers` `issued` → `expired`; optional `wallet_entries` goodwill | Cron. No voucher status trigger. Do not Cardcom-refund an expired unit; that is §4 |
| Gift claim | `claimGift` / `loadGiftPreview` | voucher ownership / gift token tables as implemented | Owner after claim. Invalid token: Hebrew error, no leak whether the token existed |
| Recurring | `GET /api/cron/subscriptions` | `subscription_charges` (`period_key` idempotency), `payments`, `orders` | Split CHECK exact. Token charge, no iframe |
| 172 hide | human apply SQL | `products.stock_quantity = 0` for the master test id | Admin/service. Not a money path. Cart already refuses the line |

`notification_outbox` is on the coupon happy path (§1.4). If H5 cron is 401, §1.3 still happened and the customer has a voucher in
`/account/coupons`
with no email. That is a launch blocker, not a data-model bug.

---

## 10. `split_executions` vs `settlement_events`

Both are written at finalize. Conservation CHECK on
`split_executions`
is
`face = commission + supplier`.
`settlement_events`
is append-only (no rewrite trigger). Clients read split rows; they cannot read settlement_events (server deny). A report that "joins settlement_events as the shopper" is a query that returns nothing, not a 403.

Physical: `supplier` column on the split is
`supplier_immediate_agorot`.
Coupon: that column is 0. There is still a split row. Do not skip writing it on coupons "because payout is zero".

---

## 11. Correction: cashback credits at finalize, not at scan

Older money briefs (and an earlier revision of this pack) said cashback is snapshotted at pay and credited after coupon redeem or physical shipment.

Live writer
`src/server/payments/finalize.ts`
credits in the same
`finalizeOrder`
transaction, after lines reach
`split_executed`
and **before**
`completeReferralForOrder`:

| Step | Writer | Tables | Gate |
|---|---|---|---|
| Sum line snapshots | finalize | none (read `order_items.cashback_amount_agorot`) | service_role |
| Ensure user account | `getOrCreateUserWalletAccount` | `wallet_accounts` | service_role. No client insert policy |
| Transfer | RPC `fn_wallet_transfer` | `wallet_entries` debit `platform:cashback_reserve`, credit user account; reason `order_cashback`; idempotency `order:<id>:cashback` | DEFINER. Replay of finalize must not double-pay. Amount 0 is a no-op |
| Notify | after the ledger commit | `notification_outbox` | Must not enqueue before the transfer (that would promise money the RPC can still refuse) |

Referral credit is a **separate** wallet move and is allowed to fail without failing finalize (the card is already charged). Cashback failure **throws** and leaves finalize incomplete: stranded-payments cron retries.

Do not "fix" a missing cashback by inserting a
`wallet_entries`
row from an admin page. Use the same
`fn_wallet_transfer`
idempotency key or you double-pay.

---

## 12. Second consume path: `redeemAdminVoucher`

Partner scan goes through
`redeem_voucher`.
Support / ops also have a **manual** consume:

| | Partner RPC | Admin action |
|---|---|---|
| File | SQL `redeem_voucher` | `src/server/actions/admin/vouchers.ts` |
| Auth | session + `supplier_members` | `requireSection('orders', 'write')` |
| Writer | DEFINER | service_role `UPDATE ... WHERE status = 'issued'` then INSERT `voucher_redemptions` |
| Supplier id | taken from `auth.uid()` inside the RPC | copied from the voucher row (`redeemed_by_supplier_id = before.supplier_id`) |
| Reason | none | mandatory Hebrew reason, audited `manual_override` |
| Lookup sibling | `/api/supplier/vouchers/lookup` | `lookupAdminVoucher` uses `requireSection('catalog', 'read')` so content_uploader can **inspect** a code. They must not redeem. |

There is **no** voucher status trigger. Both paths rely on
`WHERE status = 'issued'`
for the race. A third writer that omits that predicate can double-consume.

Admin redeem does **not** call the RPC. If the RPC later grows extra side effects (settlement_status, cash-at-counter disclosure, till audit), this action will drift unless a human wires it. Treat that drift as a money bug.

`/scan`
is **not** covered by the proxy
`/supplier*`
gate. The page must require session + membership itself. Body must never carry
`supplier_id`.

---

## 13. Guest identity and referral click (prelude, expanded)

| Cookie | Set where | Table it later keys |
|---|---|---|
| Guest session UUID | `src/proxy.ts` when no user and cookie absent | `carts` owner predicate for `anon`. **The only table anon may write.** |
| Referral code | same proxy, GET, last well-formed 8-char `?ref=` wins | `referral_signals` / `referrals` at claim. URL is **not** stripped (canonical already collapses it) |

`/auth/callback`
calls
`mergeGuestCart`.
Double-merge must not duplicate lines (tested). After merge the guest cookie is cleared.

A broken guest-cookie log line is a session-fixation report waiting to happen. Do not print it in Sentry breadcrumbs.

---

## 14. Gift claim (adjacent to coupon purchase)

| Step | Writer | Tables | RLS |
|---|---|---|---|
| Preview | `loadGiftPreview` | none (read by token) | Invalid token: Hebrew empty copy, **not** a leak of whether the token existed |
| Claim | `claimGift` | voucher `user_id` moves to claimant | Session required. Token in URL is the capability. After claim, owner SELECT applies |

Gift issue happens at finalize when the checkout marked the line as a gift (see
`src/server/payments/gift-vouchers.ts`).
It is still one voucher per unit. Claiming is not a second purchase.

---

## 15. What `deleteAccount` must not do

`deleteAccount`
in
`account.ts`
is erasure, not a refund. It must not call Cardcom, must not insert
`wallet_entries`,
must not flip
`vouchers`
to
`refunded`.
Outstanding issued vouchers on a deleted account are an ops problem (H-class), not a silent money path.

---

## 16. `refunds` and `payment_events` vs the 53-table snapshot

The 2026-08-19
`rls-manifest.json`
does **not** list
`refunds`
or
`payment_events`.
This file still traces them because the application writes them. Until a human re-measures
`pg_policies`,
treat their RLS rows in
`RLS-CATALOG.md`
as **documented from code and later notes**, not from that snapshot. A missing policy on a newly created
`refunds`
table would be a live hole: authenticated still holds I/U/D grants on money relations.

---

## 17. Finalize after-pay writers (coupon and physical)

After
`orders.status → paid`
inside
`finalizeOrder`,
in this order (failure notes matter):

| Step | RPC / write | May fail finalize? |
|---|---|---|
| Cashback | `fn_wallet_transfer` `order:<id>:cashback` | Yes (throws) |
| Referral | `fn_complete_referral` | No (logged) |
| Stock consume | `consume_order_stock` | No (logged). Idempotent `consumed_at` |
| Purchase report | `reportPurchase` | Must not invent a second charge |
| Save card | `payment_tokens` insert | No (logged). Recurring needs the row |
| Subscription create | `subscriptions` insert | Loud if a recurring line has no product |
| Notification outbox | voucher email / receipt | Cron is the sender |

Per-unit voucher split: first unit absorbs the remainder agora so unit CHECKs still sum to the line.

Mobile offline scans enqueue locally and drain through the same HTTP redeem. The device must not delete a queued code on a timeout; only on a settled outcome.

---

## 18. Guest cart identity (the cookie that is not the cookie)

Two names, one UUID:

| Where | Name |
|---|---|
| Browser Set-Cookie | `ke_session_id` (httpOnly) |
| PostgREST `request.cookies` that RLS reads | `session_id` |

Writer of the mapping:
`createGuestCartClient`
in
`src/lib/supabase/anon.ts`.
It interpolates
`Cookie: session_id=<uuid>`
and **does not** forward the browser jar. Auth cookies never reach PostgREST on this path.

| Step | Writer | Tables | RLS |
|---|---|---|---|
| Mint UUID | `src/proxy.ts` when no user and no `ke_session_id` | none (cookie only) | n/a |
| Add line as guest | `addToCart` → guest client | `carts` | `profile_id IS NULL` WITH CHECK plus `session_id = request.cookies->>'session_id'` |
| Sign-in | `/auth/callback` → `mergeGuestCart` | user `carts` row; guest cookie cleared | owner. Double-merge must not duplicate (tested) |
| Mobile WebView | `POST /api/app/session` | none (cookies only) | `setSession` of tokens the app already holds. 30/10min/IP. 401 unspecific |

A policy change to
`ke_session_id`
without changing the client makes every guest cart empty. Forwarding the real Cookie header to PostgREST would put refresh tokens on a third-party request.

---

## 19. Analytics ingest (not money, lies like money)

| Step | Writer | Tables | Gate |
|---|---|---|---|
| Browser beacon | `POST /api/a` | `analytics_events` via `fn_ingest_analytics_events` | Rate limited. Must not 200-swallow. Unknown names are **skipped**, not raised |
| Server events | `finalizeOrder` / refund / redeem via `trackServerEvent` | same RPC | Same whitelist |

151's whitelist is eight **client** names. Four **server** names (
`begin_checkout`,
`purchase`,
`voucher_redeemed`,
`order_refunded`
) wait on
`169_analytics_server_event_names.sql`.
Until that apply, finalize can charge a card and the dashboard still shows 0 purchases. That is R24. Prove pay with SQL on
`orders`,
not with ads.

Client names today:
`page_view`,
`view_product`,
`view_category`,
`add_to_cart`,
`remove_from_cart`,
`checkout_step`,
`web_vital`,
`whatsapp_click`.

---

## 20. Mobile offline scan drain (same RPC, extra persistence)

Queue:
`ke.supplier.scan_queue.v1`
in AsyncStorage. Not SecureStore (size). FIFO. Idempotency key minted **at enqueue**, not at drain.

| Step | Writer | Tables | RLS |
|---|---|---|---|
| Enqueue | device | none (local) | n/a. Must not set a local `success` flag |
| Drain | `POST /api/supplier/vouchers/redeem-batch` or per-code redeem | same as §3.4 | Same RPC. `wrong_supplier` still applies offline |
| Remove local row | device, **only** for keys the JSON said settled | none | Timeout must leave the item queued |
| Sign-out | `clearQueue` + `DELETE /api/app/session` | none | Next cashier must not inherit the previous queue |

Two offline scans of the same code: first `success`, second `already_redeemed`, in cashier order.

---

## 21. Wishlist and reviews (tables exist, still not money)

Generated types on this branch:

| Table | Shape | Writer | RLS (until re-measured) |
|---|---|---|---|
| `wishlists` | `(user_id, product_id)` **one table**, no `wishlist_items` | `toggleWishlist` | Owner. Guest list is `localStorage` `ke_wishlist` only |
| `reviews` | `order_item_id` UNIQUE, `rating`, `status`, `user_id` | `submitReview`; `moderateReview` | Paid-buyer join is the honesty check. Public SELECT should be `published` only |

Neither path writes agorot. A 1-star review is not
`refund_ground`.
`deleteAccount`
must not delete these as a side effect of a refund (there is no refund).

---

## 22. Reporting snapshots (170) and FTS (171)

Not money paths. Named so nobody "fixes" revenue by joining live
`products.platform_percent`.

`170_reporting_tables.sql`
header on this branch **claims applied 2026-09-04** while the file still sits in
`migrations/pending/`.
Four tables:
`report_orders_daily`,
`report_revenue_daily`,
`report_top_products`,
`report_cohort_retention`.
Money columns are bigint agorot. Days are
`Asia/Jerusalem`,
not UTC midnight. Refunded orders are excluded from revenue, still counted in order-flow. Access: RLS on, zero policies, admin DEFINER RPCs. Pending
`172_rls_zero_policy_tables.sql`
would add admin SELECT so dashboards can read without the RPC.

`171_search_fts.sql`:
`search_products`
SECURITY INVOKER. Caller sees only rows their catalogue SELECT already allows. No agorot.

---

## 23. Admin payments tabs that look like writers and are not

`/admin/payments`
tabs:
`reconcile`,
`payments`,
`webhooks`,
`escrow`,
`splits`.

| Tab | Reads | Writes |
|---|---|---|
| webhooks | `payment_webhook_events` via **request-scoped** client | none. Zero policies → empty for every admin until 172_rls admin SELECT |
| escrow | `escrow_holds` (2 legacy rows) | none. Fossil. Label still says נאמנות |
| splits | `split_executions` | none (written at finalize) |
| reconcile | `payments` vs Cardcom | `retryFinalizePayment` is the mutation, not this page |

Empty webhooks tab is not "Cardcom is down". Check
`payment_events`
with the admin client, or apply 172_rls (human SQL, not this pack).

---

## 24. Numbered pending files that a human can apply in the wrong order

Applying "172" without the rest of the filename:

- `172_hide_master_product_test_row.sql` writes
  `products.stock_quantity = 0`
  for one id (catalogue, not money).
- `172_rls_zero_policy_tables.sql`
  creates policies (RLS, not money). Admin SELECT on
  `payment_webhook_events`
  is the one behavioural change.

Neither refunds a customer. Neither finalizes an order. Mixing them up still matters: one hides a SKU, the other opens an admin read. Use the full filename. This pack does not apply either.

---

## 25. Conservation writers that are CHECKs, not RLS

When a step in §1–§6 fails with
`23514`,
the transaction did not commit. Do not retry with a client policy change. The failing CHECK is listed in
`MONEY-INVARIANTS.md`
§5. service_role does not escape it. The only honest retry is to send a row that conserves.

