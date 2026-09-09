# Error handling

Measured 2026-09-09 against the working tree. Written for SECTIONS 15, which
asked for six things; three were already built, one was wholly missing and is
now built, and two are **not built, on purpose, with the reason below**.

| Item | State |
| --- | --- |
| Error boundary per route segment, Hebrew RTL | Built 2026-09-09 |
| Sentry user context with no PII | Already built |
| Exponential backoff for Cardcom / Meilisearch / R2 | Already built, R2 now spelled out |
| Graceful degradation | Already built |
| Typed `Result` pattern in all services | **Not done.** See below |
| Circuit breaker on external services | **Not done, and should not be.** See below |

---

## Error boundaries

Until 2026-09-09 the only boundary under the root layout was
`src/app/error.tsx`. It is a good page and it is a **storefront** page: its
escape hatch is "לדף הבית". Every area of the app rendered it, which is right
for a shopper on a category listing and wrong for everyone else.

Five boundaries now, and the differences between them are the point:

| File | Sentry `boundary` tag | Escape hatch |
| --- | --- | --- |
| `src/app/error.tsx` | `app-error` | `/` |
| `src/app/(store)/checkout/error.tsx` | `checkout` | see below |
| `src/app/(supplier)/error.tsx` | `supplier` | `/scan` |
| `src/app/(admin)/error.tsx` | `admin` | `/admin` |
| `src/app/(account)/error.tsx` | `account` | `/account` |

`src/components/errors/SegmentErrorBoundary.tsx` is the shared body for the
last three, so the reporting cannot drift between them.

**What a segment boundary does not catch.** An `error.tsx` catches throws from
its segment's *children*, not from the layout of its own segment. An error
inside `(admin)/layout.tsx` still goes to `global-error.tsx`. Each file sits
beside the layout whose children it protects.

**The supplier one is not cosmetic.** That person is standing at a till with a
customer in front of them, mid-redemption, on a phone. Sending them to the
storefront home page ends the redemption they were in the middle of.

### Checkout is different, and it is the only one that is

By the time this boundary can render, **the card may already have been
charged**. Cardcom takes the payment on its own hosted page and returns the
customer to `/checkout/return`, where `reconcileOrderReturn` decides whether an
order exists. A throw during that render is a failure of our page and says
nothing about the payment.

So a large primary "נסו שוב" in front of somebody whose card was just debited
invites a second debit, and the refund for it comes out of a Cardcom dashboard
nobody on this machine can reach. The actions are therefore inverted:

- **"אל תשלמו שוב" is rendered above the actions.** A warning underneath the
  buttons is a warning read after the click it was meant to prevent.
- **The primary action goes to the page that can answer the question.** With an
  `order_id` in the URL that is `/checkout/return?order_id=...`, which
  re-verifies the settlement against the terminal itself. Without one it is
  `/account/orders`.
- **`reset()` is a text link, not a button.** Retrying is legitimate once the
  customer has established nothing was charged, and it must not be what a thumb
  lands on first.

`src/app/(store)/checkout/checkout-error-boundary.test.tsx` asserts the
*ordering* and the *emphasis*, not the wording. The regression it exists for is
a later refactor that unifies this file with `SegmentErrorBoundary` "for
consistency": that would restore the retry button, reintroduce the defect, and
look like a tidy-up in review.

The boundary also tags `has_order_id`, because whether a failure had an order
behind it is the first question in triage and cannot be recovered once the
customer has navigated away.

### One implementation note worth keeping

The checkout boundary reads `order_id` from `window.location` in an effect
rather than with `useSearchParams`. `useSearchParams` puts the route under
Next's "must be wrapped in a Suspense boundary" rule, which a boundary file
cannot satisfy from the inside, and which fails at **build** time rather than
when the page is finally rendered. The first paint does not depend on the id,
and the link falls back to `/account/orders` until the effect has run, so the
primary action is never dead.

## Sentry, and what never reaches it

`sendDefaultPii: false` in all three configs (server, edge, client). A single
`beforeSend` scrubber drops `request.headers` and `request.cookies` **wholesale
rather than key by key**, because those carry the Supabase session and the
Cardcom shared secret.

