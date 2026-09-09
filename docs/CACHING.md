# Caching

Measured 2026-09-09 against the working tree.

## This project does not use `export const revalidate`

`next.config.ts` sets `cacheComponents: true`. There is **no `export const
revalidate` anywhere in `src/`**, and `export const dynamic = 'force-dynamic'`
does not work here either. Caching is expressed with the `'use cache'`
directive plus `cacheLife()` and `cacheTag()` from `next/cache`.

Anyone auditing this by looking for ISR exports concludes there is no caching.
There are twenty cached scopes.

## The twenty scopes

| Where | Life | Tag |
| --- | --- | --- |
| `lib/category-page.ts` (7 scopes) | `hours` | `CATALOGUE_TAG` |
| `lib/supplier-storefront.ts` (3) | `hours` | `CATALOGUE_TAG` |
| `lib/coupon-deals.ts` (2) | `hours` | `CATALOGUE_TAG` |
| `lib/product-detail.ts` (2) | `hours` | `CATALOGUE_TAG` |
| `lib/related-products.ts`, `lib/product-seo.ts`, `lib/feeds/catalogue.ts` | `hours` | `CATALOGUE_TAG` |
| `server/queries/reviews.ts`, `app/sitemap.ts` | `hours` | `CATALOGUE_TAG` |
| `components/CopyrightYear.tsx` | `days` | none |

Nineteen of the twenty are `cacheLife('hours')` and carry one tag. Search, cart,
checkout and the whole account and admin area are uncached, which is what
SECTIONS 16 asked for by calling them dynamic.

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

**Partly present, and not extended here.** `/api/search` sets
`Cache-Control: public, s-maxage=30, stale-while-revalidate=60`, uploads to R2
are written with `cacheControl: '31536000'`, and Next sets immutable headers on
`/_next/static` itself. A blanket per-type header policy in `next.config.ts` was
not added, because the two surfaces that would benefit are already covered and
the rest are dynamic.

### "Stampede protection"

**Already provided by the framework, and not re-implemented.** `use cache`
deduplicates concurrent misses for the same key, and `cacheLife` carries a
`stale` window during which a served entry is refreshed in the background rather
than made to wait. Writing a lock in front of that would add a failure mode
without removing one.
