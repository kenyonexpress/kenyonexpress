# TOKEN-PROVENANCE.md

One row per derived token: the token name, the measured value, the source
selector it was read off, and the width it was read at.

**A token that cannot be traced to a measured selector is not in
`packages/ui/tokens.css`.** Where the live site paints no instance of something
the brief asks for, the row says `UNMEASURED` and no value is declared. Nothing
in this document is inferred from a neighbouring value, rounded to a nicer
number, or carried over from a design brief.

---

## 0. The capture

```
node scripts/measure-live-computed.mjs    ->  refs/ke_live_computed.json
                                              refs/ke_live_<width>.png
node scripts/measure-live-states.mjs      ->  refs/ke_live_states.json
node scripts/derive-tokens.mjs            ->  the report this table is built from
```

| | |
|---|---|
| Origin | `https://kenyonexpress.co.il` |
| Captured | 2026-09-04 |
| Widths | 380, 768, 1440 (viewport height 2600) |
| Templates | `home` `/`, `shop` `/shop/`, `product` `/product/מוצר-לדוגמא/`, `category` `/product-category/hot-deals/`, `cart` `/cart/`, `checkout` `/checkout/`, `account` `/my-account/` |
| Captures | 21 of 21 succeeded, 0 pending images on any of them |
| Elements | 23952 total |
| Properties | color, background-color, border-radius, border-width, box-shadow, font-family, font-size, font-weight, line-height, letter-spacing, padding, margin, gap, width, height, plus the bounding rect |
| File size | 5.57 MB (styles are interned; every element still carries all fifteen properties) |

Cart and checkout were seeded with WooCommerce's `?add-to-cart=6166&quantity=1`
before capture, and the checkout capture is verified to have stayed on
`/checkout` rather than being bounced to `/cart`. The hero was frozen through
the slider's own `revapi<N>.revpause()` / `revshowslide(1)` API before every
shot: `home@380` came back at `body 17791px`, which is the exact height
`compare.mjs` records for a correctly frozen reference, so the freeze took.

Screenshots written: `refs/ke_live_380.png`, `refs/ke_live_768.png`,
`refs/ke_live_1440.png` (home, the names the brief asks for), plus
`refs/ke_live_<template>_<width>.png` for the other six templates.

### Reading a source selector

The `p` field of each element is a structural path built from ids and
`nth-of-type`, so a row's selector is resolvable against the capture without
guessing which of five sibling divs was meant. Where a class list identifies an
element unambiguously, the shorter class selector is given instead.

---

## 1. Buttons

Live has **no single button component**. It paints four distinct shapes that do
not share a radius, an ink, or a height, so they are four families rather than
one flattened "primary". Flattening them would be exactly the invention this
document exists to prevent.

### 1.1 Shared

| Token | Measured value | Source selector | Width |
|---|---|---|---|
| `--btn-hover-bg` | `#000000` | `button.single_add_to_cart_button`, `.checkout-button`, `#place_order`, `button[name="login"]` (all four, identical) | 1440 |
| `--btn-hover-ink` | `#ffffff` | same four | 1440 |
| `--btn-transition` | `color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out` | same four | 1440 |

Every measured button on live goes to **black** on hover. That is the one thing
the four families agree on.

### 1.2 Product add-to-cart, which is responsive

| Token | Measured value | Source selector | Width |
|---|---|---|---|
| `--btn-atc-bg-handheld` | `#333e48` (`rgb(51,62,72)`) | `button.single_add_to_cart_button` | **380** |
| `--btn-atc-ink-handheld` | `#ffffff` | `button.single_add_to_cart_button` | **380** |
| `--btn-atc-radius-handheld` | `6px` | `button.single_add_to_cart_button` | **380** |
| `--btn-atc-bg` | `#fed700` (`rgb(254,215,0)`) | `button.single_add_to_cart_button` | 768, 1440 |
| `--btn-atc-radius` | `25.2px` | `button.single_add_to_cart_button` | 768, 1440 |
| `--btn-atc-pad` | `14.504px 48.076px` | `button.single_add_to_cart_button` | 380, 768, 1440 (identical) |
| `--btn-atc-h` | `52.98px` | `button.single_add_to_cart_button` | 380, 768, 1440 (identical) |
| `--btn-atc-w` | `192.17px` | `button.single_add_to_cart_button` | 768, 1440 (350px full-width at 380) |
| `--btn-atc-size` | `14px` | `button.single_add_to_cart_button` | all three |
| `--btn-atc-weight` | `700` | `button.single_add_to_cart_button` | all three |
| `--btn-atc-ink` (yellow variant) | **`#ffffff` measured, NOT DECLARED** | `button.single_add_to_cart_button` | 768, 1440 |

