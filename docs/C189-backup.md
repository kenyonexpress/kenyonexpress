# C189 backup: R2 daily snapshot cron, PITR check, restore drill on a DB branch

Date: 2026-11-03 (+07). Branch `closeout/v1-final`. Production DB was healthy at
start (health API 12:29 +07: db and rest ACTIVE_HEALTHY), so the item was not
skipped for the 03.11 outage.

| leg | state |
|---|---|
| restore drill on DB branch | **passed**: 7/7 tables, 2653 rows, md5-identical production vs staging branch, typed load into the branch schema 7/7 |
| PITR check script | **ran**: `pitr_enabled: false`, WAL-G on, 7 daily physical backups, newest 2026-11-02 22:49 UTC. Turning it on costs ~$115/month (Small compute + pitr_7), a billing decision, not made here |
| R2 daily snapshot cron | **wired, cannot run**: `db-backup.yml` 03:00 UTC daily, gated on `DB_BACKUP_ENABLED`; R2 is not enabled on the Cloudflare account and none of `SUPABASE_DB_URL` / `BACKUP_R2_*` exist as secrets; no Cloudflare credential exists on this machine |

## 1. Restore drill on the staging branch

New: `scripts/dr/branch-restore-drill.mjs`. The C71 `restore-drill.mjs` never
restored anything (its "production counts" are a hard-coded string). This one
uses only the management API `/database/query`: no DB password, no pg_dump, no
pg_restore. Production is read-only; on staging branch `sjojzzppqhjxvjlvnwdb`
it writes only a scratch schema `dr_drill`, which it drops at the end.

Per table: production count + md5 over every row's canonical jsonb text, rows
exported as jsonb text, loaded into `dr_drill.<t>_raw`, checksum recomputed on
the branch, then `jsonb_populate_recordset(null::public.<t>, ...)` into
`dr_drill.<t>_typed` to prove the rows load into the branch's real schema.

First run (rows went through JS objects) failed on 5 tables with equal counts
and different md5: `JSON.parse` normalises numerics, so the restored bytes
changed. That is the kind of silent corruption a drill exists to catch; the
script now keeps each row as jsonb text end to end. Second run:

```
$ node scripts/dr/branch-restore-drill.mjs
restore drill 2026-11-03T05:34:10.384Z
source  ixvwfbuvfxxsjiywhbbb (production, read-only)
target  sjojzzppqhjxvjlvnwdb (staging branch, scratch schema dr_drill)
ok   categories     prod n=13 md5=ea4e7be70f4850026b787c8a4f380c7d | restored n=13 md5=ea4e7be70f4850026b787c8a4f380c7d typed=13 6129ms 
ok   suppliers      prod n=44 md5=10a5e2c43e1d9b55f97de8d00f10e340 | restored n=44 md5=10a5e2c43e1d9b55f97de8d00f10e340 typed=44 7132ms 
ok   products       prod n=126 md5=a9d92b8eaa6ab83eaa518df0223a57f9 | restored n=126 md5=a9d92b8eaa6ab83eaa518df0223a57f9 typed=126 16629ms 
ok   vouchers       prod n=695 md5=a3cce52e468dc631938c636de1b7cb90 | restored n=695 md5=a3cce52e468dc631938c636de1b7cb90 typed=695 64091ms 
ok   orders         prod n=853 md5=d434902ad16ac1b6b9012c87dad9bf08 | restored n=853 md5=d434902ad16ac1b6b9012c87dad9bf08 typed=853 61613ms 
ok   order_items    prod n=888 md5=30eb329e2df1b9bc97f7805dc9ec64ef | restored n=888 md5=30eb329e2df1b9bc97f7805dc9ec64ef typed=888 61333ms 
ok   seo_redirects  prod n=34 md5=08b234a74e87a9523d7259ea70871ed7 | restored n=34 md5=08b234a74e87a9523d7259ea70871ed7 typed=34 12701ms 
cleanup dr_drill schemas left on branch: 0
result  7/7 tables identical, 2653 rows, 235.8s elapsed
exit=0
```

First run, kept for the record:

```
restore drill 2026-11-03T05:31:47.823Z
source  ixvwfbuvfxxsjiywhbbb (production, read-only)
target  sjojzzppqhjxvjlvnwdb (staging branch, scratch schema dr_drill)
ok   categories     prod n=13 md5=ea4e7be70f4850026b787c8a4f380c7d | restored n=13 md5=ea4e7be70f4850026b787c8a4f380c7d typed=13 6704ms 
FAIL suppliers      prod n=44 md5=10a5e2c43e1d9b55f97de8d00f10e340 | restored n=44 md5=efb8985cda8f25cdbf1d65b441812a07 typed=44 7000ms 
FAIL products       prod n=126 md5=a9d92b8eaa6ab83eaa518df0223a57f9 | restored n=126 md5=d41cf6d3243ad9fe0c4d49afbd9dc7d7 typed=126 15973ms 
FAIL vouchers       prod n=695 md5=a3cce52e468dc631938c636de1b7cb90 | restored n=695 md5=9e698313420cfc4eae50115b885f086a typed=695 30065ms 
FAIL orders         prod n=853 md5=d434902ad16ac1b6b9012c87dad9bf08 | restored n=853 md5=2affb198e8b79ae6a920cbf4baf0a497 typed=853 28672ms 
FAIL order_items    prod n=888 md5=30eb329e2df1b9bc97f7805dc9ec64ef | restored n=888 md5=e3af2afcc04f8e950417809fc7b83282 typed=888 38827ms 
ok   seo_redirects  prod n=34 md5=08b234a74e87a9523d7259ea70871ed7 | restored n=34 md5=08b234a74e87a9523d7259ea70871ed7 typed=34 8348ms 
cleanup dr_drill schemas left on branch: 0
result  2/7 tables identical, 2653 rows, 139.1s elapsed
```

