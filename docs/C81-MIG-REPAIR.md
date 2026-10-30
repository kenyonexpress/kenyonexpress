# C81 MIGRATION-REPAIR (2026-10-30)

Re-run. `~/ke-goals/db.sh -c "select 1"` fails: `password authentication failed for user "postgres"` (pooler rejects the ke-supabase-db keychain password; same cause as C80/C82). The Supabase MCP is unauthenticated in this session, so `supabase migration repair`, `db push --dry-run` and applying migrations/pending are not possible. No migration applied, no files changed.

RESULT: BLOCKED db password rejected by pooler, Supabase MCP unauthed
