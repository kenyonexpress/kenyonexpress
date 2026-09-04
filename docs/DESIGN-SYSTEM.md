# DESIGN-SYSTEM.md

The KenyonExpress token layer, stated once, with the hex of every colour, its
measured contrast against white and against `#111111`, the approved usage of
each, the full spacing and type scale, component anatomy for the five parts of
the funnel that carry money, the RTL rules with a complete logical-property
mapping, and the definition of the `compare.mjs` gate at 380, 768 and 1440.

Status: reference. Docs only. Nothing here changes behaviour; the code it
describes is `src/styles/tokens.css`, and that file is the source of truth.

---

## 0. Provenance, and one correction to this document's own brief

The brief for this document named two sources:

```
refs/ke_live_computed.json
electro_madrasthemes_com-DESIGN.md
```

Neither file exists in this worktree. Checked by name, by glob and by content
across the whole tree excluding `node_modules` and `.git`. The second name does
not exist anywhere in the repository under any spelling.

That is a naming problem, not a data problem. Every number in this document is
still measured, and the measurements are the ones those two names refer to:

| The brief's name | What actually carries those values here |
|---|---|
| `refs/ke_live_computed.json` | `src/styles/tokens.css` (every token carries a provenance comment naming that dump), plus `DESIGN-MEASURED.md` |
| `electro_madrasthemes_com-DESIGN.md` | `src/lib/electro-hero-tokens.ts` (`ELECTRO_HERO`), measured off `electro.madrasthemes.com/home-v7` |

`refs/ke_live_computed.json` is a computed-style dump of the live site
(`kenyonexpress.co.il`) across seven templates at 380, 768 and 1440, captured
with Playwright chromium via `getComputedStyle` and `getBoundingClientRect`. It
is not committed. Its findings were counted out into the token file at the time
of capture, comment by comment, and it is the token file that the tests read:

```
src/styles/tokens.test.ts
```

That test asserts three things, and they are what make this document
enforceable rather than descriptive:

1. Every colour in `SITE` in `src/styles/tokens.ts` appears in `tokens.css` as
   `--color-<name>`.
2. Every value matches.
3. No `.tsx` file under `src/` names a raw hex or a raw `rgb()`.

So a component reaches a colour only through the Tailwind utility a property
here generates: `bg-brand`, `text-heading`, `border-rule`. If a hex appears in
a component, the suite fails and names the file.

### Three values a design brief asked for that live does not use

Checked three ways each (parsed styles, colour-frequency count, raw grep of the
reference). All three appear zero times on the live site:

| Brief said | Reference measures | Kept |
|---|---|---|
| price red `#E4002B` | `rgb(220,53,69)` = `#dc3545`, on 456 elements | `#dc3545` |
| container `1320px` | `1170px` (84 elements) and `1200px` (87); 1320 never occurs | `1200px` |
| Heebo font stack | `"Open Sans"` on 12024 elements | Heebo |

The first two are kept as measured, because the gate that closes every UI step
is `compare.mjs` against that same reference: adopting either brief value would
raise the pixel difference the work is scored on.

Heebo is the deliberate exception and is kept **against** the reference. Live
renders Hebrew through an unnamed browser fallback behind `"Open Sans"`, which
has no Hebrew glyphs at all. This is a Hebrew RTL storefront, so the font that
actually paints the text is the one that has to be chosen on purpose.

---

## 1. Colour

Every token in `src/styles/tokens.css`, its hex, and its measured WCAG 2.1
contrast ratio. Ratios computed from the sRGB relative-luminance formula, to two
decimals, in this document's own pass. `AA` in the last column is the verdict
for **normal-size text on white**: 4.5:1 or better passes, 3.0 to 4.49 passes
only at large text (18.66px bold or 24px regular), below 3.0 fails outright.

A `fail` in that column is not a defect. Most of these tokens are surfaces and
hairlines, and a surface has no contrast requirement of its own: what matters is
the ink placed on it. The `usage` column says which role each token holds, and
section 1.4 gives the ink/surface pairs that were actually measured.

### 1.1 Brand identity

| Token | Hex | vs `#ffffff` | vs `#111111` | AA on white | Approved usage |
|---|---|---|---|---|---|
| `--color-brand-primary` | `#fed700` | 1.41:1 | 13.43:1 | fail | **Surface only.** CTA fills, active state, badges. Never text. |
| `--color-brand-primary-hover` | `#fedd26` | 1.35:1 | 14.01:1 | fail | Hover/pressed fill for the above. Surface only. |
| `--color-brand-dark` | `#1a1a1a` | 17.40:1 | 1.08:1 | pass | Dark body text and dark surfaces. |
| `--color-brand-accent` | `#eaf4f6` | 1.12:1 | 16.88:1 | fail | Tinted background, soft surface. Surface only. |
| `--color-brand` | `#fed700` | 1.41:1 | 13.43:1 | fail | Back-compat alias for `bg-brand`. Surface only. |
| `--color-brand-secondary` | `#fed700` | 1.41:1 | 13.43:1 | fail | Back-compat alias (cart badge). Surface only. |
| `--color-brand-light` | `#eaf4f6` | 1.12:1 | 16.88:1 | fail | Back-compat alias for `bg-brand-light`. |
| `--color-accent` | `#eaf4f6` | 1.12:1 | 16.88:1 | fail | Back-compat alias for `bg-accent`. |

**The rule that has a gate of its own: brand yellow is not a text colour, and
nothing on brand yellow may be white.**

White on `#fed700` measures **1.41:1** against a 4.5:1 requirement. That is not
a near miss, it is illegible, and it shipped in two places until 2026-07-29 (the
header avatar button, and the discount badge on every coupon card, which is the
one number that card exists to advertise). Enforced by:

```
src/lib/a11y/brand-contrast.test.ts
```

The check is a source sweep rather than a rendered check, so it fails in CI in
under a second and the failure names the file. It is variant-aware: a class list
of `bg-footer-bg text-white hover:bg-brand-secondary hover:text-heading` is
correct twice over (dark with white at rest, yellow with dark ink on hover), and
a check that ignored the `hover:` prefix would report a violation that is not
there.

The same colour read the other way round (`text-brand` on white, 1.41:1) had no
gate at all until `--color-link` was introduced for it. See 1.2.

### 1.2 Functional colour

| Token | Hex | vs `#ffffff` | vs `#111111` | AA on white | Approved usage |
|---|---|---|---|---|---|
| `--color-price` | `#dc3545` | 4.53:1 | 4.17:1 | pass | Current price, site-wide. Measured on 456 live elements. |
| `--color-price-strike` | `#6f6f6f` | 5.02:1 | 3.76:1 | pass | Crossed-out original price. Darkened from `#9ca3af` (2.54:1, the worst text pairing left after the yellow sweep). |
| `--color-deal-price` | `#2d2d2d` | 13.77:1 | 1.37:1 | pass | Deals-card price ink. Live measured. |
| `--color-deal-sale` | `#c93636` | 5.17:1 | 3.65:1 | pass | Home-grid sale price **only**. Live paints two reds: `#dc3545` on 456 elements site-wide, this one on 57 home-card elements. Not an alias for `--color-price`. |
| `--color-deal-badge` | `#ee0000` | 4.53:1 | 4.17:1 | pass | Home-card discount badge fill, with white 12px/700 on it (4.53:1). |
| `--color-success` | `#5cb85c` | 2.48:1 | 7.61:1 | fail | **Surface/icon only.** Confirmation fill, in-stock dot. Never as text on white. |
| `--color-link` | `#0062bd` | 6.03:1 | 3.13:1 | pass | Product names and links. The replacement for `text-brand`, which axe reported as a serious violation on `/login`, `/signup`, `/suppliers` and `/coupons`. |
| `--color-heading` | `#333e48` | 10.92:1 | 1.73:1 | pass | Hero and section headings, and the default ink on brand yellow (7.76:1). |
| `--color-sale-badge` | `#328614` | 4.61:1 | 4.10:1 | pass | On-sale badge fill, white text on it (4.61:1). Darkened from live's `#44b81b`, which carries white at **2.59:1**. |
| `--color-promo-flame` | `#c24d00` | 4.82:1 | 3.92:1 | pass | Promo card CTA fill, white 12px/700 on it (4.82:1). Darkened from `#ff6b00`, which is 2.86:1 with white and 3.82:1 with `#333e48`, so dark ink does not rescue it either. |

### 1.3 Neutrals, borders, muted text, surfaces

