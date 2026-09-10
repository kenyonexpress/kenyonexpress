# Image import: built, staged, and blocked on one account setting

**Re-measured 2026-09-10, and the section's real subject turned out to be broken
in production. Read `## 2026-09-10` at the bottom first.** The rest is the 09-09
account and stays as written, with one bullet corrected where a file it said did
not exist does.

Measured 2026-09-09. SECTIONS 20 asked for `scripts/import-images.ts` and ended
with "Run it." **It cannot be run, the reason is not in this repository, and the
work it asked for already exists under different names.**

## The block, confirmed today from a second direction

```
r2_buckets_list -> 403 {"code":10042,
                        "message":"Please enable R2 through the Cloudflare Dashboard."}
```

R2 is not enabled on the Cloudflare account. That was measured 2026-09-06
through `scripts/upload-r2.mjs`'s own SigV4 client, twice more on 2026-09-08,
and again on 2026-09-09 **through the Cloudflare MCP connector**, which is a
completely different code path with different credentials. It is the account,
not the uploader.

This is the third distinct attempt, so under the standing rule for a goal that
sticks twice it is documented here and skipped rather than worked around. There
is no way to work around it: the destination bucket cannot exist.

**What unblocks it:** enable R2 in the Cloudflare dashboard and name a bucket.
Then it is one command.

## What already exists, and it is not a stub

Two pipelines, both complete, both dry-runnable, neither one a `import-images.ts`:

### `scripts/ingest-live-assets.mjs` + `scripts/upload-r2.mjs`

Crawls the live site, downloads assets, converts, and stages them for R2.
Verified by dry run 2026-09-09:

```
upload-r2: 375 objects, 8.0MB
  prefix: live-assets/
  skipping 7 quarantined Electro/vendor assets
  Content-Type per extension; Cache-Control "public, max-age=31536000, immutable"
```

The uploader signs SigV4 by hand in about sixty lines of `node:crypto` rather
than pulling ~20MB of `@aws-sdk/client-s3` for one `PutObject`, which is the
same trade this repository already made for blurhash.

### `scripts/wp-import/06-media-sync.mjs`

The WordPress attachment pipeline. **Content-addressed end to end**: the storage
key embeds the sha256 of the original bytes, so a crashed run recomputes the
same keys and overwrites the same objects. That is the section's "resumable via
checkpoint file, idempotent" requirement met by a stronger mechanism than a
checkpoint file, which can itself go stale.

In a dry run everything except the upload and the database write still happens:
bytes are fetched, hashed and converted locally. That is how you find out that
300 attachments 404 on the old site **before** cutover day.

## Where the two differ from the section, on purpose

The section asked for AVIF and WebP at **480 / 768 / 1200 / 1440**. Neither
pipeline uses that set, and both have a better reason than the list does.

| Pipeline | Widths | Why |
| --- | --- | --- |
| `ingest-live-assets.mjs` | 380, 768, 1440, 2000 | The project's own parity breakpoints. `scripts/compare.mjs` measures at 380, 768 and 1440, so these are the widths that are actually rendered and gated. |
| `wp-import/06-media-sync.mjs` | 1600, 800 (card), 320 (thumb), 1200x630 (og) | Sized to the roles `next/image` needs candidates for. With only a 1600px original a 320px cart thumbnail downloads the full image and scales it in the browser: the layout looks right and the page weight is wrong. |

The og card is emitted as **both** WebP and JPEG, which is not redundant:
WhatsApp is where a deal actually gets shared in this market and some versions
of its link preview do not render WebP.

Changing either set to 480/768/1200/1440 would produce renditions at widths
nothing requests, and would drop 380, which is the narrowest viewport the pixel
gate measures.

## What is genuinely not done

- **Nothing has been uploaded.** No object has ever reached R2, because there is
  no R2.
- **No `migrations/pending/` file of `product.image_url` updates has been
  written.** Writing one now would name URLs on a bucket that does not exist, so
  it would be a migration that is wrong on the day it is applied. It should be
  generated from the upload manifest after the first real run, not before.
