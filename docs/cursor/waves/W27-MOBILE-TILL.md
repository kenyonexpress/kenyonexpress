# W27 Mobile till

Code-agent spec. `apps/mobile` is a second RPC caller of the same Postgres. Grants audits that grep only `src/` under-count.

---

## What the wave builds

1. Same `redeem_voucher`, `verify_supplier_staff_pin`, `supplier_app_context`. Lookup before consume.
2. Offline queue: retry **only** `error` and `rate_limited`. Settled outcomes (including `expired`) must drop (see `offline-scan.ts`). `error` is **not** in `voucher_scan_outcome` enum; the HTTP batch route writes it when the RPC fails.
3. PIN is bcrypt on `supplier_staff`, 15/hour, not a login. Membership is `supplier_members`.

**Do not build.** Embedding `service_role` in Expo config (R26). Cardcom in the till app.

---

## Tables

`vouchers`, `voucher_redemptions`, `supplier_members`, `supplier_staff`. Idempotency on `voucher_redemptions.idempotency_key`.

---

## RLS / grants

Anon + user JWT. DEFINER RPCs derive supplier from `supplier_members`. Body must not supply `supplier_id` as authority (`scan-context.test.ts`).

---

## Money invariants

Scan does not move Cardcom money. Cashback is **not** credited at scan (finalize already did). Scanner cannot farm cashback.

---

## Tests

Redeem routes, PIN route, offline-scan settled vs retryable, `apps/mobile` has no service key string.

---

## Feature flag

None. Rate limit 30/min/user on scan (Upstash or `check_rate_limit` service_role).

---

## Close

No service_role in the binary. Offline queue cannot loop on `expired`. Lookup does not consume.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
