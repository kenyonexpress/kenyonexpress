# Money Model

Integer agorot, the generated columns, and which amounts are allowed to go
negative.

Verified against production (`ixvwfbuvfxxsjiywhbbb`) on **2026-09-01** through
MCP. Code references are to this branch.

Companion documents: `docs/PAYMENT-FLOW.md` (the states money moves through),
`docs/ARCHITECTURE-OVERVIEW.md` §3, `docs/DATA-MODEL.md` (every column).

---

## 1. The rule

**Money is an integer count of agorot. 1 ₪ = 100 agorot. No float touches a
money value at any point.**

Rates are **integer basis points**: 10% is `1000`, 100% is `10000`. Not `0.1`,
not `10`.

The single implementation is `src/lib/money.ts`, which re-exports the branded
primitives from `src/lib/commerce/money.ts` so the whole application shares one
brand and one rounding rule.

```ts
type Agorot = number & { readonly [agorotBrand]: 'Agorot' }
type Bp     = number & { readonly [bpBrand]: 'Bp' }
const BP_WHOLE     = 10_000   // 100%
const VAT_RATE_BP  = 1800     // 18%
```

The brands are the enforcement. An ordinary `number` cannot be passed where
`Agorot` is expected without going through a constructor, and every constructor
asserts `Number.isSafeInteger`, including on intermediates. A value that would
silently lose precision throws instead of rounding quietly.

### Rounding

Integer half-up, done without division:

```ts
divRoundHalfUp(n, d)     = sign * floor((2*|n| + d) / (2*d))
applyBp(amount, points)  = divRoundHalfUp(amount * points, 10_000)
```

Deterministic and platform-independent. There is no `Math.round` on a float
anywhere on this path, which is what makes two independently computed halves of
a split agree exactly rather than to within an agora.

### VAT

VAT is **extracted from a gross, VAT-inclusive amount**, and the VAT half is
computed by subtraction:

```ts
net = divRoundHalfUp(gross * 10_000, 10_000 + vatRateBp)
vat = gross - net
```

`net + vat === gross` exactly, with no rounding leak, because only one of the
two is rounded and the other absorbs the remainder. Computing both
independently is how a receipt comes to be off by an agora.

Israeli VAT is **18%** (`VAT_RATE_BP = 1800`). `DEFAULT_VAT_PERCENT` in
`src/lib/invoices/document.ts` is derived from that constant rather than
holding a second copy, so the two cannot drift. The 17-versus-18 contradiction
recorded in older documents is closed.

**The platform books VAT only on its own commission**, not on the full
transaction value. The supplier's cash collection is not ours to invoice.

---

## 2. The `_agorot` columns

Production carries **78 columns named `*_agorot`**: 71 on base tables, and 7
more projected through views.

Of the 71 on base tables:

| | Count |
|---|---|
| `GENERATED ALWAYS ... STORED` | **26** |
| Ordinary integer columns, written directly | **45** |

### 2.1 The generated twins

Each of the 26 is computed from a pre-existing `numeric` shekel column:

```sql
(round((price_ils * 100::numeric)))::bigint
```

They exist so that **the multiplication stops happening in JavaScript**.
Application code reads the twin; it never computes one.

```
affiliates.total_earnings_ils_agorot      products.compare_at_price_agorot
coupon_codes.collect_amount_ils_agorot    products.compare_at_price_ils_agorot
coupon_deals.original_price_agorot        products.coupon_price_ils_agorot
coupons.original_price_agorot             products.full_price_agorot
order_items.coupon_price_ils_agorot       products.kenyon_price_agorot
order_items.total_price_ils_agorot        products.price_ils_agorot
order_items.unit_price_ils_agorot         profiles.wallet_balance_agorot
orders.subtotal_ils_agorot                referrals.bonus_paid_amount_ils_agorot
orders.total_ils_agorot                   wallet_accounts.balance_ils_agorot
payments.amount_ils_agorot                wallet_balances.balance_ils_agorot
product_variants.price_agorot             wallet_entries.amount_ils_agorot
product_variants.price_ils_agorot         wallet_transactions.amount_ils_agorot
product_variants.price_modifier_agorot    wallet_transactions.gross_amount_ils_agorot
```

