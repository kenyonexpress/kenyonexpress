# W09 Analytics

Code-agent spec. Client eight events ingest. Four server names (`begin_checkout`, `purchase`, `voucher_redeemed`, `order_refunded`) are skipped until `169_analytics_server_event_names.sql`. CI registry test diffs the **pending file**, not production.

---

## What it builds

1. Human applies the analytics 169 file (not `169_audit_full_coverage.sql`).
2. Staging pay produces a `purchase` row. Admin "0 sales" is not a closed till until then.
3. `/api/a` remains client names only. Server events only via `trackServerEvent`.
4. `anonymous_id` from httpOnly `ke_session_id`. Client `session_id` is a different field.

---

## Tables

Ingest table used by `fn_ingest_analytics_events`, `analytics_event_definitions`.

---

## RLS

Browser cannot insert `purchase`. DEFINER ingest. Rate limit on `/api/a`.

---

## Money invariants

Events are not the ledger. Do not fake `purchase` rows to "fix" GMV. Props that carry amounts must be already snapshotted integers.

---

## Tests before close

Client POST `purchase` rejected. Live whitelist probe (today G20 is a gap). `whatsapp_click` still client. Batch max 20, props 4KB, no PII.

---

## Feature flag

None. Skip-unknown is designed until 169. Webhook must not 500 when ingest skips.

---

## Docs updated

`OBSERVABILITY-MAP.md`, `LAUNCH-BLOCKERS.md` (169 is not H0–H8), `TEST-MAP.md` G20.

---

## Edge cases

Duplicate pending number 169: full filename only. Consent: analytics cookie `ke_consent` vs newsletter confirm are different.

---

## Hebrew UX strings

None on the storefront. Admin empty state: אין אירועי רכישה עדיין (honest: ingest may be dropping them).

---

## Open questions

| Q | Best answer |
|---|---|
| Has 169 been applied? | **Treat as no** until a live `purchase` row exists. |
