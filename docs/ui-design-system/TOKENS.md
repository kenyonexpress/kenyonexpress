# Storefront design tokens

Canonical token reference for the KenyonExpress storefront. Electro home-v7 supplies layout and structure only. Content, strings, prices and images come from the live site `kenyonexpress.co.il`. This file names every colour, type size, space, radius, shadow, z-index, breakpoint and container the storefront may use, and the RTL rules that keep Hebrew from reordering.

Status: binding for UI work in this worktree. Docs only.

Companions:

```
src/styles/tokens.css
packages/ui/tokens.css
src/styles/tokens.ts
docs/TOKEN-PROVENANCE.md
docs/DESIGN-SYSTEM.md
docs/RTL-PITFALLS.md
docs/HEADER-1TO1-2026-09-02.md
```

Capture: live site measured 2026-09-04 at viewports 380, 768 and 1440 (height 2600). Pixel gate: `scripts/compare.mjs` under 11 percent at those three widths.

---

## 0. How to read this file

Three layers exist and they do not always agree. A token is not "the brief, or live, whichever you like". Each row below says which layer it belongs to.

| Layer | What it is | Wins when |
|---|---|---|
| Brief | Project facts named in the autonomous prompt: yellow `#fed700`, hover `#fedd26`, price red `#E4002B`, link blue `#0062bd`, container `1320px`, Heebo, RTL | Brand intent, copy, and any colour that is never painted on the live reference |
| Live | Computed styles from `kenyonexpress.co.il` | Pixel comparison. Adopting a brief value that live does not paint raises `compare.mjs` |
| Shipped | `src/styles/tokens.css` plus WCAG AA corrections | Runtime. White-on-yellow is forbidden even though live paints it |

Authority for money and product-type rules is not this file. If a colour choice collides with a business rule, `BUSINESS-MODEL-RULES.md` (when present) then `docs/PRODUCT-TYPES.md` then research docs. This file owns presentation only.

### 0.1 Three brief names live does not paint

Checked on the 2026-09-04 capture (parsed styles, colour-frequency count, raw grep of the reference). All three appear zero times on live.

| Brief name | Live paints | Shipped | Why |
|---|---|---|---|
| Price red `#E4002B` | `#dc3545` site-wide (456 elements), `#c93636` on home-grid sale prices (57) | `--color-price: #dc3545`, `--color-deal-sale: #c93636` | Matching live keeps the pixel gate honest. `#E4002B` remains the named brand red for wallet passes and any surface that is not scored against the WooCommerce reference |
| Container `1320px` | `1200px` page body (x135..x1305 at a 1440 viewport), `1170px` hero and catalog | `--container-page: 1200px`, `--container-hero-row: 1170px` | 1320 never occurs on live. Restoring it widens the hero slider by 150px and fails the home gate |
| Heebo | `"Open Sans"` on 12024 elements | `--font-sans: var(--font-heebo), Arial, sans-serif` | Deliberate exception. Open Sans has no Hebrew glyphs. Live paints Hebrew through an unnamed OS fallback. This is a Hebrew storefront, so the face that actually paints the letters is chosen on purpose |

Keep the brief names in this table. Do not silently "fix" the token layer toward `#E4002B` or `1320px` to satisfy a prompt. Do not silently "fix" Heebo toward Open Sans to satisfy a screenshot.

---

## 1. Colour

Hex values are lowercase. Semantic names are the CSS custom property without the `--color-` prefix where a shorter label is clearer. Contrast is WCAG 2.1 against white unless a different surface is named. AA for normal text is 4.5:1. Large text (18.66px bold or 24px regular) may use 3:1.

**Brand yellow is a surface, never a text colour.** White on `#fed700` is 1.41:1. That pairing is gated by `src/lib/a11y/brand-contrast.test.ts` and must not ship. Ink on yellow is `--color-heading` (`#333e48`, 7.76:1) or `--color-primary-foreground` (`#1a1a1a`, 12.38:1).

### 1.1 Brand identity

| Token | Hex | Semantic name | Contrast on white | Where it is used |
|---|---|---|---|---|
| `--color-brand-primary` | `#fed700` | brand yellow | 1.41:1 (fail as text) | Primary CTA fill, masthead active, newsletter bar, cart badge, region-menu top border, PDP add-to-cart from 768 up |
| `--color-brand-primary-hover` | `#fedd26` | brand yellow hover | 1.35:1 (fail as text) | Hover fill for brand yellow. Brief names this; live's measured button hover is black (see 1.8). Both exist: this token is the yellow-to-yellow hover, `--btn-hover-bg` is the black hover live actually paints |
| `--color-brand` | `#fed700` | brand (alias) | same | Tailwind `bg-brand` / `text-brand`. `text-brand` is illegal on white |
| `--color-brand-secondary` | `#fed700` | brand secondary (alias) | same | Cart count badge fill |
| `--color-primary` | `#fed700` | primary (Tailwind semantic) | same | Alias of brand-primary |
| `--color-primary-foreground` | `#1a1a1a` | ink on primary | 12.38:1 on yellow | Text and icons sitting on `#fed700` |
| `--color-brand-dark` | `#1a1a1a` | brand dark | 17.40:1 | Default body ink, dark surfaces |
| `--color-foreground` | `#1a1a1a` | foreground | 17.40:1 | `body` text |
| `--color-brand-accent` | `#eaf4f6` | brand accent | 1.12:1 (surface) | Soft tinted panels, Electro-adjacent chrome |
| `--color-brand-light` | `#eaf4f6` | brand light (alias) | same | `bg-brand-light` |
| `--color-accent` | `#eaf4f6` | accent (alias) | same | `bg-accent` |

