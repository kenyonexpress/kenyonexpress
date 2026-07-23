# CHECKOUT-ARCHITECTURE

Status: **DESIGN ONLY**. Branch `arch/checkout-cardcom`. No UI files in this deliverable.

Date: 2026-07-23.

## Authority

| Source | Role |
|---|---|
| `MASTER-ARCHITECTURE.md` (v2 owner model) | Binding for money, no escrow, `platform_percent` per product, Cardcom = production PSP |
| `ARCHITECTURE-SECURITY.md` | Webhook forgery, rate limits, PCI SAQ-A |
| `ARCHITECTURE-LEGAL-COMPLIANCE.md` | Refund windows, card vs wallet |
| This file | Checkout + Cardcom pipeline detail |
| `docs/ARCHITECTURE-API-CONTRACTS.md` Domain D | Wire shapes; lose on conflict with this file + MASTER |
| `.claude/skills/cardcom-payments` | **Stale** on fixed 10%, Multi-Account at charge, coupon status names. Do not follow those parts |

`LEDGER-DESIGN.md`: **does not exist**. Ledger rules are D-LEDGER in MASTER (hybrid: wallet double-entry + Cardcom settlement reconcile for external cash).

**Out of scope:** Stripe as production PSP (experimental on `phase6/checkout-foundation` only). UI components. Supplier scan UI (see SUPPLIER-REDEMPTION).

---

## 0. Binding decisions (this doc)

| ID | Decision |
|---|---|
| C-1 | Guest cart open; identity required only on **"שלם"** (Google OAuth primary; email/phone OTP secondary) |
| C-2 | On login: merge guest cart, then checkout. No pay-without-account in v1 |
| C-3 | **Low Profile** for first / hosted card entry (SAQ-A). **ChargeToken** for saved-token one-click. Transactions API (raw card / Direct) is **not** used for browser checkout |
| C-4 | No Cardcom Multi-Account split at charge. Physical supplier share settles later via `payout_statements` |
| C-5 | Coupon on-site charge = `round_half_up(face_agorot * platform_percent / 100)` from product snapshot. Physical charge = full face. No escrow |
| C-6 | Only verified webhook, verified token-charge result, or reconcile cron may call `finalizePaidOrder`. Browser redirects are read-only |
| C-7 | Money unit end-to-end: integer **agorot**. Cardcom boundary converts to ILS string with 2 decimals |
| C-8 | `CHECKOUT_ENABLED=false` blocks new `beginCheckout` / `chargeWithToken`; already-in-flight finalize still runs |

---

## 1. Flow

### 1.1 Happy path (all carts)

```
[GUEST CART] ids + qty only (cookie ke_session_id / ke_cart_sid)
      |
      |  browse / add (no auth)
      v
[Click "שלם"]
      |
      |  if unauthenticated --> Google OAuth (or OTP), next=/checkout
      |  fn_merge_guest_cart(session_id)
      v
[CHECKOUT SESSION] authenticated user
      |  terms accept (required)
      |  shipping address if any physical line
      |  optional wallet apply (validate only; debit at finalize)
      |  save_card default true when no default token
      v
[beginCheckout | chargeWithToken]
      |  re-read prices + platform_percent from DB
      |  snapshot order_items (immutable)
      |  payments row + Cardcom call
      v
[HOSTED Low Profile]  OR  [sync ChargeToken]
      |
      +-- IndicatorUrl / webhook --> finalize
      +-- Success/Error redirect --> poll UI only
      v
[ORDER paid] coupons issued / physical claim recorded / wallet moves / token saved
```

### 1.2 Charge math (snapshot at beginCheckout)

Per line, `platform_percent` is copied from `products.platform_percent` (admin per-product). Settlement never re-reads live product %.

**Coupon line:**

```
face_agorot       = unit_face_agorot * qty
paid_on_site      = round_half_up(face_agorot * platform_percent / 100)
balance_at_biz    = face_agorot - paid_on_site
commission        = paid_on_site          # entire on-site charge = platform revenue
supplier_due      = 0
```

**Physical line:**

