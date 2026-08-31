# ARCHITECTURE-REFUNDS-CANCELLATIONS.md

Cancellations and refunds under the Israeli Consumer Protection Law, mapped onto
the four state machines.

Status: BINDING for engineering. **Not legal advice.** Every rule in §1 is
restated from חוק הגנת הצרכן, התשמ"א-1981 and its regulations as understood on
2026-08-19, and every one of them needs a lawyer's signature before launch. §1.6
lists exactly what to ask counsel.
Scope: **docs only.** No `src/`, no existing migration, no SQL executed.
Companions: `ARCHITECTURE-ORDER-STATE-MACHINE.md`, `ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md`.
Code this describes: `src/server/domain/orders/refund.ts`,
`src/server/actions/payments/refund.ts`, `supabase/migrations/106_refund_flow.sql`.

---

## 1. The law, as it applies to this site

KenyonExpress sells at a distance (עסקת מכר מרחוק): the customer never meets the
seller, and the transaction is concluded online. That triggers §14ג of the
Consumer Protection Law.

### 1.1 The cancellation window

| What was sold | Window |
|---|---|
| **Goods** (physical) | 14 days from the day of the transaction **or** from the day the goods were received, **whichever is later** |
| **Service** (including a coupon for a service) | 14 days from the day of the transaction or from the day the disclosure document was received, **and** at least **2 days** (not counting rest days) before the service is due to be provided |
| **Accommodation, travel, leisure with a booked date** | at least **7 days** (not counting rest days) before the booked date |
| Consumer who is a person with a disability, a senior citizen, or a new immigrant | **4 months**, where the transaction involved a conversation (including electronic correspondence), on presentation of proof of status |

Rest days are Israeli rest days. "Not counting rest days" is a real counting
rule and not a rounding convenience; §3.2 specifies how it is computed.

### 1.2 The fee

The business may charge a cancellation fee of **the lower of 5% of the
transaction price or ₪100**. That is exactly what the code does:

```ts
const CANCELLATION_FEE_CAP_AGOROT = 10_000   // ₪100
const CANCELLATION_FEE_RATE = 0.05

computeCancellationFee(chargedAgorot, isDefectClaim) =
  isDefectClaim || chargedAgorot <= 0
    ? 0
    : min(round(chargedAgorot * 0.05), 10_000)
```

`CANCELLATION_FEE_RATE` is one of exactly **two** hardcoded rates the project
permits, and it is allowlisted by name in `scripts/no-hardcoded-fees.mjs`. It is
not a commission. It is set by statute, not by an admin, so the "no fixed
percentage" rule in `AGENTS.md` does not reach it. The other allowlisted value is
`DEFAULT_VAT_PERCENT`.

**The fee is zero in three cases:**

1. Cancellation due to a defect, non-conformity with the disclosure, or the
   business's breach (`isDefectClaim = true`).
2. A **partial** refund (`partialAmountAgorot` set). A goodwill partial is not a
   statutory cancellation and the statutory fee has nothing to do with it.
3. A **same-clearing-day cancellation** (`cancelOnly`). See §2.3.

### 1.3 The refund deadline

The business must return the money **within 14 days** of receiving the
cancellation notice, and must cancel any charge that has not yet been collected.
This is a clock that starts on the customer's notice, not on our decision, which
is why §5's draft table stores the notice timestamp as its own column and
computes a deadline from it.

### 1.4 The online cancellation obligation

An online transaction must be cancellable **online**, by the same means it was
made. A cancellation route that exists only as a phone number or an email
address does not satisfy this. Concretely, the account area must carry a
cancellation control on the order itself, and pressing it must record the notice
immediately, **before** any human reviews it. Review decides the *outcome*; it
does not decide *when the notice arrived*.

### 1.5 Statutory exclusions

The right of cancellation does not apply to, among others: goods made specially
for the consumer, goods that can be recorded or reproduced once opened,
perishable goods, and certain accommodation/leisure services outside the day
counts in §1.1.

