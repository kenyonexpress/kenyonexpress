# refs/ index

What every capture in `refs/` holds, where it came from, and whether it is
current. Generated 2026-09-04 from the directory itself, not from memory.

**`refs/` is gitignored** (`.gitignore:57` — 184MB of generated captures). None
of this is in the repo; what IS in the repo is the scripts that regenerate it:
`scripts/capture-electro.mjs` for the template and `scripts/compare.mjs` for the
live-versus-ours pairs. If a file below is absent on your machine, run the
script; do not invent a new pipeline.

## The canonical names

| Logical source a goal may name | The real file | Verdict |
|---|---|---|
| Electro home markup (`electro.html`) | `refs/electro_home.html` | **current**, captured 2026-09-04 |
| Electro home computed styles | `refs/electro_home_computed.json` | current, 1,922 elements at 1440 |
| Electro shop / product-card geometry | `refs/electro_shop.html` + `_computed.json` | current, 2,693 elements |
| Electro single-product page | — | **BLOCKED 403**, see `docs/MISSING-ASSETS.md` |
| Live markup, per template | `refs/ke_live_{home,product,category,products,cart,checkout,search}.html` | 2026-08-12, **stale by 3 weeks** |
| Live computed styles | `refs/ke_live_computed.json` | 2026-09-01, current enough |
| Live content model (`ke_live_content.json`) | — | **has never existed**; use `ke_live_computed.json` |
| Live-vs-ours screenshot pair | `refs/live-<page>.png` / `refs/mine-<page>.png` | regenerated per `compare.mjs` run |
| Our computed styles | `refs/mine_computed.json` | regenerated per run |

## Verdicts by group

### Electro — real captures (2026-09-04)

These are the only Electro files anything may be measured from.

| file | bytes | date |
|---|---:|---|
| `electro_home.html` | 893,101 | 2026-09-04 |
| `electro_home_1440.png` | 1,604,636 | 2026-09-04 |
| `electro_home_380.png` | 1,007,168 | 2026-09-04 |
| `electro_home_768.png` | 714,180 | 2026-09-04 |
| `electro_home_computed.json` | 1,510,113 | 2026-09-04 |
| `electro_shop.html` | 614,990 | 2026-09-04 |
| `electro_shop_1440.png` | 1,124,696 | 2026-09-04 |
| `electro_shop_380.png` | 634,216 | 2026-09-04 |
| `electro_shop_768.png` | 1,048,966 | 2026-09-04 |
| `electro_shop_computed.json` | 2,098,520 | 2026-09-04 |

### Electro — NOT captures. Cloudflare block pages.

Every `.html` here is ~5.7KB and they are all the same "Just a moment..."
interstitial, fetched over plain HTTP before anyone checked what came back.
**Measure nothing from them.** Kept so the size signature is recognisable.

The two `.json` files and the DESIGN.md are different: they are small, genuine,
hand-measured notes from July and August and are still usable.

| file | bytes | date |
|---|---:|---|
| `electro-cart.html` | 5,685 | 2026-09-04 |
| `electro-checkout-text.json` | 3,795 | 2026-08-03 |
| `electro-checkout.html` | 5,697 | 2026-09-04 |
| `electro-home-v7.html` | 5,694 | 2026-09-04 |
| `electro-mobile-380.json` | 3,027 | 2026-07-30 |
| `electro-my-account.html` | 5,725 | 2026-09-04 |
| `electro-product-ultra-wireless-s50-headphones-s50-with-bluetooth-2.html` | 5,933 | 2026-09-04 |
| `electro-product.html` | 5,912 | 2026-09-04 |
| `electro-shop.html` | 5,685 | 2026-09-04 |
| `electro-tablet-768.json` | 3,628 | 2026-07-30 |
| `electro.madrasthemes.com-DESIGN.md` | 5,285 | 2026-09-01 |

### Live site captures

The markup is from 2026-08-12 and the computed dump from 2026-09-01. The markup
is the stale half: three weeks of live-site changes are not in it. The computed
dump is what the tokens were measured from and is the one to trust on geometry.

| file | bytes | date |
|---|---:|---|
| `ke_live_1440.png` | 1,848,468 | 2026-08-12 |
| `ke_live_380.png` | 2,990,105 | 2026-08-12 |
| `ke_live_768.png` | 2,159,698 | 2026-08-12 |
| `ke_live_cart.html` | 136,454 | 2026-08-12 |
| `ke_live_category.html` | 493,526 | 2026-08-12 |
| `ke_live_checkout.html` | 188,767 | 2026-08-12 |
| `ke_live_computed.json` | 6,066,730 | 2026-09-01 |
| `ke_live_home.html` | 810,061 | 2026-08-12 |
| `ke_live_product.html` | 209,952 | 2026-08-12 |
| `ke_live_products.html` | 725,720 | 2026-08-12 |
| `ke_live_search.html` | 274,369 | 2026-08-12 |

## Gaps, blunt

| Page | live capture | our capture | verdict |
|---|---|---|---|
| home | yes | yes | **measurable** — the gate runs on it |
| products / shop | yes | yes | measurable |
| category | yes | yes | measurable |
| product | yes | yes | measurable, but the Electro counterpart is blocked |
| cart | yes | yes | measurable |
| checkout | yes | yes | measurable |
| search | yes | yes | **not a funnel page** — the site has no search UI (see SOURCING-RULES §4) |
| account | no | no | **neither** — live's `/my-account/` was never captured |

The live markup being three weeks old matters for content questions (a category
renamed since is not in it) and not for the pixel gate, which fetches the live
site directly at run time rather than reading these files.
