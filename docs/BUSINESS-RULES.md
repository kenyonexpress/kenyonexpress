# Business Rules

Every rule this system actually enforces, in plain language, with the file and
line that enforces it.

**The test of a rule on this page is that something refuses.** A rule the code
merely follows by habit is a convention, and conventions are in
`docs/DECISIONS.md`. A rule here has a `throw`, a CHECK constraint, a trigger, a
`WHERE` clause, or a type that will not admit the wrong value. Where a rule is
stated in a document but nothing enforces it, that is said so explicitly and it
is §10.

Line numbers were read on **2026-09-01** against `main`. They drift; the
function names do not. Database constraints were read out of the live project
`ixvwfbuvfxxsjiywhbbb`, not from migration files.

---

## 1. Money

### 1.1 Money is an integer number of agorot. Always.

1 ₪ = 100 agorot. Every internal amount is an integer in that minor unit, which
is also the scale Cardcom expects, so nothing is converted at the boundary.

**No float ever touches a money value.** Not in a multiplication, not in a
rounding step, not in an intermediate. The reason is not purity: a float
multiply gives a different last agora depending on the order of operations, and
the platform's half of a split and the supplier's half then disagree by one
agora on a number nobody can reproduce.

| Enforced by | Where |
|---|---|
| A branded `Agorot` type that a plain number cannot satisfy | `src/lib/commerce/money.ts` |
| `assertSafeInteger` on every operand and every intermediate | `src/lib/money.ts:99-107` (`divRoundHalfUp`) |
| One rounding primitive for the whole app | `src/lib/money.ts:99` |

```ts
// src/lib/money.ts:99 — integer half-up, the ×2 trick, no float anywhere
const scaled = 2 * abs + denominator
return sign * Math.floor(scaled / (2 * denominator))
```

**The rule that makes this checkable:** every money calculation goes through
`src/lib/money.ts`. A `* 0.05` at a call site is a violation even when the
arithmetic is right, because it is a second rounding rule. This has been
enforced retroactively at least once — `computeCancellationFee` was
`Math.round(chargedAgorot * 0.05)` and is now `applyBp(..., bp(500))`
(`src/server/domain/orders/refund.ts:22-32`).

### 1.2 Rates are integer basis points

10% = 1000 bp. 100% = `BP_WHOLE` = 10000 (`src/lib/money.ts:45`).

`applyBp(amount, points)` is **the single multiply-by-rate primitive**
(`src/lib/money.ts:115`), used by commission, cashback and the coupon on-site
fraction alike. It is `round_half_up(amount × bp / 10000)` in integers.

### 1.3 VAT is 18%, defined once, and extracted by subtraction

`VAT_RATE_BP = 1800` at `src/lib/money.ts:65`. One definition for the whole
application.

`extractVat` (`src/lib/money.ts:146`) computes
`net = round_half_up(gross × 10000 / (10000 + rate))` and then **`vat = gross −
net`**. Because VAT is a subtraction rather than a second rounded multiply,
`net + vat = gross` exactly, with no rounding leak.

> This constant was wrong once, and instructively. `money.ts` said 1700 while
> `src/lib/invoices/document.ts` said 18, each with a comment that read correct
> on its own. The rate rose to 18% on 2025-01-01; the invoice module was right.
> There is now one constant and the invoice module derives from it.

**The platform books VAT only on its own commission**, never on the face value
of a deal it did not sell.

### 1.4 Conservation, enforced as CHECK constraints

These cannot be bypassed by any writer, including the service role.

```sql
vouchers_conservation
  face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot

split_executions_conservation
  face_value_agorot = commission_agorot + supplier_agorot

subscription_charges_split_is_exact
  platform_fee_agorot + supplier_due_agorot = amount_agorot

invoices_amounts_add_up
  net_agorot + vat_agorot = total_agorot
```

**The supplier's residual is `face − fee`, never a second percentage applied to
the same base** (`src/lib/commerce/commission.ts:144`). Applying the mirror
percent twice is exactly how two halves come to disagree by one agora.

---

## 2. The coupon model

### 2.1 The customer pays an absolute price, not a percentage

`products.coupon_price_ils` is an amount an admin sets. It is **never** derived
as a fraction of the face value.

```ts
// src/lib/commerce/commission.ts:113-124
if (line.productType === 'coupon') {
  if (line.couponPriceUnit === undefined || line.couponPriceUnit === null) {
    throw new TypeError(`coupon price is required for coupon line ${line.id} (no default exists)`)
  }
  if (line.couponPriceUnit <= 0 || line.couponPriceUnit > line.unitPrice) {
    throw new RangeError(`coupon price for line ${line.id} must be positive and at most the unit price`)
  }
}
```

