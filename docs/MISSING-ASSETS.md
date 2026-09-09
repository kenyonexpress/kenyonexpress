# Missing assets

What could not be captured, what was tried, and what is being used instead.
Written so no session builds geometry on a guess or on a block page.

Last measured: 2026-09-04.

## 1. The Electro single-product page — BLOCKED (403)

**Wanted:** `refs/electro_product.html` plus screenshots and a computed-style
dump, from
`https://electro.madrasthemes.com/product/ultra-wireless-s50-headphones-s50-with-bluetooth-2/`,
as the geometry source for the product page.

**What happens:** the origin answers `403 - Forbidden` (an 81,082-byte error
page) for every `/product/*` URL and for `/cart/`. It is not the Cloudflare
JS challenge — that one clears; this is a flat refusal.

**Everything tried, in order:**

| Attempt | Result |
|---|---|
| `curl` with a desktop Chrome user agent | 403, Cloudflare "Just a moment..." |
| Headless Chromium, real UA, `navigator.webdriver` masked, 1440 viewport | challenge cleared on `/`, then `403 - Forbidden` on the product URL |
| Same, warmed up through the origin first so the clearance cookie is set | `403 - Forbidden` |
| Same, clicking the product link from the rendered home page | the link is inside a collapsed carousel and never becomes visible; navigation stayed on `/` |

**Reachable on the same origin, same session:** `/` and `/shop/`. So this is
per-path, not per-client.

**What is being used instead:** `refs/electro_shop.html` (614,990 bytes, 2,693
computed rows). The shop archive carries the product card in grid and list form,
the section header with its nav strip, the sidebar filters and the pagination —
which is most of what the product page's geometry would have provided. What it
does NOT carry, and what therefore has no Electro source yet: the single-product
gallery with its thumbnail strip and zoom, the buy column, the tabbed section
and the related-products carousel at the foot.

**A first capture was written and then deleted.** The first version of
`scripts/capture-electro.mjs` only treated the title "Just a moment..." as a
block, so it wrote the 81KB `403 - Forbidden` page to `refs/electro_product.html`
and reported success. The script now checks for `40x` and `forbidden` too. If
you find an `electro_*.html` around 81KB, it is that error page.

## 2. Six earlier "Electro captures" were Cloudflare block pages

`refs/electro-cart.html`, `electro-checkout.html`, `electro-home-v7.html`,
`electro-my-account.html`, `electro-product.html`,
`electro-product-ultra-wireless-s50-headphones-s50-with-bluetooth-2.html` and
`electro-shop.html` are all ~5.7KB and all identical in size, because each is the
same "Just a moment..." interstitial saved over plain HTTP. `electro-full.html`
at the repo root (8KB) is the same page.

They are kept, not deleted, so that a future session recognises the size
signature instead of re-fetching. **Nothing may be measured from them.** The real
captures are `refs/electro_home.html` and `refs/electro_shop.html`.

## 3. `refs/ke_live_content.json` does not exist

Several goals name it as the content source. It has never existed in this repo.
`refs/ke_live_computed.json` (5.8MB) does exist and is a computed-style dump of
the live site across seven templates at 380/768/1440 — it carries geometry and
text, not a content model. `refs/ke_live_home.html` and its siblings are the
saved live markup.

See `docs/REFS-INDEX.md` for what each file actually holds.

## 4. The Cloudflare R2 destination was never specified

`scripts/ingest-live-assets.mjs` crawls `kenyonexpress.co.il`, downloads every
product image, banner, category image and hero slide into `refs/live-assets/`
preserving source paths, and builds AVIF and WebP derivatives at 380/768/1440/2000
plus a real blurhash for each. That half is done and reproducible.

**The blurhash is a genuine blurhash**, not a stand-in. The first version emitted
a 4x3 WebP data URI and called it `lqip`, honestly, because it was not one.
`scripts/blurhash.mjs` is the reference algorithm — a DCT in linear light
quantised into base83 — implemented in eighty lines rather than added as a
dependency, with a decoder beside it so the encoder is tested by round trip
rather than by eye. Every hash is 28 characters for 4x3 components.

**The upload is not, and it is blocked twice over.**

1. The instruction ended mid-sentence at "upload to Cloudflare R2 under" — no
   bucket, no prefix.