For this catalogue that mainly touches **service coupons with a fixed date**. A
product whose `type` is `service` and which carries a booked date must be
flagged so the account area shows the 7-day rule instead of the 14-day rule.
That flag does not exist on `products` today; it is listed in §6 as a queued
schema change and it is **not** invented here.

### 1.6 What to ask counsel, before launch

1. Is a KenyonExpress coupon a sale of **goods** or of a **service** for §14ג?
   The answer changes the window for the whole catalogue and the code currently
   has no per-product answer.
2. Does the redemption of a coupon at the business start the clock, end it, or
   neither?
3. Does an **expired** unredeemed voucher owe the customer anything? The current
   engineering position is "no, it is breakage", and that position is a legal
   question wearing an engineering costume.
4. Exact wording of the disclosure document (מסמך גילוי) and where it must
   appear in checkout.
5. Whether the 4-month window for a person with a disability, a senior citizen,
   or a new immigrant applies to a purchase with no conversation at all, as
   every purchase on this site currently is.
6. Whether the platform or the supplier is the "עוסק" for cancellation purposes
   on a coupon. Everything below assumes the platform, because the platform took
   the payment.

---

## 2. The decision, as code

`planOrderRefund` in `src/server/domain/orders/refund.ts` is a **pure function**.
It takes state and returns a plan; it moves no money and writes no rows. That
separation is what makes the rules testable without a Cardcom account.

### 2.1 The blockers, named before the attempt

`describeRefundBlockers` answers "can this order be refunded" **before** the
admin clicks, and returns Hebrew strings shown as-is:

| Condition | Message shown | Why |
|---|---|---|
| any voucher `redeemed` | `N שוברים כבר מומשו בבית העסק. הערך נצרך ולא ניתן להחזיר אותו לכרטיס.` | the value was consumed at the business |
| any voucher `expired` | `N שוברים פגו. ערכם נזקף כפחת ולא חוזר לכרטיס.` | breakage |
| no line can transition | `אין שורות שניתן להחזיר: כולן כבר מומשו או שוחררו לספק.` | nothing left to unwind |

The same rule is stated once and read twice: `planOrderRefund` **throws** on all
of these, and a thrown English `RefundError` after the click is not an answer to
"can I refund this order".

### 2.2 Coupon, before and after redemption

```
voucher issued, not redeemed, not expired
   -> REFUND legal
   -> voucher issued -> refunded
   -> line paid|split_executed -> refunded
   -> card credited (coupon_price minus the statutory fee)

voucher redeemed
   -> REFUND ILLEGAL, at the state machine level. `redeemed` is terminal.
   -> the customer took value at the business; the business gave goods
   -> remedy, when warranted: a WALLET CREDIT, internal, never cash

voucher expired
   -> REFUND ILLEGAL. Breakage.
   -> see §1.6 question 3: this is the position most likely to move
```

**The remainder collected at the business is never refunded by us**, in any
scenario, because it never entered the platform. A customer who paid ₪50 online
for a ₪200 voucher and ₪150 at the till is owed at most ₪50 from us. The ₪150 is
between them and the business, and the account area must say so in words.

### 2.3 `cancelOnly`: cancelling a deal instead of crediting it

Cardcom transmits the day's deals to the clearing house at **end of day, Israel
time**. A deal that has not been transmitted can be **cancelled outright**
rather than credited. Cancelling moves no money and costs no clearing
commission.

```ts
const ISRAEL_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', ... })
isSameClearingDay(chargedAt, now) = ISRAEL_DAY.format(chargedAt) === ISRAEL_DAY.format(now)
```

Two details worth defending:

- It compares **calendar days**, not "within 24 hours". The cut is the
  transmission batch, not an elapsed duration. A charge at 23:50 stops being
  cancellable twenty minutes later; one at 00:10 stays cancellable all day.
- `en-CA` yields `YYYY-MM-DD`, which compares as a string with **no Date
  arithmetic** across the two DST shifts this timezone has every year.