### 1.2 Functional colour (meaning, not hue)

| Token | Hex | Semantic name | Contrast on white | Where it is used |
|---|---|---|---|---|
| `--color-price` | `#dc3545` | price red (live) | ~4.63:1 | Current / sale price on category, PDP, cart line. This is what live paints |
| Brand brief price | `#E4002B` | price red (brief) | ~4.53:1 | Named in the project brief and used on wallet-pass chrome (`src/lib/wallet/pass-model.ts`). Not a storefront text token. Do not replace `--color-price` with this or the pixel gate moves |
| `--color-deal-sale` | `#c93636` | home-card sale | ~4.85:1 | Sale price on the home deals grid only (57 elements on live). Not `--color-price` |
| `--color-deal-price` | `#2d2d2d` | deals-card price ink | 13.69:1 | Regular price on the home deals card |
| `--color-deal-badge` | `#ee0000` | home discount badge | white on it fails AA | Home-card percentage badge. White 12/700 sits on it. Keep the fill; do not use this as body text |
| `--color-price-strike` | `#6f6f6f` | strike price | 5.02:1 | Crossed-out original price. Darkened from live `#9ca3af` / `#848484` for AA |
| `--color-link` | `#0062bd` | link blue | ~4.64:1 | Product titles in cards, inline links, category names that are links. Brief and live agree |
| `--color-heading` | `#333e48` | slate ink | 7.76:1 | Headings, body on storefront, footer body, CTA ink on yellow |
| `--color-success` | `#5cb85c` | success | ~2.8:1 as text | In-stock, confirmation chips. Not body text on white |
| `--color-sale-badge` | `#328614` | sale-badge green | white 4.61:1 | On-sale badge. Live paints `#44b81b` (white 2.59:1). Shipped value is the AA correction |
| `--color-promo-flame` | `#c24d00` | promo CTA | white 4.82:1 | Promo-card button. Darkened from live `#ff6b00` (white 2.86:1) |

### 1.3 Neutrals, surfaces, chrome

| Token | Hex | Semantic name | Where it is used |
|---|---|---|---|
| `--color-background` | `#ffffff` | page | `body` |
| `--color-surface` | `#ffffff` | paper | Cards, inputs, tables |
| `--color-ink` | `#000000` | admin ink | Admin console only. Denser than storefront slate |
| `--color-surface-hover` | `#f5f5f5` | hover tint | Rows, menus, PDP panels |
| `--color-track` | `#f1f2f4` | track | Progress bars, chart tracks |
| `--color-bottom-bar` | `#eaeaea` | footer copyright bar | Thin bar under the footer columns |
| `--color-warning-surface` | `#fffbe6` | warning banner | Inline unsaved / validation notice |
| `--color-footer-bg` | `#333e48` | footer body | Dark footer. Same hex as heading ink, different role |
| `--color-drawer-bg` | `#fdfcfc` | drawer paper | Off-canvas nav. Not quite white; visible against the page |
| `--color-border` | `#dddddd` | hairline | Default borders and dividers |
| `--color-border-alt` | `#e7e7e7` | secondary hairline | Category strips |
| `--color-rule` | `#ededed` | section rule | Rule under a tab strip |
| `--color-muted` | `#6f6f6f` | muted text | Secondary copy. Darkened from live `#767676` so it still passes on `#f5f5f5` panels |
| `--color-muted-2` | `#657888` | muted slate-blue | Product meta, category eyebrow |
| `--color-icon` | `#515151` | icon gray | Masthead icons |
| `--color-icon-empty` | `#cccccc` | empty glyph | Empty cart / no-results illustration |
| `--color-promo-rose` | `#fff5f5` | promo rose | Left-rail promo card wash |
| `--color-promo-violet` | `#f5f5ff` | promo violet | Same |
| `--color-promo-sky` | `#f0f7ff` | promo sky | Same |

### 1.4 Third-party marks (never rebranded with `--color-brand-*`)

| Token | Hex | Where it is used |
|---|---|---|
| `--color-whatsapp` | `#25d366` | Float button fill, share mark |
| `--color-whatsapp-ink` | `#075e54` | WhatsApp as link text (7.67:1). Not the mid teal `#128c7e` |
| `--color-whatsapp-ink-hover` | `#043c36` | Hover for that link (12.32:1) |
| `--color-facebook` | `#166fe5` | Facebook as link text (4.73:1). Not `#1877f2` |

### 1.5 Alpha overlays