**The responsiveness is the headline finding.** Live paints this control slate
with a 6px corner on a phone and brand yellow as a 25.2px pill from 768 up. A
single value would be wrong at one of the two widths. Our
`src/styles/product-page.css` uses `--pdp-brand: #fed700` at every width, so at
380 our page is yellow where live is slate. Recorded as a finding in section 6.

**The white ink is measured and deliberately not emitted as a token.** Live
paints `rgb(255,255,255)` on `rgb(254,215,0)`: **1.41:1** against the 4.5:1 AA
requires. `src/lib/a11y/brand-contrast.test.ts` fails the build on exactly this
pairing. A component must use `--color-heading` (7.76:1) or
`--color-primary-foreground` (12.38:1). This is the one place where copying the
measurement is forbidden by a gate this repo already enforces.

### 1.3 Cart checkout button

| Token | Measured value | Source selector | Width |
|---|---|---|---|
| `--btn-checkout-bg` | `#fed700` | `.checkout-button` | 1440 |
| `--btn-checkout-ink` | `#333e48` (7.76:1) | `.checkout-button` | 1440 |
| `--btn-checkout-radius` | `21.994px` | `.checkout-button` | 1440 |
| `--btn-checkout-pad` | `14.504px 29.876px` | `.checkout-button` | 1440 |
| `--btn-checkout-h` | `47.52px` | `.checkout-button` | 1440 |
| `--btn-checkout-size` | `14px` | `.checkout-button` | 1440 |
| `--btn-checkout-weight` | `700` | `.checkout-button` | 1440 |
| `--btn-checkout-active-bg` | `#a78e00` (`rgb(167,142,0)`) | `.checkout-button` with the pointer held down | 1440 |

The active fill is measured with a real mouse-down, not derived as a shade. It
carries the slate ink at **3.39:1**, below AA for 14px text, which is acceptable
for a momentary pressed state and must never become a resting one.

### 1.4 Place order

| Token | Measured value | Source selector | Width |
|---|---|---|---|
| `--btn-order-bg` | `#fed700` | `#place_order` | 1440 |
| `--btn-order-ink` | `#333e48` | `#place_order` | 1440 |
| `--btn-order-radius` | `50px` | `#place_order` | 1440 |
| `--btn-order-pad` | `14.512px 16px` | `#place_order` | 1440 |
| `--btn-order-h` | `64.28px` | `#place_order` | 1440 |
| `--btn-order-size` | `19.418px` | `#place_order` | 1440 |
| `--btn-order-weight` | `700` | `#place_order` | 1440 |

The largest button on the site, and the only one at a 50px radius or a 19.418px
type size. The existing radius scale has no 50px entry; see section 2.

### 1.5 Secondary

| Token | Measured value | Source selector | Width |
|---|---|---|---|
| `--btn-secondary-bg` | `#efecec` (`rgb(239,236,236)`) | `button[name="update_cart"]`, `button[name="login"]` | 1440 |
| `--btn-secondary-ink` | `#333e48` (9.30:1) | same two | 1440 |
| `--btn-secondary-radius` | `22px` | `button[name="login"]` (21.994px on `update_cart`) | 1440 |
| `--btn-secondary-pad` | `14.504px 29.876px` | `button[name="update_cart"]` | 1440 |
| `--btn-secondary-h` | `47.2px` | `button[name="update_cart"]` | 1440 |
| `--btn-secondary-size` | `14px` | `button[name="update_cart"]` | 1440 |

`update_cart` does not change on hover at all (measured: rest and hover
identical). `login` goes to black like the rest.

### 1.6 The card's own add-to-cart

| Token | Measured value | Source selector | Width |
|---|---|---|---|
| `--btn-card-atc-bg` | `transparent` (`rgba(0,0,0,0)`) | `a.button.wp-element-button` inside `div.price-add-to-cart` | 1440 |
| `--btn-card-atc-ink` | `#333e48` | same | 1440 |
| `--btn-card-atc-radius` | `22px` | same | 1440 |
| `--btn-card-atc-w` | `37.14px` | same | 1440 |
| `--btn-card-atc-h` | `33.88px` | same | 1440 |

