# S03: production env audit (04.11.2026)

Project: `kenyonexpress` (`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`, team
`team_TUMTPVDP8218QHwedSjmgJWl`), the one that serves `kenyonexpress.co.il`.
Command: `env -u VERCEL_PROJECT_ID -u VERCEL_ORG_ID vercel env ls production`.

## Method

- Vercel production: 57 keys before, 58 after.
- Referenced in code: 119 keys. Swept over `src/` with every pattern in the
  env-audit recipe: `process.env.X`, `process.env['X']`, `env.X` / `source.X`
  (the `loadCardcomEnv(source = process.env)` convention), `required('X')` /
  `optional('X')`, and the zod schema keys in `src/lib/env.ts`.
- Present in both: 35. Referenced but not set: 84.

## Gate: all keys the deploy needs are present

`scripts/deploy-preflight.mjs` requires 8 keys. All 8 are set in production:
`NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY CARDCOM_TERMINAL_NUMBER
CARDCOM_API_NAME CARDCOM_API_PASSWORD CARDCOM_WEBHOOK_SECRET VOUCHER_QR_SECRET
CRON_SECRET`.

Turnstile (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`) and R2
(`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`,
`R2_PUBLIC_BASE_URL`) are present, as expected after 04.11.

Present in both (35):
`AXIOM_DATASET AXIOM_TOKEN CARDCOM_API_NAME CARDCOM_API_PASSWORD CARDCOM_SANDBOX
CARDCOM_TERMINAL_NUMBER CARDCOM_WEBHOOK_SECRET CHECKOUT_ENABLED CRON_SECRET
MEILISEARCH_API_KEY MEILISEARCH_HOST NEXT_PUBLIC_APP_URL NEXT_PUBLIC_POSTHOG_HOST
NEXT_PUBLIC_POSTHOG_KEY NEXT_PUBLIC_SENTRY_DSN NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_TURNSTILE_SITE_KEY NEXT_PUBLIC_VAPID_PUBLIC_KEY NODE_ENV
R2_ACCESS_KEY_ID R2_ACCOUNT_ID R2_BUCKET R2_PUBLIC_BASE_URL R2_SECRET_ACCESS_KEY
RESEND_API_KEY SENTRY_DSN SUPABASE_SECRET_KEY SUPABASE_SERVICE_ROLE_KEY
TURNSTILE_SECRET_KEY TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN VAPID_PRIVATE_KEY
VOUCHER_QR_SECRET`

## Added (non-secret)

| key | value | why |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://kenyonexpress.co.il` | Read by `src/app/api/wallet/apple/[id]/route.ts` and `src/components/coupon/WalletButtons.tsx` with an empty-string fallback. Value copied from `NEXT_PUBLIC_APP_URL` in the same project. |

```
$ printf 'https://kenyonexpress.co.il' | vercel env add NEXT_PUBLIC_SITE_URL production
$ vercel env ls production | grep NEXT_PUBLIC_SITE_URL
 NEXT_PUBLIC_SITE_URL               eyJ2IjoidjIiLCJjIj…         Config    Production                          2s ago
```

`NEXT_PUBLIC_*` values are baked in at build time, so this takes effect on the
next production build (the push of this item triggers one from
`closeout/v1-final`, see S02).

## Deliberately not added (non-secret)

- **`NEXT_PUBLIC_GA4_MEASUREMENT_ID`.** Production has the GA id
  (`G-XL3VSZ86Y0`) under the name `NEXT_PUBLIC_GA_MEASUREMENT_ID`, and no code
  reads that name. Copying it to the right name would make
  `ThirdPartyTags.tsx` inject gtag for visitors who consent, but the CSP
  `script-src` in `src/lib/security/frame-policy.ts` does not allow
  `googletagmanager.com`. The script would be blocked and the only result would
  be CSP violations. GA needs the env key and a CSP change shipped together, as
  its own item, not as a side effect of an env audit.
- **Optional keys with safe code defaults** (absence is the intended setting):
  `ABANDONED_CART_HOURS ABANDONED_CART_SECOND_HOURS AI_AGENTS_ENABLED`
  (off by default) `ALERTS_ENABLED CARDCOM_3DS_REQUIRED_CODES CARDCOM_3DS_STATE
  CARDCOM_ACCOUNTS CARDCOM_ALLOW_SANDBOX CARDCOM_API_BASE_URL
  CARDCOM_COUPON_RECEIPT_TYPE`('4') `CARDCOM_CREDIT_NOTE_TYPE`('3')
  `CARDCOM_PLATFORM_LABEL CARDCOM_TIMEOUT_MS CARDCOM_USE_MOCK`(must stay unset
  in production) `CONTACT_TO EMAIL_FROM`(`noreply@kenyonexpress.co.il`)
  `RESEND_FROM GOOGLE_WALLET_CLASS_SUFFIX APPLE_WALLET_ORG_NAME
  HEALTH_NTFY_TOPIC INVOICE_VAT_PERCENT LOG_LEVEL MEILISEARCH_INDEX
  MEILISEARCH_BRANDS_INDEX MEILISEARCH_COUPONS_INDEX NEXT_PUBLIC_WHATSAPP_PHONE`
  (falls back to the published `972524635550`) `NTFY_BASE_URL NTFY_TOPIC
  PHONE_AUTH_ENABLED PUSH_ENABLED SMS_ENABLED WHATSAPP_OTP_ENABLED
  SENTRY_DEBUG_ROUTES SENTRY_ENVIRONMENT SUPABASE_SLOW_QUERY_MS
  SUPABASE_TIMEOUT_MS UPSTASH_REDIS_REST_TIMEOUT_MS VOUCHER_QR_KEY_ID`('v1')
  `VAPID_SUBJECT TWILIO_SMS_FROM TWILIO_WHATSAPP_FROM TWILIO_WEBHOOK_URL
  TWILIO_SMS_WEBHOOK_URL TWILIO_CONTENT_SID_VOUCHER_ISSUED
  TWILIO_CONTENT_SID_VOUCHER_EXPIRING ANDROID_APP_SHA256_FINGERPRINTS
  IOS_APP_TEAM_ID NEXT_PUBLIC_META_PIXEL_ID`.
- **Platform or test variables, never set by hand:** `NEXT_RUNTIME VERCEL
  VERCEL_ENV TZ TEST_BASE_URL`. `ALLOW_INCOMPLETE_ENV` must not be set in
  production (`src/lib/deployed-runtime.ts`).
- **Aliases already covered:** `SUPABASE_URL` / `SUPABASE_ANON_KEY` are
  fallbacks for the `NEXT_PUBLIC_` pair, which is set.

## HOLD: missing secrets (need the owner or a provider account)

None of these blocks checkout or order confirmation. Each feature degrades as
documented in its module.

| key(s) | effect while unset |
|---|---|
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiter uses the Postgres backend (`src/lib/rate-limit/limiter.ts`). Upstash is an upgrade, not a fix. |
| `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Async search reindex queue off. |
| `SEARCH_WEBHOOK_SECRET` | `/api/webhooks/products` cannot verify signed senders. |
| `RESEND_WEBHOOK_SECRET`, `RESEND_AUDIENCE_ID` | `/api/webhooks/resend` answers 401 to everything; newsletter audience sync off. |
| `ORDER_TRACKING_SECRET`, `WISHLIST_SHARE_SECRET` | Not needed: both derive a key from `SUPABASE_SECRET_KEY` by HMAC. Dedicated keys are optional. |
| `CONSENT_IP_SALT` | Newsletter consent IP hash uses an empty salt. Setting one later changes hashes of new rows only. |
| `VOUCHER_QR_SECRET_PREVIOUS`, `CARDCOM_WEBHOOK_SECRET_PREVIOUS` | Only used during rotation. |
| `GA4_API_SECRET`, `META_CAPI_TOKEN` | Server-side analytics events off. |
| `ANTHROPIC_API_KEY` | AI agents off (also gated by `AI_AGENTS_ENABLED`). |
| `APPLE_WALLET_CERT_PEM`, `APPLE_WALLET_KEY_PEM`, `APPLE_WALLET_KEY_PASSPHRASE`, `APPLE_WALLET_WWDR_PEM`, `APPLE_WALLET_PASS_TYPE_ID`, `APPLE_WALLET_TEAM_ID` | Apple Wallet buttons hidden. Needs an Apple developer account. |
| `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SA_EMAIL`, `GOOGLE_WALLET_SA_KEY_PEM` | Google Wallet buttons hidden. |
| `EXPO_ACCESS_TOKEN` | Not needed for public Expo projects. |
| `SLACK_WEBHOOK_URL` | Alerts go to ntfy only. |

## Stale names in Vercel that no code reads

Not removed (removal is a delete): `NEXT_PUBLIC_GA_MEASUREMENT_ID` (see
above), `NEXT_PUBLIC_TURNSTILE_SITEKEY` (duplicate of `_SITE_KEY`),
`R2_BUCKET_NAME`, `R2_ENDPOINT`, `CF_ACCOUNT_ID`, `CARDCOM_MERCHANT_ID`,
`CARDCOM_CLIENT_ID`, `CARDCOM_API_KEY`, `NEXT_PUBLIC_CARDCOM_SANDBOX`,
`NEXT_PUBLIC_APP_ENV`, `OPENAI_API_KEY`, `POSTHOG_API_KEY`, `REDIS_URL`,
`SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`, `MEILISEARCH_ENABLED`, `APP_BASE_URL`,
`NEXT_PUBLIC_TURNSTILE_ENABLED`. Each one: 0 non-test files in `src`,
`next.config.ts`, `instrumentation*.ts` or `sentry*.ts` name it.

## Keys read indirectly (the regex sweep misses these)

These are read as `env[CONST]` or named in a config table, so the pattern
sweep does not catch them. Checked by hand:

- `MAINTENANCE_MODE`: `src/lib/resilience/maintenance.ts:21`
  (`MAINTENANCE_ENV`). **Set** in production.
- `INVOICE_PROVIDER`: `src/lib/invoices/provider.ts:60`. Not set; defaults to
  `cardcom`, which is right.
- Feature flags (`src/lib/resilience/feature-flags.ts`, read as `env[key]` by
  `src/server/resilience/flags.ts`): `CHECKOUT_ENABLED` is **set**; the rest
  (`NOTIFICATIONS_ENABLED`, `SEARCH_ENABLED`, `WALLET_APPLY_ENABLED`, ...) fall
  back to the DB table and then to code defaults. Unset is correct.
- Cost-dashboard credentials (`src/lib/costs/providers.ts`):
  `VERCEL_API_TOKEN`, `TWILIO_AUTH_TOKEN`, `RESEND_API_KEY` **set**;
  `SUPABASE_MANAGEMENT_TOKEN`, `UPSTASH_MANAGEMENT_API_KEY`,
  `CLOUDFLARE_API_TOKEN` not set (HOLD; the admin cost panel shows those
  providers as unconfigured).

## Side observation

`curl -sI https://www.kenyonexpress.co.il/` answers `503` with
`retry-after: 300`, while `/api/health` answers `200`. That matches the
`MAINTENANCE_MODE` variable set 10 days ago. Out of scope here; recorded so the
launch item does not mistake it for an outage.

## Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
(empty: no file changed)
```

No source file changed in this item.

## Gates (run 04.11.2026)

```
$ pnpm type-check            -> tsc exit 0
$ pnpm test                  -> Test Files 640 passed (640); Tests 7674 passed | 12 skipped (7686)
$ biome check <git ls-files> -> Checked 2110 files. No fixes applied.
$ node scripts/<gate>.mjs    -> tokens, copy, asset, raw-html, postgrest-or, cache-invalidation,
                                rtl-logical, i18n, locale-format, input-dir, docs-index: exit 0
$ node scripts/docs-path-audit.mjs -> OK. 160 known dangling references, no change.
```

Bare `pnpm lint` exits 1 only because biome scans the untracked
`.lighthouseci/` report folder (100 errors, all in that folder). It is not part
of the tree, so it was not touched.

To make the docs gates pass: added INDEX rows for `S02-vercel.md` (missing
since S02) and this file, changed the README document count from 283 to 285,
and ran `docs-path-audit --write`, which added 5 rows to the ledger. Those 5
are `refs/` artifacts named by older docs. They are gitignored and absent in
this checkout.