```
face_agorot       = unit_face_agorot * qty
paid_on_site      = face_agorot
commission        = round_half_up(face_agorot * platform_percent / 100)
supplier_due      = face_agorot - commission
balance_at_biz    = 0
```

**Order card charge:**

```
customer_pays_now = sum(paid_on_site)
card_charge       = customer_pays_now - wallet_applied   # wallet never mutates split snapshots
```

Mixed carts: sum lines independently; one Cardcom charge for `card_charge`.

### 1.3 Sequence: coupon-only (partial on-site charge)

```mermaid
sequenceDiagram
  actor G as Guest
  participant UI as Store
  participant Auth as Google OAuth
  participant SA as beginCheckout
  participant DB as Postgres
  participant CC as Cardcom Low Profile
  participant WH as Webhook

  G->>UI: Add coupon to cart
  G->>UI: Click שלם
  UI->>Auth: OAuth next=/checkout
  Auth->>DB: merge guest cart
  G->>UI: Accept terms
  UI->>SA: beginCheckout(client_ref, save_card)
  Note over SA,DB: Snapshot platform_percent; paid_on_site = face * pct
  SA->>DB: order pending + payment initiated
  SA->>CC: LowProfile ChargeAndCreateToken (amount = paid_on_site)
  CC-->>SA: redirect URL
  SA-->>UI: kind=redirect
  UI->>CC: Hosted page (PAN never on KE)
  CC->>WH: IndicatorUrl
  WH->>WH: persist event, HMAC, GetLpResult
  WH->>DB: finalizePaidOrder
  Note over DB: issue coupon_codes; commission = paid_on_site; supplier_due = 0
  CC-->>UI: SuccessRedirectUrl
  UI->>UI: poll until order.paid
```

### 1.4 Sequence: physical (full charge + platform_percent snapshot)

```mermaid
sequenceDiagram
  actor U as User
  participant UI as Checkout
  participant SA as beginCheckout
  participant DB as Postgres
  participant CC as Cardcom Low Profile
  participant WH as Webhook

  U->>UI: Cart with physical (+ optional coupons)
  U->>UI: Address + terms + optional wallet
  UI->>SA: beginCheckout(address_id, apply_wallet, client_ref)
  Note over SA,DB: paid_on_site = face; commission snapshotted; supplier_due = face - commission
  SA->>DB: pending order expires_at+30m
  SA->>CC: LowProfile create (amount = card_charge)
  CC->>WH: verified webhook
  WH->>DB: finalizePaidOrder
  Note over DB: split_executions claim row; stock--; no bank payout yet
  DB-->>U: receipt; supplier notify (internal outbox)
```

### 1.5 Sequence: returning user with saved token

```mermaid
sequenceDiagram
  actor U as User
  participant UI as Checkout
  participant SA as chargeWithToken
  participant CC as Cardcom ChargeToken
  participant DB as Postgres

  U->>UI: שלם with default token_id
  UI->>SA: chargeWithToken(client_ref, token_id, ...)
  SA->>DB: same snapshot path as beginCheckout; kind=token_charge
  SA->>CC: ChargeToken (amount = card_charge)
  alt ResponseCode = 0
    SA->>DB: finalizePaidOrder (same as webhook)
    SA-->>UI: payment_status=succeeded
  else declined
    SA->>DB: payment failed; order stays pending
    SA-->>UI: PAYMENT_DECLINED
  end
  Note over SA,DB: Late IndicatorUrl for same txn is UNIQUE no-op
```

---

## 2. Cardcom specifics

### 2.1 Low Profile vs Transactions API

| Option | Use? | Why |
|---|---|---|
| **Low Profile** (`/Interface/LowProfile.aspx`) | **Yes** (browser checkout) | Hosted page / iframe; PAN never touches our origin → **PCI SAQ-A**. Hebrew UI, 3DS handled by Cardcom. Matches MASTER D-PSP |
| **ChargeToken** (`/Interface/ChargeToken.aspx`) | **Yes** (returning users) | Server-side charge with token from prior Low Profile `ChargeAndCreateToken`. Still no PAN on KE |
| **Transactions / Direct API** (card fields posted to us) | **No** for storefront | Would force SAQ-D / higher PCI; no benefit for marketplace MVP |
| **Multi-Account split at charge** | **No** | MASTER D-MONEY-3: physical supplier paid via `payout_statements` after `delivered+14d` |

