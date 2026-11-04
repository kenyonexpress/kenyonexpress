# S24: rate limits, CSP and HSTS, gitleaks in CI, RLS smoke on money tables

Queue item S24, 04.11.2026. Scope: Upstash rate limits on auth, checkout and
redeem; CSP and HSTS headers; gitleaks in CI; an RLS smoke on orders,
vouchers and wallet.

I measured before writing anything. Three of the four parts already existed.
The fourth, gitleaks, was in the repo but had not actually run for six weeks.

## 1. Rate limits: wired on all three surfaces, but Upstash is not provisioned in production

The `/api/auth`, `/api/checkout` and `/api/redeem` routes do not exist in this
app. Those three surfaces are server actions and a page. All three already go
through the one limiter, `src/lib/rate-limit/limiter.ts`, which tries
Upstash first, then Postgres `check_rate_limit`, then fails open with an
error-level log:

| Surface | Where | Key, limit |
|---|---|---|
| auth | `src/server/actions/auth.ts` | `login:<ip>` 10/h, `login-account`, `signup` 5/h, `magic` 5/h, `phone-otp` 5/h + per number 3/h, `phone-verify` 20/h, `reset` 5/h + per address, `update-password` 10/h |
| auth (OTP) | `src/server/actions/otp-sign-in.ts` | `phone-otp`, `phone-otp-number`, `magic`, `phone-verify`, `otp-verify-email` 5/h |
| checkout | `src/server/actions/payments/checkout.ts` | `begin_checkout:user:<id>` 10/min, `guest_identity:ip` 20/h |
| redeem (customer) | `src/app/redeem/[token]/page.tsx` | `redeem:<ip>` 60/h |
| redeem (till) | `src/app/api/supplier/vouchers/redeem/route.ts`, `src/app/api/partner/redeem/route.ts` | `voucher-redeem` 120/h per user, with `RateLimit-*` headers |

`checkRateLimit` in `src/lib/utils/rate-limit.ts` calls `rateLimitByKey`, so
the legacy call sites also take the Upstash path once it is configured. The
existing tests for these paths pass (output in section 5).

**Gap, not fixed here:** `vercel env ls` on the production project
(`kenyonexpress-projects/kenyonexpress`) has **no `UPSTASH_REDIS_REST_URL` and
no `UPSTASH_REDIS_REST_TOKEN`**. There is a `REDIS_URL` secret, but nothing in
`src/` reads it, and as a sensitive variable it pulls back empty, so I cannot
tell whether it is an Upstash database. Production therefore limits through
the Postgres fallback. That is real and tested, but it is not Upstash. The
code needs no change. Turning Upstash on means setting both variables in
Vercel production and redeploying, and `checkRateLimiter` in
`/api/health` will then report `Upstash sliding window`.

## 2. CSP and HSTS: live, now pinned by a test

`next.config.ts` emits both headers on every policy entry, and the CSP is
built in `src/lib/security/frame-policy.ts`. Measured on production today:

```
$ curl -sI https://www.kenyonexpress.co.il/
HTTP/2 503
cross-origin-opener-policy: same-origin-allow-popups
cross-origin-resource-policy: same-site
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
content-security-policy: default-src 'self'
base-uri 'self'
form-action 'self' https://secure.cardcom.solutions
object-src 'none'
upgrade-insecure-requests
frame-ancestors 'none'
```

The 503 is the site's own maintenance page. `MAINTENANCE_MODE` was set in
Vercel production 10 days ago, which predates this item, and I left it alone.
The headers ride on that response too.

The CSP already had a test per directive (`src/lib/security/*.test.ts`). HSTS
had no test at all. New: `src/__tests__/security-headers.test.ts` runs the
real `headers()` from `next.config.ts` and asserts that every policy entry
carries all of the following:

- HSTS of at least one year, with `includeSubDomains` and `preload`
- a CSP with `default-src 'self'`, `object-src 'none'`, `base-uri 'self'` and
  `frame-ancestors`
