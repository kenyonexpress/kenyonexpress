# ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md

End-to-end checkout, from an anonymous cart to a scannable voucher.

Status: BINDING. Branch `docs/architecture-night`, worktree `/Users/ofir/kenyonexpress-web/ke-arch-night`, cut from `phase5/homepage` on 2026-08-19.
Scope: **docs only.** Not one line of `src/` or of an existing migration is touched by this file. The SQL in §10 is a draft under `migrations/pending/`, never applied.
Supersedes, where they disagree: `docs/ARCHITECTURE-CHECKOUT-CARDCOM.md`, `docs/ARCHITECTURE-CART-CHECKOUT.md`, `CHECKOUT-ARCHITECTURE.md`, `ARCHITECTURE-CHECKOUT-PAYMENT.md`.
Companions: `ARCHITECTURE-ORDER-STATE-MACHINE.md` (§2 of the queue), `ARCHITECTURE-REFUNDS-CANCELLATIONS.md` (§3), `MASTER-ARCHITECTURE-v3.md` (§10).

---

## 0. The binding business model this document implements

Everything below is downstream of these seven sentences. Where an older document
says otherwise, the older document is wrong.

| Rule | Statement |
|---|---|
| Coupon | The admin sets `coupon_price` as an **absolute amount** on the product page. The customer pays that amount **in full, on the site, through Cardcom**. The remainder is collected **at the business, at scan time**, and never enters the platform. |
| Coupon settlement | **100% of the on-site charge stays with the platform.** There is no Escrow, no held balance, no release-on-redeem. |
| Coupon lifetime | After a successful scan the voucher is **permanently spent**. There is no second scan and no partial scan. |
| Physical | Full payment on the site, then an **immediate split** by the per-product `platform_percent`, snapshotted onto `order_items` and immutable thereafter. |
| Money | **Whole agorot, integer only.** No float ever touches a money value, at any layer, including the Cardcom boundary conversion. |
| Checkout | The cart is **open to guests**. Login (Google OAuth) is required **only at the moment of payment**. Contact details and the Cardcom token are stored at that point. |
| Wallet | **Internal only.** Cashback buys goods on this site. It never leaves as cash. |

Two consequences that people keep getting wrong:

1. **`platform_percent` on a coupon line is reporting, not pricing.** The customer
   is never shown it, and no money moves by it. It is snapshotted because the
   report has to survive the product being edited.
2. **A coupon's `face_value` is not revenue.** The platform never holds it. It
   appears on the voucher so the customer and the cashier agree on what the
   voucher is worth at the till.

---

## 1. The flow, end to end

```
  guest browses            no session, no row in `carts` until first add
        |
        v
  add to cart              cookie cart id  ->  `carts` row (user_id NULL)
        |
        v
  /cart, /checkout         still guest. Address form is fillable.
        |
        v
  "Pay"  ------------------ AUTH GATE. Google OAuth. The cart is claimed:
        |                   carts.user_id <- auth.uid()
        v
  beginCheckout()          server action. Validates, prices, snapshots,
        |                   creates `orders` + `order_items` + `payments`,
        |                   reserves stock, calls Cardcom LowProfile.aspx
        v
  Cardcom hosted page      the card never touches our origin
        |
        +---------------------------------+
        |                                 |
        v                                 v
  IndicatorUrl (webhook)            SuccessRedirectUrl (browser)
  POST /api/payments/                GET /checkout/return?order=...
       cardcom/webhook                    |
        |                                 v
        |                          reconcileOrderReturn()
        |                                 |
        +----------------+----------------+
                         |
                         v
                 GetLpResult (server-to-server)   <- THE ONLY TRUSTED SOURCE
                         |
                         v
                  finalizeOrder()                 <- idempotent, single writer
                         |
        +----------------+----------------+
        |                                 |
        v                                 v
  coupon line: issue vouchers      physical line: split_executed
  (one per unit), QR payload,      supplier notified to ship
  settlement_status =
  'split_executed', item 'issued'
                         |
                         v
                 /checkout/return  renders order + QR
                         |
                         v
                 Resend email with the voucher
```

The two arrows into `GetLpResult` are the heart of this design and §4 is about
nothing else.

---

## 2. Guest cart, and the exact moment login becomes mandatory

### 2.1 What exists before login

