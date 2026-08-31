# Launch runbook

The order of operations for going live, command by command, with the rollback
for each step next to it.

This is not the checklist of what is left. That is `docs/FINAL-REPORT.md` and
`GO-LIVE.md`. This is the sequence to run **on the day**, once those are clear.

Read it end to end before starting anything. Two steps are one-way inside a
short window, and both are called out.

---

## Status, 2026-09-01: steps 1 to 6 are DONE. Step 7, the domain, is not.

The site is live at **<https://kenyonexpress.vercel.app>** and serving the real
catalogue. What is already verified there:

```
/                        200      /api/health   {"ok":true,"database":"ok"}
/products                200      ten cron routes   401 unauthenticated (guard live)
/category/vacation       200      migration 127     applied and proven
/cart                    200      /account/referrals 307 to login (correct)
/search?q=מסעדה          200
/product/מלון-5-כוכבים-בטבריה  200   (one of the 19 that migration 128 published)
```

**What is left is step 7 and below**: the DNS cutover, plus a Cardcom
production terminal and Resend domain verification. Step 5's real payment must
happen on the vercel.app URL *before* the domain moves, which is still the
order this document is built around.

**Do not skip the R2 image work.** All 32 product images are still served by the
WordPress install at `kenyonexpress.co.il`, so they 404 the moment the record
moves. That is now a live-site consequence, not a hypothetical.

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

### 7.0 The state you are starting from

Measured with `dig` on 2026-09-01, not assumed. This is what is live right now:

```
kenyonexpress.co.il      A     104.21.55.125       (Cloudflare edge, Proxied)
kenyonexpress.co.il      A     172.67.148.28       (Cloudflare edge, Proxied)
kenyonexpress.co.il      AAAA  2606:4700:3035::6815:377d
kenyonexpress.co.il      AAAA  2606:4700:3036::ac43:941c
www.kenyonexpress.co.il  A     104.21.55.125
www.kenyonexpress.co.il  A     172.67.148.28
www.kenyonexpress.co.il  AAAA  2606:4700:3035::6815:377d
www.kenyonexpress.co.il  AAAA  2606:4700:3036::ac43:941c

NS   derek.ns.cloudflare.com, elma.ns.cloudflare.com
MX   10 mailgw2.spd.co.il
```

Those four A values are Cloudflare's own edge IPs, not the origin: the record
is **Proxied**, so what `dig` returns is the proxy and the WordPress origin is
hidden behind it. The four AAAA are the same proxy over IPv6. That matters for
the rollback below, which restores exactly these values.

Nameservers are Cloudflare's, so **Cloudflare is where DNS is edited**. The
registrar is not involved in this step at all.

Zone: `13a3f166fadbde6b432dff3b9668479a`
(Cloudflare > kenyonexpress.co.il > Overview > API section, bottom right.)

Write the current state to disk before touching anything:

```bash
dig +short kenyonexpress.co.il A     >  ~/Desktop/dns-before-cutover.txt
dig +short kenyonexpress.co.il AAAA  >> ~/Desktop/dns-before-cutover.txt
dig +short www.kenyonexpress.co.il A    >> ~/Desktop/dns-before-cutover.txt
dig +short www.kenyonexpress.co.il AAAA >> ~/Desktop/dns-before-cutover.txt
cat ~/Desktop/dns-before-cutover.txt
```

### 7.1 The day before: lower the TTL

Cloudflare > kenyonexpress.co.il > DNS > Records. For each of the four A and
four AAAA records on `kenyonexpress.co.il` and `www`, set **TTL** from `Auto`
to **2 min**.

`Auto` on a Proxied record means Cloudflare decides, and a rollback then takes
as long as it takes. Two minutes makes the rollback in 7.5 a coffee rather than
an afternoon. **Do this the day before, not on the day.**

### 7.2 Vercel first, DNS second

Add the domain to the project *before* the record points at it, so the
certificate is already issued when traffic arrives.

Vercel > Project `kenyonexpress` > Settings > Domains > **Add Existing Domain**:

1. Enter `kenyonexpress.co.il` > Add.
2. Enter `www.kenyonexpress.co.il` > Add.
3. Vercel shows the record it wants: an **A** record for the apex pointing at
   **`76.76.21.21`**. Leave this screen open; it is where you confirm the
   change landed.

Vercel will report both domains as "Invalid Configuration" until 7.3 is done.
That is expected and is not an error to act on.

### 7.3 Cloudflare: the exact record surgery