- `nosniff`
- a frame option

It also asserts that the catch-all entry exists. A new path group added
without the helper would otherwise ship neither header.

## 3. gitleaks in CI: the workflow was invalid for six weeks. Fixed, and history triaged

`.github/workflows/security.yml` has had `workflow_dispatch:` twice under
`on:` since `c6e36f049` (22.09). Duplicate keys make the YAML invalid, so
GitHub failed the workflow in 0 seconds on every push. The last 40 runs are
all `failure`, and gitleaks never ran:

```
$ gh run view 41828734843
X This run likely failed because of a workflow file issue.
$ node -e "yaml.parse(old, {uniqueKeys:true})"
OLD: Map keys must be unique at line 35, column 3
$ node -e "yaml.parse(new, {uniqueKeys:true})"
[ 'workflow_dispatch', 'schedule', 'pull_request', 'push' ] [ 'secrets', 'dependencies', 'zap-baseline' ]
```

Fix: I removed the second key. Then I ran the job's exact command locally with
the same pinned binary (8.28.0) over the full history:

```
$ gitleaks git --no-banner --redact -c .gitleaks.toml .
11759 commits scanned.
scanned ~287649422 bytes (287.65 MB) in 7.66s
leaks found: 76
```

I opened all 76 findings, and the triage is in the new `.gitleaksignore`. Each
entry is a fingerprint (`commit:file:rule:line`), and no entry contains a value.

**Real credentials in public history (the repository is `PUBLIC`).** Agent
sessions pasted these into `docs/C54`, `C70-*`, `C73-*`, `F61` and
`CRON-SECRET-FIX` between 17.10 and 25.10. Those files are gone from the
tree, but not from history:

| Credential | Prefix | Note |
|---|---|---|
| CRON_SECRET | `7enz…` (44) | **equals the current `.env.local` value** |
| CRON_SECRET | `fEZQ…` (44) | documented as the production value in C70 |
| CRON_SECRET | `016a…` (64) | hex variant |
| VOUCHER_QR_SECRET | `qouI…` (44) | documented as "the new value" in C70 |
| Vercel deployment-protection password | `1IND…` (24) | C73 |
| Vercel deployment-protection OLD_SECRET | `e7e9…` (32) | C73 |
| VERCEL_API_TOKEN | `wL4Y…` (16, fragment) | F61 |

They are suppressed so that the gate catches the next leak instead of staying
red forever. A gate that is always red is how this one went unread. **The
suppression is not the fix: all seven need rotating.** I did not rotate them
in this item:

- CRON_SECRET is shared with the Supabase vault row that pg_cron sends.
  Changing one side alone breaks every cron.
- VOUCHER_QR_SECRET signs the QR codes on vouchers already issued. Rotating it
  without a dual-key window invalidates coupons customers are holding.

Both are coordinated production changes, not edits to a config file. I did
not add them to `scripts/compromised-keys.mjs` either, because that would make
`deploy-preflight` refuse every production build until the rotation is done.

**Not secrets (the other 69).** These are test fixtures that sign and verify
inside the same file, placeholders (`YOUR_…`, `dev-…`, `wrong-…`, `old-…`),
the VAPID public key, a `sb_publishable` key, a truncated `sb_secret_`
example, a vault row UUID, the word `bounce` in STATE.md, and
`scripts/secret-leak-gate.test.mjs`, whose fake `sk_live_` strings exist to
test this repo's own scanner.

```
$ gitleaks git --no-banner --redact -c .gitleaks.toml .
11759 commits scanned.
scanned ~287649422 bytes (287.65 MB) in 6.91s
no leaks found
```

## 4. RLS smoke on orders, vouchers and wallet

`scripts/rls-role-matrix.mjs` counts rows per role. That count cannot tell a
customer's own 22 orders from someone else's 22. The new
`scripts/rls-smoke.mjs` asks the isolation question directly against
production, as `SET LOCAL ROLE` with real JWT claims, inside
`BEGIN … ROLLBACK`:

- **6 cross-user reads:** rows in `orders`, `order_items`, `vouchers`,
  `voucher_redemptions`, `wallet_accounts` and `wallet_entries` that belong
  to another user.
- **13 forbidden writes:** insert or update on orders, vouchers and wallet,
  including the caller's OWN rows (status to paid, voucher to redeemed,
  balance to 999999), plus delete-all and insert of a ledger entry.
- **2 positive controls:** own orders and own wallet. A policy that denies
  everything would also read 0 foreign rows.
- **A service-role control:** foreign rows must exist, or a 0 proves nothing.

The roles are anon plus three plain customers (no admin, support or supplier
membership): the e2e fixture, a customer with a wallet, and a customer with no
orders.

```
$ node scripts/rls-smoke.mjs
control {"orders_foreign":1032,"order_items_foreign":1067,"vouchers_foreign":848,
         "voucher_redemptions_foreign":135,"wallet_accounts_foreign":337,"wallet_entries_foreign":1352}
```

Every one of the 6 reads and 13 writes returned `0` or `denied` for all four
roles, with no `error:` result. Owner reads: the customer sees 714 of their own
orders, and each wallet holder sees 1 wallet account. While building the
probes, the first run returned `error:22P02` (I had used the enum value
`active`, which is not a `voucher_status`) and `error:428C9`
(`balance_ils_agorot` and `amount_ils_agorot` are generated columns). The
probes now write the base columns. The test also fails on any `error:` result,
so a renamed column cannot pass silently.

Invariants: `src/lib/auth/rls-smoke.test.ts` (12 tests) over
`supabase/rls-smoke.json`.

## 5. Gates

```
$ pnpm type-check
tsc exit 0

$ pnpm lint
docs-index-gate: OK.
lint exit 0

$ vitest run (S24 + rate-limit + auth + checkout + redeem + security)
 Test Files  23 passed (23)
      Tests  252 passed (252)

$ pnpm test   (before adding this document)
 Test Files  1 failed | 681 passed | 1 skipped (683)
      Tests  1 failed | 8116 passed | 13 skipped (8130)
 FAIL  src/__tests__/ci-docs-inventory.test.ts  expected 304 to be 305
```

The one red was already there before this item: S23 added a document without
bumping the README count. This item sets the count to 306, which covers S23's
document and this one. Final run below.

```
$ pnpm test
 Test Files  682 passed | 1 skipped (683)
      Tests  8117 passed | 13 skipped (8130)
exit 0
```

Freeze gate:

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 src/components/gifts/GiftPurchaseForm.tsx          | 117 +++++++++++++++++++++
 .../notifications/ExpiryEmailSwitch.test.tsx       |  34 ++++++
 src/components/notifications/ExpiryEmailSwitch.tsx |  52 +++++++++
 .../notifications/PushTopicsSwitch.test.tsx        |  74 +++++++++++++
 src/components/notifications/PushTopicsSwitch.tsx  |  90 ++++++++++++++++
 .../supplier-apply/SupplierCardCheck.tsx           |  53 ++++++++++
 .../turnstile/SupplierApplyChallenge.tsx           |  49 +++++++++
 src/components/turnstile/TurnstileRefresh.tsx      |  71 +++++++++++++
 8 files changed, 540 insertions(+)
$ git diff --name-status (same paths): every line is A (added since the tag), none M
```

S24 touches none of those paths.

## Open, in priority order

1. Rotate the seven leaked credentials in section 3. Rotate CRON_SECRET in
   Vercel and in the vault in the same step. Give VOUCHER_QR_SECRET a
   dual-key window. Rotate the Vercel protection bypass and API token.
2. Provision Upstash for production: set both `UPSTASH_REDIS_REST_*`
   variables in Vercel production.
3. Add `Secret scan (gitleaks)` to the required checks on `main`. It now has
   a run history to show.
