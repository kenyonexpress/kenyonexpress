# CHECKOUT-COMPLETE

kenyonexpress.co.il. Branch `phase6/complete-architecture`. **Design only. No UI files.**

End-to-end checkout and payment: Cardcom Low Profile, 3DS, the webhook contract, idempotency at every money step, order state wired to payment state, and a sandbox test matrix. Integrates `ARCHITECTURE-CHECKOUT-PAYMENT.md` with the money-integer reality of migrations `046` (runtime) and `051` (agorot conversion), and the ledger posting rules of `LEDGER-DESIGN.md`.

**One-sentence model:** the customer pays on a Cardcom-hosted Low Profile page (or via a saved Cardcom token); our servers never see the PAN; a **verified webhook** (or a synchronous token-charge result) is the only event that may call `checkout_finalize(order_id)`, which flips `paid_at`, issues coupons, posts the ledger journal, moves wallet money, and enqueues fulfillment. Redirect URLs are cosmetic.

---

## 0. Money units in this flow

All amounts are **integer agorot** (1 ₪ = 100 agorot), the same minor-unit scale Cardcom expects. Migration 046 created `payments.amount_ils numeric` and friends; migration 051 converted every one to an integer agorot twin and renamed the old column to `*_legacy`:

| Runtime column (post-051) | Was (046) |
|---|---|
| `payments.amount_agorot` | `amount_ils numeric` |
| `payments.wallet_applied_agorot` | `wallet_applied_ils` |
| `order_items.total_price_agorot`, `platform_fee_agorot`, `supplier_due_agorot`, `charged_on_site_agorot`, `balance_due_at_business_agorot` | `*_ils` |
| `order_items.platform_bp` | `platform_percent numeric` |
| `coupon_codes.face_value_agorot`, `platform_paid_agorot`, `collect_amount_agorot` | `*_ils` |
| `wallet_balances.balance_agorot`, `wallet_entries.amount_agorot` | `balance_ils`, `amount_ils` |

The Cardcom adapter passes `amount_agorot` directly as the minor-unit amount. **No float ever touches the money path.** Code cutover (server actions reading `*_agorot` instead of `*_ils`) is the precondition for applying 051 in production (LEDGER §12).

---

## 1. End-to-end pipeline

```
[CART]  guest browse/add, ids+qty only, no prices
   |
[IDENTITY GATE]  triggered only on "Pay" -> Google OAuth PKCE / email OTP
   |             -> fn_merge_guest_cart(session_id) (advisory lock, cap 99)
   |
[CHECKOUT SESSION]  coupon-only: email + terms
   |                physical: owned address_id required
   |                optional: apply wallet (validate only)
   |                CSRF + rate limit beginCheckout 10/min/user, fail-closed
   |
[ORDER SNAPSHOT]  orders.status=pending, expires_at=now()+30min
   |              order_items snapshot platform_bp + all *_agorot (frozen after paid)
   |              payments.status=initiated, idempotency_key=lp:<client_ref>
   |
   |-- wallet-covers-all? --> checkout_finalize in same server tx (no Cardcom)
   |
[HOSTED PAYMENT]  Cardcom Low Profile CreateAndCharge -> LowProfile URL
   |              payments.status=redirected
   |              customer completes card + 3DS on Cardcom domain (PCI SAQ-A)
   |
   +-- SuccessRedirectUrl -> /checkout/return  (poll only, no writes)
   +-- FailedRedirectUrl  -> /checkout/failed   (poll only, no writes)
   +-- WebHookUrl         -> POST /api/payments/cardcom/webhook
   |
[WEBHOOK HANDLER]  1. persist raw body (payment_attempts + payment_webhook_events)
   |               2. verify HMAC signature
   |               3. server-to-server re-fetch (GetLpResult) amount + status
   |               4. checkout_finalize(order_id)
   |
[ORDER FINALIZED]  paid_at set once; ledger order_paid journal posted
   |               coupon lines -> 8-digit code + Ed25519 QR, item_status=issued
   |               physical lines -> stock--, supplier notify, payout eligibility
   |               wallet spend + cashback (idempotent keys)
   |               receipt email via outbox
```

---

## 2. Order state wired to payment state

The two machines are coupled at exactly one point: **`checkout_finalize` is the only writer that advances both** `payments.status -> succeeded` and `orders.status -> paid` / `paid_at`, atomically.

| Payment event | Payment status | Order effect |
|---|---|---|
| Low Profile URL created | `initiated -> redirected` | order stays `pending`, `expires_at` running |
| Verified webhook / token success | `redirected -> succeeded` | `checkout_finalize`: `pending -> paid`, `paid_at=now()` |
| Decline / abandon + expiry | `redirected -> failed` | order stays `pending` until 30-min cancel cron -> `cancelled` |
| User cancel pre-charge | `-> cancelled` | order `pending` -> cancel cron |
| Refund row confirmed | original `succeeded -> refunded` | refund flow sets `order_items.item_status=refunded`, order `-> refunded` if fully reversed |

