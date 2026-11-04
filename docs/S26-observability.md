# S26: Observability (Sentry, PostHog, Axiom)

Queue S26, 04.11.2026. Branch `closeout/v1-final`, base `dbcad7e4e`.

## What was measured first

| Ask | State before S26 | Source of the measurement |
|---|---|---|
| Sentry DSN | Wired in all three runtimes (`sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`). `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are set on the production project as `sensitive`, targets production + preview. | Vercel API `/v9/projects/<prj>/env` |
| Sentry release tag | Wired: `SENTRY_RELEASE ?? VERCEL_GIT_COMMIT_SHA` on the server and edge, `NEXT_PUBLIC_SENTRY_RELEASE ?? NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` in the browser. Environment comes from `VERCEL_ENV` via `src/lib/observability/sentry-environment.ts`. | source |
| PostHog on checkout steps | **Gap.** `begin_checkout` reached PostHog (through `trackCommerce`) and `purchase` reached it from the server, but the four `checkout_step` calls in `CheckoutForm` went through `track()` only. That posts to the first-party `/api/a` and nowhere else, so the PostHog funnel jumped from `begin_checkout` straight to `purchase`. | `src/lib/analytics/tracker.ts`, `src/app/api/a/route.ts` (no PostHog reference) |
| Axiom drain | **No drain exists.** `/v1/drains` returns `[]` for the team, for the production project, and for the personal scope. `/v1/integrations/configurations` returns `[]`, so no Axiom Marketplace integration is installed either. App-level shipping exists (`src/lib/observability/axiom.ts`, called from `log.ts`), and `AXIOM_TOKEN` + `AXIOM_DATASET` are set on production as `sensitive`. | Vercel API |

## What changed

1. **New `src/lib/analytics/checkout-steps.ts`.** `trackCheckoutStep(step)` sends
   the step to the first-party tracker exactly as before, and also to PostHog
   as `checkout_step` with `step` and `step_index`. The PostHog half sits behind
   the same two gates as every other browser PostHog call: a configured key
   (`isPostHogEnabled`) and the consent cookie (`trackingAllowed` from
   `commerce-client.ts`). Steps: `identity`, `address`, `payment_redirect`,
   `guest_login`.
2. **`src/app/(store)/checkout/CheckoutForm.tsx`**: the four
   `track('checkout_step', { step })` calls now call `trackCheckoutStep(step)`.
   No markup, class or copy changed. This file is under the checkout route,
   which the freeze amendment lists as open, and it is not under any frozen path.
3. **New `src/lib/analytics/checkout-steps.test.ts`**: five tests. First-party
   always fires; PostHog does not fire before the banner is answered, after a
   decline, or without a key; it fires once with `step_index` after consent.
4. **New `scripts/posthog-verify.mjs`**: the PostHog counterpart of
   `scripts/sentry-verify.mjs`. It sends one real `checkout_step` in the shape
   `posthog.ts` posts and exits non-zero unless PostHog accepts it. Needed
   because `trackEvent` is fire-and-forget and swallows every failure.

## Sandbox verification: one event each

### Sentry: delivered

Environment `sandbox`, release = the HEAD SHA `dbcad7e4e9487102a3e1fa1790b1b942e2c57e9f`.
The DSN is the one in `.env.local.pre-probe` (EU region, project `4511946778607696`).
The production DSN is `sensitive` on Vercel and cannot be read back, so whether
the two are byte-identical is not measured. The host and project id match the
ones the memory ledger records for `kenyonexpress-web`.

```
$ SENTRY_DSN=<dsn> NEXT_PUBLIC_SENTRY_DSN=<dsn> SENTRY_ENVIRONMENT=sandbox SENTRY_RELEASE=dbcad7e4e... node scripts/sentry-verify.mjs
sentry-verify: config OK
  ingest host   o4511944582496256.ingest.de.sentry.io
  project id    4511946778607696
  environment   sandbox

sentry-verify: event delivered
  event id      3d06f65039ac4a8aaf8591f3b014e90d
  marker        sentry-verify-mw24jd3g-ov0jtb
  find it       marker:sentry-verify-mw24jd3g-ov0jtb
