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

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
