# ROLLBACK-RUNBOOK: Vercel production rollback (G5, 05.11.2026)

Production is the `kenyonexpress` project (team `kenyonexpress-projects`,
`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`), git-deployed from `closeout/v1-final`.
Every push to that branch becomes the production deployment within minutes, so
"rollback" means pointing the production domains at an older deployment, not
reverting git.

## The known-good deployment

`~/ke-goals/known-good-deploy.txt` holds up to five deployment ids, newest
LAST. Recorded today:

```
dpl_T2NV6P7Nno8xCVyfRMoLH3Bmiw2J    # commit d49fb1b1f, READY, serving production at 05.11 06:45 +07
```

Record a new one after every release tag whose audit against production came
back green:

```
scripts/record-known-good-deploy.sh          # newest READY production deployment
scripts/record-known-good-deploy.sh dpl_xxx  # a specific one
```

The script takes the newest **READY** deployment, not the newest: while a push
is building, the newest one is not a rollback target.

## Roll back (one command)

```
vercel promote $(tail -n 1 ~/ke-goals/known-good-deploy.txt) --yes
```

`vercel promote` re-aliases every production domain (`kenyonexpress.co.il`,
`www.kenyonexpress.co.il`) to that deployment. It is instant: the deployment is
already built. The queue item's spelling, `vercel promote $(cat ...)`, works
only while the file holds one line; with the five-line history use `tail -n 1`.

Alternatives, same effect:

- `vercel rollback` with no argument returns to the previous production
  deployment (one step back, whatever it was).
- Dashboard: Deployments -> the known-good row -> "Promote to Production"
  (or "Instant Rollback" on the current one).

Today's alias check: `vercel alias set dpl_T2NV6P7Nno8xCVyfRMoLH3Bmiw2J
kenyonexpress.co.il` answered "Success", the apex still answers 308 to `www`
(the project's redirect setting is separate from the alias), and
`/api/health` on `www` answers 200.

## What a rollback does not undo

- **Database migrations.** Rolling the app back does not roll the schema
  back. Check `migrations/pending/` and `docs/RUNBOOK.md` before promoting an
  older build over a newer schema; a build that predates a column it now reads
  is fine, a build that writes a column that was since dropped is not.
- **Environment variables.** The promoted deployment runs with the env it was
  built with for `NEXT_PUBLIC_*` (baked) and the CURRENT env for server-side
  values. A secret rotated after that build is picked up; a baked public URL
  is not.
- **Maintenance mode.** `MAINTENANCE_MODE` is an env var, not a deployment:
  it stays as set.

## After rolling back

1. `scripts/record-known-good-deploy.sh` is NOT run: the file already names
   the deployment you just promoted.
2. Re-run the production checks (`~/ke-goals/LAUNCH-AUDIT*.md`, CHECK 3 and
   4) and post the outcome to ntfy `ke-0077f1b5ed27`.
3. Pushes to `closeout/v1-final` will deploy again and take production back
   from the promoted build. To hold the rollback, stop pushing or pause the
   project's git deployments in the dashboard until the fix lands.

## Related

`docs/LAUNCH-RUNBOOK.md`, `docs/RELEASE-PROCESS.md`, `docs/BACKUP-RUNBOOK.md`
(the database side of a bad release).
