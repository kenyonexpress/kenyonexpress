# The WordPress migration: the map was built, reviewed, and never given a row

Measured 2026-09-09 against production (`ixvwfbuvfxxsjiywhbbb`).

```
select count(*) from public.seo_redirects;   ->  0
```

Zero. Not "a few missing", not "stale": **empty**. Every URL the old
`kenyonexpress.co.il` served returns 404 today, and it has done since the DNS
cutover.

Nothing about that is broken in the usual sense. The machinery around the table
is complete and careful: `src/proxy.ts` looks the path up before the session is
touched, `src/lib/seo/redirects.ts` holds a five-minute in-memory map so the hot
path costs one `Map.get()` and fails OPEN if the table cannot be read,
`normalizePath` folds percent-encoding and NFC so Hebrew compares equal, the
table has an RLS policy scoped to `anon`, a hit counter, and a projection
function. `wp_import` carries twenty-two staging tables and a validation
pipeline. All of it works.

All of it is also empty: every one of those twenty-two tables holds 0 rows. The
pipeline was built, dry-run, documented, and never pointed at production. That
is the finding, and it is the kind that survives review indefinitely, because
every individual piece passes inspection and no piece is responsible for the
whole.

## What running the pipeline today would have written

`wp_import.fn_project_redirects` projects `url_inventory` into `seo_redirects`.
Re-run over the frozen 2026-08-11 crawl it emits **34 rows**, and measured
against production on 2026-09-09, **13 of them are wrong**. Not malformed, not
rejected by a constraint. Accepted, served, wrong.

| what | rows | what the visitor gets |
| --- | ---: | --- |
| category rows aimed at Hebrew slugs | 11 | 301 into a 404 |
| `/blog` marked `page_gone_410` | 1 | 410 on a live page |
| `/product/...₪` between two live duplicates | 2 | one working product hides another |

**The categories.** WooCommerce built its slugs from the Hebrew name, so the old
site served `/product-category/מסעדות-ובתי-קפה`. This database uses English
slugs, `restaurants-cafes`, and always has. Every one of the eleven category
redirects points at a `/category/<hebrew>` path that has never existed here.

A 301 into a 404 is **worse than the 404 it replaces.** Search Console files
the URL under "Page with redirect" and stops reporting it as an error, so the
broken destination never surfaces anywhere a person would look. The 404 at
least shows up in a report.

**`/blog`.** The inventory marked it gone because on 2026-08-11 there was no
blog here. There is now: `src/app/(store)/blog/page.tsx`, with posts and
`Blog` JSON-LD. The proxy answers 410 **before** routing, so the row would not
have been shadowed by the real page, it would have replaced it, with the one
status code that tells a crawler the URL is retired and not to come back.

**The two `₪` products.** `/product/עיסוי-מפנק-לגבר-45-דקות-רק-ב108₪` was to be
301'd to the same slug without the shekel sign. Both slugs are `status='active'`
in production right now. They are the duplicate pair CLAUDE.md blocker #1
records, and which of a duplicate pair is the real one is the operator's
decision. A 301 makes that decision silently and permanently.

**The shape they share.** All three assume the source is dead. The inventory was
frozen on 2026-08-11 and the site kept moving; the projection re-reads the
inventory on every run and never re-asks whether the world still matches it. A
frozen snapshot used as a live predicate is the defect, and it has no symptom
until the moment it is applied.

## What replaced it

`scripts/build-legacy-redirects.mjs`, and one rule:

> A source path that is **live** gets no row, and a target path that is **not
> live** gets no row. Both halves are measured, not asserted.

Liveness is answered three ways, none of them from a list somebody maintains:

- **static routes** are read off `src/app` at build time, so a page added
  tomorrow is known tomorrow. This is what catches `/blog`, and it would have
  caught it on the day the blog was added.
- **products** and **categories** are read from production through the anon key,
  with the predicate recorded in the artefact. `status='active' AND deleted_at
  IS NULL` and not "the row exists": a **draft** product has a row and serves a
  404, so existence is the wrong question.
- **category slugs** are re-resolved. Six of the eleven match by slugifying
  `name_he`; the other five are written out as decisions in `CATEGORY_OVERRIDES`
  because no string rule can know that `יופי-בריאות-וטיפוח` and `טיפוח בריאות
  ויופי` are the same category with its words reordered, and a fuzzy matcher
  that guessed right there would guess wrong somewhere nobody checked.

**The correction does not touch the inventory.** `data/legacy/url-inventory.json`
and `wp_import.url_inventory` are the only surviving record of what the old site
served; a corrected copy of evidence is not evidence. Every departure from it is
recorded in `redirect-map.json` under `excluded`, with the reason next to the
row.

## The map

**33 rows: 20 × 301, 13 × 410.** `data/legacy/redirect-map.json`, seeded by
`migrations/pending/192_seed_seo_redirects.sql`.

Every legacy URL, and what this site does with it:

| | URLs | |
| --- | ---: | --- |
| served unchanged | 51 | same path, same page, no row needed |
| redirected 301 | 20 | 11 categories, 6 pages, 1 product, 2 old home pages |
| gone 410 | 13 | plugin pages and private rows with no equivalent |
| **still 404** | **3** | named below |
| | **87** | |

**The three that still 404**, because a count would have hidden them:

- `/product/restaurants-meat-2` and `/product/restaurants-meat-3` exist as
  **draft** rows. They get no redirect and no 410 **on purpose**: a draft can be
  published, and a 410 is the status code that makes that publication
  unreachable. They 404 today and that is the reversible answer.
- `/product/קופון-טסט` does not exist in `products` at all, at any status. It
  was a test row on the old site.

The generator cannot tell those two cases apart, because the anon key it uses
cannot see drafts by design. It reports all three as `lost` and names them; the
distinction above was measured separately and is an operator decision.

## The gates

`src/lib/seo/legacy-redirects.test.ts`, 14 cases, **no network and no
database** so it runs anywhere:

- every legacy URL lands in exactly one bucket, and the buckets sum to 87
- no source is a live static route, product or category — the rule, enforced
- `/blog` and both `₪` products are named, so a rebuild cannot quietly re-add
  them while the counts still balance
- every 301 target is served by something this repository defines
- every source is stored in the form `normalizePath` produces. It is run through
  the **TypeScript** normalizer, which is where the generator's own copy and the
  proxy's are made to agree. A source stored in any other form is a row no
  request can ever match, and that failure is indistinguishable from a redirect
  nobody configured.
- no chains, no duplicates, 410s carry no target
- the SQL and the JSON agree row for row

`e2e/legacy-redirects.spec.ts` crawls what the unit test cannot reach. The 51
unchanged URLs are asserted unconditionally and pass now. The 33 mapped ones
need rows, so the spec **asks the database** whether the seed is applied and
skips with that as the reason if not — rather than reading a flag a person sets,
which can be wrong in both directions and is wrong silently.

`node scripts/build-legacy-redirects.mjs --check` rebuilds from the same inputs
and exits non-zero on any drift, so a hand edit to either artefact is caught.

## What is not done, and why

**Migration 192 is written and not applied.** Standing rule: nothing runs
against production without an explicit go-ahead. Until it does, the 33 URLs
keep 404ing exactly as they do today — the file changes nothing by existing.
It is data-only, has no DDL, is idempotent, and ends in a `DO` block that
raises unless the active row count is exactly 33.

It **deactivates** rows it does not carry rather than deleting them. Deleting
would throw away `hits`, which is the only evidence of whether a retired URL
still receives traffic; `is_active = false` stops it being served and keeps the
count.

**Images are not in R2, and this is the fourth attempt to say so.** The 66
attachments are downloaded and converted under `wp_import/media/`, and no bucket
exists to put them in:

```
r2_buckets_list -> 403 {"code":10042, "message":"Please enable R2 through the Cloudflare Dashboard."}
```

Measured 2026-09-06 through `scripts/upload-r2.mjs`'s own SigV4 client, twice on
2026-09-08, and again on 2026-09-09 through the Cloudflare MCP connector — a
different code path with different credentials. It is the account, not the
uploader, and there is no way around it because the destination cannot exist.
Under the rule for a goal that sticks twice this is documented and skipped, not
worked around. Full detail in `docs/IMAGE-IMPORT-STATUS.md`; unblocking it is
one dashboard setting and then one command.

**The `wp_import` staging tables stay empty.** Loading them would be a write to
production, and nothing downstream needs them: the redirect builder reads
`data/legacy/`, which is the same crawl with the raw WordPress blobs stripped.

**`/wishlist` and its four siblings stay 410 rather than becoming 301s to
`/account/wishlist`.** That route exists and would serve a human with an old
bookmark. It was not changed because the 410 was the pipeline's reviewed
decision about a per-user page that should never have been indexed, there is no
traffic data to argue with it (`hits` has no rows to count), and re-deciding it
here would be an editorial change dressed as a bug fix. Recorded so the option
is not lost.

## Files

| | |
| --- | --- |
| `data/legacy/url-inventory.json` | 87 URLs, frozen 2026-08-11. Evidence. |
| `data/legacy/products.json` | 45 WooCommerce products |
| `data/legacy/categories.json` | 11 categories, with the Hebrew slugs the old URLs used |
| `data/legacy/images.json` | 66 attachments and their local derivatives |
| `data/legacy/redirect-map.json` | the resolved map, the exclusions with reasons, the sitemap diff |
| `scripts/export-legacy-data.mjs` | promotes `wp_import/normalized/` into the above |
| `scripts/build-legacy-redirects.mjs` | builds the map and the SQL; `--check` fails on drift |
| `migrations/pending/192_seed_seo_redirects.sql` | the seed. Not applied. |
| `src/lib/seo/legacy-redirects.test.ts` | the offline gate |
| `e2e/legacy-redirects.spec.ts` | the crawl |
