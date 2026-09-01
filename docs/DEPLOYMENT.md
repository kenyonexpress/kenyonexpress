# Deployment

Environments, secrets, how a deploy happens and how to undo one.

Written against this branch and production (`ixvwfbuvfxxsjiywhbbb`) on
**2026-09-01**.

Companion documents: `docs/ONBOARDING.md` (local),
`docs/OPERATIONS-CALENDAR.md` (scheduled work),
`docs/RUNBOOK.md` (when it breaks), `docs/INCIDENT-PLAYBOOKS.md`.

---

## 0. Before anything

**A production push to Vercel is one of the four stop-and-ask actions.** So is
running a migration against production. Neither is done without explicit
approval, and nothing in this document should be read as authorising either.

---

## 1. Environments

| Environment | Where | Database |
|---|---|---|
| Local | `pnpm dev`, `localhost:3000` | the hosted Supabase project |
| Preview | Vercel, per branch | the hosted Supabase project |
| Production | Vercel, region `fra1` | the hosted Supabase project |

**There is one database.** Local, preview and production all point at
`ixvwfbuvfxxsjiywhbbb`. There is no staging database and no local Postgres.
A destructive query run "locally" is run against production data.

**DNS is not switched over.** Pointing the domain is a manual step Ofir
approves; nothing in this repository should run it.

---

## 2. Hosting configuration

`vercel.json`:

```json
{
  "framework": "nextjs",
  "installCommand": "pnpm install --no-frozen-lockfile",
  "buildCommand": "pnpm build",
  "outputDirectory": ".next",
  "regions": ["fra1"]
}
```

`fra1` is Frankfurt, the closest region to Israel that Vercel offers on this
plan, and it is also where the Supabase project lives, so the app-to-database
hop stays inside one region.

**It declares no `crons` key, deliberately.** See §6.

`--no-frozen-lockfile` is a deliberate loosening: Vercel's pnpm version has
differed from the local one often enough that a frozen lockfile failed builds
for reasons unrelated to the change being deployed.

---

## 3. Secrets

Roughly 120 variables are documented in `.env.example`. Grouped by what breaks
without them:

### The app does not boot

```
NEXT_PUBLIC_SUPABASE_URL          NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY         NEXT_PUBLIC_APP_URL
```

### Payment does not work

```
CARDCOM_TERMINAL_NUMBER   CARDCOM_API_NAME   CARDCOM_API_PASSWORD
CARDCOM_WEBHOOK_SECRET    VOUCHER_QR_SECRET
```

### Scheduled work does not run

```
CRON_SECRET
```

### Degrades quietly if absent

```
MEILISEARCH_HOST + _API_KEY        -> Postgres ILIKE search
QSTASH_TOKEN                       -> inline index jobs
UPSTASH_REDIS_REST_URL + _TOKEN    -> Postgres rate limiting
SENTRY_DSN                         -> no error reporting
RESEND_API_KEY                     -> no outbound email
APPLE_WALLET_* / GOOGLE_WALLET_*   -> no pass button
```

### Rotation

Two secrets have `_PREVIOUS` counterparts so they can be rotated without a
window of rejected traffic:

```
CARDCOM_WEBHOOK_SECRET  +  CARDCOM_WEBHOOK_SECRET_PREVIOUS
VOUCHER_QR_SECRET       +  VOUCHER_QR_SECRET_PREVIOUS
```

The webhook compares a presented secret against **both**, in constant time,
**with no short circuit**: returning on the first match would let response time
reveal which secret was presented, defeating the constant-time comparison it
sits inside.

`VOUCHER_QR_SECRET` rotation additionally relies on the `k` (key id) field
inside the QR payload, so an old pass keeps verifying against the old key until
it expires.

**Rotation order matters.** Set `_PREVIOUS` to the current value first, then set
the primary to the new value. Doing it the other way rejects every in-flight
callback for the duration.

### Validation

`src/lib/env.ts`, called from `instrumentation.ts` `register()`, runs **before
the server accepts a request**. A deploy missing a required secret fails to
boot rather than serving until the first customer tries to pay.

