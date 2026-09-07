# W10 Analytics server events (pending 169)

Code-agent spec. Client eight events ingest today. `SERVER_EVENT_NAMES` (`begin_checkout`, `purchase`, `voucher_redeemed`, `order_refunded`) are **silently skipped** until `169_analytics_server_event_names.sql` is applied. CI `registry-matches-migration.test.ts` diffs the **pending file**, not production (TEST-MAP G20).

**Human apply.** This wave's SQL is a hard stop. The code agent wires nothing that assumes the whitelist is live.

---

## What the wave builds

1. Human applies 169 (analytics filename, **not** `169_audit_full_coverage.sql`).
2. Post-apply: a staging paid order produces a `purchase` row.
3. Admin "0 sales" is no longer treated as a closed till (it was ingest).
4. `/api/a` stays client-only names. Server events stay `trackServerEvent`, never accepted from the browser.

---

## Tables

`analytics` events table used by `fn_ingest_analytics_events`. `analytics_event_definitions` registry must move with the whitelist.

---

## RLS

Unchanged. Ingest is DEFINER / service_role. Browser cannot insert `purchase`.

---

## Money invariants

Event props may include amounts **already snapshotted**. The event is not a ledger. Do not "repair" GMV by inserting fake `purchase` rows.

---

## Tests that must exist before close

- Live probe or an integration test that fails if production whitelist lacks the four names (today's test is insufficient: G20).
- `/api/a` rejecting `purchase` from the client.
- `whatsapp_click` still in the client eight.

---

## Feature flag

None. Until 169 applies, skip is the designed behaviour. Do not 500 the webhook if ingest skips.

---

## Docs / edges / close

`OBSERVABILITY-MAP.md`, `LAUNCH-BLOCKERS.md` (169 is not H0–H8; it is dashboard honesty). Duplicate pending number 169: **full filename only**. Close: production SELECT of `purchase` after one staging pay, or documented skip remaining.
