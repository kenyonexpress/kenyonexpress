# W07 Referrals polish

Code-agent spec. Core is live: `referrals`, `fn_complete_referral`, `completeReferralForOrder` from `finalizeOrder`. MEGA-BLOCK-AUDIT STEP 16 closed "build referrals". This wave is **product chrome and fraud ops**, not a second bonus engine.

---

## What the wave builds

1. `/account/referrals` copy that matches runtime: bonus lands on **paid** on-site cash, not pending, not sticker subtotal, not wallet-only orders.
2. Admin `/admin/referrals` settle UI for rows that logged `complete_failed` after a charge (finalize must not throw).
3. Do not add a TypeScript "is this their first order" check. SQL already decides.

**Do not build.** Credit at scan. Credit on pending. A second fingerprint in TS. Raising finalize when the RPC fails.

---

## Tables

`referrals`, `referral_signals` (server-only, zero-policy), `referral_program_settings`, `wallet_accounts`, `wallet_entries`. Writes of money only through `fn_complete_referral` → `fn_wallet_transfer`.

---

## RLS

- Shopper SELECT own referral row. INSERT code via existing action (`EnsureCodeState`).
- `referral_signals`: service_role only.
- Admin UPDATE of status: `requireSection` money. content_uploader 403.

---

## Money invariants

- Integer agorot. `fn_wallet_transfer` still takes `p_amount_ils` (sanctioned RPC boundary: convert with `agorotToIls` after integer math).
- Qualifying amount is **on-site paid**, not face value. Wallet-only orders do not qualify (cash funds the bonus).
- Idempotency key inside the RPC. Replay finalize is a no-op.
- Failure after charge is **logged**, never thrown (stranded-pay is worse than a missed bonus).

---

## Tests that must exist before close

Existing: `referrals.test.ts`, `complete.test.ts`, `claim.test.ts`, `program.test.ts`, `wired.test.ts`. Add: admin settle does not call `fn_wallet_transfer` twice for the same order; complete uses on-site total not subtotal.

---

## Feature flag

None. Program settings row is the off switch (min/cap/window = 0).

---

## Docs / edges / close

Update `DATA-FLOW.md` §6, `LEDGER-CONTRACT.md`. Self-referral, same card fingerprint, monthly/yearly caps stay in SQL. Close: UI matches SQL, admin can settle a logged miss, no second credit path.
