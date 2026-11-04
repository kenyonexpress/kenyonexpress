# BACKUP-RUNBOOK: what exists, what restores, and the one switch that is off (G3, 05.11.2026)

Measured today against project `ixvwfbuvfxxsjiywhbbb` (eu-north-1, Postgres
17.6, org plan `pro`) through the management API and the database itself.
Nothing here is inferred from a dashboard screenshot.

## State in one table

| question | answer | evidence |
|---|---|---|
| PITR enabled | **no** | `GET /v1/projects/<ref>/database/backups` -> `pitr_enabled: false`; `GET .../billing/addons` -> `selected_addons: []`; `node scripts/dr/pitr-status.mjs` exits 3 |
| Daily physical backup | yes, every night ~22:11 UTC | same endpoint: 8 backups, all `COMPLETED`, `is_physical_backup: true`, window 2026-10-28 .. 2026-11-04 |
| Retention | 7 days (Pro daily backups) | the window above holds exactly the last 7 nights plus tonight's |
| WAL archiving | on, every 120 s, via WAL-G | `archive_mode=on`, `archive_command=admin-mgr wal-push`, `pg_stat_archiver`: 15023 archived, last 23:46 UTC today, 13 failures, the last 03.11 02:23 (the outage day) |
| Streaming replica | none | `pg_stat_wal_receiver` is empty (this is the primary; no read replica exists) |
| Offsite dump to R2 | **not running** | R2 is not enabled on the Cloudflare account; `db-backup.yml` skips on its `if:` and has never written a dump; `db-restore-drill.yml` has never run |
| Database size | 146 MB | `pg_database_size` |

WAL archiving being on does NOT mean PITR: Supabase archives WAL on every Pro
project to build its own daily physical backup. The add-on is what makes those
segments restorable to an arbitrary timestamp, and it is not purchased.

## Enable PITR (owner action, two purchases)

PITR needs at least the Small compute instance. Both are add-ons on the same
dashboard page, and the order matters:

1. https://supabase.com/dashboard/project/ixvwfbuvfxxsjiywhbbb/settings/addons
2. Compute: `Small` (`ci_small`, ~$15/month).
3. Point in Time Recovery: `7 days` (`pitr_7`, $100/month; 14 days $200; 28 days $400).

Or by API, with a personal access token (`sbp_...`, account level):

```
curl -X PATCH https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/billing/addons \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'content-type: application/json' \
  -d '{"addon_type":"compute_instance","addon_variant":"ci_small"}'
curl -X PATCH https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/billing/addons \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'content-type: application/json' \
  -d '{"addon_type":"pitr","addon_variant":"pitr_7"}'
```

The compute change restarts the database (a minute or two of downtime); do it
behind the maintenance page that is up anyway. A notice to enable it was
posted to ntfy today.

## Restore procedures

### A. Point in time (only once PITR is on)

Dashboard: Database -> Backups -> Point in Time -> pick the timestamp (UTC) ->
Restore. By API:

```
curl -X POST https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/database/backups/restore-pitr \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'content-type: application/json' \
  -d '{"recovery_time_target_unix": <epoch seconds>}'
```

This restores IN PLACE: everything after the target is gone. Before firing it,
take an on-demand dump of the current state (`docs/DB-RESTORE-RUNBOOK.md`,
"On-demand snapshot") so the post-incident rows can be recovered by hand.

### B. Daily backup (what exists today)

Dashboard: Database -> Backups -> Scheduled backups -> the night you want ->
Restore. Also in place; same rule about dumping first. Worst-case data loss is
everything since 22:11 UTC the previous night (RPO <= 24 h). The management
API has no endpoint for this restore; it is a dashboard action.

### C. Into a scratch project or container (drill, or a lost account)

`docs/DB-RESTORE-RUNBOOK.md` "Restore: real incident" with
`scripts/dr/restore-latest.mjs` -> `scripts/dr/pg-restore.sh` ->
`scripts/dr/verify-restore.sql`. Today this path has no input: no dump has ever
been written because R2 is off. Until it is, the only copy of the data is
Supabase's, which is the leg that does not survive losing the Supabase account.

## Dry run (what can be exercised without touching production)

```
# 1. Is PITR on, and what is the backup window? exit 0 = PITR, 3 = no PITR, 2 = could not measure
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/dr/pitr-status.mjs

# 2. Is WAL still being shipped? (a stale last_archived_time is the first symptom of a broken backup)
~/ke-goals/db.sh "SELECT archived_count, last_archived_time, failed_count, last_failed_time FROM pg_stat_archiver;"

# 3. Restore drill into a throwaway container (needs a dump; see C)
gh workflow run db-restore-drill.yml
```

The branch-based drill (`supabase branches`, Pro branching is enabled on this
org) restores the schema, not the data, and proves migrations replay, not
recovery.

## Related

`docs/DB-RESTORE-RUNBOOK.md` (the dump/restore pipeline and its retention),
`docs/BACKUP-RECOVERY.md` (the six backup items, measured), `docs/DR-RUNBOOK.md`
(RTO/RPO targets), `docs/ARCHITECTURE-BACKUP-DR.md`.
