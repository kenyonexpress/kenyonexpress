# M10-c346: migrations/pending verification blocker

**Date:** 2026-11-02
**Status:** BLOCKED (no Supabase CLI credentials)

## Evidence
```
$ ls migrations/pending | wc -l
94
$ supabase db query --linked "select 1 as ok"
{"_tag":"Error","error":{"code":"LegacyProjectNotLinkedError","message":"Cannot find project ref. Have you run supabase link?"}}
$ env | grep -c SUPABASE_ACCESS_TOKEN
0
$ timeout 40 supabase link --project-ref ixvwfbuvfxxsjiywhbbb   # hangs waiting for login, killed
$ cat supabase/.temp/project-ref   # absent in ke-merger, ke-fix-tc, kenyonexpress-autopilot, kenyonexpress-web
```

- Same state as c343/c345: CLI not linked to ixvwfbuvfxxsjiywhbbb, no access token or login in this session.
- Supabase MCP needs OAuth (not possible non-interactively). psql with password is forbidden.
- Nothing applied or moved; migration 165 stays cancelled; no forbidden files touched.
- Next step: once CLI is logged in and linked, diff schema_migrations against migrations/pending/, apply missing files one at a time with `supabase db query --linked -f`, move to migrations/applied/.
