# Environment Reference

Every environment variable this system reads: what it does, what breaks without
it, what breaks when it is *wrong*, and which ones are secret.

`.env.example` is the canonical list and is kept exhaustive by a test —
`src/lib/env-example-is-complete.test.ts` fails if a key in the boot schema is
missing from it. **This document is the operator's view of the same set**,
organised by consequence rather than by service, because the question in front
of you is usually "what will break" and not "where does this come from".

Read against `main` on **2026-09-01**. 140 distinct names have a read site in
`src/`, `apps/`, `scripts/`, `e2e/` or a root config file.

---

## 0. How validation works, and why it is at boot

`src/lib/env.ts` is parsed by `instrumentation.ts` `register()`, which Next
calls **before the server accepts a request**.

That placement is the whole design. `loadCardcomEnv()` throws
`Missing required env` at *request* time, which means a deploy with a missing
secret builds successfully, goes green, and fails on the first customer who
tries to pay. Validating at boot converts that into a deploy that never serves.

### The legend, as `.env.example` uses it

| Tag | Meaning |
|---|---|
| `[required]` | production refuses to boot, or the feature is broken |
| `[optional]` | degrades to a documented fallback, named on the same line |
| `[tooling]` | scripts, tests and CI only. **Never set in Vercel** |
| `[platform]` | injected by Vercel or the CI runner. **Do not set by hand** |

### The one guard that cannot be waived

```ts
// src/lib/env.ts:100
const LEAKY = /^NEXT_PUBLIC_.*(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY)/i
```

Any variable whose **name** matches this refuses the boot outright, before the
schema is even parsed. `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` are inlined into the
client bundle at **build** time, so a secret carrying that prefix is not a risk
of a leak — it is a leak that already happened, served to every visitor.

Two consequences worth stating separately:

1. **Changing a `NEXT_PUBLIC_*` value in Vercel requires a redeploy**, not a
   restart. The old value is compiled into the bundle.
2. Renaming a variable to add the prefix, to "make it available on the client",
   is the mistake this guard exists to catch.

---

## 1. The nine that hard-fail production

In production, `src/lib/env.ts:72-90` refuses to boot without these.

| Variable | Secret | Without it | Wrong value |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no | boot fails | points at another project: every read returns nothing or `Invalid API key` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no (public by construction) | boot fails | all client reads fail auth |
| `SUPABASE_SERVICE_ROLE_KEY` **or** `SUPABASE_SECRET_KEY` | **yes** | boot fails | admin reads fail; **finalize cannot complete an order** |
| `CARDCOM_TERMINAL_NUMBER` | no | boot fails | charges route to another merchant's terminal |
| `CARDCOM_API_NAME` | **yes** | boot fails | every API call rejected |
| `CARDCOM_API_PASSWORD` | **yes** | boot fails | every API call rejected |
| `CARDCOM_WEBHOOK_SECRET` | **yes** | boot fails | **every callback rejected → paid orders never complete** |
| `VOUCHER_QR_SECRET` | **yes** | boot fails | **every existing voucher QR stops verifying** |
| `CRON_SECRET` | **yes** | boot fails | every cron route answers 401 |

And one that fails the boot by being *set*:

| Variable | Rule |
|---|---|
| `CARDCOM_SANDBOX` | must **not** be `true` in production |

> **Why `CARDCOM_SANDBOX` gets its own check.** Sandbox left on in production is
> the quietest catastrophe available: the shop looks completely healthy, orders
> complete, vouchers issue, confirmations send — and **customers are charged
> nothing while the money never arrives anywhere**. Nothing errors. Nothing
> logs. It is caught here or it is caught by an accountant, weeks later.

### The waiver, and its one legitimate use

```bash
ALLOW_INCOMPLETE_ENV=true
```

Returns from every production check above, **before** they run.

This exists because **`next start` on a laptop is also `NODE_ENV=production`**,
and that is not a technicality: it is how the Playwright suite and every
Lighthouse number are measured, because both must run against the real build.
Without the waiver, `pnpm start` answers 500 on every route with
`An error occurred while loading instrumentation hook`.

