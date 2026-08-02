# ARCHITECTURE-API-CONTRACTS.md

> **גובר עליו `docs/CONTRADICTIONS.md` (2026-07-24).** כל מספר עמלה, ברירת מחדל
> (10%/5%) או נוסח Escrow במסמך הזה הוא שריד. ההכרעה: `platform_percent`
> פר-מוצר, חובה, בלי ברירת מחדל בשום מקום; ה-held הוא רישום פנימי ב-ledger בלבד.

Status: BINDING draft v1.0 (2026-07-17)
Owner: API contracts architect
Scope: the complete API surface of KenyonExpress, from product page to production.
Sources: docs/MASTER-ARCHITECTURE.md (binding), docs/ARCHITECTURE-COMMERCE.md (026), docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md (027), docs/ARCHITECTURE-ACCOUNT-IDENTITY.md (029), docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md (030), docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md (031), docs/ARCHITECTURE-ANALYTICS-BI.md (033/034), docs/ARCHITECTURE-SECURITY.md (035, authoritative for security), docs/ARCHITECTURE-MOBILE-SUPERAPP.md (incl. section 11, the absorbed superapp contracts), supabase/migrations/001..035, src/server/actions/**.

Precedence: where this document conflicts with ARCHITECTURE-SECURITY.md, security wins. Where it conflicts with any other doc, MASTER-ARCHITECTURE.md decision log wins, then this document, then the per-domain docs.

This document DECIDES. No options are left open. Each endpoint carries: transport, auth tier, exact Zod input and output, RLS interaction, idempotency strategy, error subset, rate-limit tier, and implementation status (EXISTS / PARTIAL / PLANNED).

---

## 0. Decisions (summary)

| # | Decision |
|---|----------|
| API-1 | Two transports only. **Server Actions** are the default for every browser-initiated mutation and every authenticated read that is not renderable in an RSC. **Route Handlers** are used exclusively for machine-to-machine and non-session traffic: payment webhooks, provider delivery webhooks, cron, analytics ingest, signed unsubscribe links, share redirects, health, and the supplier scanner redeem endpoint (offline queue drain). Catalog reads are RSC direct queries plus SQL RPCs, not actions. |
| API-2 | One response envelope for all new Server Actions: `ActionResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }`. Legacy `{ error } | { success }` form-state actions are grandfathered and migrate opportunistically; no new endpoint may use the legacy shape. |
| API-3 | Closed error taxonomy of 16 codes (section 2.3). Server Actions never throw across the wire; Route Handlers map the same codes to HTTP statuses. |
| API-4 | Idempotency is server-derived deterministic keys everywhere, except `beginCheckout` and `chargeWithToken`, where the client supplies a `client_ref` UUID generated at pay-click. Full key registry in section 2.4. |
| API-5 | All money fields in contracts are ILS numbers with exactly 2 decimal places, suffix `_ils`, validated `z.number().nonnegative().multipleOf(0.01)`. Internal arithmetic is agorot (integers), per MASTER. |
| API-6 | Pagination is cursor-based everywhere: input `{ cursor?, limit (1..50, default 20) }`, output `{ items, next_cursor }`. Cursor is opaque base64url of `(created_at, id)`. No offset pagination in any new endpoint (offset remains only inside catalog RPCs 030 where it already exists). |
| API-7 | All Zod schemas live in `src/contracts/` (one file per domain), imported by both server actions and route handlers. This directory is the single source of truth a future REST layer or mobile client is generated from. |
| API-8 | No `/v1` URL versioning today. Contracts evolve additively (section 5). The only payloads that carry explicit schema versions are those that outlive a deploy: the QR token (`v` field, `qr_key_id` rotation), the analytics envelope (`schema_version`), and the offline coupon wallet IndexedDB record. If a true non-web native client ever ships, the then-current `src/contracts/` is frozen and exposed as `/api/v1/*` route handlers generated from the same schemas. |
| API-9 | Rate limiting uses exactly the MASTER 5.4 table, expressed as 4 named tiers (section 2.5). Money-path limiters fail CLOSED, everything else fails OPEN. Client-side entry point is only `check_my_rate_limit`; `check_rate_limit` (IP) runs in route handlers and auth actions; `check_user_rate_limit` only inside SECURITY DEFINER functions and service-role code. |
| API-10 | The supplier redeem endpoint is a Route Handler (`POST /api/supplier/redeem`), not a Server Action, because the scanner PWA drains an offline `redeem_intents` queue via plain `fetch` from a service worker context where Server Actions are unavailable. |
| API-11 | Business rules that were stated as fixed numbers in early material (10 percent commission, 10/90 coupon split, 5 percent cashback every 5th purchase, first-purchase 10 percent discount plus tokenization) are NOT hard-coded in contracts. Contracts expose the generic mechanisms that already exist in the schema: per-line `platform_percent` snapshot with `products.platform_percent -> suppliers.commission_percent -> 10` fallback, `coupon_price` / `total_deal_price` pricing, a server-side cashback qualification rule evaluated inside the webhook transaction, and a server-side promotion rule at `beginCheckout`. The fixed numbers are the launch configuration of those mechanisms, never part of the wire contract. |
| API-12 | Everything valuable (order paid, coupon codes issued, wallet moves, cashback, tokens saved) is created ONLY inside the webhook transaction after server-to-server verification against Cardcom. The client redirect return page is purely cosmetic and reads state via RLS. |

---

## 1. Transport decision matrix

### 1.1 Rules

1. **Server Action** when all of the following hold: the caller is the Next.js app itself (RSC form or client component), the caller has a Supabase session cookie (or is a guest with the cart cookie), and the call is request-response with no third-party caller.
2. **Route Handler** when any of the following hold:
   - The caller is not our app: Cardcom webhook, email/SMS/WhatsApp provider delivery webhooks, uptime monitor, Vercel cron.
   - The call must work without a session or outside the React runtime: signed unsubscribe link, share redirect `/r/[code]`, analytics beacon (`navigator.sendBeacon`), service-worker fetch (scanner offline drain).
   - The response must be CDN-cacheable per-URL: catalog autocomplete.
3. **RSC direct read** (no endpoint at all) when the data is public or owner-scoped and rendered server-side: product lists, product detail, category pages, order history pages, supplier dashboard pages. The contract for these is the SQL RPC signature plus the RLS policy, both already fixed by migrations 027/030; this document records the read contracts but does not wrap them in actions.

Webhooks are ALWAYS route handlers. This is non-negotiable: Server Actions are POST endpoints keyed by build-specific action IDs, they require the Next origin checks and change identity every deploy; an external PSP cannot call them.

### 1.2 Consequences

- No BFF and no general REST layer (SUPERAPP D2 stands). The PWA/TWA/Capacitor superapp consumes exactly these Server Actions because the client is always this web app.
- Route handlers live under `src/app/api/**/route.ts`, are `force-dynamic`, and never use cookies for auth except none at all (they use signatures, secrets, or bearer service tokens).
- Every route handler validates input with the same `src/contracts/` Zod schemas as actions.

---

## 2. Global conventions

### 2.1 Auth tiers

| Tier | Meaning | Enforced by |
|------|---------|-------------|
| `guest` | No session required. Guest cart cookie `ke_cart_sid` (httpOnly, 30d) identifies the anonymous cart. | nothing; RLS anon policies |
| `user` | `supabase.auth.getUser()` non-null (never `getSession()`). | `requireUserSession()` in `src/lib/admin/rbac.ts` |
| `supplier:scanner` / `supplier:manager` / `supplier:owner` | Active row in `supplier_members` with sufficient `member_role`. `profiles.role='vendor'` is only a routing hint, never authorization. | `is_supplier_member()` / `is_supplier_owner()` inside RLS and RPCs; app-side `requireSupplierMember(minRole)` helper |
| `staff` | `has_role('content_uploader')` (content_uploader, admin, super_admin). | `requireStaffSession()` |
| `admin` | `is_admin()` (admin, super_admin). | `requireAdminSession()` |
| `super_admin` | `profiles.role = 'super_admin'`. Money-out and role grants. | `requireAdminSession()` + explicit role check + `requireRecentAuth(15)` |
| `service` | No user. Cardcom signature, provider signature, `CRON_SECRET` bearer, or service-role key. | route handler guard |

Sensitive admin mutations (`markPayoutStatementPaid`, `updateUserRole` to admin tier, `adminAdjustWallet`) additionally require `requireRecentAuth(15)` (re-auth within 15 minutes).

### 2.2 Response envelope

```ts
// src/contracts/envelope.ts
import { z } from 'zod'

export const ErrorCode = z.enum([
  'UNAUTHENTICATED',      // no session where one is required
  'FORBIDDEN',            // session exists, tier insufficient (or RLS returned zero rows on a write)
  'VALIDATION',           // Zod parse failure; details.field set
  'NOT_FOUND',            // entity absent OR hidden by RLS on read (never distinguish)
  'CONFLICT',             // unique violation, optimistic concurrency, duplicate application
  'STATE_INVALID',        // legal entity, illegal transition (e.g. refund on non-succeeded payment)
  'EXPIRED',              // coupon expired, order pending window passed, QR token exp passed
  'INSUFFICIENT_STOCK',
  'INSUFFICIENT_WALLET',
  'PAYMENT_DECLINED',     // Cardcom declined; failure_code passed through in details
  'PAYMENT_PROVIDER_ERROR', // Cardcom unreachable / malformed response
  'RATE_LIMITED',         // details.retry_after_seconds set
  'IDEMPOTENT_REPLAY',    // same key, different payload (key reuse bug); replay with SAME payload returns ok:true with the original result instead
  'CONSENT_REQUIRED',     // marketing send without opt-in, terms not accepted at checkout
  'SIGNATURE_INVALID',    // webhook / QR / unsubscribe token signature failure
  'INTERNAL',             // anything else; message is generic, details empty, incident logged
])
export type ErrorCode = z.infer<typeof ErrorCode>

export const ApiError = z.object({
  code: ErrorCode,
  message: z.string(),            // Hebrew, user-displayable
  field: z.string().optional(),   // for VALIDATION
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean(),         // true only for PAYMENT_PROVIDER_ERROR, RATE_LIMITED, INTERNAL
})
export type ApiError = z.infer<typeof ApiError>

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }

export const paginationInput = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(50).default(20),
})
export const page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), next_cursor: z.string().nullable() })