**Hard rules:**
- `orders.paid_at IS NULL` until `checkout_finalize` succeeds **exactly once**.
- Browser `SuccessRedirectUrl` **never** mutates order/payment state; the return page polls `getOrderDetail` until `paid`.
- `pending` orders hold no wallet debit, no coupon codes, no stock decrement.

---

## 3. Cardcom Low Profile

### 3.1 Binding decisions

| Topic | Decision |
|---|---|
| PSP | Cardcom only (Israeli). Stripe out of scope (D-PSP). |
| Hosted UI | Low Profile, full redirect (simpler CSP / SAQ-A than iframe). PAN never on our origin. |
| Amount | `payments.amount_agorot` passed as minor units. Never float. |
| Create | Low Profile `CreateAndCharge`-equivalent per current Cardcom API. |
| Token | `SaveToken=true` when `save_card`; token returned on the verified webhook / GetLpResult; stored to `payment_tokens` by service role only. |
| Charge later | `chargeWithToken` server action, `kind=token_charge`, same `checkout_finalize`. |
| Split at Cardcom | **Not used.** Physical supplier share settles via `settlement_batches` after delivery (no Multi-Account at charge). |
| HTTP boundary | Only `src/server/payments/cardcom/*` + the webhook/cron route handlers. Never from client components. |

### 3.2 CreateAndCharge request (logical → Cardcom)

| Field | Source |
|---|---|
| Terminal / API credentials | server env `CARDCOM_TERMINAL`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` |
| Amount | `payments.amount_agorot` (minor units) |
| Currency | ILS |
| `SaveToken` | `beginCheckout.save_card` |
| `SuccessRedirectUrl` | `{APP_URL}/checkout/return?order_id=…` |
| `FailedRedirectUrl` | `{APP_URL}/checkout/failed?order_id=…` |
| `WebHookUrl` | `{APP_URL}/api/payments/cardcom/webhook` |
| ReturnValue / Indicator | `payments.id` (correlation) |
| Description | order number, Hebrew-safe, length-capped |

Response persists: `payments.cardcom_low_profile_id` (UNIQUE), `payments.status=redirected`, and full raw JSON (outbound + inbound) in `payment_attempts`.

### 3.3 3D-Secure (3DS)

3DS is handled **entirely on the Cardcom hosted page** — this is the core SAQ-A benefit. Our design contract:

1. We request the charge; Cardcom decides whether the issuer requires a 3DS challenge and renders it on their domain. We hold no card data and run no ACS iframe ourselves.
2. A 3DS challenge means the customer is on the Cardcom page **longer**; our `expires_at` is 30 min precisely so a slow challenge does not strand the order.
3. The Low Profile **result** (webhook + GetLpResult) carries the 3DS outcome / authentication status; we treat a charge as successful only when the re-fetched result says success. A 3DS-failed or abandoned attempt yields `payments.status=failed`, order stays `pending`.
4. `SuccessRedirectUrl` firing does **not** imply 3DS passed — only the verified server-to-server result does.

### 3.4 Outbound retry

When **we** call Cardcom (create, GetLpResult, refund, token charge):

| Attempt | Backoff |
|---|---|
| 1 | immediate |
| 2 | 2s |
| 3 | 8s |
| 4 | 32s |
| then | give up; mark payment/provider error; rely on webhook + reconcile cron |

Our idempotency keys (`lp:<client_ref>`, `tok:<order_id>:<client_ref>`, `ref:<payment_id>:<n>`) plus Cardcom's own Low Profile id uniqueness prevent duplicate creates on retry.

### 3.5 Kill switch

`CHECKOUT_ENABLED` (server env, default true): `beginCheckout` / `chargeWithToken` refuse **new** attempts when false, but the webhook and `checkout_finalize` for **already-charged** payments keep running (a customer already charged must always be finalized).

---

## 4. Webhook contract

`POST /api/payments/cardcom/webhook` — no cookies, CSRF-exempt, always persist before deciding.

### 4.1 Processing order (mutations only after verification)

```
1. Persist raw body:
     INSERT payment_attempts (direction='inbound', operation='webhook', request_json=<body>)
     INSERT payment_webhook_events (provider='cardcom', external_event_id, payload, signature_valid=?, verified_against_api=false)
2. Verify HMAC (CARDCOM_WEBHOOK_SECRET). Invalid ->
     mark signature_valid=false, INSERT security_events, return 200, change nothing.
     (Never 401: do not teach attackers.)