- ~~**`scripts/import-images.ts` does not exist and should not be created.**~~
  **Corrected 2026-09-10: it existed when this was written.** Commit `a8254b92f`
  added it on `closeout/v1-final` on 2026-09-08 and ran it for real - 320
  renditions from 82 sources, idempotence and resumability each proven by a second
  run rather than asserted. This branch did not carry it, which is how a document
  came to argue against creating a file that already existed one branch over. It
  is here now.

  The argument the bullet made still has force, and the answer is that the three
  pipelines do different things rather than the same thing three times: this one
  is the only one that MEASURES each source and refuses to emit a tier above it
  (168 of the tiers the section asked for are upscales of a 600px original and are
  skipped, not faked), and it writes to a gitignored staging directory precisely
  because nothing serves those renditions yet.

---

## 2026-09-10: thirteen active products had a broken image in production

The section is about product images, and nobody had asked the one question that
matters about them. Measured today, first against production and then against the
deployment:

```
44 active products, 36 distinct first images
23 of 36 resolve
13 of 36 are absent from the repository AND answer 404 on the live site
```

The 13 were the main image of **16 of the 44 active products** - the picture the
card in the grid and the hero on the product page both render. `next/image`
returns 404 for them, so those cards show a broken image on a live shop, and
every gate in this repository was green about it: the catalogue snapshot did not
carry image paths, and nothing compared a path to the filesystem.

`docs/LAUNCH-RUNBOOK.md` had warned about the shape of this - "all 32 product
images are still served by the WordPress install, so they 404 the moment the
record moves" - and it is stale in both directions now: the images were localised
into `public/images/products/` at some point (zero rows point at
kenyonexpress.co.il today), and 13 of them did not make the trip.

### All thirteen were recovered, and twelve came back byte-identical

`refs/live-assets/` is the crawl taken on 2026-09-05 while the old site was still
serving, and it holds twelve of the thirteen **under the exact filename the
catalogue references**, so those are the originals WordPress served rather than
re-encodes. The thirteenth, `steak-1-600x512.webp`, is not in the crawl and came
from `.image-staging/` as a 480w WebP re-encode, which is the only one of the 36
that is not the original.

Every one of the 36 now decodes through sharp at 400px or wider - checked, not
assumed, because `/_next/image` serves a broken source byte-for-byte rather than
failing (project memory: next-image-optimizer-swallows-sharp-errors).

One image gap remains and it is not recoverable: `מזקקת וויסקי` has an **empty**
images array, so there is no reference to look up. Choosing a photograph is the
operator's decision, and it sits in `supabase/catalogue-known-issues.json` as
`no-image`.

### The gate that would have caught it

`supabase/catalogue-snapshot.json` now carries `first_image` per product,
measured the same day, and `src/lib/catalogue/safety-rules.ts` has two new rules:

| Rule | Fires when |
| --- | --- |
| `no-image` | the product's images array is empty |
| `image-file-missing` | the first image is referenced and no file exists under `public/` |

The filesystem half arrives as a function from the caller, so the rules module
stays pure and the unit tests keep driving it with literals. It runs in
`pnpm test src/lib/catalogue`, in the Unit tests job branch protection requires.

### R2, for the fourth time

```
r2_buckets_list -> 403 {"code":10042,"message":"Please enable R2 through the Cloudflare Dashboard."}
```

Measured again today through the Cloudflare MCP connector. Unchanged since 09-06,
and unchanged by anything this repository can do.

### And the crawl target is gone, which the script already said

`https://kenyonexpress.co.il/` answers **308** into this application and
`https://www.kenyonexpress.co.il/wp-json/wp/v2/media` answers **403**. There is
nothing left to crawl; `refs/live-assets/` is the surviving corpus and it is what
closed the gap above.

`node scripts/import-images.ts` was run again today on the corpus as it now
stands: **produced 2, reused 318, 18 of 82 sources wide enough for all four
tiers, 168 tiers skipped as upscales.** The log line is in `~/ke-goals/images.log`.
