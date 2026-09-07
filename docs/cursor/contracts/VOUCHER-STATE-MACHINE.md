# Voucher state machine

Enum `voucher_status`: `issued`, `redeemed`, `expired`, `cancelled`, `refunded`.

There is **no** status trigger named in older comments as missing; 166 `voucher_transition_guard` is the DB guard (applied historically). Application mirror: `src/server/domain/vouchers/state-machine.ts`.

---

## Who may trigger

| From | To | Who | How |
|---|---|---|---|
| (create) | issued | finalize | one row per unit, cap quantity |
| issued | redeemed | member till | `redeem_voucher` WHERE status issued wins |
| issued | expired | expire cron | lock |
| issued | refunded | admin `refundOrder` planner | only still issued |
| issued | cancelled | admin | rare; must be in the guard |
| redeemed | * | nobody | terminal |
| expired | * | nobody | terminal |
| refunded | * | nobody | terminal |
| cancelled | * | nobody | terminal |

Forbidden: `refunded → issued`, `redeemed → issued`, client UPDATE, body-supplied supplier success, lookup that consumes.

---

## Scan outcomes (HTTP / RPC)

DB enum `voucher_scan_outcome` (11): success, already_redeemed, expired, cancelled, refunded, wrong_supplier, not_found, invalid_signature, invalid_request, unauthorized, rate_limited.

HTTP batch may add `error` (RPC transport). Retry only `error` and `rate_limited`.

Same idempotency key: first outcome. Same key different body: `invalid_request`.

---

## Gift

Issued to recipient after pay. Claim does not new-purchase. Transfer wave skipped (W32).

---

## Open questions

| Q | Best answer |
|---|---|
| Partial balance on one QR? | **Forbidden** (W31). |

---

## Second pass (till)

- Lookup must not consume. Redeem is `WHERE status = 'issued'`. Double scan is `already_redeemed`, not a second meal.
- `wrong_supplier` comes from membership `supplier_id`, never from the request body.
- Outcomes: retry only `error` and `rate_limited`. Do not retry success.
- Expire cron `issued → expired` does **not** call Cardcom. Money already taken at pay.
- After `redeemed`, card refund of consumed value is planner refuse. Wallet goodwill is admin only.
- Gift claim is not a second purchase. W32 transfer is skipped for v7.
- Scanner is `supplier_members.member_role`, not `profiles.role = vendor`.