**No cancellation fee is charged on a `cancelOnly`.** The deal never reached the
clearing house, so there is no clearing cost to pass on, and charging for it
would be charging for work nobody did. A **partial** refund can never be a
`cancelOnly`: half a deal cannot be un-transmitted.

### 2.4 The plan

```ts
interface RefundPlan {
  refundAmountAgorot: Agorot          // to the card
  cancellationFeeAgorot: Agorot
  lineTransitions: { orderItemId, from, to }[]
  voucherRefunds: string[]            // issued -> refunded
  orderStatus: SettlementState        // via deriveOrderStatus
  cancelOnly: boolean
  supplierDebits: SupplierDebit[]
}
```

Amount, in one expression:

```
fee    = partial || cancelOnly ? 0 : min(round(charged * 0.05), 10_000)   // 0 if defect
refund = partial ?? (charged - fee)
require 0 <= refund <= charged                                            // else INVALID_AMOUNT
```

Every value is integer agorot. `round` is the integer half-up in
`src/lib/money.ts`, not `Math.round` on a float ratio.

### 2.5 Clawing the supplier's share back

A **physical** line refunded from `split_executed` had already released the
supplier's share at split time. Without a debit, the platform pays the
supplier's cut twice: once to the supplier, once back to the customer. That was
a real defect, fixed by `106_refund_flow.sql`.

```ts
for each refunded line:
  if settlementStatus !== 'split_executed' -> skip   // nothing was released
  if supplierReleasedAgorot <= 0           -> skip   // a zero debit says nothing
  push { orderItemId, supplierId, amountAgorot }
```

The debit is **netted off the supplier's next payout**, not collected from them.
It is written as a `settlement_events` row with `kind = 'supplier_debit'` and a
**positive** `supplier_due_agorot`: migration 094's CHECK refuses negatives on
all four money columns, and widening that CHECK would let any event carry a
negative by accident. **The sign lives in the `kind`**, which is already
constrained to a known set. There is no payouts table to adjust; the payout
report sums the events.

A line refunded from `paid` (never split) generates **no** debit. Nothing left
for the supplier, so nothing to claw back.

---

## 3. The clocks

### 3.1 Which timestamp starts which window

| Window | Starts at | Column |
|---|---|---|
| 14-day goods cancellation | later of `orders.paid_at` and delivery | `paid_at` + `order_items.delivered_at` (**draft 124**) |
| 14-day service cancellation | later of `orders.paid_at` and disclosure delivery | `paid_at`; `accepted_terms_at` is the closest proxy |
| 2-day / 7-day pre-service cut | the booked date | **does not exist on `products`** (§6) |
| 14-day refund deadline | the customer's cancellation **notice** | **does not exist** (§5 draft) |
| same-clearing-day cancel | `payments.succeeded_at` | exists |
| voucher expiry | `vouchers.expires_at` | exists, immutable |

Two of those six still have no column, and one has a draft. That is the honest
state of the schema and it is why §5 and §6 exist.

**`delivered_at` was drafted on Ofir's decision, 2026-08-19**:
`migrations/pending/134_order_items_delivered_at.sql`. It adds
`order_items.shipped_at` and `order_items.delivered_at`, and a
`order_item_cancellation_deadline(uuid)` function so the account area, the admin
refund screen and any lateness report cannot disagree about the date. The
function returns **NULL for a physical line not yet delivered**, which callers
must read as *the window is still open*, never as *expired*. It does **not**
backfill: there is no record of when any past order arrived, and inventing one
would fabricate the start of a statutory clock in the one column whose whole
purpose is to be legally relied upon.

### 3.2 Counting days without rest days

"At least 2 days, not counting rest days" is a real algorithm:

```
count backwards from the service date
skip Saturdays
skip the Israeli statutory rest days that fall inside the span
stop when 2 (or 7) countable days have been passed
```

