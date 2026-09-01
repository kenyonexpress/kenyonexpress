# API Reference

Every HTTP route and every server action: method, auth, what it takes, what it
returns.

Routes and actions enumerated from this branch on **2026-09-01**; database
claims verified against production (`ixvwfbuvfxxsjiywhbbb`) through MCP.

Companion documents: `docs/ROLES-AND-PERMISSIONS.md` (who may call what),
`docs/PAYMENT-FLOW.md` (the checkout sequence), `docs/RUNBOOK.md` (what to do
when one of these fails).

---

## 0. How this application actually exposes itself

Three surfaces, and the first is the largest:

1. **Server actions** (34 exported functions across 30 modules). The primary
   mutation surface. Not HTTP endpoints you can curl: Next serializes them over
   a POST to the page URL with an action id. Callable only from the app.
2. **Route handlers** (30 files under `src/app/api`). Used where something
   external must call in (webhooks, cron, the mobile app) or where a non-HTML
   response is needed.
3. **RSC direct reads**. Public and owner-scoped data is read server-side in
   the component with no endpoint at all. The contract for those is the RLS
   policy, not a route. Do not look for an endpoint behind a product page.

> **Auth is not visible at the top of a server action.** Guards sit two hops in,
> behind `withActionContext` wrappers and `requireSection` / `requireAdmin`
> helpers. Grepping an action body for a guard call reports almost none and is
> wrong.

---

## 1. Route handlers

### 1.1 Public, unauthenticated

| Route | Method | Notes |
|---|---|---|
| `/api/health` | GET | Liveness plus one database probe. Returns `{ ok, database }` and deliberately no version, commit, env names or error strings. Unauthenticated by necessity, so everything it returns is public. Never cached. |
| `/api/search` | GET | Catalogue search. Rate limited. Returns `{ results, total, engine }` where `engine` is `'meilisearch' \| 'database'`. |
| `/api/search/suggest` | GET | Typeahead. Rate limited. |
| `/api/search/quick-links` | GET | Curated links from `popular_searches`. |
| `/api/cart` | GET | Reads the current cart, guest or signed-in. |
| `/api/a` | POST | Analytics beacon. Session-aware, rate limited. |