Not a filled button: a transparent pill with slate ink, 37.14 x 33.88 inside a
186.03 card.

### 1.7 Disabled: UNMEASURED, and this is the fail-loud row

| Control | Disabled state | Note |
|---|---|---|
| `button[name="update_cart"]` | **MEASURED**: fill `#efecec` and ink `#333e48` unchanged, `opacity: 0.65` | The only control live ships in a disabled state |
| `button.single_add_to_cart_button` | **UNMEASURED** | Live paints no disabled instance |
| `.checkout-button` | **UNMEASURED** | Live paints no disabled instance |
| `#place_order` | **UNMEASURED** | Live paints no disabled instance |
| `button[name="login"]` | **UNMEASURED** | Live paints no disabled instance |

`--btn-disabled-opacity: 0.65` is declared, sourced from the one control that
actually paints it. **It is not generalised to the other four.** Applying it to
them is an inference, and this table records that it would be one. The
alternative (synthesising a disabled state by setting the attribute ourselves)
was considered and rejected: that measures *our* disabled styling in *live's*
page, which is not the same thing and would be a fabricated row.

`derive-tokens.mjs` exits non-zero while these four rows say UNMEASURED, so the
gap fails loudly rather than sitting unnoticed.

### 1.8 Controls the brief assumed exist, and do not

| Target | Result |
|---|---|
| `a.add_to_cart_button` (loop add-to-cart) | Present in the DOM, **not visible**, so no state could be measured |
| `button[name="apply_coupon"]` | Selector matched nothing on live's cart |
| search submit | Matched nothing. Live's header search exists but not under any of the three selectors tried, and this project ships **no search UI** by standing rule |
| newsletter submit | Matched nothing under the selectors tried |

---

## 2. Border-radius scale

Recounted across all 23952 elements. The site is overwhelmingly square:
**22740 (94.9%) carry `0px`** against 1212 that carry anything at all.

| Count | Value | First seen | Width |
|---|---|---|---|
| 22740 | `0px` | `html` | 380 |
| 611 | `22px` | `header#masthead ... button` | 380 |
| 138 | `4px` | `header#masthead ... a` | 380 |
| 96 | `200px` | home hero promo `a` | 380 |
| 55 | `50%` | `header#masthead ... span` | 380 |
| 45 | `50px` | `html > body > a` (skip link) | 380 |
| 45 | `0px 0px 7px 7px` | `li#menu-item-8939 > ul` | 380 |
| 42 | `7px` | `footer#colophon > div:nth-of-type(2) ...` | 380 |
| 21 | `25px` | `header#masthead ... form` | 380 |
| 21 | `8px` | home USP panel `div` | 380 |
| 21 | `0px 22px 22px 0px` | `input#search` | 380 |
| 21 | `22px 0px 0px 22px` | `header#masthead ... form > div > div:nth-of-type(2) > button` | 380 |
| 21 | `50px 0px 0px 50px` | `button#wpforms-submit-5249` | 380 |
| 21 | `0px 25.136px 25.136px 0px` | `input#wpforms-5249-field_1` | 380 |
| 9 | `3px` | `rs-module#rev_slider_6_1 > rs-loader` | 380 |
| 9 | `20.006px` | `main#main ... select` | 380 (shop) |
| 9 | `20px` | `main#main ... nav > ul > li > span` | 380 (shop) |
| 7 | `21.994px` | `article#post-3134 ... button` | 380 (cart) |
| 6 | `2px` | product page overlay `div` | 380 |
| 3 | `4.998px` | `div#content > div > nav > a:nth-of-type(2)` | 380 |

25 distinct values in total.

**Confirmed, not redeclared.** `--radius-none` (0), `--radius-sm` (4),
`--radius-md` (7), `--radius-pill` (22), `--radius-lg` (25) and
`--radius-round` (200) all appear in this recount at the same values. They stay
in `src/styles/tokens.css`.

**New, declared in `packages/ui/tokens.css`:**

| Token | Measured value | Source selector | Width | Count |
|---|---|---|---|---|
| `--radius-half` | `50%` | `header#masthead ... span` | 380 | 55 |
| `--radius-order` | `50px` | `html > body > a`, `#place_order` | 380 / 1440 | 45 |
| `--radius-panel` | `8px` | home USP panel | 380 | 21 |
| `--radius-pill-start` | `0 22px 22px 0` | `input#search` | 380 | 21 |
| `--radius-pill-end` | `22px 0 0 22px` | search submit button | 380 | 21 |

