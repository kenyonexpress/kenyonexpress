# W14 Backup

Code-agent spec. Daily tar to Desktop is a workstation loop rule, not production DR. Production backups are Supabase PITR (human confirms in dashboard).

---

## What it builds

1. Document RPO/RTO in `ops` runbooks. This wave does not apply a migration.
2. Confirm PITR is on for `ixvwfbuvfxxsjiywhbbb`.
3. R2 versioning / object lock: human in Cloudflare.
4. Never `pg_dump` secrets into git.

---

## Tables

All. Restore drills must not run against production from an agent.

---

## RLS

Restored DB must keep RLS enabled. A dump replay that disables RLS is a launch incident.

---

## Money invariants

Restore of a partial money table without `payment_events` is forbidden. Restore is a unit: orders + items + payments + vouchers + wallet.

---

## Tests before close

No automated restore in CI (no prod credentials). Document a quarterly human drill.

---

## Feature flag

None.

---

## Docs updated

`RUNBOOK-DB-DOWN.md`, `RUNBOOK-ROLLBACK.md`, `DATA-RETENTION.md`.

---

## Edge cases

`wp_import` restore must not overwrite `public`. Workstation tar excludes `node_modules` / `.next`.

---

## Hebrew UX strings

None (ops).

---

## Open questions

| Q | Best answer |
|---|---|
| Is PITR on? | Human confirms. Do not assume. |
