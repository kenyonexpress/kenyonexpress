# ARCHITECTURE-ORDER-STATE-MACHINE.md

Every status in the system, every legal transition, who may cause it, and what
happens at the edges.

Status: BINDING. Branch `docs/architecture-night`, 2026-08-19.
Scope: **docs only.** No `src/`, no existing migration, no SQL executed.
Companion to `ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md` (what writes these states)
and `ARCHITECTURE-REFUNDS-CANCELLATIONS.md` (what unwinds them).
Code this mirrors: `src/server/domain/orders/state-machine.ts`,
`src/server/domain/vouchers/state-machine.ts`,
`supabase/migrations/054_voucher_redemption.sql`.

---

## 0. Four machines, not one

There are four independent lifecycles here, and conflating them is the single
most common source of wrong reasoning about this system.

| Machine | Row | Enum | Who decides |
|---|---|---|---|
| **Payment** | `payments` | `payment_status` | Cardcom, re-verified by us |
| **Settlement** | `order_items.settlement_status` | `settlement_status` | our money logic |
| **Fulfilment** | `order_items.item_status` | `order_item_status` | the supplier, or issuance |
| **Voucher** | `vouchers.status` | `voucher_status` | the scanner at the till |

Plus one **derived** value: `orders.status` (`order_status`), which is a rollup
and never a thing anyone sets directly.

The reason they are separate:

- A physical line can be **paid and settled** while still **unshipped**. Money
  and goods move on different clocks.
- A coupon line is **settled at payment** (100/0) but its voucher stays
  **`issued`** for months. The voucher's life is not the order's life.
- A payment can be **`succeeded`** while the order is still **`pending`**. That
  gap is F9 in the checkout document, the worst state in the system, and it is
  only expressible because the two machines are separate.

---

## 1. Payment: `payment_status`

```
                    (beginCheckout inserts)
                              |
                              v
                        +-----------+
                        | initiated |
                        +-----------+
                          |       |
       LowProfile created |       | token charge declined / LP create failed
                          v       v
                    +------------+    +--------+
                    | redirected |--->| failed |
                    +------------+    +--------+
                          |
        GetLpResult says  |
        success AND the   |
        amount matches    |
                          v
                    +-----------+          refundOrder()          +----------+
                    | succeeded |----------------------------->   | refunded |
                    +-----------+                                 +----------+
```

Legal transitions, exhaustively:

| From | To | Trigger | Guard in code |
|---|---|---|---|
| `initiated` | `redirected` | Low Profile page created and its id stored | - |
| `initiated` | `failed` | `LowProfile.aspx` refused, or a token charge declined | - |
| `redirected` | `succeeded` | `finalizeOrder` after `GetLpResult` verification | `.in('status', ['initiated','redirected'])` |
| `redirected` | `failed` | callback with `ResponseCode != 0`, or `reconcileOrderReturn` verification failure | `.in('status', ['initiated','redirected'])` |
| `succeeded` | `refunded` | `refundOrder` | Cardcom credit or `CancelOnly` succeeded |

Illegal and enforced by the `.in([...])` filters: `succeeded -> failed`,
`failed -> succeeded`, `refunded -> anything`.

The `.in(['initiated','redirected'])` filter on both terminal writes is not
defensive style, it is the idempotency mechanism. A replayed webhook that tried
to re-succeed a `succeeded` payment would update zero rows and, without the
filter, would silently stamp a second `succeeded_at`, which is how a duplicate
`cardcom_transaction_id` gets attached to the wrong deal.

### 1.1 `kind`

`payment_kind` is `charge | refund`. A refund is a **new row**, not a mutation
of the charge row. The charge row's `status` moves to `refunded` as a marker,
but the money movement lives in its own row with its own
`cardcom_transaction_id`. Reconciliation against the terminal depends on that:
a credit is a separate deal number at Cardcom, and a schema that overwrites the
charge cannot match it.

---

## 2. Settlement: `order_items.settlement_status`

This is the money machine. Source of truth: `src/server/domain/orders/state-machine.ts`.

```
                +---------+
                | pending |
                +---------+
                  |     |
  PAYMENT_        |     |  CANCEL
  CONFIRMED       |     v
                  |  +-----------+
                  |  | cancelled |  (terminal)
                  |  +-----------+
                  v
                +------+
                | paid |
                +------+
                  |    \
    EXECUTE_SPLIT |     \ REFUND
                  v      v
        +----------------+   +----------+
        | split_executed |-->| refunded |  (terminal)
        +----------------+   +----------+
              REFUND
```

