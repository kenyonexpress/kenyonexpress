# Checkout Foundation Architecture

Status: IMPLEMENTATION BINDING for branch `phase6/checkout-foundation`.
Date: 2026-07-23.
Site: kenyonexpress.co.il (ILS, RTL, Israel).

## Authority

| Document | Role |
|---|---|
| **This file** | Binding for PaymentProvider, Stripe Payment Intents, order lifecycle on this branch |
| `DECISIONS.md` | ADR log for every trade-off made while building |
| `ARCHITECTURE-CHECKOUT-PAYMENT.md` | Prior Cardcom Low Profile design. Still valid for IL Cardcom production path; not the primary rail on this foundation |
| `docs/ARCHITECTURE-COMMERCE.md` | Money/commission/wallet. Settlement/escrow remains a **later** layer above `paid` |
| `docs/ARCHITECTURE-LEGAL-COMPLIANCE.md` §1.6 | VAT inclusive prices; invoice fields |
| `docs/ARCHITECTURE-SECURITY.md` | Webhook forgery, rate limits, PCI |

**Precedence on conflicts inside this foundation:** SECURITY > LEGAL > this file > prior Cardcom checkout docs.

---

## 0. One-sentence model

Checkout creates a `pending` order with server-side ILS + VAT math, starts a Stripe PaymentIntent through a swappable `PaymentProvider`, and only a verified webhook (idempotent) may move the order to `paid`. Fulfillment and refunds are explicit transitions with an append-only audit row each time.

---

## 1. Payment abstraction

### 1.1 Interface (`src/lib/payments/provider.ts`)

```ts
type MoneyILS = { currency: 'ILS'; amountAgorot: number } // integer agorot only

interface PaymentProvider {
  readonly kind: 'stripe' | 'payoneer' | 'cardcom' | 'mock'
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>
  parseAndVerifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedWebhookEvent>
}
```

`CreatePaymentInput` always carries:
- `orderId`, `paymentAttemptId`
- `amount` (ILS agorot)
- `idempotencyKey` (required; format `pi:{paymentAttemptId}`)
- `customerEmail` (optional), `metadata` (order_number, profile_id)
- `successUrl` / `cancelUrl` (hosted or Elements return)

`CreatePaymentResult`:
- `providerPaymentId` (Stripe PI id / future Payoneer id)
- `clientSecret` (Stripe Elements) OR `redirectUrl` (hosted)
- `status`: `requires_action` | `processing` | `succeeded` | `failed`

### 1.2 Implementations

| Kind | Status | Notes |
|---|---|---|
| `stripe` | **Ship now** | PaymentIntents API, webhook signature via `stripe.webhooks.constructEvent` |
| `payoneer` | **Stub** | Throws `ProviderNotImplementedError` on all methods; keeps interface compile-green |
| `cardcom` | Legacy adapter | Existing Low Profile code stays behind the same interface later; not required for foundation green path |
| `mock` | Test | Deterministic PI/webhook for unit tests without network |

Factory: `getPaymentProvider()` reads `PAYMENT_PROVIDER` env (`stripe` | `payoneer` | `mock`). Default in production: `stripe`.

### 1.3 Swappability rule

Application code (`beginCheckout`, webhook route, refund action) MUST depend only on `PaymentProvider`. Never import `stripe` SDK outside `src/lib/payments/stripe/`.

---

## 2. Order state machine

### 2.1 States (order header)

```
cart          // not an order row; guest/auth cart only
   |
   | beginCheckout (server)
   v
pending       // order + payment_attempt created; PI open
   |
   | webhook payment_succeeded (verified, idempotent)
   v
paid
   |
   | admin/supplier fulfill OR auto for digital coupon issue
   v
fulfilled
   |
   | admin refund (full/partial policy in LEGAL)
   v
refunded
```

Also:
- `pending` -> `cancelled` on expiry / user abandon after TTL
- Illegal transitions throw and write **no** audit row

Canonical TS: `src/server/domain/orders/lifecycle.ts`
Canonical SQL enum: `public.order_lifecycle_status`

### 2.2 Persistence

Tables (migration `046_checkout_foundation.sql`):

- `orders` columns: `lifecycle_status`, `currency='ILS'`, `subtotal_agorot`, `vat_agorot`, `total_agorot`, `vat_rate_bps`, `stripe_payment_intent_id`, `paid_at`, `fulfilled_at`, `refunded_at`, `expires_at`
- `payment_attempts`: one row per PI attempt; unique `(provider, provider_payment_id)`; `idempotency_key` UNIQUE
- `order_status_audit`: append-only (`id`, `order_id`, `from_status`, `to_status`, `event`, `actor`, `provider_event_id`, `payload jsonb`, `created_at`)
- `payment_webhook_events`: raw body + signature ok + processed_at; UNIQUE `provider_event_id`

### 2.3 RLS

| Table | anon | authenticated | service_role |
|---|---|---|---|
| `orders` | none | SELECT own (`profile_id = auth.uid()`) | all |
| `payment_attempts` | none | SELECT own via order join | all |
| `order_status_audit` | none | SELECT own via order join | INSERT/all |
| `payment_webhook_events` | none | none | all |

All status writes go through service role in server actions / webhook handlers. Clients never UPDATE lifecycle.

### 2.4 Audit invariant

Every successful `transition(order, event)` MUST insert exactly one `order_status_audit` row in the same DB transaction as the status update.

