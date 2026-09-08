# LAUNCH-DAY-PLAN

T0 is **DNS cutover** of `kenyonexpress.co.il` from WordPress (Cloudflare
proxied) to the Next.js production already serving at
`https://kenyonexpress.vercel.app`. Steps 1 to 6 of
`docs/LAUNCH-RUNBOOK.md` were already done as of 2026-09-01. This file is
the week around T0.

**DNS is owner-approved. An agent does not run it.** Command-level trap
(serving zone vs staged zone): `docs/DNS-CUTOVER-PLAN.md`. Snapshot before
any TTL change: `docs/DNS-SNAPSHOT-PRE-CUTOVER.md`.

Money: integer agorot. Kill switch: `CHECKOUT_ENABLED=false` plus redeploy.
`CARDCOM_SANDBOX` must not be `true` in Production. `ESCROW_FLOW_ENABLED`
must not be `true`. Never `db push`. Never `ALLOW_INCOMPLETE_ENV=true` on
Vercel.

---

## 1. Timeline T-7 to T+7

| Day | What happens | Owner vs agent |
|---|---|---|
| T-7 | Pre-launch list green. Images on R2, not `wp-content`. Domain **attached** in Vercel (not pointed). Snapshot live DNS to Desktop | owner |
| T-6 | Resend domain / DKIM on the **serving** zone. Do not activate a staged zone with a broken SPF | owner |
| T-5 | External scheduler for all ten `/api/cron/*` jobs, `CRON_SECRET` matching Vercel. Unauthenticated GET must be 401 | owner |
| T-4 | Production Cardcom terminal issued (03-9436100). Do not swap keys on T0 | owner |
| T-3 | Cardcom production keys in Vercel Production, `CARDCOM_USE_MOCK` removed, redeploy. Smoke pay on **vercel.app** | owner, agent may curl health |
| T-2 | One real coupon purchase + refund on vercel.app. Mail, voucher, scan once, scan twice refused | owner card |
| T-1 | Lower TTL on apex + www to 300 (or 120). Wait the **old** TTL. Confirm Vercel domains show configured-but-not-pointed. Freeze catalogue edits on WP | owner |
| **T0** | Point DNS (section 3). Smoke on apex (section 5). Do not also swap Cardcom that day | owner only |
| T+0 evening | Search Console property + sitemap. Sentry event from production | owner |
| T+1 to T+2 | Watch list (section 6), 48 hours | owner on-call |
| T+3 | If stable, raise TTL back. Cron still hitting the apex host | owner |
| T+7 | Incident review: refunds, missed voucher mail, image 404s, reconcile gaps | owner |

Do not cut DNS and swap the Cardcom terminal on the same calendar day.

---

## 2. Pre-launch verification list

Stop if any box is empty. Do not lower TTL yet.

- [ ] Vercel project that will receive the domain is the one that already
      serves vercel.app (not a sibling project).
- [ ] `kenyonexpress.co.il` and `www` attached in Vercel. Pointing DNS first
      yields a Vercel 404.
- [ ] Product images 200 from R2 (or another URL that survives WP). Live WP
      still hosts thumbs; cutover without this is a storefront of broken
      images.
- [ ] Production Cardcom credentials in Vercel Production.
      `CARDCOM_SANDBOX` unset/false. `CARDCOM_USE_MOCK` absent.
- [ ] `CHECKOUT_ENABLED=true` only after a real payment on vercel.app.
- [ ] Resend verified. Without it, no voucher email ever leaves.
- [ ] Scheduler exists for **all ten** cron routes. Hobby Vercel cron will
      not run ten. Missing `CRON_SECRET` fail-closes (401), it does not open
      the routes.
- [ ] `GET /api/health` 200 with `database: ok`. `GET /api/cron/health`
      401 without secret, 200 with Bearer.
- [ ] `seo_redirects` / redirect coverage for WP paths worth keeping.
- [ ] Boot logs: instrumentation env OK, not `env.checks_skipped`.
- [ ] No `service_role` in the client bundle.

---

## 3. DNS cutover: exact steps and timing

Registrar: Box. Public NS today: Cloudflare serving zone (`derek` / `elma`).
A second Cloudflare zone (`ignat` / `tess`) may exist and **does not serve
the internet**. Editing the staged zone is a no-op. Rollback depends on a
JSON snapshot of the **serving** zone taken at T-7.

Measured 2026-09-01 (starting state, not a promise it is still this):

- Apex and www: two Cloudflare anycast A records, Proxied, plus AAAA.
- Mail MX / SPF stay untouched unless Resend is already verified on the
  serving zone.