**Create operation flags:**

- First charge / save card: `Operation=ChargeAndCreateToken` (or equivalent SaveToken path).
- Charge only: `Operation=ChargeOnly`.
- Returning: skip Low Profile; call ChargeToken with stored `payment_tokens.cardcom_token`.

### 2.2 Token creation and reuse

1. `beginCheckout({ save_card: true })` → Low Profile with token create.
2. On verified success, webhook / GetLpResult returns `Token`, last4, brand, expiry month/year.
3. Service role inserts `payment_tokens` (raw `cardcom_token` column **revoked** from browser roles). One default token per user (app rule).
4. Next checkout: `chargeWithToken({ token_id })` reads token server-side only.
5. Token never accepted from client body as a raw Cardcom string; only our `token_id` UUID owned by the user.
6. Soft-delete / mark inactive on repeated hard declines or card expiry cron (ops follow-up).

### 2.3 3DS handling

- 3DS challenge runs **entirely on Cardcom hosted page** during Low Profile.
- Our app has no 3DS ACS integration and no frictionless callback beyond IndicatorUrl + redirects.
- Token charges: Cardcom may require 3DS for some issuers. If ChargeToken returns a "must authenticate" style code, **fallback**: create a short-lived Low Profile for that order (same `client_ref` family) and redirect. Do not invent a custom 3DS UI.
- Until redirect completes, payment stays `redirected` / `initiated`; order stays `pending`.

### 2.4 Webhook endpoint contract

```
POST /api/payments/cardcom/webhook
Content-Type: application/x-www-form-urlencoded  (or JSON if Cardcom sends JSON; adapter accepts both)
force-dynamic, no cookies, no CSRF
```

**Logical fields** (zod in §5; Cardcom names vary by casing; adapter normalizes):

| Field | Maps to |
|---|---|
| `LowProfileCode` | `payments.cardcom_low_profile_id` |
| `ResponseCode` | 0 = success candidate |
| `InternalDealNumber` | `payments.cardcom_transaction_id` |
| `ReturnValue` | our `payments.id` correlation |
| `Token` / last4 / brand / validity | optional token persist |
| Signature header or payload MAC | `CARDCOM_WEBHOOK_SECRET` |

**Response policy:** always **200** after the event row is persisted (including bad signature and processing errors). Never teach scanners with 401 after body parse. Reconcile cron recovers unfinished finalize.

### 2.5 Signature verification

1. Parse body into a stable map.
2. Compute HMAC (algorithm pinned in adapter; Cardcom current spec) with `CARDCOM_WEBHOOK_SECRET`.
3. Constant-time compare.
4. **Regardless of result:** INSERT `payment_webhook_events` with `signature_valid`, raw payload, `provider='cardcom'`, `external_event_id`.
5. If invalid: `security_events` critical; return 200; **no** payment/order mutation.
6. If valid: still call **GetLpResult** (or equivalent) server-to-server; trust **only** that response for amount + success (`verified_against_api=true`).

### 2.6 Replay protection

| Layer | Mechanism |
|---|---|
| Event | `payment_webhook_events UNIQUE (provider, external_event_id)` insert-first; conflict → 200 no-op |
| Transaction | `payments.cardcom_transaction_id UNIQUE` |
| Order | `finalizePaidOrder`: `SELECT ... FOR UPDATE` + `paid_at IS NOT NULL` → no-op |
| Wallet / coupons | idempotency keys `order:<id>:spend`, `order:<id>:cashback`; coupon issue unique per `order_item_id` |

`external_event_id` = Cardcom deal/low-profile event id (stable across Cardcom retries). If Cardcom omits a stable id, derive `sha256(low_profile_id || '|' || InternalDealNumber || '|' || ResponseCode)` and document in adapter.

### 2.7 Retry / timeout policy

**Outbound (our → Cardcom):** create Low Profile, GetLpResult, ChargeToken, refund.

| Attempt | Backoff |
|---|---|
| 1 | immediate |
| 2 | 2s |
| 3 | 8s |
| 4 | 32s |
| then | stop; mark provider error; rely on webhook + reconcile |