export const ils = z.number().nonnegative().multipleOf(0.01)
export const uuid = z.string().uuid()
```

Route handlers map codes to HTTP: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `VALIDATION` 422, `NOT_FOUND` 404, `CONFLICT`/`IDEMPOTENT_REPLAY` 409, `STATE_INVALID`/`EXPIRED`/`INSUFFICIENT_*`/`CONSENT_REQUIRED` 422, `PAYMENT_*` 402, `RATE_LIMITED` 429 with `Retry-After`, `SIGNATURE_INVALID` 401, `INTERNAL` 500. Webhook handlers are the exception: after persisting the event row they return 200 even on processing failure (section 4.4).

Rules:
- `NOT_FOUND` is returned both for genuinely absent rows and rows hidden by RLS. Existence is never leaked across tenants (anti-enumeration, matches `redeem_coupon` behavior which additionally uses its own `scan_result` vocabulary).
- `INTERNAL` never carries provider payloads, SQL, or stack traces. The correlated `security_events` / log id may appear as `details.incident_id`.
- Actions used with `useActionState` forms may additionally keep the `(prevState, formData)` signature, but the returned object is still `ActionResult<T>`.

### 2.3 Error taxonomy ownership

Every endpoint below lists its error subset. Codes not listed cannot be returned by that endpoint (besides the universal `VALIDATION`, `RATE_LIMITED` where a tier applies, and `INTERNAL`).

### 2.4 Idempotency key registry

DB anchors (already migrated): `payments.idempotency_key` UNIQUE NOT NULL, `payments.cardcom_low_profile_id` UNIQUE, `payments.cardcom_transaction_id` UNIQUE, `payment_webhook_events UNIQUE(provider, external_event_id)`, `wallet_transactions.idempotency_key` UNIQUE NOT NULL, `coupon_redemptions.coupon_code_id` UNIQUE, `notifications_outbox.dedupe_key` UNIQUE, `notification_events.dedupe_key` UNIQUE, `notification_delivery_events UNIQUE(provider, external_event_id)`, `notification_conversions.order_id` UNIQUE.

| Flow | Key | Generated by |
|------|-----|--------------|
| beginCheckout initial payment | `lp:<client_ref>` | client generates `client_ref` UUID at pay-click; re-submit with same `client_ref` returns the SAME `redirect_url` (or same `order_id` for wallet-covers-all) |
| Token charge | `tok:<order_id>:<client_ref>` | client per attempt; only one `succeeded` payment per order is allowed by state machine |
| Refund | `ref:<payment_id>:<n>` | server; `n` = 1 + count of existing refund payments for that payment, computed inside the tx |
| Cardcom webhook | `(provider='cardcom', external_event_id)` insert-first | Cardcom |
| Wallet spend at payment success | `order:<order_id>:spend` | webhook tx |
| Cashback earn | `order:<order_id>:cashback` | webhook tx |
| Refund to wallet | `order:<order_id>:refund_credit:<n>` | refund tx |
| Wallet expiry sweep | `expire:<account_id>:<YYYYMM>` | cron |
| Admin manual adjust | `adjust:<client_ref>` | admin UI generates `client_ref` per form open |
| Legacy WP opening balance | `legacy_opening:<wp_user_id>` | import script (already fixed by 032 docs) |
| Coupon redemption | `coupon_redemptions.coupon_code_id` UNIQUE + atomic CAS on `coupon_codes.status` | `redeem_coupon` RPC |
| Notifications | `dedupe_key` per 031 registry (`order_paid:<order_id>` etc.) | trigger / cron |
| Analytics | PK `(occurred_at, event_id)`; client generates `event_id` UUID | SDK |
| Superapp verticals (future) | vertical-prefixed: `food:order:<uuid>:cashback` | vertical service |

Semantics: replay with the same key and same payload returns the original result as `ok:true` (read-back). Same key with a different payload returns `IDEMPOTENT_REPLAY`. Keys are never accepted raw into `payments.idempotency_key` from the client; the server always prefixes (`lp:`, `tok:`, `adjust:`) so namespaces cannot collide.

### 2.5 Rate-limit tiers

Implementation: `check_rate_limit(key, max, window)` for IP keys (002), `check_my_rate_limit(action, limit, window)` for user keys (035), both SECURITY DEFINER. Numbers are MASTER 5.4 verbatim.

| Tier | Behavior on limiter error | Members |
|------|---------------------------|---------|
| **RL0** none | n/a | all RSC reads, `getCart`, catalog RPC reads, owner-scoped list/get actions |
| **RL1** strict, fail CLOSED | deny | auth login/otp 10/h IP; signup, magic link, password reset 5/h IP each; `begin_checkout` 10/min user; `coupon_scan` 30/min user; `account_deletion` 3/24h user; token charge shares `begin_checkout` |
| **RL2** moderate, fail OPEN | allow | `consent_change` 20/h user; `agent_chat` 20/h user; `listing_draft` 10/24h user; profile/address/prefs mutations 60/h user (new, this doc); dispute open 10/24h user (new, this doc) |
| **RL3** IP loose, fail OPEN | allow | Cardcom webhook ~300/min IP; `/api/a` ingest 120/min IP; autocomplete 120/min IP (new, this doc); `/r/[code]` 120/min IP (new, this doc); unsubscribe 30/min IP (new, this doc); delivery webhooks 300/min IP (new, this doc) |

New limits introduced here (marked "new, this doc") are additions to the MASTER table, not changes to existing rows; they follow the same fail-open rule as their tier.

### 2.6 Contracts module layout

```
src/contracts/
  envelope.ts        // ActionResult, ApiError, ErrorCode, pagination, ils, uuid
  enums.ts           // z.enum mirrors of DB enums (order_status, payment_status, coupon_status, ...)
  catalog.ts         // product/category/search read shapes
  cart.ts
  checkout.ts
  coupons.ts
  wallet.ts
  orders.ts
  supplier.ts
  account.ts
  notifications.ts
  admin.ts
  analytics.ts
  webhooks.ts        // cardcom + delivery provider payloads
