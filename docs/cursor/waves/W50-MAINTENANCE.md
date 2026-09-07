# W50 Maintenance

Code-agent spec. After v7.0.0-rc1. Not a launch blocker.

---

## What it builds

1. Daily: cron 200, ntfy quiet, Cardcom reconcile 04:00 UTC.
2. Weekly digest cron (Friday 04:00 UTC).
3. Retention cron monthly (`/api/cron/retention`, 157 if applied).
4. Dependency audit: no new abandoned npm. pnpm audit.
5. Re-measure RLS when tables added.

---

## Tables

Whatever new waves add. Manifest update required.

---

## RLS

New table: RLS on + policies or `service_role_only` reason >20 chars.

---

## Money invariants

No drive-by `round2` on money. No global percent "just for new products".

---

## Tests before close

Ongoing: CI on `ke-cursor-docs` is docs-only; code CI on the code branch.

---

## Feature flag

Review kill switches after incidents; turn back off.

---

## Docs updated

`POST-LAUNCH-30-DAYS.md`, `CHANGELOG.md`, scorecard.

---

## Edge cases

Actions quota. Double cron if 162 vault later seeded.

---

## Hebrew UX strings

N/A.

---

## Open questions

| Q | Best answer |
|---|---|
| Who is on-call? | `ON-CALL-GUIDE.md`. Default ntfy topic must not stay guessable. |

---

## Second pass (after launch)

- Watch stranded, reconcile, cron 200, scan `error`, Actions minutes (`POST-LAUNCH-30-DAYS.md`).
- Workstation tar is not PITR. Keep three Desktop backups only.
- Do not add global 10%, escrow, or payout tables to silence 500.
- ntfy topic unguessable. No amounts.