### 2.1 The live enum vs. the reachable states

`settlement_status` in the database has **nine** values:

```
pending | paid | split_executed | escrow_held | escrow_released
        | redeemed | refunded | cancelled | platform_settled
```

The state machine in code declares **six**, and that is the binding set:

```
pending | paid | split_executed | redeemed | refunded | cancelled
```

The other three are dead, for three different reasons, and the distinction
matters when reading old rows:

| Value | Why it is dead |
|---|---|
| `escrow_held`, `escrow_released` | The Escrow model is **abolished**. A coupon prepayment is never held for the supplier. Nothing writes these and nothing may. |
| `platform_settled` | Written by the abolished C11(a) rule. Kept **exitable** so such a row could still be unwound, with **no event leading into it**. Zero rows carry it. |
| `redeemed` | The pre-voucher `coupon_codes` model recorded consumption on the *line*. Consumption now lives on the *voucher*. Terminal. |

**Known documentation defect, recorded rather than fixed here:** the docstring
at the top of `src/server/domain/orders/state-machine.ts` still describes the
Escrow happy path ("coupon: pending -> paid -> escrow_held -> escrow_released")
while the `TRANSITIONS` table immediately below it contains no such states and
the type does not include them. The **code is right and the comment is stale.**
This file does not edit `src/`; the correction is listed in
`MASTER-ARCHITECTURE-v3.md` as a queued code change.

### 2.2 Coupon and physical share `split_executed`

They share the state because the *event* is the same one: the split happened.
Only the percentages differ.

| Line type | `commission_agorot` | `supplier_immediate_agorot` |
|---|---|---|
| physical | `round_half_up(paid_on_site * platform_percent / 100)` | `paid_on_site - commission` |
| coupon | `paid_on_site` (the whole charge) | `0` |

The coupon line settles **the moment it is paid**. Everything charged online is
the platform's, nothing is deferred, and **scanning the voucher moves no money.**
That last clause is the entire reason there is no state between `paid` and
`split_executed` for coupons.

### 2.3 The rounding rule

The platform fee is rounded **once**, half-up, in integer arithmetic
(`divRoundHalfUp` in `src/lib/money.ts`, using the `×2` trick so there is no
float division anywhere). The supplier receives the **remainder**, computed by
subtraction.

```
commission = divRoundHalfUp(paid_on_site * platform_percent_bp, 10000)
supplier   = paid_on_site - commission          # never rounded independently
```

Rounding both sides independently is how an agora gets invented or lost. There
is exactly one rounding operation per line, and the invariant
`commission + supplier == paid_on_site` holds by construction rather than by
test.

---

## 3. Fulfilment: `order_items.item_status`

```
                     +---------+
                     | pending |
                     +---------+
                     /    |     \
     coupon finalize/     |      \ CANCEL
                   /      | supplier marks shipped
                  v       v        v
            +--------+  +---------+  +-----------+
            | issued |  | shipped |  | cancelled |
            +--------+  +---------+  +-----------+
                 |           |
                 |           v
                 |     +-----------+
                 |     | delivered |
                 |     +-----------+
                 |           |
                 +-----+-----+
                       v
                  +----------+
                  | refunded |
                  +----------+
```

| From | To | Who | Notes |
|---|---|---|---|
| `pending` | `issued` | system (`finalizeOrder`) | coupon lines only, at payment |
| `pending` | `shipped` | supplier member (`owner`/`manager`) | physical only |
| `shipped` | `delivered` | supplier member, or carrier webhook when one exists | physical only |
| `pending` | `cancelled` | customer (before payment), admin | |
| any non-terminal | `refunded` | admin, or `refundOrder` | mirrors the settlement `REFUND` |

**`delivered` is a fulfilment signal, not a money gate.** It does not release
anything, because nothing is held. Anyone reasoning about "release on delivery"
is reasoning about the abolished Escrow model.

A **service** line (`product_type = 'service'`) follows the coupon shape: it is
issued as a voucher and redeemed by scan. It is not a third machine.

---

## 4. Voucher: `vouchers.status`

Source: `src/server/domain/vouchers/state-machine.ts`. The SQL in
`supabase/migrations/054_voucher_redemption.sql` mirrors it and is **the arbiter
under concurrency**; the TypeScript module is the arbiter of what is legal.

