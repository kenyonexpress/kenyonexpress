# Third-Party Dependencies

Every external service this system touches: what it does, what breaks without
it, who to contact, and what it costs.

Plans and account state were read from the provider APIs on **2026-09-01**, not
copied from a previous document. Where a figure is a published list price rather
than a bill this project has received, it says so.

---

## 0. The two findings that outrank everything else on this page

### 0.1 The Vercel project is connected to the wrong repository

| | |
|---|---|
| This repository | `kenyonexpress/kenyonexpress`, public, last push **2026-09-01** |
| What the Vercel project watches | `kenyonexpress/kenyonexpress-web`, **private**, last push **2026-05-29** |

There is exactly one Vercel team (`kenyonexpress' projects`) and exactly one
project (`kenyonexpress-web`, `prj_oqr4NKtSaB2h3szrxnT0DknAv9Xk`). It is linked
to a **different GitHub repository** — an older one that has not been touched in
three months.

**Merging to `main` in this repository deploys nothing.** No preview is built
for a pull request here either, which also means the `e2e-preview` CI job would
wait twelve minutes for a deployment that never appears, if it were ever
enabled.

### 0.2 No deployment has ever succeeded

All **11** deployments on that project are in state `ERROR`, including the only
one ever marked `target: production` (2026-05-14). **There is no production
site.** Not a stale one — none.

The most recent failure (2026-05-29) diagnoses itself completely:

```
Failed to type check.
./kenyonexpress/next.config.ts:2:34
Type error: Cannot find module 'next-intl/plugin'
Error: Command "npm run build" exited with 1
```

Three separate faults in four lines, and each is a rule this project already
has written down:

1. **`./kenyonexpress/next.config.ts`** — the old repository has a **nested
   `kenyonexpress/` directory**. That is precisely the duplicate-copy layout
   `CLAUDE.md` rule 2 forbids, and Vercel's Root Directory points above it.
2. **`npm run build`** — `npm install` **cannot work in this repository**
   (`AGENTS.md`); the package manager is pnpm. The current `vercel.json` says
   `pnpm install --no-frozen-lockfile`, so the project settings are overriding
   it, or predate it.
3. `next-intl` is therefore not installed, because the install never ran
   correctly.

**Consequence for every other document.** Anything describing production
behaviour, a live domain, or a deploy pipeline is describing an intention.
`docs/RELEASE-PROCESS.md` §6 and `docs/DEPLOYMENT.md` carry the same correction.

Fixing it is a settings change in the Vercel dashboard — relink the project to
`kenyonexpress/kenyonexpress`, clear the Root Directory, let `vercel.json`
supply the commands — and it is not a change this branch can make.

---

## 1. Tier 1 — the system does not function without these

### 1.1 Supabase — database, auth, storage

| | |
|---|---|
| Project | `ixvwfbuvfxxsjiywhbbb`, `eu-north-1`, Postgres 17.6.1 |
| Organisation | `kenyonexpress` (`izakjexsygwjsueamxuq`) |
| **Plan** | **Pro** *(read from the API)* |
| List price | $25 / month / organisation, plus usage |
| Contact | supabase.com/dashboard/support |
| Escalation | Pro includes email support. No phone, no SLA at this tier. |

**Without it: nothing works.** It is the database, the auth provider and the
object store. There is no fallback and no cache that survives it.

**What it holds:** 61 tables, 133 RLS policies, 72 functions, 12 views,
99 applied migrations.

**Single points of failure worth naming.**

- **There is no staging project and no local database.** A from-zero reset is
  not runnable here — Docker wedges, and the file chain and production are
  different lineages. Everything runs against this one project, including
  preview deployments.
- **No point-in-time restore is configured.** Pro makes PITR available; it is
  not switched on. **This is the cheapest large risk reduction available in the
  whole system.**

### 1.2 Cardcom — payment gateway

| | |
|---|---|
| API in use | **legacy `/Interface/*.aspx` form API**, by a decision recorded in the client on 2026-07-23 |
| *Not* in use | the v11 JSON REST API that `docs/CARDCOM-ARCHITECTURE.md` describes |
| Endpoints | `LowProfile.aspx`, `ChargeToken.aspx`, `RefundDeal.aspx`, `ListTransactions.aspx`, `BillGoldPost.aspx` |
| Contact | support.cardcom.solutions |
| Developer docs | cardcomapi.zendesk.com |
| Cost | per-transaction merchant agreement. Not a SaaS subscription. |

**Without it: no money can be taken.** No fallback provider exists and none is
designed for.

**The property that shapes the integration: Cardcom does not sign its
callbacks.** There is no HMAC header on the legacy API. Authenticity rests on an
unguessable secret in the callback URL plus a mandatory server-to-server
`GetLpResult` re-fetch, and **the re-fetched result is the only trusted source
of amount, status and token**. The POST body is a notification, never data.

