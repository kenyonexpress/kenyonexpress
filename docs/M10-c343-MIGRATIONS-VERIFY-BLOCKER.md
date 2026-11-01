# M10-c343: migrations/pending verification blocker

**Date:** 2026-11-02
**Status:** BLOCKED (no Supabase CLI credentials)

## Evidence
```
$ ls migrations/pending | wc -l
94
$ supabase db query --linked "select count(*) from supabase_migrations.schema_migrations"
{"_tag":"Error","error":{"code":"LegacyProjectNotLinkedError","message":"Cannot find project ref. Have you run supabase link?"}}
$ ls supabase/.temp
ls: supabase/.temp: No such file or directory
$ env | grep -c SUPABASE_ACCESS_TOKEN
0
$ supabase projects list   # hung >120s waiting for login, killed
```

- Repo is not linked to ixvwfbuvfxxsjiywhbbb and no SUPABASE_ACCESS_TOKEN / CLI login exists in this session, so `supabase link` and `db query --linked` cannot run.
- claude.ai Supabase MCP needs OAuth (not possible non-interactively). psql with password is forbidden.
- Nothing applied or moved; migration 165 stays cancelled; no forbidden files touched.
- Next step: once the CLI is logged in and linked, compare schema_migrations to migrations/pending/, apply missing files one at a time with `supabase db query --linked -f`, then move to migrations/applied/.