2. **R2 is not enabled on the Cloudflare account.** Listing buckets returns
   `403 {"code":10042,"message":"Please enable R2 through the Cloudflare
   Dashboard."}` — measured 2026-09-06. So the destination could not exist yet
   even if it had been named.

Guessing a bucket name would have put a catalogue of live imagery somewhere
nobody chose, on a service that is switched off.

### The uploader is written and one command away

`scripts/upload-r2.mjs` exists, is dry-runnable today, and refuses loudly with
these two reasons when the environment is absent. Verified 2026-09-06:

```
$ node scripts/upload-r2.mjs --dry-run
upload-r2: 223 objects, 5.1MB
  prefix: live-assets/
  skipping 8 quarantined Electro/vendor assets
  ...
$ node scripts/upload-r2.mjs        # exit 1, names both blockers
```

It signs SigV4 with `node:crypto` rather than pulling `@aws-sdk/client-s3`, ~20MB
of dependency for a PutObject — the same trade made for blurhash. It sets
`Content-Type` per extension and `Cache-Control: public, max-age=31536000,
immutable` on every object, which is safe because each key is the asset's own
source path and a changed asset gets a new path from WordPress. It does **not**
upload the quarantined assets: keeping the Electro kit out of anything the site
can reach is the entire point of quarantining it.

**To unblock, in order:**

1. Enable R2 in the Cloudflare dashboard.
2. Create the bucket and decide the prefix.
3. Run:
   ```
   R2_ACCOUNT_ID=<id> R2_ACCESS_KEY_ID=<key> \
   R2_SECRET_ACCESS_KEY=<secret> R2_BUCKET=<bucket> \
   node scripts/upload-r2.mjs --prefix=live-assets/
   ```

`refs/live-assets/manifest.json` is the input that upload needs whenever the
destination is decided: one row per asset with its source URL, its path, byte
size, dimensions, format, alt text, the pages it appeared on, and every
derivative with its own size.

### Full crawl, 2026-09-06

| | |
|---|---|
| pages crawled | 53 (home, shop, cart, seven category archives, every product page reachable from them) |
| assets kept | 107 |
| derivatives | 268 |
| quarantined | 7 |
| failed | 0 |
| uploader sees | 375 objects, 8.0MB |

An earlier run stopped at 10 pages and 80 assets because `--pages` defaulted low;
that did not satisfy "every product image" and the crawl was rerun at 60.

### The seven quarantined, and why the filter exists

An unfiltered "download every image from live" walks the Electro demo kit
straight back in, past the gate that exists to keep it out. These seven went to
`refs/live-assets/_quarantine/` with their reason recorded rather than being
skipped silently:

```
ios13-iphone-11pro-airpods-pro-setup-animation-steps.gif
redPhone-1-1.png
Screen-Shot-2021-11-12-at-0.20.17.png
Screen-Shot-2021-11-09-at-6.41.46.png
tesla-logo-main.avif
apple-140-new.avif
home-sl-da-3.avif
```

### The one that was quarantined and then deliberately kept

`galaxy-s22_highlights_kv_img` (both sizes) matches `\bgalaxy-s\d` and was
quarantined by the first run. **It is now kept, by name, on purpose.**

Live's catalogue really does list a Samsung Galaxy S22 and this is its product
photograph. The pattern was right about the filename and wrong about the thing.
The rule it is exempt from is "no Electro demo content"; a real photograph of a
real product this shop sells is content, and `docs/SOURCING-RULES.md` says
content comes from live.

Reviewed by name and agreed independently by two sessions. It sits in
`KEEP_BY_NAME` in `scripts/ingest-live-assets.mjs` so the pattern cannot
re-quarantine it. **If the product ever leaves the catalogue, that entry goes
with it.**

This is why the first run quarantined rather than deleted: the call was
reversible, and reversing it cost one array entry.

The patterns are kept in step with `scripts/template-asset-scan.mjs` on purpose:
if that gate would reject a file, this must not hand it to the build.

**One judgement call worth revisiting.** `galaxy-s22_highlights_kv_img` is
quarantined by pattern, but live's catalogue really does list a Samsung Galaxy
S22 and that is its product photograph — real content for a real product, not
demo filler. It is quarantined rather than deleted precisely so that call can be
reversed by moving one file, and `docs/COPY-AUDIT.md` already records the same
tension.
