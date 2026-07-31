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

This first pass used the existing zero-dependency reader,
`scripts/wp-import/lib/xml.mjs`. A second pass on `fast-xml-parser` was then run
deliberately as an independent cross-check, and it is what caught the category
bug below. Both passes are documented here; the second one is the corrected one.

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

Plus, in the channel header, 11 `product_cat` terms, 17 `<wp:category>` blog
terms that are **not** product categories, 43 `product_tag` terms, various `pa_*`
attribute taxonomies, and 2 authors. There are **zero** `shop_coupon` items: the
legacy store had no WooCommerce coupons.

## What the pipeline produced

> **Corrected below.** The category count in this table is wrong, and a second
> independent parser is what proved it. See "Cross-check with fast-xml-parser".
> The real product category count is 11, not 28.

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

The catalog side of the migration is in good shape: 45 products, 11 categories,
65 images, unique slugs, no fake strikethrough prices, no dangling categories, no
password material, no imported consent. One Dokan bookkeeping row is responsible
for every product-level failure. The counts in this paragraph are the corrected
ones; the section below explains why the first pass reported 46, 28 and 66.

Before `--apply`:

1. Exclude `reverse-withdrawal-payment` at extract. Clears 3 gate failures.
2. Add `page` items to `url_inventory` and map the 27 pages. The current
   `redirect_coverage` pass is measuring products and categories only.
3. Supply working Supabase credentials so `live_count_parity` is measured
   instead of unknown.
4. Run the `media` stage so 66 images exist before projection writes their URLs.
5. Decide whether order history is needed. If yes, re-extract from a dump or the
   REST API. WXR will never have line items.

---

# Cross-check with fast-xml-parser

A second, independent reader of the same file:

```
scripts/wp-import/xml-fxp-dryrun.mjs      # fast-xml-parser 5.10.1
node scripts/wp-import/xml-fxp-dryrun.mjs --file refs/wp-export/wp-export.xml
```

The point is not a nicer parser. It is that two implementations reading one file
either agree, in which case the number is a property of the export, or disagree,
in which case one of them has a bug and the disagreement is worth more than
either result alone. Every difference below was chased to a cause.

The script writes nothing to any database. It emits prepared SQL for review.

## Where the two parsers landed

| metric | lib/xml.mjs | fast-xml-parser | correct | why they differ |
| --- | --- | --- | --- | --- |
| categories | 28 | **11** | 11 | the existing reader also ingests the blog taxonomy |
| products | 46 | **45** | 45 | the existing reader imports Dokan's bookkeeping row |
| media | 66 | **65** | 65 | the existing reader keeps one orphan image |
| product slugs | identical | identical | | agree on all 45, after two bugs of mine were fixed |
| users | 0 | 2 | 2 | authors, and they are deliberately not projected |
| orders | 0 | 41 headers | 41 headers | the XML path ignored them; contents are absent from WXR regardless |

## The existing reader imports 17 categories that are not product categories

`readTaxonomy` in `scripts/wp-import/lib/wxr.mjs` reads `<wp:term>` filtered to
`product_cat`, **and then also** reads every `<wp:category>`. Those are different
taxonomies. `<wp:category>` is the blog post taxonomy, and in this export it
holds 17 leftover Electro theme demo terms:

```
aside  design  enterprise  enterprise-de  events  events-de  gadgets
links-quotes  mobile  news  news-de  podcasts  social  technology
uncategorized  uncategorized-en  videos
```

There are exactly 11 real `product_cat` terms:

```
בעלי-מקצוע   hot-deals   טלפונים-מחשבים-ואביזרים   יופי-בריאות-וטיפוח
uncategorized   מסעדות-ובתי-קפה   עד-99   ציוד-ומזון-לבעלי-חיים
צימרים-מלונות-ונופש   קורסים-express   תינוקות-וילדים
```

11 + 17 = 28, which is where the count in the table above came from.

