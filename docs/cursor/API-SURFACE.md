# API surface

Enumerated from this branch's tree (route files under
`src/app/**/route.ts`
and server modules under
`src/server/actions/`)
plus
`docs/API-REFERENCE.md`
(2026-09-01). Guards sit two hops in (`withActionContext`, `requireSection`, `requireAdmin`). Grepping the top of an action for a guard reports almost none and is wrong.

Three surfaces:

1. Server actions (primary mutation). Next POST to the page URL with an action id. Not curl-able as a stable HTTP API.
2. Route handlers (webhooks, cron, mobile, non-HTML).
3. RSC reads (no endpoint; contract is RLS).

Money: integer agorot in, integer agorot out. Hebrew strings to humans. English codes to machines (`NOT_FOUND`, `STATE_INVALID`).

---

## 1. Route handlers

### 1.1 Public

| Route | Method | In | Out | Auth | Failure |
|---|---|---|---|---|---|
| `/api/health` | GET | none | `{ ok, database }` only. No version, commit, env, error strings | none | 200 with `database` not ok is the case this exists for. Never cache |
| `/api/ready` | GET | none | Readiness: multiple dependency checks (five named in later STATUS notes) | none | 503 if a required dep is down. Do not confuse with `/api/health` |
| `/api/search` | GET | `q`, paging | `{ results, total, engine: 'meilisearch' \| 'database' }` | none, **rate limited** | Empty q → empty results, not 400. Engine falls back to ILIKE if Meili unset |
| `/api/search/suggest` | GET | prefix | suggestions | none, rate limited | Same limiter as search |
| `/api/search/quick-links` | GET | none | curated `popular_searches` | none | Empty array if table empty |
| `/api/cart` | GET | cookies / session | current cart (guest or user) | none | Missing cart → empty, not 404 |
| `/api/a` | POST | beacon payload | 204/200 | session-aware, rate limited | 429. Must not throw on analytics (money events vanishing with 200 was a measured bug: ingest must exist) |
| `/feed.xml` | GET | none | product feed | none | Public products only (same predicate as RLS) |
| `/merchant.xml` | GET | none | merchant feed | none | same |
| `/auth/callback` | GET | OAuth code | redirect; **merges guest cart** | provider | Failed auth → login error map. Double-merge must not duplicate lines |

### 1.2 Session / wallet / admin download

| Route | Method | In | Out | Auth | Failure |
|---|---|---|---|---|---|
| `/api/app/session` | POST, DELETE | mobile session exchange | session | session | 401 |
| `/api/app/push-tokens` | POST, DELETE | device token | ok | bearer, rate limited | Writes `push_tokens`. 401/429 |
| `/api/wallet/apple/[id]` | GET | voucher UUID | `.pkpass` | **RLS**, not a capability token | Other people's id ≡ not found. Missing Apple creds → **404 not 500**. `no-store` |
| `/api/admin/reports/[report]` | GET | report key | CSV | `canReadSection(role, 'payments')` | **403 plain text**, not a redirect (a downloader would save an HTML login as `.csv`) |
| `/account/orders/[id]/invoice` | GET | order id | invoice document | session + owner | 404 if not owner |

### 1.3 Coupon-partner (supplier)

Supplier id is derived from
`auth.uid()`
inside the RPC. **Never from the body.**

| Route | Method | In | Out | Auth | Failure |
|---|---|---|---|---|---|
| `/api/supplier/vouchers/redeem` | POST | code, method, idempotency | `{ outcome, ... }` one of eleven `voucher_scan_outcome` | session + active `supplier_members`; 30/min/user | `unauthorized`, `rate_limited`, `wrong_supplier`, `already_redeemed`, `expired`, `cancelled`, `refunded`, `not_found`, `invalid_signature`, `invalid_request` |
| `/api/supplier/vouchers/redeem-batch` | POST | codes[] | per-code outcomes | same | Partial success possible; do not abort the batch on one bad code without reading the contract |
| `/api/supplier/vouchers/lookup` | POST | code | validity **without consume** | same | Same outcomes minus success-consume |
| `/api/supplier/redeem` | POST | alias of redeem | same | same | Re-export of POST only. `runtime` cannot be re-exported across segments |
| `/api/supplier/app/pin` | POST | `{ pin: /^\d{4,8}$/ }` | staff identity | session + membership; 15/hour/staff | **Not a login.** Wrong PIN does not disable the scanner. Locked staff → named failure |
| `/api/supplier/payouts/csv` | GET | filters | CSV | membership | Production has **no payout tables**. Expect empty or 42P01-class failure if the handler still queries them. Treat as dead until a real ledger exists |