A voucher token lives in the *path* of `/redeem/<token>`, where a key-based
scrubber cannot see it, so both the server and the client config rewrite the
URL. Session replay is off in both sample rates: it records the DOM, and this
DOM contains addresses, order contents and a voucher QR.

The five error boundaries all report through the plain SDK rather than the
helpers in `lib/observability`. Those run on `@sentry/node` and tag everything
`area=payments`, so importing them into a client boundary would both fail to
bundle and mislabel every UI error as a money-path one.

## Backoff, and why it is not where you would look for it

There is no shared `retryWithBackoff` helper in this repository, and a reader
grepping for one concludes there is no backoff. That conclusion is wrong. **The
retries here are durable rather than in-process**, which is the correct shape
for functions that can be frozen or killed mid-sleep:

- **Cardcom invoices.** `src/server/payments/invoices.ts`. The attempt count
  lives in a database row; `backoffMinutes(attempts) = 2 * 4 ** (attempts - 1)`,
  five attempts, then a dead-letter row. A cron pass is what re-attempts, so a
  cold start loses nothing.
- **Meilisearch.** Delegated to QStash: a non-2xx from the worker is retried
  with exponential backoff up to `QSTASH_RETRIES`, then POSTed to
  `/api/search/index-dlq`.
- **R2.** The AWS SDK's own `standard` retry strategy, three attempts with full
  jitter, retrying throttling and transient 5xx only. As of 2026-09-09
  `getR2Client` states `maxAttempts: 3` and `retryMode: 'standard'` explicitly.
  This changes nothing; it is written down because its absence read as a gap.

**Known, small, and not fixed here:** `backoffMinutes` has no jitter. If a
provider outage fails many invoices in the same pass, they all become due again
in the same minute. Five attempts and a per-row schedule keep that bounded, and
changing money-path retry timing is not something to do in the same commit as a
UI change.

## Graceful degradation

Two examples that are already right and are worth copying rather than
re-inventing:

- **Search.** `/api/search` degrades from the FTS RPC to an ILIKE fallback when
  the RPC is missing, logs the reason, and answers with a code rather than the
  upstream message. A *failed category lookup* is deliberately not treated as
  "no such category": discarding that error silently dropped the filter and
  returned results from every category to a shopper who asked for one, which is
  a wrong answer presented as a correct one.
- **Unconfigured providers.** A cron route that finds its provider unconfigured
  changes nothing, counts no attempt and applies no backoff, so the invoice
  queue does not eat itself while waiting for a Cardcom key.

## What was not built, and why

### The typed `Result` pattern across all services

Not done. It is a repository-wide refactor of every service signature, and the
honest reasons it was not started in this pass are both worth writing down:

1. A second agent is writing to the payments and voucher services on this same
   branch and checkout. A refactor touching every service return type is the
   worst possible thing to run concurrently with that.
2. The value is real but it is not what this codebase is currently losing money
   to. The failures that have actually happened here were a renamed column, an
   unmergeable patch and a stale document, none of which a `Result` type
   catches.

It should be done, service by service, when one agent owns the tree.

### A circuit breaker on external services

**Not done, and shipping one would have been worse than the gap.**

A circuit breaker holds state: how many recent calls failed, and whether the
circuit is open. This application runs as serverless functions on Vercel.
There is no shared memory between invocations, and a fresh instance starts with
its counters at zero, so **an in-process breaker on a platform like this is a
control that appears in the code, appears in the audit, and trips approximately
never.** That is strictly worse than no breaker: it converts a known gap into a
believed-in defence.

A real one here would keep its state in Upstash, which this project already has,
and would need a deliberate decision about what "open" means for each provider:
for Cardcom, refusing to attempt a payment is itself a business decision and not
an engineering default.

What actually exists in place of one, and covers most of the same ground:

- **Durable queues with attempt caps and dead-letter rows**, so a failing
  provider drains into a DLQ rather than being hammered.
- **`/api/cron/health`**, which reports seven dependencies individually and
  deliberately does not page for one that was never configured.
- **Unconfigured means closed**, not retried: routes answer 401 or change
  nothing rather than attempting against a provider with no credentials.