A guest cart is a real database row. It is not localStorage-only, because a
cart that dies with the tab is a cart that cannot be recovered by the abandoned
cart cron (`src/app/api/cron/abandoned-cart/route.ts`) and cannot be measured.

- `carts` carries a nullable `user_id`. A guest cart has `user_id IS NULL` and
  is addressed by an opaque id in an `httpOnly` cookie.
- `src/app/api/cart/route.ts` is the read/write surface. RLS on `carts` is by
  `auth.uid()`, so the guest path necessarily goes through this route handler
  rather than through the browser's anon client. That is deliberate: after
  migration `111_revoke_anon_writes`, `anon` cannot write to anything.
- `src/app/api/cron/reap-carts/route.ts` deletes abandoned guest carts. A guest
  cart is garbage on a timer; a claimed cart is not.

### 2.2 The gate

Login is required **at Pay, and nowhere earlier**. Concretely, the auth check
lives inside `beginCheckout`, not in a route middleware over `/checkout`.

```
/                     public
/products/[slug]      public
/cart                 public
/checkout             public   <- form renders, address is fillable
beginCheckout()       AUTHENTICATED  <- the gate
```

Why the gate is in the action rather than in middleware: a middleware redirect
on `/checkout` throws away the address the guest just typed, and there is no
honest way to give it back after an OAuth round trip. Putting the gate on the
submit lets the client keep the form state, send the guest to Google, and
resubmit the same payload on return.

### 2.3 Claiming the cart

On successful OAuth callback, in one statement, before anything reads the cart:

```sql
-- pseudo; the real write is server-side with the service key
update public.carts
   set user_id = :uid, updated_at = now()
 where id = :guest_cart_id
   and user_id is null;
```

Guarded by `user_id is null` so a replayed callback cannot steal a cart that
already belongs to somebody. If the user already had a cart, the two are merged
line by line, quantity summed, capped at `products.max_per_order`.

**Guest cart merge is the only place a quantity may silently decrease.** It is
disclosed in the UI ("הכמות הותאמה למגבלת ההזמנה"), because silently charging
for fewer units than the customer chose is the sort of thing consumer protection
law has opinions about.

---

## 3. `beginCheckout`: what is written, in what order, and why

Source of truth: `src/server/actions/payments/checkout.ts`, `runBeginCheckout`.

Order of operations, and every one of these is load-bearing:

1. **Rate limit** (`checkRateLimit`). Checkout is the most expensive endpoint in
   the system; it creates rows and calls a third party.
2. **Auth**. `supabase.auth.getUser()`. No user, no order.
3. **Validate the input** with `beginCheckoutInputSchema` (Zod). Israeli postal
   code is checked by `checkOptionalIsraeliPostalCode`, which is deliberately
   optional: an address without a postal code is deliverable, an address with a
   wrong one is not.
4. **Re-read the cart from the database** and revalidate it (`validateCartView`).
   The client's prices are never trusted, ever. Not once.
5. **Read the products** with the fields settlement needs:
   `type, is_coupon_enabled, supplier_id, platform_percent, supplier_split_percent, discount_percent, coupon_price_ils, cashback_percent`.
6. **Refuse to price an unpublishable line.** A product with a null
   `platform_percent` cannot check out. There is no default and no fallback;
   this is the NON NEGOTIABLE rule in `AGENTS.md` expressed as a runtime gate.
7. **Snapshot the supplier identity** (`supplierIdentityOf`): name, phone,
   address, logo. Copied **by value** onto the order line. An order has to keep
   naming the business it was bought from after that business is renamed or
   moves.
8. **Compute the settlement** (`calculateSettlement`) in agorot, integer only.
9. **Insert `orders`**, `status = 'pending'`, `expires_at = now() + 30 minutes`.
10. **Insert `order_items`** with the full snapshot (§3.1).
11. **Reserve stock** for 15 minutes (`STOCK_RESERVATION_MINUTES`), migration
    `117_stock_reservations`. Shorter than the order expiry on purpose: a hold
    that outlives its sale is stock nobody can buy.
12. **Insert `payments`**, `kind = 'charge'`, `status = 'initiated'`, with the
    idempotency key of §5.
13. **Create the Low Profile page** (`/Interface/LowProfile.aspx`) and store
    `cardcom_low_profile_id` on the payment, flipping it to `'redirected'`.
14. **Redirect** the browser to Cardcom's `Url`.