Two refusals in four lines, and both matter. **No default exists**, so a
misconfigured product fails checkout instead of being priced by a guess. And the
coupon price cannot exceed the face value, so a coupon can never cost more than
the thing it is a coupon for.

### 2.2 The platform keeps the entire on-site payment, permanently

```ts
// src/lib/commerce/commission.ts:143-144
const platformFee = isCoupon ? customerPaysNow : percentageOf(faceValue, platformPercentBps)
const supplierImmediate = isCoupon ? agorot(0) : agorot(faceValue - platformFee)
```

For a coupon: the platform's fee **is** the whole prepayment, and the supplier's
immediate share is **exactly zero**. Not deferred, not held. Zero.

### 2.3 The balance is collected in cash and never reaches us

`balanceDueAtBusiness = faceValue − customerPaysNow`
(`src/lib/commerce/commission.ts:130`). That money is the supplier's revenue,
collected directly from the customer at the counter. It never enters a clearing
account of ours, so it is not ours to hold, split, or refund.

### 2.4 A coupon's reported platform share is 100%, not the product's percent

```ts
// src/lib/commerce/commission.ts:160
platformPercentBps: isCoupon ? 10_000 : platformPercentBps,
```

The product may be configured at 30%. On a coupon line the platform kept 100% of
what the customer paid, and **that** is the number snapshotted downstream.
Reporting the configured percent would describe a split that did not happen.

---

## 3. No escrow

**There is no escrow. No J5, no hold, no deferred release, and no payout to a
supplier on the coupon path.** The entire on-site payment is platform revenue at
the moment of charge.

This rule is enforced in three independent places, which is unusual and
deliberate:

| Layer | Mechanism | Where |
|---|---|---|
| TypeScript | `SettlementState` does not admit `escrow_held`, `escrow_released` or `platform_settled` | `src/server/domain/orders/state-machine.ts:36-42` |
| The state machine | no event leads *into* any of the three | `src/server/domain/orders/state-machine.ts:93-112` |
| **Postgres** | `fn_order_items_settlement_status_guard` has no transition whose destination is `escrow_held` or `escrow_released` | live trigger, migration 137 |

A value the type refuses is a row this code cannot produce. A destination the
guard does not list is a row the *database* refuses, from any writer.

**The outbound edges are kept on purpose.** `escrow_held → escrow_released`,
`→ redeemed` and `→ refunded` are all legal. Two `order_items` rows sit in
`escrow_held` in production from before the 2026-07-24 cutover. A guard that
refused to let them move would not enforce the rule; it would strand the rows,
unredeemable and unrefundable.

`escrow_holds` survives as a table with **2 legacy rows and no writer**.

---

## 4. `platform_percent`

### 4.1 It is per product, mandatory, and has no default anywhere

```ts
// src/lib/commerce/commission.ts:105-109
if (line.platformPercent === undefined || line.platformPercent === null) {
  throw new TypeError(
    `platform percent is required for ${line.productType} line ${line.id} (no default exists)`,
  )
}
```

Required on **both** product types. A physical line is unpriceable without it,
and a coupon product that reached checkout without one was misconfigured in
admin — so refusing beats shipping a silent split.

> `docs/CARDCOM-ARCHITECTURE.md` contains a sketch with
> `commissionPct ?? 5`. That is a historical design document and the default is
> a rule violation. Do not copy it.

### 4.2 It is snapshotted onto the order line at purchase

`buildOrderItemSnapshot` (`src/lib/commerce/product-money.ts:379`) **copies**
the percent onto the `order_items` row. Settlement then reads it from the order
line and **never re-derives it from `products`**.

The invariant has two halves and both are tested in
`src/lib/commerce/platform-percent-snapshot.test.ts`:

1. the snapshot copies rather than references, so repricing the product later
   does not move money already split;
2. the settlement path reads the **order line**, never joining back to the
   source.

The second half is the one that protects the money. A perfect snapshot is
worthless if a later reader joins back to `products` — that would repay every
historical supplier at today's rate.

### 4.3 Refusal is preferred to a missing snapshot

```ts
// src/server/payments/finalize.ts:95
`coupon order item ${item.id} has no platform_percent snapshot; refusing to issue`
```

---

## 5. Checkout

### 5.1 The client sends ids and consent. Never prices.

