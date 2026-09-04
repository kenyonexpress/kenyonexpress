# Component queue

The authoritative order for the homepage rebuild. One component at a time, top
to bottom, no jumping ahead. Progress is recorded in this file after every
component so a resumed session knows exactly where it stands.

## ⚠️ How this order was arrived at

Ofir's `COMPONENT-QUEUE` instruction arrived truncated — it ends mid-sentence at
"Never jump ahead. Never", and the queue's own list was not in the message. The
order below is therefore **derived, not dictated**, from what Ofir did specify:

- `COMPONENT-01-TOPBAR` named the top bar as component 01 explicitly.
- `COMPONENT-HEADER-ICONS` / `HEADER-ICONS` named the header icon cluster.
- `HOME-SECTION-ORDER` set the rule for the rest: *"the live site wins on which
  sections exist and Electro wins on how each one is laid out."*

So the sections are live's, in live's order, and the numbering follows the page
from the top down.

Ofir approved this order on 2026-09-04 ("the component order is approved as
derived"). The geometry keys were then verified against the captures and four of
them were wrong; the corrections are below.

## The queue

Every geometry key below was grepped against `refs/electro_home.html` and
`refs/electro_shop.html` and the occurrence count recorded. Four rows in the
first draft named classes that **do not exist in the template** and would have
sent somebody looking for a block that was never there.

| # | Component | Electro geometry key (occurrences in home / shop) | Content source | Status |
|---|---|---|---|---|
| 01 | Top bar | `top-bar` (4 / 4) | live top strip | not started |
| 02 | Masthead + header icon cluster | `masthead` (3 / 3) | live logo, real cart state | not started |
| 03 | Departments menu + mega panel | `departments-menu-v2` (4 / 1) | `KE_LIVE_CATEGORIES` | not started |
| 04 | Hero slider | `home-v1-slider` (1 / 0) | live slide copy; imagery pending | not started |
| 05 | Category strip | `product-categories-list` (1 / 1) | live departments | not started — **read the note** |
| 06 | Deals + tabs block, with countdown | `section-onsale-product` (4 / 3), `deals-block` (1 / 0), `tabs-block` (1 / 0), `countdown` (8 / 5) | live deal products | not started |
| 07 | Two-banner block | `home-v1-banner-block` (1 / 0) | live banners | not started |
| 08 | Four-up promo row | `home-v1-da-block` (1 / 0), `da-block` (3 / 1) | **live only — see the trap** | not started |
| 09 | Brand strip | `brands-carousel` (1 / 1) | live brands | not started |
| 10 | Footer + payment logos | `site-footer` (2 / 2), `footer-payment` (1 / 1) | live footer links | not started |
| 11 | Handheld header + off-canvas drawer | `handheld-header-v2` (1 / 1), `off-canvas` (7 / 7) | live departments | not started |
| 12 | Mobile bottom nav | `handheld-footer-bar` (2 / 2) | live destinations | not started |

### Corrections to the first draft, each verified by grep

- **08 named a class that does not exist.** `products-category-with-image`
  occurs **zero** times in either capture. The block that row describes is
  `home-v1-da-block` > `da-block` > `da` > `da-inner`, a 4-up row
  (`row-cols-md-2 row-cols-xl-4`).
- **06 named a class that does not exist.** `deals-carousel` occurs **zero**
  times. The real structure is `section-onsale-product` wrapping a `deals-block`
  and a `tabs-block` side by side, split 5+7 at `lg` and 4+8 at `xl` — a detail
  the original row did not hint at, and one that changes the layout entirely.
- **12 was misnamed.** `electro-handheld-footer-bar` is zero; the prefix is not
  in the template. `handheld-footer-bar` is.
- **`loop-product-categories` (126 / 78) is not a component**, it is the class on
  every product's category link. Do not build a section from it.

### ⚠️ The trap on 08

`home-v1-da-block` is the block defects 2 and 3 stripped. Its Electro content,
read out of the capture:

> "Catch Big **Deals** on the Cameras · Shop now · Tablets, Smartphones and more
> · Upto 70% · Shop the **Hottest** Products · Shop now"

with `cameras-resized.png`, `laptop.png`, `desktop.png` and `360-camers.png`.

Building this row "from Electro" the way a geometry-first reading suggests
**re-introduces the English that `scripts/latin-copy-scan.mjs` blocks and the
vendor photography that `scripts/template-asset-scan.mjs` blocks**, and the
component fails its own lint gate after being built exactly to spec.

Geometry only from Electro there. Every string from live or written Hebrew;
every image from live or `BrandPlaceholder`.

### ⚠️ The note on 05

`product-categories-list` exists once in Electro, but `src/app/(store)/page.tsx`
already carries a measured decision: live renders that strip **inside the hero
column at 768 and not at all at 380**, and a standalone full-width copy at 380
was an invention. Read that comment before rebuilding 05 as a full-width strip,
or the rebuild reverts a measurement.

### Present in Electro and deliberately not in the queue

`section-product-cards-carousel`, `home-v1-recently-viewed-products-carousel`,
`products-4-left` / `products-4-right`. They exist in the template and have no
counterpart on the live site, and the rule is that a section with no live
counterpart is not in the queue.

`search-categories` exists too and must never be copied: it is part of the
search input, and the site has no search field.

## Standing rules for every component in this queue

From `docs/SOURCING-RULES.md`, repeated here because they are the ones most
often broken mid-component:

1. **Two icons in the header cluster, at every breakpoint:** wishlist heart,
   then cart. No account icon in the cluster — the account entry point lives in
   the shell's top-left corner and must exist in exactly one place. No compare
   icon. No search icon.
2. **No search field anywhere.** Already enforced by
   `src/components/layout/no-search-ui.test.ts` and `e2e/home.spec.ts`.
3. **No express payment buttons anywhere** — Apple Pay, Google Pay, Bit, Stripe
   Link, any provider wallet. *Apple/Google **Wallet passes** for issued vouchers
   are a different feature and stay.*
4. **Every string Hebrew**, gated by `scripts/latin-copy-scan.mjs`.
5. **Every price** through `src/lib/money-format.ts`, integer agorot, sign right
   of the digits inside an LTR isolate. Gated by `e2e/price-bidi.spec.ts`.
6. **No raw hex and no arbitrary px** in a component. Gated by
   `scripts/tokens-gate.mjs`.
7. **Gate before done:** `pnpm type-check && pnpm lint && pnpm test && pnpm build`
   green, then `scripts/compare.mjs` under 11% at 380, 768 and 1440.

## Progress log

| Date | Component | What changed | compare 380 / 768 / 1440 |
|---|---|---|---|
| 2026-09-04 | (pre-queue) HOME-DEFECTS 1–4 | search UI removed and gated; Electro English purged and gated; Electro photography removed and gated; shekel sign moved to the right of the digits site-wide | 10.69 / 7.36 / 7.07 |
