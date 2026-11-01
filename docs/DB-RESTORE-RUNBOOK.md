# DB-RESTORE-RUNBOOK.md

Operational runbook for the Postgres backup pipeline: how the daily dump works,
how to enable it, how to restore, and how the quarterly drill proves the dumps
are real. `docs/ARCHITECTURE-BACKUP-DR.md` is the binding architecture behind
this; this file is the implemented, executable subset. Written 2026-09-08.

## The pipeline in one paragraph

`.github/workflows/db-backup.yml` runs daily at 03:00 UTC. It executes
`scripts/dr/pg-dump-to-r2.mjs`, which takes a full `pg_dump -Fc` of the hosted
Supabase project (schemas `public`, `auth`, `storage`), verifies the dump's
table of contents BEFORE uploading (floor of 60 public tables, money-path
tables must be present), uploads the dump plus a sha256 sidecar to the R2
backup bucket under `postgres/kenyonexpress-<UTC stamp>.dump`, and then prunes
to a 30-day retention window while never keeping fewer than the newest 7
backups. `.github/workflows/db-restore-drill.yml` restores the newest dump into
a throwaway Postgres 17 container every quarter and hard-gates on
`scripts/dr/verify-restore.sql`. Both notify `ntfy.sh` (topic in the
`CRON_NTFY_TOPIC` repo variable). `.github/workflows/backup-health.yml` is the
watchdog over both plus the Supabase platform backups and PITR (STEP 38; see
Monitoring below).

Server is Postgres 17.6; every client (`pg_dump`, `pg_restore`, `psql`) must be
version 17 or newer, or `pg_dump` refuses to connect.

## Enabling (one-time setup)

The workflows are OFF until these exist, same master-switch pattern as
`cron.yml`. GitHub > repo Settings > Secrets and variables > Actions:

| Kind | Name | Value |
|---|---|---|
| Variable | `DB_BACKUP_ENABLED` | `true` (set to anything else to stop both workflows) |
| Secret | `SUPABASE_DB_URL` | Direct `postgres://` string, Supabase Dashboard > Settings > Database |
| Secret | `BACKUP_R2_ACCOUNT_ID` | Cloudflare account id |
| Secret | `BACKUP_R2_ACCESS_KEY_ID` | R2 API token scoped to the backup bucket ONLY |
| Secret | `BACKUP_R2_SECRET_ACCESS_KEY` | (same token) |
| Secret | `BACKUP_R2_BUCKET` | e.g. `ke-db-backups` (a dedicated bucket, not the media bucket) |

Prerequisites outside this repo:

1. R2 enabled on the Cloudflare account and a dedicated backup bucket created.
   Optionally add an R2 lifecycle rule deleting `postgres/` objects after 40
   days as belt and braces behind the in-script 30-day prune.
2. Scheduled workflows fire only from the default branch (`main`); this file
   and the workflows must be merged there before the cron runs.
3. Immediately after enabling: run `DB backup` once via `workflow_dispatch`,
   then run `DB restore drill` via `workflow_dispatch`. Do not wait a quarter
   to learn the first dump is bad.

Note (verified 2026-09-08): the local `.claude` MCP can query the DB but there
were previously no R2 credentials in this repo's secrets, and R2 was once
disabled on the account entirely (see `scripts/upload-r2.mjs` history on main).
If the backup workflow fails with 403 code 10042, R2 is still not enabled.

Enablement status, measured 2026-09-09:

- R2 is **still not enabled** on the Cloudflare account: the R2 API returned
  `403 code 10042 "Please enable R2 through the Cloudflare Dashboard"` to a
  bucket-list call. Everything in the table above is therefore blocked on the
  one manual dashboard step only Ofir can take (enable R2, create the backup
  bucket, mint a bucket-scoped API token).
- Repo Actions settings hold none of the six entries: the only secret is
  `CRON_SECRET`, and `DB_BACKUP_ENABLED` is not among the variables. Both
  workflows are correctly inert, not silently failing.
- Prerequisite 2 is already satisfied: the workflows, `scripts/dr/`, and this
  runbook are all merged to `origin/main`, so the crons arm the moment the
  settings exist.

Re-measured 2026-10-08 (STEP 38), through the GitHub API and the Supabase
management API, read-only:

- `db-backup.yml` on `main` has fired every day; every run concludes
  `skipped` (newest 2026-10-07T10:00Z, run 37604419442). `db-restore-drill.yml`
  fired once on 2026-10-02 and was `skipped` too. Repo secrets are still
  `CRON_SECRET` alone; `DB_BACKUP_ENABLED` is still absent. No R2 credential
  exists in the shell, in either `.env.local`, or in Vercel (placeholders).
  There is no `SUPABASE_DB_URL` (direct connection string) anywhere on this
  machine either, so even the dump step could not be rehearsed locally.