### 1.4 Webhooks

| Route | Method | In | Out | Auth | Failure |
|---|---|---|---|---|---|
| `/api/payments/cardcom/webhook` | POST | Cardcom body + `?s=` | 200 always after journal when secret matches | URL secret vs current **and** retiring, constant time, **no short-circuit**. Then mandatory `GetLpResult` | Secret miss → 401. Amount mismatch → payment `failed`, no finalize. Replay → 200 no-op. Body never trusted for money |
| `/api/webhooks/products` | POST | Supabase change notification | 200 | `SEARCH_WEBHOOK_SECRET` | Payload is not product data. Worker re-reads the row. Secret miss → 401 |
| `/api/search/index-job` | POST | `{ op, productId, reason, enqueuedAt }` | 200 | QStash JWS (`Upstash-Signature`, two keys) **or** `CRON_SECRET` | Any Meili/DB error → non-2xx so QStash retries (5). Unconfigured Meili → successful no-op |
| `/api/search/index-dlq` | POST | failed job | parked | same | Failure sink |

### 1.5 Cron (all GET, all Bearer `CRON_SECRET`, no default)

Missing secret → 401 on all (safe). POST → 405.

| Route | In | Out | Side effects | Failure |
|---|---|---|---|---|
| `/api/cron/notifications` | header | `{ ok }` | Drains `notification_outbox`. **Only voucher email sender** | 401; provider 4xx retries on the row |
| `/api/cron/health` | header | seven dependency checks | pages a human | 401 unauthenticated is a **pass** when probing without the secret |
| `/api/cron/invoices` | header | `{ ok }` | issues invoices | money path |
| `/api/cron/stock` | header | `{ ok }` | releases expired reservations | |
| `/api/cron/stranded-payments` | header | `{ ok }` | charged-but-not-finalized | money path |
| `/api/cron/abandoned-cart` | header | `{ ok }` | nudges | no-op if no eligible carts |
| `/api/cron/subscriptions` | header | `{ ok }` | token charges per `period_key` | idempotent on period |
| `/api/cron/reap-carts` | header | `{ ok }` | `fn_reap_expired_carts()` | |
| `/api/cron/reconcile` | header | `{ ok }` | Cardcom vs `payments` | money path |
| `/api/cron/expire-vouchers` | header | `{ ok }` | `expire_vouchers()` + notices + optional goodwill credit | `WHERE status = 'issued'` is the lock |
| `/api/cron/retention` | header | `{ ok }` | data retention | |
| `/api/cron/weekly-digest` | header | `{ ok }` | operator mail | |

Scheduler of record (2026-09-02): GitHub Actions
`cron.yml`
when
`CRON_SCHEDULER_ENABLED=true`.
A second scheduler double-fires.

### 1.6 Debug

| Route | Method | Auth | Failure |
|---|---|---|---|
| `/api/debug/sentry` | GET | off unless `SENTRY_DEBUG_ROUTES` equals the expected phrase | **404 not 403** when off (403 would confirm existence) |
| `/debug/sentry`, `/debug/sentry/render` | pages | same idea | must not ship enabled |

---

## 2. Server actions

Unless noted, failures return a discriminated object `{ ok: false, error, messageHe }`, not a thrown raw Error to the client.

### 2.1 Auth (`auth.ts`)

| Action | In | Out | Auth | Failure |
|---|---|---|---|---|
| `signInWithGoogle` | none (redirect) | redirect | public | Provider error map |
| `signInWithEmail` / `signUpWithEmail` | email, password | session | public | Mapped Hebrew. No user enumeration in copy if the map says so |
| `sendMagicLink` | email | ok | public | rate limit |
| `sendPhoneOtp` / `verifyPhoneOtp` | phone / code | session | public; gated `PHONE_AUTH_ENABLED` | disabled → not available |
| `signOut` / `signOutAll` | none | ok | session | |
| `sendPasswordReset` / `updatePassword` | email / new password | ok | public / session | |

