# W29 Gift vouchers

Code-agent spec. Gift issue at finalize. Claim token is a capability (no existence oracle). `/gift/[token]`.

---

## What it builds

1. Buyer marks gift at checkout. Voucher issued to recipient after pay, not a second Cardcom charge.
2. Claim does not create a new purchase.
3. Deletion of sender: hash gift contact on sent gifts (Q24 conservative; confirm 150). Keep voucher row.

---

## Tables

`vouchers` gift columns, `orders.gift_recipient_*`, `notification_outbox` `voucher_gifted`.

---

## RLS

Claim via token, not uid. After claim, recipient uid owns SELECT. Issuer cannot redeem.

---

## Money invariants

Gift is the same prepaid coupon. No extra platform fee. Refund of a claimed/redeemed gift follows refund planner (issued only for card).

---

## Tests before close

`gift-vouchers.test.ts`, `claim-token.test.ts`. Second purchase on claim forbidden. Token oracle forbidden.

---

## Feature flag

None. Unconfigured gift: omit UI.

---

## Docs updated

`DATA-RETENTION.md` Q24, `CUSTOMER-FAQ.md`.

---

## Edge cases

Guest buyer gift: need an email on the order. Wrong token: identical 404.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Gift | שליחה במתנה |
| Claim | מימוש המתנה |
| Claimed | הקופון מחכה אצלך בחשבון |

---

## Open questions

| Q | Best answer |
|---|---|
| Transfer after claim? | W32. v1 gift is one claim, not a forward chain. |

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
