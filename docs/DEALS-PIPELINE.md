# The deals-autopilot pipeline

Section 96. Written 22.09.2026. Feature-flagged (`DEALS_AUTOPILOT`, default
off) and behind its own migration (`migrations/pending/237_deals_autopilot.sql`,
not applied).

## What this is not

The goal that asked for this named it "AUTO DEALS SYSTEM" against "Israeli
sources," and read literally that could mean a scraper: fetch other Israeli
deal sites, parse their listings, republish their prices and photos as
KenyonExpress's own. **That was refused before any code was written.**
Scraping a competitor and republishing its content and images is a real legal
and ethical exposure with no supplier relationship behind it, and nothing
about a coupon marketplace requires it: every deal this platform has ever
sold came from a supplier who agreed to sell it here.

## What this is

A supplier-fed ingestion queue. Two ways a deal candidate can reach it, both
opt-in and both traceable to a specific supplier account:

1. **A feed.** A supplier sets `feed_url` (must be `https://`) and
   `feed_format` (`json` or `csv`) on their own supplier record, from
   `/supplier/settings`. Every 6 hours, `GET /api/cron/deals-autopilot`
   fetches that URL -- and only that URL; the route never constructs one --
   parses it, and queues whatever validates.
2. **Manual submission.** The same settings page has a form for one deal at
   a time, no feed required. It writes to the same table with `source =
   'manual'`, through the supplier's own session and RLS, not the cron path.

"Israeli sources only" is satisfied by construction: every source is one of
this platform's own onboarded, Israeli suppliers. There is no path from this
feature to any URL a supplier did not put in their own settings.

## Why a staging table, not a write to `products`

A feed can supply a name, a price, a discount, a link, free-text category and
an image. It cannot supply `platform_percent`, and `docs/BUSINESS-RULES.md`
§4.1 is explicit that this field **has no default anywhere in the system** --
`assertPublishable` (`src/lib/commerce/product-money.ts`) refuses to publish
without it, and `enforce_product_approval` (migration 052) refuses to
activate a product without approval either. A commission rate is a decision
this platform's owner makes about a supplier relationship; it is not a
supplier's to set for themselves by shaping their feed, and it is not a rate
this pipeline could safely default.

So a fetched or manually submitted candidate can only ever reach
`deal_candidates` with `status = 'pending_review'`. `ingestCandidates`
(`src/lib/deals-autopilot/ingest.ts`) will not touch a row an admin already
moved to `approved` or `rejected` -- a re-fetch six hours later cannot
silently reopen or overwrite a decision, or change the price under a product
that may already have been created from it.

## What "approved" means today, and what it deliberately does not yet do

An admin reviewing the queue can mark a candidate `approved` or `rejected`,
with a reason recorded (`reviewed_by`, `reviewed_at`, `rejection_reason`).
**`approved` does not, by itself, create a `public.products` row.** Turning
an approved candidate into a live product needs `platform_percent`, a real
`category_id` (a feed's free-text `category_text` is not guaranteed to name
anything in this catalogue's own category tree), and a `type`
(`physical`/`coupon`/`recurring`) -- three fields only a human can respon-
sibly supply, and the codebase's own product form
(`src/server/actions/admin/products.ts`) already validates and writes all of
them correctly, with `enforce_product_approval` and `assertPublishable` as
the backstop.

This was a deliberate scope decision, not an oversight: reusing that
existing, tested, money-adjacent write path safely needs its own dedicated
integration and verification pass, and this session chose not to rush a
second, parallel product-insert path that might not honour every one of
those invariants identically. Until that pass happens, "approved" means "an
admin has vetted this candidate as legitimate and ready to become a
product," and creating the product is a manual next step using the
candidate's fields as reference.

**When that integration is built**, it is a Server Action (an admin
approving in their own dashboard session), so it should call
`updateTag(CATALOGUE_TAG)` directly on publish -- the same convention every
other admin approval flow in this codebase already follows
(`src/lib/catalogue-cache.ts`) -- not the `/api/revalidate` route. That route
exists for a caller that is NOT a Server Action (this pipeline's own cron
fetch is exactly that shape, which is why it was built in the same session);
the interactive approve action doesn't need it.

## The pieces

| File | What it does |
|---|---|
| `migrations/pending/237_deals_autopilot.sql` | `suppliers.feed_url`/`feed_format`, the `deal_candidates` table, its RLS |
| `src/lib/deals-autopilot/types.ts` | The feed-entry zod schema and the parsed-candidate shape |
| `src/lib/deals-autopilot/parse.ts` | `parseJsonFeed` / `parseCsvFeed`, pure, no I/O |
| `src/lib/deals-autopilot/ingest.ts` | Upserts parsed candidates, skipping already-decided rows |
| `src/app/api/cron/deals-autopilot/route.ts` | The 6-hourly fetch, gated on `DEALS_AUTOPILOT` |
| `src/server/actions/supplier/deals-feed.ts` | `updateFeedConfig`, `submitManualDeal` |
| `src/components/supplier/DealsFeedForm.tsx`, `ManualDealForm.tsx` | The two forms on `/supplier/settings` |

## The feed format a supplier sends

JSON: either a bare array, or `{ "deals": [...] }`. CSV: RFC 4180, a header
row naming the same fields. Every entry:

| Field | Required | Notes |
|---|---|---|
| `name` | yes | |
| `price` | yes | ILS, decimal string or number, > 0 |
| `full_price` | no | Dropped (not an error) if not actually above `price` |
| `discount_percent` | no | 0-100 |
| `link` | yes | Must be `https://` |
| `category` | no | Free text; mapped to a real category at review time |
| `image` | no | Must be `https://` if present |
| `external_ref` | no | The feed's own id; derived from name+link if absent, so a re-fetch of an unchanged entry updates one row rather than duplicating it |

Money never crosses the boundary as a float: `price`/`full_price` are
validated as plain ILS and converted through
`src/lib/admin/bulk-price.ts`'s `catalogueIlsToAgorot` (the same integer-safe
path the admin product form's own CSV importer uses), never inline.

A row that fails validation is rejected individually and logged; one bad row
in a feed does not fail the other 199. A feed is capped at 500 entries per
fetch.

## Operational notes

- **Timeout per supplier, not per run.** One slow or unreachable feed cannot
  starve the other suppliers' slot in the same 6-hour cycle.
- **No cache invalidation from this pipeline.** Nothing it writes
  (`deal_candidates`, `suppliers.feed_url`) is read by any `CATALOGUE_TAG`-
  cached query, so there is nothing for it to invalidate -- see the
  `DELIBERATE_EXCEPTIONS` entry for `src/server/actions/supplier/deals-feed.ts`
  in `scripts/cache-invalidation-scan.mjs`.
- **`scripts/cron-jobs.json`** carries `deals-autopilot` at `0 */6 * * *`,
  the single source of truth `src/__tests__/cron-schedule-inventory.test.ts`
  checks `.github/workflows/cron.yml` and `docs/CRON-EXTERNAL.md` against.