Israeli rest days move with the Hebrew calendar, so the list is data, not code.
Until that data exists, **the conservative direction is to favour the consumer**:
count only weekdays and treat any ambiguity as still-cancellable. A wrongly
allowed cancellation costs one fee; a wrongly refused one is a regulatory
problem.

---

## 4. The execution path

`runRefundOrder` in `src/server/actions/payments/refund.ts`:

```
1. authorize            admin / super_admin, or support within policy
2. load                 order, lines, vouchers, the charge payment row
3. guard                order status guard (mirrors finalize's paid_at guard).
                        This is the DB-level "don't refund twice".
4. plan                 planOrderRefund(...)   pure, throws on illegal
5. provider             cancelOnly ? CancelOnly : Refund, on the ORIGINATING
                        terminal (payments.cardcom_account_id)
6. persist              payments row, kind='refund', refund_of_payment_id set
7. transition           order_items -> refunded, vouchers issued -> refunded,
                        orders.status via deriveOrderStatus
8. settlement_events    one supplier_debit row per SupplierDebit
9. notify               Resend to the customer; ntfy to ops on failure
10. audit_log           actor, entity, before/after
```

**Step 6 must not be skipped and must not fail.** Before `106_refund_flow.sql`,
the refund INSERT named `refund_of_payment_id`, a column production did not
have. Postgres raised 42703, which does not fail partially: it took down the
whole statement. **Every refund in production failed after Cardcom had already
moved the money back.** The card was credited, the row recording it was never
written, the order stayed `paid`, and a second click would have credited the
card again.

That is the reason step 3's guard is not optional and the reason step 6 comes
before step 7: the record of the money movement is written before the states
that depend on it.

### 4.1 Ordering, and what happens if the process dies

| Dies after | Consequence | Recovery |
|---|---|---|
| step 5 (provider succeeded) | money moved, nothing recorded | daily terminal reconciliation reports a credit `missing_locally`; ops replays from step 6 |
| step 6 | recorded, states not moved | the order guard in step 3 sees an existing refund payment and the replay is safe |
| step 7 | states moved, no supplier debit | payout report is short by the debit; detected by the wallet/settlement drift view |
| step 8 | complete, no email | the customer sees the refund in the account area; email is retried |

Only the first row is a genuine inconsistency and it is the one the daily
reconciliation is for.

### 4.2 Idempotency

- Order status guard (step 3), mirroring `finalizeOrder`'s `paid_at` guard.
- `planOrderRefund` **skips** lines already `refunded` or `cancelled` rather than
  throwing, which makes a replay converge instead of erroring.
- Terminal voucher states mean a second run finds nothing to move.
- The provider call is the one non-idempotent step, which is exactly why it sits
  between two guards.

---

## 5. Draft SQL: `refunds`

**DRAFT. NOT APPLIED. NOT RUN.** File: `migrations/pending/131_refunds.sql`.

### 5.1 Why, when `payments(kind='refund')` already exists

They record different things, and the difference is legal rather than technical.

- `payments(kind='refund')` is the **money movement**. It exists only once
  Cardcom has credited the card. It has no opinion about who asked, why, or
  when.
- `refunds` is the **cancellation notice and its adjudication**. It exists from
  the moment the customer presses cancel, which is **before** any money moves and
  possibly before anyone has looked at it.

§1.3 is why this matters: the 14-day refund deadline runs from the **notice**.
Today there is nowhere to put the notice, so the deadline is unmeasurable, so
nothing can alert on it. §1.4 compounds it: the online cancellation control must
record the notice immediately, and a table that only appears after a successful
Cardcom credit cannot do that.

A refund that is refused also has to be recorded. `payments` has no row for a
refund that never happened, and "we told the customer no, on this date, for this
reason" is precisely the record a regulator asks for.