`ALLOW_INCOMPLETE_ENV` is the escape hatch, and it exists because **`next start`
on a laptop is also `NODE_ENV=production`**: that is how Lighthouse and the
Playwright suite are measured, against the real build. Without the hatch, boot
validation refuses to start that server.

---

## 4. Deploying

Vercel builds on push to the connected branch. That is the whole mechanism.

```
git push origin <branch>   ->  Vercel builds  ->  preview URL
promote in the dashboard   ->  production
```

**The Vercel CLI is reachable locally but there is no project link and no
token in this checkout**, so any instruction of the form `vercel deploy` or
`vercel rollback` **cannot be followed from here**. Deployment and rollback are
dashboard actions.

### Before you push

```bash
pnpm test && pnpm type-check && pnpm lint && pnpm build
```

`pnpm build` is a **separate gate**: `cacheComponents` rejects uncached page
reads that the other three all pass. A change can be green on tests, types and
lint and still fail the build.

> Concurrent builds across git worktrees OOM each other. If several agents or
> checkouts are active, gate on test/type-check/lint and run the build alone.

---

## 5. Rollback

### Application

Vercel keeps every deployment. **Promote the previous one from the dashboard.**
That is the fastest and safest rollback available and it should be the first
move in almost any bad-deploy incident.

### Database

**Postgres has no undo for DDL.** Reversing a migration means writing and
applying a second, forward migration. Before applying anything to production,
have the reverse written.

**`db push` is forbidden.** Schema changes are files in `migrations/pending/`,
applied through MCP `apply_migration` after explicit approval.

Check what is actually applied before assuming:

```sql
select version, name from supabase_migrations.schema_migrations
order by version desc limit 20;
```

### What cannot be rolled back at all

- **A Cardcom charge.** A refund is a *new* `payments` row with
  `kind = 'refund'`, not an edit to the original.
- **A redeemed voucher.** `redeemed` is terminal by design; there is no
  un-redeem. Restoring value afterwards is a wallet credit, a different money
  movement against a different table.
- **An `INSERT` into `payment_events`.** The `payment_events_append_only`
  trigger refuses UPDATE and DELETE. That is the point of the table.

---

## 6. Scheduled work is not deployed

The ten cron routes under `/api/cron/*` are **correct, deployed, and never
called.**

They were removed from `vercel.json` deliberately. Vercel's cron allowance is a
plan feature: on Hobby it is two jobs at daily granularity. This project needs
ten, four of them at five- or ten-minute intervals. **Declaring all ten anyway
does not fail the build and does not warn** — the platform runs the ones the
plan covers and silently ignores the rest, which is how a payment reconciler
comes to be believed to be running when it is not. Removing them was the honest
choice.

Two candidate schedulers exist and neither is switched on:

- `.github/workflows/cron.yml` needs `CRON_SECRET` in Actions secrets
  (`gh secret list` returns nothing) plus an enabling variable.
  **A scheduled workflow only fires from the default branch**; a `cron:`
  workflow on a feature branch never runs and `gh workflow run` answers 404.
- cron-job.org needs a person in a browser.

Details in `docs/CRON-EXTERNAL.md` and `docs/OPERATIONS-CALENDAR.md`.

---

## 7. Post-deploy verification

```bash
curl -s https://<host>/api/health | jq
# {"ok":true,"database":"ok"}

curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/cron/notifications
# 401 expected without the secret

curl -s -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/health | jq
# seven dependency checks
```

Then confirm the catalogue is the real one and not seed data, and that a product
page renders with Hebrew RTL intact.

`production-smoke.yml` in `.github/workflows/` runs a Playwright smoke suite
against production.

---

## 8. Launch blockers

Neither is a deployment problem, and both make a deploy pointless until fixed:

1. **`finalize.ts` selects two columns production does not have**
   (`orders.cashback_applied_agorot`, `order_items.unit_price_agorot`). The
   first real payment raises `42703` and lands a charged customer with no
   order. `docs/RUNBOOK.md` §4.1.
2. **No scheduler**, so no customer receives a voucher email. §6.

---

## 9. Verification

```bash
cat vercel.json
gh secret list                     # currently empty
git log --oneline -1 origin/main
```

```sql
select count(*) from supabase_migrations.schema_migrations;   -- 98
```