```

`src/contracts/enums.ts` mirrors the authoritative DB enum values exactly (027/029/031 final state):

```ts
export const orderStatus = z.enum(['pending','paid','partially_fulfilled','fulfilled','cancelled','refunded'])
export const orderItemStatus = z.enum(['pending','issued','shipped','delivered','cancelled','refunded'])
export const paymentKind = z.enum(['charge','token_charge','refund'])
export const paymentStatus = z.enum(['initiated','redirected','succeeded','failed','cancelled','refunded'])
export const couponStatus = z.enum(['issued','used','expired','refunded'])   // UI labels active/redeemed map to issued/used
export const walletReason = z.enum(['cashback_earn','order_spend','expire','refund_credit','referral_bonus','manual_adjust'])
export const payoutStatus = z.enum(['draft','pending_approval','approved','paid','cancelled'])
export const productType = z.enum(['coupon','physical','service'])
export const productStatus = z.enum(['draft','active','paused','sold_out','archived'])
export const supplierMemberRole = z.enum(['owner','manager','scanner'])
export const scanResult = z.enum(['success','not_found','already_used','expired','refunded','wrong_supplier','unauthorized','rate_limited'])
export const disputeStatus = z.enum(['open','in_review','resolved_accepted','resolved_rejected'])
export const scanMethod = z.enum(['camera','manual'])
```

Note for client authors: the admin `updateOrderStatus` action in `src/server/actions/admin/orders.ts` currently validates against the DEAD 001 enum (`processing`, `shipped`, `delivered`). It must be rewritten against `orderStatus` above; recorded as gap G-1 in section 7.

---

## 3. API surface index

Status legend: E = exists in code today, P = partial (exists but must be reshaped to this contract), N = new (planned).

| # | Endpoint | Transport | Auth | Tier | Status |
|---|----------|-----------|------|------|--------|
| A1 | signInWithGoogle | SA | guest | RL1 | E |
| A2 | signInWithEmail | SA | guest | RL1 | E |
| A3 | signUpWithEmail | SA | guest | RL1 | E |
| A4 | sendMagicLink | SA | guest | RL1 | E |
| A5 | sendPasswordReset / updatePassword | SA | guest/user | RL1 | E |
| A6 | signOut / signOutAll | SA | user | RL0 | E |
| A7 | getMyProfile / updateMyProfile | SA | user | RL0/RL2 | N |
| A8 | listMyAddresses / upsertAddress / deleteAddress / setDefaultAddress | SA | user | RL0/RL2 | N |
| A9 | listMyPaymentTokens / setDefaultPaymentToken / deletePaymentToken | SA | user | RL0/RL2 | N |
| A10 | requestAccountDeletion / cancelAccountDeletion | SA | user | RL1 | N |
| B1 | catalog list/detail reads | RSC | guest | RL0 | P |
| B2 | GET /api/catalog/autocomplete | RH | guest | RL3 | N |
| B3 | search page read (search_products / filter_products / category_facets) | RSC | guest | RL0 | N |
| B4 | GET /r/[code] | RH | guest | RL3 | N |
| C1 | getCart | SA | guest | RL0 | N |
| C2 | addToCart / updateCartItem / clearCart | SA | guest | RL2 | N |
| C3 | mergeGuestCart (fn_merge_guest_cart) | SA internal | user | RL0 | P |
| D1 | beginCheckout | SA | user | RL1 | N |
| D2 | chargeWithToken | SA | user | RL1 | N |
| D3 | POST /api/payments/cardcom/webhook | RH | service | RL3 | N |
| D4 | refundPayment | SA | admin | RL0 | N |
| E1 | getMyCoupons | SA | user | RL0 | N |
| E2 | getCouponDetail (incl. qr_token) | SA | user | RL0 | N |
| F1 | submitSupplierApplication | SA | user | RL2 | N |
| F2 | getMySupplierContext | SA | user | RL0 | N |
| F3 | POST /api/supplier/redeem | RH | supplier:scanner | RL1 | N |
| F4 | listSupplierOrderItems | SA | supplier:scanner | RL0 | N |
| F5 | updateShippingStatus | SA | supplier:scanner | RL2 | N |
| F6 | getSupplierRedemptionStats | SA | supplier:scanner | RL0 | N |
| F7 | listPayoutStatements / getPayoutStatement | SA | supplier:scanner | RL0 | N |
| F8 | upsertSupplierBankAccount | SA | supplier:owner | RL2 | N |
| F9 | listSupplierMembers / inviteSupplierMember / updateSupplierMemberRole / deactivateSupplierMember | SA | supplier:owner | RL2 | N |
| F10 | openSupplierDispute | SA | supplier:owner | RL2 | N |
| G1 | getWalletBalance | SA | user | RL0 | N |
| G2 | getWalletHistory | SA | user | RL0 | N |
| G3 | adminAdjustWallet | SA | admin | RL0 | N |
| H1 | listMyOrders | SA | user | RL0 | N |
| H2 | getOrderDetail | SA | user | RL0 | N |
| I1 | upsertProduct / deleteProduct / bulkUpdateProductStatus / deleteVariant | SA | staff | RL0 | E |
| I2 | upsertCategory / softDeleteCategory / deleteCategory / updateCategorySortOrder | SA | admin | RL0 | E |
| I3 | upsertCouponDeal / softDeleteCouponDeal | SA | admin | RL0 | E |
| I4 | approveSupplierApplication / rejectSupplierApplication | SA | admin | RL0 | N |
| I5 | upsertSupplier / updateSupplierStatus / updateSupplierCommission | SA | admin | RL0 | P |
| I6 | updateUserRole | SA | admin (+super_admin gate) | RL0 | E |
| I7 | updateOrderStatus (admin transitions) | SA | admin | RL0 | P |
| I8 | generatePayoutStatement / approvePayoutStatement / cancelPayoutStatement | SA | admin | RL0 | N |
| I9 | markPayoutStatementPaid | SA | super_admin | RL0 | N |
| I10 | reconcileCardcomSettlement | SA | admin | RL0 | N |
| I11 | resolveSupplierDispute | SA | admin | RL0 | N |
| I12 | upsertNotificationTemplate / activateNotificationTemplate | SA | admin | RL0 | N |
| J1 | getNotificationPreferences / updateNotificationPreferences | SA | user | RL0/RL2 | N |
| J2 | setMarketingConsent | SA | user | RL2 | N |
| J3 | GET /api/unsubscribe | RH | signed link | RL3 | N |
| J4 | POST /api/notifications/delivery | RH | service | RL3 | N |
| J5 | listMyNotifications / markNotificationRead | SA | user | RL0 | N |
| K1 | POST /api/a | RH | guest | RL3 | N |
| L1 | GET /api/health | RH | public | RL0 | N |
| L2 | POST /api/cron/* (10 jobs) | RH | service (CRON_SECRET) | RL0 | N |

---

## 4. Endpoint specifications

Format per endpoint: transport and file, auth, rate tier, RLS interaction, idempotency, errors, then Zod input/output. `ActionResult<...>` wrapping is implied for every Server Action and omitted from the schemas.

### Domain A: Auth, identity, account

#### A1..A6 Auth actions (EXIST, `src/server/actions/auth.ts`)

Kept as-is with their current form-state signature (`AuthState`), IP rate limits already wired (login 10/h, signup/magic/reset 5/h, RL1 fail closed via `check_rate_limit`). Contract notes that bind them:
- Google OAuth is the primary flow; email/password and magic link are fallbacks. No SMS OTP.
- `/auth/callback` completes PKCE, then MUST call C3 `mergeGuestCart` before redirecting to `next`.
- `safeNext` open-redirect guard stays mandatory (only paths starting with `/`).
- Errors surface as Hebrew strings via the existing `ERROR_MAP`; no enumeration of registered emails (Supabase default messages are already normalized).

#### A7 getMyProfile / updateMyProfile (NEW, `src/server/actions/account.ts`)

- Auth: `user`. Rate: read RL0, write RL2 (`profile_update` 60/h).
- RLS: `profiles` owner SELECT / owner UPDATE with 035 pins; the action uses the user client, so attempts to change `role` or `supplier_id` are rejected by the WITH CHECK, surfacing as `FORBIDDEN`.
- Idempotency: naturally idempotent (last-write-wins full-field update).
- Errors: `UNAUTHENTICATED`, `FORBIDDEN`.

```ts
export const updateMyProfileInput = z.object({
  full_name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^0(5\d|[2-4,8-9])\d{7}$/).nullable(),  // Israeli formats
  avatar_url: z.string().url().max(500).nullable(),
})
export const myProfile = z.object({
  id: uuid,
  email: z.string().email(),
  full_name: z.string().nullable(),
  phone: z.string().nullable(),
  avatar_url: z.string().nullable(),
  role: z.enum(['customer','content_uploader','vendor','admin','super_admin']),
  created_at: z.string().datetime(),
})
```

#### A8 Addresses (NEW, `src/server/actions/account.ts`)

- Auth: `user`. Rate: reads RL0, writes RL2.
- RLS: `user_addresses` owner SELECT/INSERT/UPDATE/DELETE (`user_id = auth.uid()`); user client end to end, no service role.
- Idempotency: `upsertAddress` with `id` is idempotent; `setDefaultAddress` relies on the partial UNIQUE `(user_id) WHERE is_default` and clears the previous default in one statement.
- Delete is soft (`deleted_at`), because `orders.address_id` references addresses (`ON DELETE SET NULL` exists, but history should keep the row).
- Errors: `UNAUTHENTICATED`, `NOT_FOUND`.

```ts
export const addressInput = z.object({
  id: uuid.optional(),
  full_name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^0(5\d|[2-4,8-9])\d{7}$/),
  city: z.string().trim().min(2).max(60),
  street: z.string().trim().min(2).max(120),
  street_number: z.string().trim().max(10).nullable().default(null),
  apartment: z.string().trim().max(10).nullable().default(null),
  entrance: z.string().trim().max(10).nullable().default(null),
  floor: z.string().trim().max(10).nullable().default(null),
  zip: z.string().regex(/^\d{5,7}$/).nullable().default(null),
  notes_for_courier: z.string().trim().max(300).nullable().default(null),
  is_default: z.boolean().default(false),
})
export const address = addressInput.required({ id: true }).extend({ created_at: z.string().datetime() })
// listMyAddresses: () => z.array(address)   (no pagination; hard cap 20 addresses per user, enforced in action)
// deleteAddress / setDefaultAddress: ({ id: uuid }) => { id: uuid }
```

#### A9 Payment tokens (NEW, `src/server/actions/account.ts`)

- Auth: `user`. Rate: reads RL0, writes RL2.
- RLS: `payment_tokens` owner rows; the raw `cardcom_token` COLUMN is revoked from browser roles (029), so the select list below is the complete readable projection. The token itself is written only by the webhook handler (service role) after first successful charge, and never accepted from any client input.
- `setDefaultPaymentToken` calls RPC `fn_set_default_payment_token(p_token_id)` (ownership-checked, atomic).
- `deletePaymentToken` hard-deletes the row (a Cardcom token without our row is inert); if it was the default, no new default is auto-elected.
- Errors: `UNAUTHENTICATED`, `NOT_FOUND`.

```ts
export const paymentTokenView = z.object({
  id: uuid,
  last_4: z.string().length(4),
  card_brand: z.string().nullable(),
  expiry_month: z.number().int().min(1).max(12),
  expiry_year: z.number().int(),
  is_default: z.boolean(),
  created_at: z.string().datetime(),
})
```

#### A10 Account deletion (NEW, `src/server/actions/account.ts`)

- Auth: `user` + `requireRecentAuth(15)`. Rate: RL1 `account_deletion` 3/24h, fail closed (enforced inside the RPC).
- RLS: none needed; both are SECURITY DEFINER RPCs `fn_request_account_deletion(p_reason)` / `fn_cancel_account_deletion()` granted to authenticated. Execution (`fn_execute_account_deletion`) is service-only via cron L2 after the 30-day grace.
- Idempotency: partial UNIQUE `(user_id) WHERE status='pending'` makes a second request a `CONFLICT`.
- Errors: `UNAUTHENTICATED`, `CONFLICT`, `RATE_LIMITED`.

```ts
export const requestAccountDeletionInput = z.object({ reason: z.string().trim().max(500).nullable() })
export const deletionRequestView = z.object({
  id: uuid, status: z.enum(['pending','cancelled','completed']),
  cancel_deadline_at: z.string().datetime(),
})
```

### Domain B: Catalog, search, SEO (reads)

#### B1 Catalog reads (RSC, no endpoint)

Product list, product detail (`/products/[slug]`), category pages (`/category/[slug]`), coupon deal pages (`/coupons/[slug]`), homepage hero: all are RSC direct selects through the anon/user client. RLS guarantees: `products` visible only when `status='active' AND deleted_at IS NULL`; `categories` when `is_active AND deleted_at IS NULL`; `coupon_deals` active only; `hero_slides` active only. The canonical read projection (also the superapp product card contract):

```ts
export const productCard = z.object({
  id: uuid, slug: z.string(), type: productType,
  name_he: z.string(), name_en: z.string().nullable(),
  kenyon_price: ils, full_price: ils.nullable(),      // full_price >= kenyon_price (DB CHECK)
  images: z.array(z.object({ url: z.string(), alt_he: z.string().nullable() })),
  supplier: z.object({ id: uuid, name: z.string(), city: z.string().nullable() }).nullable(),
  category: z.object({ id: uuid, slug: z.string(), name_he: z.string() }).nullable(),
  stock_quantity: z.number().int().nullable(),
  is_featured: z.boolean(),
})
export const productDetail = productCard.extend({
  description_he: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()),
  variants: z.array(z.object({
    id: uuid, name_he: z.string(), sku: z.string().nullable(),
    price: ils.nullable(), option_values: z.record(z.string(), z.string()),
    stock_quantity: z.number().int().nullable(), is_active: z.boolean(),
  })),
  // coupon-type products only:
  coupon_terms: z.object({
    coupon_price_ils: ils,                 // paid on site (= platform fee)
    total_deal_price_ils: ils,             // face value
    balance_due_at_business_ils: ils,      // total - coupon_price
    expiry_days: z.number().int(),
  }).nullable(),
  seo: z.object({ title: z.string().nullable(), description: z.string().nullable() }),
})
```

Prices exposed to clients are ALWAYS `kenyon_price` / `full_price`; the legacy `price_ils` column never appears in a contract. Internal-only fields (cost_ils, platform_percent, supplier contact) never leave the server for `guest`/`user` tiers.

#### B2 GET /api/catalog/autocomplete (NEW, `src/app/api/catalog/autocomplete/route.ts`)

- Transport: Route Handler, because responses are CDN-cacheable per URL (`Cache-Control: public, s-maxage=300, stale-while-revalidate=600`) and called on every keystroke past the 2-char threshold; a Server Action would bypass the CDN entirely.
- Auth: `guest`. Rate: RL3 120/min per IP (`check_rate_limit('ac:'+ip, 120, 60)`), fail open.
- RLS: RPC `autocomplete_products(p_prefix, p_limit)` is INVOKER and only surfaces active products.
- Errors: `VALIDATION` (422) only; limiter overflow returns 429.

```ts
export const autocompleteQuery = z.object({
  q: z.string().trim().min(2).max(60),
  limit: z.coerce.number().int().min(1).max(8).default(8),
})
export const autocompleteResult = z.object({
  items: z.array(z.object({ id: uuid, slug: z.string(), name_he: z.string(), kenyon_price: ils, image_url: z.string().nullable() })),
})
```

#### B3 Search and filter reads (RSC)

`/search?q=` and category filter pages call the 030 RPCs directly in the RSC: `search_products(p_query, p_category_id, p_limit=24, p_offset=0)`, `filter_products(category_id, filters, sort, page, page_size)`, `category_facets(category_id)`. Contract: page size fixed 24; `log_search_query` is invoked fire-and-forget from the same render (definer, anon-callable). These keep their SQL offset pagination (API-6 exception, already migrated).

#### B4 GET /r/[code] (NEW, `src/app/r/[code]/route.ts`)

- Purpose: short share links for deals with referral attribution. Redirects 302 to the target (`/products/[slug]` or `/coupons/[slug]`) appending `?ref=<code>`; the destination page sets the attribution cookie consumed by `orders.attribution` (033).
- Auth: `guest`. Rate: RL3 120/min IP. Click is logged as analytics event `page_view` with `props.share_code` (no new table).
- Errors: unknown code redirects to `/` (no 404 leak of code space).

```ts
export const shareCodeParam = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{4,24}$/) })
```

### Domain C: Cart (guest-first)

Storage decision: the normalized `cart_items` table (026) is the contract target. Identification: authenticated users own `carts.profile_id = auth.uid()` (UNIQUE partial); guests own `carts.session_id = ke_cart_sid` cookie value (UUID, httpOnly, SameSite=Lax, 30d, issued lazily on first `addToCart`). Guest cart rows are written with the admin client (guests have no DB identity; `carts` RLS has no anon policy), ALWAYS filtered by the cookie value which only the server can read. All cart actions return the same `cartView` so the client never assembles cart state.

```ts
export const cartView = z.object({
  id: uuid.nullable(),                       // null = empty, not yet materialized
  items: z.array(z.object({
    product_id: uuid,
    variant_id: uuid.nullable(),
    quantity: z.number().int().min(1).max(99),
    // live projection, never trusted from client:
    name_he: z.string(),
    image_url: z.string().nullable(),
    unit_price_ils: ils,                     // current kenyon_price (or variant price)
    line_total_ils: ils,
    type: productType,
    available: z.boolean(),                  // product still active + stock
  })),
  subtotal_ils: ils,
  item_count: z.number().int(),
})
```

#### C1 getCart (NEW, `src/server/actions/cart.ts`)

- Auth: `guest`. Rate: RL0. Errors: none beyond `INTERNAL`.
- RLS: user client for authenticated (owner ALL policy on carts/cart_items), admin client keyed by cookie for guests.
- Prices are resolved live at read; a price change between add and checkout is reflected here and re-validated at D1.

#### C2 addToCart / updateCartItem / clearCart (NEW)

- Auth: `guest`. Rate: RL2 `cart_write` 120/h per user or IP, fail open.
- Idempotency: `updateCartItem` sets absolute quantity (0 removes), so retries are safe; `addToCart` increments but is bounded by the DB CHECK `quantity BETWEEN 1 AND 99` and the UNIQUE `(cart_id, product_id, variant_id)`.
- Errors: `NOT_FOUND` (product not active / hidden by RLS), `VALIDATION`, `INSUFFICIENT_STOCK` (add beyond stock_quantity when tracked), `STATE_INVALID` (variant does not belong to product).

```ts
export const addToCartInput = z.object({
  product_id: uuid,
  variant_id: uuid.nullable().default(null),
  quantity: z.number().int().min(1).max(99).default(1),
})
export const updateCartItemInput = z.object({
  product_id: uuid,
  variant_id: uuid.nullable().default(null),
  quantity: z.number().int().min(0).max(99),   // 0 = remove
})
// clearCart: no input. All three return cartView.
```

#### C3 mergeGuestCart (PARTIAL, `src/server/actions/cart.ts`)

- Current code merges jsonb `carts.items` with the admin client and a `(userId, sessionId)` signature. Target contract: server-internal function (NOT exported as a client-callable action) invoked only from `/auth/callback` after PKCE completes; it reads `ke_cart_sid` from the cookie jar itself and calls RPC `fn_merge_guest_cart(p_session_id)` (029: advisory-lock, sums quantities, caps 99, deletes guest cart) with the USER client, since the RPC is SECURITY DEFINER and granted to authenticated. The `userId` parameter disappears (auth.uid() inside the RPC); this closes the current hole where any caller could merge any session into any user.
- Auth: `user` (post-login only). Rate: RL0. Idempotency: RPC deletes the guest cart in-tx, so a replay is a no-op. Errors: none surfaced (merge failures log to `security_events` and never block login).
- After merge the handler clears the `ke_cart_sid` cookie.

### Domain D: Checkout and payments

Skill and platform rules that bind this domain: all Cardcom calls live in `src/server/actions/payments/`; Cardcom is never called from client components; callback signature is validated before any order mutation; order status updates use the admin client; every webhook event is persisted (audit) before acting.

#### D1 beginCheckout (NEW, `src/server/actions/payments/checkout.ts`)

- Auth: `user` (proxy.ts already forces login on `/checkout*`; the action re-checks). Rate: RL1 `begin_checkout` 10/min, fail CLOSED via `check_my_rate_limit`.
- RLS: reads cart/addresses with the user client; writes `orders`, `order_items`, `payments` with the ADMIN client inside one transaction (there are deliberately no client INSERT policies on these tables).
- Transaction (single DB tx, per COMMERCE 5.2): validate stock + `status='active'` per line; resolve prices server-side (client price input does not exist); resolve `platform_percent` per line via `product_platform_percent(product_id)` and freeze the 5-column split snapshot; validate requested wallet amount `<= wallet_accounts.balance_ils` and `<= total` (VALIDATE only, debit happens at webhook); require `accept_terms=true` and stamp `accepted_terms_at`; apply active promotion rules (e.g. first-purchase discount) into `orders.discount_ils`; create `orders` (`pending`, `expires_at = now() + 30min`) + `order_items` + `payments` (`initiated`, `idempotency_key='lp:'+client_ref`); call Cardcom LowProfile create; store `cardcom_low_profile_id`; flip payment to `redirected`.
- Wallet-covers-all branch: if wallet covers the full total, no Cardcom call; wallet debit + order `paid` happen synchronously in the same tx via `fn_wallet_transfer` (service role, key `order:<order_id>:spend`) and the response is `{ kind: 'paid', order_id }`.
- Idempotency: `client_ref` UUID generated at pay-click. Replay with same `client_ref`: return the existing payment's `redirect_url` if still `redirected` and order unexpired; `EXPIRED` if the 30-min window passed; `IDEMPOTENT_REPLAY` if payload differs.
- Errors: `UNAUTHENTICATED`, `VALIDATION`, `NOT_FOUND` (cart empty/address not owned), `INSUFFICIENT_STOCK`, `INSUFFICIENT_WALLET`, `CONSENT_REQUIRED` (terms), `EXPIRED`, `IDEMPOTENT_REPLAY`, `PAYMENT_PROVIDER_ERROR`, `RATE_LIMITED`.

```ts
export const beginCheckoutInput = z.object({
  client_ref: uuid,                          // idempotency, generated at pay-click
  address_id: uuid.nullable().default(null), // required iff cart contains physical items (superRefine in action, needs cart)
  apply_wallet_ils: ils.default(0),
  accept_terms: z.literal(true),
  save_card: z.boolean().default(true),      // tokenize on success (first-purchase flow); token written by webhook only
})
export const beginCheckoutOutput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('redirect'), order_id: uuid, redirect_url: z.string().url() }), // Cardcom hosted page (SAQ-A)
  z.object({ kind: z.literal('paid'), order_id: uuid }),                                     // wallet covered everything
])
```

#### D2 chargeWithToken (NEW, `src/server/actions/payments/token-charge.ts`)

- One-click purchase with a saved default token. Same transaction skeleton as D1 but `payments.kind='token_charge'`, no redirect: the action calls Cardcom charge-by-token synchronously, then finalizes EXACTLY like the webhook path (same `finalizePaidOrder(order_id)` routine: stock decrement, coupon issuance, wallet moves, notifications), guarded by the same idempotency keys so a late webhook for the same transaction is a no-op.
- Auth: `user`, token ownership via RLS read of `payment_tokens`. Rate: RL1 shares `begin_checkout` 10/min fail closed.
- Idempotency: `tok:<order_id>:<client_ref>`; `payments.cardcom_transaction_id` UNIQUE is the provider-side guard.
- Errors: D1 set plus `PAYMENT_DECLINED` (failure_code in details).

```ts
export const chargeWithTokenInput = beginCheckoutInput.omit({ save_card: true }).extend({ token_id: uuid })
export const chargeWithTokenOutput = z.object({
  order_id: uuid,
  payment_status: paymentStatus,             // 'succeeded' | 'failed'
  failure_code: z.string().nullable(),
})
```

#### D3 POST /api/payments/cardcom/webhook (NEW, `src/app/api/payments/cardcom/webhook/route.ts`)

- Transport: Route Handler, mandatory (external caller). `force-dynamic`, no cookies, no CSRF.
- Auth: `service`: (1) HMAC/secret validation with `CARDCOM_WEBHOOK_SECRET`; (2) regardless of signature result, INSERT into `payment_webhook_events` (`signature_valid` recorded) BEFORE any state change; (3) server-to-server verification: fetch the transaction from Cardcom API by `low_profile_id` and trust ONLY that response for amounts and status (`verified_against_api=true`). Signature invalid or verification mismatch: log `security_events` severity critical, return 200, change nothing.
- Rate: RL3 ~300/min IP, fail open.
- Idempotency: UNIQUE `(provider, external_event_id)` insert-first; conflict means replay, return 200 immediately. `payments.cardcom_transaction_id` UNIQUE protects double-success.
- Processing tx (`finalizePaidOrder`): payment `redirected -> succeeded`; order `pending -> paid` (+`paid_at`); stock decrement; issue `coupon_codes` per coupon line (8-digit code, Ed25519 `qr_token`, financial snapshot columns); wallet spend transfer `order:<id>:spend` if `wallet_applied_ils > 0`; cashback earn `order:<id>:cashback` if the qualification rule passes; persist Cardcom token to `payment_tokens` if `save_card` and first successful charge; emit notification event `order_paid:<order_id>`; write `audit_log`. Failure events: payment `-> failed` with `failure_code`, order stays `pending` until the 30-min expiry cron cancels it.
- Response: 200 always after the event row is persisted (including processing errors, which are retried by the reconcile cron); 401 only when the raw request cannot even be attributed (malformed beyond parsing).

```ts
// src/contracts/webhooks.ts. Cardcom field names per their LowProfile spec; superset-tolerant (.passthrough()).
export const cardcomWebhookPayload = z.object({
  terminalnumber: z.coerce.number(),
  lowprofilecode: z.string(),                 // = payments.cardcom_low_profile_id
  Operation: z.string().optional(),
  ResponseCode: z.coerce.number(),            // 0 = success
  InternalDealNumber: z.coerce.string().optional(), // = payments.cardcom_transaction_id
  // token fields when tokenization was requested:
  Token: z.string().optional(),
  CardValidityMonth: z.coerce.number().optional(),
  CardValidityYear: z.coerce.number().optional(),
  Last4CardDigits: z.coerce.string().optional(),
  CardBrand: z.coerce.string().optional(),
}).passthrough()
```

#### D4 refundPayment (NEW, `src/server/actions/payments/refunds.ts`)

- Auth: `admin` + `requireRecentAuth(15)`. Rate: RL0 (admin surface). Audit row mandatory.
- Semantics: refund against a `succeeded` payment, full or partial; creates a `payments` row `kind='refund'`, `refund_of_payment_id` set, calls Cardcom refund API; on provider success updates order/item statuses (`refunded` when fully refunded) and optionally credits wallet instead of card (goodwill path, `refund_to='wallet'`, transfer `order:<id>:refund_credit:<n>` from `platform:adjustments`).
- Coupon lines: refunding an unredeemed coupon flips `coupon_codes.status issued -> refunded` in the same tx; a `used` coupon line is `STATE_INVALID`.
- Idempotency: `ref:<payment_id>:<n>`; sum of refunds capped at original `amount_ils` (else `STATE_INVALID`).
- Errors: `NOT_FOUND`, `STATE_INVALID`, `PAYMENT_PROVIDER_ERROR`, `FORBIDDEN`.

```ts
export const refundPaymentInput = z.object({
  payment_id: uuid,
  amount_ils: ils.nullable().default(null),   // null = full remaining
  reason: z.string().trim().min(3).max(500),
  refund_to: z.enum(['card','wallet']).default('card'),
})
export const refundPaymentOutput = z.object({
  refund_payment_id: uuid, status: paymentStatus, refunded_total_ils: ils,
})
```

### Domain E: Coupons (customer side)

#### E1 getMyCoupons (NEW, `src/server/actions/coupons.ts`)

- Auth: `user`. Rate: RL0. RLS: `coupon_codes` owner SELECT (`user_id = auth.uid() AND deleted_at IS NULL`); user client.
- Errors: `UNAUTHENTICATED`.

```ts
export const myCouponView = z.object({
  id: uuid,
  code: z.string().regex(/^\d{8}$/),
  status: couponStatus,                      // issued | used | expired | refunded
  product: z.object({ id: uuid.nullable(), name_he: z.string(), image_url: z.string().nullable() }),
  business: z.object({ supplier_id: uuid, name: z.string(), city: z.string().nullable(), address: z.string().nullable() }),
  face_value_ils: ils,
  platform_paid_ils: ils,
  collect_amount_ils: ils,                   // pay at business
  expires_at: z.string().datetime(),
  used_at: z.string().datetime().nullable(),
})
export const getMyCouponsOutput = z.object({
  active: z.array(myCouponView), used: z.array(myCouponView), expired: z.array(myCouponView),
})
```

#### E2 getCouponDetail (NEW)

- Adds the signed QR payload for rendering and for the offline coupon wallet (IndexedDB `coupon_wallet` per SUPERAPP). `qr_token` format `KE1.<base64url(payload)>.<base64url(sig)>`, payload `{ v:1, cid, c, sid, exp }`, Ed25519, key id in `qr_key_id`. The token proves authenticity offline; single-use is enforced only by the DB at redeem time.
- Auth: `user` (owner via RLS). Rate: RL0. Errors: `UNAUTHENTICATED`, `NOT_FOUND`.

```ts
export const couponDetailOutput = myCouponView.extend({
  qr_token: z.string(),
  qr_key_id: z.string(),
  terms_he: z.string().nullable(),
  how_to_redeem_he: z.string().nullable(),
})
```

### Domain F: Supplier portal

Authorization for ALL of domain F is `supplier_members` membership (`is_supplier_member` / `is_supplier_owner`), never `profiles.role`. The app helper `requireSupplierMember(minRole)` resolves `current_supplier_id()` once per request; every action also passes `supplier_id` explicitly so multi-business members are unambiguous.

#### F1 submitSupplierApplication (NEW, `src/server/actions/supplier/onboarding.ts`)

- Auth: `user`. Rate: RL2 (`listing_draft`-style, 3 applications/24h user, fail open).
- RLS: owner INSERT policy on `supplier_applications` (`user_id = auth.uid() AND status='pending'`); user client.
- Idempotency: partial UNIQUE `(user_id) WHERE status='pending'` -> second submit is `CONFLICT`.
- Errors: `UNAUTHENTICATED`, `CONFLICT`.

```ts
export const supplierApplicationInput = z.object({
  business_name: z.string().trim().min(2).max(120),
  business_id: z.string().regex(/^\d{9}$/),          // Israeli company/osek number
  contact_name: z.string().trim().min(2).max(80),
  contact_email: z.string().email(),
  contact_phone: z.string().regex(/^0\d{8,9}$/),
  city: z.string().trim().max(60).nullable().default(null),
  description: z.string().trim().max(1000).nullable().default(null),
})
export const supplierApplicationView = supplierApplicationInput.extend({
  id: uuid, status: z.enum(['pending','approved','rejected']),
  rejection_reason: z.string().nullable(), created_at: z.string().datetime(),
})
```

#### F2 getMySupplierContext (NEW)

- Resolves the caller's memberships for portal routing. Auth: `user`. Rate: RL0. Errors: `UNAUTHENTICATED` (empty list is `ok`, not an error).

```ts
export const supplierContextOutput = z.object({
  memberships: z.array(z.object({
    supplier_id: uuid, supplier_name: z.string(),
    member_role: supplierMemberRole, is_active: z.boolean(),
  })),
})
```

#### F3 POST /api/supplier/redeem (NEW, `src/app/api/supplier/redeem/route.ts`)

- Transport: Route Handler (decision API-10: the scanner PWA service worker drains its offline `redeem_intents` queue with plain `fetch`; a stable URL that survives deploys is required, which Server Action IDs do not provide). Session cookie auth (Supabase SSR client inside the handler), so this is the one route handler that DOES use cookies.
- Auth: `supplier:scanner` minimum. The RPC itself re-derives the caller's supplier and rejects cross-supplier scans (`wrong_supplier`).
- Rate: RL1 `coupon_scan` 30/min per user, fail CLOSED (inside the RPC).
- RLS/impl: single call to SECURITY DEFINER `redeem_coupon(p_code, p_scan_method)` (027 canonical; `fn_redeem_coupon` is revoked and must not be referenced). Atomic CAS `issued -> used`, writes `coupon_redemptions` (UNIQUE coupon_code_id) and appends `coupon_scan_events` for every attempt including failures.
- Anti-enumeration: all failures return the RPC's `result` vocabulary with no timing or existence side channel beyond it; HTTP status is 200 for every processed scan (the scanner UX switches on `result`), 401 only when unauthenticated.
- Offline drain contract: the client may send `client_scanned_at` for analytics; the SERVER redemption time is authoritative. A queued intent for a coupon redeemed meanwhile returns `already_used`, which the scanner treats as success-idempotent.

```ts
export const redeemInput = z.object({
  code: z.string().regex(/^\d{8}$/),
  scan_method: scanMethod.default('camera'),
  client_scanned_at: z.string().datetime().optional(),
})
export const redeemOutput = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('success'),
    customer_name: z.string(),
    product_name: z.string(),
    face_value_ils: ils,
    platform_paid_ils: ils,
    collect_amount_ils: ils,                  // the amount to collect at the register
    used_at: z.string().datetime(),
  }),
  z.object({ result: scanResult.exclude(['success']) }),
])
```

#### F4 listSupplierOrderItems (NEW, `src/server/actions/supplier/orders.ts`)

- Own sales feed: order items of PAID orders belonging to the caller's supplier. Auth: `supplier:scanner`. Rate: RL0.
- RLS: 027 policies (`orders` supplier read paid, `order_items` supplier member read); user client, so the DB enforces tenancy even if the action filter is wrong.
- Customer PII exposure is deliberately minimal: name and city for shipping, full address ONLY for physical items via the 027 `user_addresses` supplier-read policy.

```ts
export const listSupplierOrderItemsInput = paginationInput.extend({
  supplier_id: uuid,
  status: orderItemStatus.optional(),
  from: z.string().date().optional(), to: z.string().date().optional(),
})
export const supplierOrderItemView = z.object({
  order_item_id: uuid, order_id: uuid, paid_at: z.string().datetime(),
  product_name_he: z.string(), variant_name_he: z.string().nullable(),
  quantity: z.number().int(), product_type: productType,
  total_price_ils: ils, supplier_due_ils: ils, platform_fee_ils: ils,
  item_status: orderItemStatus,
  shipping: z.object({
    carrier: z.string().nullable(), tracking_number: z.string().nullable(),
    shipped_at: z.string().datetime().nullable(), delivered_at: z.string().datetime().nullable(),
    recipient: z.object({ full_name: z.string(), phone: z.string(), city: z.string(),
      street: z.string(), street_number: z.string().nullable() }).nullable(),  // physical only
  }).nullable(),
})
// output: page(supplierOrderItemView)
```

#### F5 updateShippingStatus (NEW)

- Wraps RPC `update_shipping_status(p_order_item_id, p_new_status, p_carrier, p_tracking)` (027: validates membership, enforces `pending|issued -> shipped -> delivered`, recomputes parent order status). Auth: `supplier:scanner`. Rate: RL2 60/h.
- Errors: `NOT_FOUND`, `STATE_INVALID`, `FORBIDDEN`.

```ts
export const updateShippingStatusInput = z.object({
  order_item_id: uuid,
  new_status: z.enum(['shipped','delivered']),
  carrier: z.string().trim().max(60).nullable().default(null),      // required when 'shipped' (superRefine)
  tracking_number: z.string().trim().max(80).nullable().default(null),
}).superRefine((v, ctx) => {
  if (v.new_status === 'shipped' && !v.carrier)
    ctx.addIssue({ code: 'custom', path: ['carrier'], message: 'חובה לציין חברת שילוח' })
})
export const updateShippingStatusOutput = z.object({ order_item_id: uuid, item_status: orderItemStatus, order_status: orderStatus })
```

#### F6 getSupplierRedemptionStats (NEW, `src/server/actions/supplier/stats.ts`)

- Reads 034 supplier views (`v_supplier_redemptions_monthly`, `v_supplier_scans_daily`, `v_supplier_sales_daily`), all `security_invoker` so RLS scopes rows to the member's supplier. Auth: `supplier:scanner`. Rate: RL0.

```ts
export const supplierStatsInput = z.object({ supplier_id: uuid, months: z.number().int().min(1).max(12).default(3) })
export const supplierStatsOutput = z.object({
  redemptions_monthly: z.array(z.object({ month: z.string(), redeemed_count: z.number().int(), collected_ils: ils })),
  scans_daily: z.array(z.object({ day: z.string(), success: z.number().int(), failed: z.number().int() })),
  sales_daily: z.array(z.object({ day: z.string(), items: z.number().int(), gross_ils: ils, supplier_due_ils: ils })),
})
```

#### F7 listPayoutStatements / getPayoutStatement (NEW, `src/server/actions/supplier/payouts.ts`)

- Auth: `supplier:scanner` (read). Rate: RL0. RLS: member SELECT of NON-DRAFT statements + lines (027); drafts are invisible to suppliers by policy.
- `bank_snapshot` is returned redacted: only `bank_code`, `branch_code`, last 3 digits of `account_number`.

```ts
export const payoutStatementView = z.object({
  id: uuid, statement_number: z.string(),               // PS-000001
  period_start: z.string().date(), period_end: z.string().date(),
  status: payoutStatus,                                 // never 'draft' for suppliers
  total_gross_ils: ils, total_platform_fee_ils: ils, total_payout_ils: ils,
  paid_at: z.string().datetime().nullable(), payment_reference: z.string().nullable(),
  lines: z.array(z.object({
    line_type: z.enum(['physical_delivery','coupon_redemption','adjustment']),
    order_item_id: uuid.nullable(), coupon_code_id: uuid.nullable(),
    quantity: z.number().int().nullable(), gross_ils: ils,
    platform_percent: z.number(), platform_fee_ils: ils, payout_ils: ils,
  })).optional(),                                        // present on getPayoutStatement only
})
```

#### F8 upsertSupplierBankAccount (NEW)

- Auth: `supplier:owner` + `requireRecentAuth(15)`. Rate: RL2 5/24h. RLS: owner SELECT/INSERT/UPDATE, no DELETE (deactivation only); redacted audit trigger (035) fires on write.
- Idempotency: partial UNIQUE `(supplier_id) WHERE is_active`; inserting a new active account deactivates the previous in the same tx.
- Errors: `FORBIDDEN`, `VALIDATION`, `CONFLICT`.

```ts
export const bankAccountInput = z.object({
  supplier_id: uuid,
  account_holder_name: z.string().trim().min(2).max(120),
  holder_id_number: z.string().regex(/^\d{9}$/),
  bank_code: z.string().regex(/^\d{2}$/),
  branch_code: z.string().regex(/^\d{3}$/),
  account_number: z.string().regex(/^\d{4,9}$/),
})
export const bankAccountView = z.object({
  id: uuid, account_holder_name: z.string(), bank_code: z.string(),
  branch_code: z.string(), account_number_last3: z.string().length(3),
  is_active: z.boolean(), verified_at: z.string().datetime().nullable(),
})
```

#### F9 Supplier members management (NEW, `src/server/actions/supplier/members.ts`)

- Auth: `supplier:owner`. Rate: RL2 20/24h. RLS: owner INSERT/UPDATE/DELETE on `supplier_members`; DB trigger `enforce_supplier_member_role` (035) blocks non-admin creation/elevation of `owner` rows, so contract max role for self-service is `manager`.
- Invite flow: `inviteSupplierMember` takes an email; if no auth user exists, a magic-link invite is sent and a pending member row is created on first login (invite token = notifications outbox, not a new table).
- Errors: `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` (UNIQUE supplier_id+user_id), `STATE_INVALID` (attempt to grant `owner`).

```ts
export const inviteSupplierMemberInput = z.object({
  supplier_id: uuid, email: z.string().email(),
  member_role: z.enum(['manager','scanner']),           // 'owner' only via admin
})
export const updateSupplierMemberRoleInput = z.object({
  supplier_id: uuid, user_id: uuid, member_role: z.enum(['manager','scanner']),
})
export const deactivateSupplierMemberInput = z.object({ supplier_id: uuid, user_id: uuid })
export const supplierMemberView = z.object({
  user_id: uuid, email: z.string().email(), full_name: z.string().nullable(),
  member_role: supplierMemberRole, is_active: z.boolean(), invited_by: uuid.nullable(),
})
```

#### F10 openSupplierDispute (NEW)

- Auth: `supplier:owner`. Rate: RL2 10/24h. RLS: owner INSERT on `supplier_disputes`; member SELECT. An open dispute blocks `markPayoutStatementPaid` on the referenced statement (027 rule).
- Errors: `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`.

```ts
export const openDisputeInput = z.object({
  supplier_id: uuid,
  statement_id: uuid.nullable().default(null),
  statement_line_id: uuid.nullable().default(null),
  order_item_id: uuid.nullable().default(null),
  coupon_code_id: uuid.nullable().default(null),
  reason: z.string().trim().min(10).max(2000),
}).refine(v => v.statement_id || v.statement_line_id || v.order_item_id || v.coupon_code_id,
  { message: 'חובה לקשר את הפנייה לפריט' })