**Generated columns are read-only.** An INSERT or UPDATE naming one fails.
Write the shekel column; read the agorot twin. This is the single most common
way a query written from an older document breaks.

> The brief for this documentation set said twenty-seven. The live count is
> **26**. Two further generated columns exist on `coupon_deals`
> (`discount_percentage`, `platform_price`) but they are not agorot columns.

### 2.2 The 45 written directly

These are the ones the settlement path actually computes into, and they are
integers in agorot from the start with no shekel counterpart:

- `order_items`: `face_value_agorot`, `paid_on_site_agorot`,
  `commission_agorot`, `supplier_immediate_agorot`, `balance_due_agorot`,
  `cashback_amount_agorot`, `escrow_held_agorot`, `escrow_release_agorot`
- `vouchers`: `face_value_agorot`, `coupon_price_agorot`,
  `remaining_amount_due_agorot`, `redeemed_amount_collected_agorot`
- `refunds`, `settlement_events`, `split_executions`, `subscription_charges`,
  `subscriptions`, `invoices`, `discount_campaigns`, `escrow_holds`,
  `payment_events`, `referral_program_settings`, `referrals`,
  `voucher_redemptions`, `abandoned_cart_nudges`, `products.recurring_amount_agorot`

---

## 3. Which amounts are signed, and why

This is the section worth reading carefully. **53 of the 71 carry a
non-negative CHECK. 18 do not**, and the 18 fall into two very different
groups.

### 3.1 Deliberately signed: a negative value is meaningful

| Column | Why it must go negative |
|---|---|
| `profiles.wallet_balance_agorot` | a ledger balance |
| `wallet_accounts.balance_ils_agorot` | a ledger balance |
| `wallet_balances.balance_ils_agorot` | a ledger balance |
| `wallet_entries.amount_ils_agorot` | a ledger entry has a direction |
| `wallet_transactions.amount_ils_agorot` | same |
| `wallet_transactions.gross_amount_ils_agorot` | same |
| `product_variants.price_modifier_agorot` | a variant can subtract from the base price |

Seven columns, all generated. Adding `>= 0` to any of them would break the
wallet ledger: a redemption or an expiry is a negative entry, and a balance can
legitimately be driven below zero by a correction before it is reconciled.

`146_wallet_balance_floor` is the applied migration governing how far a balance
may go, and it is the right place for that rule. A blanket `>= 0` on the entry
column would be the wrong place, because it would forbid the entry that
represents spending.

### 3.2 Unconstrained, and not obviously on purpose

Eleven columns carry no sign constraint and have no ledger reason to be signed:

| Table | Columns |
|---|---|
| **`order_items`** | `face_value_agorot`, `paid_on_site_agorot`, `commission_agorot`, `supplier_immediate_agorot`, `balance_due_agorot`, `cashback_amount_agorot`, `escrow_held_agorot`, `escrow_release_agorot` |
| `referrals` | `referrer_bonus_agorot`, `referred_bonus_agorot` |
| `abandoned_cart_nudges` | `cart_value_agorot` |

**`order_items` is the money row of the entire system, and not one of its eight
directly-written agorot columns has a sign check.** Compare that with the
tables around it, which are strict:

```sql
vouchers_face_value_agorot_check              face_value_agorot >= 0
split_executions_commission_agorot_check      commission_agorot >= 0
settlement_events_amounts_non_negative        all four >= 0
subscription_charges_platform_fee_agorot_check  platform_fee_agorot >= 0
```

`vouchers`, `split_executions`, `settlement_events` and `subscription_charges`
all constrain the same quantities that `order_items` leaves open. The
generated `_ils_agorot` twins on `order_items` *are* constrained
(`order_items_unit_price_ils_agorot_nonneg` and friends), which makes the gap
look like an oversight rather than a decision: the columns that arrived with
migrations 138 to 141 got checks, and the older hand-written ones did not.

