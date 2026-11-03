# C184: Observability (Sentry, PostHog funnel, Resend bounce webhook)

Date: 2026-11-03. Branch `closeout/v1-final`, base commit 2712cea3c.

## What was done

| Piece | State before | Change |
|---|---|---|
| Sentry client / server / edge | `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts` already present and wired (C17, C183) | No code change. Live ingest verified for all three runtimes (below). |
| PostHog funnel view, add, checkout, paid | Events emitted (`view_item`, `add_to_cart`, `begin_checkout` client+server, `purchase` server only); no funnel definition for the four steps | `VIEW_ADD_CHECKOUT_PAID` + `viewAddCheckoutPaidQuery()` in `src/lib/analytics/posthog-funnel.ts` (ordered FunnelsQuery, 14-day window), locked by tests to the existing taxonomy. |
| Resend bounce webhook | Built in 373911f2f on another branch, never on this one; it depended on pending migration 207 (`suppress_email` RPC), which is not applied | `src/app/api/webhooks/resend/route.ts`: Svix signature (hand-rolled HMAC, 300 s tolerance both directions), 401 when `RESEND_WEBHOOK_SECRET` unset; permanent bounce and complaint write `email_suppressions` (live table from 095) via upsert `ignoreDuplicates`, so no migration is needed. Soft bounces never suppress. |

New files: `src/app/api/webhooks/resend/route.ts` (+ test), `src/lib/email/suppression.ts`,
`src/server/email/svix.ts` (+ test), `src/server/email/resend-events.ts` (+ test),
`scripts/c184-obs-smoke.mjs`. Guard registries updated: `mutating-route-guards.test.ts`,
`rate-limit/route-coverage.test.ts`. `.env.example` documents `RESEND_WEBHOOK_SECRET`.

## Live test: `node scripts/c184-obs-smoke.mjs`

DSN and PostHog project key were read from the live production bundle on
www.kenyonexpress.co.il (both are public client values).

```
PASS  sentry:client  HTTP 200 {"id":"2524c8ce46d6401fb4e71e150e6c77f4"}
PASS  sentry:server  HTTP 200 {"id":"e0db6e1676104598a0d56308cef58404"}
PASS  sentry:edge  HTTP 200 {"id":"60504e2a8bce424395b03568cf2b2a08"}
PASS  posthog:funnel-events  HTTP 200 {"status":"Ok"} distinct_id=c184-smoke-1793679087567
SKIP  posthog:insight  no POSTHOG_PERSONAL_API_KEY/POSTHOG_PROJECT_ID; query:
{"kind":"InsightVizNode","source":{"kind":"FunnelsQuery","series":[{"kind":"EventsNode","event":"view_item","name":"view_item"},{"kind":"EventsNode","event":"add_to_cart","name":"add_to_cart"},{"kind":"EventsNode","event":"begin_checkout","name":"begin_checkout"},{"kind":"EventsNode","event":"purchase","name":"purchase"}],"dateRange":{"date_from":"-30d"},"funnelsFilter":{"funnelVizType":"steps","funnelOrderType":"ordered","funnelWindowInterval":14,"funnelWindowIntervalUnit":"day"}}}
FAIL  resend:unsigned-refused  https://www.kenyonexpress.co.il HTTP 404

4/5 live checks passed
```

- Sentry: three events accepted by `o4511944582496256.ingest.de.sentry.io`, project 4511946778607696, environment `c184-smoke`, tags `runtime=client|server|edge`, `c184_smoke=true`.
- PostHog: the four funnel steps accepted in order for one distinct_id.
- The funnel insight itself is not created: no PostHog personal API key exists on this machine (`POSTHOG_API_KEY` is a `[SENSITIVE]` placeholder). The script creates it as soon as `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` are set; the exact query is printed above.
- Production 404 on `/api/webhooks/resend`: the deployed build predates this route. Deploying to production is outside this item. The route was tested live on a local server instead (next section).

## Live test: webhook over HTTP on a local server

`RESEND_WEBHOOK_SECRET=whsec_<base64 test secret> pnpm exec next dev -p 3384`, signed requests from a Node script:

```
unsigned: HTTP 401 {"error":"unauthorized"}
soft: HTTP 200 {"ok":true}
delivered: HTTP 200 {"ok":true}
soft (stale): HTTP 401 {"error":"unauthorized"}
```

Server log:

```
{"level":"warn","event":"email.webhook_refused","route":"/api/webhooks/resend","method":"POST","reason":"missing_headers"}
{"level":"warn","event":"email.webhook_refused","route":"/api/webhooks/resend","method":"POST","reason":"stale"}
```

## Suppression write against production, rolled back

```
begin;
insert ... ('c184-smoke@example.invalid','hard_bounce', ...) on conflict (email) do nothing;
insert ... ('c184-smoke@example.invalid','complaint', ...)   on conflict (email) do nothing;
select email, reason ...  ->  [{"email":"c184-smoke@example.invalid","reason":"hard_bounce"}]
rollback;
select count(*) ...       ->  [{"rows_after_rollback":0}]
```

The live CHECK (`hard_bounce, complaint, manual, unsubscribed`) accepts the row, and a second event does not overwrite the first.

## Gates

```
$ pnpm vitest run src/app/api/webhooks/resend src/server/email src/__tests__/security/mutating-route-guards.test.ts src/lib/analytics/posthog-funnel.test.ts
 Test Files  5 passed (5)
      Tests  43 passed (43)

$ pnpm vitest run src/lib/analytics/posthog-funnel.test.ts src/lib/rate-limit/route-coverage.test.ts
 Test Files  2 passed (2)
      Tests  61 passed (61)

$ pnpm test
 Test Files  874 passed | 3 skipped (877)
      Tests  9668 passed | 39 skipped (9707)

$ pnpm type-check
tsc exit 0

$ pnpm lint
lint exit 0
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
copy gate: clean (no Latin marketing sentence in a rendered component)
asset gate: clean (no template or vendor product imagery under public/images)
```

## To finish once secrets are available (not blockers for this item)

1. Resend > Webhooks: add `https://www.kenyonexpress.co.il/api/webhooks/resend` for `email.bounced` and `email.complained`, put its `whsec_` secret in Vercel as `RESEND_WEBHOOK_SECRET`, then deploy.
2. `POSTHOG_PERSONAL_API_KEY=... POSTHOG_PROJECT_ID=... node scripts/c184-obs-smoke.mjs` creates the funnel insight.
