# M10-c323: migrations/pending verification blocker

**Date:** 2026-11-01
**Status:** DONE-DEFERRED (Supabase access unavailable)

- migrations/pending/ holds 17 numbered migrations (000, 164, 301, 305-321) plus preflight files.
- Applied state could not be verified: the claude.ai Supabase MCP requires OAuth (not possible in a non-interactive session), and the psql fallback (db.sh) has no DB password in the keychain.
- Nothing was applied or moved. Migration 165 stays cancelled.
- Next step: when Supabase MCP auth is restored, compare supabase_migrations.schema_migrations to the pending list, apply missing ones one at a time via apply_migration on ixvwfbuvfxxsjiywhbbb, then move them to migrations/applied/.