Steps 9 through 12 are the write set that must not half-exist. See §6.1.

### 3.1 The snapshot, per line

Written once at order creation and **never recomputed**:

| Column | Meaning |
|---|---|
| `product_type` | `coupon` / `physical` / `service`, from `products.type` |
| `platform_percent` | the per-product rate, at purchase time |
| `supplier_split_percent` | its complement; DB CHECK enforces the pair sums to 100 |
| `commission_percent_snapshot` | what the report reads, immutably |
| `unit_price_agorot`, `quantity` | what was charged |
| `paid_on_site_agorot` | the on-site charge for the line |
| `face_value_agorot` | coupon only: what the voucher is worth at the till |
| `balance_due_agorot` | coupon only: `face_value - paid_on_site`, collected at the business |
| `commission_agorot`, `supplier_immediate_agorot` | the split, in agorot |
| `cashback_percent`, `cashback_amount_agorot` | wallet credit earned |
| `supplier_id`, `supplier_name`, `supplier_phone`, `supplier_address`, `supplier_logo_url` | the identity snapshot |

`sum(supplier_immediate_agorot + commission_agorot) == paid_on_site_agorot` for
every line, exactly, in integers. The rounding is done once, on the platform
fee, and the supplier gets the remainder. That is the only ordering that cannot
lose or invent an agora.

For a **coupon** line the split is 100/0 by construction:
`commission_agorot = paid_on_site_agorot`, `supplier_immediate_agorot = 0`.
`platform_percent` is still snapshotted, still for reporting only.

---

## 4. Why the callback body is never believed

Cardcom **does not sign its callbacks.** There is no HMAC, no signature header,
nothing to verify cryptographically. This is stated plainly in
`src/app/api/payments/cardcom/webhook/route.ts` and it drives the entire design.

Authenticity therefore rests on exactly two things, and **never on the POST body**:

1. **An unguessable shared secret in the callback URL** (`?s=`), set by us when
   the Low Profile page is created. Compared in constant time
   (`secretEquals`), against **both** the current and the retiring secret, with
   **no short circuit on first match**: bailing early would make the response
   time say which secret was presented.
2. **Mandatory server-to-server re-verification** through `GetLpResult`. The
   re-fetched result is the **only** trusted source of amount, status and token.

### 4.1 The account is chosen from our row, not from the callback

```
provider = getPaymentProvider(payment.cardcom_account_id)
```

A Low Profile id resolves **only on the terminal that created it**. Asking any
other terminal answers `not_found` for a customer who was genuinely charged.
The account id is therefore read off the stored `payments` row, never off the
callback and never from a default.

The same rule governs token charges: Cardcom will not charge a token on a
terminal other than the one that minted it, and the decline it returns for that
says nothing about why. `chargeSavedToken` picks the provider from
`payment_tokens.cardcom_account_id`.

### 4.2 The amount check

```
expectedAgorot = readAmountAgorot(money, payment)     # normalised from whichever column exists
if verified.amountAgorot != expectedAgorot:
    audit_log.insert(action='manual_override', metadata={alarm:'cardcom_amount_mismatch', ...})
    capturePaymentAlarm(...)
    return 200 {amount_mismatch: true}                # DO NOT finalize
```

The order does not close. A mismatch is either a bug in our pricing or a charge
we did not ask for, and both are worse than a delayed order.

Note `resolvePaymentMoneySchema`. This database is the **pre-059 lineage**: the
money column is `amount_ils`, not `amount_agorot`. Naming the column that does
not exist raises Postgres 42703, which fails the whole select, which made
`payment` come back `null`, which made this route answer
`{ok: true, unknown_payment: true}` with a 200 **for a customer Cardcom had just
charged**. The column is resolved at runtime rather than assumed. Do not
"simplify" that away.

---

## 5. Idempotency, at all four layers

A payment flow has four independent replay sources: the browser (back button,
double submit), Cardcom (webhook retries), our own return page racing the
webhook, and the dead letter replayer. Each gets its own guard.

### 5.1 Layer 1: `payments.idempotency_key`

Set at insert, unique. Derived from the stable facts of the attempt:

```
idempotency_key = sha256(order_id || ':' || amount_agorot || ':' || attempt_ordinal)
```

A double submit of the same cart produces the same key and the second insert is
a `23505` unique violation, which is caught and turned into "you already have a
payment in flight for this order" rather than a second Cardcom page.