- Supabase (`GET /v1/projects/{ref}/database/backups`): Pro plan, 7 COMPLETED
  physical backups, newest 20h old at measurement, `walg_enabled: true`,
  `pitr_enabled: false`. Backup schedule customisation answers 402
  (Enterprise only); the restore-point endpoint answers 400 (unavailable).
- What changed in STEP 38: the watchdog below now says all of this out loud,
  daily, instead of the two workflows finishing green while doing nothing.

## Monitoring: `backup-health.yml` (daily, pages ntfy)

`.github/workflows/backup-health.yml` runs `scripts/dr/backup-health.mjs` at
06:30 UTC daily and on dispatch. It is deliberately **not** gated on
`DB_BACKUP_ENABLED`: its job is to notice when the backups are off. Three legs,
decided in `scripts/dr/health-lib.mjs` (unit-tested in
`scripts/dr/health-lib.test.mjs`):

| Leg | Needs | FAIL when | WARN when |
|---|---|---|---|
| GitHub Actions run history | the runner's own `GITHUB_TOKEN` (always present) | newest completed `db-backup` run is `skipped`, failed, missing, or a success older than 36h | last passing restore drill missing or older than 100 days; API unreachable |
| Supabase platform backups | secret `SUPABASE_ACCESS_TOKEN` (optional) | no COMPLETED platform backup, or newest older than 36h | PITR off; WAL archiving off; API error |
| R2 dump bucket | the four `BACKUP_R2_*` secrets (optional) | no dump under `postgres/`, or newest older than 36h | list error |

A leg without credentials reports `unverified`, never healthy. Paging policy
(`notifyPolicy`): any FAIL pages `ntfy.sh/$CRON_NTFY_TOPIC` at high priority
on every run; a healthy state sends a Monday heartbeat carrying the warnings,
so a silent Monday means the monitor itself is dead. The run exits 1 on any
FAIL, so the Actions tab is red as well. Step summary carries the full table.

Measured locally on 2026-10-08 (`node scripts/dr/backup-health.mjs --keychain
--no-notify`, which borrows `gh auth token` and the Supabase CLI keychain token;
CI never passes `--keychain`):

```
fail backup_skipped: db-backup.yml was skipped on 2026-10-07T10:00:01Z: DB_BACKUP_ENABLED is not "true", so zero dumps are written
warn drill_never_passed: db-restore-drill.yml has never passed; no dump has ever been proven restorable
info platform_backup_ok: Supabase platform backup 20h old, 7 completed in the window
warn pitr_disabled: PITR is NOT enabled: RPO is 24h; enable with `node scripts/dr/pitr.mjs --enable --yes` (paid add-on)
info r2_unverified: R2 backup bucket unverified (no BACKUP_R2_* credentials)
error backups UNHEALTHY (1 fail)
```

That is the message Ofir's phone receives daily until `DB_BACKUP_ENABLED` and
the secrets exist. To arm the two optional legs: a personal access token from
`supabase.com/dashboard/account/tokens` as secret `SUPABASE_ACCESS_TOKEN`
(optionally `SUPABASE_PROJECT_REF` as a variable; defaults to production), and
the same `BACKUP_R2_*` four as the backup itself.

## Point-in-time recovery: `scripts/dr/pitr.mjs`

```bash
node scripts/dr/pitr.mjs --status [--keychain]        # read-only
node scripts/dr/pitr.mjs --enable --variant=pitr_7 --yes
```

Status reads `pitr_enabled`, `walg_enabled`, the newest platform backup, the
compute tier and the PITR price list from the management API. Enable PATCHes
`/v1/projects/{ref}/billing/addons` in the order `scripts/dr/pitr-lib.mjs`
plans and prints the plan plus the monthly total first; it refuses without
`--yes` because both steps are recurring charges on the organisation's card.

Measured 2026-10-08: the project runs on Nano compute (`selected_addons: []`),
and Supabase requires at least Small compute under PITR, so enabling costs
**Small $15/month + pitr_7 $100/month = ~$115/month** (pitr_14 $200, pitr_28
$400). This is a billing decision and it was **not** taken automatically; the
watchdog reports `pitr_disabled` as a warning on every Monday heartbeat until
it is. Once enabled, `docs/DISASTER-RECOVERY.md` §4 rows 1 and 2 drop from a
24h RPO to minutes; row 3 (full project loss) does not change.

## Restore: quarterly drill (automated)

`.github/workflows/db-restore-drill.yml`, cron `0 5 2 1,4,7,10 *` plus manual
dispatch. What a green run proves:

1. The newest dump downloads from R2 and matches its sha256 sidecar
   (`scripts/dr/restore-latest.mjs`, which also warns when the newest dump is
   over 36h old, the DR doc's watchdog threshold).
2. It restores into a clean `postgres:17-alpine`
   (`scripts/dr/pg-restore.sh` with `PREPARE_SCRATCH=1`, which pre-creates the
   Supabase roles and the `extensions` schema a vanilla Postgres lacks).
3. The restored database passes `scripts/dr/verify-restore.sql`: at least 60
   public tables, all money-path tables present, catalog rows present,
   `auth.users` present and non-empty.

`pg_restore`'s own exit code is deliberately not the gate; restoring a Supabase
dump into vanilla Postgres always emits noise errors (event triggers,
publications, grants to absent roles). The SQL gate is the gate.

What it does not prove: full app bring-up against a scratch Supabase project
(Mode A of `ARCHITECTURE-BACKUP-DR.md` §8). Do that manually once after launch
and after any auth-schema migration, using the same scripts against a new
Supabase project instead of a container.

## Restore: real incident (manual)

Terminal, repo root, with the `BACKUP_R2_*` env vars exported:

```bash
# 1. Fetch and verify the newest dump (writes DUMP_FILE=... to stdout)
node scripts/dr/restore-latest.mjs --out=/tmp/ke-restore

# 2. Create a NEW Supabase project (Pro), take its direct connection string.
#    Never restore over the live project; pg-restore.sh refuses the production
#    ref outright.

# 3. Restore
TARGET_DATABASE_URL='postgres://...' \
DUMP_FILE=/tmp/ke-restore/kenyonexpress-<stamp>.dump \
  bash scripts/dr/pg-restore.sh
# On a fresh Supabase project the roles and extensions already exist;
# PREPARE_SCRATCH=1 is only for vanilla Postgres.

# 4. Gate
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/dr/verify-restore.sql
```

Then repoint the app (preview first, production only after smoke):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` in Vercel, redeploy, and walk
`ARCHITECTURE-BACKUP-DR.md` §8.5 (smoke) and §8.6 (cutover). Changing
production env and DNS stays a human decision; nothing in this pipeline does it.

## On-demand snapshot (before a risky migration)

Terminal, repo root:

```bash
SUPABASE_DB_URL='postgres://...' \
BACKUP_R2_ACCOUNT_ID=... BACKUP_R2_ACCESS_KEY_ID=... \
BACKUP_R2_SECRET_ACCESS_KEY=... BACKUP_R2_BUCKET=... \
  node scripts/dr/pg-dump-to-r2.mjs
```

Or GitHub > Actions > `DB backup` > Run workflow. Either way the snapshot
enters the same retention window as the dailies.

## Retention policy, exactly

Implemented in `keysToPrune` (`scripts/dr/backup-lib.mjs`, unit-tested in
`backup-lib.test.mjs`):

- A backup is the `.dump` plus its `.dump.sha256`; they are pruned together.
- Backups older than 30 days are deleted, EXCEPT the newest 7, which are never
  deleted regardless of age (fuse against a wrong clock or a fat-fingered
  retention value mass-deleting the bucket).
- Keys that do not match the pipeline's own naming pattern are never touched.

## Failure modes and where they surface

| Failure | Surfaces as |
|---|---|
| pg_dump cannot connect / wrong client version | `DB backup` run fails, ntfy fires |
| Truncated or partial dump | TOC verification fails before upload; the bucket never sees it |
| Corrupt object in R2 | sha256 mismatch in `restore-latest.mjs`; drill fails |
| Backup job silently stopped (60-day repo inactivity pause, disabled variable, skipped on `if:`) | `backup-health.yml` pages ntfy daily with the reason (`backup_skipped` / `backup_stale`); the drill also warns "newest dump over 36h old" |
| Supabase platform backup stopped or PITR silently off | `backup-health.yml` platform leg (`platform_backup_stale` FAIL, `pitr_disabled` WARN) once `SUPABASE_ACCESS_TOKEN` is set |
| The monitor itself dies | No Monday heartbeat on ntfy |
| Dump restores but data is wrong | `verify-restore.sql` floors; drill fails |

## Related

- `docs/ARCHITECTURE-BACKUP-DR.md`: binding architecture, RTO/RPO targets,
  Supabase platform backups (Pro daily + PITR), Mode A auth restore notes.
- `docs/DISASTER-RECOVERY.md`, `docs/DR-RUNBOOK.md` (on main): older incident
  playbooks; this file supersedes them for the Postgres dump path.
- `scripts/backup-schema.sh`: schema-only local snapshot, still useful for
  drift inspection; the R2 pipeline replaces it as the DR mechanism.
