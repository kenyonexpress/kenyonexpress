# Runbook: chargeback

1. Cardcom/issuer notice. Do not `paid → pending`.
2. If voucher still `issued`: admin refund planner (may CancelOnly same day).
3. If `redeemed`: card refund of consumed value is the planner refuse. Evidence: redemption row + till. Chargeback still happens at the acquirer; ops absorbs; do not re-issue the QR.
4. Journal `chargeback` if ledger event exists; else audit + `refunds` row.
5. `disputed` is not an order status. Keep `paid`/`refunded` + ops note.

---

## Second pass

No `disputed` order status. Redeemed blocks card refund of consumed value. Do not re-issue the QR. Journal `chargeback` if the event exists.