### 5.2 Layer 2: `payment_webhook_events`, unique on `(provider, external_event_id)`

The webhook **persists before it thinks**. The very first thing it does after
parsing is insert the journal row:

```
external_event_id = "<lowprofilecode>:<InternalDealNumber or 'na'>"
```

- `23505` on that insert means Cardcom delivered the same event twice. The
  second is a no-op and **200** is the right answer.
- **Any other error is not a replay**, and returning 200 for it is the single
  most expensive bug this route has ever had: the card is charged, `GetLpResult`
  is never called, the order stays open, and the row the dead-letter replayer
  would have replayed was never written, so nothing knows. The route answers
  **503**, and Cardcom retries.

### 5.3 Layer 3: `processed_at`, stamped only after the order closes

`payment_webhook_events.processed_at` stays `NULL` until `finalizeOrder`
succeeds. It used to be stamped one statement earlier, next to
`verified_against_api = true`, which meant the event that most needed replaying,
charged and verified with the order still open, was the one marked handled. The
dead letters were invisible by construction.

`verified_against_api` and `processed_at` are therefore two separate writes,
deliberately, and the gap between them is the dead-letter queue that
`src/server/payments/webhook-dlq.ts` drains.

### 5.4 Layer 4: `finalizeOrder` itself

```
if (order.paid_at)          return { ok: true, replay: true }   # already done
if (order.status !== 'pending') return { ok: false, code: 'STATE_INVALID' }
```

Plus every downstream write is conditional:

- `payments` update carries `.in('status', ['initiated','redirected'])`, so a
  second finalize cannot re-succeed an already-succeeded payment.
- voucher issuance is keyed on `(order_item_id, unit_ordinal)`; see §7.
- the split executes only from a pre-split `settlement_status`.

**The webhook and `/checkout/return` deliberately race.** Both call the same
`finalizeOrder`. Whichever arrives first closes the order; the other gets
`{ok: true, replay: true}` and renders the same page. This is not a defect to be
fixed with a lock. It is the reason a customer whose webhook is delayed still
sees their voucher, and the reason a customer who closes the tab still gets one.

---

## 6. Failure modes, exhaustively

The interesting column is the last one.

| # | What breaks | Symptom | Detection | Recovery |
|---|---|---|---|---|
| F1 | Order rows written, Cardcom `LowProfile.aspx` call fails | No redirect; order `pending` with no payment redirect id | The action returns an error to the user | `expires_at` reaps the order in 30m; stock reservation releases in 15m |
| F2 | Cardcom returns a page, our `payments` insert never commits | Customer is charged for a Low Profile id we hold no payment for | `capturePaymentAlarm('cardcom callback for a payment that does not exist here')`, and the daily terminal reconciliation `missing_locally` hours later | Manual: locate the deal in Cardcom, create the order from the terminal row. This is the one case with no automatic repair, which is why it alarms loudly |
| F3 | Customer abandons the hosted page | Order stays `pending` | `expires_at` | Reaped; stock released |
| F4 | Cardcom declines | `ResponseCode != 0` in the callback | Webhook sets `payments.status='failed'` guarded by `.in(['initiated','redirected'])` | Customer retries; a new payment row, a new idempotency key |
| F5 | Webhook arrives, secret does not match, body parses as Cardcom | Silence, in every other design | `capturePaymentAlarm('cardcom callback rejected: no accepted secret matched')` | Rotate correctly; the two-secret window in `acceptedWebhookSecrets` exists so this never has to happen mid-flight |
| F6 | Webhook arrives, body does not parse | Scanner traffic | `log.warn('cardcom.webhook_unauthenticated')`, row already journalled with `signature_valid: false` | None needed. 200, tells the scanner nothing |
| F7 | Callback says success, `GetLpResult` disagrees | Order does not close | `capturePaymentAlarm('cardcom webhook reported success but GetLpResult did not')` | Manual reconciliation against the terminal |
| F8 | Amount mismatch | Order does not close | audit_log row + alarm | Manual. Never auto-finalize a mismatch |
| F9 | Verified, `finalizeOrder` throws | **The worst state in the system**: card charged, order open | Unconditional alarm; `processed_at` stays NULL | `webhook-dlq.ts` replays it; `finalizeOrder` is idempotent so replay is safe |
| F10 | Webhook never arrives at all | Customer sees "pending" on return | `reconcileOrderReturn` verifies and finalizes from the browser return | Self-healing. If the browser also never returns, `cron/stranded-payments` catches it |
| F11 | Both the webhook and the return finalize concurrently | Double voucher issuance, in a naive design | Not here: §7's uniqueness | The loser gets `replay: true` |
| F12 | Cardcom is down at `beginCheckout` | No page created | Action error | Retry. Nothing was written that needs undoing beyond F1 |
| F13 | Stock sells out between reservation and finalize | Cannot happen: the reservation is the guarantee | `117_stock_reservations` | n/a |
| F14 | Token charge succeeds, `finalizeOrder` throws | Same as F9 but with no webhook to retry | The charge response IS the outcome, so the action captures and alarms inline | `cron/stranded-payments` |

