# Sentry

Measured and wired 21.08.2026. What is done, what is left, and the three ways
this setup can look correct while reporting nothing.

## The project

| | |
|---|---|
| Org | `kenyonexpress` |
| Team | `kenyonexpress` |
| Project | `kenyonexpress-web` (id `4511946778607696`) |
| **Region** | **EU** — `https://de.sentry.io`, ingest on `o4511944582496256.ingest.de.sentry.io` |
| Dashboard | https://kenyonexpress.sentry.io/issues/ |

The region is the first thing that bites. Against the default US host
(`sentry.io`, `ingest.sentry.io`) this org does not resolve: `sentry-cli` and
the API answer 404, which reads like a bad token and is not. Any DSN, any
`--url`, any API call must be pointed at the `de` host.

## Verified end to end

`scripts/sentry-verify.mjs` sends a real event and prints a unique marker to
look up. Run 21.08:

```
$ node scripts/sentry-verify.mjs
sentry-verify: config OK
  ingest host   o4511944582496256.ingest.de.sentry.io
  project id    4511946778607696
sentry-verify: event delivered
  event id      ecd7fb90a2834ac9b1e3d19350612a72
  marker        sentry-verify-mt2ezsox-iutt86
```

Confirmed on the Sentry side, not just locally: issue `KENYONEXPRESS-WEB-1`,
title `Error: Sentry verification event: sentry-verify-mt2ezsox-iutt86`. The
marker matches, so the event travelled the whole path rather than being queued
and dropped.

`pnpm sentry:verify` repeats it. `pnpm sentry:verify:ci` checks configuration
only and makes a missing upload credential a failure instead of a silence.

### And Next's own error path, which is the part a DSN check cannot reach

Sending an event through the SDK proves the transport. It says nothing about
whether `onRequestError` is exported from the file Next actually loads, or
whether it fires for all three kinds of server code. Three gated endpoints exist
to answer that, off by default everywhere:

```
SENTRY_DEBUG_ROUTES=i-know-what-this-does
```

| Endpoint | `routeType` |
|---|---|
| `/api/debug/sentry` | `route` |
| `/debug/sentry/render` | `render` |
| `/debug/sentry` (submit the form) | `action` |

Run against `pnpm start` on 21.08. All three reached Sentry —
`KENYONEXPRESS-WEB-2/3/4`, markers matching. The RSC event carried:

```
route_type:       render
render_source:    react-server-components
digest:           1403500289
client_sample_rate: 0.1
```

`digest` is the one that matters. React replaces the error instance during an
RSC render, so on a production crash the digest is the only stable handle
linking the page's "an error occurred" to the report. `client_sample_rate: 0.1`
is independent confirmation that removing `__SENTRY_TRACING__` actually turned
tracing on, rather than the number merely being present in a config.

The routes are gated rather than deleted after use because a deploy that cannot
be re-verified stops being verified. The gate wants an exact phrase, not a
truthy string, so a stray `=1` in a copied env block does not open them. And
they deliberately sit outside `/api/payments/` and `/checkout`: an identical
thrower on the money path would also fire `alertMoneyFailure` and push to Ofir's
phone, turning a wiring check into a remote pager.

## What reports

| Runtime | File | Catches |
|---|---|---|
| Browser | `instrumentation-client.ts` | Errors before and during hydration |
| Node | `sentry.server.config.ts` | Route handlers, Server Components, Server Functions |
| Edge | `sentry.edge.config.ts` | `src/proxy.ts` — every request passes through it |

`src/instrumentation.ts` exports `onRequestError`, which Next calls for every
server-side error it catches. Its `context.routeType` is the discriminator, and
per `node_modules/next/dist/docs/.../instrumentation.md` it takes four values:
`render` (Server Components), `route` (Route Handlers), `action` (**Server
Functions**) and `proxy`. So RSC and server-action errors are covered by the
same handler, and both are tagged `route_type`. `render` additionally carries
`renderSource`, which is what separates an RSC-pass failure from the same tree
failing in SSR — two different bugs, now two different tags.

Money-path errors (`/api/payments/`, `/api/supplier/vouchers/`,
`/api/cron/expire-vouchers`, `/checkout`) take a second branch: they also push
to the phone via `alertMoneyFailure`. That split is deliberate and predates this
work — Sentry is the searchable record, ntfy is the interrupt.

## Tracing: 0.1

All three runtimes sample 10% of transactions. Errors are **not** sampled —
`tracesSampleRate` governs transactions only and has never gated
`captureException`.

