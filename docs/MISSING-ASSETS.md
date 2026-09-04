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