**Vercel never sets it.** Setting it there would be an explicit act rather than
an omission, which is the distinction `NODE_ENV` alone cannot make. It logs
`env.checks_skipped` at boot every time it is used.

CI's `build` job sets it, and only because that job builds the app and throws
the result away — it never serves a checkout.

---

## 2. Secrets

**Treat as secret:** anything in this list. They belong in Vercel's encrypted
environment variables and in `.env.local`, never in the repository, never in a
`NEXT_PUBLIC_*` name, never in a log line.

```
SUPABASE_SERVICE_ROLE_KEY   SUPABASE_SECRET_KEY   SUPABASE_DB_URL   DATABASE_URL
CARDCOM_API_NAME            CARDCOM_API_PASSWORD  CARDCOM_WEBHOOK_SECRET
CARDCOM_WEBHOOK_SECRET_PREVIOUS
VOUCHER_QR_SECRET           VOUCHER_QR_SECRET_PREVIOUS
CRON_SECRET                 SEARCH_WEBHOOK_SECRET
RESEND_API_KEY              CONSENT_IP_SALT
UPSTASH_REDIS_REST_TOKEN    QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY  QSTASH_NEXT_SIGNING_KEY
MEILISEARCH_API_KEY
R2_ACCESS_KEY_ID            R2_SECRET_ACCESS_KEY
APPLE_WALLET_KEY_PEM        APPLE_WALLET_KEY_PASSPHRASE   APPLE_WALLET_CERT_PEM
GOOGLE_WALLET_SA_KEY_PEM
SENTRY_AUTH_TOKEN           GA4_API_SECRET   META_CAPI_TOKEN
VERCEL_AUTOMATION_BYPASS_SECRET   EXPO_ACCESS_TOKEN
WC_KEY                      WC_SECRET
DEV_ADMIN_PASSWORD          E2E_CUSTOMER_PASSWORD   E2E_SUPPLIER_PASSWORD
```

**Public by construction**, and deliberately stored as CI *variables* rather
than secrets so they stay readable in logs: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Both are already served to every visitor in the
client bundle. Masking them would only make a failure harder to read.

**`SUPABASE_SERVICE_ROLE_KEY` deserves its own sentence.** It bypasses RLS
entirely and bypasses the profile privilege trigger by design. It is the one
credential in this system with no second layer behind it. If it leaks, go
straight to `docs/INCIDENT-PLAYBOOKS.md` Playbook 6.

---

## 3. By service

### 3.1 Supabase

| Variable | Tag | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | required | Must be `ixvwfbuvfxxsjiywhbbb`. See the trap below. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | required | Public. Subject to RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` | required (one of) | Bypasses RLS. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` | optional | Newer key naming. |
| `SUPABASE_URL` | tooling | Scripts. |
| `SUPABASE_DB_URL`, `DATABASE_URL` | tooling | Direct Postgres for scripts and Drizzle. Never in Vercel. |

> **The trap that wastes the most time.** A `.env.local` service key from a
> *different* Supabase project produces `Invalid API key` in scripts **while MCP
> tooling keeps working perfectly**. That asymmetry reads as "the script is
> broken" rather than "the key is wrong". Check the project ref in the URL
> before debugging anything else.

**`src/lib/supabase/admin-key.ts` distinguishes three states**, which matters for
reading CI failures: a *missing* key throws; the public Supabase demo key
(`{"iss":"supabase-demo"}`) resolves to `demo-key` and does not throw; a real
key works. That is why CI can build pages that call `createAdminClient()`
without holding a real service key — admin reads fail as `Invalid API key`, get
logged, and the build completes.

### 3.2 Cardcom