```sql
-- ============================================================================
-- PENDING 121: refunds, the cancellation notice and its adjudication
-- ============================================================================
-- STATUS: DRAFT, NOT APPLIED. Requires Ofir's explicit approval and MCP
-- apply_migration. Never `db push`.
--
-- MEASURED BEFORE WRITING (2026-08-19, against src/types/database.ts, which is
-- what describes production; supabase/migrations/ does not):
--   payments        : exists, with kind ('charge'|'refund') and, since 106,
--                     refund_of_payment_id.
--   payments.amount : the column is amount_ils. PRE-059 LINEAGE.
--   settlement_events : exists (094), append-only, carries supplier_debit.
--   audit_log       : exists.
--   There is no table named refunds and no column holding a cancellation
--   notice timestamp anywhere.
--
-- THIS TABLE HOLDS NO MONEY TRUTH. payments stays the authority for what was
-- credited. This is the paperwork: who asked, when, under which statutory
-- ground, what we decided, and when the clock runs out.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_ground') THEN
    -- The statutory ground, because the fee and the deadline depend on it.
    -- 'defect' is the one that zeroes the fee; 'goodwill' is outside the
    -- statute entirely and is where a wallet credit usually lands.
    CREATE TYPE public.refund_ground AS ENUM (
      'distance_sale_14d',      -- 14ג, the ordinary case
      'defect',                 -- non-conformity / breach. Fee is ZERO.
      'service_not_provided',
      'duplicate_charge',       -- our fault. Fee is ZERO.
      'extended_window',        -- disability / senior citizen / new immigrant
      'goodwill'                -- discretionary. Not a statutory cancellation.
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_state') THEN
    CREATE TYPE public.refund_state AS ENUM (
      'requested',   -- the notice. The 14-day clock starts HERE.
      'approved',
      'rejected',
      'executing',   -- provider call in flight
      'completed',
      'failed'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.refunds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,

  -- NULL until the money actually moves. A rejected refund never gets one, and
  -- that is the point: this table records refusals too.
  payment_id    uuid REFERENCES public.payments(id) ON DELETE SET NULL,

  state         public.refund_state  NOT NULL DEFAULT 'requested',
  ground        public.refund_ground NOT NULL,

  -- THE CLOCK. Section 14ה: the money must be returned within 14 days of the
  -- notice. Defaulting to now() is deliberate: the notice is recorded when the
  -- customer presses the button, not when an operator gets to it.
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  completed_at  timestamptz,

  -- Generated, so nobody can quietly extend it. STORED so it is indexable.
  refund_due_by timestamptz GENERATED ALWAYS AS (requested_at + interval '14 days') STORED,

  -- Who pressed cancel. NULL means the platform initiated it (duplicate charge,
  -- supplier withdrawal), which is a real and different case from "the customer
  -- asked".
  requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Integer agorot, all three. NEVER numeric, never shekels. The whole-agorot
  -- rule, src/lib/money.ts. requested may exceed granted; that difference is
  -- the fee plus anything refused, and both are worth being able to read back.
  requested_agorot        bigint NOT NULL,
  cancellation_fee_agorot bigint NOT NULL DEFAULT 0,
  granted_agorot          bigint,

  -- The plan's own decision, stored so a later audit can tell a cancellation
  -- from a credit without re-deriving the clearing day.
  cancel_only   boolean NOT NULL DEFAULT false,

  -- Hebrew, shown to the customer as-is. A rejection the customer cannot read
  -- is not a rejection that was communicated.
  reason_he     text,
  internal_note text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT refunds_amounts_are_whole_agorot CHECK (
    requested_agorot        >= 0 AND
    cancellation_fee_agorot >= 0 AND
    (granted_agorot IS NULL OR granted_agorot >= 0)
  ),
  -- The statutory cap, in the database rather than only in TypeScript. The
  -- lower of 5% or 10000 agorot. A fee above this is not a rounding error, it
  -- is an unlawful charge, and it should be impossible to store one.
  --
  -- CEILING, not floor: (x + 19) / 20 is ceil(x/20) in integer arithmetic.
  -- computeCancellationFee() rounds half-up, so on 10050 agorot it returns 503
  -- while floor(10050/20) is 502. A floor here would reject a fee the
  -- application legitimately computed and fail the refund AFTER Cardcom moved
  -- the money -- the exact 42703 shape that 106_refund_flow.sql exists to
  -- undo. The one-agora slack is the price of the two layers agreeing.
  CONSTRAINT refunds_fee_within_statutory_cap CHECK (
    cancellation_fee_agorot <= LEAST((requested_agorot + 19) / 20, 10000)
  ),
  -- A defect or a duplicate charge is OUR fault and carries no fee. Encoding it
  -- here means the rule survives a caller that forgets isDefectClaim.
  CONSTRAINT refunds_no_fee_when_our_fault CHECK (
    ground NOT IN ('defect','duplicate_charge') OR cancellation_fee_agorot = 0
  ),
  CONSTRAINT refunds_completed_has_money CHECK (
    state <> 'completed' OR (granted_agorot IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT refunds_decided_has_decider CHECK (
    state NOT IN ('approved','rejected') OR decided_at IS NOT NULL
  )
);

COMMENT ON TABLE public.refunds IS
  'The cancellation notice and its adjudication. NOT the money movement: payments(kind=refund) is. requested_at starts the statutory 14-day refund deadline.';
COMMENT ON COLUMN public.refunds.refund_due_by IS
  'Generated: requested_at + 14 days. Consumer Protection Law. Generated so it cannot be quietly extended.';

-- One open refund per order at a time. A second cancellation request while one
-- is in flight is a double-click, and a partial unique index says so without
-- forbidding a legitimate second refund after the first completes.
CREATE UNIQUE INDEX IF NOT EXISTS refunds_one_open_per_order
  ON public.refunds (order_id)
  WHERE state IN ('requested','approved','executing');

-- "What is about to breach the deadline." This is the only query ops runs daily.
CREATE INDEX IF NOT EXISTS refunds_due_idx
  ON public.refunds (refund_due_by)
  WHERE state IN ('requested','approved','executing');

CREATE INDEX IF NOT EXISTS refunds_order_idx ON public.refunds (order_id, requested_at DESC);

-- ---------------------------------------------------------------------------
-- RLS. auth.uid() only. There is no tenant_id in this schema.
-- ---------------------------------------------------------------------------
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

-- The customer may SEE their own refunds. They may not write this table
-- directly; the cancellation control goes through a server action, because the
-- notice timestamp has to be the server's clock, not the browser's.
-- (SELECT auth.uid()) not auth.uid(): InitPlan once, not once per row.
CREATE POLICY refunds_owner_read ON public.refunds
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = refunds.order_id AND o.user_id = (SELECT auth.uid())
  ));

CREATE POLICY refunds_staff_read ON public.refunds
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin','super_admin','support'));

REVOKE ALL ON public.refunds FROM anon;
GRANT SELECT ON public.refunds TO authenticated;

-- ============================================================================
-- VERIFICATION (after applying, inside rolled-back DO blocks)
-- ============================================================================
-- 1. The statutory cap bites:
--      INSERT INTO public.refunds (order_id, ground, requested_agorot,
--                                  cancellation_fee_agorot)
--      VALUES ((SELECT id FROM public.orders LIMIT 1), 'distance_sale_14d',
--              100000, 6000);
--    Expect 23514: 5% of 100000 is 5000, and 6000 exceeds it.
--
-- 2. A defect carries no fee:
--      ... VALUES (..., 'defect', 100000, 1);   -> expect 23514.
--
-- 3. refund_due_by cannot be written:
--      ... (refund_due_by) VALUES (now())       -> expect 428C9.
--
-- 4. Two open refunds on one order:
--      insert twice with state 'requested'      -> expect 23505 on the second.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.refunds;
--   DROP TYPE  IF EXISTS public.refund_state;
--   DROP TYPE  IF EXISTS public.refund_ground;
-- ============================================================================
```