```
                          +--------+
                          | issued |
                          +--------+
                          /  |   |  \
                  REDEEM /   |   |   \ REFUND
      guard: right       /   |   |    \
      supplier AND      /    |   | CANCEL
      before expiry    v     |   v     v
            +----------+     | +-----------+  +----------+
            | redeemed |     | | cancelled |  | refunded |
            +----------+     | +-----------+  +----------+
                             | EXPIRE
                             | guard: now >= expires_at
                             v
                        +---------+
                        | expired |
                        +---------+
```

**Every non-`issued` state is terminal.** No exceptions, no un-expire, no
un-redeem. The reason is economic, not stylistic: once a voucher leaves
`issued` there is nothing left to move. Either the value was consumed at the
business, or the money went back to the customer.

### 4.1 The two guards

| Event | Guard | Failure code |
|---|---|---|
| `REDEEM` | `actingSupplierId === voucher.supplierId` | `WRONG_SUPPLIER` |
| `REDEEM` | `now < expires_at` | `PAST_EXPIRY` |
| `EXPIRE` | `now >= expires_at` | `NOT_YET_EXPIRED` |

`canTransition` **refuses a guarded event when no context is supplied.** Not
"assume allowed": every guarded event here burns or voids money, so absent
information is a refusal.

### 4.2 Scan outcomes are a first-class enum

`voucher_scan_outcome` has eleven values:

```
success | already_redeemed | expired | cancelled | refunded | wrong_supplier
        | not_found | invalid_signature | invalid_request | unauthorized
        | rate_limited
```

Every scan writes one, through `log_voucher_scan`, **including the failures**.
A forged QR is `invalid_signature`, not a generic 400. This is what makes
"someone is probing our vouchers" a countable event rather than a hunch, and it
is the input to the fraud rate-limiting in
`ARCHITECTURE-SECURITY-HARDENING.md`.

### 4.3 Expiry

Two clocks, and the **earlier one wins**:

```
expires_at = min(issued_at + products.coupon_expiry_days,  products.offer_valid_until)
```

`offer_valid_until` is copied onto the voucher at issuance rather than joined at
read time, because the product's offer window may be edited afterwards and a
voucher's expiry must not move under the customer's feet. Consumer protection
requires the expiry to be **shown**, and shown consistently across the PDP, the
voucher, and the email.

`/api/cron/expire-vouchers` moves `issued -> expired` on schedule. The `EXPIRE`
guard means a premature run is a no-op rather than a mass void.

---

## 5. Order rollup: `orders.status`

Nobody sets this by hand. `deriveOrderStatus(lineStates)` computes it:

```
some line pending        -> pending
some line paid           -> paid
some line redeemed       -> redeemed        (legacy lines only)
all cancelled            -> cancelled
all refunded/cancelled   -> refunded
otherwise                -> split_executed
```

Read as a sentence: **the order shows its least-advanced active line; once every
line is settled, the dominant settlement outcome wins.**

`order_status` in the database is a different enum
(`pending | paid | partially_fulfilled | fulfilled | cancelled | refunded`),
which is the **customer-facing** rollup and rolls up `item_status`, not
settlement:

```
all items issued/delivered   -> fulfilled
some but not all             -> partially_fulfilled
```

Two rollups, deliberately: the customer asks "has my stuff arrived", finance
asks "has the money moved", and one column cannot answer both without lying to
one of them.

`orders.paid_at` is the **idempotency marker**, separate from `status`. It is
the first thing `finalizeOrder` checks, and it is what makes replay safe.

---

## 6. Authorization: who may cause which transition

`current_user_role()` returns the `user_role` enum:
`customer | content_uploader | vendor | admin | super_admin | support`.
Supplier membership is separate, in `supplier_members` with
`supplier_member_role = owner | manager | scanner`.

| Transition | customer | supplier `scanner` | supplier `manager`/`owner` | support | admin / super_admin | system |
|---|---|---|---|---|---|---|
| create order (`pending`) | own only | - | - | - | - | - |
| `pending -> cancelled` (pre-payment) | own only | - | - | ✔ | ✔ | expiry cron |
| payment `initiated -> redirected` | - | - | - | - | - | ✔ only |
| payment `-> succeeded` | - | - | - | - | - | ✔ only |
| payment `-> failed` | - | - | - | - | - | ✔ only |
| settlement `paid -> split_executed` | - | - | - | - | - | ✔ only |
| item `-> shipped` / `-> delivered` | - | - | own supplier's lines | - | ✔ | carrier webhook |
| voucher `issued -> redeemed` | **no** | **own supplier only** | own supplier only | - | - | - |
| voucher `-> expired` | - | - | - | - | - | cron only |
| voucher `-> cancelled` / `-> refunded` | request only | - | - | ✔ | ✔ | refund flow |
| settlement `-> refunded` | request only | - | - | ✔ (within policy) | ✔ | refund flow |
| anything on another user's order | **never** | **never** | **never** | read-only | ✔ | - |

