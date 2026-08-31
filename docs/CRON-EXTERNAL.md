# Scheduled jobs, run from outside Vercel

Ten jobs. All ten are `GET`, all ten authenticate with the same header, and all
ten are wired to be run by a scheduler that is not Vercel.

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

## Setting it up on cron-job.org

Free, no card, and it can do minute-level schedules, which is the reason it is
named here rather than a platform cron.

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
Delete the ten jobs at the scheduler in the same change, or every job runs
twice. All ten handlers are idempotent, so a double run is not a correctness
problem, but `notifications` sending twice would be visible to customers if the
outbox dedupe ever regressed, and paying twice for the same work is not a habit
worth acquiring.