### 6.1 The one transactional gap that remains

Steps 9 to 12 of §3 are four inserts across three tables followed by an
outbound HTTP call. Postgres can make the four atomic; it cannot make the HTTP
call atomic with them. The chosen ordering puts **every one of our rows before
the third-party call**, so the only surviving inconsistency is F1 (rows without
a charge), which expires harmlessly, and never F2 inverted (a charge without
rows), which does not.

F2 remains possible only if the process dies between Cardcom returning a page id
and our storing it. The window is one `update` wide. `payment_events` (§10) is
what shrinks it: the `low_profile_requested` event is written **before** the
outbound call, so even a crash mid-call leaves a trail naming the order.

---

## 7. Voucher issuance and the QR

Source: `issueVouchersForItem` in `src/server/payments/finalize.ts`.

**One voucher per unit.** A line with `quantity = 3` issues three vouchers, not
one voucher for three. A coupon is redeemed at a till by a human with a scanner;
"scan this three times" is not a thing.

Per voucher, written at finalize:

| Column | Source |
|---|---|
| `code` | unguessable, unique |
| `coupon_price_agorot` | the line's `paid_on_site_agorot`, divided per unit by `perUnit()` (integer, remainder to the earlier units) |
| `face_value_agorot` | the till value |
| `remaining_amount_due_agorot` | `face_value - coupon_price`, what the cashier collects |
| `platform_percent` | snapshot, reporting only |
| `expires_at` | `min(now + products.coupon_expiry_days, products.offer_valid_until)` |
| `offer_valid_until` | copied from the product, because §9 requires showing it |
| `qr_payload`, `qr_key_id` | signed payload; the key id is what allows rotation without invalidating old vouchers |
| `status` | `issued` |

`perUnit(total, quantity)` splits an integer total into `quantity` integer parts
whose sum is exactly the total. No float division, no `toFixed`, no drift.

Then the line moves:

```
order_items.settlement_status <- 'split_executed'
order_items.item_status       <- 'issued'
```

`split_executed` on a coupon line means the split happened **at 100/0**. It
shares the enum value with physical lines because the event is the same one; the
percentages differ, not the state.

### 7.1 The QR, and why it is signed

The QR encodes a payload signed with `VOUCHER_QR_SECRET`, carrying `qr_key_id`
so the secret can be rotated. The scanner endpoint
(`src/app/api/supplier/vouchers/redeem/route.ts`) verifies the signature
**before** touching the database, and `voucher_scan_outcome` has a dedicated
`invalid_signature` value so a forged QR is a first-class, countable event
rather than a generic 400.

`redeem_voucher` is a database function, not application code. Redemption is a
single-statement state transition under the database's own concurrency control:
two cashiers scanning the same code at the same instant produce one `redeemed`
and one `already_redeemed`, never two successes.

**After a successful scan the voucher is permanently spent.** `status` becomes
`redeemed`, `redeemed_at` is stamped, and there is no transition back. There is
no partial redemption and no balance carried forward.

---

## 8. The return page

`/checkout/return` calls `reconcileOrderReturn(orderId)`. Its own docstring is
the rule: **"the redirect itself is cosmetic; payment truth comes only from a
server-to-server verify against the provider."**

```
not logged in            -> not_found        (never reveal another user's order)
order.user_id != uid     -> not_found        (same)
order.paid_at            -> paid             (the webhook already won)
order.status != pending  -> failed
no payment row           -> pending          (F2 territory)
payment succeeded        -> paid
payment failed           -> failed
no low_profile_id        -> pending
GetLpResult fails        -> failed, payments.status='failed' guarded by .in([...])
amount mismatch          -> pending, reason 'amount mismatch'   <- never auto-close
finalizeOrder ok         -> paid
```