### 1.2 Session-authenticated

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/app/session` | POST, DELETE | session | Mobile app session exchange. |
| `/api/app/push-tokens` | POST, DELETE | bearer, rate limited | Registers a device for push. Writes `push_tokens`. |
| `/api/wallet/apple/[id]` | GET | **RLS** | The `.pkpass` for one voucher. The id is a voucher UUID and **not a capability**: `getCustomerVoucher` reads through the user-scoped client, so somebody else's id is indistinguishable from one that does not exist. Missing Apple credentials is 404, not 500. `no-store`, always: the body carries a live voucher payload. |
| `/api/admin/reports/[report]` | GET | `canReadSection(role, 'payments')` | CSV export. Denies with **403 and a plain-text body**, not a redirect: a downloader that follows a redirect writes an HTML login page into a file named `.csv`. |

### 1.3 Supplier

All require a session and an active `supplier_members` row; the supplier is
derived from `auth.uid()` inside the RPC and is **never taken from the request**.

| Route | Method | Notes |
|---|---|---|
| `/api/supplier/vouchers/redeem` | POST | The scan. Wraps `redeem_voucher()`. Rate limited 30/min/user. Returns `{ outcome, ... }` with one of eleven `voucher_scan_outcome` values. |
| `/api/supplier/vouchers/redeem-batch` | POST | Several codes in one request, for offline drain. |
| `/api/supplier/vouchers/lookup` | POST | Inspect a code **without consuming it**, so counter staff can answer "is this valid?" before the customer orders. |
| `/api/supplier/redeem` | POST | Alias re-exporting `POST` from the canonical route above. Nothing else: a route segment config must be a literal in its own segment, so `runtime` cannot be re-exported. |
| `/api/supplier/app/pin` | POST | Identifies which staff member is at the till. **Not a login** (§4). 15 attempts/hour/staff. Body `{ pin: /^\d{4,8}$/ }`. |

### 1.4 Webhooks

| Route | Method | Authentication |
|---|---|---|
| `/api/payments/cardcom/webhook` | POST | **URL secret + mandatory re-verification.** Cardcom does not sign callbacks; there is no HMAC header. The `?s=` secret is compared in constant time against both the current and retiring secret **with no short circuit**, then `GetLpResult` is re-fetched server to server and that response is the only trusted source of amount, status and token. Journal first, dedup on `(provider, external_event_id)`, replay is a 200 no-op. |
| `/api/webhooks/products` | POST | `SEARCH_WEBHOOK_SECRET`. Supabase DB webhook. Payload is a **change notification, never data**: the worker re-reads the row. |
| `/api/search/index-job` | POST | QStash JWS (`Upstash-Signature`, two rotating keys) or `CRON_SECRET`. |
| `/api/search/index-dlq` | POST | Same. Failure sink. |

### 1.5 Cron

**Ten routes, all GET, all requiring `Authorization: Bearer <CRON_SECRET>`**
with no default and no fallback. A missing secret means every one answers 401.

| Route | What it does | On the money path |
|---|---|---|
| `/api/cron/notifications` | Drains `notification_outbox`. **The only sender of voucher emails.** | indirectly, critical |
| `/api/cron/expire-vouchers` | `expire_vouchers()`, plus expiry notices | |
| `/api/cron/invoices` | Issues invoices | **yes** |
| `/api/cron/reconcile` | Reconciles against Cardcom | **yes** |
| `/api/cron/stranded-payments` | Finds charged-but-not-finalized orders | **yes** |
| `/api/cron/subscriptions` | Recurring charges | **yes** |
| `/api/cron/abandoned-cart` | Nudges | |
| `/api/cron/reap-carts` | `fn_reap_expired_carts()` | |
| `/api/cron/stock` | Releases expired reservations | |
| `/api/cron/health` | Seven dependency checks; the only thing that pages a human | |

> **No scheduler is running.** These were deliberately removed from
> `vercel.json`: Hobby allows two daily jobs, this needs ten, four at
> five-or-ten-minute intervals, and declaring all ten anyway runs the ones the
> plan covers and **silently ignores the rest**. See `docs/OPERATIONS-CALENDAR.md`.

### 1.6 Debug

| Route | Method | Notes |
|---|---|---|
| `/api/debug/sentry` | GET | Off unless `SENTRY_DEBUG_ROUTES` is set to the exact expected phrase. The off-state is **404, not 403**, because a 403 confirms the route exists. |

---

## 2. Server actions

### 2.1 Auth (`server/actions/auth.ts`)

`signInWithGoogle`, `signInWithEmail`, `signUpWithEmail`, `sendMagicLink`,
`sendPhoneOtp`, `verifyPhoneOtp`, `signOut`, `signOutAll`, `sendPasswordReset`,
`updatePassword`.

Phone OTP is gated behind `PHONE_AUTH_ENABLED` / `NEXT_PUBLIC_PHONE_AUTH_ENABLED`.

### 2.2 Cart (`server/actions/cart.ts`)

`getCart`, `addToCart`, `updateCartItem`, `removeFromCart`, `clearCart`,
`removeUnavailableItems`, `mergeGuestCart`, `clearGuestSessionCookie`,
`applyCouponCode`, `removeCouponCode`, `resolveCheckoutDiscountAgorot`.

The cart is `carts.items`, a **jsonb column**. There is no `cart_items` table;
any document showing a join to one is showing a query that cannot run.

`mergeGuestCart` runs from `/auth/callback` when a guest signs in at the pay
press, and is tested against double-merge.

### 2.3 Checkout and payments

| Action | Module | Notes |
|---|---|---|
| `beginCheckout` | `payments/checkout.ts` | Validates the cart **server-side**; the client contributes ids and consent, never prices. Reserves stock (15 min TTL, shorter than order expiry on purpose), snapshots money and supplier identity onto `order_items`, opens a Cardcom Low Profile page, returns a `frame` to mount in an iframe. |
| `submitCheckout` | same | Saved-card token charge. Server to server, no redirect; the charge response **is** the outcome. |
| `reconcileOrderReturn` | same | Called when the browser returns from the payment frame. |
| `refundOrder` | `payments/refund.ts` | Legal only while **every** voucher on the line is still `issued`. After that a goodwill gesture is a wallet credit, a different money movement. |
| `getOrderPaymentStatus` | `orders.ts` | Polling for the return page. |

### 2.4 Account

`updateProfileDetails`, `saveAddress`, `deleteAddress`, `setDefaultAddress`,
`deletePaymentToken`, `setDefaultPaymentToken`, `cancelSubscription`,
`ensureMyReferralCode`, `claimGift`, `loadGiftPreview`, `decideConsent`.

`updateProfileDetails` cannot change `role` or `supplier_id`: the
`enforce_profile_privilege_columns` trigger raises `42501`.

### 2.5 Public forms

`submitContactForm`, `submitSupplierLead`, `subscribeToNewsletter`,
`confirmNewsletter`, `unsubscribeByToken`.

Newsletter confirmation is double opt-in; `fn_unsubscribe_by_token` is the
one-click path required by bulk-sender rules.

### 2.6 Admin

All gated on `requireSection(role, section)` plus per-RPC `is_admin()`
re-checks, and all write `audit_log`.

| Module | Actions |
|---|---|
| `admin/products.ts` | `upsertProduct`, `deleteProduct`, `bulkUpdateProductStatus`, `bulkAssignCategory`, `bulkAdjustPrices`, `bulkSoftDeleteProducts`, `deleteVariant` |
| `admin/categories.ts` | `upsertCategory`, `softDeleteCategory`, `deleteCategory`, `updateCategorySortOrder` |
| `admin/suppliers.ts` | `upsertSupplier`, `setSupplierStatus`, `softDeleteSupplier`, `addSupplierMember`, `deactivateSupplierMember` |
| `admin/vendors.ts` | `upsertVendor`, `updateVendorStatus`, `updateVendorCommission`, `softDeleteVendor` |
| `admin/approvals.ts` | `approveProduct`, `rejectProduct` |
| `admin/orders.ts` | `cancelPendingOrder`, `addOrderNote` |
| `admin/payments.ts` | `retryFinalizePayment` |
| `admin/dead-letters.ts` | `retryDeadLetter` |
| `admin/discounts.ts` | `saveDiscountCampaign`, `archiveDiscountCampaign`, `setDiscountCampaignActive` |
| `admin/referrals.ts` | `approveReferral`, `rejectReferral` |
| `admin/affiliates.ts` | `decideAffiliate` |
| `admin/users.ts` | `updateUserRole` |
| `admin/coupon-deals.ts` | `upsertCouponDeal`, `softDeleteCouponDeal` |
| `admin/popular-searches.ts` | `savePopularSearch`, `removePopularSearch` |
| `admin/images.ts`, `admin/upload.ts` | `processAndUploadImage`, `requestUploadUrl` |
| `admin/payouts.ts` | `generatePayoutStatement`, `approvePayoutStatement`, `markPayoutStatementPaid`, `cancelPayoutStatement` **(all four are dead, see §5)** |

`retryFinalizePayment` and `retryDeadLetter` are the two operator recovery
paths. Both are safe to run repeatedly: `finalizeOrder` is idempotent on
`orders.status` and `payments.status`.

---

## 3. Callable database functions

The RPC surface reachable from a client session. Everything else in the 69
production functions is `service_role` only or a trigger.

| Function | Grant | Purpose |
|---|---|---|
| `redeem_voucher(code, method, idem, ip, ua)` | `authenticated` | The scan. Returns `jsonb` with `outcome`. |
| `verify_supplier_staff_pin(...)` | `authenticated` | Till staff identity. |
| `supplier_app_context()` | `authenticated` | What the till app may show. |
| `is_admin()`, `is_supplier_member(uuid)` | `anon`, `authenticated` | Called by RLS policies. |
| `has_role(text)`, `is_support()`, `current_user_role()` | `authenticated` | Role helpers. |
| `is_supplier_order(uuid)`, `is_supplier_owner(uuid)`, `is_supplier_shipping_order(uuid)` | `authenticated` | Policy helpers. |
| `fn_record_recent_search(text)` | `anon`, `authenticated` | Guest recent searches. |
| `order_item_cancellation_deadline(...)` | `authenticated` | Display helper, not `SECURITY DEFINER`. |

`check_rate_limit` was narrowed to `service_role` only by
`127_revoke_check_rate_limit_execute`.

---

## 4. Cross-cutting contracts

**Money.** Every amount crossing any boundary is an **integer number of
agorot**. Rates are integer basis points. No float, ever.

**Idempotency.** `redeem_voucher` and the Cardcom webhook both take or derive an
idempotency key and replay the first answer verbatim. A replay under the same
key with **different** content returns `invalid_request` rather than answering
about the new content, which stops a key being used as an oracle.

**Rate limits.** Upstash Redis when configured, else the Postgres
`check_rate_limit` path. Voucher scans 30/min/user; staff PIN 15/hour/staff.

**Errors.** Hebrew user-facing messages; English codes for machines
(`NOT_FOUND`, `STATE_INVALID`). Money-path failures append to `payment_events`
before returning.

**The staff PIN is not a login.** The device is already authenticated as the
supplier, and a wrong PIN denies nothing the device could not otherwise do: the
scanner still works, the scan is simply recorded with no name on it. What the
PIN buys is an answerable audit trail. The route exists rather than calling the
RPC directly purely for the rate limit, because a four-digit PIN against an
unlimited endpoint is ten thousand tries.

---

## 5. Known defects on this surface

Recorded rather than fixed, because this branch is documentation only.

1. **All four `admin/payouts.ts` actions are dead code that fails at runtime.**
   They read `payout_statements` and call `generate_payout_statement`,
   `approve_payout_statement`, `mark_payout_statement_paid` and
   `cancel_payout_statement`, described in the module header as living in
   "migration 081". Verified 2026-09-01: production has **zero tables and zero
   functions matching `%payout%`**. Every call raises `42P01` (undefined table)
   or `42883` (undefined function).

   This is consistent rather than surprising: on the coupon model the platform
   owes suppliers nothing, so the payout system was specified and then made
   unnecessary. The `payout_status` and `payout_line_type` enums survive with
   nothing behind them. See `docs/SCHEMA-REALITY-CHECK.md` §4.

2. **`beginCheckout` cannot complete against production.**
   `src/server/payments/finalize.ts` selects
   `orders.cashback_applied_agorot` and `order_items.unit_price_agorot` as
   literals rather than through the generation probe in
   `src/lib/commerce/order-money-columns.ts`. Both confirmed absent from
   production; the live names are `orders.cashback_applied_ils` and
   `order_items.unit_price_ils_agorot`. That select raises `42703`, so the first
   real payment lands in the dead-letter state described in
   `docs/RUNBOOK.md` §3.

3. **The ten cron routes are correct and never called.** See §1.5.

---

## 6. Verification

```bash
# every route and its exported methods
for f in $(find src/app/api -name route.ts | sort); do
  echo "${f#src/app} $(grep -oE 'export (async function|const) (GET|POST|PUT|PATCH|DELETE)' "$f" \
    | awk '{print $NF}' | sort -u | tr '\n' ',')"
done

# every server action
grep -rl "^'use server'" src/server/actions src/app/actions \
  | xargs grep -oE 'export async function [a-zA-Z0-9_]+'
```

```sql
-- the client-callable RPC surface
select p.proname, r.rolname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
  lateral aclexplode(p.proacl) ax join pg_roles r on r.oid = ax.grantee
where n.nspname = 'public' and ax.privilege_type = 'EXECUTE'
  and r.rolname in ('anon','authenticated')
order by p.proname;
```