The two split radii are recorded as physical four-value shorthands because that
is what they measure as, and the measurement comes off an RTL document, so the
values are already RTL-correct as painted. A component that needs them to flip
must apply them through `border-start-start-radius` and friends.

**Not promoted to tokens** (fewer than 10 occurrences, or a one-off widget):
`0 0 7px 7px` is a dropdown's bottom corners composed from `--radius-md`;
`3px`, `2px`, `4.998px`, `20px`, `20.006px`, `21.994px` and the two wpforms
values are each a single widget's own number.

---

## 3. Product card anatomy

Source: `li.product` in `/product-category/hot-deals/`, all three widths. The
element chain is `li.product > div.product-outer > div.product-inner`.

### 3.1 Which elements are present, and in what order

Measured DOM order inside `div.product-inner`:

| # | Element | Note |
|---|---|---|
| 1 | `div.product-loop-header.product-item__header` | wrapper |
| 1a | `span.loop-product-categories` | two category `a` links |
| 1b | `span.price` / `span.electro-price` | **price, above the title** |
| 1b-i | `ins > span.amount > bdi` | sale price |
| 1b-ii | `del > span.amount > bdi` | struck original |
| 1c | `a.woocommerce-LoopProduct-link` | wraps the title and the thumbnail |
| 1c-i | `h2.woocommerce-loop-product__title` | |
| 1c-ii | `div.product-thumbnail.product-item__thumbnail` | |
| 1c-iii | `span.onsale > span.percentage` | badge, over the thumbnail |
| 1c-iv | `img.attachment-woocommerce_thumbnail` | |
| 2 | `div.product-loop-footer.product-item__footer` | |
| 2a | `div.price-add-to-cart` | **price again**, plus the add-to-cart |
| 2b | `a.button.wp-element-button` | the card's add-to-cart |

**The price appears twice and the title sits between the price and the image.**
Anything that renders image, then title, then price is not this card. Note also
that live's own markup wraps every price amount in `<bdi>`, which is the bidi
isolation `docs/RTL-PITFALLS.md` section 4 recommends and which our components
do not currently use anywhere.

### 3.2 Geometry

| Token | 1440 | 768 | 380 | Source selector |
|---|---|---|---|---|
| `--card-w` / `-tablet` / `-mobile` | `234px` | `230px` | `175px` | `div.product-outer` |
| `--card-h` / `-tablet` / `-mobile` | `437.52px` | `424.69px` | `369.69px` | `div.product-outer` |
| `--card-pad` / `-handheld` | `23.98px` | `14px` | `14px` | `div.product-loop-header` x offset from `div.product-outer` |
| `--card-pad-top` / `-handheld` | `20px` | `14px` | `14px` | same, y offset |
| `--card-thumb` / `-tablet` / `-mobile` | `186.03px` | `202px` | `147px` | `div.product-thumbnail` (square) |
| `--card-footer-h` / `-handheld` | `114.94px` | `107.94px` | `107.94px` | `div.product-loop-footer` |

### 3.3 Measured spacing

Gaps are computed from the rects (the bottom of one box to the top of the next),
not read off `margin`, so they are what the page actually renders.

| Token | 1440 | 768 | 380 | Between |
|---|---|---|---|---|
| `--card-gap-cats-price` / `-handheld` | `7.98px` | `4.47px` | `4.48px` | `span.loop-product-categories` -> `span.price` |
| `--card-gap-price-title` / `-handheld` | `0.99px` | `1.98px` | `1.98px` | `span.price` -> `h2...__title` |
| `--card-gap-title-thumb` | `8px` | `8px` | `8px` | `h2...__title` -> `div.product-thumbnail` |
| `--card-gap-thumb-footer` | `9.98px` | `9.99px` | `9.98px` | `div.product-thumbnail` -> `div.product-loop-footer` |

### 3.4 Type

