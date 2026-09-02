# Mega-block STEPS 2-13 — the scan-first ledger

The block's own rule: "סרוק קודם מה קיים ודלג עליו". This file is that scan,
one section per step, with the verdict and the evidence. A step whose spec
would DUPLICATE or CONTRADICT a live system is closed by this audit, not by
writing the duplicate — the whole closeout has been burying parallel
implementations, not minting them.

Two spec-wide corrections that apply to every step:
- `packages/money.ts` does not exist; money is `src/lib/commerce/money.ts`
  (integer agorot, branded). `src/db` does not exist; there is no Drizzle in
  this repo (the dup-repo port discarded it, on record) — data access is
  Supabase clients + RLS + definer functions.
- Migration numbers 147 and 148 are taken (money twins, refund destination).
  New files continue from 154.

## STEP 2 — AUTH: satisfied by existing, stronger implementations

| Spec item | Exists as | Verdict |
| --- | --- | --- |
| `sessions` table + createSession/rotate/destroy + cookie | Supabase Auth via `@supabase/ssr`: httpOnly cookie sessions with built-in rotation, on every client factory | **Skip.** A parallel sessions table is a second auth system — the exact live-vs-dead split this closeout spent a day burying. |
| `requireRole(roles)` | `requireAdminSession` (`src/lib/admin/rbac.ts`), `requireSupplierRole` (`src/lib/supplier/rbac.ts`), route-guards + tests | **Skip.** Per-domain guards exist and are tested; a generic second door adds a bypass surface, not safety. |
| `user_roles` many-to-many table | `profiles.role` (`user_role` enum: customer, content_uploader, admin, …), RLS-frozen against self-escalation | **Skip.** A second role store forks the model; every existing policy reads `profiles.role`. |
| Login route, Upstash 5/60 per IP | `src/server/actions/auth.ts:136,152` — `signInWithPassword` behind per-IP **and** per-account sliding-window limits | **Skip.** Existing is stricter than the spec. |
| logout / refresh routes | Supabase signOut in actions; rotation is the library's | **Skip.** |
| `rls-enabled.test.ts` (non-empty strings) | `src/lib/auth/rls-manifest.test.ts` + `supabase/rls-manifest.json` + `rls-write-policies.test.ts` | **Skip.** The existing tests assert the actual policy surface, not that a list of strings is non-empty. |
| `docs/AUTH-MODEL.md` | Exists, alongside `DB-SECURITY-MODEL.md` | **Skip.** |

## STEP 3 — PAYMENTS: satisfied, and the spec's machine contradicts the deployed one

| Spec item | Exists as | Verdict |
| --- | --- | --- |
| `state-machine.ts` with pending→authorized→captured→… | `src/lib/checkout/state-machine.ts` + `src/server/domain/orders/status-transitions.json` + **migration 137's triggers, live in production and proven 144/144** (`tests/sql/status_transition_guards.sql`) | **Skip, emphatically.** The spec's states (`authorized`, `captured`, `supplier_settled`) are not members of the deployed `payment_status`/`settlement_status` enums; writing them would 22P02 at runtime and fork the machine the DATABASE now enforces. Same trap as the refund-state names, already documented. |
| `cardcom.ts` createLowProfile + HMAC webhook verify | `src/lib/payments/cardcom.ts` (real legacy `/Interface/*.aspx` endpoints, 15s deadline, no-double-charge retry policy); webhook secret verification per Cardcom's actual IndicatorUrl mechanism (`acceptedWebhookSecrets`, two-secret rotation window) | **Skip.** The spec's HMAC-sha256 header is not what Cardcom sends; implementing it would reject every real callback. |
| `split.ts` executeSplit | `src/lib/checkout/split.ts` + `finalize.ts` (platform_percent snapshotted per line at checkout; splits recorded in `split_executions`, which exists in production) | **Skip.** |
| webhook route with dedup | `src/app/api/payments/cardcom/webhook/route.ts`: signature check, `(provider, external_id)` unique dedup with 23505-as-replay, GetLpResult re-verify, amount check, 13 journal events | **Skip.** Existing is substantially stronger than the spec. |
| `148_payments.sql` (payment_state column, webhook_events, split_executions, payment_discrepancies) | `payments.status` + 137 guard; `payment_webhook_events` live; `split_executions` live; discrepancies covered by `terminal-reconciliation.ts` + `payment_events` reconciliation event types | **Skip**, except `payment_discrepancies` persistence — reconciliation currently alarms rather than persisting rows; noted as a candidate for a future migration if wanted. |

## STEPS 4-13 — text never arrived

The block's message truncated mid-sentence inside STEP 3's migration item.
Steps 4 through 13 have no content in this repository or in the instruction,
and are not executable as named. This ledger takes them one by one when their
text lands.