export const disputeView = z.object({
  id: uuid, status: disputeStatus, reason: z.string(),
  resolution_notes: z.string().nullable(), created_at: z.string().datetime(),
})
```

### Domain G: Wallet

The wallet is a closed double-entry ledger (`wallet_accounts` + `wallet_transactions`). There is NO client-callable spend/credit endpoint of any kind: earning happens inside the webhook tx, spending happens inside checkout finalization, expiry happens in cron, and the only human entry point is the admin adjustment. `fn_wallet_transfer` is service-role only (SEC-01); no contract below ever calls it with a user client.

#### G1 getWalletBalance (NEW, `src/server/actions/wallet.ts`)

- Auth: `user`. Rate: RL0. RLS: `wallet_accounts` user read own. Errors: `UNAUTHENTICATED`.

```ts
export const walletBalanceOutput = z.object({
  balance_ils: ils,
  expiring: z.array(z.object({ amount_ils: ils, expires_at: z.string().datetime() })), // 12-month expiry horizon
})
```

#### G2 getWalletHistory (NEW)

- Auth: `user`. Rate: RL0. RLS: `wallet_transactions` user reads rows touching own account; the action projects each row into a signed single-entry view (positive = credit to the user).

```ts
export const walletHistoryInput = paginationInput
export const walletEntryView = z.object({
  id: uuid,
  amount_ils: z.number().multipleOf(0.01),   // signed: + earn / - spend
  reason: walletReason,
  related_order_id: uuid.nullable(),
  note: z.string().nullable(),
  created_at: z.string().datetime(),
})
// output: page(walletEntryView)
```

#### G3 adminAdjustWallet (NEW, `src/server/actions/admin/wallet.ts`)

- Auth: `admin` + `requireRecentAuth(15)`. Rate: RL0. Audit mandatory.
- Impl: ADMIN client calls `fn_wallet_transfer` with `platform:adjustments` as counter-account; direction `credit` = debit adjustments / credit user, `debit` = reverse. User account balance CHECK >= 0 caps debits.
- Idempotency: `adjust:<client_ref>`; the admin form generates `client_ref` on open, so double-click cannot double-pay.
- Errors: `NOT_FOUND` (user without wallet account), `INSUFFICIENT_WALLET` (debit below zero), `IDEMPOTENT_REPLAY`.

```ts
export const adminAdjustWalletInput = z.object({
  client_ref: uuid,
  user_id: uuid,
  direction: z.enum(['credit','debit']),
  amount_ils: ils.refine(v => v > 0),
  note: z.string().trim().min(3).max(300),
})
export const adminAdjustWalletOutput = z.object({ transaction_id: uuid, new_balance_ils: ils })
```

### Domain H: Orders (customer)

#### H1 listMyOrders / H2 getOrderDetail (NEW, `src/server/actions/orders.ts`)

- Auth: `user`. Rate: RL0. RLS: `orders` user read own, `order_items` via own order; user client end to end. Errors: `UNAUTHENTICATED`, `NOT_FOUND`.
- The order detail is also the post-checkout success page contract: the return-from-Cardcom page polls `getOrderDetail` until `status != 'pending'` or the 30-min window lapses (client shows "payment processing" meanwhile). No state is ever written from the return page (API-12).

```ts
export const listMyOrdersInput = paginationInput.extend({ status: orderStatus.optional() })
export const orderSummaryView = z.object({
  id: uuid, status: orderStatus, created_at: z.string().datetime(), paid_at: z.string().datetime().nullable(),
  total_ils: ils, cashback_applied_ils: ils, item_count: z.number().int(),
  first_item_name_he: z.string().nullable(), first_item_image_url: z.string().nullable(),
})
export const orderDetailView = z.object({
  id: uuid, status: orderStatus,
  created_at: z.string().datetime(), paid_at: z.string().datetime().nullable(), expires_at: z.string().datetime().nullable(),
  subtotal_ils: ils, discount_ils: ils, cashback_applied_ils: ils, total_ils: ils,
  address: z.object({ full_name: z.string(), city: z.string(), street: z.string(), street_number: z.string().nullable() }).nullable(),
  items: z.array(z.object({
    id: uuid, product_type: productType, item_status: orderItemStatus,
    name_he: z.string(), image_url: z.string().nullable(),
    quantity: z.number().int(), unit_price_ils: ils, total_price_ils: ils,
    charged_on_site_ils: ils, balance_due_at_business_ils: ils,   // coupon economics, shown on receipt
    coupon_code_id: uuid.nullable(),                              // deep link to E2
    shipping: z.object({ carrier: z.string().nullable(), tracking_number: z.string().nullable(),
      shipped_at: z.string().datetime().nullable(), delivered_at: z.string().datetime().nullable() }).nullable(),
  })),
  payments: z.array(z.object({ kind: paymentKind, status: paymentStatus, amount_ils: ils, created_at: z.string().datetime() })),
})
```

### Domain I: Admin CRUD

All admin actions: auth per row below, RL0 (admin UI, protected by session + audit, not by throttles), audit_log written by DB triggers, user client so RLS admin policies apply (except where a service RPC is noted). Existing actions keep their file layout under `src/server/actions/admin/`.

#### I1 Products (EXISTS, `admin/products.ts`, staff)

Existing `upsertProduct` / `deleteProduct` / `bulkUpdateProductStatus` / `deleteVariant` stand, with three contract amendments:
1. `schema.type` must become the full `productType` enum (`coupon`, `physical`, `service`); today it omits `service`.
2. `schema.status` must include `sold_out` (current enum omits it, diverging from `product_status`).
3. Add optional `platform_percent: z.number().min(0).max(100).nullable()` (admin-only commission override per product) and `supplier_id: uuid.nullable()`; both flow into the 026/027 snapshot machinery.
Errors: `FORBIDDEN`, `VALIDATION`, `CONFLICT` (slug/sku unique).

#### I2 Categories (EXISTS, `admin/categories.ts`, admin)

Stands as coded (`upsertCategory`, `softDeleteCategory`, `deleteCategory`, `updateCategorySortOrder`). DB trigger `enforce_category_depth` (max 2 levels) surfaces as `STATE_INVALID`. Slug change auto-writes `seo_redirects` via `record_slug_redirect`.

#### I3 Coupon deals (EXISTS, `admin/coupon-deals.ts`, admin)

Stands, one amendment: when 036 (vendors unification) lands, `vendor_id` is replaced by `supplier_id` and the generated `platform_price` column pair is superseded by explicit `coupon_price` / `total_deal_price` per MASTER 1.40. The Zod schema then becomes:

```ts
export const couponDealInput = z.object({
  id: uuid.optional(),
  supplier_id: uuid.nullable(),
  title_he: z.string().min(2), business_name: z.string().min(2),
  total_deal_price_ils: ils.refine(v => v > 0),
  coupon_price_ils: ils.refine(v => v > 0),
  terms_he: z.string().nullable().default(null),
  valid_from: z.string().date(), valid_until: z.string().date().nullable().default(null),
  max_uses: z.number().int().min(1).nullable().default(null),
  max_uses_per_user: z.number().int().min(1).default(1),
  location_he: z.string().nullable().default(null),
  lat: z.number().nullable().default(null), lng: z.number().nullable().default(null),
  image_url: z.string().url().nullable().default(null),
  status: z.enum(['draft','active','paused','archived']).default('draft'),
}).refine(v => v.coupon_price_ils < v.total_deal_price_ils,
  { message: 'מחיר הקופון חייב להיות נמוך ממחיר הדיל' })
