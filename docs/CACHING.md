# Caching

Measured 2026-09-09 against the working tree, **re-measured 2026-09-10**: the
scope count below was twenty and is thirty, and the gate that enforces the
contract had never looked at a route handler. Both are corrected in place, with
the old numbers kept where the reasoning depends on them.

## This project does not use `export const revalidate`

`next.config.ts` sets `cacheComponents: true`. There is **no `export const
revalidate` anywhere in `src/`**, and `export const dynamic = 'force-dynamic'`
does not work here either. Caching is expressed with the `'use cache'`
directive plus `cacheLife()` and `cacheTag()` from `next/cache`.

Anyone auditing this by looking for ISR exports concludes there is no caching.
There are twenty cached scopes.

## The thirty scopes

| Where | Life | Tag |
| --- | --- | --- |
| `lib/category-page.ts` (7 scopes) | `hours` | `CATALOGUE_TAG` |
| `lib/supplier-storefront.ts` (3) | `hours` | `CATALOGUE_TAG` |
| `lib/coupon-deals.ts` (2) | `hours` | `CATALOGUE_TAG` |
| `lib/product-detail.ts` (2) | `hours` | `CATALOGUE_TAG` |
| `lib/related-products.ts`, `lib/product-seo.ts`, `lib/feeds/catalogue.ts` | `hours` | `CATALOGUE_TAG` |
| `server/queries/reviews.ts`, `app/sitemap.ts` | `hours` | `CATALOGUE_TAG` |
| `components/CopyrightYear.tsx` | `days` | none |

**Re-measured 2026-09-10: thirty scopes across thirteen files**, counting only
lines that are the `'use cache'` directive itself. The ten that arrived since
09-09 are `lib/seo/sitemap-data.ts` (3), `lib/homepage/rails.ts` (3),
`lib/content/read.ts`, `lib/commerce/phases.ts`, and one more in
`lib/category-page.ts`, which is now 8.

**Every one of the thirty carries `cacheTag(CATALOGUE_TAG)` except
`CopyrightYear`**, which holds no table data and therefore has nothing a write
could make stale. There is exactly one tag in the whole tree - 33 `cacheTag`
calls, all of them `CATALOGUE_TAG` - which is the deliberate choice the next
section argues for.

**Counting by grep is a trap worth naming**: `grep "'use cache'"` answers 37,
because seven of the hits are prose in comments explaining the directive. Two of
those sit in `lib/commerce/stock-live.ts` and `lib/homepage/cms.ts`, which cache
nothing at all - the first deliberately reads stock live, and the second explains
why it cannot read a clock. An audit that counted those would report two cached
scopes that do not exist.

Search, cart, checkout and the whole account and admin area are uncached, which is
what SECTIONS 16 asked for by calling them dynamic.

## One tag for the whole catalogue, on purpose

Editing one product's price invalidates the homepage, every category, every
supplier storefront, the sitemap, the product feed and the reviews. That is
blunt and it is the right trade for a catalogue of this size.

The failure mode of per-surface tags is not a slow cache, it is a **missed
surface**: a category listing that embeds a price, tagged separately, and
forgotten. A single tag cannot be got wrong that way. Revisit it when the
catalogue is large enough that a full flush costs more than a missed
invalidation, which is not now.

## The contract, and what now enforces it

`src/lib/catalogue-cache.ts` states it in capitals:

> EVERY WRITE PATH THAT CHANGES WHAT A SHOPPER SEES MUST CALL
> `updateTag(CATALOGUE_TAG)`. A product saved without it stays invisible on the
> storefront for up to an hour, the admin sees their own change in the panel
> (which is uncached), and nothing anywhere reports a problem. That failure is
> silent, it is slow, and it looks like a database issue rather than a caching
> one.

