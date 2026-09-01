# WordPress import: dry run report

Run 2026-09-01. `node scripts/wp-import/xml-fxp-dryrun.mjs`. **Nothing was
written to any database.** Every number below is that command's output or a
query against production.

## Verdict

**Products and categories are ready. Orders cannot be imported from this file at
all, and that is a property of the export format, not a defect to fix.**

## Source

```
refs/wp-export/wp-export.xml                          6008093 bytes
data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml 6008093 bytes
```

Byte-identical, verified with `cmp`. The pipeline reads the first; the brief
names the second. Two copies of one file, so there is nothing to reconcile.

## Mapped

| Entity | Count | Note |
| --- | --- | --- |
| categories | 11 | production currently holds 12 |
| products | 45 | 44 projected active, 1 draft |
| media | 65 | of 404 attachments in the export |
| users | 2 | |
| orders | 41 | **0 line items**, see below |
| coupons | 0 | |
| variations | 2 | |

625 items parsed in total.

## Skipped, with the reason

| Legacy id | Reason | Slug |
| --- | --- | --- |
| 6503 | `status_excluded` | `product-template` |
| 8481 | `status_excluded` | `חופשה-חלומית-באחוזת-דניאל-3-לילות-copy` |
| 8548 | `plugin_bookkeeping_product` | `reverse-withdrawal-payment` |

The third is the interesting one: a WooCommerce bookkeeping artefact, not a
product anybody sold. Importing it would put "reverse withdrawal payment" in the
catalogue.

## The one blocking error

```
ERROR  order/all  no_line_items: 41 orders carry headers only:
       WXR exports posts, and WooCommerce stores line items in tables
```

**This is not fixable from this file.** WXR is a post export. WooCommerce keeps
order line items in `woocommerce_order_items` and `woocommerce_order_itemmeta`,
which are ordinary tables and are not posts, so they are not in the XML. The 41
orders have headers and no contents.

Two honest options, and neither is "try harder on the parser":

1. **Do not import orders.** The 41 are historical records of a site that is
   being replaced. Production holds 4 orders and 3 order items of its own. If
   the business does not need the old order history inside the new system, this
   error is not a blocker, it is a decision.
2. **Get a database dump.** Order line items need `mysqldump` from the old
   host, not a WXR export.

Until one is chosen, item 59's rule holds: the report is not clean, so the
import does not run.

## Needs manual review: 19 recycled slugs

Nineteen products carry a slug that shares no word with the title, because the
post was reused for a different product. Examples:

```
6166  slug שעון-אפל-חכם-apple-watch-series-7   title ארוחת בוקר זוגית בקפה גן סיפור
6181  slug חיתולי-האגיס                        title פלייסטישן 5
6591  slug bar-drink                           title קמפיין ענק בפייסבוק
8812  slug מוצר-לדוגמא                          title תיק עור JEEP יוקרתי
```

Each is a choice, not a bug. **Keeping the slug preserves the old URL and its
search ranking; changing it to match the title needs a 301.** The dry run
deliberately refuses to decide, because the two options trade SEO against
legibility and only the business can weigh that.

`8812` deserves attention on its own: `מוצר-לדוגמא` means "sample product", and
`scripts/compare.mjs` uses that exact slug as its product-page reference.

## Other warnings

- **17 blog taxonomy terms ignored**: `news`, `events`, `podcasts`, `videos` and
  so on are `<wp:category>` blog terms, not `product_cat`. Correctly excluded.
- **`product/6462` hotlinks legacy media**: its description HTML embeds
  `wp-content` URLs on the old domain. Those break at the DNS cutover, when the
  old domain stops serving them.

## Re-running is safe

The generated SQL keys every statement on the UNIQUE slug:

```sql
ON CONFLICT (slug) DO UPDATE SET ...
```

so a second run updates instead of duplicating, and columns not named in the
`DO UPDATE SET` clause, which is where admin edits live, are never clobbered.

That matters here because **this is not a fresh import.** Production already
holds:

```
products    80 total, 45 active
categories  12
suppliers   12
orders       4      order_items 3
```

The export projects 45 products against 45 already active. The overlap is the
reason the slug key is load-bearing rather than a nicety.

## Two locks, and they are not decoration

```bash
node scripts/wp-import/run.mjs                                    # dry run
WP_IMPORT_ALLOW_WRITES=1 node scripts/wp-import/run.mjs --apply   # writes
```

Both must be open. One lock is a typo away from a live import.

## Artefacts

```
wp_import/reports/upserts-fxp.sql     154 prepared statements
wp_import/reports/upserts-fxp.json
```

Reviewable SQL expressing the same projection the pipeline would apply. Not
executed.