```

#### I4 Supplier applications (NEW, `admin/suppliers.ts`, admin)

Wrap RPCs `approve_supplier_application(p_application_id)` (creates supplier + owner member + promotes role) and `reject_supplier_application(p_application_id, p_reason)`. Idempotency: approving a non-pending application is `STATE_INVALID`. Errors: `NOT_FOUND`, `STATE_INVALID`.

```ts
export const approveApplicationInput = z.object({ application_id: uuid })
export const rejectApplicationInput = z.object({ application_id: uuid, reason: z.string().trim().min(3).max(500) })
```

#### I5 Suppliers CRUD (PARTIAL)

`admin/vendors.ts` currently writes the LEGACY `vendors` table with `commission_rate` default 90 (a leftover of the inverted split). Target: rewrite against `suppliers` with `commission_percent` = PLATFORM share, default 10, plus `payout_terms_days`. The `vendors` actions freeze until 036 and are deleted with it. New schema:

```ts
export const supplierUpsertInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2).max(120),
  legal_name: z.string().nullable().default(null),
  business_id: z.string().regex(/^\d{9}$/).nullable().default(null),
  contact_email: z.string().email().nullable().default(null),
  contact_phone: z.string().nullable().default(null),
  city: z.string().nullable().default(null), address: z.string().nullable().default(null),
  logo_url: z.string().url().nullable().default(null),
  commission_percent: z.number().min(0).max(100).default(10),   // platform share
  payout_terms_days: z.number().int().min(0).max(90).default(15),
  status: z.enum(['active','suspended','closed']).default('active'),
})
```

#### I6 updateUserRole (EXISTS, `admin/users.ts`)

Stands. Defense in depth is now double: app-level super_admin gate (exists) plus DB trigger `enforce_role_change_privilege` (035). Amendment: add `requireRecentAuth(15)` before admin-tier grants. The `app_metadata` JWT sync stays.

#### I7 updateOrderStatus (PARTIAL, `admin/orders.ts`)

Rewrite: (1) validate against the REAL `order_status` enum (gap G-1); (2) enforce the COMMERCE state machine server-side; admin may only perform `pending -> cancelled` and `paid|partially_fulfilled|fulfilled -> refunded` (the latter ONLY through D4 refundPayment, so this action rejects `refunded` with a pointer error); `paid` is never set manually (webhook only, API-12). Errors: `STATE_INVALID`, `NOT_FOUND`.

```ts
export const adminUpdateOrderStatusInput = z.object({
  order_id: uuid,
  status: z.enum(['cancelled']),           // the only manual transition; everything else is machine-driven
  reason: z.string().trim().min(3).max(500),
})
```

#### I8/I9 Payout statements (NEW, `admin/payouts.ts`)

Wrap the 027 canonical RPCs (the 026 `supplier_payouts` engine is dead per MASTER 1.2 and gets no contract):
- `generatePayoutStatement { supplier_id, period_start, period_end }` -> `{ statement_id }`; idempotent via partial UNIQUE `(supplier_id, period) WHERE status<>'cancelled'` -> `CONFLICT` on overlap.
- `approvePayoutStatement { statement_id }` -> `pending_approval -> approved`; `STATE_INVALID` otherwise. Auth: `admin`.
- `markPayoutStatementPaid { statement_id, payment_reference: z.string().min(3).max(80) }`: auth `super_admin` + `requireRecentAuth(15)`; blocked by open disputes (`STATE_INVALID` with `details.open_disputes`); freezes `bank_snapshot`.
- `cancelPayoutStatement { statement_id }` -> releases lines. Auth: `admin`.
All return `payoutStatementView` (F7 shape, unredacted bank snapshot for admin).

#### I10 reconcileCardcomSettlement (NEW)

Wraps `reconcile_cardcom_settlement(p_settlement_id)` -> jsonb summary `{ matched, unmatched, amount_mismatch }`. Upload of the settlement file itself is an admin page that inserts `cardcom_settlements` + txn rows with the user client (admin ALL policy). Auth: `admin`. Errors: `NOT_FOUND`.

#### I11 resolveSupplierDispute (NEW)

```ts
export const resolveDisputeInput = z.object({
  dispute_id: uuid,
  resolution: z.enum(['resolved_accepted','resolved_rejected']),
  resolution_notes: z.string().trim().min(3).max(2000),
})
```
Auth: `admin`. `open|in_review -> resolved_*` only, else `STATE_INVALID`.

#### I12 Notification templates (NEW, `admin/notifications.ts`)

`upsertNotificationTemplate` inserts a NEW version row (versions are immutable; UNIQUE `(template_key, channel, locale, version)`); `activateNotificationTemplate { template_id }` wraps `fn_activate_template` (single active per key/channel/locale). Auth: `admin`. Errors: `CONFLICT`, `NOT_FOUND`.

### Domain J: Notifications, consent, preferences

#### J1 getNotificationPreferences / updateNotificationPreferences (NEW, `src/server/actions/notifications.ts`)

- Auth: `user`. Rate: read RL0, write RL2. RLS: owner SELECT/INSERT/UPDATE on `user_notification_preferences`.
- Marketing flags are NOT settable here; they only move through J2 (consent must produce a `consent_events` row, Amendment 13). Transactional toggles are free.

```ts
export const notificationPreferencesView = z.object({
  order_updates_email: z.boolean(), order_updates_whatsapp: z.boolean(),
  coupon_expiry_email: z.boolean(), coupon_expiry_inapp: z.boolean(), coupon_expiry_whatsapp: z.boolean(),
  wallet_activity_email: z.boolean(),
  marketing_email: z.boolean(), marketing_sms: z.boolean(), marketing_whatsapp: z.boolean(),  // read-only here
  locale: z.enum(['he','en']),
})
export const updateNotificationPreferencesInput = notificationPreferencesView
  .omit({ marketing_email: true, marketing_sms: true, marketing_whatsapp: true })
  .partial()