Timeouts: HTTP client **15s** connect+read per attempt. Total budget ≤ ~60s for beginCheckout create path; on exhaustion return `PAYMENT_PROVIDER_ERROR` and keep order `pending` with payment `failed` or `initiated` (no redirect URL).

**Inbound:** Cardcom retries on non-2xx. We persist-then-200 so Cardcom stops. Incomplete finalize is **our** job via reconcile.

**Reconcile cron** (`*/10`): payments in `redirected` older than 10 minutes → GetLpResult → finalize or mark `failed`. Pending orders past `expires_at` (~30 min) → `cancelled` if still unpaid.

### 2.8 Sandbox vs production config

| Env var | Sandbox | Production |
|---|---|---|
| `CARDCOM_API_BASE_URL` | Cardcom test host (or same host + test terminal) | `https://secure.cardcom.solutions` |
| `CARDCOM_TERMINAL_NUMBER` | test terminal | live terminal |
| `CARDCOM_API_NAME` | test API name | live |
| `CARDCOM_API_PASSWORD` / key | test secret | live secret (rotated) |
| `CARDCOM_WEBHOOK_SECRET` | test HMAC secret | live; rotate with dual-accept window |
| `APP_URL` | ngrok / preview URL for IndicatorUrl | `https://kenyonexpress.co.il` |
| `CHECKOUT_ENABLED` | true in sandbox | true; kill switch for incidents |
| Mock provider | allowed when `CARDCOM_*=` unset in local dev only | **forbidden** in production build (CI grep) |

Webhook URL must be publicly reachable in sandbox (Cardcom cannot hit localhost). Document tunnel in ops runbook.

---

## 3. Order state machine ↔ payment states

### 3.1 Order (`order_status`)

```
pending --PAYMENT_CONFIRMED (finalize)--> paid
pending --EXPIRE|user/admin CANCEL-----> cancelled
paid    --partial line progress--------> partially_fulfilled
paid|partial --all lines terminal------> fulfilled
paid|partial|fulfilled --full refund---> refunded
```

**Illegal:** `cancelled → paid`; browser redirect as PAYMENT_CONFIRMED; client writes to `orders` / `payments`.

### 3.2 Payment (`payment_status`) per attempt row

```
initiated --Low Profile URL created--> redirected
redirected --verified success--------> succeeded
redirected --verified decline--------> failed
initiated|redirected --abandon/expire-> cancelled | failed
succeeded --refund row confirmed-----> refunded (original); new row kind=refund
```

Kinds: `charge` | `token_charge` | `refund`.

### 3.3 Exact transitions on webhook outcomes

After persist + signature check + GetLpResult:

| Verified Cardcom outcome | Payment transition | Order transition | Side effects |
|---|---|---|---|
| Success, amount match | `redirected → succeeded` | `pending → paid` (`paid_at`) | `finalizePaidOrder`: coupons / stock / wallet / token / notify |
| Success, amount mismatch | stay `redirected` (or `failed` + alarm) | stay `pending` | `security_events` + money alarm; **no** finalize |
| Decline (`ResponseCode ≠ 0`) | `redirected → failed` | stay `pending` | failure_code stored; UI shows failed; order may later expire → cancelled |
| Signature invalid | no change | no change | event `signature_valid=false` |
| Replay UNIQUE conflict | no change | no change | 200 |
| Already `paid_at` set | no-op | no-op | 200 |

Token-charge success uses the **same** finalize function without requiring a webhook; a late webhook for the same `cardcom_transaction_id` is a UNIQUE / paid_at no-op.

### 3.4 Failure paths