Three rules underneath that table:

1. **The customer never causes a money transition directly.** They cause
   *requests*. `beginCheckout` is a request to charge; a cancellation is a
   request to refund. The system decides.
2. **A `scanner` can redeem and nothing else.** That is the whole role. A
   scanner device is left on a counter, and the blast radius of a stolen phone
   is bounded by the role, not by the PIN.
3. **`support` reads everything and writes almost nothing.** The exceptions are
   listed above and every one of them writes an `audit_log` row naming the
   actor.

RLS is by `auth.uid()` and role. **There is no `tenant_id` anywhere in this
schema**, and nothing in this document introduces one.

---

## 7. Edge cases

These are the cases that decide whether the machines above are right.

### 7.1 Cancellation after a scan

**Refused, at the voucher level.** `redeemed` is terminal, so `CANCEL` and
`REFUND` are both illegal from it. The customer consumed the value at the
business; the platform cannot un-consume it, and the business has already given
the goods.

The remedy, when one is warranted, is a **wallet credit**, which is a different
money movement entirely and does not touch the voucher row. It is recorded in
`wallet_entries` with `wallet_tx_source = 'manual'` and an `audit_log` row
naming the operator. The wallet is internal, so the credit buys goods here and
never leaves as cash.

### 7.2 Partial refund

Two distinct shapes, and they are not the same operation:

**(a) Line-level partial.** A three-line order where one line is returned. Each
line transitions on its own. `deriveOrderStatus` then reports `split_executed`
for the order, because a partially refunded order is not a refunded order.

**(b) Amount-level partial.** `planRefund` takes `partialAmountAgorot`. When it
is set, **no cancellation fee is applied** (charging a 5% fee on a goodwill
partial is not what the fee is for). The line stays where it is; the payment
gets a `refund`-kind row for the partial amount. There is no `partially_refunded`
status and there deliberately will not be one: the amount lives in the refund
rows, which sum, and a status that says "partially" cannot say how much.

### 7.3 Double payment for one order

Possible whenever the customer opens two tabs. Defence in three layers:

1. `payments.idempotency_key` is unique, so the *same* attempt cannot duplicate.
2. A *different* attempt (different amount, new ordinal) creates a second
   `payments` row. `finalizeOrder` closes the order on whichever verifies first;
   the second finds `order.paid_at` set and returns `{ok: true, replay: true}`
   **without touching money**.
3. The second charge is then real money with no order behind it. It is caught by
   the daily terminal reconciliation as `missing_locally`, alarms, and is
   refunded through the normal refund path with `isDefectClaim = true`, so **no
   cancellation fee is charged** (the customer did nothing wrong).

Layer 3 is the honest part: the system cannot prevent Cardcom from accepting two
charges. It can guarantee that the second one never becomes a second order, and
that it surfaces within a day.

### 7.4 The webhook and the return page finalize simultaneously

Deliberate, not a bug. Both call `finalizeOrder`. It re-reads `orders.paid_at`
before doing anything and every downstream write is conditional
(`.in([...])` filters, voucher uniqueness on `(order_item_id, unit_ordinal)`).
One wins, the other reports `replay: true`, and both render the same page.

A lock would be worse: it would turn a self-healing race into a timeout, and the
loser would have to guess whether the winner succeeded.

### 7.5 Charged, verified, `finalizeOrder` throws

The worst state. `processed_at` stays `NULL`, an unconditional
`capturePaymentAlarm` fires, and the row sits in the dead-letter queue that
`src/server/payments/webhook-dlq.ts` replays. Because `finalizeOrder` is
idempotent, replay is safe an unbounded number of times.

### 7.6 Voucher expires between issuance and scan

`REDEEM` fails the `PAST_EXPIRY` guard and the scan is logged as `expired`. The
customer paid `coupon_price` for value they did not take. Whether that is
refundable is a **policy** question answered in
`ARCHITECTURE-REFUNDS-CANCELLATIONS.md`, not a state-machine question: the
machine's job is to make the expired voucher unusable and the event visible.