**It was written down in full and nothing checked it.** Measured 2026-09-09:
`server/actions/admin/suppliers.ts` updates `suppliers` on edit, on status
change and on soft delete, and called no `updateTag`. `supplier-storefront.ts`
reads that table inside `use cache` and selects `status` and `deleted_at` so it
can return null for an inactive or removed supplier, but **that filter runs when
the entry is built**. So deactivating or soft-deleting a supplier left its public
page serving, with its address and phone on it, for up to an hour.

The file called `revalidatePath('/admin/suppliers')`, which refreshes the admin
list. That is the one surface where the operator could already see their change,
so the omission looked like it had worked.

`scripts/cache-invalidation-gate.mjs` now enforces the contract in `pnpm lint`.
It derives the table list **out of the cached source** rather than from a list
typed into the gate, because a hand-kept list drifts the day somebody caches a
new table, and the drifted-away table is exactly the one nobody remembers to
invalidate.

### It was enforcing the contract on one directory, 2026-09-10

**The scan read `src/server/actions` and nothing else, and reported clean.** Every
route handler, cron route and payment module was outside it. That is not a
theoretical hole: the one writer outside the actions tree is
`src/app/api/cron/price-schedule/route.ts`, which UPDATEs `products.kenyon_price`
on a schedule. A stale price there is the worst kind on this site - the grid shows
one figure and the checkout charges another - and it runs with no operator
watching. It invalidates correctly, and nothing in the repository was checking
that it did.

The roots are now `src/server/actions`, `src/server/payments`, `src/server/domain`
and `src/app/api`. Widening them required fixing the pattern first: it demanded a
closing paren immediately after the tag, so `revalidateTag(CATALOGUE_TAG, 'hours')`
- the correct call in a route handler, with the profile argument the cron route
passes - would have been reported as an offender. A gate that fails on correct
code teaches people to re-run it rather than read it.

### And the other half of the contract: a scope with no tag

`untaggedCachedScopes()` fails a `'use cache'` scope that carries no `cacheTag`.
Such a scope can only expire on its own timer, and **no write path can flush it,
because there is nothing to name** - the same silent staleness arriving from the
other direction, and the easier one to write by accident: a cached reader copied
from a neighbour, minus one line. `CopyrightYear` is the one exemption, with its
argument in `UNTAGGED_ON_PURPOSE`, and a fixture under
`scripts/__fixtures__/untagged-cache/` proves the check fires rather than being
green because there is nothing to find.

### `updateTag`, not `revalidateTag`

`updateTag` expires the entry immediately and makes the next request wait for
fresh data, so an admin who saves a product and opens the storefront sees the
product. `revalidateTag` would serve them the stale copy once, which reads
exactly like the save having failed. `updateTag` is only callable from a Server
Action; a route handler must use `revalidateTag`.

### The three writes that deliberately do not invalidate

1. **`server/payments/finalize.ts`** decrements stock on every purchase.
   Flushing the catalogue on every sale would empty the cache exactly when the
   shop is busy. The cost is bounded: an archive card can show a stock figure up
   to an hour old, and the cart re-reads `stock_quantity` live on add and the
   checkout re-reads it again, so a stale card can mislead about availability and
   **can never oversell**.

   **The gate does not see this one, and cannot.** The decrement goes through
   `admin.rpc('consume_order_stock', ...)`, and the gate matches
   `.from('table')` followed by a mutation. Every write hidden behind an RPC is
   invisible to it. That limitation is stated in the gate's own header and is
   repeated here because this is the most important write it misses: the
   argument for this exception lives in `src/lib/catalogue-cache.ts` and in
   `finalize.ts`, and nothing mechanical is holding it.

2. **`server/actions/admin/images.ts`** inserts a `media_assets` row for a
   freshly uploaded image. The cached reader looks assets up by URL, and a new
   asset is on no product until a separate save through `admin/products.ts`,
   which does invalidate.
3. **`server/actions/reviews.ts`** inserts with no `status`, taking migration
   154's `NOT NULL DEFAULT 'pending'`. The cached read filters
   `status = 'approved'`, so a fresh review is invisible until an admin approves
   it, and `admin/reviews.ts` invalidates at that moment.