`pending` renders "התשלום בעיבוד" with a poll, not an error. The distinction
matters: `failed` invites the customer to pay again, and inviting a second
payment for a charge that may have gone through is how a double charge happens.

---

## 9. Consumer-protection surface inside checkout

Israeli distance-selling law is not a footnote here; it changes what the page
must render.

1. **`offer_valid_until` must be shown** wherever the offer is shown: PDP, cart
   line, checkout summary, voucher, and the confirmation email. An offer whose
   expiry is not disclosed is not a valid limited offer.
2. **The till remainder must be disclosed before payment.** The checkout summary
   shows: paid on site (`coupon_price`), value at the business (`face_value`),
   and the balance the customer will pay at the business
   (`remaining_amount_due`). Burying the remainder is the exact misrepresentation
   the law targets.
3. **Cancellation terms are shown before the pay button**, with the 14-day
   window and the 5%-or-₪100 fee stated in numbers. See
   `ARCHITECTURE-REFUNDS-CANCELLATIONS.md`.
4. **`accepted_terms_at`** is stamped on the order. Not a boolean: a timestamp,
   because the question is always "which version, and when".
5. **Supplier identity is shown on every product page and on the checkout
   line.** Name, address, phone. The customer is buying from a named business.

---

## 10. Draft SQL: `payment_events`

**DRAFT. NOT APPLIED. NOT RUN.** File: `migrations/pending/120_payment_events.sql`.

### 10.1 Why a second table when `payment_webhook_events` exists

They answer different questions.

- `payment_webhook_events` answers **"what did Cardcom send us?"** It is an
  inbound journal, one row per delivery, keyed by the provider's event id. It
  exists to deduplicate retries and to hold un-processed deliveries for replay.
- `payment_events` answers **"what did this payment do, in order?"** It is an
  append-only life history of *our* payment, including everything with no
  inbound delivery at all: the Low Profile creation request, a saved-token
  charge (which has no webhook whatsoever), the operator who pressed refund,
  the reconciliation job's verdict.

Today the second question is answered by reading `payments` and inferring from
four nullable timestamps, which cannot express "verified, then finalize failed,
then replayed, then succeeded". F9 is precisely the state that needs that
sentence, and it is the state we most need to reconstruct after the fact.

The table is append-only and carries no money truth. `payments` stays the
authority for status and amount. This is a log, and logs that are also state
end up disagreeing with state.