---

## 3. Stripe rail

### 3.1 Create PaymentIntent

- Amount: `total_agorot` (integer)
- Currency: `ils`
- `automatic_payment_methods: { enabled: true }`
- Metadata: `order_id`, `payment_attempt_id`, `order_number`
- Idempotency-Key header: `pi:{payment_attempt_id}`
- Double-click: unique constraint on `payment_attempts.idempotency_key` + upsert "return existing client_secret if pending"

### 3.2 Webhook

Route: `POST /api/payments/stripe/webhook`

1. Read raw body
2. `constructEvent(body, stripe-signature, STRIPE_WEBHOOK_SECRET)`
3. Insert `payment_webhook_events` with `provider_event_id`; on unique conflict -> **200 OK no-op** (replay safe)
4. Switch:
   - `payment_intent.succeeded` -> `checkout_finalize(order_id)`
   - `payment_intent.payment_failed` -> mark attempt failed (order stays pending until expiry)
   - `charge.refunded` -> lifecycle `refunded` if full
5. Always respond 200 after durable log when signature valid; 400 on bad signature

### 3.3 Finalize (idempotent)

`checkout_finalize(order_id)`:
- Lock order row (`FOR UPDATE`)
- If already `paid|fulfilled|refunded` -> return success (no side effects)
- Else require `pending` + matching paid amount
- Set `paid`, `paid_at`, audit row
- Clear/expire cart
- Enqueue receipt (out of band)

### 3.4 Secrets

Env (server only):
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (client Elements only)
- `PAYMENT_PROVIDER=stripe`

---

## 4. Money: ILS + VAT 18%

### 4.1 Rules

- Currency is always `ILS`. No multi-currency in foundation.
- All money in DB and provider calls: **integer agorot** (`Agorot` branded type).
- Catalog prices are **VAT-inclusive** (Israeli B2C).
- Server-only module: `src/lib/commerce/vat.ts`
  - `VAT_RATE_BPS = 1800` (18.00%)
  - `splitInclusive(totalAgorot)` -> `{ netAgorot, vatAgorot }` using Israeli inclusive formula:
    - `vat = round(total * 18 / 118)`
    - `net = total - vat`
  - Never trust client-sent totals; recompute from cart lines on server.

### 4.2 Order snapshot fields

On `beginCheckout`:
- `subtotal_agorot` = sum of line face (VAT-inclusive)
- `discount_agorot` = wallet/coupon discounts
- `total_agorot` = subtotal - discount ( >= 0 )
- `vat_agorot` = `splitInclusive(total).vatAgorot`
- `vat_rate_bps` = 1800

---

## 5. Failure paths

### 5.1 Double-click protection

- UI: disable Pay button while `beginCheckout` in flight
- Server: UNIQUE `idempotency_key` on `payment_attempts`; second call returns existing PI client_secret
- Stripe Idempotency-Key mirrors the same key

### 5.2 Webhook replay

- UNIQUE `payment_webhook_events.provider_event_id`
- Finalize is status-guarded (only `pending` -> `paid`)
- Replay returns 200 without re-running side effects

### 5.3 Abandoned cart / pending order recovery

Cron: `POST /api/cron/checkout-recovery` (Vercel Cron, `CRON_SECRET`)

Every 15 minutes:
1. Cancel `orders` in `pending` with `expires_at < now()` -> `cancelled` + audit
2. Soft-expire open carts with no activity > 24h and enqueue reminder (reuse notifications draft when present)
3. Log counts to `audit_log` / structured logger

Stripe Test Clocks (integration tests) advance time to assert expiry without waiting.

---

## 6. Module delivery plan

| Module | Deliverable | Verify | Commit message |
|---|---|---|---|
| 0 | `ARCHITECTURE-CHECKOUT.md` + `DECISIONS.md` | docs only | `docs(checkout): foundation architecture + decisions` |
| 1 | Provider interface + Stripe + Payoneer stub + mock | `pnpm type-check` + unit tests | `feat(payments): swappable PaymentProvider with Stripe and Payoneer stub` |
| 2 | Lifecycle machine + migration 046 + RLS + audit | type-check + vitest + SQL idempotent | `feat(orders): lifecycle state machine with audit and RLS` |
| 3 | beginCheckout + Stripe webhook + finalize | type-check + vitest | `feat(payments): Stripe PaymentIntents webhook and finalize` |
| 4 | VAT module wired into pricing snapshot | type-check + vitest | `feat(commerce): server-side ILS VAT 18 percent` |
| 5 | Double-click, replay tests, recovery cron | type-check + vitest | `feat(checkout): failure paths double-click replay abandoned recovery` |
| 6 | Stripe test-clock integration tests | vitest integration (skipped without keys) | `test(payments): Stripe test clocks integration` |

---

## 7. Non-goals (this branch)

- Cardcom Multi-Account split / escrow settlement (exists in parallel domain code; not deleted)
- Payoneer live API
- Multi-currency
- Client-side tax calculation
- Push to production secrets

---

## 8. Open questions

1. Production cutover: keep Cardcom as IL default and Stripe as secondary, or Stripe-only until Cardcom adapter implements `PaymentProvider`?
2. Partial refunds: reduce `total` and stay `fulfilled`, or always full `refunded`?
3. Guest checkout: require Google at Pay (ACCOUNT-IDENTITY) vs email-only for coupon carts?
