# DESIGN-MEASURED.md

The kenyonexpress design system, built from MEASURED values (not guesses). Every
number here was captured with Playwright chromium (getComputedStyle plus
getBoundingClientRect) from either the LIVE site (kenyonexpress.co.il) or the
Electro home-v7 reference theme. This document REPLACES the earlier generic
"sky-blue" draft, which used wrong colors (see the Palette warnings below).

Sources:
- LIVE measurements: MEASURED-LIVE.md (home, product, category, cart pages).
- Electro reference tokens: src/lib/electro-hero-tokens.ts (ELECTRO_HERO).
- Re-measure at any time with scripts/measure-electro.mjs and scripts/measure-live.mjs.

---

## 1. Palette

The brand is a warm YELLOW plus a dark slate. It is NOT a blue/sky theme.

| Token | Value | Where it was measured |
|-------|-------|-----------------------|
| Brand yellow (primary) | `#fed700` (rgb 254,215,0) | LIVE search button/input border, cart badge, checkout button, newsletter bar, add-to-cart, hero dots |
| Slate (headings/text) | `#333e48` (rgb 51,62,72) | LIVE product title, footer text, category text, most body copy |
| Product link | `#0062bd` (rgb 0,98,189) | LIVE category card title |
| Price red (current) | `#dc3545` (rgb 220,53,69) | LIVE product current price, category sale price (ins) |
| Sale badge green | `#44b81b` (rgb 68,184,27) | LIVE category sale badge background |
| Muted sub / meta | `#7e7e7e` (rgb 126,126,126) | Electro USP subtitle; LIVE strike price grey `#848484` and meta `#768b9e` are close relatives |
| Border light | `#ddd` | LIVE quantity input border, USP bar border |
| Border lighter | `#e7e7e7` | Electro category strip border |
| Surface white | `#ffffff` | search input, cards |
| Footer surface | `#f8f8f8` (rgb 248,248,248) | LIVE footer widgets area |
| Copyright bar | `#eaeaea` (rgb 234,234,234) | LIVE footer copyright strip |

### Colors that are WRONG (do not use)

- `#B0E0E9` (generic sky-blue). This never appears on the live site. It came from
  a placeholder palette and is the reason the old doc looked off. The primary is
  yellow `#fed700`, not sky-blue.
- `#FDD700`. Close but wrong: the real measured yellow is `rgb(254,215,0)` which
  is `#fed700` (green channel 215 = `d7`, not `dd`). Use `#fed700` exactly so it
  matches the live search bar, cart badge, and buttons pixel for pixel.

---

## 2. Typography

Families: the live theme renders in its WooCommerce/Electro stack; body copy and
UI text measure at 14px on the live site. Roles and their measured sizes/weights:

| Role | Size | Weight | Color | Line height | Source |
|------|------|--------|-------|-------------|--------|
| Hero headline 1 | 58px desktop / 43px mobile | 300 | `#333e48` | - | ELECTRO_HERO.typography.headline1 |
| Hero headline 2 | 51px desktop / 38px mobile | 300 (letter-spacing -0.01em) | `#333e48` | - | headline2 |
| Hero price amount | 45px desktop / 35px mobile | 700 | `#333e48` | - | typography.price |
| Hero "FROM" price label | 13px desktop / 12px mobile | 400 | `#333e48` | - | typography.priceLabel |
| Hero tagline | 19px desktop / 11px mobile | 700 | `#333e48` | - | typography.tagline |
| Hero description | 13px desktop / 12px mobile | 400 | `#333e48` | - | typography.description |
| Product title (h1) | 25px (25.004) | 500 | `#333e48` | 32px | LIVE product page, margin-bottom 12px |
| Section heading (related, cart totals, category h1) | 25px | 500 | `#333e48` | 40px (category h1) | LIVE product/category/cart |
| Cart page title | 40px (39.998) | 500 | `#333e48` | - | LIVE cart |
| Product current price | 35px | 400 | `#dc3545` | - | LIVE product |
| Product strike price (del) | 21px | 400 | `#848484` line-through | - | LIVE product |
| Category card title | 14px | 700 | `#0062bd` | 18px | LIVE category, margin-bottom 8px |
| Category card price | 20px (20.006) | 400 | `#333e48` | - | LIVE category |
| Category card sale price (ins) | 20px | 400 | `#dc3545` | - | LIVE category |
| Category card strike (del) | 12px | 400 | `#768b9e` | - | LIVE category |
| Card category tag link | 12px | 400 | `#768b9e` | - | LIVE category |
| USP bar title | 15px | 700 | `#333e48` | - | ELECTRO_HERO.uspBar.title |
| USP bar subtitle | 13px | 400 | `#7e7e7e` | - | uspBar.subtitle, margin-top 2px |
| Category strip label | 14px | 600 | `#333e48` | - | ELECTRO_HERO.categoryStrip.label |
| Footer widget title | 16px | 700 | `#333e48` | - | LIVE footer, margin-bottom 25.6px |
| Footer link / body / UI | 14px | 400 | `#333e48` | 24px | LIVE footer/header |
| Sale badge text | 12px | 700 | `#ffffff` | - | LIVE category |

---

## 3. Spacing and layout

Measured at the 1440x900 desktop viewport.

### Header and top bar
- Top bar: 38px tall (`header#masthead` sits at top 38.34).
- Header (`#masthead`): height 110px (109.94), full width 1440.
- Logo image: 300 x 79 (max-width 300), top 53.
- Search bar: 534px wide x 41px tall, top 72. Input font-size 14px, background white,
  border-top 2px `#fed700`, radius `0 22px 22px 0`, padding 4.2px / 29.9px.