| Failure | Detection | System behavior | User UX |
|---|---|---|---|
| **Abandoned** (left hosted page) | No success webhook; reconcile at T+10m still open or GetLpResult unpaid; order `expires_at` | payment → `cancelled`/`failed`; order → `cancelled` at expiry | Return to cart; new `client_ref` for retry |
| **Declined** | GetLpResult / ChargeToken non-zero | payment → `failed`; order stays `pending` until expiry or user retries with new attempt | `/checkout/failed`; show generic decline; allow retry |
| **Timeout** (our outbound) | HTTP timeout after retries | payment `failed` or stuck `initiated` without LP id; no charge expected | Error toast; safe retry with **same** `client_ref` if no LP created, else new ref |
| **Partial webhook loss** (charge ok, webhook never arrives) | Reconcile cron GetLpResult | Auto-finalize on verified success | Return page polls; email when paid |
| **Finalize crash after charge** | payment succeeded candidate, `paid_at` null | Reconcile / admin replay `finalizePaidOrder` (idempotent) | "Payment received, completing order" polling state |
| **Wallet-covers-all race** | balance changed between validate and debit | beginCheckout fails `INSUFFICIENT_WALLET`; no Cardcom | Refresh wallet UI |

Abandoned ≠ refund. Nothing captured → cancel pending only.

---

## 4. Idempotency

### 4.1 Client key

- Generated at **"שלם"** click: UUID `client_ref` (crypto.randomUUID).
- Stored in sessionStorage for the checkout attempt so refresh/retry reuses it.
- New cart mutation or explicit "try again" after terminal failure → **new** `client_ref`.

### 4.2 Server dedupe

| Op | Key |
|---|---|
| Low Profile create | `payments.idempotency_key = 'lp:' + client_ref` UNIQUE |
| Token charge | `'tok:' + order_id + ':' + client_ref` UNIQUE |
| Webhook | `(provider, external_event_id)` UNIQUE |
| Finalize | `orders.paid_at` + row lock |
| Wallet spend / cashback | `order:<id>:spend` / `order:<id>:cashback` |
| Refund | `ref:<payment_id>:<n>` |

Replay `beginCheckout` with same `client_ref` + same semantic payload:
- If payment `redirected` and order unexpired → return existing `redirect_url`.
- If order expired → `EXPIRED`.
- If payload differs (wallet, address, cart hash) → `IDEMPOTENT_REPLAY`.

### 4.3 Safe retry UX

1. Double-click Pay: disabled button + same `client_ref` → single payment row.
2. Back from Cardcom without paying: reopen checkout; same `client_ref` reuses LP if still valid; else expire and mint new ref.
3. After decline: new `client_ref`, new payment row; old row stays `failed`.
4. After success webhook while user still on Cardcom: return page polls `getOrderDetail` until `paid`; never call beginCheckout again.
5. Message copy: "אם חויבת ולא רואה הזמנה, אל תשלם שוב. בדוק במייל או פנה לתמיכה" when reconcile is pending.

---

## 5. API routes and contracts

Amounts in **agorot** integers on the wire for new contracts. Display formatting is UI-only.

Shared:

```ts
const uuid = z.string().uuid()
const agorot = z.number().int().nonnegative()
const paymentStatus = z.enum([
  'initiated', 'redirected', 'succeeded', 'failed', 'cancelled', 'refunded',
])
```

### 5.1 Route list

| ID | Surface | Auth | Rate | Purpose |
|---|---|---|---|---|
| D1 | Server Action `beginCheckout` | user | RL1 10/min fail closed | Create order + Low Profile |
| D2 | Server Action `chargeWithToken` | user | RL1 10/min fail closed (shared bucket) | One-click token charge |
| D3 | `POST /api/payments/cardcom/webhook` | HMAC + service | RL3 300/min IP fail open | IndicatorUrl |
| D4 | Server Action `refundPayment` | admin + recent auth 15m | RL0 admin | Card/wallet refund |
| D5 | Server Action `getCheckoutOrder` | user (owner) | RL0 | Return-page poll |
| D6 | `GET /api/cron/payments-reconcile` | `CRON_SECRET` | n/a | Stuck redirected |
| D7 | `GET /api/cron/expire-orders` | `CRON_SECRET` | n/a | Cancel unpaid pending |

### 5.2 Schemas

#### D1 beginCheckout