### 5.2 What this draft deliberately does not do

- **No money.** `payments` stays the authority for what was actually credited.
  `granted_agorot` here is what we *decided*; the payment row is what *moved*.
- **No backfill.** Past refunds have no recorded notice date and inventing one
  would fabricate the start of a statutory clock.
- **No `*_ils` column.** New money columns are agorot. The pre-059 spellings are
  untangled by `142_money_integer_fix_in_place.sql` on its own schedule, and this
  file does not add a third spelling.
- **No status on `orders`.** The order rollup is derived, per
  `ARCHITECTURE-ORDER-STATE-MACHINE.md` §5, and a `refund_pending` order status
  would be a fifth machine.

---

## 6. Schema gaps this document found and did not paper over

Listed because naming a gap is more useful than inventing a column.

| Gap | Consequence | Where it belongs |
|---|---|---|
| ~~No delivery timestamp on `order_items`~~ | ~~the window we honour is shorter than the law requires~~ | **drafted 2026-08-19**: `migrations/pending/134_order_items_delivered_at.sql`. Not applied. Stamping the columns is still an application change on the supplier's ship/deliver actions |
| No booked-date field on service products | The 2-day and 7-day pre-service cuts cannot be applied at all | `products.service_date`, plus a boolean for "date-specific leisure" |
| No cancellation-notice record | The 14-day refund deadline is unmeasurable and unalertable | §5 draft |
| No extended-window flag on profiles | The 4-month window cannot be honoured automatically | a self-declared status on `profiles`, with proof handled off-platform |
| `audit_log` is not append-only in the database | The refusal record can be edited | a `BEFORE UPDATE OR DELETE` trigger, per `ARCHITECTURE-ORDER-STATE-MACHINE.md` §8.3 |

