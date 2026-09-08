# Per-route cache policy

Required by STEP 14 and previously unwritten. Measured 2026-09-08 against
`closeout/v1-final`, on comment-stripped source.

---

## 1. The thing to understand first

**No route declares its own caching.** Measured:

```
page.tsx files using `dynamic` or `revalidate`   0
page.tsx files using 'use cache' in code         0
```

Caching is a property of the **data functions a route calls**, not of the route.
Ten modules carry `'use cache'`, and a page is cached to the extent that
everything it awaits is:

| module | what it caches |
| --- | --- |
| `lib/product-detail.ts` | the product row and its category |
| `lib/product-seo.ts` | the JSON-LD inputs for a product |
| `lib/related-products.ts` | five siblings by category |
| `lib/category-page.ts` | a category and its products |
| `lib/coupon-deals.ts` | the coupon catalogue |
| `lib/supplier-storefront.ts` | a supplier's public page |
| `lib/feeds/catalogue.ts` | the Merchant and RSS feeds |
| `server/queries/reviews.ts` | approved reviews and the rating summary |
| `app/sitemap.ts` | the sitemap |
| `components/CopyrightYear.tsx` | the footer year |

So "is `/product/x` cached?" is answered by reading `product-detail.ts`,
`product-seo.ts` and `related-products.ts`, not the page file.

> **COUNT THIS ON CODE, NOT ON TEXT.** The first pass at this table said
> sixteen modules. Six of those were COMMENTS: `stock-live.ts`,
> `StockScarcity.tsx`, `homepage/cms.ts` and the product page all discuss
> `'use cache'` in prose while using none. The real number is ten.
> `src/lib/cache-policy.test.ts` recomputes these figures with comments
> stripped and fails if this document drifts from them.

---

## 2. One lifetime and one tag, application-wide

```
cacheLife('hours')        19
cacheLife('days')          1     CopyrightYear.tsx
cacheTag(CATALOGUE_TAG)   19
```

Every cached read in the product surface has the same one-hour life and the
same single invalidation tag, `'catalogue'` (`lib/catalogue-cache.ts`). The
copyright year is the one exception and needs no tag, because nothing
invalidates a year.

**What one tag buys and costs.** It is impossible to invalidate one product: any
catalogue write clears the product pages, the category pages, the coupon
catalogue, the supplier pages, the feeds, the sitemap and the reviews together.
On a 45-product catalogue that is free and simple, and over-invalidation is
always safe - it costs a cache miss, never a wrong answer. It is worth revisiting
when the catalogue is large enough that a full cold rebuild is expensive, and
not before.

**Who invalidates.** Seven modules, and **not all of them are admin**:

```
server/actions/admin/products.ts        6 calls
server/actions/admin/categories.ts      4
server/actions/admin/suppliers.ts       4
server/actions/admin/approvals.ts       2
server/actions/admin/coupon-deals.ts    2
server/actions/admin/reviews.ts         1
server/actions/supplier/profile.ts      1
                                       20
```

**Corrected 2026-09-08.** This list said "four modules, all admin" and totalled
13. Two things were wrong with it. `admin/approvals.ts` was missing although the
prose further down already relies on it - "the approval action *does* call
`updateTag`" - and the five supplier calls were added in maintenance pass 62,
after supplier writes were found never to invalidate at all, without this list
being updated with them.

**"All admin" is the part worth noticing.** `supplier/profile.ts` is a business
editing its own name, address and phone, and it renders inside the product
page's supplier block. The invalidating set is no longer an admin-only concern,
and a reader who took "all admin" as a boundary would look in the wrong place
for the next one.

`src/lib/cache-policy.test.ts` counted `cacheLife` and `cacheTag` - the READ
side - and never `updateTag`, which is why the document could drift here while
the drift test stayed green. It counts both sides now.

---

## 3. Routes that must stay statically renderable

Asserted by `e2e/render-mode.spec.ts`, which fails a route that carries neither
a postponed marker nor a prerender marker:

`/` · `/products` · `/coupons` · `/search` · `/cart` · `/checkout` · `/about` ·
`/contact` · `/faq` · `/accessibility`

**One `await` in `(store)/layout.tsx` undoes all of it.** That file used to
`await createClient()` and `getCart()` before rendering anything, which made
every route in the group request-time from the first byte and uncacheable in
every layer. The cart reads moved to `/api/cart`, fetched by `<CartBootstrap>`
after hydration. The layout's own docblock is the authority; the failure mode is
that nothing breaks, the pages just go dynamic again.

Note that `render-mode.spec.ts` visits `/checkout` without seeding a cart, so
that entry classifies `/cart` - it is one of the two recorded gaps in
`src/__tests__/checkout-bounce-guard.test.ts`.

---

## 4. What is deliberately NOT cached, and why

| thing | why it bypasses the cache |
| --- | --- |
| **live stock** | `lib/commerce/stock-live.ts` reads an indexed RPC on every product view. An hour-old availability figure would keep offering a unit another shopper is holding. The cached level is used only as a cheap test for "is this product tracked at all"; the number shown is always live. |
| **the cart** | `/api/cart`, client-fetched after hydration, precisely so the layout can stay synchronous. |
| **anything under `/admin`** | the admin panel is uncached, which is why a catalogue edit shows there immediately while the storefront lags by up to an hour unless `updateTag` ran. |

**Reviews look like a gap and are not.** `getProductReviews` is cached for an
hour, and the customer-facing submit action does not invalidate the catalogue
tag. It does not need to: the public query filters `status = 'approved'`, so a
new review is invisible until an admin approves it - and the admin moderation
action *does* call `updateTag(CATALOGUE_TAG)`. Approval is the publish moment,
and the publish moment invalidates.

---

## 5. The staleness a shopper can actually see

| surface | worst case | consequence |
| --- | --- | --- |
| product name, price, images | 1 hour | a price edit is late on the storefront and immediate in admin |
| category and coupon listings | 1 hour | same |
| stock figure | none | read live per request |
| cart contents | none | client-fetched |
| approved review | 1 hour from approval, and the approval invalidates, so in practice immediate | |

Overselling is not on this list, and that is the one guarantee worth stating
explicitly: `server/actions/cart.ts` re-reads stock on add, and checkout reads it
again, so a stale catalogue page cannot sell a unit that is gone.
