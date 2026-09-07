# Refund state machine

Planner: `src/server/domain/orders/refund.ts`. Orchestration: `refundOrder` admin only. Idempotent if already `refunded`.

---

## Card vs wallet

- Card / original method: only if consumed value was not delivered. **Any redeemed unit blocks card refund** of that consumed value. Goodwill → wallet, different movement.
- Wallet: `refund-wallet.ts` + `fn_wallet_transfer`.
- Same Israel calendar day as charge: Cardcom `CancelOnly` (no money move) vs after transmission: credit. Partial never CancelOnly.

Cancellation fee: `applyBp` 500bp, cap 10000 agorot, zero if defect.

---

## Partial

`partialAmountAgorot` set → no cancellation fee. Remaining issued vouchers can refund; redeemed cannot go back to card.

Physical `split_executed`: `supplierDebits` claw back residual (accounting), else platform pays twice.

---

## Who

Admin / super_admin. Support 403. Uploader 403. Customer has no refund action (legal 14-day: ops/admin).

---

## States

`refunds` row + `orders.status` refunded + vouchers issued→refunded + settlement line transitions. `refund_state` enum must match DB (not brief aliases, 22P02).

Provider error after we decided: `PROVIDER_ERROR` / `MANUAL_RESOLUTION` + ntfy. Do not lie `ok: true`.

---

## Open questions

| Q | Best answer |
|---|---|
| Customer self-service refund? | **Not v1.** Admin planner only. |