```sql
-- ============================================================================
-- PENDING 120: payment_events, an append-only life history per payment
-- ============================================================================
-- STATUS: DRAFT, NOT APPLIED. Requires Ofir's explicit approval and MCP
-- apply_migration. Never `db push`.
--
-- MEASURED BEFORE WRITING (2026-08-19, src/types/database.ts, the generated
-- types, which describe production; supabase/migrations/ does not):
--   payments                : exists. amount_ils, wallet_applied_ils
--                             (PRE-059 LINEAGE. There is no amount_agorot.)
--   payment_webhook_events  : exists. (provider, external_event_id) is the
--                             dedup key; processed_at is the DLQ marker.
--   audit_log               : exists, with enum audit_action. Used today for
--                             the amount-mismatch alarm.
--   There is no table named payment_events.
--
-- WHY NOT audit_log: audit_action is a closed enum of human actions
-- (created/updated/deleted/login/...). Payment lifecycle steps are neither
-- human nor closed, and widening that enum would make every audit query
-- filter payment noise out.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The event vocabulary
-- ---------------------------------------------------------------------------
-- A closed enum, not free text: an unknown event type is a bug, and a typo
-- that silently creates a new category makes the log unqueryable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_event_type') THEN
    CREATE TYPE public.payment_event_type AS ENUM (
      'low_profile_requested',   -- BEFORE the outbound call. Shrinks the F2 window.
      'low_profile_created',     -- Cardcom returned a page id
      'low_profile_failed',      -- Cardcom refused to create one
      'redirected',              -- customer sent to the hosted page
      'token_charge_requested',  -- saved-card path; there is no webhook for this
      'token_charge_result',     -- its response IS the outcome
      'callback_received',       -- a webhook body arrived (links the journal row)
      'callback_rejected',       -- secret did not match
      'verify_requested',        -- GetLpResult call
      'verify_succeeded',
      'verify_failed',
      'amount_mismatch',         -- verified amount != our expected amount
      'finalize_started',
      'finalize_succeeded',
      'finalize_failed',         -- F9: the worst state. Expect replays after this.
      'dlq_replay_started',
      'refund_requested',
      'refund_succeeded',
      'refund_failed',
      'reconciliation_matched',
      'reconciliation_missing_locally',
      'reconciliation_missing_remotely'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. The table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nullable ON PURPOSE. 'low_profile_requested' is written before the payment
  -- row's provider fields exist, and an F2 orphan has an order but no usable
  -- payment. A NOT NULL here would drop exactly the rows this table is for.
  payment_id   uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  order_id     uuid REFERENCES public.orders(id)   ON DELETE SET NULL,

  event_type   public.payment_event_type NOT NULL,
  occurred_at  timestamptz NOT NULL DEFAULT now(),

  -- Correlation, so a Cardcom-side investigation can start from either end.
  low_profile_id  text,
  transaction_id  text,

  -- Integer agorot or NULL. NEVER numeric, never a shekel amount: this column
  -- exists so "we asked for X, they charged Y" is greppable, and the whole
  -- point is lost if one of the two is in a different unit. See src/lib/money.ts.
  amount_agorot   bigint,

  -- Free-form context: failure codes, DLQ attempt counts, the actor who
  -- pressed refund. NOT money and NOT status.
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Who caused it. NULL means "the system" (cron, webhook, DLQ).
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Which deployment wrote it. F2's "written against a different deployment"
  -- is unanswerable today.
  environment  text
);

COMMENT ON TABLE public.payment_events IS
  'Append-only life history of a payment. NOT a source of truth for status or amount: payments is. Rows are never updated and never deleted.';
COMMENT ON COLUMN public.payment_events.amount_agorot IS
  'Integer agorot. NEVER shekels, NEVER numeric. Whole-agorot rule, src/lib/money.ts.';

ALTER TABLE public.payment_events
  ADD CONSTRAINT payment_events_amount_is_whole_agorot
  CHECK (amount_agorot IS NULL OR amount_agorot >= 0);

-- A row with neither a payment nor an order cannot be investigated and is
-- therefore not worth storing.
ALTER TABLE public.payment_events
  ADD CONSTRAINT payment_events_has_an_anchor
  CHECK (num_nulls(payment_id, order_id) < 2);

-- ---------------------------------------------------------------------------
-- 3. Append-only, enforced by the database
-- ---------------------------------------------------------------------------
-- A convention that only the application honours is not append-only; it is a
-- hope. A trigger makes it a property.
CREATE OR REPLACE FUNCTION public.payment_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'payment_events is append-only (attempted %)', TG_OP;
END
$$;

DROP TRIGGER IF EXISTS payment_events_no_mutation ON public.payment_events;
CREATE TRIGGER payment_events_no_mutation
  BEFORE UPDATE OR DELETE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.payment_events_append_only();

-- ---------------------------------------------------------------------------
-- 4. Indexes: the three questions actually asked
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS payment_events_payment_idx
  ON public.payment_events (payment_id, occurred_at DESC)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_events_order_idx
  ON public.payment_events (order_id, occurred_at DESC)
  WHERE order_id IS NOT NULL;

-- "Show me every finalize that failed today." Partial, because the failure
-- types are a tiny fraction of the rows and the healthy path must not pay for
-- the index.
CREATE INDEX IF NOT EXISTS payment_events_failures_idx
  ON public.payment_events (occurred_at DESC)
  WHERE event_type IN (
    'low_profile_failed','callback_rejected','verify_failed','amount_mismatch',
    'finalize_failed','refund_failed','reconciliation_missing_locally',
    'reconciliation_missing_remotely'
  );

-- Correlation from the Cardcom side.
CREATE INDEX IF NOT EXISTS payment_events_low_profile_idx
  ON public.payment_events (low_profile_id)
  WHERE low_profile_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
-- No tenant_id anywhere in this schema. Ownership is auth.uid() and role.
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- (SELECT auth.uid()) rather than auth.uid(): the scalar subquery is evaluated
-- once as an InitPlan instead of once per row. This is the same fix commit
-- 0f8359bc applied across the schema; do not write the bare call here.
CREATE POLICY payment_events_owner_read ON public.payment_events
  FOR SELECT TO authenticated
  USING (
    order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_events.order_id
        AND o.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY payment_events_admin_read ON public.payment_events
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin','super_admin','support'));

-- No INSERT policy for any client role. Writes are service-key only, from the
-- server. `anon` gets nothing: 111_revoke_anon_writes is the standing rule.
REVOKE ALL ON public.payment_events FROM anon;
GRANT SELECT ON public.payment_events TO authenticated;

-- ============================================================================
-- VERIFICATION (run after applying, inside a rolled-back DO block)
-- ============================================================================
-- 1. Append-only bites:
--      DO $$ BEGIN
--        INSERT INTO public.payment_events (order_id, event_type)
--          VALUES ((SELECT id FROM public.orders LIMIT 1), 'finalize_started');
--        UPDATE public.payment_events SET detail = '{}'::jsonb
--          WHERE event_type = 'finalize_started';
--        RAISE EXCEPTION 'rollback: the append-only trigger did not fire';
--      END $$;
--    Expect: 'payment_events is append-only (attempted UPDATE)'.
--
-- 2. The anchor constraint bites:
--      INSERT INTO public.payment_events (event_type) VALUES ('verify_failed');
--    Expect: 23514.
--
-- 3. A customer cannot read another customer's events:
--      set role authenticated; -- with a JWT for user A
--      SELECT count(*) FROM public.payment_events
--       WHERE order_id IN (SELECT id FROM public.orders WHERE user_id <> :a);
--    Expect: 0.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS payment_events_no_mutation ON public.payment_events;
--   DROP FUNCTION IF EXISTS public.payment_events_append_only();
--   DROP TABLE IF EXISTS public.payment_events;
--   DROP TYPE IF EXISTS public.payment_event_type;
-- ============================================================================
```