**Escalation:** a merchant support line exists through the merchant agreement,
not through a developer channel. Playbook: `docs/INCIDENT-PLAYBOOKS.md` 1.

> **`CARDCOM_SANDBOX=true` in production is the quietest catastrophe available.**
> Orders complete, vouchers issue, confirmations send, customers are charged
> nothing, and the money never arrives anywhere. `src/lib/env.ts:88` fails the
> boot rather than allowing it.

### 1.3 Vercel — hosting

| | |
|---|---|
| Team | `kenyonexpress' projects` (`team_TUMTPVDP8218QHwedSjmgJWl`) |
| **Plan** | **Hobby** *(read from the API)* |
| Cost | $0 |
| Region | `fra1` (Frankfurt), next to Supabase in `eu-north-1` |
| Contact | vercel.com/help |
| Escalation | Hobby is **community support only**. No ticket queue, no SLA. |

**Without it: no site.** See §0 for the state it is actually in.

**Two Hobby-plan facts that are load-bearing.**

1. **Cron is limited to two jobs at daily granularity.** This project needs ten,
   four of them at five- or ten-minute intervals. Declaring all ten in
   `vercel.json` **does not fail the build and does not warn** — the platform
   runs what the plan covers and silently ignores the rest, which is how a
   payment reconciler comes to be believed to be running when it is not. They
   were removed. `docs/FAILURE-MODES.md` §2.1.
2. **Hobby prohibits commercial use.** A site selling coupons is commercial.
   **This is a launch blocker, not a preference.** Pro is $20 / user / month at
   list price and also lifts the cron limit, which resolves both problems with
   one change.

### 1.4 Resend — transactional email

| | |
|---|---|
| Env | `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_FROM`, `RESEND_AUDIENCE_ID` |
| Contact | resend.com/support |
| Cost | free tier 3,000/month; Pro $20/month at list price |

**Without it: no voucher ever reaches a buyer.** That is the whole failure
description. A customer pays, the order completes, and nothing arrives.

**Two traps.**

- **The sending domain must be verified in Resend first**, or every send is
  refused with a valid key and a healthy-looking configuration.
- The only thing that drains `notification_outbox` is the `notifications` cron
  route, and **nothing is calling it**. So today the email gap is upstream of
  Resend entirely: messages queue and sit.

Logs: `email.send_failed`, `email.voucher_send_failed`, `email.refused`,
`email.disabled`.

### 1.5 GitHub — source, CI, branch protection

| | |
|---|---|
| Repository | `kenyonexpress/kenyonexpress`, **public** |
| Cost | $0 for a public repository |
| Contact | support.github.com |

**Because it is public, no real credential may live in it, in a workflow, or in
a CI secret a fork could reach.** The build job's Supabase values are stored as
repository **variables**, not secrets, precisely because they are public by
construction and masking them would only make failures harder to read.

---

## 2. Tier 2 — degrades, does not stop

Each of these is unset today, and each has a documented fallback. **A fallback
that nobody knows about is a bug report waiting to happen**, which is why they
are listed with their symptom rather than only their name.