```

#### J2 setMarketingConsent (NEW)

- Wraps `fn_set_marketing_consent(p_channel, p_granted, p_source, p_wording)` (definer, rate-limited 20/h inside). Auth: `user`. Rate: RL2 `consent_change`.
- The action pins `source='account_page'` or `'checkout'` from its call site; wording_version comes from the deployed consent copy constant, never from the client.

```ts
export const setMarketingConsentInput = z.object({
  channel: z.enum(['email','sms','whatsapp','all']),
  granted: z.boolean(),
})
```

#### J3 GET /api/unsubscribe (NEW, `src/app/api/unsubscribe/route.ts`)

- One-click list-unsubscribe from email footers; must work with NO login. Token: HMAC-SHA256 over `user_id.channel.issued_at` with server secret, 30-day validity, base64url. Handler verifies and calls `fn_unsubscribe_marketing(p_user_id, p_channel, p_source:='unsubscribe_link')` with the service client, then renders a static Hebrew confirmation page.
- Auth: signed link (`service` semantics). Rate: RL3 30/min IP. Errors: `SIGNATURE_INVALID` renders a neutral "link expired" page (no user info leaked).

```ts
export const unsubscribeQuery = z.object({ t: z.string().min(32).max(512) })
```

#### J4 POST /api/notifications/delivery (NEW, `src/app/api/notifications/delivery/route.ts`)

- Provider webhooks (email/SMS/WhatsApp delivery, bounce, complaint, STOP replies). Verifies the provider signature header, then `fn_ingest_delivery_event(...)` (service; dedupes on `(provider, external_event_id)`, writes suppressions, auto-opt-out on complaint).
- Auth: `service` (provider signature). Rate: RL3 300/min IP. Returns 200 after persist, like D3. Payload schema is provider-specific and lives in `src/contracts/webhooks.ts` as a passthrough object per provider; the normalized internal shape is:

```ts
export const deliveryEventNormalized = z.object({
  provider: z.string(), external_event_id: z.string(),
  event: z.enum(['delivered','bounced','complained','opened','clicked','read','failed']),
  address: z.string(), provider_message_id: z.string().nullable(),
})
```

#### J5 listMyNotifications / markNotificationRead (NEW)

- In-app feed from `notifications_outbox` (`channel='inapp'`). Auth: `user`. Rate: RL0.
- RLS: owner SELECT; owner UPDATE restricted by column grant to `read_at` only, so the action literally cannot alter anything else.

```ts
export const listMyNotificationsInput = paginationInput
export const notificationView = z.object({
  id: uuid, kind: z.string(), payload: z.record(z.string(), z.unknown()),
  created_at: z.string().datetime(), read_at: z.string().datetime().nullable(),
})
export const markNotificationReadInput = z.object({ id: uuid })
```

### Domain K: Analytics ingest

#### K1 POST /api/a (NEW, `src/app/api/a/route.ts`)

- Beacon endpoint (`navigator.sendBeacon` / fetch keepalive). Auth: `guest`; if a session cookie is present the handler resolves `user_id` SERVER-side (client-sent user ids are ignored). Consent-gated: without the analytics consent cookie the handler returns 204 and drops the batch.
- Rate: RL3 120/min IP, fail open. Body limit 64KB.
- Impl: `fn_ingest_analytics_events(p_events, p_user_id, p_ip, p_user_agent)` (service client; registry-validated, batch 1..50, timestamp clamp `[now-7d, now+5m]`, IP truncated /24, bot UA flagged). Dedup: PK `(occurred_at, event_id)`.
- Response: always 204 (success, consent-drop, and validation-drop alike); analytics must never generate user-visible errors or retry storms. Invalid events are counted server-side, not reported to the client.

```ts
export const analyticsEventInput = z.object({
  event_id: uuid,
  event_name: z.string().regex(/^[a-z][a-z0-9_]{2,49}$/),
  occurred_at: z.string().datetime(),
  source: z.enum(['web','pwa','server']).default('web'),
  anonymous_id: z.string().max(64),
  session_id: z.string().max(64),
  path: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
  utm: z.record(z.string(), z.string()).optional(),
  props: z.record(z.string(), z.unknown()).optional(),   // <= 4KB serialized, no PII (registry-enforced)
})
export const analyticsBatchInput = z.object({ events: z.array(analyticsEventInput).min(1).max(50) })
```

### Domain L: Ops

#### L1 GET /api/health (NEW)

Returns `{ ok: true, db: true }` after `select 1` through the anon client; 503 with `{ ok: false }` on failure. No auth, no body parsing, RL0 (uptime monitor).

#### L2 Cron route handlers (NEW, `src/app/api/cron/*/route.ts`)

All POST, guarded by `Authorization: Bearer ${CRON_SECRET}` (constant-time compare), service client, `force-dynamic`, return `{ processed: number }`. Registered in `vercel.json`:

| Route | RPC / job | Schedule |
|-------|-----------|----------|
| /api/cron/expire-orders | cancel `pending` orders past `expires_at`, release nothing (stock decrements only at paid) | */10 min |
| /api/cron/expire-coupons | `expire_coupons()` | hourly |
| /api/cron/coupon-expiry-reminders | `fn_enqueue_coupon_expiry_reminders()` | daily 08:00 IL |
| /api/cron/notifications-worker | `fn_fanout_notification_events(200)` + claim/send/mark loop (`fn_claim_notification_batch`) | every minute |
| /api/cron/abandoned-carts | `fn_enqueue_abandoned_cart_reminders()` | hourly |
| /api/cron/winback | `fn_enqueue_winback_reminders()` | daily |
| /api/cron/wallet-expiry | expiry transfers `expire:<account>:<YYYYMM>` + 30d-prior reminders | daily |
| /api/cron/account-deletions | `fn_execute_account_deletion` for pending past `cancel_deadline_at` | daily |
| /api/cron/analytics-rollup | `fn_rollup_analytics_daily()` 02:10, `fn_refresh_analytics_matviews()` 02:40 | nightly |
| /api/cron/analytics-partitions | `fn_ensure_analytics_partitions(2)` + `fn_drop_old_analytics_partitions(13)` | monthly |
| /api/cron/payments-reconcile | re-verify `redirected` payments older than 10 min against Cardcom API (missed webhook safety net) | */10 min |

