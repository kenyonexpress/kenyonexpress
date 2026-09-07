# W31 Push

Code-agent spec. Cron already drains Expo push as a second leg on `notification_outbox`. Only kinds with a template in `lib/push/templates.ts` push; others settle `push_status = 'none'`.

---

## What the wave builds

1. Register token via `/api/app/push-tokens` (auth). One user, many devices.
2. Transactional: voucher issued, expiry. Marketing push is a separate opt-in.
3. Do not push amounts that disagree with the wallet (use payload agorot).

---

## Tables

`push_tokens`, `notification_outbox` push_* columns (migration 114).

---

## RLS

Owner INSERT/DELETE own tokens. service_role drain.

---

## Money invariants

Push is not a ledger. Kill switch skips send, does not delete the outbox row.

---

## Tests

`src/lib/push/expo.test.ts`, `templates.test.ts`. Unknown kind → `none`, not retry forever. Token from another user 42501.

---

## Feature flag

`PUSH_ENABLED`. Off: tokens may still register; drain no-ops push leg. `KILL_SWITCH_NOTIFICATIONS` also skips.

---

## Close

Three kinds max unless templates + CHECK expanded together (W45).

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
