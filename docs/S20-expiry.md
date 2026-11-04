# S20: coupon expiry reminders, T-7 and T-1

Queue item S20, 04.11.2026. Scope: two pg_cron jobs, T-7 and T-1, each calling
`/api/cron/expiry` with `CRON_SECRET`. Push and email go out according to the
customer's preferences. The `cron.job` rows are verified through
`supabase db query`.

## What already existed, and what did not

Everything except the clock and the email leg was already there.
`enqueue_expiring_voucher_notices(p_buckets integer[] DEFAULT ARRAY[7, 1])`
is live and writes one `voucher_expiring` outbox row per voucher per bucket,
deduplicated by key. The outbox drain (`/api/cron/notifications`) sends push,
in-app and email, and gates each leg with `mayNotify`.

Measured on production before writing anything (04.11):

- **162 is applied.** There are twelve `ke-*` jobs, and every one is a
  `net.http_post` to `APP_BASE_URL`, which was the apex. The apex answers 308
  to `www`, pg_net follows it, and every cron route exports GET only. **All
  258 rows in `net._http_response` are 405.** `cron.job_run_details` reads
  "succeeded" for them, because pg_net only enqueues the request.
  `ke-notifications` has never drained a row.
- `push-expiry-reminders` (jobid 142, `0 6 * * *`) POSTed to `/api/push/send`,
  a route that does not exist. Its URL came from
  `current_setting('app.settings.base_url')`, which is unset, so it failed
  daily with `unrecognized configuration parameter "app.settings.base_url"`.
- `notification_outbox` has never held a `voucher_expiring` row, and today no
  `issued` voucher carries an `expires_at`, so no reminder is owed yet.

## What was built

1. **`src/app/api/cron/expiry/route.ts`** (new). It checks the bearer, then
   `?days=7` or `?days=1` enqueues that one bucket. With no `days` it
   enqueues both, which is what the GitHub fallback in `scripts/cron-jobs.json`
   calls. Any other value returns 400. It then runs one pass of the outbox
   drain with the same bearer, so the reminder leaves on this call and does not
   depend on the broken `ke-notifications`. An enqueue failure returns 500 and
   skips the drain. A drain failure leaves the enqueue in place, and the rows
   stay pending.
2. **Email per preference** (`mayNotify`). `voucher_expiring` is now an
   *opt-in* email kind (`OPT_IN_CUSTOMER_EMAIL_KINDS` in
   `src/lib/email/automatic-email-policy.ts`). Only a stored
   `{voucher_expiring, email, enabled: true}` row sends the mail. A missing row
   or `false` sends nothing. Push stays default-on and follows its own switch,
   and in-app is unchanged.
3. **The switch** (`src/components/notifications/ExpiryEmailSwitch.tsx`, new
   file). One checkbox on `/account/notifications`, off by default. It writes
   through the existing `saveNotificationPreference` action, which already
   accepted the `email` channel. The frozen `PreferenceSwitches` was not
   touched. Strings are in the i18n catalogue (`expiryEmail.*`).
4. **Migration 258** (`migrations/pending/258_expiry_cron_t7_t1.sql`),
   **applied**. It re-seeds `APP_BASE_URL` from the apex to
   `https://www.kenyonexpress.co.il`, unschedules `push-expiry-reminders`, and
   schedules `ke-expiry-t7` (`20 23 * * *`) and `ke-expiry-t1`
   (`25 23 * * *`). Both are `net.http_get` calls that read the secret and the
   base URL from the vault at run time. Both run after Jerusalem midnight and
   after the 23:15 sweep.

**Decision taken alone:** email is opt-in rather than default-on. Under the
owner's S12 policy, the purchase confirmation is the only mail the system
sends on its own. "Email per preference" is met by making the customer's own
switch the only thing that sends it.

## Proof

### Migration apply

```
$ supabase db query --linked -f migrations/pending/258_expiry_cron_t7_t1.sql
Initialising login role...
{ "rows": [ { "schedule": 145 } ] }
```

### cron.job rows

```
select jobid, jobname, schedule, active,
       position('net.http_get' in command) > 0 as is_get,
       position('net.http_post' in command) > 0 as is_post,
       position('vault.decrypted_secrets' in command) > 0 as reads_vault,
       position('/api/cron/expiry?days=' in command) > 0 as hits_expiry
  from cron.job where jobname in ('ke-expiry-t7','ke-expiry-t1','push-expiry-reminders') order by jobname;

{'active': True, 'hits_expiry': True, 'is_get': True, 'is_post': False, 'jobid': 145, 'jobname': 'ke-expiry-t1', 'reads_vault': True, 'schedule': '25 23 * * *'}
{'active': True, 'hits_expiry': True, 'is_get': True, 'is_post': False, 'jobid': 144, 'jobname': 'ke-expiry-t7', 'reads_vault': True, 'schedule': '20 23 * * *'}
```

`push-expiry-reminders` returns no row, so it is gone. The vault check:
`{'is_www': True}`.

### The call path, fired by hand with the jobs' own command shape

The test was `net.http_get` to the vault `APP_BASE_URL` with the vault
`CRON_SECRET` bearer, once to a deployed route and once to the new route:

```
{'id': 12315, 'status_code': 503, 'body': '{"ok":false,"checkedAt":"2026-11-04T11:15:15.950Z","dependencies":[{"name":"database","status":"ok",...'}   /api/cron/health
{'id': 12316, 'status_code': 404, 'body': '<!DOCTYPE html>...'}                                                                                   /api/cron/expiry?days=7
```

The 503 carries the health handler's JSON body, so the request got past the
bearer check. The vault `CRON_SECRET` matches Vercel's, and GET to `www`
reaches the handler. Before 258, the same request would have been a 308. The
404 on `/api/cron/expiry` means production has not deployed this commit yet.
Production deploys come from `audit/final-audit`, not this branch. The jobs
will return 200 once the route ships, and no SQL change is needed.

### Gates

```
pnpm test        Test Files  670 passed | 1 skipped (671)
                 Tests  8017 passed | 13 skipped (8030)
pnpm type-check  tsc exit 0
biome check <staged files>   Checked 15 files. No fixes applied.
tokens/copy/asset/raw-html/postgrest-or/cache-invalidation/rtl-logical/i18n/locale-format/input-dir gates: exit 0
docs-index-gate, docs-path-audit: exit 0 once this file exists
```

New tests: `src/app/api/cron/expiry/route.test.ts` (11),
`src/components/notifications/ExpiryEmailSwitch.test.tsx` (3),
`src/__tests__/expiry-cron-258.test.ts` (6), and the S20 opt-in case in
`src/lib/notifications/preferences.test.ts`.

### Freeze gate

```
$ git diff --cached --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../notifications/ExpiryEmailSwitch.test.tsx       | 34 +++++++++++
 src/components/notifications/ExpiryEmailSwitch.tsx | 52 ++++++++++++++++
 .../supplier-apply/SupplierCardCheck.tsx           | 53 ++++++++++++++++
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 5 files changed, 259 insertions(+)
```

`git cat-file -e design-locked-2026-10-19:<file>` fails for all five, so every
listed file is new since the tag. The two `ExpiryEmailSwitch` files are S20's,
and the other three are S11 and S17's.

## Open, not S20's to fix

- **The twelve 162 jobs still POST, and every tick answers 405.** That
  includes `ke-notifications` (the drain) and `ke-expire-vouchers` (the sweep
  and the wallet credit). With the vault on `www`, converting each one to
  `net.http_get` is enough, and the 503 above shows the bearer works. That is
  a migration of its own.