| Service | Env | Unset behaviour | Cost |
|---|---|---|---|
| **Meilisearch** | `MEILISEARCH_HOST`, `_API_KEY`, `_INDEX` | search falls back to a Postgres `ILIKE`. **Works, slower, no typo tolerance, no synonyms, no facets — and nothing in the UI says so.** | Cloud from ~$30/mo; self-host free |
| **Upstash Redis** | `UPSTASH_REDIS_REST_URL`, `_TOKEN` | rate limiting falls back to the Postgres `check_rate_limit`. **Both must be set**; either alone is treated as absent. | free tier; pay-per-request |
| **Upstash QStash** | `QSTASH_TOKEN`, signing keys | index jobs run inline instead of queued | free tier |
| **Sentry** | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | no error reporting at all | free tier 5k events/mo; Team $26/mo |
| **Cloudflare R2** | five `R2_*` | image upload unavailable | ~$0.015/GB-mo, **no egress fees** |
| **Apple Wallet** | seven `APPLE_WALLET_*` | the pass button hides itself | Apple Developer Program $99/yr |
| **Google Wallet** | four `GOOGLE_WALLET_*` | the pass button hides itself | $0 |
| **GA4** | `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `GA4_API_SECRET` | inert; nothing sent | $0 |
| **Meta** | `NEXT_PUBLIC_META_PIXEL_ID`, `META_CAPI_TOKEN` | inert; nothing sent | $0 |
| **ntfy.sh** | `NTFY_TOPIC`, `HEALTH_NTFY_TOPIC`, `ALERTS_ENABLED` | no push alerts | $0 |
| **Expo** | `EXPO_ACCESS_TOKEN`, `EXPO_PUBLIC_*` | mobile app cannot build | free tier; EAS from $19/mo |

### Notes that matter more than the table

**Sentry is the only error reporting there is.** Unset, a production exception
leaves a line in a Vercel log that nobody reads. `SENTRY_AUTH_TOKEN` missing
makes the plugin **skip the source-map upload silently**, which is deliberate —
it keeps a fork's CI green — and means stack traces read against minified code
without saying so.

**`NEXT_PUBLIC_SENTRY_DSN` is read at build time.** Setting it later changes
nothing until a redeploy.

**GA4 and the Meta Pixel sit behind cookie consent**, and consent is versioned:
consent given against superseded wording does not count. Both being unconfigured
means nothing is sent either way today.

---

## 3. Tier 3 — build and development only

| | Notes |
|---|---|
| **npm registry** | via pnpm 11.1.2. `npm install` cannot work in this repository — pnpm's symlink store crashes npm's arborist inside `buildIdealTree`, ahead of every lifecycle hook, so the repo cannot even replace the error message. `AGENTS.md`. |
| **Playwright browser CDN** | `~/Library/Caches/ms-playwright/` locally; `playwright install` in CI |
| **Google Fonts** | Rubik, self-hosted through `next/font` at build time. Not a runtime dependency. |
| **WooCommerce / WordPress** | `WC_BASE`, `WC_KEY`, `WC_SECRET`. One-time catalogue import from the old site. `WP_IMPORT_ALLOW_WRITES` gates anything destructive. |

---

## 4. Escalation

There is **one maintainer**. Every path below ends at the same person, so the
value of the table is telling you which supplier to approach first, not who to
wake up.

| Symptom | First | Then |
|---|---|---|
| Site down | Vercel status, then §0 — check the deployment even exists | Vercel community |
| Everything timing out | Supabase status | Supabase support (Pro: email) |
| Payments failing | Cardcom status | Cardcom merchant support |
| Vouchers not arriving | **check the `notifications` cron ran at all** | Resend dashboard |
| Search wrong | expected: `ILIKE` fallback | — |
| No errors visible | Sentry is probably unconfigured | — |
| Key leaked | `docs/INCIDENT-PLAYBOOKS.md` 6, immediately | rotate at the provider |

### Status pages

```
status.vercel.com      status.supabase.com     status.resend.com
status.sentry.io       cloudflarestatus.com    status.upstash.com
```

Cardcom publishes no status page. A Cardcom outage is detected by
`payments.verify_failed` and `reconcile.terminal_unreachable` in your own logs.

---

## 5. Cost summary

**Today**, as configured:

| Service | Plan | Monthly |
|---|---|---|
| Supabase | **Pro** | ~$25 |
| Vercel | **Hobby** | $0 |
| GitHub | public repository | $0 |
| Cardcom | merchant agreement | per transaction |
| Everything in Tier 2 | unconfigured | $0 |
| **Total recurring** | | **~$25** |

**What launch requires**, at list prices, before any usage-based charge:

| Change | Why | Monthly |
|---|---|---|
| Vercel Hobby → Pro | **commercial use is prohibited on Hobby**, and cron is capped at two daily jobs | +$20 |
| Sentry, at least free tier | otherwise a production exception is invisible | $0–26 |
| Resend, once volume passes 3,000/mo | | $0–20 |
| Supabase PITR | the largest risk reduction per shekel available here | usage |
| **Realistic launch floor** | | **~$45–70** |

Meilisearch and Upstash remain optional. Deciding to run without them is
legitimate; **deciding it by accident is not**, which is what §2 exists to
prevent.

---

## 6. What this system does *not* depend on

Worth stating, because each has been proposed somewhere in the documentation.

| Not used | Note |
|---|---|
| Turborepo | evaluated and rejected. No `turbo.json`, and `pnpm-workspace.yaml` has no `packages:` key, so `apps/mobile` is not even a workspace member. One Next app is nothing to orchestrate. |
| A second payment provider | Cardcom only. |
| A managed queue other than QStash | and QStash is optional. |
| A CDN in front of Vercel | |
| An email provider other than Resend | |
| A separate analytics warehouse | |
| `apps/api`, `apps/web`, `packages/*` | none exist. `apps/` holds `mobile` and nothing else. |

---

## Related

| You want | Read |
|---|---|
| Variables and rotation | `docs/ENV-REFERENCE.md` |
| What breaks, ranked | `docs/FAILURE-MODES.md` |
| Step-by-step response | `docs/INCIDENT-PLAYBOOKS.md` |
| Deploying | `docs/DEPLOYMENT.md`, `docs/RELEASE-PROCESS.md` |
| Cardcom as built | `docs/PAYMENT-FLOW.md` §7 |