| Token | Hex | vs `#ffffff` | vs `#111111` | AA on white | Approved usage |
|---|---|---|---|---|---|
| `--color-border` | `#dddddd` | 1.36:1 | 13.90:1 | fail | Default hairline and divider. Non-text; no contrast requirement. |
| `--color-border-alt` | `#e7e7e7` | 1.24:1 | 15.27:1 | fail | Secondary border (category strip). |
| `--color-rule` | `#ededed` | 1.17:1 | 16.13:1 | fail | Rule under a section-header tab strip. |
| `--color-muted` | `#6f6f6f` | 5.02:1 | 3.76:1 | pass | Muted secondary text. Darkened from live's `#767676`, which is 4.54 on white but **4.16 on the `#f5f5f5` panels the product page uses it on**, which axe reported as serious. This value is 5.02 and 4.61 on those two surfaces. |
| `--color-muted-2` | `#657888` | 4.57:1 | 4.13:1 | pass | Muted slate-blue product meta. |
| `--color-icon` | `#515151` | 7.94:1 | 2.38:1 | pass | Nav and masthead icon grey. |
| `--color-icon-empty` | `#cccccc` | 1.61:1 | 11.76:1 | fail | Large empty-state glyphs only. Decorative; must never be the only carrier of meaning. |
| `--color-surface` | `#ffffff` | 1.00:1 | 18.88:1 | fail | Cards, inputs, table paper. |
| `--color-ink` | `#000000` | 21.00:1 | 1.11:1 | pass | Admin console text, denser than `brand-dark`. |
| `--color-surface-hover` | `#f5f5f5` | 1.09:1 | 17.32:1 | fail | Row/menu hover tint. |
| `--color-track` | `#f1f2f4` | 1.12:1 | 16.86:1 | fail | Chart bar and progress track. |
| `--color-bottom-bar` | `#eaeaea` | 1.20:1 | 15.70:1 | fail | Footer copyright bar fill; `#333e48` on it is 9.08:1. |
| `--color-warning-surface` | `#fffbe6` | 1.04:1 | 18.16:1 | fail | Inline warning banner fill. |
| `--color-footer-bg` | `#333e48` | 10.92:1 | 1.73:1 | pass | Dark footer body; white on it is 10.92:1. |
| `--color-drawer-bg` | `#fdfcfc` | 1.02:1 | 18.44:1 | fail | Off-canvas drawer paper. Live: `rgb(253,252,252)`. |
| `--color-background` | `#ffffff` | 1.00:1 | 18.88:1 | fail | Page background. |
| `--color-foreground` | `#1a1a1a` | 17.40:1 | 1.08:1 | pass | Default body text. |
| `--color-primary` | `#fed700` | 1.41:1 | 13.43:1 | fail | Tailwind semantic alias for brand-primary. Surface only. |
| `--color-primary-foreground` | `#1a1a1a` | 17.40:1 | 1.08:1 | pass | Text on primary. Black on yellow: **12.38:1**. |

### 1.4 Promo tints and third-party marks

| Token | Hex | vs `#ffffff` | vs `#111111` | AA on white | Approved usage |
|---|---|---|---|---|---|
| `--color-promo-rose` | `#fff5f5` | 1.07:1 | 17.65:1 | fail | Promo rail tint. Surface only. |
| `--color-promo-violet` | `#f5f5ff` | 1.08:1 | 17.43:1 | fail | Promo rail tint. Surface only. |
| `--color-promo-sky` | `#f0f7ff` | 1.08:1 | 17.49:1 | fail | Promo rail tint. Surface only. |
| `--color-whatsapp` | `#25d366` | 1.98:1 | 9.52:1 | fail | **The mark only.** Logo fill. Never link text. |
| `--color-whatsapp-ink` | `#075e54` | 7.67:1 | 2.46:1 | pass | WhatsApp link text. This is WhatsApp's own darker teal, not a colour this project invented, so the mark is not rebranded. `#128c7e` is 4.14:1 and axe fails it. |
| `--color-whatsapp-ink-hover` | `#043c36` | 12.32:1 | 1.53:1 | pass | Hover for the above. |
| `--color-facebook` | `#166fe5` | 4.73:1 | 3.99:1 | pass | Facebook link **label**, not the mark, so the logo exemption does not apply. `#1877f2` is 4.23:1 and axe fails it; this is Facebook's own hover blue. |

**Never rebrand a third-party mark with `--color-brand-*`.** When a mark's own
colour fails as text, reach for a darker shade *that the brand itself
publishes*, which is what both entries above do.

### 1.5 Alpha overlays and shadows

Colours that are only ever used at partial opacity cannot be a plain hex in
`SITE`, so they are their own tokens and `tokens.test.ts` refuses a raw `rgb()`
in a component the same way it refuses a raw hex.

| Token | Value | Usage |
|---|---|---|
| `--color-slider-dot-idle` | `rgba(125, 125, 125, 0.5)` | Hero slider inactive dot. `rgb(125,125,125)` is the fourth most common ink in the reference (180 elements); the slider paints it at half opacity. |
| `--color-overlay-hairline` | `rgba(0, 0, 0, 0.1)` | Consent-banner hairline. Deliberately neutral black, not a brand colour: the banner renders before hydration and above everything. |
| `--color-overlay-ink` | `rgba(0, 0, 0, 0.7)` | Consent-banner body ink. |
| `--shadow-consent-banner` | `0 -4px 16px rgba(0, 0, 0, 0.08)` | Consent banner lift. |
| `--shadow-card` | `0px 2px 8px rgba(0, 0, 0, 0.08)` | Card rest. |
| `--shadow-card-hover` | `0px 4px 16px rgba(0, 0, 0, 0.12)` | Card hover. |

The two card shadows are **not measured**. The reference dump records geometry,
colour, type and radius, and carries no `box-shadow` key, so there is nothing in
it to copy. These are the two the Electro template ships and they are the only
two any component may use. If a shadow ever needs to be 1:1 with live it has to
be measured first. Do not guess a third value.

### 1.6 Measured ink-on-surface pairs

The pairs that actually appear on screen, so a reviewer can check a screenshot
against a number rather than against a token name.

