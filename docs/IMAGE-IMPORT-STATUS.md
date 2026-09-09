# Image import: built, staged, and blocked on one account setting

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
- **`scripts/import-images.ts` does not exist and should not be created.**
  Adding a third pipeline with the section's name, next to two working ones,
  would leave three things to keep in step. The name in the section is not the
  deliverable; the images are.