Two and three are in the gate's `DELIBERATE_EXCEPTIONS`, each with its argument
there and the same argument in the file itself, so neither can be changed
without the other being noticed.

## What SECTIONS 16 asked for and did not get

### "Product ISR 60s, category ISR 300s"

**Not done, and it would have been a regression.**

Those numbers describe a system where the cache expires on a timer because
nothing can tell it when the data changed. This one is tag-invalidated: an admin
edit calls `updateTag` and the entry is gone immediately, so the TTL only ever
governs changes made **outside the application**: a direct database write, or a
migration. Dropping product pages from an hour to sixty seconds would multiply
origin reads by sixty and shorten that one window, which is not a window
anything currently writes through.

The lever that actually protects freshness here is the gate above, not the
number. It is worth revisiting if direct database edits ever become routine.

### "Redis hot queries, TTL invalidation on write"

**Not done.** Upstash is in this project and is used for rate limiting. A second
cache layer in front of the one Next already maintains would need its own
invalidation on every write path (the same contract as above, doubled, with a
second way to get it wrong) and no measurement here shows the Next cache
missing often enough to justify that. The honest statement is that nobody has
measured a hit rate; that measurement should come before the layer.

### "CDN headers per asset type"

**Re-measured on production 2026-09-10, and one type was wrong.** The 09-09 note
below said the surfaces that would benefit were already covered. They were not:

```
/_next/static/chunks/*.js     public,max-age=31536000,immutable      Next itself
/images/logo.webp             public, max-age=0, must-revalidate     the default
/favicon.ico                  public, max-age=0, must-revalidate     the default
/api/search?q=...             public                                 see below
/                             public, max-age=0, must-revalidate     age: 90243
```

Content-hashed output is handled by the framework. **Files under `public/` are not
hashed, got the platform default, and were therefore revalidated by every visitor
on every navigation** - a conditional request per logo, per hero image, per page
view. `next.config.ts` now sets
`public, max-age=0, s-maxage=86400, stale-while-revalidate=604800` on
`/images/:path*`.

**Not `immutable`, and that is the whole decision.** A `public/` filename is
stable across deploys, so a long browser max-age pins whatever a visitor already
holds with no way to bust it: the day a logo changes, some browsers keep the old
one until it expires. `max-age=0` keeps the browser asking, `s-maxage` lets the
CDN answer for a day and a deploy purges it, and `stale-while-revalidate` makes
the week after that instant rather than a wait.

Verified against a real server rather than in the config alone: `pnpm build` then
`PORT=3319 pnpm start` answers `/images/logo.webp` with the new header and
`/_next/static/...` unchanged. `src/__tests__/asset-cache-headers.test.ts` holds
the config side, including the two ways it could go wrong - `immutable` copied
down from the line above, and a second `Content-Security-Policy` key that would
undo the payment-frame exception through the intersection rule.

**Two rows above are not header policy and are worth reading as what they are.**
`/api/search` answers `public` on production while the source sets
`s-maxage=30, stale-while-revalidate=60`; that line landed on 09-04 and the served
deployment predates it (`docs/DEPLOYMENT.md`, and the seven 404 cron routes in
`docs/OWASP-TOP-10.md` §A09 are the same fact). And the home page is an
`x-vercel-cache: HIT` with `age: 90243` - a 25-hour-old edge copy of a build
nobody can redeploy from here.

Uploads to R2 are still written with `cacheControl: '31536000'`, which is correct:
those keys are content-addressed.

### "Stampede protection"

**Already provided by the framework, and not re-implemented.** `use cache`
deduplicates concurrent misses for the same key, and `cacheLife` carries a
`stale` window during which a served entry is refreshed in the background rather
than made to wait. Writing a lock in front of that would add a failure mode
without removing one.
