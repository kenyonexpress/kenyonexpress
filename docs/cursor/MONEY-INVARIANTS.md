# Money invariants

ADR:
`docs/adr/0001-money-is-integer-agorot.md`.
Companions:
`docs/MONEY-MODEL.md`,
`docs/cursor/DATA-FLOW.md`.

This file is the contract. If application code disagrees with this file, the code is wrong, except where this file names a measured gap.

---

## 1. The unit

**Money is an integer count of agorot. 1 ₪ = 100 agorot. No float touches a money value at any point.**

Rates are integer **basis points**. 10% is `1000`. 100% is `10000`. Not `0.1`, not `10`, not a JS `Number` percent.

Shekels are a display format at the edge (`he-IL`). They are not a storage format on the money path. Generated `_ils_agorot` twins exist so JavaScript never multiplies
`price_ils * 100`.

VAT is 18% (`VAT_RATE_BP = 1800`), extracted from a gross VAT-inclusive amount. The VAT half is **subtraction**, so `net + vat === gross` with no residue:

```
net = divRoundHalfUp(gross * 10_000, 10_000 + vatRateBp)
vat = gross - net
```

The platform books VAT only on its own commission, not on the supplier's cash collection.

Israeli consumer-law fee cap on refunds is also integer: 5% of requested or ₪100, whichever is lower
(`cancellation_fee_agorot <= LEAST((requested_agorot + 19) / 20, 10000)`).

---

## 2. The module (there is no `packages/money.ts`)

A brief for this pack said
`packages/money.ts`.
That path does not exist. There is no
`packages/`
directory in this repository. The Turborepo sketch that invented it was never built.

The live contract:

| Path | Role |
|---|---|
| `src/lib/commerce/money.ts` | Branded primitives, constructors, `divRoundHalfUp`, `applyBp`, VAT extract |
| `src/lib/money.ts` | Re-export. **The only import surface the rest of the app may use.** |
| `src/lib/commerce/commission.ts` | Cart / line split |
| `src/lib/commerce/coupon-offer.ts` | Coupon sellability. Missing `coupon_price_ils` → `{ sellable: false, reason: 'missing-price' }` |
| `src/lib/commerce/product-money.ts` | Product-side reads of generated twins |
| `src/lib/admin/bulk-price.ts` | Admin bulk adjust. Integer only (float in this module was a measured bug and was removed) |

Brands:

```
type Agorot = number & { readonly [agorotBrand]: 'Agorot' }
type Bp     = number & { readonly [bpBrand]: 'Bp' }
const BP_WHOLE    = 10_000
const VAT_RATE_BP = 1800
```

An ordinary
`number`
cannot be passed where
`Agorot`
is expected without a constructor. Every constructor asserts
`Number.isSafeInteger`,
including on intermediates. A value that would silently lose precision **throws**.

Rounding is integer half-up **without division**:

```
divRoundHalfUp(n, d)    = sign * floor((2*|n| + d) / (2*d))
applyBp(amount, points) = divRoundHalfUp(amount * points, 10_000)
```

There is no
`Math.round`
on a float on this path. That is what makes two independently computed halves of a split agree exactly rather than to within an agora.

CI holds coverage floors on this module. Tests assert every analytics money output is an integer.

---

## 3. Per-product `platform_percent`, no global rate

`platform_percent` is a whole-percent
`numeric`
on
`products`,
**mandatory on every sellable product**, coupon and physical. There is:

- no column default
- no env default
- no "10% if missing"
- no platform-wide settings row that checkout reads
- no `platform_bp` column (the only `_bp` column in production is `discount_campaigns.percent_bp`)

A product without it cannot be priced or sold. Checkout fails loudly. It does not invent a split.

Why no global rate:

1. Partners do not share a take. A restaurant coupon and a shipped bottle are different contracts.
2. A global rate would make historical orders lie after a policy change. Settlement must not join live `products`.
3. Coupon economics are not a percent of face. The prepayment is an absolute
   `coupon_price_ils`.
   Reporting a global 10% on that path would describe a division that did not occur.