### 2.2 Cart (`cart.ts`)

| Action | In | Out | Auth | Failure |
|---|---|---|---|---|
| `getCart` | none | cart view | guest or session | |
| `addToCart` | product/variant ids, qty | cart | guest or session | `price_error` (implausible discount / unsellable). Does not trust client prices |
| `updateCartItem` / `removeFromCart` / `clearCart` | line id / none | cart | owner | |
| `removeUnavailableItems` | none | cart | owner | |
| `mergeGuestCart` | none (callback) | cart | session | Double-merge must not duplicate. **Do not export as a random public button** |
| `clearGuestSessionCookie` | none | ok | | |
| `applyCouponCode` / `removeCouponCode` | code | discount agorot | owner | Invalid / expired / not applicable |
| `resolveCheckoutDiscountAgorot` | cart | integer agorot | server | |

Cart storage:
`carts.items`
jsonb. There is no
`cart_items`
table.

### 2.3 Checkout and refunds

| Action | Module | In | Out | Auth | Failure |
|---|---|---|---|---|---|
| `beginCheckout` | `payments/checkout.ts` | ids, consent, address if physical, **never prices** | `{ frame }` Low Profile **or** error | guest until Pay; action re-prices server-side | `CHECKOUT_ENABLED` not exact `true`; unsellable line; missing `platform_percent`; missing coupon price; stock; Cardcom create fail. Stock reserved 15 min |
| `submitCheckout` | same | saved-token charge | outcome **is** the charge | session | Token missing/expired; Cardcom reject → `initiated`/`failed`. No `redirected` |
| `reconcileOrderReturn` | same | browser return | order status | return page (frame-return is ungated) | Poll until webhook finalize; do not trust query amount |
| `getOrderPaymentStatus` | `orders.ts` | order id | status | owner | 404 other people's ids |
| `refundOrder` | `payments/refund.ts` | order id, ground, requested agorot | refund row | admin / owner policy as implemented | Illegal if any voucher not `issued`. After redeem: wallet path only. Statutory fee CHECK. Cardcom fail → `refunds.failed` |

`finalizeOrder` is **not** a server action. It is
`src/server/payments/finalize.ts`,
called from the webhook / stranded cron / `retryFinalizePayment`. Only writer of
`orders.status = paid`.

### 2.4 Account

`updateProfileDetails` (cannot set `role` / `supplier_id`; trigger `42501`), `saveAddress`, `deleteAddress`, `setDefaultAddress`, `deletePaymentToken`, `setDefaultPaymentToken`, `cancelSubscription`, `ensureMyReferralCode`, `claimGift`, `loadGiftPreview`, `decideConsent`.

Gift token invalid → Hebrew empty/error copy, not a stack.

### 2.5 Public forms

`submitContactForm`, `submitSupplierLead`, `subscribeToNewsletter`, `confirmNewsletter`, `unsubscribeByToken`.

Newsletter is double opt-in.
`fn_unsubscribe_by_token`
is the one-click path. Rate limited. `CONTACT_TO` missing → operator mail fails closed.

### 2.6 Reviews (`reviews.ts`)

Customer review create/update as implemented on this branch. Admin moderation in
`admin/reviews.ts`.
Not a launch-critical money path. Scope for post-launch deepening:
`docs/cursor/POST-LAUNCH-ROADMAP.md`.

### 2.7 Admin (all `requireSection` + RPC `is_admin()` re-check + `audit_log`)