| Token | 1440 | 768 | 380 | Source selector |
|---|---|---|---|---|
| `--card-title-size` / `-handheld` | `14px` | `11.998px` | `11.998px` | `h2.woocommerce-loop-product__title` |
| `--card-title-h` / `-handheld` | `36px` | `28px` | `28px` | same (two lines) |
| `--card-cats-size` / `-handheld` | `11.998px` | `11.2px` | `11.2px` | `span.loop-product-categories` |
| `--card-price-size` / `-handheld` | `20.006px` | `16.002px` | `16.002px` | `span.price` |
| `--card-price-del-size` / `-handheld` | `12.0036px` | `9.6012px` | `9.6012px` | `del > span.amount` |
| `--card-badge-w` | `47.81px` | `47.81px` | `47.81px` | `span.onsale` |
| `--card-badge-h` | `28px` | `28px` | `28px` | `span.onsale` |
| `--card-badge-size` / weight | `11.998px` / `700` | same | same | `span.onsale` |

**The title is smaller at 768 than at 1440**, which is live's own ramp and not a
misreading: 14px at 1440, 11.998px at both 768 and 380.

Card colours, all confirming existing tokens: title `rgb(0,98,189)` = `#0062bd`
= `--color-link`; categories and `del` `rgb(118,139,158)` = `#768b9e`; `ins`
`rgb(220,53,69)` = `#dc3545` = `--color-price`; card body ink
`rgb(51,62,72)` = `#333e48` = `--color-heading`.

**The badge fill is measured and deliberately not declared.** `span.onsale` is
`rgb(68,184,27)` = `#44b81b` with white on it: **2.59:1**. `--color-sale-badge`
(`#328614`, 4.61:1) is the corrected value this project already ships. Its
radius `4px` and padding `2px 10px` are confirmed as measured.

---

## 4. Hero structure

**It is a slider, not a static banner.** `rs-module` with **five** `rs-slide`
and five `rs-bullet`, at every one of the three widths. Any rebuild that ships
a single static image is not this hero.

### 4.1 Slider versus static, and slide count

| Width | `rs-module` | `rs-slide` | `rs-bullet` | Verdict |
|---|---|---|---|---|
| 380 | 2 | 5 | 5 | SLIDER |
| 768 | 2 | 5 | 5 | SLIDER |
| 1440 | 2 | 5 | 5 | SLIDER |

Source: `rs-module#rev_slider_6_1` on `home`.

### 4.2 Aspect ratio at each breakpoint

| Token | Measured value | Source selector | Width |
|---|---|---|---|
| `--hero-module-w` / `--hero-module-h` | `727.89px` / `370px` | `rs-module#rev_slider_6_1` | 1440 |
| `--hero-aspect` | `1.9673` | computed from the two above | 1440 |
| `--hero-module-w-tablet` / `-h-tablet` | `729px` / `304px` | `rs-module` | 768 |
| `--hero-aspect-tablet` | `2.3980` | computed | 768 |
| `--hero-module-w-mobile` / `-h-mobile` | `350px` / `193px` | `rs-module` | 380 |
| `--hero-aspect-mobile` | `1.8135` | computed | 380 |

### 4.3 The row and its columns

| Element | 380 | 768 | 1440 | Source selector |
|---|---|---|---|---|
| Hero row | `350 x 213` | `690 x 495` | `1170 x 613` | `div.elementor-section.elementor-top-section` |
| Slider module | `350 x 193` | `729 x 304` | `727.89 x 370` | `rs-module` |
| Third column | absent | absent | `240.67 x 593` at x1064.33 | `div.elementor-column.elementor-col-33` |
| Side banners | absent | absent | `201.36 x 197` x3 at x135.08 | `div.da-block.justify-content-between` |
| Category strip | absent | present | `727.89 x 170` at x336.44 y518.28 | `section.product-categories-list` |
| Strip item | | | `145.58 x 170` x5 | `li.category` in `div.categories-block.columns-5` |

**Every existing hero token is confirmed exactly and none is redeclared:**

| Existing token | Declared | This capture | Verdict |
|---|---|---|---|
| `--spacing-hero-mobile` | `213px` | 213 | confirmed |
| `--spacing-hero-tablet` | `495px` | 495 | confirmed |
| `--spacing-hero-desktop` | `613px` | 613 | confirmed |
| `--spacing-hero-slider-tablet` | `304px` | 304 | confirmed |
| `--spacing-hero-slider-desktop` | `370px` | 370 | confirmed |
| `--container-hero-row` | `1170px` | 1170 | confirmed |
| `ELECTRO_HERO.categoryColumn.width` | `241` | 240.67 | confirmed |
| `ELECTRO_HERO.categoryColumn.height` | `593` | 593 | confirmed |
| `ELECTRO_HERO.sideBanners.width` | `201` | 201.36 | confirmed |
| `ELECTRO_HERO.sideBanners.itemHeight` | `197` | 197 | confirmed |
| `ELECTRO_HERO.categoryStrip.height` | `170` | 170 | confirmed |
| `ELECTRO_HERO.slider.height` | `370` | 370 | confirmed |