Coupon lines still **store** `platform_percent` on
`order_items`
so every product type has one snapshot shape. The engine then reports
`platformPercentBps = 10_000`
downstream because the platform kept 100% of the prepayment. Reporting the product's configured percent on a coupon charge would be a lie.

Physical:

```
platformFee       = applyBp(faceValue, platformPercentBp)
supplierImmediate = faceValue - platformFee
```

The residual is subtraction, not a second percent applied to the same base. Applying the mirror twice is how two halves disagree by an agora.

---

## 4. Snapshot into `order_items`

At
`beginCheckout`,
each line freezes everything settlement will ever need. Later settlement **must not** read live
`products.platform_percent`,
live
`coupon_price_ils`,
or live supplier name.

Snapshotted (non-exhaustive, money-bearing):

| Column | Meaning |
|---|---|
| `platform_percent` | Whole percent, as configured at purchase |
| `face_value_agorot` | unit × qty |
| `paid_on_site_agorot` | What Cardcom / wallet must collect now |
| `balance_due_agorot` | Cash at the business (coupon) or 0 (physical) |
| `commission_agorot` | Platform take |
| `supplier_immediate_agorot` | 0 on coupon; face − fee on physical |
| `cashback_amount_agorot` | Snapshot only. Credited later |
| `unit_price_ils` / generated `unit_price_ils_agorot` | Sticker |
| `coupon_price_ils` / generated twin | Absolute prepaid |
| `supplier_name`, `supplier_phone`, `supplier_address`, `supplier_logo_url` | Identity by value |

Renaming a supplier after a sale does not rename the sale.

Vouchers freeze their own copy at issue (`face_value_agorot`, `coupon_price_agorot`, `remaining_amount_due_agorot`, `platform_percent`).

---

## 5. Conservation (DB CHECKs vs application)

Enforced in Postgres, including against service_role:

```
vouchers_conservation
  face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot

split_executions_conservation
  face_value_agorot = commission_agorot + supplier_agorot

subscription_charges_split_is_exact
  platform_fee_agorot + supplier_due_agorot = amount_agorot

invoices_amounts_add_up
  net_agorot + vat_agorot = total_agorot

escrow_holds_conservation   (legacy, 2 rows, no writer)
  held_agorot = commission_agorot + release_agorot
```

**Gap (measured, not a live bug):** there is no conservation CHECK on
`order_items`
for
`face_value_agorot = paid_on_site_agorot + balance_due_agorot`.
It holds in
`commission.ts`
and in tests. The database would accept a violating row from a future writer.

**Gap:** none of the eight directly-written `_agorot` columns on
`order_items`
have a `>= 0` CHECK. Neighbour tables (`vouchers`, `split_executions`, `settlement_events`) do. Generated `_ils_agorot` twins on the same table **are** constrained. A negative `commission_agorot` would store silently and surface as a supplier owed more than the transaction.

Wallet entries **must** be signed. Putting `>= 0` on
`wallet_entries.amount_ils_agorot`
would forbid spending. Floor is
`146_wallet_balance_floor`.

`escrow_held_agorot` / `escrow_release_agorot` still exist on the line. Nothing in current code writes them. Do not revive.

---

## 6. Engine identities (must hold after every line)

```
faceValue            = unitPrice × quantity
customerPaysNow      = coupon ? couponPriceUnit × quantity : faceValue
balanceDueAtBusiness = coupon ? faceValue - customerPaysNow : 0
platformFee          = coupon ? customerPaysNow
                              : applyBp(faceValue, platformPercentBp)
supplierImmediate    = coupon ? 0 : faceValue - platformFee
supplierDue          = supplierImmediate
cashbackAmount       = applyBp(customerPaysNow, cashbackPercentBp)
cardCharge           = customerPaysNow - walletApplied   (walletApplied >= 0)
```

Wallet never mutates commission, supplier due, or the cashback snapshot.
`walletApplied > customerPaysNow`
throws.

Cashback is snapshotted, not credited, at pay. Credit happens after redeem (coupon) or shipment (physical).

---

## 7. What a violation looks like in code

