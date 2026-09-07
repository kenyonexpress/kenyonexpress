# W39 Loyalty

Code-agent spec. Cashback already exists: snapshot at commission, credit at finalize from `platform:cashback_reserve`, `order:<id>:cashback`. `cashback/engine.ts` has first-purchase / every-fifth schedule **and** product `cashback_percent`. Do not run two schedulers that both credit.

---

## What it builds

1. Pick **one** cashback source of truth: product percent snapshotted on the line (current checkout) **or** the engine schedule, not both without a written rule.
2. Best answer: product `cashback_percent` at checkout is live; engine tests exist for a schedule that may be unused. Confirm callers. If engine is dead, do not wire it in this wave.
3. No points currency. Wallet ILS (agorot internally) only.

---

## Tables

`wallet_accounts`, `wallet_entries`, `order_items.cashback_amount_agorot`, `cashback_rules` (4 policies in manifest).

---

## RLS

Wallet owner SELECT. Transfer DEFINER. Fossil wallet tables deny.

---

## Money invariants

Integer. Credit once. Scan does not credit. `fn_wallet_transfer` `p_amount_ils` boundary. Commission comment "after redemption" is **stale**; finalize is truth.

---

## Tests before close

`cashback/engine.test.ts` vs checkout wiring. Finalize credit idempotent. G6 double credit.

---

## Feature flag

Product percent 0 = off. Do not add points.

---

## Docs updated

`LEDGER.md`, `MONEY-INVARIANTS.md`, `DATA-FLOW.md`.

---

## Edge cases

Wallet-only pay: cashback of zero on-site is zero. Referral min uses on-site cash, not this credit.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Cashback | קאשבק לשימוש באתר |
| Credited | זוכה לארנק |

---

## Open questions

| Q | Best answer |
|---|---|
| Engine vs product percent? | **Product percent** is what checkout sends. Treat engine as unused until a caller is grepped on a code branch. |

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