Cloudflare > kenyonexpress.co.il > **DNS** > **Records**.

**Delete these four records. All four, and only these four:**

| Type | Name | Content |
| --- | --- | --- |
| AAAA | `kenyonexpress.co.il` | `2606:4700:3035::6815:377d` |
| AAAA | `kenyonexpress.co.il` | `2606:4700:3036::ac43:941c` |
| AAAA | `www` | `2606:4700:3035::6815:377d` |
| AAAA | `www` | `2606:4700:3036::ac43:941c` |

Vercel serves the apex over IPv4 only. An AAAA left behind is the worst
outcome available here: IPv6-capable clients prefer AAAA, so a share of your
traffic keeps reaching the old proxy while everything you check from your own
machine looks correct. Delete all four.

**Then leave exactly one A record per name, edited to:**

| Type | Name | Content | Proxy status | TTL |
| --- | --- | --- | --- | --- |
| A | `kenyonexpress.co.il` | `76.76.21.21` | **DNS only** (grey cloud) | 2 min |
| A | `www` | `76.76.21.21` | **DNS only** (grey cloud) | 2 min |

Each name currently has **two** A records. Edit one of the pair to
`76.76.21.21` and delete the other, so each name ends with a single A. Two A
records round-robin, and half your traffic going to `172.67.148.28` is half
your traffic still being served WordPress.

**Proxy status must be DNS only.** The grey cloud, not the orange one. Proxied
puts Cloudflare's TLS in front of Vercel's, which is how you get a redirect
loop or an untrusted certificate, and Vercel cannot issue its own certificate
for a hostname whose A record answers as Cloudflare.

**Do not touch anything else in this zone.** Specifically, leave alone:

- the `MX` record (`10 mailgw2.spd.co.il`)
- every `TXT` record: SPF, DKIM, DMARC, and any verification token
- the `mail`, `pop`, `smtp` and `ftp` records

Those are the hosting provider's mail service, which is not moving. Deleting or
proxying any of them stops mail for the business, and the symptom shows up
hours later as bounces rather than immediately as an error page.

### 7.4 Verify, in this order

```bash
# 1. One A, and it is Vercel's.
dig +short kenyonexpress.co.il A          # expect exactly: 76.76.21.21
dig +short www.kenyonexpress.co.il A      # expect exactly: 76.76.21.21

# 2. No AAAA at all. Empty output is the pass.
dig +short kenyonexpress.co.il AAAA       # expect nothing
dig +short www.kenyonexpress.co.il AAAA   # expect nothing

# 3. Mail untouched.
dig +short kenyonexpress.co.il MX         # expect: 10 mailgw2.spd.co.il.
dig +short kenyonexpress.co.il TXT        # expect your SPF record, unchanged

# 4. The site is the new one.
curl -s -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/
curl -s https://kenyonexpress.co.il/ | grep -c wp-content     # expect 0
```

Any AAAA still answering in check 2 means a record was missed; go back to 7.3.

`wp-content` still appearing in check 4 means you are being served the old
site, cached or not yet propagated. Wait, and do not change anything else while
waiting. Vercel > Settings > Domains should flip both entries to a green check
within a few minutes of the record changing.

### 7.5 Rollback: putting Cloudflare back in front of WordPress

This restores the exact state recorded in 7.0. With the 2 minute TTL from 7.1
it is live in minutes.

For each of `kenyonexpress.co.il` and `www`, set the A records back to **two**
records per name:

| Type | Name | Content | Proxy status |
| --- | --- | --- | --- |
| A | `kenyonexpress.co.il` | `172.67.148.28` | **Proxied** (orange cloud) |
| A | `kenyonexpress.co.il` | `104.21.55.125` | **Proxied** (orange cloud) |
| A | `www` | `172.67.148.28` | **Proxied** (orange cloud) |
| A | `www` | `104.21.55.125` | **Proxied** (orange cloud) |

The AAAA records do not need to be recreated by hand. They were Cloudflare's
own proxy addresses, and Cloudflare re-advertises IPv6 for a Proxied record on
its own. Restoring the A records with the orange cloud is the whole rollback.

```bash
dig +short kenyonexpress.co.il A     # expect 104.21.55.125 and 172.67.148.28
curl -s https://kenyonexpress.co.il/ | grep -c wp-content   # expect non-zero
```

Leave the domain attached in Vercel while rolled back. An attached domain that
no record points at costs nothing and saves re-issuing the certificate on the
second attempt.

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
