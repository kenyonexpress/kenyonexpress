# Launch runbook

The order of operations for going live, command by command, with the rollback
for each step next to it.

This is not the checklist of what is left. That is `docs/FINAL-REPORT.md` and
`GO-LIVE.md`. This is the sequence to run **on the day**, once those are clear.

Read it end to end before starting anything. Two steps are one-way inside a
short window, and both are called out.

---

## Before the day: the four things that must already be true

None of these can be done during the cutover, and each one takes hours to days
of waiting on somebody else.

| | What | Why it cannot wait |
| --- | --- | --- |
| 1 | Resend domain verified | DNS propagation. Until it is green, every transactional email is refused, which means no voucher ever reaches a buyer. |
| 2 | Cardcom production terminal issued | Cardcom issues it on a call (03-9436100). A test terminal takes real cards and settles nowhere. |
| 3 | Every variable in "Environment" below set in Vercel Production | `NEXT_PUBLIC_*` are inlined **at build time**. Setting one after the build means redeploying, not restarting. |
| 4 | Migration 128 applied, or explicitly declined | It is what makes the catalogue real. Launching without it ships 34 demo products and hides all 19 real ones. |

---

## Step 1. Freeze and tag

```bash
cd /Users/ofir/kenyonexpress-web/kenyonexpress
git checkout phase5/homepage
git pull --ff-only origin phase5/homepage
git status --porcelain          # must print nothing
git log --oneline -1
```

Tag the exact commit you are launching, so "roll back" later means one command
and not a discussion about which commit was live:

```bash
git tag -a v1.0.0 -m "production launch"
git push origin v1.0.0
```

**Rollback:** `git tag -d v1.0.0 && git push origin :refs/tags/v1.0.0`

---

## Step 2. Prove the build on this machine before Vercel sees it

An empty `.next`, because a stale cache is how a build "succeeds" while serving
a previous commit. That has happened here.

```bash
rm -rf .next
pnpm install --frozen-lockfile
pnpm type-check
pnpm lint
pnpm test
pnpm build
```

All five must exit 0. `pnpm build` is a **separate gate** from the other four:
`cacheComponents` rejects uncached page reads that tests, type-check and lint
all pass.

**Rollback:** nothing has left the machine. Fix and repeat.

---

## Step 3. Environment, in Vercel, before the deploy

Vercel > Project Settings > Environment Variables > **Production**.

Required, in the sense that the site is wrong without them:

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page, the publishable key |
| `SUPABASE_SECRET_KEY` | same page, the **secret** key. Never `NEXT_PUBLIC_`. |
| `VOUCHER_QR_SECRET` | `openssl rand -hex 32`. Generate once and never rotate casually: see the warning below. |
| `CRON_SECRET` | `openssl rand -hex 32`. Same value goes into the scheduler. |
| `RESEND_API_KEY` | Resend > API Keys |
| `CARDCOM_TERMINAL_NUMBER` | Cardcom |
| `CARDCOM_API_NAME` | Cardcom |
| `CARDCOM_API_PASSWORD` | Cardcom |
| `CARDCOM_WEBHOOK_SECRET` | Chosen by you. It is the unguessable `?s=` in the IndicatorUrl, and it is the only thing standing between the webhook and the internet, because **Cardcom does not sign its callbacks**. |
| `NEXT_PUBLIC_APP_URL` | `https://kenyonexpress.co.il` |
| `NEXT_PUBLIC_SITE_URL` | the same value. Two variables, both read, different modules. |
| `NEXT_PUBLIC_WHATSAPP_PHONE` | the real business number. Unset, every WhatsApp link falls back to `972524635550`, which is the number published by the store the live site calls "Test Store". |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry > project `kenyonexpress-web` (EU region). Read **at build time**: a build without it produces a bundle whose SDK is `dsn: undefined` and reports nothing, silently. |
| `CONTACT_TO` | where contact-form and operator mail goes |

Every other variable in `.env.example` is optional and degrades to a documented
fallback. Read the comment there before deciding to skip one.

**⚠️ `CARDCOM_USE_MOCK` must not be set.** It makes payments succeed without a
card being charged.

**⚠️ `VOUCHER_QR_SECRET` is not rotatable on a whim.** Every voucher already
issued is signed with it. Rotating invalidates them all unless the old value is
moved to `VOUCHER_QR_SECRET_PREVIOUS` first.

Check what is actually set before continuing:

```bash
vercel env ls production
```

**Rollback:** variables can be edited freely at this point; nothing is built yet.

---

## Step 4. Deploy to Vercel, still on the old domain

The GitHub App has to be able to see the repo first:
<https://github.com/apps/vercel> > Configure > kenyonexpress > Repository
access > Only select repositories > add `kenyonexpress` > Save.

Then push, or deploy explicitly:

```bash
vercel --prod
```

Wait for the build to finish and open the `*.vercel.app` URL it prints. **The
domain is still pointing at WordPress at this stage**, which is the whole point:
everything below is verified on a URL no customer is using.

```bash
DEPLOY=https://<the-deployment>.vercel.app

curl -s -o /dev/null -w 'home        %{http_code}\n' "$DEPLOY/"
curl -s -o /dev/null -w 'products    %{http_code}\n' "$DEPLOY/products"
curl -s -o /dev/null -w 'health 401  %{http_code}\n' "$DEPLOY/api/cron/health"
curl -s -o /dev/null -w 'sitemap     %{http_code}\n' "$DEPLOY/sitemap.xml"
curl -s -o /dev/null -w 'robots      %{http_code}\n' "$DEPLOY/robots.txt"
```

