# W18 Mobile

Code-agent spec. `apps/mobile` till RPC client. Web PWA is W41. This wave is the **scanner app**.

---

## What it builds

1. Lookup then redeem. Idempotency key. Offline queue retries only `error` and `rate_limited`.
2. PIN 15/hour, bcrypt `supplier_staff`. Membership `supplier_members`.
3. No Cardcom. No service_role in Expo.

---

## Tables

`vouchers`, `voucher_redemptions`, `supplier_members`, `supplier_staff`.

---

## RLS

JWT + DEFINER RPCs. Supplier id from membership, never body.

---

## Money invariants

Scan does not credit cashback. Does not refund. Does not change snapshots.

---

## Tests before close

Redeem/lookup/batch/pin routes. `offline-scan.test.ts`. Grep the mobile app for service keys.

---

## Feature flag

None. Rate 30/min/user scan.

---

## Docs updated

`VOUCHER-STATE-MACHINE.md`, `ROLE-VENDOR.md`, `SECURITY-REVIEW.md`.

---

## Edge cases

Membership read failure must not look like `not_found` (rbac.ts incident). Eleven enum outcomes + HTTP `error`.

---

## Hebrew UX strings

Till copy comes from server outcomes: לא נמצא / כבר מומש / פג / ספק אחר / אין הרשאה / יותר מדי ניסיונות.

---

## Open questions

| Q | Best answer |
|---|---|
| Offline redeem without network? | Queue locally, drain when online. Never a local "success" that the DB did not decide. |