**Assessment.** This is a gap, not a live bug. Nothing writes a negative here:
`calculateCommission` derives every one of these from non-negative inputs
through `applyBp` and subtraction of a smaller value from a larger. But the
database would accept a negative if a future writer produced one, and the
conservation constraints that would catch it are on the *other* tables. A
negative `commission_agorot` on an order line would be stored silently and
surface later as a supplier being owed more than the transaction was worth.

Adding the checks is an additive migration and has not been written. It belongs
with the two missing foreign key indexes in
`docs/INDEX-USAGE-REPORT.md` §3 as a small, safe hardening pass.

---

## 4. Conservation, enforced in the database

These are CHECK constraints, not conventions. No writer can bypass them,
including the service role.

```sql
vouchers_conservation
  face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot

split_executions_conservation
  face_value_agorot = commission_agorot + supplier_agorot

subscription_charges_split_is_exact
  platform_fee_agorot + supplier_due_agorot = amount_agorot

invoices_amounts_add_up
  net_agorot + vat_agorot = total_agorot

escrow_holds_conservation                     -- legacy table, 2 rows, no writer
  held_agorot = commission_agorot + release_agorot
```

Each says the same thing in a different place: **a total equals the sum of its
parts, in integers, with no residue.** That is only expressible because the
values are integers. In floating point none of these constraints could be
written at all.

Note again what is missing: there is **no conservation constraint on
`order_items`**, where the equivalent identity is `face_value_agorot =
paid_on_site_agorot + balance_due_agorot`. It holds in the application and is
asserted in tests, but not in the schema.

---

## 5. The engine

`src/lib/commerce/commission.ts` computes a cart. Per line:

```
faceValue            = unitPrice × quantity
customerPaysNow      = coupon ? couponPriceUnit × quantity : faceValue
balanceDueAtBusiness = coupon ? faceValue − customerPaysNow : 0
platformFee          = coupon ? customerPaysNow
                              : applyBp(faceValue, platformPercentBp)
supplierImmediate    = coupon ? 0 : faceValue − platformFee
supplierDue          = supplierImmediate
cashbackAmount       = applyBp(customerPaysNow, cashbackPercentBp)
```

Five properties, each of which was learned by getting it wrong first:

1. **`platformPercent` is mandatory on both product types, with no default
   anywhere.** A coupon line does not use it to divide anything, since the
   platform keeps the whole prepayment, but it stays required so the catalogue
   invariant holds one way for every product. A product without it cannot be
   priced or sold.

2. **The coupon prepayment is an absolute shekel amount, never a percentage.**
   `products.coupon_price_ils`, set by an admin. A product missing it renders as
   `{ sellable: false, reason: 'missing-price' }` rather than guessing. Deriving
   it from a percent is exactly how the quote and the charge came apart before.

3. **The supplier residual is `face − fee`, not a second percentage applied to
   the same base.** Applying the mirror percent twice is how two halves come to
   disagree by an agora.

4. **Cashback is snapshotted, not credited.** The line records what will be
   owed; lifecycle handlers credit it after redemption or shipment.

5. **Wallet is a payment source and nothing more.** It reduces `cardCharge`
   only. It never mutates line settlement, commission, supplier due, or the
   cashback snapshot. `walletApplied > customerPaysNow` throws.

A coupon line reports `platformPercentBps = 10_000` downstream, because that is
the split that actually happened. Reporting the product's configured percent
would describe a division that did not occur, and this is the value snapshotted
onto `order_items`.

### Per-unit splitting

A line with `quantity = 3` issues three vouchers, so the line's money must
divide into three integer parts. **The first unit absorbs the remainder**:
1000 agorot across 3 units is 334 / 333 / 333, never 333.33. This keeps
`vouchers_conservation` satisfiable in integers for every voucher.

---