Expect `200 200 401 200 200`. **The 401 is a pass**: it proves `CRON_SECRET` is
set and the cron routes are closed to the public.

Then the one that cannot be inferred from a status code:

```bash
curl -s "$DEPLOY/api/health" | python3 -m json.tool
```

Read it. It reports the database, the outbox and the payment provider
separately, and a 200 with a failing check inside is the case this exists for.

**Rollback:** Vercel > Deployments > the previous one > Promote to Production.
Nothing customer-facing has changed yet regardless.

---

## Step 5. One real payment, on the production terminal, before the domain moves

Do not skip this and do not do it with the mock. Buy the cheapest coupon on the
site with a real card.

Then confirm, in this order, that the money actually moved and the customer
actually got something:

```bash
# The order reached `paid`, and the voucher exists.
# Supabase > SQL editor:
#   select id, status, paid_at, total_ils from orders order by created_at desc limit 1;
#   select id, status, code from vouchers order by created_at desc limit 1;
```

- The confirmation email arrived (this exercises Resend end to end).
- `/account/orders` shows it.
- `/account/coupons` shows the QR, and `/scan` accepts it once and refuses it
  the second time.
- Cardcom's own dashboard shows the transaction with the same amount.

Then **refund it from the Cardcom dashboard** and confirm the refund lands.

**Rollback:** set `CHECKOUT_ENABLED=false` in Vercel and redeploy. The shop
stays up and browsable; only the pay button closes.

---

## Step 6. The ten scheduled jobs

Follow `docs/CRON-EXTERNAL.md`, using `$DEPLOY` as the base URL for now and
switching it to the apex domain after step 7.

The two checks that matter, from that document:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$DEPLOY/api/cron/health"                       # expect 401
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $CRON_SECRET" \
     "$DEPLOY/api/cron/health"                                                            # expect 200
```

A 401 on the second means the value in the scheduler and the value in Vercel
differ. That is the usual failure and both halves look right in isolation.

**Rollback:** disable the jobs at the scheduler. Nothing else depends on them
being on.

---

## Step 7. The domain. This is the one-way step.

Everything above is reversible in seconds. This one is reversible in **as long
as DNS takes to propagate**, which is not seconds.

Two things break the moment this happens, and both are known:

1. **All 32 product images 404.** They are served from
   `kenyonexpress.co.il/wp-content/uploads/...` by the WordPress install this
   replaces. Pull them into R2 **before** this step, or the nineteen real
   products go live with no picture.
2. The old WordPress site becomes unreachable at its own URLs. Confirm
   `src/lib/seo/redirects.ts` covers the paths worth keeping, and that
   `redirect_coverage` passes, before you move the record.

Lower the TTL a day ahead so a rollback is minutes and not hours:

Cloudflare > kenyonexpress.co.il > DNS > the `A`/`CNAME` for the apex > TTL
`Auto` becomes `2 min`. **Do this the day before, not now.**

Then point the record at Vercel per Vercel > Project > Settings > Domains, add
both `kenyonexpress.co.il` and `www.kenyonexpress.co.il`, and let Vercel issue
the certificate.

```bash
dig +short kenyonexpress.co.il A
curl -s -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/
curl -s https://kenyonexpress.co.il/ | grep -c wp-content     # expect 0
```

`wp-content` still appearing means you are being served the old site, cached or
not yet propagated. Wait; do not change anything else while waiting.

**Rollback:** put the old A records back in Cloudflare. With a 2 minute TTL this
is a few minutes. Write the old values down before you change them:

```bash
dig +short kenyonexpress.co.il A > ~/Desktop/dns-before-cutover.txt
```

---

## Step 8. After the domain moves

```bash
# The scheduler's URLs now point at the apex, not the deployment URL.
# Update all ten in cron-job.org.

curl -s -o /dev/null -w 'home     %{http_code}\n' https://kenyonexpress.co.il/
curl -s -o /dev/null -w 'sitemap  %{http_code}\n' https://kenyonexpress.co.il/sitemap.xml
curl -s https://kenyonexpress.co.il/api/health | python3 -m json.tool
```

Then:

- Google Search Console: add the property, submit `sitemap.xml`.
- Sentry: confirm an event arrives from the production deployment. `/debug/sentry`
  is gated behind `SENTRY_DEBUG_ROUTES` and is the fastest way to prove it.
- Watch the first hour of `notifications` cron runs. It is the only path by which
  a customer receives their voucher.

---

## The kill switch, and what it does not do

```
CHECKOUT_ENABLED=false
```

Closes the pay button and leaves the shop browsable. It does **not** stop the
cron jobs, does not stop webhooks for payments already in flight, and does not
touch orders that are already paid. For those, disable the jobs at the scheduler
and let the in-flight webhooks finish; they are idempotent and finishing is the
correct outcome for a card that has already been charged.

## Full rollback, in order

1. `CHECKOUT_ENABLED=false` in Vercel, redeploy. Stops new money.
2. DNS back to the old A records. Site returns to WordPress.
3. Disable the ten jobs at the scheduler.
4. Vercel > Deployments > previous > Promote to Production, if the deployment
   itself was the problem.

Database changes are **not** in this list on purpose. Migration 128 carries its
own rollback block at the foot of the file, and nothing else in the launch
writes schema. Do not roll a migration back to fix a front-end problem.
