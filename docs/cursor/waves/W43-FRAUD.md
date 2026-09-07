# W43 Fraud

Code-agent spec. Referrals already fingerprint + caps in SQL. Implausible discount. Rate limits. Webhook secret. Compromised keys.

---

## What it builds

1. Keep referral fraud in SQL, not a TS first-order check.
2. 95% discount ceiling. 172 stock 0 on master SKU.
3. Redeem rate 30/min. PIN 15/hour. Checkout rate limit.
4. Same-card / same-device referral refuse stays in `fn_complete_referral`.
5. Do not credit cashback at scan (farming).

---

## Tables

`referral_signals` (zero-policy), `rate_limits`, `audit_log`, `voucher_redemptions.ip_address` (nobody ages it; 157 only audit IPs).

---

## RLS

Signals server-only. Do not expose fingerprints to admin CSV without a purpose.

---

## Money invariants

Wallet-only orders do not qualify for referral (no cash in). Self-ref refuse.

---

## Tests before close

Referral complete/claim/program. Implausible discount. Rate-limit headers. Redeem unauthorized.

---

## Feature flag

None. Caps in `referral_program_settings`.

---

## Docs updated

`RUNBOOK-SUSPECTED-FRAUD.md`, `SECURITY-REVIEW.md`.

---

## Edge cases

Support must not have a "grant wallet" without audit. content_uploader cannot.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Generic refuse | לא ניתן להשלים את הפעולה |
| Rate | יותר מדי ניסיונות |

Do not explain fingerprint details to the user.

---

## Open questions

| Q | Best answer |
|---|---|
| Age redemption IPs? | **Not 157.** Separate decision. D-shaped data on a C clock today. |

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