New tokens declared: `--hero-slides`, the three module sizes and aspects,
`--hero-side-w`, `--hero-side-block-h`, `--hero-strip-w`, `--hero-strip-h`,
`--hero-strip-item-w`.

---

## 5. ELECTRO-STRUCTURE rows

The brief allows falling back to the Electro home-v7 structural reference
**only** where the live site is missing a pattern entirely, for layout skeleton
and never for colour.

**No row in this document needed that fallback.** Every pattern the brief asks
for (buttons, product card, radius scale, hero) exists on the live site and was
measured there. The `ELECTRO-STRUCTURE` marker is therefore unused, and is
recorded as unused rather than being applied to something that did not need it.

The one place the existing codebase does rely on Electro is
`src/lib/electro-hero-tokens.ts`, and this capture **confirms** rather than
replaces those values (section 4.3), with one exception recorded in section 6.

---

## 6. Findings: where the measurement contradicts what ships

These are recorded, not silently resolved. A contradiction is something to act
on deliberately.

| # | What | Live measures | We declare | Impact |
|---|---|---|---|---|
| 1 | Product add-to-cart at 380 | `#333e48` fill, `6px` radius, full width | `--pdp-brand: #fed700`, `--pdp-atc-w: 192px`, radius 25.2 at every width | Our PDP is yellow at 380 where live is slate. Real pixel cost on `--page=product --width=380`. |
| 2 | Buy-now button | `rgb(238,100,67)` = `#ee6443`, white ink at **3.21:1** | `--pdp-buy: #c94b28`, white at 4.65:1 | Ours is the AA correction. Keep, and record that it is a deliberate departure like the other six. |
| 3 | `ELECTRO_HERO.categoryStrip.offsetInlineEnd` | The strip shares the slider's x and width (336.44, 727.89): it is the slider column's second row, not a right-offset element | `offsetInlineEnd: 517`, `maxWidth: 728` | The 728 max-width is right (727.89). The 517 offset does not describe this capture. Worth re-deriving before it is used. |
| 4 | `#place_order` radius | `50px` | No 50px entry existed in the radius scale | Now `--radius-order`. |
| 5 | Live's price markup | Every amount is wrapped in `<bdi>` | Our components use `dir="ltr"` wrappers and **zero** `<bdi>` | Not a defect, but live is doing the more correct thing inside sentences. See `docs/RTL-PITFALLS.md` section 4.2. |
| 6 | Live's product ATC ink | `#ffffff` on `#fed700` = 1.41:1 | Gated as forbidden by `brand-contrast.test.ts` | Correctly refused. Documented so nobody "fixes" our page toward live's failure. |

---

## 7. What could not be done in this worktree

Stated here rather than left implied.

`ke-arch` is a git worktree and **has no `node_modules`**. pnpm installs into the
main checkout, and installing from a worktree purges it, so the measurement
scripts resolve `@playwright/test` out of the main checkout at runtime (see the
comment at the top of `scripts/measure-live-computed.mjs`). That works for
measurement, which only needs a browser.

It does **not** work for the gates:

- `pnpm test`, `pnpm type-check`, `pnpm lint` and `pnpm build` cannot run here.
- `scripts/compare.mjs` needs a local production server (`pnpm start`), which
  needs a build, which needs the install.

So the **compare.mjs gate at 380/768/1440 under 11% has not been run against
these changes**, and no visual step is claimed as closed on the strength of
them. The token file and this document are measurement and derivation only;
nothing in `src/` consumes the new tokens yet.

---

## 8. Re-running this

```bash
node scripts/measure-live-computed.mjs                     # all 7 templates, 3 widths
node scripts/measure-live-computed.mjs --templates=home --widths=380
node scripts/measure-live-states.mjs --widths=1440         # hover / active / disabled
node scripts/derive-tokens.mjs                             # the report; exits 1 while anything is UNMEASURED
node scripts/derive-tokens.mjs --json > refs/derived.json
```

All three hit the live site. Run them deliberately, never in CI.
