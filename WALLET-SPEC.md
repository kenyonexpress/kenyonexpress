# WALLET-SPEC

Internal cashback wallet. Never withdrawable, never transferable to another
user, never a bank payout. Copy on `/account/wallet`:

`הארנק משמש לתשלום חלקי או מלא באתר. אין משיכה למזומן ואין העברה למשתמש אחר.`

Live tables: `wallet_accounts` + `wallet_entries`. Fossil (empty, do not
write): `wallet_balances` + `wallet_transactions`. Reads use the
request-scoped Supabase client so RLS on `auth.uid()` is the boundary.

Money: integer agorot. Canonical module `src/lib/money.ts` (not
`packages/money.ts`, which does not exist).

---

## 1. Balance calculation

Balance is the sum of signed `wallet_entries` for the owner's account, not a
cached integer that can drift. `getWalletSummary` reads the live account
through the owner policy.

Every movement goes through `fn_wallet_transfer` (SECURITY DEFINER,
service_role / definer path). Application code does not INSERT into
`wallet_entries` with a random reason.

Idempotency keys on transfers (examples):

- purchase cashback: derived from the order
- expiry credit: `voucher:{id}:expiry_credit` (lands once even if cron retries)
- refund-to-wallet: refund id

`v_wallet_balance_drift` exists to scream if the fossil pair disagrees with
the live pair. Write only the live pair.

---

## 2. Cashback rules engine

Per **product**, column `products.cashback_percent`, 0 to 100, default 0.
Absent means zero. It is an opt-in perk, unlike `platform_percent` which is
mandatory and has no default.

Checkout snapshots the percent onto the order line at purchase (same moment
as `platform_percent`). Changing the product later does not rewrite old
cashback.

Credit happens after the order is paid (finalize path), not at add-to-cart.
Amount is `applyBp` on the on-site charge, integer, through `src/lib/money.ts`.
A zero result sends no `cashback_credited` mail (celebrating ₪0 is worse than
silence).

Admin sets the percent on the product form. `content_uploader` must not be
the person inventing a cashback rate that spends platform money; treat it as
a money field.

---

## 3. Expiry policy for wallet credit

Wallet **balance** has no shipped TTL on `/account/wallet`. There is no
"these shekels vanish on date X" line in the UI.

What does expire is the **voucher**. Nightly `/api/cron/expire-vouchers`:

1. `expire_vouchers()` flips due `issued` rows to `expired`. Moves no money.
2. `credit_expired_vouchers()` credits the customer's wallet with what they
   **paid online** for that voucher. Expiry is not forfeiture (C6). Cap 500
   rows per run.

Scan-time safety does not depend on this job: `redeem_voucher` re-checks
expiry in the same UPDATE.

Enum fossil `wallet_tx_type` includes `expire`. That is the old
`wallet_transactions` vocabulary. Do not drive a new product rule off it.

---

## 4. Usage at checkout (partial payment)

Shopper applies wallet up to `min(balance, on-site charge)`.
`clampWalletIls` caps the field so a ₪500 balance on a ₪50 order cannot post
500 and get an English RangeError.

Rules:

- Floor at 0. A negative is "no wallet", not a credit to us.
- Two decimal places max (agorot). Third decimal rounded in the field.
- Empty field stays empty (do not fight the cursor with a written `0`).
- Server: `wallet_applied_agorot` on the order. Remainder charged through
  Cardcom. Wallet debit is a ledger entry keyed to the order.

Guest checkout: no wallet. Wallet requires a session.

---

## 5. Zero balance UI

`/account/wallet`:

- Amount still renders (`₪0.00` via `formatIls` / `shekels`).
- Note about internal use stays visible.
- Ledger empty state: `עדיין אין תנועות בארנק.`
- Checkout: hide or disable the apply field when balance is 0 so nobody
  types theatre.

Do not upsell "add funds". There is no top-up.

---

## 6. Transaction history display

Table: date, action (Hebrew `walletReasonLabel`), signed amount, link to
order when present.

Known reasons:

| Key | Label |
|---|---|
| order_cashback | קאשבק על רכישה |
| order_spend | שימוש בארנק |
| order_refund | החזר על ביטול |
| admin_credit | זיכוי ידני |
| coupon_expired | קרדיט על קופון שפג |

Unknown keys render as the raw reason, not as a blank. Direction CSS:
credit vs debit.

---

## 7. Reconciliation with orders

| Check | How |
|---|---|
| Cashback for order O | entry keyed to O, amount matches snapshotted percent × on-site charge |
| Wallet applied on order O | `orders.wallet_applied_agorot` equals the debit entry |
| Expired voucher V | credit keyed `voucher:V:expiry_credit` equals `coupon_price` paid online, and voucher is `expired` |
| Double credit | unique idempotency on the RPC |

Do not reconcile against `wallet_balances`. That table is empty on purpose.

Admin analytics does not treat wallet spend as GMV. GMV is what Cardcom
charged plus wallet applied on the order, counted once from `orders`.