`src/server/actions/payments/checkout.ts:245-246` states it and
`checkout.ts:362-369` does it: the settlement snapshot is read from the
`products` table by id, server-side. A price arriving from a browser is not
used, because a price arriving from a browser is a number the customer chose.

### 5.2 A physical line priced at zero is refused

```ts
// src/server/actions/payments/checkout.ts:476
if (!(item.unit_price > 0)) { ... }
```

A zero-priced physical product is an admin who saved without a price, not a
giveaway. Refused in two layers: the `priceable` gate in `src/lib/cart/pricing.ts`
first, and this as the backstop.

### 5.3 Stock is reserved with a TTL, and consumed only after payment

`reserve_order_stock` holds stock for **15 minutes**. `consume_order_stock` is
called only from inside `finalizeOrder`, which is to say **only after the
payment has been verified**. A failed payment leaks nothing: the reservation
expires on its own.

### 5.4 Checkout is idempotent on `client_ref`

`idempotencyKey = 'lp:' + input.client_ref` (`checkout.ts:327`). A double click
on "pay" is one payment.

**What this does not catch:** two browser tabs producing two different
`client_ref` values. Both orders are valid and both will settle. The only
defence is the daily reconciliation and a manual refund. This is a known,
measured gap — see §10.

---

## 6. Payment

### 6.1 `finalize.ts` is the only writer of `orders.status = 'paid'`

`src/server/payments/finalize.ts:627`. Nothing else in the codebase may write
that edge. That single-writer property is what makes the webhook safe to replay.

### 6.2 The Cardcom callback body is a notification, never data

Cardcom's legacy `/Interface/*.aspx` API **does not sign its callbacks** — there
is no HMAC header to verify. Authenticity rests on two things:

1. an unguessable secret in the callback URL, compared in constant time against
   **both** the current and the retiring secret, **with no short circuit** —
   returning on the first match would leak which secret was presented through
   response time;
2. a mandatory server-to-server `GetLpResult` re-fetch. **The re-fetched result
   is the only trusted source of amount, status and token.**

`src/app/api/payments/cardcom/webhook/route.ts`.

### 6.3 Journal before acting

Every callback is written to `payment_events` **before** any decision is taken.
Deduplication is on `(provider, external_event_id)`; a `23505` unique violation
means replay, which answers 200 and does nothing.

`payment_events` is **append-only, enforced by the
`payment_events_append_only` trigger** rather than by convention. `UPDATE` and
`DELETE` are refused.

### 6.4 `succeeded` is written from one place after one check

Only from the webhook, only after `GetLpResult`, and only when
`verified.success` **and** the amount matches to the agora. Not from the callback
body, not from the redirect, never from the client.

### 6.5 Every status UPDATE carries a condition on the `from` state

```ts
.update({ status: 'refunded' }).eq('id', order.id).eq('status', 'paid')
```

That `.eq('status', 'paid')` makes the transition a **compare-and-swap**. Two
concurrent refund requests: the first updates one row, the second updates zero.
Without it both would succeed and both would call Cardcom.

### 6.6 Status transitions are enforced by the database

Migration 137 is applied. Three `BEFORE UPDATE ... FOR EACH ROW` triggers refuse
an illegal move with `23514`, naming both ends:

| Trigger | Table |
|---|---|
| `tg_orders_status_guard` | `orders` |
| `tg_order_items_settlement_status_guard` | `order_items` |
| `tg_payments_status_guard` | `payments` |

The permitted tables are in `docs/PAYMENT-FLOW.md` §2.1. A no-op update is
always legal; `INSERT` is not guarded; **`vouchers` is not guarded at all.**

---

## 7. Vouchers

### 7.1 One voucher per purchased unit, capped, and the cap is the replay defence

`finalize.ts:102-127` counts vouchers already issued for the `order_item` and
never issues beyond `quantity`.

**`UNIQUE(code)` cannot help here** — every issue mints a fresh random code, so
a second pass collides with nothing. The count is the only cap that counts,
which is why the read uses `orFail`: a swallowed error would read as "none
issued yet" and mint the full quantity a second time, each one redeemable at a
counter for real goods.

The path where that is likeliest is the one built for failures: `webhook-dlq.ts`
replays a finalize precisely when the first attempt broke, which is when the
database is least healthy.

### 7.2 `coupon_expiry_days` is mandatory. No invented default.

```ts
// src/server/payments/finalize.ts:90
`coupon order item ${item.id}: product has no coupon_expiry_days; refusing to
 issue a voucher with an invented expiry`
```

