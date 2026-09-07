# Order state machine

Live statuses are the deployed enum, **not** `authorized`/`captured`/`supplier_settled` (those 22P02). Mirror: `src/server/domain/orders/state-machine.ts` + 137 `fn_orders_status_guard`.

Typical: `pending` → `paid` (only `finalizeOrder`) → `partially_fulfilled` / `fulfilled` → `refunded` / `cancelled`. Exact member list: `src/server/domain/orders/status-transitions.json` and generated types.

Token charge: `payments.status` `initiated → succeeded|failed`, skip `redirected`.

---

## Who may trigger

| Transition | Who |
|---|---|
| create pending + reserve stock | `beginCheckout` service |
| pending → paid | finalize after GetLpResult |
| paid → fulfilled* | redeem / ship admin |
| paid → refunded | `refundOrder` admin |
| pending → cancelled / expired | TTL / user abandon / stock cron |

Forbidden: `paid → pending`, client-set status, catch-and-set past `23514`.

---

## Disputed

**Not** an enum member unless a human migration adds it. Ops: audit + freeze refunds + `RUNBOOK-CHARGEBACK.md`. Do not write `disputed` into `orders.status`.

---

## Settlement on lines

`order_items.settlement_status`. Coupon: `split_executed` with supplier 0. Escrow held as a destination is refused by tests.

---

## Open questions

| Q | Best answer |
|---|---|
| Exact enum list? | Generated `database.ts` `order_status`. Do not copy from May architecture briefs. |

---

## Second pass (pay writer)

- Only `finalizeOrder` writes `paid`. Webhook timeout → stranded cron, not a status UPDATE.
- `paid → pending` is forbidden even during rollback of a deploy (`ops/RUNBOOK-ROLLBACK.md`).
- `disputed` is not a status. Chargeback stays `paid`/`refunded` plus ops note.
- Coupon lines: `split_executed` with supplier 0. Do not set escrow_held.
- Mixed cart: one order, multiple `order_items`. Review and refund are per line / per unit, not "the order is one voucher".

