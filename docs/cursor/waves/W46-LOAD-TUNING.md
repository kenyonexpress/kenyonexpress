# W46 Load tuning

Code-agent spec. k6 in `load/` with `LOAD_ALLOW_WRITES=1` for write scenarios. Product p95 was the L1 fail historically.

---

## What it builds

1. Re-run L1 against a production-like build before v7. Do not write to production without the flag.
2. Indexes 170 composite (pending) for hottest paths.
3. ILIKE search is the cheap-host cost; Meili is the scale-out.

---

## Tables

Read-heavy: products, categories. Write: carts, rate_limits.

---

## RLS

Load tests must use anon/user, not service_role, or they do not test RLS cost.

---

## Money invariants

Load must not complete real Cardcom in production. Mock/sandbox never Production.

---

## Tests before close

k6 gates as documented in ARCHITECTURE-TESTING. Index preflight 170.

---

## Feature flag

`LOAD_ALLOW_WRITES`. Production: off.

---

## Docs updated

`COST-MODEL.md`, `PERF-BUDGET.md`, `MIGRATION-PLAYBOOK.md` 170 indexes.

---

## Edge cases

Hobby cron silence is unrelated. Actions quota can stop crons (R29).

---

## Hebrew UX strings

None.

---

## Open questions

| Q | Best answer |
|---|---|
| Upgrade Vercel? | See COST-MODEL and POST-LAUNCH-30-DAYS. Not a code wave. |

---

## Second pass (Actions not Hobby)

- Twelve jobs in
  `scripts/cron-jobs.json`.
  Do not put them in Hobby
  `vercel.json`.
- 162 pg_cron blocked on vault. Do not double-fire with Actions.
- Upgrade trigger is checkout p95 or stranded >0, not vanity GMV (169 may be 0).

