# G106 — SUPPLIER-APPLY (/supplier/apply click-wrap + ₪1 card verify)

Result: DONE (no code change needed; shipped in C29 / rc5 F07, re-verified 2026-10-30).

## Where it lives
- `/supplier/apply` permanently redirects to `/suppliers` (`next.config.ts`), where `SupplierLeadForm` renders the full agreement.
- Agreement text + version: `src/lib/legal/supplier-agreement.ts`. `supplierAgreementHash()` is SHA-256 over the version and every clause, so any wording edit changes the hash and a stale form is refused.
- Form posts `agreement_hash` (hidden) plus a required checkbox; `POST /api/supplier/apply` rate-limits (2/24h/IP) and checks Turnstile.
- ₪1 verify: `startSupplierCardVerification` (`src/server/supplier/card-verification.ts`), `VERIFICATION_AMOUNT_AGOROT = agorot(100)`, Cardcom hosted page, token created then charge voided. Verdict comes from server-to-server `verifyLowProfile`, not the redirect.
- On verified card only, `createSupplierLead` (`src/server/supplier/lead-create.ts`) inserts the lead and a `supplier_agreements` row: `version_hash`, `version_date`, `ip_address`, `user_agent`, `created_at` (timestamp), `verification_id`, `supplier_lead_id`. An `audit_log` entry is written too.
- Table: `migrations/applied/292_supplier_agreements.sql` (RLS on, anon/authenticated revoked; applied per docs/C29-EVIDENCE.md).

## Checks (2026-10-30)
- `tsc --noEmit` clean.
- vitest: supplier server, SupplierLeadForm, api/supplier, lib/legal — 13 files / 102 tests pass.

## Not exercised
- A live Cardcom sandbox charge was not run this session (no sandbox terminal creds loaded, Supabase MCP unauthenticated). Coverage is the mocked provider path in the tests above. Production charging stays behind the existing Cardcom env check; without a terminal the flow degrades to a team email and creates no lead.
- No UI changed, so no compare.mjs run was needed.