```ts
export const beginCheckoutInput = z.object({
  client_ref: uuid,
  address_id: uuid.nullable().default(null), // required if any physical line
  apply_wallet_agorot: agorot.default(0),
  accept_terms: z.literal(true),
  save_card: z.boolean().default(true),
})

export const beginCheckoutOutput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('redirect'),
    order_id: uuid,
    payment_id: uuid,
    redirect_url: z.string().url(),
    card_charge_agorot: agorot,
  }),
  z.object({
    kind: z.literal('paid'),
    order_id: uuid,
    payment_id: uuid.nullable(), // null when wallet-covers-all
  }),
])
```

Errors: `UNAUTHENTICATED`, `VALIDATION`, `NOT_FOUND`, `INSUFFICIENT_STOCK`, `INSUFFICIENT_WALLET`, `CONSENT_REQUIRED`, `EXPIRED`, `IDEMPOTENT_REPLAY`, `PAYMENT_PROVIDER_ERROR`, `RATE_LIMITED`, `CHECKOUT_DISABLED`.

#### D2 chargeWithToken

```ts
export const chargeWithTokenInput = beginCheckoutInput
  .omit({ save_card: true })
  .extend({ token_id: uuid })

export const chargeWithTokenOutput = z.object({
  order_id: uuid,
  payment_id: uuid,
  payment_status: z.enum(['succeeded', 'failed']),
  failure_code: z.string().nullable(),
  requires_hosted_auth: z.boolean().default(false),
  redirect_url: z.string().url().nullable(), // set when 3DS fallback Low Profile created
})
```

#### D3 webhook

```ts
export const cardcomWebhookPayload = z
  .object({
    terminalnumber: z.coerce.number(),
    lowprofilecode: z.string().min(1),
    ResponseCode: z.coerce.number(),
    InternalDealNumber: z.coerce.string().optional(),
    ReturnValue: z.string().optional(),
    Token: z.string().optional(),
    CardValidityMonth: z.coerce.number().optional(),
    CardValidityYear: z.coerce.number().optional(),
    Last4CardDigits: z.coerce.string().optional(),
    CardBrand: z.string().optional(),
  })
  .passthrough()

// HTTP response body (minimal)
export const webhookHttpResult = z.object({ ok: z.literal(true) })
```

Auth: not session. HMAC via `CARDCOM_WEBHOOK_SECRET`. Processing uses service role.

#### D4 refundPayment

```ts
export const refundPaymentInput = z.object({
  payment_id: uuid,
  amount_agorot: agorot.nullable().default(null), // null = full remaining
  reason: z.string().trim().min(3).max(500),
  refund_to: z.enum(['card', 'wallet']).default('card'),
})

export const refundPaymentOutput = z.object({
  refund_payment_id: uuid,
  status: paymentStatus,
  refunded_total_agorot: agorot,
})
```

#### D5 getCheckoutOrder (poll)

```ts
export const getCheckoutOrderInput = z.object({ order_id: uuid })

export const getCheckoutOrderOutput = z.object({
  order_id: uuid,
  status: z.enum([
    'pending', 'paid', 'partially_fulfilled', 'fulfilled', 'cancelled', 'refunded',
  ]),
  paid_at: z.string().datetime().nullable(),
  payment_status: paymentStatus.nullable(),
  card_charge_agorot: agorot,
  lines: z.array(z.object({
    product_type: z.enum(['coupon', 'physical']),
    face_value_agorot: agorot,
    paid_on_site_agorot: agorot,
    balance_due_at_business_agorot: agorot,
    platform_percent: z.number().min(0).max(100),
  })),
})
```

#### D6 / D7 cron

```ts
// Authorization: header Authorization: Bearer ${CRON_SECRET}
export const cronOk = z.object({
  ok: z.literal(true),
  processed: z.number().int().nonnegative(),
})
```

### 5.3 Rate limit summary

| Bucket | Limit | Mode | Applies |
|---|---|---|---|
| RL1 `begin_checkout:{user_id}` | 10 / min | fail closed | D1, D2 |
| RL3 `cchook:{ip}` | 300 / min | fail open | D3 |
| RL0 | admin / owner read | n/a | D4, D5 |

---

## 6. Test plan: Cardcom sandbox matrix

Environment: Cardcom test terminal + publicly reachable webhook (tunnel). Mock provider tests cover CI without Cardcom; sandbox matrix is nightly / manual gate before production.

