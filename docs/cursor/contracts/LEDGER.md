# Ledger contract

Runtime wallet: `wallet_accounts` + `wallet_entries` + `fn_wallet_transfer`. Application `src/lib/ledger.ts` posts journals (`fn_post_journal`) with sum-zero lines. Fossil: `wallet_balances` / `wallet_transactions` (deny). View `v_wallet_ledger` for the account page (may expose `*_ils`; parse, do not ×100).

`fn_wallet_transfer` takes `p_amount_ils numeric`. Callers convert with `agorotToIls` **after** integer agorot math. That RPC boundary is the sanctioned exception.

---

## Account kinds (`LedgerAccountKind`)

`cardcom_clearing`, `platform_revenue`, `vat_output`, `supplier_payable`, `customer_wallet`.

House/cashback reserve: `wallet_accounts.code = platform:cashback_reserve` (`user_id` null). House may go negative (funding side). User accounts cannot (146).

---

## Event types (`LedgerEvent`)

`order_paid`, `coupon_issued`, `coupon_redeemed`, `coupon_expired`, `physical_settled`, `refund`, `chargeback`, `wallet_cashback_earned`, `wallet_spent`, `wallet_expired`, `manual_adjustment`, `reversal`.

Corrections are new `reversal` journals (`postReversal`), never edits. Idempotency `eventKey` (example `order:<id>:paid`, `order:<id>:cashback`).

---

## Balance derivation

Balance = sum of entries for the account (or the transfer function's authoritative row). UI must not add floats. Display `formatIls`.

---

## How each product movement appears

| Movement | What writes | Key |
|---|---|---|
| Pay (card) | finalize + journal `order_paid` | payment id / order id |
| Coupon issue | vouchers rows; journal `coupon_issued` if wired | order_item unit |
| Coupon redeem | `redeem_voucher`; **no** cashback here | redemption idempotency |
| Coupon expire | expire cron; `coupon_expired` if wired | voucher id |
| Physical split | snapshot `supplier_immediate_agorot`; `physical_settled` | line id |
| Refund to wallet | `refund-wallet.ts` `fn_wallet_transfer` | derived from order, not random |
| Refund to card | Cardcom credit/CancelOnly; `refunds` row; journal `refund` | refund id |
| Cashback | finalize `creditCashback` from reserve | `order:<id>:cashback` |
| Referral | `fn_complete_referral` → transfer | inside RPC |
| Loyalty top-up | **Do not** add a second credit path. Manual: `manual_adjustment` audited |
| Spend wallet | finalize `spendWallet` | order id |

Coupon `supplier_payable` is **0**. Do not post escrow holds. `escrow_holds` table may exist in types; coupon path must not write it.

---

## Reconciliation invariants

1. Journal lines sum 0 (`assertBalanced` + DB trigger 050 if applied).
2. Cardcom terminal vs `payments` (`terminal-reconciliation.ts`), not vs POST body.
3. `payment_events` append-only. Replay 200.
4. Charged-not-finalized: stranded cron, ntfy, never "fix" by inserting a fake purchase event.
5. Israel calendar day for CancelOnly.

---

## Open questions

| Q | Best answer |
|---|---|
| Is `postJournal` on every finalize? | Read `finalize.ts` on the code branch. Wallet transfer for cashback **is** there. Do not assume 050 trigger exists if unapplied. |