## 6. The snapshot rule

`platform_percent` is **per product, and snapshotted onto `order_items` at
purchase time**, along with supplier identity by value (`supplier_name`,
`supplier_phone`, `supplier_address`, `supplier_logo_url`).

Settlement never reads a live percentage off a product row. Changing a
product's rate tomorrow cannot rewrite the arithmetic of an order placed today,
and renaming a supplier does not rename the sale.

`commission_percent_snapshot`, `upfront_percent` and `supplier_split_percent`
sit alongside it for the same reason.

---

## 7. The generation trap

The application carries `src/lib/commerce/order-money-columns.ts`, which probes
the database at runtime to decide which generation of money columns it is
talking to. This is not over-engineering. It exists because `beginCheckout`
once wrote six columns on `orders` and fourteen on `order_items` that the
hosted project does not have, Postgres answered `42703`, and **no order could
be created at all**.

**Production is the `ils` generation**: `numeric` shekel columns, with the
`_ils_agorot` generated twins added later by migrations 138 through 141.

These names appear across older documents and **do not exist in production**:

```
orders.subtotal_agorot            orders.total_agorot
orders.customer_pays_now_agorot   orders.cashback_applied_agorot
orders.wallet_applied_agorot      orders.discount_agorot
order_items.unit_price_agorot     order_items.total_price_agorot
payments.wallet_applied_agorot    vouchers.platform_bp
```

`platform_bp` in particular exists nowhere. The live column is
`platform_percent`, a whole-percent `numeric`.

**`src/types/database.ts` describes production. `supabase/migrations/` does
not.**

> **Known live defect.** `src/server/payments/finalize.ts` still selects
> `orders.cashback_applied_agorot` and `order_items.unit_price_agorot` as
> literals rather than through the generation probe. Both confirmed absent from
> production on 2026-09-01. That select raises `42703` against the live schema,
> which means the first real payment cannot finalize. Recorded here and in
> `docs/RUNBOOK.md` §4.1; not fixed, because this branch is documentation only.

---

## 8. Where the money is not

**There is no escrow.** No third-party agent, no J5, no hold on the customer's
card, and no internal hold either. For a coupon, the entire on-site payment
settles to the platform when the order is paid, and
`remaining_amount_due_agorot` is collected in cash by the business and never
reaches us.

`escrow_holds` still exists with **2 legacy rows and no writer**. The
`settlement_status` labels `escrow_held` and `escrow_released` are dead:
`SettlementState` in `src/server/domain/orders/state-machine.ts` deliberately
refuses them, so a value the type will not admit is a row this code cannot
produce.

**There is no payout system either.** On the coupon path the platform owes the
supplier nothing, so there is nothing to pay out. `payout_status` and
`payout_line_type` exist as enums with no tables behind them. See
`docs/SCHEMA-REALITY-CHECK.md` §4.

---

## 9. Verification

```sql
-- 78 agorot columns, 26 generated
select count(*) filter (where is_generated = 'ALWAYS') as generated, count(*) as total
from information_schema.columns
where table_schema = 'public' and column_name like '%agorot%';

-- which agorot columns lack a non-negative CHECK
with a as (
  select c.table_name t, c.column_name col, c.is_generated gen
  from information_schema.columns c
  join information_schema.tables tb
    on tb.table_schema = c.table_schema and tb.table_name = c.table_name
   and tb.table_type = 'BASE TABLE'
  where c.table_schema = 'public' and c.column_name like '%agorot%'
)
select a.t, a.col, a.gen
from a
where not exists (
  select 1 from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public' and rel.relname = a.t and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%' || a.col || '%>= 0%')
order by a.t, a.col;
-- expect 18 rows: the 7 in §3.1 and the 11 in §3.2

-- the conservation constraints
select rel.relname, con.conname, pg_get_constraintdef(con.oid)
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public' and con.contype = 'c'
  and con.conname like '%conservation%' or con.conname like '%add_up%'
   or con.conname like '%split_is_exact%';
```