| ID | Scenario | Setup | Expected |
|---|---|---|---|
| S1 | Coupon Low Profile success | Coupon product `platform_percent=15`, face 200 ILS | Charge 30 ILS; order paid; coupon issued; `balance_due` 170; `supplier_due` 0 |
| S2 | Physical Low Profile success | Physical `platform_percent=12`, face 100 ILS | Charge 100; commission snap 12; supplier_due 88; split claim row; no Multi-Account |
| S3 | Mixed cart | Coupon 15% of 200 + physical 100 | Single charge 130; line snapshots independent |
| S4 | Wallet partial | Wallet 20 ILS on 100 physical | Card charge 80; split still on 100 face; wallet key spend once |
| S5 | Wallet covers all | Wallet ≥ total | No Cardcom; immediate paid; finalize once |
| S6 | Token save + reuse | S1 with save_card; then D2 | Token row; second order ChargeToken success; finalize once |
| S7 | Decline | Sandbox decline card | payment failed; order pending→cancelled at expiry; no coupon |
| S8 | Abandon hosted page | Close LP without pay | No paid_at; reconcile/expiry cancels |
| S9 | Webhook replay | POST same event twice | Second 200 no-op; one finalize |
| S10 | Bad HMAC | Flip signature | event stored `signature_valid=false`; no state change |
| S11 | Amount mismatch | Tamper Indicator amount; API says real amount | If API≠payments amount → no finalize + alarm |
| S12 | Lost webhook | Success on Cardcom; drop IndicatorUrl | Reconcile GetLpResult finalizes within one cron cycle |
| S13 | Double pay click | Same client_ref twice | One payment row; same redirect_url |
| S14 | Idempotent payload clash | Same client_ref, different wallet | `IDEMPOTENT_REPLAY` |
| S15 | 3DS challenge | Sandbox card that forces 3DS | Complete on hosted page; webhook finalize |
| S16 | Token 3DS fallback | ChargeToken requires auth | `requires_hosted_auth` + Low Profile redirect; then S1-like |
| S17 | Refund unused coupon | Admin D4 after S1 | Card refund; coupon `issued→refunded`; scan blocked |
| S18 | Refund used coupon | Redeem then refund | `STATE_INVALID` |
| S19 | Expire pending | Wait >30m unpaid | order cancelled; no stock / coupon side effects |
| S20 | Kill switch | `CHECKOUT_ENABLED=false` | D1/D2 refused; in-flight webhook still finalizes |
| S21 | Concurrent webhooks | Parallel duplicate events | One winner finalize; other UNIQUE/paid_at no-op |
| S22 | platform_percent ≠ 10 | Coupon at 25% and 7% | Charges match formula; proves no hardcoded 10% |

CI unit/integration (no live Cardcom): money golden tests (`calculateCommission`), webhook handler with fake GetLpResult, UNIQUE constraint tests, rate-limit fail-closed on D1.

---

## 7. Finalize side effects (reference)

`finalizePaidOrder(order_id)` (service_role only), single writer:

1. Lock order; if `paid_at` set → return.
2. Require verified succeeded payment (or wallet-covers-all) with amount match.
3. Set payment `succeeded`, `cardcom_transaction_id`.
4. Set order `paid` + `paid_at`.
5. Wallet spend / cashback idempotent keys.
6. Coupon lines: issue codes + QR; `item_status=issued`.
7. Physical lines: stock--; `split_executions` claim; notify supplier via **internal** outbox (Trigger / Edge / Resend). No escrow.
8. Persist token if requested.
9. Audit + `order_paid` notification event.

---

## 8. Doc map

| Need | Read |
|---|---|
| Money / no escrow | `MASTER-ARCHITECTURE.md` |
| This pipeline | `CHECKOUT-ARCHITECTURE.md` (here) |
| Security controls | `docs/ARCHITECTURE-SECURITY.md` |
| Legal refunds | `docs/ARCHITECTURE-LEGAL-COMPLIANCE.md` |
| Older checkout draft | `ARCHITECTURE-CHECKOUT-PAYMENT.md` (superseded on conflicts by this file + MASTER) |

End of CHECKOUT-ARCHITECTURE.
