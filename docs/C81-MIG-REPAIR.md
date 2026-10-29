# C81 — MIGRATION-REPAIR

Date: 2026-10-30

## RESULT: BLOCKED supabase db auth failing (password rejected) + task conflicts with "NEVER db push" rule

## What was checked
- `db.sh` (psql via pooler aws-1-eu-north-1, project ixvwfbuvfxxsjiywhbbb, password from keychain `ke-supabase-db`):
  `select count(*), max(version) from supabase_migrations.schema_migrations` ->
  `FATAL: password authentication failed`. The remote state could not be read, so no applied versions could be determined.
- Supabase MCP (claude.ai Supabase) is unauthenticated in this non-interactive session, so `apply_migration` is unavailable.
- `migrations/pending/` holds 7 real migrations (000, 164, 301, 305, 306, 310, 311) plus preflight_*.sql files. None applied.

## Rule conflicts
- Task text asks for `supabase migration repair` and `supabase db push --dry-run`. Iron rule: "NEVER db push". Not run.
- 164 is a pending file; migration 165 is permanently cancelled (not present).

## Not done
- No repair, no dry-run, no migration applied, nothing recorded as applied.

## Unblock
Refresh the keychain item `ke-supabase-db` (DB password reset on Supabase, same as the C51 recovery), then re-run C81 using db.sh one file at a time.