Projecting 28 would put `Podcasts`, `Videos`, `Links & Quotes` and `Gadgets` into
the navigation of a Hebrew storefront. It gets worse than cosmetic: both
taxonomies contain a term slugged `uncategorized`, so the collision handler
renamed one of them, and the earlier run's

```
warn  slug_collision: uncategorized taken, using uncategorized-2
```

is the real product category `כללי` being pushed onto `/category/uncategorized-2`
by a blog term that should never have been read. A gate cannot catch this,
because `products_with_dangling_category` only ever gets stricter when extra
categories exist. Reading two taxonomies as one is invisible to every check the
pipeline has.

## The orphan image

`media` differs by exactly one row, attachment `5324`. It belongs to product
`6503` (`product-template`, status `private`), which the pipeline correctly
excludes from the catalog and whose image it nevertheless keeps in the media
inventory. It would be downloaded, converted to webp and uploaded to storage for
a product that never gets imported. Attachment ids `8454-8457`, belonging to the
other excluded product, are correctly dropped, so the media inventory is built
before status exclusion for at least this one path.

## 18 of 45 products carry a slug that has nothing to do with their title

The largest finding of the cross-check, and it is in the data, not in either
parser:

| wp_id | slug | title |
| --- | --- | --- |
| 6166 | `שעון-אפל-חכם-apple-watch-series-7` | ארוחת בוקר זוגית בקפה גן סיפור |
| 6561 | `pampers-premium-care-diaper-pants-medium` | מארז מפנק לתינוק |
| 6591 | `bar-drink` | קמפיין ענק בפייסבוק |
| 6462 | `barbecue` | מסעדה בשרית |
| 6604 | `restaurants-meat-3` | מוצר ראשי מאסטר Master Product |
| 8812 | `מוצר-לדוגמא` | תיק עור JEEP יוקרתי |
| 6253 | `6253` | חבילת חופשה למאלדיבים - 2 טיסות |

and 11 more, including three slugs ending `-copy` or `-copy-copy`. These are
recycled WordPress posts: an editor replaced the content and WordPress kept the
original `post_name`.

**This is not a broken redirect, and the earlier draft of this document had it
wrong.** WordPress served each product at `/product/<post_name>`, so
`/product/barbecue` already showed `מסעדה בשרית` on the old site. Carrying the
slug over preserves the URL exactly, which is what SEO continuity wants.

The cost runs the other way: the new storefront inherits URLs that misdescribe
their own products, including one product living at `/product/6253` and another
at a slug advertising an Apple Watch while selling a breakfast. Re-slugging from
titles reads better and needs a 301 from every old slug, which the pipeline
already knows how to emit. Either choice is defensible. Neither can be chosen
about rows nobody counted, which is why they are now counted.

## Two bugs this cross-check found in the new script, before it was trusted

Recorded because they are the reason the agreement above means anything.

1. **Wrong element for product categories.** The first run reported 0 categories
   and 45 dangling-category errors. `product_cat` lives in `<wp:term>`;
   `<wp:category>` is the blog taxonomy. Reading the wrong one made every product
   look orphaned. Ironically, chasing this is what exposed the inverse bug in
   `lib/wxr.mjs`, which reads both.
2. **Percent-encoded and unsanitised slugs.** WordPress stores Hebrew slugs
   percent-encoded, so slugs first came out as
   `%d7%a9%d7%a2%d7%95%d7%9f-...`, and after decoding one still ended in `₪`.
   Both would have gone straight into `public.products.slug` and every product
   URL. Fixed by decoding and then stripping to letters, digits and dashes,
   Unicode-aware, with a fallback to a slug built from the title rather than to
   `product-<id>`.

A third difference turned out not to be a bug in either: `content:encoded` and
`excerpt:encoded` collapse to the same key once namespaces are stripped, which
returns an array of two rather than a string. Read as a scalar it yields `null`,
which is how a catalog imports with every description empty and nothing
complains. Handled explicitly, with `excerpt` mapped to `short_description_he`,
a field the existing transform does not populate at all.

