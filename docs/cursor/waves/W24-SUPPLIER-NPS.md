# W24 Supplier NPS

Code-agent spec. Do **not** reuse `reviews` (those are product stars, paid-buyer, W03). NPS is a **business** score after a successful scan.

---

## What the wave builds

1. Optional 0–10 after `redeem_voucher` success, customer-side, once per redemption.
2. Aggregate for admin and the supplier owner. Public directory does not show NPS until a minimum N (recommend 10) to avoid targeting a shop with 1 score.
3. No money: NPS must not change `platform_percent` or search rank in v1.

---

## Tables

New table only with a human migration: `supplier_nps` keyed on `voucher_redemptions.id` UNIQUE. Until then, skip the wave.

---

## RLS

Customer INSERT own, for a redemption of their voucher. Supplier SELECT aggregate of self. Admin SELECT all. Anon: nothing.

---

## Money invariants

Forbidden: auto-raise commission for low NPS. Forbidden: wallet credit for 10/10 (that's a campaign, W08, funded from platform).

---

## Tests

Cannot score a failed scan. Cannot score another user's redemption. Unique per redemption. Public page hidden below threshold.

---

## Feature flag

Off by default. Off: no form, existing rows kept.

---

## Close

Either skipped (no table) or isolated from reviews and from money.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
