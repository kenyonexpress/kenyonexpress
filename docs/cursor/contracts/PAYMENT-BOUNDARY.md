# Payment boundary

Merchant of record: the **platform**. Suppliers are not Cardcom sub-merchants.

---

## What crosses to Cardcom

- Low Profile create: amount **already** computed in agorot on the server, terminal, API name/password, webhook URL `?s=<secret>`.
- Token charge server-to-server (`submitCheckout`).
- GetLpResult server-to-server (only trusted amount, status, token).
- Refund credit / CancelOnly.

---

## What never crosses

- `platform_percent`, supplier residual, cash-at-till, wallet internal transfer, voucher codes as Cardcom line items (unless already designed; v1 charges the on-site total).
- Client prices. Client only sends ids + consent + idempotency key.
- POST body of the webhook as money (unsigned). `?s=` compared constant-time to CURRENT and RETIRING secrets.

---

## Webhook contract

`POST /api/payments/cardcom/webhook?s=`

1. Secret match or 401/403 (do not leak which).
2. Journal `payment_events` first.
3. Dedup `(provider, external_event_id)`; 23505 → 200 replay.
4. GetLpResult. Amount must match order.
5. `finalizeOrder` only writer of `paid`.
6. Return 200 when processed or replay. Timeout: stranded cron.

No HMAC header (Cardcom does not sign). Do not invent one (would drop all callbacks).

---

## Idempotency

Checkout `idempotencyKey`. Wallet `order:<id>:cashback`. Referral inside RPC. Voucher issue cap on `order_item_id`.

`CHECKOUT_ENABLED`, mock unset, sandbox boot-fail.

---

## Open questions

| Q | Best answer |
|---|---|
| Multi-terminal? | `cardcom` accounts helper exists; do not cross-charge (`CardcomAccountError`). |

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
