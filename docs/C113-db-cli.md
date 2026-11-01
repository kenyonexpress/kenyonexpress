# C113 — DB via Supabase CLI only

## Rule
Every DB task runs from `/Users/ofir/kenyonexpress-web/kenyonexpress`:

    supabase db query --linked "<sql>"

- Never `psql` with a password.
- Verify connectivity: `supabase db query --linked "select 'DB-OK' as status"`
- Linked project ref: `ixvwfbuvfxxsjiywhbbb` (supabase/.temp/project-ref).
- Migrations still go to `migrations/pending/` and are applied via Supabase MCP `apply_migration`; never `db push`.

## Verification status (2026-11-01)
`select 'DB-OK'` did NOT return. CLI v2.117.0 hangs with no output (also for `supabase projects list`).
Cause: the CLI has no credentials. `SUPABASE_ACCESS_TOKEN` is unset, `~/.supabase` has no access-token
file, and `api.supabase.com` answers 401 to an unauthenticated request (network is fine).

## To unblock
Run `supabase login`, or export `SUPABASE_ACCESS_TOKEN`, then re-run the verify command above.
Until `DB-OK` is returned, all DB items stay DONE-DEFERRED/BLOCKED.

RESULT: BLOCKED supabase CLI has no access token, select 'DB-OK' not verified