Ninety days would have been a plausible guess. A guessed expiry on a voucher is
a promise to a customer that nobody made.

### 7.3 Redemption is one atomic UPDATE, and that is the whole defence

```sql
UPDATE public.vouchers v
SET status = 'redeemed', redeemed_at = now(), ...
WHERE v.code = v_code
  AND v.status = 'issued'
  AND v.expires_at > now()
  AND v.supplier_id IN (
    SELECT supplier_id FROM supplier_members WHERE user_id = auth.uid() AND is_active
  )
```

**There is no `SELECT` and then `UPDATE`, because between the two there is a
window.** Two simultaneous scans: Postgres orders them, the first finds `issued`
and updates, the second updates zero rows and falls through to
`already_redeemed`.

Note what the `WHERE` clause carries: single-use, not expired, and **the right
supplier** — all three in the same statement.

### 7.4 Every non-`issued` voucher state is terminal

`issued → redeemed | expired | cancelled | refunded`, and nothing leaves those
four. There is no un-redeem and no reactivation. A voucher that could return to
`issued` is a voucher that can be redeemed twice.

### 7.5 `not_found` and `wrong_supplier` are merged in the response

The internal record in `voucher_redemptions` is precise. The response to the
scanner says `not_found` for both.

**Anti-enumeration.** A supplier who could distinguish "no such code" from
"another business's code" could map a competitor's code space.

### 7.6 Redemption moves no money

`redeem_voucher` does not touch `order_items` at all. The whole prepayment
settled to the platform when the order was paid, and the balance is collected in
cash. The order line is moved to `redeemed` separately by
`src/server/domain/vouchers/mark-order-item-redeemed.ts`, from
`REDEEMABLE_SETTLEMENT_STATUSES = ['platform_settled', 'paid', 'split_executed']`.

**Two writers, two tables.** Any guard has to know both — the first draft of
migration 137 did not, and would have failed every scan after the customer was
already charged.

---

## 8. Refunds and consumer law

### 8.1 A card refund is legal only while every voucher on the line is `issued`

```ts
// src/server/actions/payments/refund.ts
const consumed = input.vouchers.filter(v => v.status === 'redeemed' || v.status === 'expired')
```

Once a voucher is redeemed the value was consumed at the business, and the
supplier has already been paid in cash by the customer. Pulling the money back
off the card leaves the platform short against a business that gave real
service.

**`expired` is blocked on the same line as `redeemed`**, because an expired
voucher is breakage already recognised as revenue. There is a documented legal
tension here: a customer who paid and could not redeem because the business
closed did not consume value. `credit_expired_vouchers()` exists for exactly
that case and credits the **wallet**, not the card.

### 8.2 A goodwill refund after redemption is a wallet credit

A different money movement entirely. It does not touch `vouchers` and it does
not go through `planOrderRefund`. The wallet is internal and does not pay out.

### 8.3 The statutory cancellation fee: the lower of 5% or ₪100

```ts
// src/server/domain/orders/refund.ts:22-32
const CANCELLATION_FEE_CAP_AGOROT = agorot(10_000)   // ₪100
const CANCELLATION_FEE_BP = bp(500)                  // 5%

export function computeCancellationFee(chargedAgorot: number, isDefectClaim: boolean): Agorot {
  if (isDefectClaim || chargedAgorot <= 0) return agorot(0)
  const fivePercent = applyBp(agorot(chargedAgorot), CANCELLATION_FEE_BP)
  return agorot(Math.min(fivePercent, CANCELLATION_FEE_CAP_AGOROT))
}
```

**These are the statute's numbers, not a business choice**, which is why they
are constants rather than settings. Israel's Consumer Protection Law sets the
distance-selling cancellation fee at the lower of 5% of the transaction or ₪100.

**And it is enforced again in the database**, so no code path can exceed it:

```sql
refunds_fee_within_statutory_cap
  CHECK (cancellation_fee_agorot <= LEAST((requested_agorot + 19) / 20, 10000))
```

`(x + 19) / 20` is integer 5%, rounded up, in SQL.

### 8.4 No fee when the fault is ours

```sql
refunds_no_fee_when_our_fault
  CHECK (ground NOT IN ('defect','duplicate_charge') OR cancellation_fee_agorot = 0)
```

Mirrored in the application by the `isDefectClaim` short-circuit in §8.3.

### 8.5 The 14-day refund deadline is derived, not supplied

```sql
-- trigger refunds_due_by_is_derived -> refunds_force_due_by()
NEW.refund_due_by := NEW.requested_at + interval '14 days';
```

