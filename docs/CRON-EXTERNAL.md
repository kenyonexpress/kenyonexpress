# Scheduled jobs, run from outside Vercel

> **STATUS 2026-09-02: THE ACTIONS SCHEDULER IS LIVE.** `CRON_SECRET` and
> `CRON_SCHEDULER_ENABLED=true` are set on the repository
> (`scripts/set-github-secrets.sh`, run against a Vercel production env pull),
> and a dispatched `health` run completed green against production. All ten
> schedules now fire from `.github/workflows/cron.yml` on main. cron-job.org is
> therefore OPTIONAL, not required; if it is ever set up, flip
> `CRON_SCHEDULER_ENABLED` off first -- two schedulers call every job twice.
> `scripts/setup-cron-jobs.mjs` remains ready for that day.

Ten jobs. All ten are `GET`, all ten authenticate with the same header, and all
ten are wired to be run by a scheduler that is not Vercel.

**Which scheduler, as of 2026-09-01.** Two are written down here and only one is
set up. `.github/workflows/cron.yml` is in this repository and needs two
settings; cron-job.org is the better scheduler and needs a person in a browser.
Neither is running yet: `gh secret list` on `kenyonexpress/kenyonexpress`
returns nothing, so `CRON_SECRET` is not set in Actions, and no variable enables
the workflow. **Until one of them is switched on, none of the ten runs at all.**

## Why they left `vercel.json`

Vercel's cron allowance is a plan feature, not a code one. On Hobby it is two
jobs at daily granularity; this project needs ten, and four of them at five or
ten minute intervals. `vercel.json` declared all ten anyway, which does not
fail the build and does not warn: the platform silently runs the ones the plan
covers and ignores the rest, so the failure mode is a payment reconciler that
everyone believes is running.

Three of the ten are on the money path (`invoices`, `reconcile`,
`stranded-payments`) and one is the only thing that ever sends a customer their
voucher email (`notifications`). "Silently not scheduled" is not an acceptable
state for any of the four, so the schedule moved somewhere it can be seen.

Nothing in the build depends on the `crons` key. It is read by the platform at
deploy time to register schedules; the route handlers are ordinary route
handlers and are built, and reachable, either way.

## The one thing to set up first

Every route answers `401` unless the request carries:

```
Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET` is an environment variable on the deployment. It has no default
and no fallback: `bearerMatches(request.headers.get('authorization'), secret ?? '')`
compares against the empty string when the variable is missing, which never
matches, so **an unset `CRON_SECRET` closes every job rather than opening it**.
That is the safe direction and it is also a silent one: the symptom is ten
schedules returning 401 forever, not an error at deploy.

Generate it once:

```bash
openssl rand -hex 32
```

**The real value is deliberately not written in this file.** It is set in Vercel
and it is a credential: a doc in a public repository is the one place it must
not be. Verified live on 2026-09-01 instead, which proves it is set without
disclosing it: all ten routes answer **401** to an unauthenticated GET.

```
/api/cron/health 401   /api/cron/notifications 401   /api/cron/invoices 401
/api/cron/reconcile 401   /api/cron/stranded-payments 401
```

Paste the value from Vercel into the scheduler's Authorization header; the shape
is `Bearer <64 hex characters>`.

Set it in **Vercel > Project Settings > Environment Variables > Production**,
and paste the same value into the scheduler.

## The ten lines, ready to paste

One line per job, in the order they matter if you are setting them up under
time pressure. Every line is the same four fields: **URL**, **method**,
**schedule**, **header**. The method is `GET` on all ten and the header is
byte-identical on all ten, so the only thing that changes row to row is the URL
and the cron expression.

Replace `<CRON_SECRET>` with the value from Vercel > Project Settings >
Environment Variables > Production. It is not written here on purpose: this
file is in a repository.

```
1  https://kenyonexpress.vercel.app/api/cron/notifications       GET  */5 * * * *   Authorization: Bearer <CRON_SECRET>
2  https://kenyonexpress.vercel.app/api/cron/health              GET  */5 * * * *   Authorization: Bearer <CRON_SECRET>
3  https://kenyonexpress.vercel.app/api/cron/invoices            GET  */10 * * * *  Authorization: Bearer <CRON_SECRET>
4  https://kenyonexpress.vercel.app/api/cron/stock               GET  */10 * * * *  Authorization: Bearer <CRON_SECRET>
5  https://kenyonexpress.vercel.app/api/cron/stranded-payments   GET  */10 * * * *  Authorization: Bearer <CRON_SECRET>
6  https://kenyonexpress.vercel.app/api/cron/abandoned-cart      GET  0 * * * *     Authorization: Bearer <CRON_SECRET>
7  https://kenyonexpress.vercel.app/api/cron/subscriptions       GET  30 2 * * *    Authorization: Bearer <CRON_SECRET>
8  https://kenyonexpress.vercel.app/api/cron/reap-carts          GET  40 3 * * *    Authorization: Bearer <CRON_SECRET>
9  https://kenyonexpress.vercel.app/api/cron/reconcile           GET  0 4 * * *     Authorization: Bearer <CRON_SECRET>
10 https://kenyonexpress.vercel.app/api/cron/expire-vouchers     GET  15 23 * * *   Authorization: Bearer <CRON_SECRET>
11 https://kenyonexpress.vercel.app/api/cron/retention           GET  0 5 1 * *     Authorization: Bearer <CRON_SECRET>
```