| Token | Value | Where it is used |
|---|---|---|
| `--color-slider-dot-idle` | `rgba(125, 125, 125, 0.5)` | Inactive hero bullets |
| `--color-overlay-hairline` | `rgba(0, 0, 0, 0.1)` | Consent banner hairline |
| `--color-overlay-ink` | `rgba(0, 0, 0, 0.7)` | Consent banner body |
| Drawer dim | `rgb(0 0 0 / 0.5)` | Mobile drawer backdrop |
| Dialog dim | `rgb(0 0 0 / 0.8)` | shadcn dialog overlay |
| Command-palette dim | `rgb(0 0 0 / 0.4)` | Admin command palette |

### 1.6 Catalog and PDP local palettes

These are declared on `.category-page` and `.pdp` so those templates cannot drift from `SITE` without a test failure. Values that match a site token must stay equal to it.

| Local token | Hex | Site twin |
|---|---|---|
| `--cat-ink` / `--pdp-ink` | `#333e48` | `--color-heading` |
| `--cat-link` | `#0062bd` | `--color-link` |
| `--cat-muted` / `--pdp-muted` | `#657888` | `--color-muted-2` |
| `--cat-sale` / `--pdp-sale` | `#dc3545` | `--color-price` |
| `--cat-badge` | `#328614` | `--color-sale-badge` |
| `--cat-brand` / `--pdp-brand` | `#fed700` | `--color-brand-primary` |
| `--cat-brand-hover` / `--pdp-brand-hover` | `#fedd26` | `--color-brand-primary-hover` |
| `--cat-bar` | `#efefef` | catalog control bar only |
| `--cat-switcher` | `#495057` | view-switcher icons (live measured) |
| `--pdp-action` | `#5d7184` | secondary PDP actions |
| `--pdp-strike` | `#6f6f6f` | `--color-price-strike` |
| `--pdp-rule` | `#cccfd1` | hairline under the title block |
| `--pdp-line` | `#dddddd` | `--color-border` |
| `--pdp-buy` | `#c94b28` | buy-now fill. Live `#ee6443` (white 3.21:1). Shipped AA correction, white 4.65:1 |
| `--pdp-buy-hover` | `#b8401f` | buy-now hover, white 5.54:1 |

### 1.7 Toast colours (Sonner light theme, AA-corrected)

Sonner's own light pairs miss AA at 13px. Only the title ink moves. Backgrounds stay.

| Kind | Ink | On |
|---|---|---|
| success | `hsl(140, 100%, 25.5%)` 4.71:1 | `#ecfdf3` |
| info | `hsl(210, 92%, 43.5%)` 4.61:1 | `#f0f8ff` |
| warning | `hsl(31, 92%, 35.5%)` 4.68:1 | `#fffcf0` |
| error | `hsl(360, 100%, 43.5%)` 4.62:1 | `#fff0f0` |

### 1.8 Button colour families (measured, not flattened)

Live has no single button component. Four families share one hover (black) and nothing else.

| Family | Rest fill | Rest ink | Hover | Active | Radius | Height | Type |
|---|---|---|---|---|---|---|---|
| Product add-to-cart, 380 | `#333e48` | `#ffffff` (10.92:1) | `#000000` / `#ffffff` | UNMEASURED | `6px` | 52.98px | 14px / 700 |
| Product add-to-cart, 768 and 1440 | `#fed700` | shipped `#333e48` (live white is 1.41:1, refused) | `#000000` / `#ffffff` | UNMEASURED | `25.2px` | 52.98px | 14px / 700 |
| Cart checkout | `#fed700` | `#333e48` | black | `#a78e00` (measured mouse-down) | 21.994px | 47.52px | 14px / 700 |
| Place order | `#fed700` | `#333e48` | black | UNMEASURED | `50px` | 64.28px | 19.418px / 700 |
| Secondary (update cart, login) | `#efecec` | `#333e48` | login: black. update-cart: no change | n/a | 22px | 47.2px | 14px / 400–700 |
| Card add-to-cart | transparent | `#333e48` | black | UNMEASURED | 22px | 33.88 × 37.14 | icon |
| Disabled (only update-cart is painted) | unchanged | unchanged | n/a | n/a | same | same | opacity 0.65 |

`--btn-disabled-opacity: 0.65` is declared from the one control live ships disabled. It is not generalised to the other families. Those rows are UNMEASURED.

Shared:

```
--btn-hover-bg: #000000
--btn-hover-ink: #ffffff
--btn-transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out,
  border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out
```