The column is **overwritten on every write**. A caller cannot set it, get it
wrong, or extend it. Fourteen days from the request is the statutory window for
returning the money, and it is computed by the database rather than trusted from
a client.

### 8.6 A completed refund must have money and a completion time

```sql
refunds_completed_has_money
  CHECK (state <> 'completed' OR (granted_agorot IS NOT NULL AND completed_at IS NOT NULL))

refunds_decided_has_decider
  CHECK (state NOT IN ('approved','rejected') OR decided_at IS NOT NULL)
```

### 8.7 A partial refund is a new row, not an edit

`payments.status = 'refunded'` is written only on a **full** refund. A partial
refund creates a second `payments` row with `kind = 'refund'`; the original stays
`succeeded` and `orders.status` stays `paid`.

Partial refunds carry **no cancellation fee** — the statutory fee is for
cancelling a transaction, not for adjusting an amount — and `cancelOnly` is
always `false`, because cancelling before transmission is all or nothing.
Vouchers are not touched.

---

## 9. Access

### 9.1 A user cannot change their own role

`enforce_profile_privilege_columns`, a live trigger on `profiles`. Privilege
columns are refused from the user's own session.

**Service-role writes bypass it by design**, which moves the responsibility to
server code. That is a deliberate trade, not an oversight, and it is recorded as
a gap in `docs/SECURITY-POSTURE.md`.

### 9.2 A supplier sees only their own tenant

`supplier_members` with `is_active`, threaded through RLS and through
`current_supplier_id()`. The scan path checks membership inside the redemption
`UPDATE` itself (§7.3) rather than before it.

### 9.3 A product cannot be published without the fields that price it

`enforce_product_approval`, a live trigger on `products`, plus `assertPublishable`
at `src/lib/commerce/product-money.ts:287`. A product missing `platform_percent`,
a coupon price or supplier details cannot reach customers, which is what keeps
§4.1's `throw` from ever firing in front of a real buyer.

### 9.4 Every admin mutation writes an audit row

`writeAuditLog` (`src/lib/admin/audit.ts:42`) is the single helper, and it now
records `ip_address` and `user_agent` as well as the actor. Ten modules under
`src/server/actions/admin/` go through it.

Three paths insert into `audit_log` directly: the Cardcom webhook, `finalize.ts`,
and `refund.ts`. The first two have no human actor to record. **The third
does, and writes `actor_id: null` anyway** (`refund.ts:325`) — see §10.

---

## 10. Rules that are stated but not enforced

Each of these is written down somewhere as a rule, and nothing refuses when it
is broken. They are here so that reading this page does not leave a false
impression of coverage.

| Stated rule | What actually enforces it | The hole |
|---|---|---|
| Voucher states are single-use and terminal | one atomic `UPDATE` in the application | **No database guard on `vouchers`.** 137 covered three tables and not this one. Safe against a race; not against a `service_role` statement. |
| The audit log is evidence | nothing | **`audit_log` accepts `UPDATE` and `DELETE`.** Zero triggers on the table. A log that can be edited is a statement, not evidence. |
| Every money movement names its actor | convention | `refund.ts:325` writes `actor_id: null, actor_role: 'admin'` while `requireAdminSession()` knows exactly who it is. |
| `order_items` money columns are non-negative | nothing | Eight columns with no sign constraint, in a table surrounded by constrained ones. |
| `face = paid_on_site + balance_due` on a line | code and tests | Not a CHECK constraint. `vouchers` has the equivalent; `order_items` does not. |
| One open order per customer | nothing | Two tabs, two `client_ref`s, two real charges. The draft unique index is deliberately unwritten because it would also block a legitimate abandon-and-restart. Decision: measure first. |
| `authenticated` cannot write freely | RLS alone | DML is granted on 56 relations; RLS is the only layer, and **no test attempts a forbidden write as `authenticated`**. |

---

## 11. Where these came from

| Rule area | Read |
|---|---|
| The money math itself | `docs/MONEY-MODEL.md` |
| States and transitions | `docs/PAYMENT-FLOW.md` §2.1 |
| Voucher lifecycle in full | `docs/VOUCHER-LIFECYCLE.md` |
| Roles, RLS, grants | `docs/ROLES-AND-PERMISSIONS.md`, `docs/DB-SECURITY-MODEL.md` |
| Why a rule is the way it is | `docs/DECISIONS.md` |
| What happens when one is violated | `docs/FAILURE-MODES.md` |