```

The first run failed because only the server DSN was passed in, and the script
refuses that on purpose (the browser would report nothing):
`NEXT_PUBLIC_SENTRY_DSN is unset, so the BROWSER reports nothing.`

### PostHog: accepted

Key = `NEXT_PUBLIC_POSTHOG_KEY` from the Vercel production pull (`phc_traY...`, a
public project key), host `https://us.i.posthog.com`. Event `checkout_step`,
`$environment: sandbox`.

```
$ node scripts/posthog-verify.mjs
posthog-verify: config OK
  host          https://us.i.posthog.com
  key prefix    phc_traY

  HTTP          200
  body          {"status":"Ok"}
  marker        posthog-verify-mw24kg3t

posthog-verify: event accepted
```

The first version of the script expected `{"status":1}` and failed on a real
200. The current capture endpoint answers `"Ok"`, so both are accepted now.
Reading the event back needs a personal API key (`POSTHOG_API_KEY`), which is
`sensitive` on Vercel and not present anywhere local.

### Axiom: NOT verified, blocked on an Axiom credential

- No Vercel drain to create a test against, and creating one needs an Axiom
  ingest token as the drain header. The only token is `AXIOM_TOKEN` on
  Vercel, type `sensitive`, which the API never returns. Every local env file
  that names it holds the literal placeholder `[SENSITIVE]`.
- The other route, the Axiom Marketplace integration, is an OAuth install into
  an Axiom account from the Vercel dashboard. That is an external account
  login.
- App-level shipping cannot be observed either. `shipAxiomEvent` swallows
  every failure by design, and reading the dataset needs the same token.

What unblocks it: an Axiom API token with ingest permission on the dataset, in
`.env.local` as `AXIOM_TOKEN` + `AXIOM_DATASET`. Then `node scripts/axiom/setup.mjs`
and a single `shipAxiomEvent` prove the app path, and
`vercel api /v1/drains --method POST` with header `Authorization: Bearer <token>` to
`https://api.axiom.co/v1/datasets/<dataset>/ingest` creates the drain. Log
drains also require a Vercel Pro plan.

## Gates

```
$ pnpm type-check
$ tsc --noEmit
tsc exit=0

$ pnpm lint
Checked 2200 files in 632ms. No fixes applied.
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
copy gate: clean (no Latin marketing sentence in a rendered component)
asset gate: clean (no template or vendor product imagery under public/images)
raw-html gate: clean (every dangerouslySetInnerHTML is jsonLdScript or allowlisted)
postgrest-or gate: clean (every .or() interpolation is sanitized or session-derived)
cache-invalidation gate: clean (every write to a cached table invalidates it, every cached scope carries a tag)
rtl-logical gate: clean (no physical direction utility outside an LTR island)
i18n gate: clean (603 Hebrew literals in scope, ceiling 603)
locale-format gate: clean (116 inline 'he-IL' in 64 files, at the ceiling)
input-dir gate: clean (28 tel/email/url inputs, all carry dir)
docs-index-gate: OK. 307 documents, all listed; 2 out-of-docs row(s) resolve.
docs-path-audit: OK. 160 known dangling references, no change.
lint exit=0

$ vitest run   (placeholder [SENSITIVE] and VERCEL* env stripped)
 Test Files  683 passed | 1 skipped (684)
      Tests  8128 passed | 13 skipped (8141)
```

Re-run after this document and its INDEX row were added: `docs-index-gate: OK. 308 documents`, `pnpm lint` exit 0, `src/__tests__` 35/35 files, 388/388 tests.

### Freeze gate

`git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts`:

```
 src/components/gifts/GiftPurchaseForm.tsx          | 117 +++++++++++++++++++++
 .../notifications/ExpiryEmailSwitch.test.tsx       |  34 ++++++
 src/components/notifications/ExpiryEmailSwitch.tsx |  52 +++++++++
 .../notifications/PushTopicsSwitch.test.tsx        |  74 +++++++++++++
 src/components/notifications/PushTopicsSwitch.tsx  |  90 ++++++++++++++++
 .../supplier-apply/SupplierCardCheck.tsx           |  53 ++++++++++
 .../turnstile/SupplierApplyChallenge.tsx           |  49 +++++++++
 src/components/turnstile/TurnstileRefresh.tsx      |  71 +++++++++++++
 8 files changed, 540 insertions(+)
```

All eight were checked with `git cat-file -e design-locked-2026-10-19:<path>`:
none existed at the tag. All are from earlier S items; S26 touched none of these paths.
