# WXR dry run, 2026-07-29 export

The first dry run of the import pipeline against the **real** WordPress export
rather than the synthetic fixture.

- source: `refs/wp-export/wp-export.xml`, 5.7 MB, WXR 1.2, WordPress 6.8.1,
  generated 2026-07-29 19:47 from `https://kenyonexpress.co.il`
- command: `node scripts/wp-import/run.mjs extract --source xml --file <path>`
  then `transform`, then `validate`
- mode: DRY RUN throughout. Nothing was written to any database.
- result: **BLOCKED**, 4 gates failed. Two of the four are environmental, one is
  a false positive, one is real.

No parser was added. `scripts/wp-import/lib/xml.mjs` already reads WXR with zero
dependencies, so `fast-xml-parser` would have been a second parser for a job the
repo already does.

## What is in the export

625 `<item>` elements:

| post_type | count |
| --- | --- |
| attachment | 404 |
| nav_menu_item | 55 |
| product | 48 |
| shop_order | 41 |
| page | 28 |
| elementor_library | 20 |
| itsec-dash-card | 10 |
| acf-field | 5 |
| shop_order_refund | 4 |
| wp_global_styles | 2 |
| product_variation | 2 |
| custom_css | 2 |
| jet-engine, itsec-dashboard, elementor_snippet, acf-field-group | 1 each |

Plus 28 `product_cat` terms and 2 authors in the channel header. There are
**zero** `shop_coupon` items: the legacy store had no WooCommerce coupons.

## What the pipeline produced

| entity | rows |
| --- | --- |
| categories | 28 |
| products | 46 |
| media | 66 |
| url_inventory | 76 |
| customers | 0 |
| orders | 0 |
| order_items | 0 |
| coupons | 0 |

48 products minus 2 `private` ones leaves 46. Product statuses in the export are
45 `publish`, 2 `private`, 1 `draft`.

66 media rows is correct and not a loss: of 404 attachments only 66 are
referenced by a product, as 41 `_thumbnail_id` values plus 33
`_product_image_gallery` ids, with overlap. The other 338 attachments belong to
pages, Elementor templates and the old theme.

## The four failed gates

### 1. `no_blocking_issues` 2, and `products_without_category` 1: false positive

Both point at the same row, and it is not a product:

```
wp_id 8548  reverse-withdrawal-payment  "Reverse Withdrawal Payment"
content: "This is Dokan reverse withdrawal payment product, do not delete."
```

Dokan creates this hidden product as an accounting mechanism for clawing back
vendor balances. It has price 0, no `product_cat` term, and no image, which is
why it trips three separate gates at once. It is the only offender behind every
product-level failure in this run.

It must not become a draft product in the new catalog. It must be excluded at
extract time, the same way `private` status already is. The fix belongs in
`config.mjs` as an explicit skip list rather than in transform logic, so the
exclusion is reviewable:

```js
// products WooCommerce plugins create for their own bookkeeping
excludeProductSlugs: ['reverse-withdrawal-payment'],
```

With that one row excluded, every product gate passes and `no_blocking_issues`
goes to 0.

### 2. `media_uploaded` expected 66, actual 0: expected, stage not run

The `media` stage needs `sharp` and a storage target, and was deliberately not
run. This gate will stay red until `media` runs. It is not a data problem.

### 3. `live_count_parity` unknown: no database

No `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in this worktree, so live counts
could not be read. The pipeline correctly refuses to score an unmeasured gate as
a pass. This is the same stale-key blocker that affects the other scripts.

## The real gap this run exposed: 27 pages have no redirect

`url_inventory` has 76 rows, and every one of them is a product (49) or a
category (27). Not one of the 27 published `page` items is in it, so the
`redirect_coverage` gate passes at 76/76 while silently scoring an inventory
that never included pages.

These old paths are indexed and will 404 on cutover:

```
/privacy-policy/        /terms-and-conditions/   /refund_returns/
/about/                 /contact/                /shop/
/my-account/            /track-your-order/       /cart/
/checkout/              /blog/                   /store-directory/
/coupon-scanner/        /affiliate-area/         /my-orders/
/wishlist/              /compare/                /recently-viewed/
/dashboard/             /store-listing/          /error-payment-payplus/
```

Plus 5 more, including two percent-encoded Hebrew page slugs and the site root.

This violates the pipeline's own rule, "No old URL 404s. Every old path gets a
301 target, a direct match, or an explicit 410." The rule was enforced for
products and categories only. Legal pages like `/privacy-policy/` and
`/terms-and-conditions/` need real targets; store plumbing like `/cart/` and
`/my-account/` maps onto existing routes; dead ends like
`/error-payment-payplus/` should be an explicit 410.

Fixing this means teaching the WXR reader to emit `page` items into
`url_inventory`, and adding a page mapping table to config. Until then the
`redirect_coverage` gate is measuring a subset and reporting a total.

## Orders cannot be migrated from this file, at all

41 `shop_order` items are present and the XML extractor ignores them, which is
why `orders` is 0. That omission hides a harder fact: **WXR cannot carry order
contents.** Every order item in this export has billing and totals meta:

```
_order_key  _customer_user  _payment_method  _billing_first_name
_billing_last_name  _billing_email  _billing_phone  _order_currency
_cart_discount  _order_shipping  _order_tax  ...
```

and **no line-item meta whatsoever**. WooCommerce stores line items in
`wp_woocommerce_order_items` and `wp_woocommerce_order_itemmeta`, which are
tables, not posts, and WXR exports posts. So what each of those 41 orders
actually contained does not exist in this file.

Consequences:

- Order history is recoverable as headers only: who, when, how much, paid how.
  Not what was bought.
- `_customer_user` gives the legacy customer id per order, but the WXR channel
  header exports only the 2 **authors**, not customers. There is no customer
  roster in this file either, which is why `customers` is 0.
- If order line items matter, the source must be a mysqldump or the WooCommerce
  REST API (`--source dump` or `--source rest`), both of which the pipeline
  already supports. This is the reason those code paths exist.

Since historical orders are archive-only by rule and are never projected into
live commerce tables, this does not block cutover. It does mean a WXR-only
migration cannot answer "what did this customer buy from us."

## Verdict

The catalog side of the migration is in good shape: 46 products, 28 categories,
66 images, unique slugs, no fake strikethrough prices, no dangling categories,
no password material, no imported consent. One Dokan bookkeeping row is
responsible for every product-level failure.

Before `--apply`:

1. Exclude `reverse-withdrawal-payment` at extract. Clears 3 gate failures.
2. Add `page` items to `url_inventory` and map the 27 pages. The current
   `redirect_coverage` pass is measuring products and categories only.
3. Supply working Supabase credentials so `live_count_parity` is measured
   instead of unknown.
4. Run the `media` stage so 66 images exist before projection writes their URLs.
5. Decide whether order history is needed. If yes, re-extract from a dump or the
   REST API. WXR will never have line items.