Focus-visible (not a live measurement; a11y requirement): 2px solid `--color-heading` (or the control's own ink), offset 2px. Never rely on colour alone. Do not use a yellow ring on a yellow button.

---

## 2. Type

### 2.1 Family and weights

`--font-sans: var(--font-heebo), Arial, sans-serif`.

Heebo is loaded once in the root layout via `next/font/google`, subsets `latin` and `hebrew`, `display: swap`, `preload: false` (the LCP paragraph is Arial on purpose). Do not redeclare `font-family` in a page stylesheet.

Hebrew has no italic tradition. Do not use `font-style: italic` on Hebrew. Do not use `text-transform: uppercase` on mixed Hebrew/Latin strings.

| Weight | CSS | Role |
|---|---|---|
| 300 | `font-weight: 300` | Hero headlines (line 1 and line 2) |
| 400 | `font-weight: 400` | Body, PDP current price, strike price, footer links, category eyebrows, most UI |
| 500 | `font-weight: 500` | Product H1, cart/account page titles, newsletter heading, checkout step labels |
| 600 | `font-weight: 600` | Category-strip labels, some checkout totals, newsletter submit |
| 700 | `font-weight: 700` | Buttons, sale badges, card titles, USP titles, footer widget titles, hero tagline, hero promo price |

Root size for rem: 16px (browser default). Live records 16.002px in a few captures; do not round measured decimals to a nicer rem if the pixel gate can see the difference. Where the token is already an integer px, rem is px / 16.

### 2.2 Scale at 380 / 768 / 1440

Sizes in px and rem. A blank 768 cell means the 380 value continues until 1440. "Same" means the value does not change with viewport.

| Role | Weight | 380 | 768 | 1440 | Token / note |
|---|---|---|---|---|---|
| Hero headline 1 | 300 | 43px / 2.6875rem | 43px | 51px / 3.1875rem | `--text-hero-line1` / `--text-hero-line1-lg` |
| Hero headline 2 | 300, tracking `-0.01em` | 38px / 2.375rem | 38px | 45px / 2.8125rem | `--text-hero-line2` / `--text-hero-line2-lg` |
| Hero promo price | 700 | 35px / 2.1875rem | 35px | 50px / 3.125rem | `--text-hero-promo` / `--text-hero-promo-lg` |
| Hero welcome promo | 700 | 35px | 35px | 45px / 2.8125rem | `--text-hero-promo-welcome-lg` (not aliased to line2) |
| Hero tagline | 700 | 11px / 0.6875rem | 11px | 19px / 1.1875rem | `--text-hero-tagline-lg` at 1440 |
| Hero "from" label | 400 | 12px / 0.75rem | 12px | 13px / 0.8125rem | component-local |
| Product H1 (PDP) | 500 | 25.004px / 1.56275rem | same | same | `--text-pdp-title`, leading `--leading-pdp-title` 32.0051px |
| Category / archive H1 | 500 | 25.004px | same | same | `--cat-title-size`, leading 40.0064px |
| Cart / account H1 | 500 | ~32px / 2rem | ~36px | 40px / 2.5rem | Electro cart title; 40px at desktop |
| Section heading | 500 | 22px / 1.375rem | 22px | 25.004px | `--text-section-title` 22px; related-products heading 25.004 / 40.0064 |
| PDP body | 400 | 14px / 0.875rem | same | same | `--text-pdp-body`, leading 23.996px |
| Body (site-wide) | 400 | 14px / 0.875rem | same | same | 8364 elements on the reference. Default |
| Body large | 400 | 15px / 0.9375rem | same | same | `--text-body-lg` (status pages, USP title is 15/700) |
| Small / caption | 400 | 13px / 0.8125rem | same | same | `--text-small`, `--text-footer-note` |
| Tiny / badge | 700 | 11.998px / 0.7499rem | same | same | `--card-badge-size`; `--text-micro` is the 11px round form |
| Nano | 700 | 10px / 0.625rem | same | same | `--text-nano`, cart count |
| Card category tag | 400 | 11.2px / 0.7rem | 11.2px | 11.998px / 0.7499rem | `--card-cats-size-handheld` / `--card-cats-size` |
| Card title | 700 | 11.998px / 0.7499rem | 11.998px | 14px / 0.875rem | `--card-title-size-handheld` / `--card-title-size`. Two lines: 28px / 36px box |
| Card price | 400 | 16.002px / 1.0001rem | 16.002px | 20.006px / 1.2504rem | `--card-price-size-handheld` / `--card-price-size` |
| Card strike | 400 | 9.6012px / 0.6001rem | 9.6012px | 12.0036px / 0.7502rem | `--card-price-del-size-*` |
| PDP current price | 400 | 35px / 2.1875rem | same | same | `--pdp-price-size`, leading 45.01px, colour `--color-price` |
| PDP strike | 400 | 21px / 1.3125rem | same | same | `--pdp-price-del-size`, leading 31.5px |
| PDP meta | 400 | 13.006px / 0.8129rem | same | same | `--pdp-meta-size`, leading 18.0133px |
| PDP / card eyebrow | 400 | 11.998px / 0.7499rem | same | same | `--pdp-eyebrow-size`, leading 17.2771px |
| Add-to-cart label | 700 | 14px / 0.875rem | same | same | `--btn-atc-size` |
| Place-order label | 700 | 19.418px / 1.2136rem | same | same | `--btn-order-size` |
| Footer widget title | 700 | 16px / 1rem | same | same | `--text-footer-head` |
| Footer link | 400 | 14px / 0.875rem | same | same | `--text-footer-link`, leading ~24px |
| Footer phone | 500–700 | 20px / 1.25rem | same | same | `--text-footer-phone`. Digits stay LTR (section 10) |
| Newsletter heading | 500 | 20.006px / 1.2504rem | same | same | `--text-newsletter-head`, leading 48.5946px |
| Newsletter note | 400 | 14.994px / 0.9371rem | same | same | `--text-newsletter-note`, leading 25.6997px |
| USP title | 700 | 15px / 0.9375rem | same | same | feature bar, hidden as empty 31px strip at 380 |
| USP subtitle | 400 | 13px / 0.8125rem | same | same | live muted `#767676`; shipped `--color-muted` |
| Drawer row | 400 | 14px / 0.875rem | same | n/a (desktop has no drawer) | 50px row height |
| Admin / supplier chrome | 400–700 | 12–15px | same | same | `--text-tiny` 12px. Not measured from live; no counterpart |

### 2.3 Line-height rules

`--text-*` tokens are size only. Pairing a line-height onto the size token would reflow every 1:1 comparison. Paired leadings are their own `--leading-*` tokens.

Do not "tighten" Hebrew line-height against a Latin sample. Hebrew has almost no ascenders or descenders; live's 23.996 body and 32.0051 PDP title are already a Hebrew measurement.

---

## 3. Spacing

### 3.1 Named scale (padding frequency on the live reference)

15px leads because Electro / live is a Bootstrap 3 grid. That is why containers carry 15px of inline padding rather than 16.

| Token | Value | rem | Frequency / role |
|---|---|---|---|
| `--spacing-xs` | 4px | 0.25rem | Tight inset, badge pad |
| `--spacing-sm` | 8px | 0.5rem | Compact gap |
| `--spacing-md` | 10px | 0.625rem | Card footer gaps |
| `--spacing-gutter` | 15px | 0.9375rem | Grid gutter. Most common non-zero padding (862) |
| `--spacing-lg` | 14px | 0.875rem | Handheld card pad |
| `--spacing-xl` | 20px | 1.25rem | Card pad-top at 1440 |
| `--spacing-2xl` | 24px | 1.5rem | Card inline pad at 1440 |
| `--spacing-touch-min` | 44px | 2.75rem | WCAG 2.5.5 floor. Live's hamburger paints 34×36; hit area pads out to 44 |

Numeric Tailwind spacing (`p-4` and friends) still works. Named steps exist for values the default scale has no entry for.

### 3.2 Measured layout boxes (not a scale)

These are heights and widths of specific landmarks. Do not reuse them as generic padding.

| Token | 380 | 768 | 1440 |
|---|---|---|---|
| `--spacing-topbar-handheld` / `--spacing-header-topbar` | 112px + 1px border = 113 (three wrapped info rows + home greeting) | 37.3px + 1 = 38 | 37.3px + 1 = 38 |
| `--spacing-topbar-row` | 37.333px | 37.333px | 37.333px |
| `--spacing-header-handheld` / `--spacing-header-masthead` | 83px + 1 = 84 | 83px + 1 = 84 | 109px + 1 = 110 |
| `--header-height` | 70px (legacy alias; do not use for the live shell) | | |
| `--spacing-logo-w` × `--spacing-logo-h` | 100 × 26 (`--spacing-handheld-logo-*`) | 100 × 26 | 52 × 79 (desktop logo box; source image 300×79) |
| `--spacing-hero-mobile` / `-tablet` / `-desktop` | 213px | 495px | 613px |
| `--spacing-hero-slider-*` | 193px module | 304px | 370px |
| `--spacing-feature-bar-mobile` / `--spacing-feature-bar` | 31px (empty strip) | 134px | 134px |
| `--spacing-deals-top` | 2px (live) / token 3px (1440 measurement) | 3px | 3px |
| `--spacing-drawer-mobile` / `-tablet` | 280px | 350px | hidden |
| `--spacing-drawer-row` | 50px | 50px | n/a |
| `--spacing-nav-row` | n/a | n/a | 45px |
| `--spacing-region-menu` | n/a | n/a | 200px |
| `--spacing-newsletter-bar` | 80px | 80px | 80px |
| `--spacing-newsletter-min` | full width | full width | 470px |
| `--spacing-newsletter-field` | 41px | 41px | 41px |
| `--spacing-footer-logo-w` × `-h` | 160 × 42 | same | same |

### 3.3 Product-card gaps (rect to rect, not margin)

| Token | 380 | 768 | 1440 |
|---|---|---|---|
| `--card-gap-cats-price-*` | 4.48px | 4.47px | 7.98px |
| `--card-gap-price-title-*` | 1.98px | 1.98px | 0.99px |
| `--card-gap-title-thumb` | 8px | 8px | 8px |
| `--card-gap-thumb-footer` | 9.98px | 9.99px | 9.98px |
| `--card-pad-*` (inline) | 14px | 14px | 23.98px |
| `--card-pad-top-*` | 14px | 14px | 20px |

---

## 4. Radius

Live is overwhelmingly square: 22740 of 23952 measured elements (94.9 percent) carry `0px`.

| Token | Value | Count | Where it is used |
|---|---|---|---|
| `--radius-none` | `0px` | 22740 | Default. Cards on live have no rounding |
| `--radius-sm` | `4px` | 138 | Small chips, sale-badge, inputs |
| `--radius-panel` | `8px` | 21 | USP / benefit panel. Electro card radius |
| `--radius-md` | `7px` | 42 | Dropdown panels, some cards |
| `--radius-pill` | `22px` | 611 | Search/newsletter pill, tags, secondary buttons, card ATC |
| `--radius-lg` | `25px` | 21 | Large panels, search form |
| `--radius-atc` | `25.2px` | product ATC from 768 | `--btn-atc-radius` |
| `--radius-atc-handheld` | `6px` | product ATC at 380 | `--btn-atc-radius-handheld` |
| `--radius-order` | `50px` | 45 | Place-order pill, skip link |
| `--radius-half` | `50%` | 55 | Circular avatars and icon chips |
| `--radius-round` | `200px` | 96 | Hero promo pills, near-circle buttons |
| `--radius-pill-start` | `0 22px 22px 0` | 21 | Search input, measured on an RTL document (already the painted corners) |
| `--radius-pill-end` | `22px 0 0 22px` | 21 | Search submit beside it |

Apply split radii with logical longhands (`border-start-start-radius` and friends) if the component must flip in an LTR island. The four-value shorthands above are physical snapshots of RTL.

Not promoted (fewer than 10, or a one-off widget): `3px`, `2px`, `4.998px`, `20px`, `20.006px`, `21.994px`.

---

## 5. Shadow

The 2026-09-04 computed dump did not intern `box-shadow` as a first-class key in every row. The two shadows any component may use are Electro's, mirrored from `ELECTRO.shadow` in `src/styles/tokens.ts`. Do not invent a third.

| Token | Value | Where it is used |
|---|---|---|
| `--shadow-card` | `0px 2px 8px rgba(0, 0, 0, 0.08)` | Resting elevation on a card that is allowed to lift |
| `--shadow-card-hover` | `0px 4px 16px rgba(0, 0, 0, 0.12)` | Hover elevation. Transition `box-shadow 300ms ease-in-out` |
| `--shadow-consent-banner` | `0 -4px 16px rgba(0, 0, 0, 0.08)` | Consent banner, upward because it is `fixed bottom` |

Live storefront cards are mostly flat (no shadow). A shadow is an Electro affordance for interactive chrome (dropdowns, drawers, dialogs), not for the product grid.

---

## 6. Z-index layers

Named layers, not magic numbers. A new surface picks the next named slot, it does not invent 999.

| Layer | z-index | Surfaces |
|---|---|---|
| `z-base` | 0 | Page flow, inactive hero slides |
| `z-raised` | 2 | Sale badge on a thumbnail, gallery badge, in-card overlay that must sit above the image |
| `z-hero-copy` | 10 | Hero text column over the slide image |
| `z-hero-controls` | 20 | Hero bullets. Admin and supplier sticky headers also sit here (those shells are not the storefront stacking context) |
| `z-popover-inline` | 30 | Header search suggestions (the storefront currently ships no search UI; the slot is reserved so a future field does not collide) |
| `z-sticky` | 40 | Storefront masthead (`sticky top-0`). WhatsApp float and PWA install prompt share this band, below overlays |
| `z-overlay` | 50 | Drawer backdrop and panel, dialog overlay and content, dropdown menus, select content, mini-cart panel, admin command palette |
| `z-overlay-plus` | 60 | Mini-cart nested chrome, checkout sticky pay bar |
| `z-skip` | 100 | Skip link on focus (`focus:z-[100]`) |
| `z-outlier-deals` | 999 | Existing deals-card hover overlay. Do not copy. Next overlay uses `z-overlay` |

Consent banner is `fixed bottom-0` in document flow reservation (`padding-bottom` on `body`) rather than a z-index fight. It still paints above in-flow content; do not place a sticky pay bar under it on a phone until consent is decided.

---

## 7. Breakpoints

The three widths `compare.mjs` scores, plus the Tailwind stops the layout actually switches at, plus two measured one-off stops.

| Token / stop | Value | Role |
|---|---|---|
| `--breakpoint-mobile` | `380px` | Compare narrow. Not a Tailwind default |
| `--breakpoint-tablet` | `768px` | Compare middle. Equals Tailwind `md` |
| `--breakpoint-desktop` | `1440px` | Compare wide. The reference viewport |
| Tailwind `sm` | `640px` | Consent-banner layout; benefit-bar neighbours |
| Tailwind `md` | `768px` | Feature bar appears; card footer goes one-line; top bar becomes a single row |
| Tailwind `lg` | `1024px` | Home grid goes 4-up; hero side columns remain hidden (live uses `xl`) |
| Tailwind `xl` | `1280px` | Handheld header (hamburger, 84px masthead) yields to desktop masthead + nav. Live's own switch is `hidden-xl-up` / `d-xl-block`, so 768 **and 1024** still get the handheld header |
| Benefit-bar stack | `374px` | Below it, each USP item stacks icon above label. Measured: 375 and up is clean; 360 still overflows by 2px |
| Checkout stepper labels | `560px` | Below it the label hides and the numeral carries the step |
| Checkout single column | `992px` | Electro's own stacked checkout |

Do not write `min-[380px]` in a component. Use the named token or `md:` / `xl:`.

Home product grid columns (live): **1 / 2 / 4** at 380 / 768 / 1440. Category archive columns implied by card widths: **2 / 3 / 5**.

---

## 8. Container widths

Inline padding on every storefront container is `--spacing-gutter` (15px), not 16.

| Token | Width | At 1440 content edges | Where it is used |
|---|---|---|---|
| Brief container | `1320px` | (not painted) | Named in project facts. Not a CSS token. See 0.1 |
| `--container-page` | `1200px` | x135..x1305 | Default page, header, store footer on the PDP |
| `--container-hero-row` | `1170px` | x135..x1305 of a 1170 box inside the 1440 viewport | Home hero three-column row |
| `--container-deals` | `1150px` | slightly inset vs page | Home deals grid |
| `--container-store-footer` | `1200px` | x135..x1305 | PDP / inner footer |
| `--container-footer` | `1430px` | wider than the page | Home footer (`home/Footer.tsx` only). Not the same box as `--container-store-footer` |
| `--cat-container` / `--pdp-container` | `1170px` | catalog and PDP columns | Category archive, product summary + gallery |
| `--pdp-gallery` | `470px` | x835..x1305 | Gallery column |
| `--pdp-summary` | `700px` | x135..x805 | Summary column |
| `--pdp-column-gap` | `15px` | gutter | Between gallery and summary |

Card boxes:

| Token | 380 | 768 | 1440 |
|---|---|---|---|
| `--card-w-*` | 175px | 230px | 234px |
| `--card-h-*` | 369.69px | 424.69px | 437.52px |
| `--card-thumb-*` | 147px | 202px | 186.03px |

Hero module (slider, not a static banner; five slides at every width):

| Token | 380 | 768 | 1440 |
|---|---|---|---|
| Module | 350 × 193 | 729 × 304 | 727.89 × 370 |
| Aspect | 1.8135 | 2.3980 | 1.9673 |
| Side banners | absent | absent | 201.36 × 197, three stacked |
| Category strip | absent | present, 170 tall | 727.89 × 170, five items 145.58 wide, sharing the slider's x |

Electro home-v7 is the structural skeleton of that hero (category column 241×593, side banners, strip). Colour and copy still come from live.

---

## 9. Motion

Keep it to two or three intentional motions on marketing surfaces.

| Token / value | Where |
|---|---|
| `--btn-transition` (0.15s ease-in-out on colour, fill, border, shadow) | Every measured button |
| `box-shadow 300ms ease-in-out` | Card hover lift |
| `transition-transform duration-300` | Drawer enter from inline-end |
| Hero auto-advance | 5s per slide, pause on `prefers-reduced-motion` |
| `motion-reduce:transition-none` | Drawer, any transform that is not opacity |

No bounce, no layout-shifting entrance on first paint. CLS stays 0 on scored pages.

---

## 10. RTL rules

Root: `<html lang="he" dir="rtl">`. Every page inherits this. `dir="ltr"` is allowed only for a Latin-or-numeric island (codes, URLs, isolated prices), never as a page default.

### 10.1 Logical properties (required)

Physical left/right is forbidden in storefront CSS and Tailwind classes.

| Physical (forbidden) | Logical (required) |
|---|---|
| `pl-*` / `pr-*` | `ps-*` / `pe-*` |
| `ml-*` / `mr-*` | `ms-*` / `me-*` |
| `left-*` / `right-*` | `start-*` / `end-*` |
| `text-left` / `text-right` | `text-start` / `text-end` |
| `border-l` / `border-r` | `border-s` / `border-e` |
| `rounded-l` / `rounded-r` | `rounded-s` / `rounded-e` |
| `scroll-ml` / `scroll-mr` | `scroll-ms` / `scroll-me` |
| `origin-top-left` | `origin-top-left rtl:origin-top-right` (no logical origin exists) |
| `translate-x-full` | `translate-x-full rtl:-translate-x-full` (no logical translate exists) |

`gap-*` is direction-neutral and safe. Flex default row in RTL already runs right to left; prefer `justify-between` and start/end alignment over `justify-start` as a way to "put it on the right".

Drawers and off-canvas panels enter from **inline-end** (visual left in RTL on this site? No: inline-end in RTL is the visual left. Live's handheld hamburger is at the inline-start, which in RTL is the visual **right**, x=319 at 380. Cart icons sit at inline-end, visual left. Follow live's DOM order, not an English wireframe.)

Correction, stated once so it cannot be inverted: in RTL, **inline-start is the right edge** and **inline-end is the left edge**. The hamburger is first in DOM, therefore inline-start, therefore visual right, matching live.

### 10.2 Direction-aware spacing

- Padding and margin that mean "away from the bound edge" use `ps`/`pe`/`ms`/`me`.
- A 15px gutter is `px-[15px]` only when both sides are equal; that is direction-neutral and allowed.
- Absolute `left` / `right` in a hero overlay must be rewritten to `inset-inline-start` / `inset-inline-end`, or paired with an `rtl:` override.
- Split pill radii: see `--radius-pill-start` / `--radius-pill-end`. Prefer logical radius longhands for new work.

### 10.3 Icon mirroring

Use the `rtl:` variant, never a JavaScript direction flag. Prefer `scale-x-[-1]` over `rotate-180` unless the glyph is symmetric top to bottom (`rotate-180` also turns it upside down).

**Mirror these** (they point along the reading axis):

- Chevrons and arrows: back, forward, next, previous
- Breadcrumb separators
- Carousel / slider previous and next
- Pagination arrows
- Drawer open/close caret
- Send, reply, forward
- Undo and redo as a pair
- Checkout step arrows
- Text-align, indent, outdent glyphs
- Any composite that contains an arrow (export tray, login door)

**Do not mirror these:**

- The KenyonExpress logo (a mark, not a direction)
- WhatsApp and Facebook marks (third-party; also never recoloured with `--color-brand-*`)
- Clocks and clockwise / anticlockwise refresh (a mirrored spinner reads as undo)
- Media transport: play, pause, fast-forward, rewind (media time is LTR in every locale)
- Checkmarks and crosses
- Magnifier (handle stays bottom-end worldwide). This storefront currently ships no search UI
- Cart, bag, truck, pin, user, lock, trash (object glyphs). A delivery van faces a direction but is an object; live does not mirror it
- Numbers drawn inside a glyph (digits stay LTR)
- A slash in a "no entry" overlay
- Hamburger (symmetric). Its **position** flips via DOM order, not via a transform

A `<details>` chevron: closed points along the inline axis and must mirror; open points down and must not be double-transformed.

### 10.4 What must not mirror or reverse (bidi islands)

European digits are `EN` and lay out left to right **inside** an RTL paragraph. That is correct. Reversing a number produces `05.432,1`.

| Content | Isolation | Must not |
|---|---|---|
| Prices (`₪1,234.50`) | `dir="ltr"` on the amount element, or `<bdi>` inside a Hebrew sentence. Formatter: `shekels(agorot)` in `src/lib/money-format.ts`. Integer agorot in, always. Shekel glyph is a literal `₪` on the left of the digits | Use `Intl` `style: 'currency'` on a page (it injects invisible bidi marks). Use `toFixed` or any float. Mirror the glyph to the right "because RTL" |
| Numerals in copy (quantities, percentages, ratings) | Isolate a `%` that sits against Latin. A bare `20%` in a Hebrew sentence is usually fine | Reverse the digits |
| Phone numbers (`05X-XXXXXXX`, `+972-50-…`) | `<bdi dir="ltr">` especially for the `+972` form (the leading `+` is a bidi trap) | Mirror, or put the plus at the visual left by reversing the string |
| Latin brand names (`Express`, `KenyonExpress`, `Cardcom`, `WhatsApp`) | Usually nothing. A single Latin word with no adjacent punctuation resolves correctly. Isolate if a bracket, slash or trailing period sits against it | Mirror the Latin, or wrap the whole Hebrew sentence in `dir="ltr"` |
| Coupon codes, order ids, SKUs, TOTP, URLs, emails, hashes | `dir="ltr"` when the value is the whole element; `<bdi>` when it sits inside a Hebrew sentence | `unicode-bidi: bidi-override` (renders Hebrew backwards). Invisible U+200E / U+200F in stored strings |
| Dates from `toLocaleDateString('he-IL')` | Do **not** wrap in `dir="ltr"` (that reverses day, month and year) | Convert a relative "in three days" into persisted copy |
| User-entered text of unknown language | `dir="auto"` on the input or the rendered body | Force RTL on a Latin review |

`shekels()` rules that affect layout: two agorot digits always (`₪5.00` not `₪5`); thousands grouped with `he-IL`; minus before the glyph (`-₪12.00`); zero is `₪0`; never `toFixed`.

Live wraps every price amount in `<bdi>`. New work should match that for amounts inside sentences. A `dir="ltr"` wrapper remains correct when the amount is the whole node.

### 10.5 Hebrew wrapping

A Hebrew word cannot be hyphenated by the browser. `overflow-wrap: break-word` will split mid-letter. Size the container from the rendered Hebrew, not from an English stand-in. The 374px benefit-bar breakpoint exists because the label will not shrink past its longest Hebrew word.

`text-overflow: ellipsis` puts the ellipsis at the visual left in RTL only if `direction` is inherited. A `dir="ltr"` wrapper moves it to the right.

---

## 11. Forbidden pairings (gates)

| Pairing | Ratio | Verdict |
|---|---|---|
| White on `#fed700` | 1.41:1 | Forbidden. Live paints it on product ATC from 768 up. We do not |
| White on `#44b81b` (live sale badge) | 2.59:1 | Forbidden. Use `--color-sale-badge` `#328614` |
| White on `#ee6443` (live buy-now) | 3.21:1 | Forbidden as a resting label. Use `--pdp-buy` `#c94b28` |
| White on `#ff6b00` (live promo) | 2.86:1 | Forbidden. Use `--color-promo-flame` `#c24d00` |
| `#fed700` as text on white | 1.41:1 | Forbidden. Use `--color-link` or `--color-heading` |
| `#a78e00` with slate ink | 3.39:1 | Allowed only as a momentary `:active` fill, never at rest |

---

## 12. Revision

| Date | Change |
|---|---|
| 2026-09-07 | Initial `docs/ui-design-system/TOKENS.md`: full token reference compiled from `tokens.css`, `packages/ui/tokens.css`, `TOKEN-PROVENANCE.md`, `DESIGN-SYSTEM.md`, `RTL-PITFALLS.md`, and the 2026-09-04 live capture |