| Pair | Ratio | Verdict |
|---|---|---|
| `#333e48` on `#fed700` (default CTA) | 7.76:1 | pass |
| `#1a1a1a` on `#fed700` (`primary-foreground`) | 12.38:1 | pass |
| `#ffffff` on `#fed700` | 1.41:1 | **forbidden, gated** |
| `#ffffff` on `#333e48` (footer) | 10.92:1 | pass |
| `#333e48` on `#eaeaea` (copyright bar) | 9.08:1 | pass |
| `#333e48` on `#eaf4f6` (accent surface) | 9.76:1 | pass |
| `#ffffff` on `#328614` (sale badge) | 4.61:1 | pass |
| `#ffffff` on `#44b81b` (live's badge, not ours) | 2.59:1 | fail |
| `#ffffff` on `#ee0000` (deal badge) | 4.53:1 | pass |
| `#ffffff` on `#c24d00` (promo CTA) | 4.82:1 | pass |
| `#616161` on `#f7f7f7` (checkout step label) | 5.78:1 | pass |
| `#616161` on `#e4e4e4` (checkout step numeral) | 4.87:1 | pass |
| `#7a7a7a` on `#f7f7f7` (the step label before it was darkened) | 4.01:1 | fail |
| `#6f6f6f` on `#f5f5f5` (muted on PDP panel) | 4.61:1 | pass |
| `#767676` on `#f5f5f5` (live's muted, not ours) | 4.17:1 | fail |
| `#dc3545` on `#ffffff` (price) | 4.53:1 | pass |
| `#c93636` on `#ffffff` (deal sale price) | 5.17:1 | pass |

Six tokens deliberately depart from the live measurement, and every one of them
is a WCAG correction: `--color-price-strike`, `--color-muted`,
`--color-sale-badge`, `--color-promo-flame`, `--color-whatsapp-ink`,
`--color-facebook`, plus the checkout stepper's `#616161`. Live fails AA in each
of those places and the pixel gate tolerates 11%, so the correction fits inside
the budget. Every other value is live's.

### 1.7 The four toast colours

`<Toaster richColors />` takes its palette from sonner's own stylesheet, and all
four of its **light** pairs miss AA. Measured against the built page, not read
off the source: the toast title is 13px/500 and the description 13px/400, so 4.5
applies to both (14pt bold is 18.66px, and these are nowhere near it).

| Toast | Sonner's light pair | Ratio | Ours | Ratio |
|---|---|---|---|---|
| success | `#008a2e` on `#ecfdf3` | 4.26:1 | `hsl(140, 100%, 25.5%)` | 4.71:1 |
| info | `#0973dc` on `#f0f8ff` | 4.35:1 | `hsl(210, 92%, 43.5%)` | 4.61:1 |
| error | `#e60000` on `#fff0f0` | 4.35:1 | `hsl(360, 100%, 43.5%)` | 4.62:1 |
| warning | `#dc7609` on `#fffcf0` | 3.08:1 | `hsl(31, 92%, 35.5%)` | 4.68:1 |

Only the hue's lightness moves, by the smallest step that clears 4.5 with a
margin rather than landing on it. Backgrounds and borders are untouched, so the
toasts still read as the same four colours. Sonner's **dark** pairs all pass
(6.56 to 12.30) and are left alone; that theme is still reachable, because there
is no `ThemeProvider` in this app, so `useTheme()` returns `'system'` and sonner
follows the operating system even though the site has no dark mode.

The override is written as `html [data-sonner-toaster][data-sonner-theme="light"]`
and the `html` is load-bearing: sonner injects its `<style>` at runtime, after
this file's link, so at equal specificity the library wins and the override is
silently ignored. One element name takes it to (0,2,1) against the library's
(0,2,0).

---

## 2. The spacing scale

Measured by frequency of every non-zero padding across the reference:

```
15px (862)   10px (652)   24px (387)   8px (337)   14px (281)
20px (144)   16px (104)   12px (87)    4px (66)
```

15px leads because it is Bootstrap 3's gutter, which is the grid the live theme
is built on. That is why the container tokens below carry 15px of inline padding
rather than a round 16.

Declared as `--spacing-*` so Tailwind generates `p-` / `m-` / `gap-` / `h-` /
`w-` utilities from them. Numeric Tailwind spacing (`p-4` and friends) still
works and is unaffected; these are named steps for values the default scale has
no entry for.

| Token | Value | Utility |
|---|---|---|
| `--spacing-gutter` | `15px` | `p-gutter`, `gap-gutter`. The single most common value on the site. |
| `--spacing-xs` | `4px` | `p-xs` |
| `--spacing-sm` | `8px` | `p-sm` |
| `--spacing-md` | `10px` | `p-md` |
| `--spacing-lg` | `14px` | `p-lg` |
| `--spacing-xl` | `20px` | `p-xl` |
| `--spacing-2xl` | `24px` | `p-2xl` |

### 2.1 Containers

| Token | Value | What it is |
|---|---|---|
| `--container-page` | `1200px` | The page container. Measured 2026-09-02: the live body spans x135..x1305 at a 1440 viewport on every template inspected (header cart x135, logo right edge x1305), which is 1200 with 15px inline padding. The audit is `docs/HEADER-1TO1-2026-09-02`. |
| `--container-hero-row` | `1170px` | The hero's three-column block, x135..x1305 with the slider between the fixed side columns landing at 728. |
| `--container-footer` | `1430px` | `home/Footer.tsx` only. The footer and the deals grid do **not** share the page container. |
| `--container-store-footer` | `1200px` | `SiteFooter.tsx`. A different component from the above; the two are not the same box. `SiteFooter` used `--container-page` when that was 1320 and ran 68px wider on each side. |
| `--container-deals` | `1150px` | The deals grid. |

### 2.2 Measured layout boxes

Each was read off the live site. `--spacing-*` generates `h-` / `w-` / `min-w-`.

| Token | Value | Note |
|---|---|---|
| `--spacing-header-topbar` | `37.3px` | Plus a 1px border, the 38.3px live top bar at md and up. |
| `--spacing-header-masthead` | `109px` | Plus 1px border, live's 110px masthead. The old 127px shifted every homepage block down 17px, which showed as 30 to 42% band differences that looked like card defects; card heights were 485px on both sides all along. |
| `--spacing-topbar-handheld` | `112px` | Plus 1px, live's 113 at 380 (home only). |
| `--spacing-topbar-row` | `37.333px` | One info row. **Not 37**: three rows of a flat 37 are 111 inside a 112 box, and the leftover pixel moves every divider. Measured at 380: rows y52/y53 at 51 to 57% and y75/y112/y115 at a full 100%, which are exactly live's row boundaries at 37.33, 74.67 and 112. |
| `--spacing-header-handheld` | `83px` | Plus 1px, live's 84 at both 380 and 768. |
| `--spacing-logo-w` / `-h` | `52px` / `79px` | Desktop masthead logo, 300x79 at x1005 y53. |
| `--spacing-handheld-logo-w` / `-h` | `100px` / `26px` | Handheld logo: 100x26 at x205 y141 (380) and x578 y66 (768). |
| `--spacing-footer-logo-w` / `-h` | `160px` / `42px` | |
| `--spacing-newsletter-min` | `470px` | Live newsletter pill, 470x41. |
| `--spacing-newsletter-field` | `41px` | |
| `--spacing-newsletter-bar` | `80px` | |
| `--spacing-deals-top` | `3px` | Live's gap between the feature bar and the first card row: 3px at 1440 (bar ends 895, grid starts 898) and 2px at 380. The old 30px was compensating for a feature bar of the wrong height and pushed the grid a row out of step. |
| `--spacing-drawer-mobile` / `-tablet` | `280px` / `350px` | Off-canvas drawer. |
| `--spacing-drawer-row` | `50px` | Eleven rows at 14px type = 550px, which is exactly `KE_LIVE_CATEGORIES`. |
| `--spacing-nav-row` | `45px` | The region menu's `secondary-nav` row, 44.996px of line-height at 1440. |
| `--spacing-region-menu` | `200px` | The dropdown under it: a flat 200px wide with `8px 0` padding on a 2px `rgb(254,215,0)` top border, which is `--color-brand-primary` exactly. |
| `--spacing-touch-min` | `44px` | WCAG 2.5.5. Live's hamburger is 34x36, under the floor. Ours keeps live's **painted** size and pads the hit area out to 44, so the pixel comparison sees live's button and a thumb gets the target. |

### 2.3 The shell and the hero are responsive, at all three gate widths

The live shell is responsive and ours was not: one fixed 37.3 + 109 masthead was
served at every width, 51px short of live at 380 and 24px tall at 768, and
everything below the header inherits that offset band by band.

| Width | Top bar | Header | What the header is |
|---|---|---|---|
| 380 | 113 | 84 | Handheld: icons, logo, hamburger |
| 768 | 38 | 84 | Handheld: the same, wider |
| 1440 | 38 | 110 | Masthead: logo + nav, no hamburger |

That table is the **home page only**, and reading the 113 as a property of the
width was a real defect. Measured against the live site directly at 380:

| Page | Top bar | Header |
|---|---|---|
| `/` | 113 | 50 |
| `/products/` | 76 | 83 |
| `/cart` | 76 | 83 |

The 37px difference is one top-bar row, and that row is the greeting
`ברוך הבא לעולם של קניון Express`, which live renders on the home page only.
Without it the four info items wrap onto two rows instead of three. The fix is
content-driven height: the handheld bar carries no height at all, the rows wrap,
and the bar is as tall as they make it (2 x 37.333 = 75 on an inner page, 3 x
37.333 = 112 on home, against live's 76 and 113 including the border).

The greeting is gated in CSS with `:has()` against an inert marker the home page
renders, **not** by `usePathname()`: reading the pathname in the header would
opt the whole subtree into dynamic rendering and fail the build on unrelated
prerendered routes.

The hero row:

| Width | Hero row | Slider | Category strip | Side columns |
|---|---|---|---|---|
| 380 | 213 | 213 | absent | absent |
| 768 | 495 | 304 | 170 | absent |
| 1440 | 613 | 370 | 170 | present |

| Token | Value |
|---|---|
| `--spacing-hero-mobile` | `213px` |
| `--spacing-hero-tablet` | `495px` |
| `--spacing-hero-desktop` | `613px` |
| `--spacing-hero-slider-tablet` | `304px` |
| `--spacing-hero-slider-desktop` | `370px` |
| `--spacing-feature-bar-mobile` | `31px` |
| `--spacing-feature-bar` | `134px` |

`HeroSection` carried one inline height (593) at every viewport, and because the
whole page sits under it the error compounded: the product grid started 967px
too low at 380 and 434px too low at 768, while 1440 was exact. The side columns
were already `hidden lg:flex`; what was missing is that the **row** kept its
desktop height with nothing in it.

Live collapses the feature bar to an empty 31px strip at 380 (the five
`.feature` blocks are not rendered at all below md) and it is a flat 134px at
**both** 768 and 1440. Ours was 223 at 768 and 76 at 1440, because it was sized
by its content instead of by the measurement.

### 2.4 Radii

Counted across all seven templates at all three widths. The live site is
overwhelmingly square: **11863** elements carry `border-radius: 0px` against
**519** that carry anything at all. These five are every rounded value that
appears more than ten times, so a component that needs a corner has a token and
does not invent a sixth.

| Token | Value | Occurrences | Usage |
|---|---|---|---|
| `--radius-none` | `0px` | 11863 | The default. Stated so it can be named. |
| `--radius-sm` | `4px` | 127 | Buttons, inputs, small chips. |
| `--radius-md` | `7px` | 28 | Cards, dropdown panels. |
| `--radius-lg` | `25px` | 14 | Modal and large panel corners. |
| `--radius-pill` | `22px` | 188 | The search/newsletter pill and tags. |
| `--radius-round` | `200px` | 96 | Avatars and icon buttons. |

### 2.5 Breakpoints

The three widths `compare.mjs` measures at, declared so the responsive gate and
the CSS agree on where the layout is allowed to change. 380 and 1440 are not
Tailwind defaults (`sm` is 640, `xl` is 1280), which is exactly why they are
named: a `min-[380px]` arbitrary value in a component is a breakpoint nobody can
grep for. Tailwind's own `sm`/`md`/`lg`/`xl`/`2xl` remain available and
unchanged.

| Token | Value | Role |
|---|---|---|
| `--breakpoint-mobile` | `380px` | `compare.mjs` narrow |
| `--breakpoint-tablet` | `768px` | `compare.mjs` middle; equals Tailwind `md` |
| `--breakpoint-desktop` | `1440px` | `compare.mjs` wide; the reference viewport |

Two component-level breakpoints exist outside this scale and are documented
where they are declared, because each was measured for one element:

- **374px**, `globals.css`: below it the benefit bar's five items stack instead
  of sitting icon-beside-label. The icon alone is 36px and the label will not
  shrink past its longest Hebrew word, so the 68px pair cannot go into 64 side
  by side. Measured: 320 -> document 326 (+6), 340 -> 344 (+4), 360 -> 362 (+2),
  375 -> 375 clean. The breakpoint is 374 and not a round 400 because a bar that
  already fits should not be relaid out.
- **560px**, `checkout-page.css`: below it the stepper's labels visually hide and
  the numeral carries the step.
- **992px**, `checkout-page.css`: the stepper itself steps out and every step
  section paints stacked, which is Electro's own single-column checkout.

---

## 3. The type scale

Font family: **Heebo drives all text site-wide**, Hebrew and Latin. No Inter.

```css
--font-sans: var(--font-heebo), Arial, sans-serif;
```

Tailwind pairs its own sizes with a line-height. The `--text-*` tokens below
declare **size only**, so `text-section-title` is byte-identical to the
`text-[22px]` it replaced. Adding a line-height to them would silently reflow
every 1:1 comparison, so paired line heights are their own `--leading-*` tokens
rather than `--text-*--line-height` companions (which would also apply them to
anything else reusing the size).

Frequency across the reference: **14px is the body size on 8364 elements**, then
16.002 (746), 20.006 (387), 11.998 (345), 12.0036 (144), 14.994 (49).

### 3.1 Body and UI

| Token | Value | Usage |
|---|---|---|
| `--text-nano` | `10px` | Cart count badge |
| `--text-micro` | `11px` | Captions, payment chips, promo eyebrow |
| `--text-tiny` | `12px` | Dense admin table meta, promo eyebrow. Ours, not live's: it paints admin and supplier chrome, which has no counterpart on live to measure against. |
| `--text-small` | `13px` | Secondary body: hints, captions. Ours. |
| `--text-body-lg` | `15px` | Slightly larger body: status pages. Ours. |
| `--text-section-title` | `22px` | Section headings and product-card titles |

### 3.2 Product detail

Measured off the live coupon PDP (`docs/coupon-page-measured.md`). The odd
decimals are what the reference records; the defaults (24px and 16px) were close
enough to look right and wrong enough to fail the comparison.

| Token | Value |
|---|---|
| `--text-pdp-title` | `25.004px` |
| `--leading-pdp-title` | `32.0051px` |
| `--text-pdp-body` | `14px` |
| `--leading-pdp-body` | `23.996px` |

### 3.3 Footer

| Token | Value | Usage |
|---|---|---|
| `--text-footer-note` | `13px` | Smallprint and copyright |
| `--text-footer-link` | `14px` | Nav links and contact lines |
| `--text-footer-head` | `16px` | Column headings |
| `--text-footer-phone` | `20px` | Support phone number |
| `--text-newsletter-head` | `20.006px` | Newsletter heading, weight 500 |
| `--leading-newsletter-head` | `48.5946px` | |
| `--text-newsletter-note` | `14.994px` | The marketing line beside it |
| `--leading-newsletter-note` | `25.6997px` | |

The decimals are a 1.25rem and a 0.937rem resolved against a 16.002px root.
Rounding them to 20/15 moves the baseline enough to show up in the footer band.

### 3.4 The hero display ramp

Measured off the live Revolution Slider. Promoted out of `HeroSlider.tsx`
because each of these four sizes was written **twice** in that one file (once in
`RS`, again in `WELCOME_HEAD`) and the two copies had already drifted once. A
value with two call sites is a token.

| Token | Value |
|---|---|
| `--text-hero-line1` | `43px` |
| `--text-hero-line1-lg` | `51px` |
| `--text-hero-line2` | `38px` |
| `--text-hero-line2-lg` | `45px` |
| `--text-hero-promo` | `35px` |
| `--text-hero-promo-lg` | `50px` |
| `--text-hero-promo-welcome-lg` | `45px` |
| `--text-hero-tagline-lg` | `19px` |

`--text-hero-promo-welcome-lg` is 45px, the same number as
`--text-hero-line2-lg`, and is deliberately **not** that token: the two are equal
today by coincidence of measurement, not because one drives the other, and a
remeasure of the headline must not silently move the price.

The sizes that really are used once (the tagline, the promo lines, the
"standard" caption) stay in that file's `RS` constant.

### 3.5 Role table, from the live capture

Measured roles with their colour and line height, for reviewing a screenshot.

| Role | Size | Weight | Colour | Line height |
|---|---|---|---|---|
| Hero headline 1 | 51 / 43 mobile | 300 | `#333e48` | |
| Hero headline 2 | 45 / 38 mobile | 300, `-0.01em` | `#333e48` | |
| Hero price amount | 45 / 35 mobile | 700 | `#333e48` | |
| Hero "from" label | 13 / 12 mobile | 400 | `#333e48` | |
| Hero tagline | 19 / 11 mobile | 700 | `#333e48` | |
| Product title (h1) | 25.004 | 500 | `#333e48` | 32.0051 |
| Section heading | 25 | 500 | `#333e48` | 40 |
| Cart page title | 40 | 500 | `#333e48` | |
| Product current price | 35 | 400 | `#dc3545` | 45.01 |
| Product strike price | 21 | 400 | `#6f6f6f` line-through | 31.5 |
| Category card title | 14 | 700 | `#0062bd` | 18 |
| Category card price | 20.006 | 400 | `#333e48` | |
| Category card sale price | 20 | 400 | `#dc3545` | |
| Category card strike | 12 | 400 | `#657888` | |
| Card category tag | 12 | 400 | `#657888` | |
| USP bar title | 15 | 700 | `#333e48` | |
| USP bar subtitle | 13 | 400 | `#767676` | |
| Category strip label | 14 | 600 | `#333e48` | |
| Footer widget title | 16 | 700 | `#333e48` | |
| Footer link / body / UI | 14 | 400 | `#333e48` | 24 |
| Sale badge text | 12 | 700 | `#ffffff` | |

---

## 4. Component anatomy

### 4.1 Header

Two stacked landmarks, both `dir="rtl"`, both `max-w-page` with `px-[15px]`.

```
src/components/layout/Header.tsx      (SiteHeader re-exports it)
src/components/layout/InfoBar.tsx
src/components/layout/MastheadNav.tsx
src/components/layout/MobileDrawer.tsx
src/components/layout/RegionMenu.tsx
```

**Top bar** (`div`, `border-b border-border bg-white`, `text-[0.929em] text-heading`):

| Part | Geometry | Note |
|---|---|---|
| Greeting `ברוך הבא לעולם של קניון Express` | one `h-topbar-row` (37.333px) | Home page only, revealed by `:has()` in `globals.css`. |
| Four info items, in live's RTL order | `h-topbar-row` each, `gap-x-3` | `התחברות` (a link to `/login`), `קניה בטוחה`, `משלוח מהיר חינם`, `בפריסה ארצית`. Only the first is a link on live; the other three are plain text. |
| Item icon | `size={14}`, `strokeWidth={1.8}`, `aria-hidden` | |
| Divider between items | `h-3 w-px bg-border`, `md:block` only | `aria-hidden`. Not rendered before the first item. |
| Height | wraps freely below `md`; `md:h-header-topbar` (37.3) above | Content-driven on handheld by design. See 2.3. |

**Masthead** (`header`, `sticky top-0 z-40`, `border-b border-border bg-white`):

| Part | Below `xl` | From `xl` |
|---|---|---|
| Row height | `h-header-handheld` (83 + 1px border = live's 84) | `h-header-masthead` (109 + 1 = live's 110) |
| Hamburger (`MobileDrawer`) | first in DOM, so **inline-start = the right in RTL**. Live at 380: hamburger x=319. | hidden |
| Logo | `SmartImage` 300x79 source, painted `h-handheld-logo-h` (26) | `xl:h-logo-h` (79) |
| Cart + account | last in DOM, so inline-end = the left. Live's icon row is at x15/x57 with 22px glyphs; icons are 22 and the row owns the 44px hit area. | `xl:hidden` |
| Nav (`MastheadNav`) | hidden | `hidden min-w-0 flex-1 xl:flex` |

The container is `justify-between`, so **DOM order is side order here**. This
header once had them the other way round (hamburger left, cart and account
right), a straight mirror of live's handheld row, on every page.

`xl` and not `lg` is deliberate: live's own switch is `hidden-xl-up` /
`d-xl-block` on the two header variants, so the handheld header is what 768
**and 1024** get.

**No search UI anywhere, deliberately and against live.** Live puts a search
icon in the handheld header, a full search form under it at 768, and a 534px
search field in the 1440 masthead (534x41 at top 72, white, 2px `#fed700`
border-top, radius `0 22px 22px 0`, with a 56x41 `#fed700` button at radius
`22px 0 0 22px`). The standing project rule is that there is no search UI. The
pixel cost is real and is recorded in `STATE.md` rather than quietly absorbed.

The live cart badge, for reference when the header is compared: 21x21,
`#fed700`, `#333e48` text at 12px.

### 4.2 Product card

Two cards exist and they are not the same component.

**Deals card** (`article.p_con`, `src/components/ProductCard.tsx`, styled by
`src/styles/product-card-deals.css`), in DOM order:

1. `a.p_con__category` to `/category/<slug>` (12px, `#657888`, margin-bottom 12)
2. `div.p_con__title-wrap` > `a` > `h2.p_con__title` to `/product/<slug>`
   (14px / 700 / `#0062bd`, line-height 18, margin-bottom 8)
3. `div.p_con__image-wrap` with the discount badge overlaid
   (`--color-deal-badge` `#ee0000`, white 12/700)
4. Price block: current `--color-deal-price` `#2d2d2d`, sale
   `--color-deal-sale` `#c93636`, strike `--color-price-strike` `#6f6f6f`
5. Add-to-cart icon button (transparent, `#333e48`, radius 22)

The image's `sizes` string is measured, not guessed, at eighteen viewport/dpr
pairs. Below 1024 the widest card is exactly `50vw - 48px` at every width
measured (the row's fixed gutter), and above it the widest card any viewport
paints is 240px:

```
(max-width: 430px) 39vw, (max-width: 640px) 43vw, (max-width: 1023px) 46vw, 240px
```

It is written as discrete branches and not as `calc(50vw - 48px)`, even though
`sizes` accepts calc: `next/image` reads the vw out with a regex and filters its
candidate ramp to `>= deviceSizes[0] * smallestRatio`, so a literal `50vw` would
cut everything below 320 off the ramp and the exact-fit rung would become
unreachable. The old `50vw / 33vw / 400px` was wrong in **both** directions: at
1440 dpr 1 a 240px card asked for a 640px file (2.67x), and between 641 and 1023
one card grows to 45vw, so at 900 dpr 2 it needs 802 device pixels and `33vw`
asked for 594, was served a 640 and quietly upscaled. A `sizes` that is too
small does not error, it renders soft. The top stop is 1023 and not 1024 because
the layout switches **at** 1024.

**Category card** (live measured, `src/components/category/CategoryProductCard.tsx`):

| Part | Value |
|---|---|
| Card | 234px wide (6-up in the 1170 grid, flex-wrap), no padding, no border |
| Image | 186 x 186 |
| Category tag | 12px, `#657888`, margin-bottom 12 |
| Title | 14 / 700 / `#0062bd`, line-height 18, margin-bottom 8 |
| Price | 20.006 / `#333e48`; sale (`ins`) 20 / `#dc3545`; strike (`del`) 12 / `#657888` |
| Sale badge | `--color-sale-badge` `#328614`, white 12/700, radius 4, padding 2 / 10 |
| Add-to-cart | icon button, transparent, `#333e48`, radius 22 |

### 4.3 Price block

The product-page buy box, from `src/styles/product-page.css`. Every colour and
every number is a `--pdp-*` variable on `.pdp`, mirrored from `PDP` in
`src/styles/tokens.ts`, and `tokens.test.ts` fails if the two drift. No rule in
that file carries a raw hex.

```css
.pdp {
  --pdp-ink: #333e48;        --pdp-muted: #657888;
  --pdp-action: #5d7184;     --pdp-sale: #dc3545;
  --pdp-strike: #6f6f6f;     --pdp-rule: #cccfd1;
  --pdp-line: #dddddd;       --pdp-brand: #fed700;
  --pdp-brand-hover: #fedd26; --pdp-buy: #c94b28;
  --pdp-buy-hover: #b8401f;  --pdp-surface: #ffffff;
}
```

Anatomy of `.pdp-summary__price` (a baseline-aligned flex row, `gap: 12px`,
`flex-wrap`):

| Element | Size / line | Colour |
|---|---|---|
| current price | 35px / 45.01px | `--pdp-sale` `#dc3545` |
| `del` (strike) | 21px / 31.5px | `--pdp-strike` `#6f6f6f`, `text-decoration-line: line-through` |
| `.pdp-summary__badge` | 14px / 23.996px, weight 700, `padding-inline: 8px`, `radius 4px` | white on `--pdp-sale` |

The strike is `#6f6f6f` and not live's `#848484`: `#9ca3af` (the value before
that) measures **2.54:1** on white, which was the worst text pairing left on the
site after the yellow sweep, and it paints the coupon page's "regular price".

Buy controls, `.pdp-buy` (`display: flex`, `gap: 4px`, `margin-top: 101px`,
`flex-wrap: wrap`):

| Control | Geometry |
|---|---|
| `.pdp-buy__qty` | 140 x 41 (`--pdp-qty-w` / `--pdp-qty-h`), on the inline-**start** of the row (live x665 against the button's x469 at 1440, which in RTL is the right) |
| `.pdp-buy__atc` | 192 x 53 (`--pdp-atc-w` / `--pdp-atc-h`), `--pdp-brand` fill |
| `.pdp-buy__now` | full width, 46px (`--pdp-buy-h`), `--pdp-buy` `#c94b28`, 10px below |

`flex-wrap` is load-bearing. 140 + 4 + 192 = 336px of fixed width, and on a
320px phone the summary column is 290px, so that row alone made the whole
document scroll sideways. The product page was the only public route still
failing the 320px gate on 2026-08-19. Wrapping costs nothing on desktop, where
the column is 700px and the row never reaches a second line.

PDP layout: container 1170, gallery 470, summary 700, 15px column gap,
breadcrumb 84 desktop / 55 at 380.

### 4.4 Cart line

`article.cart-line`, `src/components/cart/CartLineItem.tsx`, styled by
`src/styles/cart-page.css`.

| Part | Class | Note |
|---|---|---|
| Thumbnail | `a.cart-line__thumb` | 100x100 source, `object-contain`. No image renders `אין תמונה` on `bg-surface-hover` in `text-icon-empty`. |
| Name | `a.cart-line__name` | to `/product/<slug>` |
| Availability warning | `output.cart-line__warning` | An `<output>` and not `<p role="status">`: it carries the same implicit role and it **is** what this is, a message produced in response to the shopper's own action, so it is announced when a quantity change turns a line unavailable rather than only read on load. |
| Coupon split note | `p.cart-line__coupon-note` | `תשלום באתר: … · יתרה בחנות: …`, coupon lines with a business balance only |
| Unit price row | `div.cart-line__unit` | Below 768 only. CSS hides it from 768 up. |
| Footer row | `div.cart-line__footer` | See the order rule below. |
| Remove | `button.cart-line__remove` | `Trash2 size={16}`, `aria-label={`הסר ${name} מהעגלה`}` |
| Line total | `span.cart-line__price` | `shekels(item.line_total)` |
| Quantity | `div.cart-line__qty` | `Minus` / count / `Plus`, ceiling from `lineQuantityCeiling(item)` |
| Mobile labels | `span.cart-line__mlabel` | `aria-hidden`, because the controls beside them are already named |

**DOM order is side order in this RTL flex row.** Live's cart row reads
right-to-left: remove (x1236, the far right of a 135..1305 row), then price
(x497), then quantity (x267) with the subtotal leftmost. Ours had the exact
mirror (qty right, remove far left). Remove renders first (right), price next,
and the qty pill carries the auto margin to the far left.

Below 768 the line renders as live's stacked WooCommerce rows: remove / name /
unit price / quantity / line total, measured 57+83+54+75+54 at cart@380.

The `+` button stops at `lineQuantityCeiling(item)`. Before that it ran to 99
against any stock level, so the only way to discover there were three left was
to press it a fourth time and read the error toast the server sent back. At the
ceiling `next === localQty` and the write does not fire, so the round trip is
not spent to be told the quantity it already has.

Live's cart table for reference: `th` 14 / 400 / `#747474` with 8px padding,
line item `td` 17 / `#333e48` with ~35 top padding, thumbnail 92x92, remove `x`
`#a7a7a7` at 25px, cart qty input 85x40 at radius 14, page title 40 / 500.

### 4.5 Checkout step

Four steps, `src/lib/checkout/steps.ts`:

```
details  פרטים אישיים
address  כתובת למשלוח
review   ביקורת הזמנה
confirm  אישור ותשלום
```

**The whole form stays mounted in the DOM at every step; only visibility
changes.** That is not a styling preference, it is what keeps `FormData` whole:
unmounting step 1 to render step 3 would drop the name, phone and email from the
submission and the server action would reject an order whose fields the shopper
did fill in. So "which step am I on" is a display concern, and `steps.ts`
answers only one question: may the shopper move on. Every check is a pure
function of the values, so the gate is testable without a browser.

The step gate is `.checkout-step[data-inactive]`, an attribute and **not** the
`hidden` attribute, so the CSS can override it at 992 and up.

Stepper anatomy (`ol.checkout-steps`, `src/styles/checkout-page.css`):

| Part | Value |
|---|---|
| `.checkout-steps` | `display: flex`, `gap: 8px`, `max-width: var(--container-page)`, `margin: 0 auto 28px`, `padding: 0 15px` |
| `.checkout-steps__item` | `flex: 1 1 0`, `min-width: 0` |
| `.checkout-steps__btn` | `min-height: var(--cart-touch, 44px)`, `padding: 10px 12px`, `background: #f7f7f7`, `color: #616161`, 14px / 700, `border-bottom: 3px solid transparent` |
| `.checkout-steps__index` | 26x26 circle, `background: #e4e4e4`, `color: #616161`, 13px / line-height 1 |
| `[data-state="current"]` btn | `background: #fff`, `color: #333e48`, `border-bottom-color: #fed700` |
| `[data-state="current"]` index | `background: #fed700`, `color: #333e48` |
| `[data-state="done"]` btn | `background: #fff`, `color: #333e48`, `border-bottom-color: #e4e4e4` |
| `[data-state="done"]` index | `background: #333e48`, `color: #fff` |
| `:disabled` | `cursor: not-allowed`, `opacity: 0.6` |

`--cart-touch` (44px) is declared in `mini-cart.css`, which the root layout
loads on every page. It is reused rather than redeclared so the checkout
stepper, the cart stepper and the mini cart cannot drift to three different
ideas of a comfortable thumb target.

**State is carried by three signals, not by colour alone**: the bottom border,
the fill, and the numeral badge all change. Colour alone would not survive a
greyscale print or a shopper who cannot separate yellow from grey. The bottom
edge is the side the eye tracks along a row of steps.

`#616161` is darkened from `#7a7a7a`, which painted the labels at 14px bold on
`#f7f7f7` for **4.01:1** and the numeral badge on `#e4e4e4` for **3.38:1**, both
under the 4.5 that 14px demands (14pt bold is 18.66px, and these are not that).
`#616161` is 5.78 and 4.87 on those two surfaces, so one value covers the row
wherever it sits.

Below **560px** the label is visually hidden with the clip-path pattern and
**not** `display: none`. `display: none` took the label out of the accessibility
tree too, and the numeral beside it is `aria-hidden`, so each of the four step
buttons was left with no accessible name at all: axe reported `button-name`,
critical, four nodes, on the phone and nowhere else. A screen reader announced
"button" and nothing more, on the checkout.

From **992px** up the stepper is hidden entirely and every step section paints
stacked in wizard DOM order, which is Electro's own single-column checkout (it
has no stepper of its own). The submit action validates **every** step before
firing, so the one visible submit behaves; only the per-step continue/back
buttons are hidden.

Forward jumps from the stepper are allowed only as far as the filled fields
justify; backward jumps are always allowed.

---

## 5. RTL

`<html lang="he" dir="rtl">`. Every page and component is RTL by default. Never
add `dir="ltr"` unless the specific content is a code block, a URL, an
identifier or a Latin-only string. All visible UI strings are Hebrew; code,
variable names, comments and logs are English.

### 5.1 The complete logical-property mapping

Physical properties in the left column are forbidden in `src/`. Use the logical
property in the right column, which flips automatically.

**Tailwind utilities**

| Physical (forbidden) | Logical (required) |
|---|---|
| `pl-*` | `ps-*` |
| `pr-*` | `pe-*` |
| `ml-*` | `ms-*` |
| `mr-*` | `me-*` |
| `left-*` | `start-*` |
| `right-*` | `end-*` |
| `text-left` | `text-start` |
| `text-right` | `text-end` |
| `border-l` / `border-l-*` | `border-s` / `border-s-*` |
| `border-r` / `border-r-*` | `border-e` / `border-e-*` |
| `rounded-l` / `rounded-l-*` | `rounded-s` / `rounded-s-*` |
| `rounded-r` / `rounded-r-*` | `rounded-e` / `rounded-e-*` |
| `rounded-tl-*` | `rounded-ss-*` |
| `rounded-tr-*` | `rounded-se-*` |
| `rounded-br-*` | `rounded-ee-*` |
| `rounded-bl-*` | `rounded-es-*` |
| `inset-x-*` | `inset-x-*` (already symmetric, safe) |
| `float-left` / `float-right` | `float-start` / `float-end` |
| `clear-left` / `clear-right` | `clear-start` / `clear-end` |
| `scroll-ml-*` / `scroll-mr-*` | `scroll-ms-*` / `scroll-me-*` |
| `scroll-pl-*` / `scroll-pr-*` | `scroll-ps-*` / `scroll-pe-*` |
| `divide-x-reverse` | not needed; `divide-x` follows direction |
| `origin-top-left` | no logical form. Pair with `rtl:origin-top-right`. |
| `translate-x-*` | no logical form. Pair with `rtl:-translate-x-*`. |

**Raw CSS**, for the hand-written page stylesheets under `src/styles/`

| Physical (forbidden) | Logical (required) |
|---|---|
| `padding-left` / `padding-right` | `padding-inline-start` / `padding-inline-end` |
| `margin-left` / `margin-right` | `margin-inline-start` / `margin-inline-end` |
| `left` / `right` | `inset-inline-start` / `inset-inline-end` |
| `border-left` / `border-right` | `border-inline-start` / `border-inline-end` |
| `border-left-width` etc. | `border-inline-start-width` etc. |
| `border-top-left-radius` | `border-start-start-radius` |
| `border-top-right-radius` | `border-start-end-radius` |
| `border-bottom-right-radius` | `border-end-end-radius` |
| `border-bottom-left-radius` | `border-end-start-radius` |
| `text-align: left` / `right` | `text-align: start` / `end` |
| `float: left` / `right` | `float: inline-start` / `inline-end` |
| `clear: left` / `right` | `clear: inline-start` / `inline-end` |
| `width` / `height` (in a direction-sensitive box) | `inline-size` / `block-size` |
| `min-width` / `max-width` | `min-inline-size` / `max-inline-size` |
| `padding-top` / `padding-bottom` | `padding-block-start` / `padding-block-end` |
| `margin-top` / `margin-bottom` | `margin-block-start` / `margin-block-end` |
| `top` / `bottom` | `inset-block-start` / `inset-block-end` |
| `overflow-x` / `overflow-y` | `overflow-inline` / `overflow-block` |
| `resize: horizontal` / `vertical` | `resize: inline` / `block` |

`padding-inline` (the two-value shorthand), `gap`, `inset-inline` and `place-*`
are direction-neutral and safe as they are.

The `--spacing-*` tokens carry no direction of their own, so
`padding-inline: var(--spacing-gutter)` is the idiomatic form. `ELECTRO_HERO`
records `offsetInlineEnd: 517` for the category strip and
`paddingStart: 31` for the slider text block, which is why the strip is
right-offset in RTL rather than page-centred.

### 5.2 Direction is not the same as flip

Three cases where a logical property is the wrong tool.

1. **DOM order is side order** in a `justify-between` or `ms-auto` row. Both the
   header and the cart line footer are laid out this way, and both were once a
   straight mirror of live's row while every individual property was correct. If
   an element is on the wrong side and its classes are already logical, reorder
   the JSX, do not add a physical override.

2. **Icons that imply direction must mirror.** Use the `rtl:` variant, never a
   JavaScript conditional:

   ```tsx
   <ChevronRight className="rtl:scale-x-[-1]" />
   <ArrowLeft className="rtl:rotate-180" />
   ```

   Section 3 of `docs/RTL-PITFALLS.md` gives the full mirror/do-not-mirror list.

3. **Numbers, currency and identifiers do not flip.** They are LTR runs inside
   an RTL paragraph and they need isolation, not mirroring. See
   `docs/RTL-PITFALLS.md` sections 2 and 4.

### 5.3 Currency in the token layer

The one way this project renders money on a page:

```
src/lib/money-format.ts   shekels(agorot) -> "₪1,234.50"
                          shekelsRounded(agorot) -> "₪1,235"
```

Agorot in, always, at every call site. Built by integer division rather than by
`agorotToIls`, so no money value is ever a float even for the length of a format
call: the whole shekels and the agorot remainder are separated with `/` and `%`
on the integer, and only the already-whole shekel part is handed to `Intl` for
thousands grouping.

The `₪` glyph is written literally instead of using `Intl.NumberFormat`'s ILS
currency style, which emits **directional marks** around the sign. Inside an RTL
document those marks reorder a price sitting next to Hebrew text, and the live
site prints the bare glyph. That is why `formatIls` in `src/lib/commerce/money.ts`
is not the answer for a page: it is the correct formatter for a log line or a
document and the wrong one for the storefront.

---

## 6. The `compare.mjs` gate

```
scripts/compare.mjs      shoots two full-page screenshots
scripts/diff-bands.mjs   diffs them into a percentage and a band report
```

### 6.1 The threshold

**A page passes when the overall pixel difference is below 11%.** The threshold
is set in `CLAUDE.md` and is the gate every UI step closes against.

The gate is quoted at **three widths: 380, 768 and 1440**. `--width` is an
argument because this was hardcoded to 1440, so the two phone widths had never
once been measured. Height stays **2600** at every width: the diff is banded down
the page and the bands must line up run to run for the numbers to be comparable.

### 6.2 Running it

The measured page must be a production build. A `next dev` page carries the dev
overlay and different CSS ordering.

```bash
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home --width=768
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home --width=380
```

Pages: `home`, `product`, `category`, `products`, `search`, `cart`, `checkout`.
Anything else exits 2.

`--live=<url>` and `--mine=<url>` override either side. Browsers come from
`~/Library/Caches/ms-playwright`; the script sets `PLAYWRIGHT_BROWSERS_PATH`
itself if that directory exists. `scripts/compare.mjs` imports
`@playwright/test`, which is already a devDependency, so **it never needed the
`playwright` package** and `npm i playwright` cannot be run in this repo anyway
(see `AGENTS.md`).

### 6.3 How the number is computed

`diff-bands.mjs` decodes both PNGs in headless chromium via canvas, crops to
`W = min(live.width, mine.width)` and `H = min(live.height, mine.height, 2600)`,
and counts a pixel as different when **any** channel differs by more than
`TOL = 24` (the per-channel tolerance for antialiasing noise). Bands are 100px
tall. Output is the overall percentage, the twelve worst bands, and every band
with a bar.

It also prints a height-ratio warning when `mine.h / live.h` is above 1.6 or
below 0.62:

```
!! HEIGHT RATIO 2.83x — the percentage above is NOT a pixel gate.
```

This is a warning and not an exit code, deliberately: this script prints and the
caller decides, and failing here would break `--page=search`, where the two pages
legitimately differ in length. It exists because a `next start` left running
from an earlier build kept port 3311 and served a 15562px home page against
live's 5492px, and the script dutifully reported **45.53%** where the current
build measured **11.07%**. Nothing in the output said which number to believe,
and the wrong one is the one that looks like a catastrophic regression worth a
day of chasing.

### 6.4 The seven refusals

A percentage between two pages that are not the same page is not a low score, it
is no measurement. The script exits **3** (or **4** for the hero) rather than
print one. Each of these was earned by a number that was recorded and believed.

| # | Refusal | Exit | Escape hatch |
|---|---|---|---|
| 1 | Either side rendered a not-found page (title contains 404, or the body says `This page could not be found` / `לא נמצא`) | 3 | none |
| 2 | `--page=checkout` and the URL is no longer `/checkout` (the seeded cart did not stick, so both sides would be photographs of the cart) | 3 | none |
| 3 | `--page=cart` and the two carts are in different states (one empty, one filled). Neither cart redirects when empty, which is what makes this the trap it is: a filled live cart against an empty local one produces a number and the number is meaningless. | 3 | `COMPARE_CART_EMPTY=1` measures the empty state on both sides deliberately |
| 4 | Any rendered image had still not loaded when the shutter fired | 3 | `COMPARE_ALLOW_PENDING_IMAGES=1` |
| 5 | The two grids hold a different number of product cards (`category`, `products`, `search`, `product`) | 3 | `COMPARE_ALLOW_GRID_MISMATCH=1` |
| 6 | The two grids hold the same count but fewer than 80% of slots hold the same product title | 3 | `COMPARE_ALLOW_GRID_MISMATCH=1` |
| 7 | `--page=product` and one side paints a main product image while the other paints none | 3 | `COMPARE_ALLOW_GRID_MISMATCH=1` |
| 8 | Either hero moved between two samples 600ms apart | 4 | `COMPARE_ALLOW_MOVING_HERO=1` |

The measurements behind them, because each is a number that was once reported as
a fidelity score:

- **Refusal 4.** Three `--page=home` runs, one build, one live URL: 9.83%,
  9.83%, and **34.54%**. The third shot live at 3730px instead of 5492px,
  because a lazy `<img>` that has not loaded has no intrinsic height and
  collapses the block it sits in, so our footer was scored against live's
  mid-page. `--page=category` threw the same 3730px capture the same morning and
  printed 25.58% for it. Neither existing guard could catch it: the height-ratio
  check compares the two **sides** and 3730/5679 = 0.66 is inside its band.
  Only images the page is actually trying to display are counted, because the
  three lazy images inside the `display:none` desktop side-banner column are
  correctly not loaded and collapse nothing.
- **Refusal 5.** `--page=category` scored 17.26% against
  `/product-category/hot-deals/`: live holds **two** products there
  (`מציגים את כל 2 התוצאות`), our seed held **thirteen** and paginated
  (`מציג 1-12 מתוך 13 תוצאות`). One row of cards against three rows, so most of
  the mismatch was the grid existing where live has footer, and none of it was a
  token anybody could move. WooCommerce renders `li.product` and ours renders
  `article`, so the union counts each card exactly once.
- **Refusal 6.** A count is not a catalogue. `--page=products` stopped refusing
  (both sides counted 24) and scored **31.92%**: 14 of the 24 products exist on
  both sides, the local catalogue carries 10 that live does not and misses 9 it
  has, so from the fourth card on every slot holds a different product and only
  7 of 24 slots agree. The test is **positional** and not set overlap, because
  position is what pixels are: a product that exists on both sides but sits two
  rows lower contributes exactly as much mismatch as one that does not exist at
  all. Set overlap was 58% on that run, which would have passed a threshold and
  taught the next reader that the shop page has a design problem.
- **Refusal 7.** `--page=product` scored 16.17% with top bands at 24 to 52%.
  That region is the gallery, and on live it is **white**: the element carries
  an inline `opacity: 0`, no stylesheet rule on the page sets it back, and
  `jQuery.fn.wc_product_gallery` is undefined, because the theme swapped
  WooCommerce's gallery script for its own carousel. It is not headless and not
  lazy loading: the image is `complete` with `naturalWidth` 600, its box is
  470x478 at x835 y250, and the opacity stays 0 at 900px and 2600px of viewport
  height, at 0s, 3s and 5s, after `load`, `resize`, `scroll`, jQuery `ready` and
  a real scroll. Forcing `opacity: 1` on live and rerunning: **16.17% -> 12.56%**,
  and 9.06% at the 22px offset. A quarter of what the page was charged is one
  blank rectangle on the reference, and the only way for our page to match it is
  to stop showing the product. The probe measures **effective** opacity down the
  whole ancestor chain, not the element's own, because live's image is fully
  opaque inside a container that is not.
- **Refusal 8.** Three consecutive `--page=home --width=380` runs, byte-identical
  local side: **10.96%, 10.96%, 28.25%**. The reference moved. All the movers are
  Revolution Slider internals (`rs-mask-wrap` 4337 against 5896, one `rs-layer`
  137 against 800, `rs-loader.spinner0` 40 against 0). The slider was on a
  different slide when the shutter fired, and 10.96% was never a pass, it was one
  face of a coin.

### 6.5 What the shoot does before the shutter

Every one of these steps exists because a number was produced without it.

1. **Navigate with a three-attempt ladder.** `networkidle`, falling back to
   `domcontentloaded`, three tries with backoff. The live host intermittently
   drops a navigation into `chrome-error`, and a transport flake is not a
   measurement failure.
2. **Wait for a stylesheet to have parsed into rules**, and for `document.fonts.ready`.
   The `domcontentloaded` fallback fires **before** stylesheets apply. Same
   product page, same build, same pinned slug, three runs: **9.79%, 15.47%,
   95.07%**. The 95% capture was the gallery image at full 1440x2600 with no
   layout at all. Cross-origin sheets throw on `.cssRules`, so the probe counts
   those as present rather than spinning until timeout. If it cannot confirm
   styles it prints a loud warning and continues, because silence is what let
   95.07% look like an answer.
3. **Settle**: 4s for external, 6s plus `networkidle` for local. Local pages
   proxy remote product images through `/_next/image` on first request, which is
   slower than the 2s this used to allow, and cards were being photographed
   mid-load with their broken-image glyphs scored as layout difference.
4. **Hide `nextjs-portal`.** The Next dev overlay renders a route badge, a
   ~150x45 box in the bottom-left of every local screenshot with no counterpart
   on live, that does not exist in a production build.
5. **Scroll-sweep the whole page in viewport steps, then return to the top.**
   `fullPage: true` captures past the viewport without ever scrolling, so nothing
   below the fold is intersected and nothing lazy is fetched, and the capture
   contains whichever images happened to be in flight. Up to 4 sweeps, restarting
   from 0 each time and not from the previous height: resuming part-way changed
   the measured home diff from **9.83% to 11.05%, deterministically**, because an
   image low in the viewport can need the ones above it laid out first.
6. **Race every `decode()` against a 2s timeout.** A lazy image inside a
   `display:none` subtree is never intersected, so the browser never issues the
   request, so it sits at `complete=false, naturalWidth=0` forever and
   `img.decode()` returns a promise that **never settles**. Not rejects, never
   settles. `page.evaluate()` has no default timeout in Playwright, so the whole
   run blocked with the live shot already on disk (the signature every hung run
   left behind: a `refs/.run-<pid>-live.png` with no `-mine.png` beside it).
   Measured: 380 has 0 such images and completes in 25s; **768 has 3 and never
   completes**; 1440 has 0 because the column is displayed. It was never a
   property of 380, it is a property of any width where the desktop side-banner
   column is `display:none`. The whole sweep is additionally bounded at 90s.
7. **Freeze the hero, through the slider's own API.** Pause, `revshowslide(1)`,
   pause again: `revshowslide` restarts the autoplay timer on its way in, so a
   single pause before holds the wrong slide and a single pause after races the
   transition. Synthetic clicks on `rs-bullet` are **not** how the engine changes
   slide, so that call was a no-op that looked like a fix for months. The APIs
   are discovered by scanning `window` for `/^revapi\d+$/` rather than
   hardcoding `revapi6`, because the number is assigned by the plugin and changes
   when the slider is rebuilt. Driving it pins the reference exactly: three
   consecutive loads returned slide 1, mask 137px, module 193px, body 17791,
   spinner 0, with no variation.
8. **Count the grid at the shutter, not before it.** This block used to run right
   after load, several waits earlier. Our related-products row streams in, so on
   `--page=product` it counted **zero** cards while the picture taken moments
   later held **four**: a guard reading a different page from the one it guards.
9. **Shoot to a per-process path**, `refs/.run-<pid>-<side>.png`. `refs/live.png`
   and `refs/mine.png` are fixed names with tens of seconds between the write and
   the read, and a second run landing in that window replaces one file so the diff
   is computed across two different pages. Caught in the act: a `--page=cart` run
   reported 24.51% with `live: 1440x5492`, which is the height of the live
   **homepage**. Three of that morning's outliers (cart 24.51%, search 24.5%, and
   the checkout run that first raised the structural warning) are the same
   substitution. The stable names are still written afterwards, because every
   other tool and every note in `STATE.md` refers to them.

### 6.6 Pinned references, and why

| Page | Live reference | Local |
|---|---|---|
| `home` | `https://kenyonexpress.co.il/` | `/` |
| `product` | `/product/מוצר-לדוגמא/` | the same slug, `COMPARE_PRODUCT_SLUG` |
| `category` | `/product-category/hot-deals/` | `COMPARE_CATEGORY_SLUG`, default `hot-deals` |
| `products` | `/shop/` | `/products` |
| `search` | `/?s=<q>&post_type=product` | `/search?q=<q>`, `COMPARE_SEARCH_Q`, default `אוזניות` |
| `cart` | `/cart/` | `/cart`, both sides seeded |
| `checkout` | `/checkout/` | `/checkout`, both sides seeded |

The product slug is **pinned** and not discovered, because "discover one" is
reproducible only while the catalogue keeps its order. Measured on 2026-08-07
against one build and one server: discovery picked `צימר-מאסטר` and reported
**18.73%**; the pinned reference product reported **14.08%**. Nothing in the page
differed. 4.65 points were the pick. On 2026-08-01 the same defect read 16.59%
against 10.71% on record, and the whole delta was that live's reference is a
sample product with no image at all while the local side had landed on a room
listing with a large photo.

The category slug falls back to a discovered local category, because `hot-deals`
is live's slug and does not exist in the local database (whose categories are
`baby-kids` / `vacation` / `pets` / ...). Hardcoding it meant the category run
had been screenshotting a **404 page** and reporting the diff against it as a
fidelity score.

Cart and checkout are seeded before the shoot: live takes WooCommerce's plain
`?add-to-cart=<id>&quantity=1` GET (waited with `commit`, because the only thing
that navigation is for is the cart cookie and waiting for the 4.5MB homepage
behind it was timing out at two minutes), and the local side **drives the real
add-to-cart control** on a product page, which is also the only way to be sure
the button still works. Local navigations use `commit` throughout: the
catalogue's remote images are refused by our own `img-src` and the router's
prefetches abort, so neither `networkidle` nor `domcontentloaded` resolves
reliably on a page that curl fetches in seconds.

`COMPARE_STORAGE_STATE` supplies an authed session for the `account` comparison.

### 6.7 What the gate cannot measure

Two known differences are content, not design, and are recorded here rather than
chased:

- **The related-products row.** Live renders **one** related card (a barbershop
  coupon, in a single narrow column with the rest of the row blank) against our
  four, none of which is the same product. `--page=product` scored 14.18%
  against the 11% gate on that alone; the same crop at y520-770 shows the
  gallery, the quantity box, both buttons and the tag line in the same places,
  offset by about 58px.
- **The search page.** Same query, same day, different catalogue: for `צימר`,
  live shows 4 cards and "showing all 4 results", ours 2 cards and "found 2
  products". The scores were bimodal rather than drifting (15.10, 15.09, 9.84,
  15.08, 10.30, 15.33), which is what a content difference looks like when the
  two sides settle differently.

The 11% budget is what makes the seven WCAG corrections in section 1.6
affordable. It is not a licence to leave a token unmeasured.

---

## 7. Related documents

```
DESIGN-MEASURED.md              the measured palette, type and layout, with sources
docs/RTL-PITFALLS.md            Hebrew typography, bidi, number and icon direction
docs/UI-QA-CHECKLIST.md         the manual visual pass, page by page
docs/ARCHITECTURE-DESIGN-SYSTEM.md   the earlier Hebrew design-language note
docs/HEADER-1TO1-2026-09-02     the audit that moved the container to 1200
src/styles/tokens.css           the enforced source of truth
src/styles/tokens.test.ts       the gate on it
src/lib/a11y/brand-contrast.test.ts  the gate on white-on-yellow
src/lib/electro-hero-tokens.ts  ELECTRO_HERO, the Electro home-v7 measurements
```