3. Dedup: UNIQUE (provider, external_event_id). Conflict -> return 200 no-op (replay).
4. Server-to-server re-fetch by low_profile_id (GetLpResult).
     Trust ONLY this response for amount + success. Set verified_against_api=true.
5. Amount check: GetLpResult amount == payments.amount_agorot (integer equality).
     Mismatch -> alarm (v_money_alarms), NO finalize, return 200.
6. checkout_finalize(order_id).  (Idempotent: paid_at already set -> no-op success.)
7. Return 200.
```

### 4.2 Idempotency at every money step

| Money op | Key / guard | Table |
|---|---|---|
| Low Profile create | `lp:<client_ref>` UNIQUE | `payments.idempotency_key` |
| Token charge | `tok:<order_id>:<client_ref>` | `payments.idempotency_key` |
| Webhook processing | `(provider, external_event_id)` UNIQUE | `payment_webhook_events` |
| Payment success dedup | `cardcom_transaction_id` UNIQUE | `payments` |
| Order finalize | `paid_at IS NULL` + `FOR UPDATE` row lock | `orders` |
| Ledger posting | `event_key = order:<id>:paid` UNIQUE | `ledger_journals` |
| Coupon issue | one code per `order_item_id` (UNIQUE) | `coupon_codes` |
| Wallet spend / cashback | `order:<id>:spend` / `order:<id>:cashback` UNIQUE | `wallet_entries.idempotency_key` |
| Refund | `ref:<payment_id>:<n>` | `payments` |
| Generic server replay | `(scope, key)` UNIQUE | `idempotency_keys` (052) |

Cardcom retries the webhook on any non-2xx; we always return **200 after persist** so Cardcom stops. An unfinished finalize is recovered by **our** reconcile cron, never by returning 500 forever.

### 4.3 Webhook response codes

| Situation | HTTP | Body |
|---|---|---|
| Processed / finalized | 200 | `{ok:true}` |
| Replay (dup event) | 200 | `{ok:true, dedup:true}` |
| Bad signature | 200 | `{ok:true}` (logged as security event) |
| Amount mismatch | 200 | `{ok:true}` (alarm raised, no finalize) |
| Malformed body (cannot even persist) | 400 | `{ok:false}` |

---

## 5. `checkout_finalize(order_id)` — single valuable writer

Contract: `SECURITY DEFINER`, `SET search_path=public`, `REVOKE ALL FROM PUBLIC/anon/authenticated`, `GRANT EXECUTE TO service_role`. Callers: verified webhook, synchronous token-charge success, wallet-covers-all in-tx, admin manual re-trigger / reconcile cron (all the same function).

Guard (first statement):
```
SELECT ... FROM orders WHERE id = p_order_id FOR UPDATE;
IF paid_at IS NOT NULL THEN RETURN already_finalized; END IF;   -- pure no-op
-- require a succeeded payment (or wallet-covers-all marker) matching order total
```

Then, in one transaction:
1. Mark payment `succeeded`, set `cardcom_transaction_id`.
2. `orders.status='paid'`, `paid_at=now()`.
3. Post the `order_paid` ledger journal (coupon and/or physical posting rules; sum-zero enforced).
4. Wallet debit if `wallet_applied_agorot > 0` (`fn_wallet_transfer`, key `order:<id>:spend`).
5. Issue coupon codes per coupon `order_item_id` (deterministic, UNIQUE -> retry cannot double-issue) + Ed25519 QR.
6. Decrement stock for physical lines.
7. Cashback if qualified (`order:<id>:cashback`).
8. Save token row if `SaveToken` and no conflicting default.
9. Audit + notification outbox with dedupe keys.

**Cannot double** (guards): order paid (`paid_at`+lock); wallet (entry `idempotency_key` UNIQUE); coupons (per-item UNIQUE); payment success (`cardcom_transaction_id` UNIQUE); webhook (`external_event_id` UNIQUE); ledger (`event_key` UNIQUE); settlement later (`settlement_items.order_item_id` UNIQUE).

---

## 6. Refund flow

| Trigger | Who | When |
|---|---|---|
| Consumer cancel | user requests; **admin executes money move** | within LEGAL windows |
| Admin / goodwill / defect | admin (`refundPayment`, recent re-auth) | support queue |
| Stale pending | cron | `expires_at` ~30 min: `pending -> cancelled`, **not** a card refund |
| Recovery refund | system | card charged but finalize impossible: Cardcom refund + alarm |

Money + state reversal per refunded line: new `payments` row `kind=refund` (`ref:<payment_id>:<n>`) → Cardcom refund API for the card portion → wallet portion returns to wallet only (LEG-10), never to card, unless explicitly consented → `order_items.item_status=refunded` → unused coupons `issued -> refunded` (blocks scan; `used` coupons are `STATE_INVALID` for platform refund) → reverse cashback up to balance → post `refund` reversal journal → if a physical item was already settled `paid`, a negative adjustment lands on the supplier's next batch (paid batches immutable).

The 30-minute timer cancels **unpaid** pending orders only; it never auto-refunds a paid order.

---

## 7. Error recovery

| Failure | User sees | System does |
|---|---|---|
| Network timeout after redirect | "התשלום בבדיקה, נשלח מייל כשיאושר" | return page polls; webhook or reconcile finalizes |
| Webhook delayed | same | Cardcom retries; we 200 after log; reconcile cron polls GetLpResult for `redirected` > 10 min |
| Webhook processing keeps failing | pending until expiry / manual | `v_money_alarms` + admin alert; admin manual trigger after verified GetLpResult |
| Signature-invalid flood | nothing | `security_events` + alarm; no state change |
| Card declined / 3DS failed | failed page | payment `failed`; order pending until 30-min cancel |
| Finalize fails after capture | pending UI + email | auto Cardcom refund + alarm; never a silent capture |
| Wallet race on finalize | support path | second finalize fails balance CHECK; auto-refund the card charge |

Rule: `SuccessRedirectUrl` alone never shows "paid" goods. The UI shows "processing" until `paid_at` is set.

---

## 8. Sandbox test matrix

Runs against Cardcom **sandbox** (nightly) and a **fake adapter** (PR CI — never hits real Cardcom). Fixtures are redacted real sandbox payloads keyed by `external_event_id`.

### 8.1 Webhook (W1–W12)

| # | Scenario | Expected |
|---|---|---|
| W1 | Valid signature, valid amount, first delivery | finalize once, `paid_at` set, journal balanced, coupons issued |
| W2 | Exact replay of W1 | 200 dedup, no second finalize, no second journal |
| W3 | Forged / bad HMAC | 200, `signature_valid=false`, `security_events`, no state change |
| W4 | Valid signature, amount ≠ `amount_agorot` | 200, alarm, no finalize |
| W5 | Out-of-order (success then earlier attempt) | earlier is dedup / no-op |
| W6 | Unknown `order_id` / payment | 200, logged, no finalize |
| W7 | Double finalize (webhook + reconcile race) | second call no-op via `paid_at` lock |
| W8 | `SaveToken=true` present | `payment_tokens` written once (service role) |
| W9 | `SaveToken` absent | no token row |
| W10 | Declined result | payment `failed`, order `pending` |
| W11 | Partial / missing fields in body | persisted; GetLpResult re-fetch is source of truth |
| W12 | Webhook never arrives | reconcile cron polls GetLpResult at 10 min → finalize |

### 8.2 3DS + charge (C1–C6)

| # | Scenario | Expected |
|---|---|---|
| C1 | Card with no 3DS challenge | straight success |
| C2 | 3DS challenge passed | success after challenge, within 30-min window |
| C3 | 3DS challenge failed | `failed`, order stays `pending` |
| C4 | 3DS abandoned (customer leaves) | expiry → `failed`/`cancelled`, order cancel cron |
| C5 | Slow 3DS near expiry | finalize still succeeds if under 30 min; else cancelled + must re-checkout |
| C6 | Wallet-covers-all (no Cardcom) | in-tx finalize, no Low Profile created |

### 8.3 Idempotency + money (M1–M6)

| # | Scenario | Expected |
|---|---|---|
| M1 | `beginCheckout` retried with same `client_ref` | one `payments` row (`lp:` UNIQUE) |
| M2 | Token charge retried | one charge (`tok:` UNIQUE) |
| M3 | Refund issued twice with same `n` | one refund (`ref:` UNIQUE) |
| M4 | Coupon issue on finalize retry | one code per `order_item_id` |
| M5 | Wallet spend + cashback double-fire | one entry each (`order:<id>:spend/cashback`) |
| M6 | Ledger post twice | one journal (`event_key` UNIQUE), still sums to zero (INV-1) |

CI gate: every scenario green **and** all `INVARIANTS.md` queries return zero rows before a checkout release ships.

---

## 9. Component map (implementation, not in this change set)

| Piece | Location |
|---|---|
| `beginCheckout` | `src/server/actions/payments/checkout.ts` |
| `chargeWithToken` | `src/server/actions/payments/token-charge.ts` |
| `refundPayment` | `src/server/actions/payments/refunds.ts` |
| `checkout_finalize` orchestration | `src/lib/checkout/finalize.ts`, `src/server/payments/finalize.ts` |
| Cardcom adapter (+ fake) | `src/server/payments/cardcom/` |
| Webhook | `src/app/api/payments/cardcom/webhook/route.ts` |
| Reconcile cron | `src/app/api/cron/payments-reconcile/route.ts` |
| Replay harness | `tests/integration/cardcom-webhook-replay.*` |

End of CHECKOUT-COMPLETE.