- Search button: 56 x 41, background `#fed700`, text `#333e48`, radius `22px 0 0 22px`.
- Cart badge: 21 x 21, background `#fed700`, text `#333e48`, font-size 12px.
- Header icons: 14px, margin-right ~38px between items.

### Hero (home)
- Reference slider height: 377px (ELECTRO_HERO.slider.height); LIVE hero wrap
  measures top 148, height 370. Slide background `#eef7f9`.
- Hero grid (physical LTR): `200px minmax(0,1fr) 225px` = [side banners | slider | categories], row height 512.
- Category column: width 220, height 512, text `#333e48`.
- Side banners: width 200, item 168 x 99, shop button 26px `#fed700`.
- Dots: active 30 x 8, inactive 8 x 8, color `#fed700`, radius 3, bottom offset 6.

### Category strip (below hero, above USP bar)
- Height 170px, border `#e7e7e7`.
- Right-offset inside the container: offsetInlineEnd 517, max-width 728 (a 5-up strip, not page-centred).
- Item padding: inline 12, top 16. Image 100 x 100, margin-bottom 10, fallback icon 28.
- Hover shadow `0 0 18px -2px rgba(0,0,0,0.2)`.

### USP / benefit bar
- Max width 1170, border `#ddd`, radius 8, gap 10.
- Padding inline 16; padding-block-start 1.357em, padding-block-end 0.929em (em relative to the 16px row font-size, reproduces the measured row height).
- Icon 36px, color `#fed700`, stroke-width 1.5.

### Containers
- Content container width: 1170px (product main, category main, cart, related all measure 1170).
- Page gutter left edge at x=135 inside the 1440 viewport (so ~120 + 15 padding).
- Footer widgets area: padding-top 59.9, padding-bottom 62.2, background `#f8f8f8`.
- Footer newsletter bar: height 80, background `#fed700`, padding-block 7.7.
- Footer copyright bar: height 45, background `#eaeaea`, text `#333e48`, padding-block 1.4.

---

## 4. Component specs

All values below are measured (LIVE unless noted).

### Buttons

Primary (add-to-cart, checkout), measured on LIVE product/cart:
- Background `#fed700`, text color varies by context (product add-to-cart renders white text; cart checkout renders `#333e48`).
- Font-size 14px, font-weight 700.
- Padding 14.5px / 29.9px (checkout) or 14.5px / 48px (product add-to-cart).
- Border radius ~22px (product add-to-cart 25.2px, checkout 21.99px, quantity 22px). Use a 22px pill as the default.
- Product add-to-cart hover: background goes to black `#000`, text stays white.

Secondary (update cart):
- Background `#efecec` (rgb 239,236,236), text `#333e48`, radius 22px, padding 14.5 / 29.9.

### Quantity input
- 140 x 45 (product), border 1px `#ddd`, radius 22px, font-size 14px, text-align start.
- Cart qty input: 85 x 40, radius 14px.

### Product card (category grid, LIVE)
- Card width 234px (6-up in the 1170 grid, flex-wrap), no padding, no border.
- Card image 186 x 186.
- Category tag: 12px, link color `#768b9e`, margin-bottom 12px.
- Title: 14px / 700 / `#0062bd`, line-height 18, margin-bottom 8.
- Price: 20px / `#333e48`; sale (ins) 20px / `#dc3545`; strike (del) 12px / `#768b9e`.
- Sale badge: background `#44b81b`, white 12px/700 text, radius 4px, padding 2px / 10px.
- Add-to-cart icon button: transparent background, color `#333e48`, radius 22px.

### Product page buy box (LIVE)
- Gallery main image container: 470 x 477 (desktop), full-width 345 on mobile.
- Summary column width 700, padding-inline 15.
- Title h1: 25px / 500 / `#333e48`, line-height 32, margin-bottom 12.
- Price wrap: current 35px `#dc3545`, strike 21px `#848484` line-through, margin-bottom 25.
- Add-to-cart button: 192 x 53, `#fed700` bg, radius 25.2px, padding 14.5 / 48.
- Related heading: 25px / 500 / `#333e48`, margin-bottom 34.

### Category strip item and USP bar
- See Spacing and layout above for the measured strip (170px, `#e7e7e7`) and USP bar (`#ddd`, radius 8, 36px `#fed700` icons) metrics.

### Cart (LIVE)
- Table th: 14px / 400 / muted `#747474` (rgb 116,116,116), padding 8px.
- Line item td: 17px / `#333e48`, top padding ~35.
- Item thumbnail 92 x 92.
- Remove x: color `#a7a7a7`, font-size 25px.
- Checkout button: `#fed700` bg, `#333e48` text, 14px/700, radius 22px.

---

## 5. How these were measured

- LIVE numbers (colors, sizes, rects for home/product/category/cart) come from
  MEASURED-LIVE.md, captured with Playwright chromium getComputedStyle and
  getBoundingClientRect at 1440x900 (and 375x812 mobile).
- Electro reference tokens (hero, USP bar, category strip, typography scale) are
  codified in src/lib/electro-hero-tokens.ts (ELECTRO_HERO), themselves measured
  from electro.madrasthemes.com/home-v7.
- To re-capture and diff against the current local build:
  - `node scripts/measure-electro.mjs` opens the Electro reference and
    http://localhost:3000/, writing refs/measure-electro.md (Element / CSS
    Property / Electro / Local / Match?) and refs/electro-measured.json.
  - `node scripts/measure-live.mjs` opens the LIVE product page and the first
    local product (discovered via http://localhost:3000/products), writing
    refs/measure-live.md (Element / CSS Property / Live / Local / Match?) and
    refs/live-measured.json.
- Both scripts hit external sites and should be run deliberately, not in CI.
  If localhost:3000 is down they still emit the reference column and mark Local
  as "n/a".
