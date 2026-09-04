# Environment variables

Every variable this app reads, whether it is required, and what breaks without
it. Verified against `src/lib/env.ts` (the boot schema) and `src/lib/env-probe.ts`
(the boot liveness check) on 2026-09-04.

## How validation works, in two layers

**Layer 1 — `src/lib/env.ts`, offline, THROWS.** Runs from
`instrumentation.ts register()` before the server accepts a request. Checks
presence and a handful of rules it can decide without a network (`CARDCOM_SANDBOX`
must not be `true` in production; nothing matching
`NEXT_PUBLIC_*(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY)` may exist,
because `NEXT_PUBLIC_` is inlined into the client bundle). A failure here is a
refusal to boot.

**Layer 2 — `src/lib/env-probe.ts`, one request per key, LOGS.** Also from
`register()`, not awaited. Asks `/auth/v1/settings` with each Supabase key and
reports in Hebrew if the project rejects it.

**Why layer 2 logs instead of throwing:** refusing to boot on a network call
turns a transient DNS blip into an outage, which is a worse failure than the one
being prevented.

**Why layer 2 exists at all:** `SUPABASE_SECRET_KEY` was replaced with a real
new-format `sb_secret_...` key that the project still rejects. It is present,
well-formed, not a demo value, and 401 on every endpoint. Layer 1 cannot see
that, and `admin-key.ts` says so in its own comment: the new-format keys are
opaque, there is nothing to inspect.

### The endpoint was chosen by measurement

`/rest/v1/?select=1` returns 401 for a perfectly good anon key. The first
version of the probe used it and reported the working key as broken.

| endpoint | anon | real-but-wrong secret | bogus |
|---|---|---|---|
| `/rest/v1/?select=1` | 401 | 401 | 401 |
| `/rest/v1/` | 401 | 401 | 401 |
| `/rest/v1/products?select=id&limit=1` | 200 | 401 | 401 |
| `/auth/v1/settings` | **200** | **401** | **401** |

`/auth/v1/settings` is used: it discriminates and it needs no table name, so a
renamed table cannot break it.

## Current state, measured 2026-09-04

Project `ixvwfbuvfxxsjiywhbbb`.

| Variable | Status |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **OK** — 200 from `/auth/v1/settings`, 200 from `/rest/v1/products` |
| `SUPABASE_SECRET_KEY` | **REJECTED** — 401 from `/auth/v1/settings`, `/rest/v1/products` and `/auth/v1/admin/users`, as `apikey`, as `Bearer`, and as both |

The key is no longer the `iss=supabase-demo` stock key, so that defect is fixed.
It is now an `sb_secret_` key of the right shape that this project does not
recognise: either it belongs to a different project or it has been revoked.
**Fix:** Supabase Dashboard → Project `ixvwfbuvfxxsjiywhbbb` → Project Settings →
API Keys → copy the secret key.

**What stays broken until then:** every admin-client path. The guest cart, the
checkout address write, and the wallet balance all authenticate with this key and
fail silently — the guest add-to-cart returns HTTP 200, sets a session cookie and
writes no row.

## The variables

### Required in production

| Variable | What it is | What breaks without it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project REST URL | Everything |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key, RLS-scoped | Catalogue, auth, every public read |
| `SUPABASE_SECRET_KEY` *or* `SUPABASE_SERVICE_ROLE_KEY` | Admin key, bypasses RLS | Guest cart, checkout address write, wallet balance |
| `CARDCOM_TERMINAL_NUMBER` | Terminal id | Payment |
| `CARDCOM_API_NAME` | API user | Payment |
| `CARDCOM_API_PASSWORD` | API password | Payment |
| `CARDCOM_WEBHOOK_SECRET` | Webhook shared secret | Payment confirmation |
| `VOUCHER_QR_SECRET` | Voucher QR signing key | Voucher issue and redemption |
| `CRON_SECRET` | Bearer for `/api/cron/*` | Every scheduled job 401s |

### Guarded

| Variable | Rule |
|---|---|
| `CARDCOM_SANDBOX` | Must not be `true` in production. Real orders would settle against a test terminal: the shop looks healthy, customers are charged nothing, the money arrives nowhere. |
| `ALLOW_INCOMPLETE_ENV` | Waives the production required-set. Exists because `next start` on a laptop is also `NODE_ENV=production`, which is how Lighthouse and the whole Playwright suite are measured. Opt-in, per-environment, and logged loudly at boot. Vercel never sets it. |

### Optional

| Variable | Behaviour when absent |
|---|---|
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Rate limiting falls back to the Postgres `check_rate_limit`. Both are needed; either alone is treated as absent, so a half-finished configuration degrades rather than failing every request. |
| `UPSTASH_REDIS_REST_TIMEOUT_MS` | Defaults to 1000. |
| `SENTRY_DSN` | Error reporting is inert. |
| `SENTRY_AUTH_TOKEN` | Source-map upload is skipped; the build still succeeds. |
| `AXIOM_TOKEN` / `AXIOM_DATASET` | The Axiom log leg is inert. |
| `RESEND_API_KEY` | Email sending is inert and reports `skipped`, which the abandoned-cart job relies on so it does not burn its one-per-cart allowance. |
| `TWILIO_*` | WhatsApp is inert. |
| `MEILISEARCH_*` | The search backend and its drain are inert. |

## Rules

- **Never prefix a secret with `NEXT_PUBLIC_`.** It is inlined into the client
  bundle at build time, so it is a leak that already happened. `env.ts` refuses
  to boot if it finds one.
- **Never commit `.env.local`.** It is gitignored.
- A change here needs a matching row in this file, or the next person measures
  the app instead of reading it.