Restore time measured: 235.8 s for 2653 rows over the management API.

## 2. PITR (dashboard check script)

```
$ node scripts/dr/pitr.mjs --status
project ixvwfbuvfxxsjiywhbbb (eu-north-1)
pitr_enabled: false
walg_enabled: true
platform backups: 7 completed, newest 7h old
compute: ci_nano (meets PITR floor: false)
  pitr_7: $100/month
  pitr_14: $200/month
  pitr_28: $400/month
to enable: node scripts/dr/pitr.mjs --enable --variant=pitr_7 --yes  (~$115/month, 2 add-on changes)
exit=0
```

```
$ GET /v1/projects/ixvwfbuvfxxsjiywhbbb/database/backups
pitr_enabled False walg_enabled True
2026-11-02T22:49:09.203Z COMPLETED True
2026-11-01T22:11:06.963Z COMPLETED True
2026-10-31T22:06:56.425Z COMPLETED True
2026-10-30T22:11:02.302Z COMPLETED True
2026-10-29T22:11:05.053Z COMPLETED True
2026-10-28T22:11:08.466Z COMPLETED True
2026-10-27T22:11:07.126Z COMPLETED True
```

```
$ GET /v1/projects/ixvwfbuvfxxsjiywhbbb/branches
main ixvwfbuvfxxsjiywhbbb FUNCTIONS_DEPLOYED persistent= False with_data= False
staging sjojzzppqhjxvjlvnwdb FUNCTIONS_DEPLOYED persistent= True with_data= True
```

Current RPO is therefore 24 h (Pro daily physical backup), not seconds. PITR
not enabled: a recurring charge on the owner's card. Command when decided:
`node scripts/dr/pitr.mjs --enable --variant=pitr_7 --yes`.

## 3. R2 daily snapshot cron

Measured before the change:

```
$ gh run list --workflow=db-backup.yml --limit 4
skipped 2026-11-02 / 11-01 / 10-31 / 10-30 (main)
$ gh run list --workflow=dr-pg-backup-r2.yml --limit 4
failure 2026-11-02 / 11-01 / 10-31 / 10-30 (main)
  step "Install PostgreSQL client and tools": E: Package 'awscli' has no installation candidate
  then "Notify on failure" -> ntfy.sh/kenyon-ofir-limit "Daily PostgreSQL backup to R2 failed"
$ gh run list --workflow=backup-health.yml --limit 4
failure x4; log: "fail backup_skipped ... DB_BACKUP_ENABLED is not "true"" and "ok ntfy kenyon-ofir-limit: KE backups UNHEALTHY (1)"
$ gh run list --workflow=db-restore-drill.yml
skipped 2026-10-02
```

```
$ gh secret list
CRON_SECRET	2026-10-24T19:14:12Z
$ gh variable list   (names)
CI_BUILD_SUPABASE_DEMO_SECRET_KEY
CRON_NTFY_TOPIC
CRON_SCHEDULER_ENABLED
PUBLIC_SUPABASE_ANON_KEY
PUBLIC_SUPABASE_URL
$ grep -c -i 'cloudflare|CF_API|R2_' ~/.zshrc ; which wrangler ; grep R2/CLOUDFLARE .env.local
0 / wrangler not found / (none)
```

Fixed:

- `dr-pg-backup-r2.yml`: a C39 duplicate of `db-backup.yml` in the same 03:00
  slot, ungated, red every day. Now `workflow_dispatch` only, the `awscli` apt
  package dropped (the runner ships aws), both ntfy steps removed.
- ntfy removed from `db-backup.yml`, `db-restore-drill.yml`, and
  `backup-health.yml` (topic env unset). Two workflows were paging
  non-whitelisted strings to kenyon-ofir-limit every day; the 23.10 whitelist
  forbids cron-failure pages. Red runs and job summaries remain the signal.
- Scheduled workflows fire from `main` only, so the daily pages stop when this
  branch reaches main.

Still needed to make the dump real (dashboard actions, no code): enable R2,
create the bucket and an R2 API token, set secrets `SUPABASE_DB_URL` +
`BACKUP_R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET`, variable
`DB_BACKUP_ENABLED=true`. Order in `docs/DISASTER-RECOVERY.md` §5.1.

## 4. Gates

Full `pnpm test` was red on arrival with one failure from C188, not C189:
`migration-location-gate` flagged `migrations/applied/331_demo_untraced_images.sql`
as added without a committed pending/ copy. C188 applied it to production
(docs/C188-demo.md), so the history cannot be redone; added to
`GRANDFATHERED_APPLIED` with a comment, same as 322.

```
$ pnpm type-check
tsc exit=0
$ pnpm lint
copy gate: clean (no Latin marketing sentence in a rendered component)
asset gate: clean (no template or vendor product imagery under public/images)
lint exit=0
$ pnpm test   (before the 331 fix)
 Test Files  1 failed | 874 passed | 3 skipped (878)
      Tests  1 failed | 9670 passed | 39 skipped (9710)
$ pnpm test   (after)
 Test Files  875 passed | 3 skipped (878)
      Tests  9671 passed | 39 skipped (9710)
test exit=0
```

No forbidden files touched. Production was never written by this item.