Idempotency: every job is a wrapper over an idempotent RPC or key-guarded transfer; overlapping cron firings are safe by construction (`FOR UPDATE SKIP LOCKED` in the worker, unique keys elsewhere).

---

## 5. Versioning and backward compatibility (superapp)

The superapp decision (SUPERAPP D2/D3) makes versioning radically simpler than a REST platform: the mobile client IS this web app (PWA, then TWA/Capacitor wrappers loading the same origin). Client and server ship atomically, so Server Action signatures never need to serve two client generations. The strategy therefore has three layers:

**Layer 1: deploy-atomic surfaces (Server Actions, RSC reads).** No versioning. Next.js action IDs are build-scoped; a stale open tab that posts an old action ID receives a deployment-skew failure, which the app shell catches and answers with a soft reload prompt. Contract discipline still applies (layer 3 rules) so that intra-team refactors do not churn clients, but no compatibility window is promised.

**Layer 2: durable payloads that outlive deploys.** These carry explicit versions and append-only evolution, because they sit in third-party systems, printed QR codes, or on-device storage:

| Payload | Version carrier | Rule |
|---------|-----------------|------|
| QR token `KE1.<payload>.<sig>` | `KE1` prefix + `v` field + `qr_key_id` | New format = `KE2`; scanners accept N and N-1 for 12 months (coupon max lifetime). Key rotation via `qr_key_id` without format bump. |
| Analytics envelope | `schema_version` smallint (server-stamped) | Registry (`analytics_event_definitions`) is append-only; props are additive; renames are new event names. |
| Offline coupon wallet (IndexedDB `coupon_wallet`) | `updated_at` + full-record replace | Server response is always authoritative; client migration = drop and refetch. Fields are add-only. |
| Offline `redeem_intents` queue | fixed shape of F3 input | F3 input fields are never removed or re-typed; new fields optional. |
| Webhook payloads (Cardcom, providers) | theirs | Parsed with `.passthrough()`; we pin only fields we read. |
| Cron/env contracts (`CRON_SECRET` etc.) | n/a | Rotation = dual-accept window of 24h (comma-separated secrets). |