Verified against the code at HEAD, not from memory: all ten handlers export
`GET` and nothing else (`export const GET = withRequestLog(...)` in each
`route.ts`), so a POST gets 405. The ten cron expressions are the ones
`vercel.json` carried before commit `21342fc4`, kept byte for byte.

## The ten jobs

Base URL is `https://kenyonexpress.vercel.app`, the Vercel production origin.
It is deliberately NOT the apex domain: `kenyonexpress.co.il` still points at
the old WordPress install, so a job pointed there today would be calling
WordPress and getting a 404 that looks like a broken route. **After the DNS
cutover, change all ten to `https://kenyonexpress.co.il/...`** (the Vercel URL
keeps working, but the apex is the canonical origin and is what the redirects,
the sitemap and the cookies are scoped to). Times are UTC, which
is what every scheduler means by default; Israel is UTC+2 in winter and UTC+3
in summer, so the two overnight jobs drift by an hour across the year. That is
deliberate and harmless: both are sweeps with a wide window, not appointments.

| # | Schedule (UTC) | Cron | URL |
| --- | --- | --- | --- |
| 1 | every 5 min | `*/5 * * * *` | `https://kenyonexpress.vercel.app/api/cron/notifications` |
| 2 | every 5 min | `*/5 * * * *` | `https://kenyonexpress.vercel.app/api/cron/health` |
| 3 | every 10 min | `*/10 * * * *` | `https://kenyonexpress.vercel.app/api/cron/invoices` |
| 4 | every 10 min | `*/10 * * * *` | `https://kenyonexpress.vercel.app/api/cron/stock` |
| 5 | every 10 min | `*/10 * * * *` | `https://kenyonexpress.vercel.app/api/cron/stranded-payments` |
| 6 | hourly | `0 * * * *` | `https://kenyonexpress.vercel.app/api/cron/abandoned-cart` |
| 7 | 02:30 daily | `30 2 * * *` | `https://kenyonexpress.vercel.app/api/cron/subscriptions` |
| 8 | 03:40 daily | `40 3 * * *` | `https://kenyonexpress.vercel.app/api/cron/reap-carts` |
| 9 | 04:00 daily | `0 4 * * *` | `https://kenyonexpress.vercel.app/api/cron/reconcile` |
| 10 | 23:15 daily | `15 23 * * *` | `https://kenyonexpress.vercel.app/api/cron/expire-vouchers` |
| 11 | 05:00 ב-1 לחודש | `0 5 1 * *` | `https://kenyonexpress.vercel.app/api/cron/retention` |

Those are the schedules `vercel.json` carried, kept exactly, so nothing about
timing changes with the scheduler.

### What each one does, in the order it matters if you are triaging

- **`notifications`** drains `notification_outbox` and retries what failed. This
  is the only path by which a customer receives their voucher, an order
  confirmation, or a supplier a sale alert. If exactly one job is running, make
  it this one.
- **`invoices`** issues the queued Cardcom documents. A gap here is a legal
  gap, not a cosmetic one.
- **`stranded-payments`** finds payments that were verified but whose order
  never finalised. That state is the worst one in the system and this is what
  notices it.
- **`reconcile`** matches the day's payments against orders.
- **`health`** runs the internal checks and raises the alert. It is what tells
  you the other nine stopped.
- **`stock`** releases reservations that were never consumed.
- **`abandoned-cart`** queues the recovery nudge.
- **`subscriptions`** bills the recurring plans.
- **`reap-carts`** deletes expired guest carts.
- **`expire-vouchers`** marks vouchers past their date as expired.
- **`retention`** ages audit_log IPs older than 365 days to NULL through
  `fn_audit_retention_sweep()` (pending/157) -- the one write the append-only
  trigger sanctions. Answers ok with `pending` until 157 is applied.

## Setting it up from this repository, in two settings