### 7.7 Supplier is deleted while a voucher is outstanding

`suppliers` is soft-deleted (`deleted_at`). It is never hard-deleted while any
voucher references it, because the voucher's `supplier_id` guard is what makes
`WRONG_SUPPLIER` meaningful. The identity the *customer* sees comes from the
snapshot on `order_items` (`supplier_name`, `supplier_phone`, `supplier_address`,
`supplier_logo_url`), so the order keeps naming the business correctly even
after the live row changes.

### 7.8 Product edited after purchase

Irrelevant to every machine above, by construction. Percentages, prices, supplier
identity and the offer window are all **snapshotted at order creation**. Nothing
in the lifecycle reads `products` for money after that point. `finalizeOrder`
does read `coupon_expiry_days` and `offer_valid_until` at finalize time, which is
a **deliberate and narrow** exception: the voucher's expiry is set once, there,
and is immutable from then on.

### 7.9 An order with zero items

`finalizeOrder` returns `{ok: false, code: 'STATE_INVALID'}` and refuses. An
empty order that reached payment is a bug upstream, and closing it would hide
the bug behind a charged card.

---

## 8. Audit trail: append-only, and what that actually requires

### 8.1 What exists today

`audit_log`, with `audit_action`:

```
created | updated | deleted | restored | login | logout
        | permission_change | status_change | manual_override
```

Columns: `actor_id`, `actor_role`, `entity_type`, `entity_id`, `changes`,
`metadata`. Written by admin mutations, by the amount-mismatch alarm in the
webhook, and by manual overrides.

### 8.2 The three gaps

1. **It is append-only by convention, not by construction.** Nothing stops an
   `UPDATE`. A trail that can be edited is not a trail.
2. **System transitions are under-recorded.** The most consequential
   transitions in this document (`-> succeeded`, `-> split_executed`,
   `-> redeemed`) have no actor and are only inferable from timestamps on the
   row itself. When the row is later corrected, the history is gone.
3. **`audit_action` is a closed enum of human actions.** Payment lifecycle
   events are neither human nor closed. This is exactly why
   `payment_events` (draft `migrations/pending/120_payment_events.sql`) is a
   separate table rather than a widening of this enum.

### 8.3 The rule going forward

Every transition in this document falls into exactly one of three bins:

| Bin | Recorded in | Actor |
|---|---|---|
| money lifecycle | `payment_events` (draft 120) | system or operator |
| voucher scan | `voucher_redemptions` + `log_voucher_scan` | scanning member |
| human decision | `audit_log` | always a named `actor_id` |

And one non-negotiable: **append-only is enforced by a `BEFORE UPDATE OR DELETE`
trigger, not by discipline.** Draft 120 shows the pattern; the same trigger
belongs on `audit_log`, and that change is queued in
`MASTER-ARCHITECTURE-v3.md` rather than made here.

### 8.4 What must never be written to any trail

- Card numbers, CVV, expiry beyond the `last_4`/`brand`/`month`/`year` already
  on `payment_tokens`. PCI scope is the token and nothing else.
- The raw `qr_payload` of a voucher in a log line. It is a bearer credential.
- `VOUCHER_QR_SECRET`, `CARDCOM_API_PASSWORD`, `CARDCOM_WEBHOOK_SECRET`, or any
  value derived from them.
- The full webhook body in an error message. It is journalled in
  `payment_webhook_events.payload`, which is service-key only, and that is the
  one place it belongs.

---

## 9. Invariants, stated so they can be tested

1. `commission_agorot + supplier_immediate_agorot == paid_on_site_agorot`, per line, exactly, in integers.
2. `platform_percent + supplier_split_percent == 100`, enforced by a DB CHECK.
3. For a coupon line: `supplier_immediate_agorot == 0` and `commission_agorot == paid_on_site_agorot`.
4. For a coupon line: `face_value_agorot - paid_on_site_agorot == balance_due_agorot`, and it is disclosed before payment.
5. `sum(vouchers.coupon_price_agorot) == order_items.paid_on_site_agorot`, per line.
6. A voucher's `expires_at` never changes after issuance.
7. No row ever leaves a terminal state, in any of the four machines.
8. `orders.paid_at` is set at most once.
9. Every `settlement_status` transition has a corresponding `payments` row in a consistent state; the reverse is not required (a `succeeded` payment with an unsettled line is F9, which is detectable precisely because it is possible).
10. No money value anywhere is a float. Ever.
