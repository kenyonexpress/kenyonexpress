# Business Rules Matrix

Product type against payment flow, escrow, split timing, refund path and audit
trail: what the brief asked for as a CSV, and beside it what the code and the
live database actually do. Verified 2026-09-08 against `docs/BUSINESS-MODEL.md`
(the brief's `docs/BUSINESS-MODEL-RULES.md` does not exist; `BUSINESS-MODEL.md`
+ `BUSINESS-RULES.md` are the two files that carry the rules), `docs/BUSINESS-RULES.md`,
`docs/PAYMENT-FLOW.md`, `src/lib/commerce/commission.ts`,
`src/server/payments/finalize.ts`, `src/server/actions/payments/refund.ts`,
the live guard functions and the live CHECK constraints.

---

## 1. The matrix (CSV)

```csv
Product Type,Payment Flow,Escrow,Split Timing,Refund Path,Audit Trail
coupon,customer pays coupon_price (absolute admin-set amount) on site via Cardcom Low Profile; balance = face - coupon_price paid in cash at the business at redemption,NONE (locked model since 2026-07-24; migrations 085/125),at finalize: platform keeps 100% of paid_on_site (commission = paid_on_site; supplier_immediate = 0); line -> split_executed; no supplier payout ever on this path,card refund via RefundDeal.aspx only while every voucher on the line is issued; redeemed or expired voucher => wallet credit only; statutory fee min(5% or 100 ILS) unless defect/duplicate; 14-day due_by derived by trigger,payment_events (append-only trigger) + settlement_events.charge_settled + voucher_redemptions + audit_log triggers on orders/order_items/payments/vouchers/refunds (169) + audit_log status_change row from finalize
physical,customer pays 100% of kenyon_price on site via Cardcom Low Profile (ChargeOnly or ChargeAndCreateToken),NONE,at finalize: split_executions row (face = commission + supplier; commission = applyBp(face; platform_percent snapshot)); supplier share owed immediately; paid out via payout_statements (152) after payout_available_at (business-days hold),card refund via RefundDeal.aspx; partial refund = new payments row kind=refund with no fee; full refund -> payments.refunded + orders.refunded; supplier_debit settlement event claws back a released share,same as coupon minus voucher tables; plus payout_statements/payout_statement_lines audit triggers
recurring,first cycle paid on site via Low Profile with ChargeAndCreateToken; renewals charged server-to-server via ChargeToken.aspx from the saved payment_tokens row on the minting terminal,NONE,per charge: subscription_charges row with platform_fee + supplier_due = amount (CHECK split_is_exact); platform_percent snapshotted on subscriptions at creation,cancel from account area stops future charges; refund of a charge follows the physical path per charge,payment_events token_charge_* + subscription_charges + audit_log triggers on subscriptions/subscription_charges
service,treated as physical in commission.ts (any non-coupon type uses the percent split),NONE,as physical,as physical,as physical
```

Live `product_type` enum: `coupon, physical, service, recurring`. `service` has no rule of its own anywhere in the docs; the code path is the non-coupon branch.

---

## 2. Implementation versus the stated model, cell by cell

| Cell | BUSINESS-MODEL.md says | Code / DB does | Match |
|---|---|---|---|
| coupon / payment flow | customer pays only the coupon amount on site; balance at the business | `commission.ts`: coupon price mandatory, `0 < couponPrice <= unitPrice`, `balanceDueAtBusiness = face - paidNow`; `vouchers_conservation` CHECK `face = coupon_price + remaining_due` | **MATCH** |
| coupon / escrow | "אין Escrow, אין העברת כסף לספק" | `SettlementState` type refuses escrow states; state machine has no edge into them; live `fn_order_items_settlement_status_guard` has only outbound escrow edges; `escrow_holds` has 2 legacy rows (2026-07-21) and no writer | **MATCH** (legacy residue noted) |
| coupon / split timing | 100% stays on the platform | `platformFee = customerPaysNow`, `supplierImmediate = 0`, `platformPercentBps = 10000` snapshotted; finalize marks the line `split_executed` "at 100/0" | **MATCH** |
| coupon / refund | (not stated in BUSINESS-MODEL; BUSINESS-RULES §8) | refund only while all vouchers `issued`; `refunds_fee_within_statutory_cap`, `refunds_no_fee_when_our_fault`, `refunds_wallet_has_no_fee`, `refunds_completed_has_money` CHECKs live; `refund_due_by` forced by trigger | **MATCH** |
| coupon / audit | (not stated) | `payment_events` append-only; 34 `audit_*` triggers live incl. `vouchers`, `voucher_redemptions`, `refunds`; `settlement_events` journal | **MATCH** (0 rows yet: no real purchase) |
| physical / payment flow | 100% on site | `finalize.ts` physical branch; `order_items_money_conservation` | **MATCH** |
| physical / split | `platform_percent` set on the product page stays with the platform, rest to the supplier; snapshot immutable | `buildOrderItemSnapshot` copies the percent; `products_split_pair_sums_to_100` and `order_items_split_pair_sums_to_100` CHECKs; `split_executions_conservation`; residual is `face - fee`, never a second percentage | **MATCH** |
| physical / payout | "העברה לספק: ידנית בהתחלה, אוטומטית בהמשך" | `generate/approve/mark_paid/cancel_payout_statement` RPCs (152) with `is_admin()` gates, `payout_available_at` business-day hold; no automated bank transfer (`TransferFromDigitalBank` from the design doc was never built) | **MATCH** (manual stage) |
| recurring / flow | monthly via Cardcom token | `planSubscriptions` + `createSubscriptionsForOrder` at finalize when a token was saved; `/api/cron/subscriptions` renews via `ChargeToken.aspx`; `subscription_charges_split_is_exact` | **MATCH** in code; **cron not scheduled** (see CARDCOM-AUDIT R2) |
| recurring / split | same `platform_percent` per charge | `subscriptions.platform_percent` 0..100 CHECK, `subscription_charges` split CHECK | **MATCH** |
| supplier details on every product | mandatory | `enforce_product_approval` trigger + `assertPublishable`; 0 of 45 active products lack `platform_percent` | **MATCH** |

---

## 3. Gaps between the brief and the model (for the brief's author)

1. The brief asked to verify "coupon escrow" and "no Escrow on vouchers" in the same breath. The system has **no escrow of any kind**; the second phrasing is the rule, the first is the abolished design. `docs/CARDCOM-ARCHITECTURE.md` §3.1 to 3.2 describe the abolished flow and are banner-marked HISTORICAL.
2. The brief names `docs/BUSINESS-MODEL-RULES.md`. The rules live in `docs/BUSINESS-MODEL.md` (the Hebrew source of truth) and `docs/BUSINESS-RULES.md` (the enforcement map).
3. `service` exists as an enum value with no written rule. It behaves as physical. Either document it or drop the label from new product forms.

---

## 4. Live counters behind the matrix (2026-09-08)

| Table | Rows | Note |
|---|---|---|
| `order_items` | 3 | 2 coupon lines in legacy `escrow_held`, 1 physical line `split_executed` with `platform_percent = 100` (a fixture) |
| `payments` | 2 | both `succeeded`, E2E fixtures 2026-07-21 |
| `vouchers` | 0 | |
| `settlement_events` | 0 | |
| `payment_events` | 0 | |
| `escrow_holds` | 2 | legacy, `held`, no writer |
| `payout_statements` | 0 | |

No real customer has completed a purchase. Every rule above is enforced by a
CHECK, a trigger, a type or a `throw`; none of them has yet been exercised by
real money.
