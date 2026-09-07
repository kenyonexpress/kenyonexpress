# W13 Data integrity

Code-agent spec. Money CHECKs (167 applied historically), order/voucher transition guards (137, 166). Types-ahead `database.ts` can lie (`payout_statements`, `escrow_holds`).

---

## What it builds

1. Application refuses to name columns the generation probe has not seen (`order-money-columns.ts`). `ils` generation is production.
2. Pending duplicate numbers 169–172: inventory test must fail on duplicate `\d{3}_` (G15 still a gap).
3. `wp_import` schema shadows public names: always schema-qualify.
4. Fossil `wallet_balances` / `wallet_transactions`: do not write. Live is `wallet_accounts` / `wallet_entries`.

---

## Tables

All money tables. `legacy_percent_archive_112`. Fossil wallet tables.

---

## RLS

Zero-policy means deny, not "add a policy" (172_rls vs 172 hide master: different files).

---

## Money invariants

Conservation CHECKs are not RLS; `23514` fires for service_role too. `round2` in `completeSplitPair` is float on **percents**, then bp conversion. Do not use `round2` on agorot.

---

## Tests before close

`enum-declarations.test.ts`, `order-money-columns.test.ts`, `pending-migrations-inventory.test.ts` uniqueness, `wallet-rls.test.ts` fossil deny.

---

## Feature flag

None.

---

## Docs updated

`MIGRATION-PLAYBOOK.md`, `OPEN-QUESTIONS.md` Q1–Q6, `MONEY-INVARIANTS.md`.

---

## Edge cases

`cashback_bp` vs `cashback_percent`: hosted still percent (optional-columns). Naming the wrong one is `42703`.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Missing split | למוצר "X" לא הוגדר פיצול עמלה |
| Missing coupon price | למוצר "X" לא הוגדר מחיר קופון |
| Unpriced physical | למוצר "X" לא הוגדר מחיר |

---

## Open questions

| Q | Best answer |
|---|---|
| Drop `escrow_holds`? | Types exist; coupon path must not write. Drop is a human migration. Do not revive escrow in UI. |
