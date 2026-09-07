# RLS test plan

Roles: `anon`, `authenticated` (customer), `content_uploader`, `support`, `admin`/`super_admin`, membership owner/manager/scanner, `service_role`.

For every public table in `supabase/rls-manifest.json`: SELECT/INSERT/UPDATE/DELETE × each role = allow or 42501. CI cannot hit live DB; pin is the manifest + `rls-write-policies` (no `USING (true)` writes) + SQL files under `tests/sql/` when run in a DB job.

Must-have scenario tests:

- Anon writes only `carts` via constructed `session_id=`.
- Customer cannot SELECT others' orders/vouchers/wallet.
- Review INSERT unpaid → 42501.
- Uploader money actions 403 even if table UPDATE exists.
- Support cannot `refundOrder`.
- Scanner cannot UPDATE stock/members.
- Zero-policy tables: empty for user JWT (`payment_webhook_events`).
- Fossil wallet deny.
- `is_admin` / `is_supplier_member` anon execute stays (165 cancelled).
- service_role bypasses privilege trigger; tests must not rely on client to assign admin.

Re-measure: `node scripts/check-rls.mjs` (human; this pack does not run).

---

## Second pass

Zero-policy is deny. Anon carts via constructed session_id=. Scanner cannot UPDATE stock. Manifest pin is not live drift. 165 cancelled.
