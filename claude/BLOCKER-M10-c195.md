# BLOCKER M10-c195 — migrations/pending not applied

Checked 2026-10-25 (read-only PostgREST probe on ixvwfbuvfxxsjiywhbbb, `limit=0`).

Applied (200): wallet_topups (174), push_subscriptions (301), payment_events (294).
NOT applied (404): auth_attempts + passkey_credentials (289), search_analytics (188),
address_book (302), supplier_applications (305). Likely more of the ~40 numbered files in migrations/pending/.

Cause: apply path is Supabase MCP apply_migration only (db push / pg_dump forbidden).
The claude.ai Supabase MCP is unauthenticated and OAuth cannot run in this non-interactive session.

Needed: authorize the Supabase MCP, then apply migrations/pending/*.sql one at a time
(order per migrations/pending/APPLY-ORDER.md; 165 stays cancelled), moving each to migrations/applied/.