| Variable | Tag | Notes |
|---|---|---|
| `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` | required | |
| `CARDCOM_WEBHOOK_SECRET` | required | Compared in constant time against the URL's `?s=`. |
| `CARDCOM_WEBHOOK_SECRET_PREVIOUS` | optional | The retiring value during a rotation. See §4. |
| `CARDCOM_SANDBOX` | must not be `true` in production | §1. |
| `CARDCOM_ALLOW_SANDBOX` | optional | Opt-in escape for non-production. |
| `CARDCOM_API_BASE_URL` | optional | **An empty string is not nullish.** `CARDCOM_API_BASE_URL=` defeats `??` and makes every path relative, so `fetch('/Interface/...')` has no host. The client trims and treats empty as unset for exactly this reason. |
| `CARDCOM_USE_MOCK` | tooling | E2E only. Returns a same-origin return URL. |
| `CARDCOM_ACCOUNTS` | optional | Multi-terminal routing. |
| `CARDCOM_COUPON_RECEIPT_TYPE`, `CARDCOM_CREDIT_NOTE_TYPE`, `CARDCOM_PLATFORM_LABEL` | optional | Document types on issued invoices. |

### 3.3 Vouchers and scheduling

| Variable | Tag | Without it |
|---|---|---|
| `VOUCHER_QR_SECRET` | required | Boot fails. **Rotating it without `_PREVIOUS` invalidates every voucher ever issued.** |
| `VOUCHER_QR_SECRET_PREVIOUS` | optional | The retiring key. |
| `VOUCHER_QR_KEY_ID` | optional | Stamped onto `vouchers.qr_key_id`, so a voucher records which key signed it. |
| `CRON_SECRET` | required | **No default.** `bearerMatches()` compares against `""` when unset, so every cron route answers 401. |
| `ABANDONED_CART_HOURS` | optional | Fallback 3. |

### 3.4 Email

| Variable | Tag | Without it |
|---|---|---|
| `RESEND_API_KEY` | required in practice | **No voucher ever reaches a buyer.** |
| `EMAIL_FROM` | optional | Falls back to `KenyonExpress <noreply@kenyonexpress.co.il>`. The domain must be verified in Resend first, or **every send is refused**. |
| `RESEND_FROM` | optional | Marketing sender; falls through to `EMAIL_FROM`. |
| `RESEND_AUDIENCE_ID` | optional | Newsletter list operations only. |
| `CONTACT_TO` | optional | Where the contact form lands. |

> `RESEND_API_KEY` is tagged optional by the schema and is required by reality.
> Email is how a customer receives what they paid for.

### 3.5 Privacy

| Variable | Tag | Wrong value |
|---|---|---|
| `CONSENT_IP_SALT` | optional, **should be required** | Falls back to the **empty string**, which makes the stored consent IP hash reversible by anyone who can guess an address. An unsalted hash of an IPv4 address is a lookup table, not a hash. Generate with `openssl rand -hex 16`. |

### 3.6 Observability