### Timing

1. T-1: TTL 300 (or 120) on apex + www. Wait one full previous TTL.
2. T0, low-traffic Israel hour if possible: change records.
3. `Auto` on a Proxied record means Cloudflare picks TTL. For cutover use
   an explicit 120 or 300 so rollback is minutes, not hours.

### T0 records (Vercel, DNS only, **not** Proxied)

| Name | Type | Value |
|---|---|---|
| `kenyonexpress.co.il` | A | `76.76.21.21` |
| `www.kenyonexpress.co.il` | CNAME | `cname.vercel-dns.com` |

Remove leftover AAAA for those names (empty `dig AAAA` is the pass). Leave
MX, `mail`, `pop`, `smtp`, `ftp` alone.

### Verify, in this order (Terminal)

```
dig +short kenyonexpress.co.il A
dig +short www.kenyonexpress.co.il A
dig +short kenyonexpress.co.il AAAA
dig +short kenyonexpress.co.il MX
curl -s -o /dev/null -w '%{http_code}\n' https://kenyonexpress.co.il/
curl -s https://kenyonexpress.co.il/ | grep -c wp-content
```

Expect: exactly Vercel's A, no AAAA, MX unchanged, HTTP 200, **zero**
`wp-content`. `wp-content` still there means old site or cache. Wait. Do
not flip nameservers to the staged zone as a "fix".

Vercel > Settings > Domains should go green within minutes. TLS issues
after the records point, not before.

### DNS rollback

Restore the snapshot A records (WordPress / previous anycast) on the
**serving** nameservers. Same TTL wait. Kill switch if money already hit
the new app with bad config.

---

## 4. Cardcom production key swap

Do this on **T-4 to T-3**, never on T0.

Order (from `docs/DEPLOYMENT.md`, measured 2026-09-02):

1. `CARDCOM_TERMINAL_NUMBER` from the Cardcom panel (מספר מסוף).
2. `CARDCOM_API_NAME`.
3. `CARDCOM_API_PASSWORD`.
4. Keep `CARDCOM_WEBHOOK_SECRET` aligned with the IndicatorUrl `?s=` on
   the terminal. Cardcom does not sign callbacks.
5. Remove `CARDCOM_USE_MOCK` from Production **only after** 1 to 3.
   Removing it first turns checkout from silently fake into hard-fail
   (`loadCardcomEnv` requires the terminal number on the non-mock path).
6. Redeploy. Env changes need a new deployment.
7. One real low-value order on vercel.app. Find it in Cardcom. Refund it
   from admin. Find the refund there too.

Webhook URL on the terminal: production
`/api/payments/cardcom/webhook?s={secret}` on the host that will receive
callbacks after T0 (apex). Dual secret: put the old value in
`CARDCOM_WEBHOOK_SECRET_PREVIOUS` during overlap, redeploy, then drop
`_PREVIOUS` after 24 hours.

`CARDCOM_SANDBOX=true` refuses boot in production. Preview must not hold
production Cardcom.

---

## 5. Smoke test after go-live

Prefer the real payment on vercel.app **before** DNS. After DNS, repeat on
the apex. `DEPLOY` is the host under test.

```
DEPLOY=https://kenyonexpress.co.il

curl -s -o /dev/null -w 'home    %{http_code}\n' "$DEPLOY/"
curl -s -o /dev/null -w 'health  %{http_code}\n' "$DEPLOY/api/health"
curl -s -o /dev/null -w 'ready   %{http_code}\n' "$DEPLOY/api/ready"
curl -s -o /dev/null -w 'cron    %{http_code}\n' "$DEPLOY/api/cron/health"
curl -s -o /dev/null -w 'sitemap %{http_code}\n' "$DEPLOY/sitemap.xml"
curl -s -o /dev/null -w 'robots  %{http_code}\n' "$DEPLOY/robots.txt"
curl -s "$DEPLOY/api/health" | python3 -m json.tool
```

Expect home/health/ready/sitemap/robots 200, cron **401** without secret
(that 401 is a pass). Read the health JSON; a 200 with a failing inner
check is why the endpoint exists.

Browser (Chrome):

- [ ] `/` 200, RTL, brand yellow, deals or honest empty copy
- [ ] Category + coupon PDP: two prices, no `platform_percent` in HTML
- [ ] Images 200 from R2, not WP
- [ ] Guest add to cart, `/cart`, pay, Cardcom production charge of a
      cheap coupon
- [ ] Return: voucher issued, email, `/coupon/{id}` QR
- [ ] Scan once success, second scan already redeemed
- [ ] Fail path: cart survives
- [ ] 404 Hebrew. 500 not English LTR
- [ ] Sitemap does not list `/account` or `/checkout`