`.github/workflows/cron.yml` fires on the seven distinct cron expressions and
hands `github.event.schedule` to `scripts/run-cron-jobs.sh`, which looks up the
jobs due on that expression in `scripts/cron-jobs.json` and calls them. The
schedule is written once, in the JSON; the workflow, this document and the route
directory are checked against it by
`src/__tests__/cron-schedule-inventory.test.ts`, so a schedule cannot be changed
in one place and stay stale in the others.

Two settings, both under **Settings > Secrets and variables > Actions**:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `CRON_SCHEDULER_ENABLED` | `true` |
| Secret | `CRON_SECRET` | the same value as `CRON_SECRET` in Vercel |

Both are required, because either alone is a way to be wrong quietly. The
variable is evaluated before a runner starts, so while it is unset the schedules
cost nothing and call nothing. The secret is read inside the run; with the
switch on and no secret, the script calls nothing and prints a notice, rather
than answering 401 ten times every five minutes and turning the Actions list red
in a way that means "not configured".

Two more are optional. `CRON_BASE_URL` (variable) overrides the target and is
what to set to `https://kenyonexpress.co.il` after the DNS cutover;
`CRON_NTFY_TOPIC` (variable) overrides the ntfy topic a failure is announced on,
which defaults to `kenyon-ofir-limit`.

**Run one by hand first.** Actions > Scheduled jobs > Run workflow, with the
default input `health`. It calls exactly one job, the one that is safe to call
at any moment, and its log prints the HTTP status. Enter `all` to call all ten.

### What this scheduler is worse at

GitHub's cron is best effort, and this is the reason cron-job.org is still the
one named below. Runs are delayed under load, commonly by five to fifteen
minutes, and a run can be dropped entirely. `*/5` therefore means "usually every
five minutes". All ten are sweeps with wide windows rather than appointments, so
a late or missed run costs latency and not correctness - a voucher email arrives
eight minutes after the payment instead of three.

It also stops on its own. GitHub disables scheduled workflows in a repository
with 60 days of no commits, and the only symptom is an email.

**Do not run both schedulers.** Set `CRON_SCHEDULER_ENABLED` to anything but
`true` on the day cron-job.org is set up. All ten handlers are idempotent so a
double run is not a correctness problem, but `notifications` sending twice is
customer-visible if the outbox dedupe ever regresses.

## Setting it up on cron-job.org

Free, no card, and it can do minute-level schedules, which is the reason it is
named here rather than a platform cron. It is the better of the two: it fires on
time, it does not switch itself off after a quiet 60 days, and its failure
notifications go to an inbox rather than to a list of workflow runs.

For each of the ten rows:

1. **Create cronjob**
2. **Title**: the job name from the table (`notifications`, `health`, ...).
3. **URL**: the URL from the table.
4. **Execution schedule** > *Custom* > paste the cron expression.
5. **Advanced** > **Request method**: `GET`. All ten are GET; a POST gets 405.
6. **Advanced** > **Headers** > add one:
   - Name: `Authorization`
   - Value: `Bearer <the CRON_SECRET value>`
7. **Advanced** > **Treat redirects as success**: leave OFF. A 3xx here means
   the URL is wrong (usually the apex/`www` mismatch), and you want to see that
   rather than have it counted green.
8. **Notifications**: enable failure notifications to the owner's email. A
   scheduler nobody is watching is the same as no scheduler.
9. **Save**.

### Check it worked, before trusting it

```bash
# Expect 401: proves the guard is live and the secret is required.
curl -s -o /dev/null -w '%{http_code}\n' https://kenyonexpress.vercel.app/api/cron/health

# Expect 200: proves the secret you pasted is the secret the deployment has.
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://kenyonexpress.vercel.app/api/cron/health
```

If the first returns anything other than 401, stop: the route is not guarded on
that deployment and the secret is not set.

If the second returns 401, the value in the scheduler and the value in Vercel
are different. This is the single most common way this setup fails, because
both look correct in isolation.

After the first five minutes, cron-job.org's history for `notifications` should
show a 200. Everything else is downstream of that.

## Rolling back to Vercel cron

If the plan is upgraded and platform cron becomes the better answer, the `crons`
key goes back into `vercel.json` with the same ten paths and the same ten
schedules, and Vercel signs its own requests with `CRON_SECRET` automatically.
Delete the ten jobs at the scheduler, and set `CRON_SCHEDULER_ENABLED` to
`false`, in the same change, or every job runs twice. All ten handlers are idempotent, so a double run is not a correctness
problem, but `notifications` sending twice would be visible to customers if the
outbox dedupe ever regressed, and paying twice for the same work is not a habit
worth acquiring.