### 10.2 What this migration does NOT do

- **No backfill.** There is no way to reconstruct the ordering of past events
  from four nullable timestamps, and a backfill that guesses is worse than an
  empty table with an honest start date.
- **No change to `payments`.** Status and amount stay exactly where they are.
- **No change to `payment_webhook_events`.** The two coexist;
  `callback_received` carries the journal row's `external_event_id` in `detail`.
- **No column named `amount_ils`.** New money columns are agorot. The pre-059
  columns are untangled by `PENDING-money-integer-fix.sql`, on its own schedule,
  and this file does not add a third spelling to that problem.

---

## 11. Environment variables this flow requires

Without these, checkout does not exist. All eight are listed in `STATE.md` as
blocking launch.

| Variable | Used by | Consequence if missing |
|---|---|---|
| `CARDCOM_TERMINAL_NUMBER` | `loadCardcomAccounts` | no hosted page, no charge |
| `CARDCOM_API_NAME` | same | same |
| `CARDCOM_API_PASSWORD` | refunds, `GetLpResult` | no verification, so nothing ever finalizes |
| `CARDCOM_WEBHOOK_SECRET` | `acceptedWebhookSecrets` | every callback is rejected; §F5 alarms |
| `CARDCOM_API_BASE_URL` | optional | defaults to `https://secure.cardcom.solutions` |
| `VOUCHER_QR_SECRET` | QR signing | no vouchers can be issued or scanned |
| `RESEND_API_KEY` | voucher email | the customer never receives the voucher |
| `CRON_SECRET` | every cron route | stranded payments, expiry and reconciliation all stop |

Rotation of `CARDCOM_WEBHOOK_SECRET` is a **two-value window**:
`acceptedWebhookSecrets` returns both the current and the retiring secret, both
are compared, and the window is closed only after the terminal is confirmed to
be sending the new one. A single-value rotation silently opens every paid order.

---

## 12. What this document deliberately does not specify

- **3-D Secure choreography.** Cardcom's hosted page owns it. From our side it
  is latency inside `LowProfile.aspx`, which is why the stock reservation is 15
  minutes rather than 3.
- **Multi-currency.** `orders.currency` exists and is always `ILS`.
- **Sub-merchant settlement.** Suppliers are paid by payout statement, not as
  Cardcom sub-merchants. That stays true in v1 and is the reason there is no
  Escrow.
- **Installments.** Not offered. When they are, they change `payments`, not this
  flow.