Pixel gate after cutover is optional: `compare.mjs` home under 11% at
380 / 768 / 1440.

---

## 6. Monitoring watch list, first 48 hours

Watch. Do not wait and see.

| Signal | Where | Page if |
|---|---|---|
| Error rate | Sentry EU | spike vs the quiet vercel.app baseline |
| Logs | Vercel / structured JSON | `finalize` errors, `42703`, RLS `42501` |
| Payments | Cardcom UI vs `payments` / `payment_events` | charge without `paid` |
| Webhooks | `payment_webhook_events` | duplicates OK (idempotent 200); gaps not OK |
| Cron | scheduler + 401/200 with secret | missed `notifications` or `reconcile` |
| Uptime | `/api/health`, `/api/ready` | non-200 |
| Mail | Resend bounces | voucher never arrives |
| Images | storefront thumbs | WP `wp-content` 404 |
| Support | "charged twice" / "no QR" | webhook or issue path |
| Money alarms | `v_money_alarms` if present | `platform_percent` NULL sales |

Hour 0 to 1: `notifications` cron is the only path a customer receives a
voucher by mail. If it is idle, tell them `/account/coupons`.

No PAN in logs.

---

## 7. Rollback triggers and thresholds

Kill switch first, always: `CHECKOUT_ENABLED=false`, redeploy. Shop stays
browsable. It does **not** stop cron, does not stop in-flight webhooks, does
not un-pay orders. For those, disable the scheduler and let webhooks
finish (idempotent).

| Trigger | Threshold | Action |
|---|---|---|
| Charges with no `paid` order | any | kill switch, then stranded-payments / reconcile |
| Health 503 for 5 minutes | database down | Instant Rollback if the last deploy caused it; else wait on Supabase |
| Image 404 rate | storefront majority WP URLs | DNS rollback if R2 was skipped; otherwise fix URLs, do not down-migrate |
| Error rate | Sentry spike vs hour before T0 | Instant Rollback of the deployment |
| Mock or sandbox in Production | any | kill switch immediately |
| Cron never 200 with secret | notifications idle through first hour | tell customers the account page; fix scheduler; do not DNS-rollback for mail alone |
| Cardcom dashboard disagrees with ledger | amount mismatch | stop new checkout; do not invent a second split |

Full rollback order (`docs/LAUNCH-RUNBOOK.md`):

1. `CHECKOUT_ENABLED=false`, redeploy.
2. DNS back to the snapshot.
3. Disable the ten jobs.
4. Vercel previous deployment, Promote to Production, if the build was the
   problem.

Schema is **not** in this list. Do not reverse a migration to fix a
front-end problem.

---

## 8. First customer support readiness

On-call knows: Instant Rollback, `CHECKOUT_ENABLED`, DNS snapshot path,
Hebrew scripts below.

| Symptom | First answer | Then |
|---|---|---|
| Paid, no email | open `/account/coupons`; cron may be off | check `notification_outbox` |
| Paid, no QR | order `paid`? voucher row? | finalize / issue incident |
| Scan refused | `wrong_supplier` vs expired vs already used | admin voucher lookup |
| Charged twice | Cardcom vs `payment_events` replay | do not refund from the terminal until the ledger is read |
| Broken image | R2 vs leftover WP URL | not "refresh the page" |

Do not promise Escrow, a supplier payout, or "100% no questions, three
times" (that policy is not in the code). Statutory 14-day distance sale
plus the voucher-still-issued rule: `REFUND-POLICY-IMPLEMENTATION.md`.

Support must not see PAN. Last4 only.

---

## 9. Communication plan

| Audience | When | Message |
|---|---|---|
| Owner | T-1 | TTL lowered, snapshot taken, vercel.app smoke paid |
| Owner | T0 start | about to point A/CNAME, kill switch location |
| Owner | T0 + 15 min | dig/curl results, health JSON |
| Suppliers | T-2 | till URL `/scan`, app PIN, "we do not send you coupon money" |
| Customers | only if WP is about to vanish mid-session | short Hebrew: the shop moves, coupons already bought stay in the account |
| Search Console | T0 evening | add property, submit sitemap |
| Cardcom | T-4 | production terminal + IndicatorUrl |
| Public social | optional T+1 | do not announce a payment that still uses mock |

Agents: one code agent on the repo on T0. No production push, no migration
apply, no DNS edit without the owner.

Internal ntfy (`kenyon-ofir-limit`) is for agent finish lines, not a
customer channel.
