/**
 * The cache tags the storefront's catalogue reads carry, and the contract that
 * comes with them.
 *
 * Before these existed, every catalogue read went through the request-scoped
 * Supabase client and hit the database on every single page view, so an edit in
 * the admin was visible on the storefront the moment it was saved - not because
 * anything invalidated anything, but because nothing was ever cached.
 *
 * That is no longer true. `getShopProducts`, `getCategoryProducts`,
 * `getAllCategories` and the rest now run inside `use cache`, and a cached
 * answer outlives the write that should have changed it.
 *
 * SO: EVERY WRITE PATH THAT CHANGES WHAT A SHOPPER SEES MUST CALL
 * `updateTag(CATALOGUE_TAG)`. A product saved without it stays invisible on the
 * storefront for up to an hour, the admin sees their own change in the panel
 * (which is uncached), and nothing anywhere reports a problem. That failure is
 * silent, it is slow, and it looks like a database issue rather than a caching
 * one, which is why it is written here in full rather than left to be inferred
 * from a tag string.
 *
 * `updateTag` and not `revalidateTag`: it expires the entry immediately and
 * makes the next request wait for fresh data, so an admin who saves a product
 * and opens the storefront sees the product. `revalidateTag` would serve them
 * the stale copy once, which reads exactly like the save having failed.
 * `updateTag` is only callable from a Server Action; the write paths here all
 * are. A route handler that ever needs this must use `revalidateTag`.
 *
 * The write paths that call it: `admin/products.ts` (save, archive, restore,
 * recategorise, bulk reprice, delete), `admin/categories.ts`, and
 * `admin/approvals.ts` - approval is the write that puts a product ON the
 * storefront, so it is the one that must never be missed.
 *
 * ONE WRITE PATH DELIBERATELY DOES NOT INVALIDATE: `server/payments/finalize.ts`
 * decrements `stock_quantity` after every purchase. Invalidating the whole
 * catalogue on every sale would leave the cache empty exactly when the shop is
 * busy, which is the opposite of what it is for. The cost is that an archive
 * card can show a stock figure up to an hour old, and that cost is bounded: the
 * cart re-reads `stock_quantity` live on add (`server/actions/cart.ts`, an
 * uncached anon read) and the checkout re-reads it again, so a stale card can
 * mislead about availability and can never oversell. It is also not a Server
 * Action, so it could not call `updateTag` even if this were wrong.
 */
export const CATALOGUE_TAG = 'catalogue'
