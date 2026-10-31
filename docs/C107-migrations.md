# C107 migrations sweep

Date: 2026-10-30

## Applied numbers

None. 0 files applied, 0 moved to migrations/applied/.

## Why

- `/Users/ofir/ke-goals/db.sh` fails: `FATAL: password authentication failed for user "postgres"` (Keychain item `ke-supabase-db` is stale or rejected). The Supabase MCP connector also requires authentication, which is unavailable in this non-interactive session.
- Without DB access, `information_schema` verification is impossible, so no file was moved.

## Pending at sweep time (26 SQL files)

162, 164, 166, 184, 188, 211, 217, 223, 224, 226, 227, 228, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242 (+ preflight_162, preflight_184).
APPLY-ORDER.md records 217-234 as applied on production already but still present in pending/; reconcile against `supabase_migrations.schema_migrations` once access is restored.
162 needs real vault seeding and 184 needs a maintenance window plus a fresh preflight; neither should be blind-applied.
165 is permanently cancelled (in migrations/cancelled/, not pending).

RESULT: BLOCKED db credentials rejected (db.sh password auth failed)