**Layer 3: evolution rules for `src/contracts/`** (enforced by a contract-diff CI check comparing exported schema JSON between main and PR):
1. Output schemas: fields are never removed, renamed, or narrowed. Deprecate by adding the replacement, marking the old field `@deprecated` in JSDoc, and deleting only after 2 releases AND zero references.
2. Input schemas: new fields must be optional or defaulted. Tightening validation (narrower regex, lower max) is allowed only with a data audit showing zero legitimate traffic outside the new bound.
3. Enums are append-only on outputs. Every client `switch` over a contract enum must have an exhaustive `default` that renders neutrally (unknown order status renders as its raw label, unknown scan result renders as generic failure). Inputs may reject new values until clients send them.
4. Discriminated unions: new variants allowed; clients ignore unknown `kind`s.
5. Money fields: always `_ils`, always 2dp numbers. Never change a field's currency or unit; a new unit is a new field.
6. IDs are opaque strings (UUID today); clients must not parse them.
7. Error taxonomy is append-only; clients treat unknown codes as `INTERNAL`.
8. If a genuine third-party API consumer ever appears (native app, partner), freeze `src/contracts/` as `@kenyonexpress/contracts@1.0.0`, generate `/api/v1/*` route handlers from it, and version THAT surface with URL majors. Nothing in today's design blocks this because every schema is already externalized in `src/contracts/` (API-7).

**Vertical expansion (superapp D3).** New verticals (food, rides) add detail tables referencing the `orders` envelope and get their own contract files (`src/contracts/food.ts`), their own `wallet_reason` values (append-only enum, rule 3), vertical-prefixed idempotency keys (`food:order:<uuid>:cashback`), and membership helpers cloned from the `supplier_members` pattern. They never touch the money tables' contracts, and `orders.vertical` (default `'shop'`) is added to `orderSummaryView`/`orderDetailView` as an additive field when the first vertical lands.

---

## 6. Rate-limit assignment (consolidated)

| Endpoint | Key | Limit | Window | Fail mode | Mechanism |
|----------|-----|-------|--------|-----------|-----------|
| A2 signInWithEmail | `login:<ip>` | 10 | 1h | closed | `check_rate_limit` |
| A3 signUpWithEmail | `signup:<ip>` | 5 | 1h | closed | `check_rate_limit` |
| A4 sendMagicLink | `magic:<ip>` | 5 | 1h | closed | `check_rate_limit` |
| A5 sendPasswordReset | `reset:<ip>` | 5 | 1h | closed | `check_rate_limit` |
| A7/A8/J1 profile-ish writes | `profile_update` | 60 | 1h | open | `check_my_rate_limit` |
| A9 token writes | `profile_update` (shared) | 60 | 1h | open | `check_my_rate_limit` |
| A10 requestAccountDeletion | `account_deletion` | 3 | 24h | closed | inside RPC |
| B2 autocomplete | `ac:<ip>` | 120 | 1min | open | `check_rate_limit` |
| B4 /r/[code] | `share:<ip>` | 120 | 1min | open | `check_rate_limit` |
| C2 cart writes | `cart_write` (user) / `cart:<ip>` (guest) | 120 | 1h | open | both |
| D1 beginCheckout | `begin_checkout` | 10 | 1min | closed | `check_my_rate_limit` |
| D2 chargeWithToken | `begin_checkout` (shared) | 10 | 1min | closed | `check_my_rate_limit` |
| D3 cardcom webhook | `cchook:<ip>` | 300 | 1min | open | `check_rate_limit` |
| F1 submitSupplierApplication | `supplier_apply` | 3 | 24h | open | `check_my_rate_limit` |
| F3 redeem | `coupon_scan` | 30 | 1min | closed | inside RPC |
| F5 updateShippingStatus | `shipping_update` | 60 | 1h | open | `check_my_rate_limit` |
| F8 bank account | `bank_update` | 5 | 24h | open | `check_my_rate_limit` |
| F9 members | `member_update` | 20 | 24h | open | `check_my_rate_limit` |
| F10 openDispute | `dispute_open` | 10 | 24h | open | `check_my_rate_limit` |
| J2 setMarketingConsent | `consent_change` | 20 | 1h | open | inside RPC |
| J3 unsubscribe | `unsub:<ip>` | 30 | 1min | open | `check_rate_limit` |
| J4 delivery webhook | `dlvhook:<ip>` | 300 | 1min | open | `check_rate_limit` |
| K1 /api/a | `ingest:<ip>` | 120 | 1min | open | `check_rate_limit` |
| Agent chat (028 surface) | `agent_chat` | 20 | 1h | open | `check_my_rate_limit` |
| Listing drafts (028) | `listing_draft` | 10 | 24h | open | `check_my_rate_limit` |
| All RSC reads, RL0 rows | none | | | | |

Fail-mode rule restated: any limiter guarding money movement or account destruction fails CLOSED (deny on limiter error); everything else fails OPEN (SEC-08).

---

## 7. Gaps between this contract and current code (work orders, no doc/schema edits required)

| # | Gap | Fix |
|---|-----|-----|
| G-1 | `admin/orders.ts` validates the dead 001 `order_status` values (`processing/shipped/delivered`) | rewrite per I7 |
| G-2 | `admin/vendors.ts` writes legacy `vendors` with `commission_rate` default 90 | freeze; replace with I5 `suppliers` actions at 036 |
| G-3 | `cart.ts` `mergeGuestCart(userId, sessionId)` accepts arbitrary userId with the admin client | replace per C3 (cookie-derived session id, `fn_merge_guest_cart`, user client) |
| G-4 | `carts.items` jsonb is the live storage; contracts target `cart_items` | migrate cart actions to normalized rows (026 already provides the table) |
| G-5 | No `src/contracts/` module; admin actions inline their Zod | extract per 2.6 as endpoints are touched |
| G-6 | `admin/products.ts` status enum omits `sold_out`, type omits `service`, no `platform_percent`/`supplier_id` | amend per I1 |
| G-7 | No route handlers exist at all (`src/app/api/` holds only .gitkeep) | build order: D3 webhook, F3 redeem, L2 crons, K1 ingest, B2 autocomplete, J3/J4, L1, B4 |
| G-8 | Legacy `{ error } | { success }` envelopes in all existing actions | migrate opportunistically to `ActionResult<T>` (API-2) |

---

## 8. Invariants restated for implementers

1. No client ever writes `orders`, `order_items`, `payments`, `wallet_*`, `coupon_codes`, `coupon_redemptions`, or audit/security tables directly. Server actions use the admin client or SECURITY DEFINER RPCs for those, and the user client for everything owner-scoped.
2. Every shekel that moves maps to exactly one row keyed in section 2.4. If you cannot name the idempotency key of a money move, the design of that move is wrong.
3. `paid` is set in exactly two code paths, both calling `finalizePaidOrder`: the verified Cardcom webhook (D3) and the synchronous token charge (D2). Nothing else, including admins, sets `paid`.
4. Coupon state transitions happen in exactly three places: `redeem_coupon` (issued -> used), `expire_coupons` cron (issued -> expired), refund tx (issued -> refunded). All one-way.
5. Prices, splits, and commission percentages are computed and snapshotted server-side at checkout. No contract accepts a price, a discount, or a percentage from a customer client. Admin contracts accept percentages; customer contracts never.
6. Marketing sends require an opt-in `consent_events` trail; transactional sends do not. `fn_in_marketing_window` and frequency caps run at send time, not enqueue time.
7. Webhook handlers persist first, verify second, act third, and return 200 broadly. Reconciliation crons are the safety net, not retries from the provider.