| Variable | Tag | Notes |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | optional | **Read at build time.** A build without it produces a bundle whose SDK is inert; setting it later changes nothing until a redeploy. |
| `SENTRY_DSN` | optional | Server side. |
| `SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | optional | Falls back to `NODE_ENV`. |
| `SENTRY_RELEASE`, `NEXT_PUBLIC_SENTRY_RELEASE` | platform | Must match what the runtime reports, or source maps attach to a release nothing references. |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | optional, CI | Without the token the plugin **skips the upload silently**, which is what keeps a fork's CI green. |
| `SENTRY_KEEP_SOURCEMAPS`, `SENTRY_DEBUG_ROUTES` | tooling | |
| `LOG_LEVEL` | optional | Fallback `info`. Read **once at module load** — a per-call lookup on a path every request touches buys nothing. |
| `ALERTS_ENABLED`, `NTFY_TOPIC`, `NTFY_BASE_URL`, `HEALTH_NTFY_TOPIC` | optional | Inert when unset; nothing is sent. |

### 3.7 Search

| Variable | Tag | Without it |
|---|---|---|
| `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`, `MEILISEARCH_INDEX` | optional | `/search` falls back to a Postgres `ILIKE`. **That works and is slower**, with no typo tolerance, no synonyms and no facets — and nothing in the UI says so. |
| `QSTASH_TOKEN` | optional | Index jobs run inline instead of being queued. |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | optional | Verify QStash callbacks. |
| `SEARCH_WEBHOOK_SECRET` | optional | Guards `/api/webhooks/products`. |

### 3.8 Rate limiting

| Variable | Tag | Notes |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | optional | |
| `UPSTASH_REDIS_REST_TOKEN` | optional, **secret** | |
| `UPSTASH_REDIS_REST_TIMEOUT_MS` | optional | Fallback 1000. |

**Both URL and token must be set for the Upstash path to engage.** Either one
alone is treated as absent, so a half-finished configuration degrades to the
Postgres `check_rate_limit` rather than failing every request.

The schema marks these optional deliberately, and the reason is written into
`env.ts`: no environment this repository can see sets them, and requiring them
would mean the branch refuses to boot everywhere it is not yet provisioned,
*"which is how a security improvement lands as an outage."*

### 3.9 Storage (Cloudflare R2)

`R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_PUBLIC_BASE_URL` — all five from the Cloudflare dashboard. Without them,
image upload is unavailable. `R2_PUBLIC_BASE_URL` wrong means images upload and
then 404.

### 3.10 Wallet passes

`APPLE_WALLET_CERT_PEM`, `APPLE_WALLET_KEY_PEM`, `APPLE_WALLET_KEY_PASSPHRASE`,
`APPLE_WALLET_WWDR_PEM`, `APPLE_WALLET_TEAM_ID`, `APPLE_WALLET_PASS_TYPE_ID`,
`APPLE_WALLET_ORG_NAME`, `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SA_EMAIL`,
`GOOGLE_WALLET_SA_KEY_PEM`, `GOOGLE_WALLET_CLASS_SUFFIX`.

**The wallet buttons hide themselves when the configuration is incomplete**
(`src/lib/wallet/config.ts`), so a missing key is a missing feature, not an
error. Logs: `wallet.pkpass_build_failed`, `wallet.google_token_failed`.

### 3.11 Analytics and marketing

`NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `GA4_API_SECRET`,
`NEXT_PUBLIC_META_PIXEL_ID`, `META_CAPI_TOKEN`. **All four are inert when
unset; nothing is sent.** Logs: `analytics.meta_purchase_failed`,
`analytics.ingest_failed`.

### 3.12 App identity and features