The first row was the one that mattered most, and it erred in the **wrong**
direction: honouring a shorter window than the law grants is a compliance
failure, not a conservative default. Draft 124 closes the schema half of it. The
application half, stamping the columns when a supplier marks a line shipped or
delivered, is a code change and is listed in `MASTER-ARCHITECTURE-v3.md` §5.

**Why not reuse `fulfilled_at`**, which already exists: it is *our* side of the
transaction. On a coupon line it is stamped at issuance, when nothing has been
delivered to anybody; on a physical line it is stamped when the supplier says
they are done, which is the handover to the carrier rather than to the customer.
The statute asks when the **consumer** received the goods. Overloading one column
with two questions that differ by days, when the day count is the entire legal
effect, is the same defect `compare_at_price` / `compare_at_price_ils` exists to
untangle.

---

## 7. What the customer sees

### 7.1 Before payment

The checkout summary states, in Hebrew, before the pay button:

- the 14-day cancellation window and what starts it;
- the fee, in numbers: `5% מהעסקה או ₪100, הנמוך מביניהם`;
- that a redeemed coupon cannot be cancelled;
- that the balance paid at the business is not refundable by KenyonExpress;
- `offer_valid_until`, wherever the offer is shown.

### 7.2 In the account area

Each order carries a cancellation control (§1.4). Pressing it:

1. writes the `refunds` row with `state = 'requested'` **immediately**;
2. shows the plan's own numbers before confirming: amount back to the card, fee,
   and the reason for any refusal, taken from `describeRefundBlockers` so the
   admin screen and the customer screen cannot disagree;
3. sends a confirmation email through Resend, which is the customer's evidence
   of when the notice was given.

### 7.3 After the decision

| Outcome | What is shown |
|---|---|
| approved, credited | amount, date, and the fee as its own line |
| approved, `cancelOnly` | "העסקה בוטלה לפני סליקה" and **no fee** |
| rejected | `reason_he`, verbatim, plus what remedies remain |
| partially refunded | the refunded amount and what stays open, per line |

A rejection with no readable reason is not a rejection that was communicated,
which is why `reason_he` is Hebrew text and not an error code.