| Module | Actions | Failure |
|---|---|---|
| `admin/products.ts` | `upsertProduct`, `deleteProduct`, `bulkUpdateProductStatus`, `bulkAssignCategory`, `bulkAdjustPrices`, `bulkSoftDeleteProducts`, `deleteVariant` | Missing `platform_percent` / coupon price must refuse publish. Bulk prices integer-only |
| `admin/categories.ts` | `upsertCategory`, `softDeleteCategory`, `deleteCategory`, `updateCategorySortOrder` | |
| `admin/suppliers.ts` | `upsertSupplier`, `setSupplierStatus`, `softDeleteSupplier`, `addSupplierMember`, `deactivateSupplierMember` | |
| `admin/vendors.ts` | `upsertVendor`, `updateVendorStatus`, `updateVendorCommission`, `softDeleteVendor` | super_admin on some |
| `admin/approvals.ts` | `approveProduct`, `rejectProduct` | |
| `admin/orders.ts` | `cancelPendingOrder`, `addOrderNote` | Cannot cancel `paid` here |
| `admin/payments.ts` | `retryFinalizePayment` | Idempotent. Safe to hammer |
| `admin/dead-letters.ts` | `retryDeadLetter` | Idempotent |
| `admin/discounts.ts` | `saveDiscountCampaign`, `archiveDiscountCampaign`, `setDiscountCampaignActive` | kind XOR: percent_bp **or** amount_agorot |
| `admin/referrals.ts` | `approveReferral`, `rejectReferral` | Wallet credit on approve |
| `admin/affiliates.ts` | `decideAffiliate` | |
| `admin/users.ts` | `updateUserRole` | Trigger allows admin; still audit |
| `admin/coupon-deals.ts` | `upsertCouponDeal`, `softDeleteCouponDeal` | |
| `admin/popular-searches.ts` | `savePopularSearch`, `removePopularSearch` | |
| `admin/images.ts`, `admin/upload.ts` | `processAndUploadImage`, `requestUploadUrl` | R2 env missing → upload unavailable |
| `admin/shipping.ts` | shipping admin | physical only |
| `admin/quick-search.ts` | operator search | |
| `admin/reports.ts` | report builds | |
| `admin/vouchers.ts` | operator voucher tools | |
| `admin/reviews.ts` | moderate | |
| `admin/payouts.ts` | `generatePayoutStatement`, `approvePayoutStatement`, `markPayoutStatementPaid`, `cancelPayoutStatement` | **DEAD.** Production has zero `%payout%` tables/functions. Calls raise `42P01` / `42883` |

content-uploader: catalogue sections only. Money sections must 403.

### 2.8 Other

`contact.ts` covered above. `newsletter.ts`. `consent.ts`. `gifts.ts`. `referrals.ts` (`ensureMyReferralCode`). `subscriptions.ts`. `supplier-lead.ts`.

---

## 3. Callable RPCs (PostgREST)

| Function | Who | Failure |
|---|---|---|
| `redeem_voucher` | authenticated coupon-partner | eleven outcomes |
| `verify_supplier_staff_pin` | authenticated | lockout |
| `supplier_app_context` | authenticated | empty if no membership |
| `is_admin`, `is_supplier_member` | anon+auth | false for anon |
| `has_role`, `is_support`, `current_user_role` | authenticated | `has_role('customer')` trap |
| `is_supplier_order`, `is_supplier_owner`, `is_supplier_shipping_order` | authenticated | |
| `fn_record_recent_search` | anon+auth | |
| `order_item_cancellation_deadline` | authenticated | display helper, not DEFINER |

`check_rate_limit`: **not** callable. 42501.

---

## 4. Cross-cutting failure modes

| Mode | What the client sees | What not to do |
|---|---|---|
| 401 cron | empty | Do not "fix" by removing the bearer |
| 401 webhook | Cardcom retries | Do not skip `GetLpResult` to "make it succeed" |
| 403 CSV | plain text | Do not redirect |
| 404 pkpass / debug | not found | Do not 403 |
| 409 / `invalid_request` on redeem replay with different body | Hebrew already-used / invalid | Do not return the new body's result |
| 23514 status guard | operator error | Do not catch-and-set the column anyway |
| 42703 missing column | dead-letter payment | Named risk. Do not finalize from the POST body as a workaround |
| 429 | Hebrew rate copy | Do not raise the PIN limit to "make tills work" |
| `CHECKOUT_ENABLED` | pay button dead | Value must be the string `true` |

---

## 5. RSC (no handler)

Product, category, home, legal, city, supplier directory, account reads: server component + user-scoped or anon client. If a page "has no API", that is the design. Do not add public REST for catalogue reads; it would duplicate RLS and drift.