| Variable | Tag | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL` | required in practice | Absolute URLs in emails, sitemap, OG images and the Cardcom return URL. Wrong here means a customer is redirected to the wrong host after paying. |
| `CHECKOUT_ENABLED` | optional | A kill switch for checkout. |
| `PUSH_ENABLED` | optional | |
| `PHONE_AUTH_ENABLED`, `NEXT_PUBLIC_PHONE_AUTH_ENABLED` | optional | |
| `NEXT_PUBLIC_WHATSAPP_PHONE` | optional | |
| `INVOICE_VAT_PERCENT` | optional | **Do not use to change the tax rate.** `VAT_RATE_BP = 1800` in `src/lib/money.ts:65` is the single definition. Two sources for one tax is how this project already shipped a 17/18 split. |

### 3.13 Mobile (Expo). Never set in Vercel.

`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_PHONE_AUTH_ENABLED`, `EXPO_ACCESS_TOKEN`.

Set in the Expo project. `EXPO_PUBLIC_*` is inlined into the app binary.

### 3.14 Tooling. Never set in Vercel.

**E2E:** `E2E_BASE_URL`, `E2E_WEB_COMMAND`, `E2E_PORT`, `E2E_WORKERS`,
`E2E_PAID_FLOW`, `E2E_CUSTOMER_EMAIL`, `E2E_CUSTOMER_PASSWORD`,
`E2E_SUPPLIER_EMAIL`, `E2E_SUPPLIER_PASSWORD`, `PLAYWRIGHT_BROWSERS_PATH`.

**Pixel comparison** (`scripts/compare.mjs`): `LOCAL_BASE`, `LIVE_BASE`,
`COMPARE_*`, `LIVE_PRODUCT_PATH`, `LOCAL_PRODUCT_PATH`, `LIVE_CATEGORY_PATH`,
`LOCAL_CATEGORY_PATH`, `CLS_RUNS`, `GEOMETRY_CUTOFF`, `MINE_URL`, `SLUGS`,
`TRAILING_ROUTES`.

**WordPress import:** `WC_BASE`, `WC_KEY`, `WC_SECRET`,
`WP_IMPORT_ALLOW_WRITES`.

**Local admin:** `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`.

**CI:** `CI`, `CI_DIFF_RANGE`, `VERCEL_AUTOMATION_BYPASS_SECRET`.

### 3.15 Platform. Do not set by hand.

`NODE_ENV`, `NEXT_RUNTIME`, `VERCEL_GIT_COMMIT_SHA`,
`NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`.

> **`NODE_ENV` is not a reliable signal for "this is the real deployment".**
> `next start` on a laptop is also `NODE_ENV=production`, which is why
> `ALLOW_INCOMPLETE_ENV` exists at all.

---

## 4. Rotation

Two secrets have a `_PREVIOUS` companion, and both exist because rotating them
in one step causes a visible outage.

### `CARDCOM_WEBHOOK_SECRET`

Set `CARDCOM_WEBHOOK_SECRET_PREVIOUS` to the old value **before** changing the
current one. Both are compared, in constant time, **with no short circuit** —
returning on the first match would leak which secret was presented through
response time, defeating the constant-time comparison it sits inside.

Rotating without the previous value rejects every callback in flight, and a
rejected callback is a customer charged with no order.

### `VOUCHER_QR_SECRET`

Set `VOUCHER_QR_SECRET_PREVIOUS` first. **Rotating without it invalidates every
voucher ever issued** — every QR code in every customer's phone stops verifying
at the counter, at once. `VOUCHER_QR_KEY_ID` is stamped onto each voucher row so
you can tell which key signed which.

### Everything else

`CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` and the rest rotate in one step, but
**the secret must change in the scheduler and in Vercel together**. A `CRON_SECRET`
changed on one side only means every job answers 401 and, because nothing is
scheduled today, nobody notices.

---

## 5. What is not set in production today

From `docs/RUNBOOK.md` §9 and `docs/OPERATIONS-CALENDAR.md`, confirmed by the
behaviour each one produces:

| Unset | Consequence |
|---|---|
| `MEILISEARCH_HOST` / `_API_KEY` | search runs on Postgres `ILIKE` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | rate limiting runs on Postgres |
| `CRON_SECRET` **in a scheduler** | nothing scheduled runs at all |
| `CI_SUPABASE_*` (repository secrets) | both E2E jobs skip |

The first two are choices that can stay. **The third is the largest operational
gap in the system** — `docs/FAILURE-MODES.md` §2.1.

### Checking, rather than assuming

```bash
curl -s https://<host>/api/cron/health \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

Seven dependencies are probed: `database`, `rate_limiter`, `search`, `cardcom`,
`email`, `storage`, `scheduler`.

**Read the status vocabulary carefully.** It has three values, not two:

| Status | Meaning |
|---|---|
| `ok` | configured and answering |
| `down` | configured and **not** answering |
| `not_configured` | never set up |

The distinction is the entire point of the check. A probe that reported green
for a service nobody configured would convert *"we never set this up"* into
*"it works"*, and a probe that paged for one would fire every five minutes on a
deployment that is behaving exactly as intended.

---

## 6. Adding a variable

1. Add the read site.
2. Add it to `src/lib/env.ts` **if it belongs to the boot contract** — that is,
   if the app should refuse to start without it.
3. Add it to `.env.example`, with the read site named on the line above.
   `src/lib/env-example-is-complete.test.ts` fails otherwise.
4. Decide, and write down, what happens when it is **missing** and what happens
   when it is **wrong**. Those are different questions and the second is the one
   that gets skipped.
5. If it is secret, confirm the name does not start with `NEXT_PUBLIC_` or
   `EXPO_PUBLIC_`. The boot guard will catch it, but at that point the bundle
   has already been built at least once.

---

## Related

| You want | Read |
|---|---|
| The annotated source list | `.env.example` |
| What breaks, ranked | `docs/FAILURE-MODES.md` |
| Getting it running | `docs/ONBOARDING.md` §3 |
| Deploying | `docs/DEPLOYMENT.md`, `docs/RELEASE-PROCESS.md` |
| Who provides each service | `docs/THIRD-PARTY-DEPENDENCIES.md` |
| A leaked key | `docs/INCIDENT-PLAYBOOKS.md` Playbook 6 |