**The load-bearing part is in `next.config.ts`, not in the sample rate.**
`compiler.define.__SENTRY_TRACING__` used to be `false`, which deletes the span
code at build time. With it set, `tracesSampleRate: 0.1` reports no error and
emits no transaction: a config that looks enabled and is not. It has been
removed. If tracing is ever turned back off, turn the flag back on in the same
commit — that is where the bytes are.

Cost, from the measurement already recorded in `next.config.ts`: the flag was
worth **53322 bytes** of client JS (1797197 → 1743875 with it on). Tracing
charges that back on the client bundle. `__SENTRY_DEBUG__: false` stays and is
independently worth 5471 bytes.

## The tunnel is not optional here

`tunnelRoute: '/monitoring'` routes the browser SDK's requests through this
origin. The usual reason is ad blockers, and most Israeli shoppers run one. On
this site there is a second, harder reason:

```
connect-src 'self' https://*.supabase.co     # src/lib/security/frame-policy.ts:87
```

The CSP has no Sentry origin in it. Without the tunnel the browser blocks every
report **before it is sent**, and the only trace is a console violation nobody
is reading. Two things must stay true or client reporting dies silently:

- `/monitoring` stays out of the proxy's auth matcher — it is forwarded at
  `src/proxy.ts:55`.
- `connect-src` keeps `'self'`.

## Source maps

`withSentryConfig` uploads them and then deletes them from the deployed output
(`sourcemaps.deleteSourcemapsAfterUpload`), so the unminified checkout source is
never served publicly. The plugin turns on `productionBrowserSourceMaps` itself,
and Turbopack is supported through `runAfterProductionCompile` — no webpack
step is involved, which matters because every `webpack:` option in this config
is inert on a Turbopack build.

GitHub Actions is already wired (`.github/workflows/ci.yml`, `build` job).

**That the maps are actually GENERATED was measured, not assumed.** The delete
step hides the difference: with no auth token the upload is a no-op while the
delete still runs, so `.next/static` ends up with zero `.map` files whether they
were made and removed or never made at all. Those are opposite states - the
second means Vercel uploads nothing and every production trace stays minified.
`SENTRY_KEEP_SOURCEMAPS=1 pnpm build` keeps them: **75 maps**, largest 3.2MB.
So the upload has real input.

### Vercel — NOT DONE, and it cannot be done from here

This is the one open item. Vercel is not linked in this checkout: there is no
`.vercel/`, no `vercel` CLI on the machine, and the Vercel MCP exposes no
environment-variable tool. So the variables below have to be set by hand in the
Vercel dashboard, Project → Settings → Environment Variables.

| Variable | Value | Environments |
|---|---|---|
| `SENTRY_DSN` | the EU DSN | Production, Preview |
| `NEXT_PUBLIC_SENTRY_DSN` | the same DSN | Production, Preview |
| `SENTRY_ORG` | `kenyonexpress` | all |
| `SENTRY_PROJECT` | `kenyonexpress-web` | all |
| `SENTRY_AUTH_TOKEN` | org token, scopes `project:releases` + `org:read` | all |
| `SENTRY_ENVIRONMENT` | `production` / `preview` | respectively |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | same | respectively |

Two traps in that table.

**`NEXT_PUBLIC_SENTRY_DSN` is consumed at BUILD time**, not at runtime. It is
inlined into the client bundle. Setting it after a deploy changes nothing until
the next build, and a build without it produces a bundle whose browser SDK has
`dsn: undefined` and reports nothing, quietly.

**`SENTRY_AUTH_TOKEN` can create and delete projects.** It is a write
credential. It is deliberately absent from `.env.local`; it is only needed by
the upload, and the upload only runs in CI.

Release naming needs nothing set: the server configs fall back to
`VERCEL_GIT_COMMIT_SHA`, and `instrumentation-client.ts` falls back to
`NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, which Vercel exposes when system
environment variables are enabled (the default). Both then match the release the
maps are uploaded against.

## The three silences

Every failure mode here is quiet by design, and each silence is correct
somewhere else. That is why `scripts/sentry-verify.mjs` exists instead of a unit
test — a test would have to mock the transport, and the transport is the thing
in question.

1. **No DSN** → `src/lib/observability/sentry.ts` returns early, `init` is
   skipped, nothing is queued. Correct on a laptop and in CI. Fatal on a deploy.
2. **No `SENTRY_AUTH_TOKEN`** → the source-map upload is skipped without failing
   the build. Correct for a fork. On production it means every stack trace is a
   column offset into a one-line minified chunk.
3. **`beforeSend`** → all three configs drop headers, cookies and redact URLs.
   A voucher token lives in the path of `/redeem/<token>`, so that redaction is
   load-bearing (SEC-SCRUB) and must survive any edit to those files.