These are the shapes to grep for. Any one of them is a money bug, even if tests are green for other reasons.

| Smell | Why it is a violation |
|---|---|
| `parseFloat`, `Number.parseFloat`, `Math.round(x * 100)`, `/ 100` on a money field | Float entered the path. Agora drift. |
| `price * 0.1`, `* (percent / 100)` | Percent as float. Use `applyBp` and a `Bp`. |
| `?? 10`, `DEFAULT_PLATFORM_PERCENT`, env `PLATFORM_PERCENT`, settings-global take | Global rate. Forbidden. |
| Reading `products.platform_percent` (or `coupon_price_ils`) **after** the order exists, in settlement / refund / analytics of a past sale | Broke the snapshot. Historical orders lie. |
| Writing a generated `*_ils_agorot` column | Postgres rejects. Write the shekel column or the hand-written agorot column, never the generated twin. |
| Importing `src/lib/commerce/money.ts` from feature code instead of `src/lib/money.ts` | Second door. Brands and rounding can fork. |
| `packages/money.ts` or `@ke/money` import | Path does not exist. Dead brief. |
| `supplierDue = applyBp(face, 10000 - platformBp)` | Second rounding. Use `face - fee`. |
| Inventing `coupon_price` from `face * discount` at checkout | Absolute amount missing. Must fail sellable. |
| `CARDCOM_USE_MOCK` in production | Charges "succeed" with no card. Not a rounding bug; it is a fake money path. |
| Selecting `orders.cashback_applied_agorot` / `order_items.unit_price_agorot` as literals when production has `cashback_applied_ils` / `unit_price_ils_agorot` | `42703`. First real payment dead-letters. Named in `docs/API-REFERENCE.md` §5. |
| Client sending a price in the checkout body and the server trusting it | Charge / snapshot split. Server must re-price. |
| Negative write into `order_items.*_agorot` | No DB sign CHECK. Would persist. |
| Float in admin bulk price | Already burned once. Module is `src/lib/admin/bulk-price.ts`. |

Analytics: if a dashboard number is not a safe integer, it is not a money number. Tests exist for that claim.

---

## 8. Status money vs display money

`payments.amount_ils` and generated
`amount_ils_agorot`
must equal the snapshotted
`paid_on_site_agorot`
(minus wallet). GetLpResult is the only trusted Cardcom amount. Mismatch → `failed`, not a "close enough" finalize.

Do not compare floats in tests with
`toBeCloseTo`
on agorot. Use exact integer equality.

---

## 9. Escrow is not a money path

Settled 2026-07-24. Coupon prepayment stays with the platform permanently. Supplier cash at the counter never enters clearing.

`settlement_status` still contains
`escrow_held`
/
`escrow_released`
for history. Application
`SettlementState`
refuses them as destinations. Migration 137 has no inbound edge. Outbound edges exist so two legacy
`escrow_holds`
rows can still move out.

Any new code that writes
`escrow_held`
is a violation of the business rule, even if the trigger allowed an outbound later.

---

## 10. Mapping the brief's `packages/money.ts`

| Brief name | Live name | Do this |
|---|---|---|
| `packages/money.ts` | `src/lib/money.ts` | Import only this from app code |
| `packages/money` types | `src/lib/commerce/money.ts` | Do not import from features |
| global `PLATFORM_PERCENT` | **does not exist** | Fail the product |
| `platform_bp` on products | **does not exist** | `platform_percent` is whole-percent numeric; convert to Bp at the engine boundary |
| escrow hold percent | **removed 2026-07-24** | |

Generated-column error (what a violation looks like at runtime): Postgres rejects INSERT/UPDATE that names a
`GENERATED ALWAYS`
column. The fix is to write
`price_ils`
(or the hand-written agorot column) and read
`price_ils_agorot`.
It is the most common query-from-old-docs failure.

172's ₪1 price is **not** a global rate and **not** a 0.25% platform take. It is a catalogue mistake. The guard is a ratio against
`full_price`
(the only compare-at the guard reads). Do not "fix" it by adding a default
`platform_percent`.