## Field mapping, as implemented

| WooCommerce | public.products | note |
| --- | --- | --- |
| `post_title` | `name_he` | |
| `post_name` | `slug` | decoded, sanitised, unique |
| `content:encoded` | `description_he` | raw HTML, see below |
| `excerpt:encoded` | `short_description_he` | |
| `_price`, else `_sale_price`, else `_regular_price` | `price_ils` | |
| `_regular_price` | `compare_at_price_ils` | only when it exceeds the sale price |
| `_sku` | `sku` | |
| `_stock` | `stock_quantity` | |
| `_stock_status` | `status` | `outofstock` projects as `sold_out` |
| `_thumbnail_id` + `_product_image_gallery` | `images` | legacy URLs until media runs |
| first `product_cat` term | `category_id` | resolved by slug subselect |
| none | `platform_percent`, `commission_percent` | from `DEFAULTS`, 10 and 15 |

**`price_ils` is `numeric(10,2)`, not agorot.** The brief asked for
`_price (cents) -> price_agorot (integer)`, and that mapping does not apply here
on either side: WooCommerce `_price` is a decimal string in store currency
(`"199.90"`, not `19990`), and `public.products` has no `price_agorot` column.
The integer-agorot convention is real but belongs to `order_items` and
`coupon_deals`, which this file does not feed. Migration `005` defines
`price_ils numeric(10,2) NOT NULL CHECK (price_ils >= 0)`; the mapping is
decimal to decimal.

Also worth knowing: `products.title_he` was renamed to `name_he` by migration
`016_products_code_sync.sql`, so the column name in `005` is not the current one.
The generated types in `src/types/database.ts` are the reliable source.

## Prepared upsert statements

```
wp_import/reports/upserts-fxp.sql     154 statements
wp_import/reports/upserts-fxp.json    machine-readable counts and issues
```

Contents, in order: 11 category upserts, a second pass for category parents
(WXR does not order terms parent-first), the legacy supplier row, 45 product
upserts, 56 `wp_import.id_map` rows, and 41 archive-only inserts into
`wp_import.orders`.

Every statement keys on the `UNIQUE` slug, so re-running updates rather than
duplicating, and columns absent from each `DO UPDATE SET` are never clobbered.
The file opens with `BEGIN;` and closes with `COMMIT;`.

Three things it deliberately does not do:

- **No `auth.users` inserts.** The 2 authors are listed as SQL comments only.
  Passwords are never migrated, `auth.users` is written through the admin API
  rather than SQL, and imported people start opted out. Legacy accounts arrive
  through the password reset flow.
- **No projection of orders.** They go to `wp_import.orders` and stay there.
- **No image rewriting.** `products.images` holds legacy `kenyonexpress.co.il`
  URLs. Applying this file before the `media` stage leaves the new catalog
  hotlinking the old site, and one product (`6462`) additionally embeds
  `wp-content` URLs inside its description HTML.

This SQL is a review artifact. The supported way to write is still
`WP_IMPORT_ALLOW_WRITES=1 node scripts/wp-import/run.mjs --apply`, which also
maintains the migration log and supports `fn_rollback_batch`.

## Revised blocker list

1. Fix `readTaxonomy` to stop reading `<wp:category>`. Until then a real import
   creates 17 junk categories and displaces `כללי` to `uncategorized-2`.
2. Exclude `reverse-withdrawal-payment` at extract.
3. Build the media inventory after status exclusion, dropping orphan `5324`.
4. Add the 27 pages to `url_inventory`. `redirect_coverage` currently scores
   products and categories and reports a total.
5. Decide the slug question for the 18 recycled products: keep for URL
   continuity, or re-slug plus 301.
6. Working Supabase credentials, so `live_count_parity` is measured.
7. Run `media` before `project`.
8. Decide whether order line items matter. If yes, the source must be a dump or
   the REST API.
