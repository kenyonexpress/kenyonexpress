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
| 01 | Top bar | `top-bar` (4 / 4) | live top strip | **complete** |
| 02 | Masthead + header icon cluster | `masthead` (3 / 3) | live logo, real cart state | **complete** |
| 03 | Departments menu | `departments-menu-v2` (4 / 1) | `KE_LIVE_CATEGORIES` | **complete** — mega panel refused, see below |
| 04 | Hero slider | live's RevSlider (`home-v1-slider` is **0** on live) | live rs-18 copy, Hebrew; imagery pending by decision | **complete** |
| 05 | Category strip | `product-categories-list` (1 / 1, and 1 on live) | live departments | **complete** — in the hero column, per the note |
| 06 | Deals grid | live's flat `jet-listing-grid`; `section-onsale-product`/`deals-block`/`tabs-block`/`countdown` are all **0 on live** | live deal products, 32 cards | **complete** — no countdown, no tabs |
| 07 | (merged into 08) | `home-v1-banner-block` is **0 on live** | — | **n/a** — live has one ads block, not two |
| 08 | Promo blocks (THREE, not four) | live renders exactly 3 `.da-block`, 201x197 at 1440, 0x0 at 380 | live only — see the trap | **complete** — `HeroPromoBanners` |
| 09 | Brand strip | `brands-carousel` **0 on live**, renders nowhere at either width | — | **refused as parity** (not on live); **built as UX11** from the merchant directory, under the gate window: `BrandsRow`, see the 2026-10-14 ledger row |
| 10 | Footer + payment logos | `site-footer` (2 on live); `footer-payment` renders **nowhere** on live, which carries `patment-icon.webp` instead | live footer links | **complete** |
| 11 | Handheld header + off-canvas drawer | `handheld-header-v2` (1 on live), `off-canvas` (9 on live) | live departments | **complete** — `MobileDrawer` |
| 12 | Handheld footer bar (NOT a bottom nav) | `handheld-footer-bar` on live is `position: static`, 380x137 at 380, 0x0 at 1440 | live logo + contact line | **complete** — in `SiteFooter` |

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

### ⚠️ THE QUEUE WAS DERIVED FROM A TEMPLATE LIVE DOES NOT RUN

This is the single largest correction to this document, and it lands on rows
06-12 at once.

The queue was derived from Electro's homepage template on the rule that "the
live site wins on which sections exist and Electro wins on how each one is laid
out". The derivation assumed live runs Electro's homepage. **It does not.**
Live's homepage is Elementor: twenty `elementor-section`s of Jet widgets, in
this order --

    electro_vertical_nav_menu_element      -> 03 departments menu
    wp-widget-rev-slider-widget            -> 04 hero slider
    electro_product_categories_list_element-> 05 category strip
    electro_elementor_ads_block            -> 07 + 08, and it is ONE block
    electro_elementor_feature_block        -> the benefit bar
    jet-listing-grid                       -> 06 deals, 32 flat cards
    (footer)                               -> 10 + 12

Counted on the live homepage 2026-09-04, most of Electro's homepage classes are
simply absent:

    home-v1-slider          0     section-onsale-product  0
    deals-block             0     tabs-block              0
    home-v1-banner-block    0     home-v1-da-block        0
    brands-carousel         0     da-block                3

And **rendered** in a real browser at 380 and 1440, because a class can sit in
the markup and never paint:

    .countdown            no such element at either width
    .brands-carousel      no such element at either width
    .footer-payment       no such element at either width
    .da-block             THREE, 201x197 at 1440, 0x0 at 380
    .handheld-footer-bar  380x137 at 380, position STATIC; 0x0 at 1440

What that decides:

- **06 has no countdown and no tabs.** Live's deals are one flat grid of 32
  cards with no section title, which is what `DealsOfTheDay` already renders.
- **07 and 08 are the same three blocks.** Not a two-up plus a four-up: live's
  ads block renders exactly three `.da-block`s. `HeroPromoBanners` is those
  three.
- **09 does not exist on live.** Not built.
- **12 is not a bottom nav.** It is a 137px STATIC footer strip carrying the
  logo and the contact line, which `SiteFooter` already builds below `lg`. A
  fixed bar would invent a navigation surface live has no counterpart for and
  would cover content at the fold, which is the defect the PWA banner and the
  consent banner have each already paid for once.

Pinned by `src/lib/live-home-sections.test.ts`.

### ⚠️ The trap on 08 (confirmed live, still live's content today)

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

### ⚠️ 03 shipped WITHOUT the mega panel, and that is a measurement

The row was written "Departments menu + mega panel". Electro's
`departments-menu-v2` is a `yamm` dropdown where every department opens a
full-width panel of sub-departments. **Live's is a flat list of eleven links.**

Measured on 2026-09-04 by walking the `<li>` elements inside live's
`.home-vertical-nav.departments-menu-v2`: 11 items, `menu-item-has-children` on
**none** of them, and live's `sub-menu` count for the whole page is zero.

`KE_LIVE_CATEGORIES` already matched that list 11 for 11 and in order, so 03 was
built; what was not built is the panel. The governing rule decides it -- live
wins on which sections exist -- and the queue already refuses
`section-product-cards-carousel` on the same grounds. Building the panel would
additionally have to **invent** the sub-departments to fill it, because live has
none to source, and invented navigation is Electro demo content wearing Hebrew.

Pinned by `src/lib/ke-live-categories.test.ts`, which holds the exact list, its
flatness, and the two places our version deliberately departs from live: live's
`עד ₪99` puts the shekel sign left of the digits, and live's `עד ₪99` and
`החדשים` are both `href="#"`.

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
   icon. The handheld cluster carries live's search icon since STEP 08.
2. **One search field, `search/SiteSearch.tsx`, three mounts** (rule reversed
   by STEP 08 on 30.09). Enforced by
   `src/components/layout/search-ui.test.ts` and `e2e/home.spec.ts`.
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
| 2026-09-04 | 01 Top bar | `TopBar.tsx` split out of `Header.tsx`, live's four info items in live's DOM order, `\|` separators at live's 1em metric, home-only greeting gated by `:has()` rather than `usePathname()` | 10.69 / 7.71 / 8.13 |
| 2026-09-04 | (gate) deals grid | the grid was one cell short after the ledger row was removed without replacement, so rows 2-7 reflowed; live's index 6 refilled with a real live product | 10.69 / 7.71 / 8.13 |
| 2026-09-16 | 01 Top bar (tests only) | no render change. Two gaps closed: the home-only greeting was a three-file contract (`TopBar.tsx` class, `page.tsx` marker, `globals.css` `:has()` rule) with nothing holding it, now pinned by `topbar-greeting-gate.test.ts`; and nothing read the rendered bar, now `e2e/topbar.spec.ts` asserts at 380/768/1440 that התחברות is the leftmost peer on its row, the greeting shows on `/` and is hidden on `/cart`, and the wrap is 3 rows at 380 and 1 row above (18/18 against `pnpm start`) | not re-measured (see REFS-POLICY: reference gone) |
| 2026-09-04 | 02 Masthead + icon cluster | account icon removed from BOTH clusters, heart added to the handheld one, heart-then-cart order fixed; account entry point down from three to one; gated by `header-icons.test.ts` | 10.68 / 7.71 / 8.13 |

### The 1440 failure that was blamed on two agents sharing a checkout

`docs/UI-PARITY-REPORT.md` carried 14.48% at 1440 against an 11% gate, recorded
in STATE.md as an unattributable build of two half-finished jobs. It was not.
**That row carries a clean commit hash with no `-dirty` suffix**, and it
reproduced exactly on a fresh build of `51d4eb9c5`.

The cause was component-shaped, not process-shaped. `6bc219b24` removed
`reverse-withdrawal-payment` from the deals fixture -- correctly, it is a Dokan
ledger row the WordPress importer already excludes by slug -- but removed it
without replacement, and the deals grid is four columns wide. Live renders 32
cards and the ledger row is its **index 6, not its last**, so every card below
it moved up one cell and rows 2-7 reflowed.

The band shape is the proof it was an offset and not a defect: every band above
y1400 unchanged, every band below it 30-58%. Refilling the slot with a real
live product (`טיפול-פנים-עמוק`, verified 200 on live's `/product/` and present
in live's `/shop/`) took 1440 from 14.48% to 8.13% and touched nothing else.

**The lesson for the rest of this queue: card COUNT is load-bearing in a grid.**
Removing an artifact from a fixture that mirrors live's DOM is only half a fix;
the slot has to be refilled or everything below it is measured against the wrong
rows of live.
| 2026-09-04 | 03 Departments menu | already matched live 11/11 in order; mega panel refused with evidence and pinned by `ke-live-categories.test.ts` | 10.68 / 7.71 / 8.13 (unchanged, no render change) |
| 2026-09-04 | 04-12 | resolved against live rather than Electro: 04/05/06/08/10/11/12 already built and verified, 07 merged into 08, 09 refused; pinned by `live-home-sections.test.ts` | 10.68 / 7.71 / 8.13 |
| 2026-10-14 | 01 Top bar (UX02 polish) | measured, not eyeballed: the type was `text-[0.929em]` off OUR 16px body (14.864px) where live's .929em is off a 14px body (13.006px), so every item ran 14% wide and 414 wrapped the items 2+2 where live wraps 3+1; now `--text-topbar: 13.006px`. The bar sat in `max-w-page` (items at x15 at 768) where live's `.top-bar .container` is Bootstrap's 100% / 540 / 720 / 960 / 1200 (items at x39 at 768) while the masthead under it is full width; now `.topbar-container` in globals.css over `--container-topbar-{sm,md,lg}`. Hover was `opacity-70`; live is `a:hover{color:#29323a}`, now `--color-heading-hover` with `transition-colors`, and a touch device keeps the rest colour. Icons stay 16px / 6px gap (already live's). Pinned by `topbar-container-gate.test.ts` (three-file contract) and `e2e/topbar.spec.ts` at 375 / 380 / 414 / 768 / 1440 (wrap shape per width, 13.006px, 16px icon, container box, hover colour; 50/50 on both projects against `pnpm start`) | 2.23 / 1.25 / 1.16 (frozen captures; was 6.24 / 4.19 / 1.16 on the same tree before the change) |
| 2026-10-14 | 02 Masthead (UX03 polish) | measured, not eyeballed, against refs/ke_live_home.html's stylesheet and logs/ux03/before.json: the handheld logo was height-bound (26px tall, 98.8 wide) where live is `max-width:100px` (100 x 26.3), now `w-handheld-logo-w h-auto xl:h-logo-h xl:w-auto`; `--spacing-logo-w` was 52 for a fallback box the image paints at 300, now 300. The handheld cart carried its subtotal, so the glyph sat at x45 with the heart at x86 where live's icons are 22px at a 42px pitch from x15; the price is `hidden xl:inline` (live's handheld cart is glyph + count) and the cluster is three 44px cells at gap-0 pulled back by `-me-touch-pad` (11 = (44-22)/2): cart 15, heart 59, search 103. The masthead subtotal is live's `.cart-items-total-price` 16px / 700 / #333e48 (was 14 / 600 / black). Hover on every header icon is `hover:text-heading-hover` + `transition-colors` (was `opacity-70`, with an inline `color` style that no hover utility could beat). The count badge is one `HeaderBadge` for cart and heart with live's two shapes in `.header-badge` (globals.css): 20px #333e48 / white 10/700 at `top:9 right:9` below xl, 21px yellow / heading 12/700 at `bottom:-3 right:7` from xl (was one 16px yellow circle top-right); it pops (scale 1 -> 1.35 -> 1, 320ms) on a change after the store is armed, never on the mirror's 0 -> N at load. The search pill's focus: the site ring was drawn on the input and clipped by the pill's `overflow-hidden` (a dark hairline inside, nothing outside); now live's `input:focus{border-color:#ffeb80}` on the pill (`--color-brand-primary-focus`) and the ring lifted onto the pill with `:has(> input:focus-visible)`, the submit button taking an inset ring. Pinned by `header-polish-gate.test.ts`, `HeaderBadge.test.tsx` and `e2e/header.spec.ts` (24/24 on chromium + mobile-chrome against `pnpm start`); `a11y.spec.ts`'s focus walker now accepts an outline on the focused control's parent | 2.22 / 1.25 / 1.16 (frozen captures; was 2.23 / 1.25 / 1.16) |
| 2026-10-14 | 03 + 11 Departments menu and off-canvas drawer (UX04 polish) | measured, not eyeballed, against refs/ke_live_home.html's stylesheet and logs/ux04/before.json. THE DRAWER WAS TRANSPARENT: `bg-drawer` is not a utility this theme generates (the token is `--color-drawer-bg`), so the open panel measured background-color rgba(0,0,0,0) at 380 and 768 and the category rows painted over the hero and the deals behind the scrim; now `bg-drawer-bg` (rgb(253,252,252), live's paper). The rest of live's `.off-canvas-navigation.light`: 1px #e3e9ef hairline on the inner edge (`border-e`, the inline end in RTL), `transition:all .2s` on the UA `ease` curve for the panel and the scrim (were 300ms on Tailwind's curve; `--ease-drawer`), scrim rgba(0,0,0,.7) (was 50%), `scrollbar-width:thin`; the toggle and the X are `.light .navbar-toggler{color:#333e48}` hovering to #000 (were #515151 with an opacity fade); the rows are `padding:0 1.387em` of 14px = 19.4px (`--spacing-drawer-pad`, were the 15px gutter), `color:#4b566b` (`--color-drawer-text`, were the heading), rules #e3e9ef (`--color-drawer-border`, were #ddd), hover #ebebeb + #000 (`--color-drawer-hover`, were the site's #f5f5f5 tint). The closed scrim is `inert`: a full-viewport button at opacity 0 was still in the tree and hit-tested to the page under it, which is how touch-targets.spec read `button[סגירת התפריט]` as covered. The hero panel: its nav is a named landmark (`רשימת הקטגוריות`, a11y.spec's nameless-landmark finding), its row hover/focus is live's `li:hover>a{background:#f5f5f5;font-weight:700}` and measured equal before and after, so it is pinned and not changed; `html{scroll-padding-top}` is the sticky header's height (50 / 110) so a row that Tab reaches from below the fold is not scrolled under the header (2.4.11). No mega panel, as the 03 note already measured: live's eleven departments carry `dis-sub` and no `menu-item-has-children`, so there is no hover reveal to build and nothing to source it from. Pinned by `menu-drawer-polish-gate.test.ts`, `MobileDrawer.test.tsx`, `HeroCategorySidebar.test.tsx` and `e2e/menu-drawer.spec.ts` (30/30 on chromium + mobile-chrome against `pnpm start`; hover assertions are desktop-only because Tailwind gates `hover:` behind `(hover: hover)`) | 2.22 / 1.25 / 1.16 (frozen captures; unchanged, the drawer is closed and hover is not in a capture) |
| 2026-10-14 | 09 Brands row (UX11) | measured before (logs/ux11/before.json): no brand surface on the home page at any width; the /merchants card was the only place a merchant logo showed, an 80x80 box in full colour, 7 cards, 1 logo. Measured on production (anon REST, read-only): 7 active suppliers, every one with an active product, exactly one `logo_url` (the platform's own supplier row). Built as `BrandsRow` from the merchant directory's own two reads and pure builder (`getHomeBrands` in lib/homepage/below-fold.ts, never throws; `pickBrandTiles` in below-fold-rules.ts: merchants with a product on sale only, logo tiles first, a logo only when `isAllowedImageUrl` accepts it, else the name as a wordmark), mounted after HotCoupons. Shape from Electro's brand cell (refs/electro-home-v7_computed.json: five 234x50 cells in 1170, a 167x50 image) with content from the database: a 150px-tile scroll strip below 768 (snap, no scrollbar), a 3-column grid from 768 and 5 from 1200, every tile 80 tall and one link to /s/[id]; logos `grayscale(1)` at 0.75 and wordmarks muted ink at rest, full colour under hover and focus-visible, all of it inside `@media (hover: hover)` so a phone shows colour. Measured after (logs/ux11/after.json): 380 flex, overflow-x auto, 1122/330 scrollable, 7x150x80, one row; 768 grid 3x215.3, rows 3/3/1; 1440 grid 5x220.4, rows 5/2; rest grayscale(1)/0.75, hover none/1. Pinned by below-fold-rules.test.ts (+5), below-fold.test.ts (+3), BrandsRow.test.tsx (5), live-home-sections.test.ts (rewritten row-09 pin) and e2e/brands-row.spec.ts (8/8 on chromium + mobile-chrome). | 2.22 / 1.24 / 1.32 (frozen captures; unchanged, the row sits under the 2600px the gate scores) |
| 2026-10-14 | 10 Footer newsletter form (UX12) | measured before (logs/ux12/before.json, the existing build of HEAD fe8442834 at 380/768/1440): an empty submit on either form (the handheld home card below lg, the footer pill from lg) opened only the browser's own bubble (`input.validationMessage` "Please fill out this field." in a headless Chromium, nothing of ours, no `aria-invalid`); `ofir@kenyon` passed the browser's `type="email"` check, made a server round trip (3 POSTs against 2 at page load) and came back "כתובת מייל לא תקינה", which stayed on screen after the typing was corrected. Now both forms share `useNewsletterForm` (components/growth) over one plain validator module, `lib/growth/newsletter-form.ts`, that the server action runs too: `noValidate` on both forms, the check runs on submit (and on blur of a non-empty value), a failing address is stopped on the page with a Hebrew `role="alert"` sentence (empty / missing @ / shape / too long), `aria-invalid`, `aria-describedby` and focus on the field, and no request; typing past the check clears the sentence and retires the server's last reply. Pending disables the button (`שולח...`, a spinner on the card, `aria-busy`); a server failure (rate limit, failed write) is shown without marking the field and the button stays live; the server's `NewsletterState` gained `field: 'email'` so a form can tell the two apart. Success replaces the form with one `<output>` status: on the card a soft brand-accent panel with a green check, "בדקו את תיבת המייל", the server's sentence, the address sent as `<bdi dir="ltr">` and the spam-folder hint; on the pill a same-height status line so the yellow bar does not jump. New token `--color-error` (#c93636, the deal-sale red under a form name; 5.68:1 on white) for the card's border, ring and sentence; the pill's sentence is heading ink on the yellow (red there is 3.3:1). newsletter.css lost six raw hex values for tokens. Measured after (logs/ux12/after.json): at all three widths `noValidate` true, empty submit -> alert "נא להזין כתובת מייל" rtl, `aria-invalid` true, field focused, 2 POSTs (page load only); malformed -> "כתובת המייל לא תקינה, למשל name@gmail.com" with no request; corrected typing -> alert cleared. Card: border and 1px ring rgb(201,54,54), alert 13px red; pill 470x41 unchanged, alert 12px heading ink, 2px inset red ring un-focused (the site's global focus halo wins while focused, as it did over the old ring). Pinned by lib/growth/newsletter-form.test.ts (6), NewsletterSignup.test.tsx (9), FooterNewsletterForm.test.tsx (5), newsletter-actions.test.ts (+2 cases) and e2e/newsletter-form.spec.ts (8/8 on chromium + mobile-chrome; no passing address is ever submitted, the local build holds live keys). | 2.22 / 1.24 / 1.32 (frozen captures; unchanged, both forms sit under the 2600px the gate scores) |
| 2026-10-14 | 10 Footer: four columns, accordion, social, payment marks (UX13) | measured before (logs/ux13/before.json, the existing build of HEAD efe44cf05 at 380/768/1440 on 3347): three columns at 1440 (495 / 337 / 337), two closed `<details>` rows below lg with eleven links under "שירות לקוחות", four TEXT payment badges (Visa, Mastercard, Discover, American Express) on the desktop bar only and none on the handheld bar, a Telegram icon linking `#` (a new tab that opened nothing; live links no Telegram), AND THE DESKTOP LINK COLUMNS PAINTED EMPTY: logs/ux13/before-1440.png shows two headings over nothing. Chromium 131+ hides a closed `<details>` with `content-visibility: hidden` on `::details-content`, which the `display: block !important` rule on the children never reached; the links had 39x18 layout boxes and `checkVisibility()` false (logs/ux13/details-probe.mjs, bundled Chromium 148), so every rect-based probe and the gate passed over it. Now: four columns from lg (`lg:grid-cols-[492fr_240fr_240fr_198fr]`, measured 462 / 225 / 225 / 186 at 1440: contact, שירות לקוחות 5 links, מדיניות ותקנון 6 links, אזור אישי 3) through one `FooterLinkColumn`; `.footer-disclosure::details-content { content-visibility: visible }` from lg (the legacy rule stays for engines without the pseudo-element), so the links paint (14/14 `checkVisibility` true); three closed 50px rows below lg that open on a tap; the social row a `<nav aria-label="רשתות חברתיות">` of five real https profiles; payment as `PaymentLogos` (five inline SVG marks, Visa / Mastercard / American Express / Isracard / Diners, `role="img"` with Hebrew names, colours as `--color-payment-*` tokens) on the desktop bar AND on the handheld dark bar (live's `patment-icon.webp` is Electro demo art with PayPal and Skrill, so it is decoration and not sourced). After (logs/ux13/after.json): footer 426.5px at 380/768 (was 339.5: one more row and the marks), 553 at 1440 (was 536). Pinned by SiteFooter.test.tsx (8), PaymentLogos.test.tsx (4) and e2e/footer.spec.ts (7 passed, 1 skipped on chromium + mobile-chrome). Neighbour e2e: home-rtl and home.spec failures are UX12's known set; rtl-mobile's 320px gate reads 323 on every route with a header, and the footer measures 320 with no overflowing box, removing the footer leaves 323 and removing the header gives 320 (logs/ux13/overflow-probe2.mjs): pre-existing, header-side, not this step. Full suite 838 files / 9737 tests green, type-check, repo-wide lint and a fresh build green. | 2.22% / 1.24% / 1.32% (unchanged; the footer is below the 2600px the gate scores); cart and checkout refuse (live side is our build, no frozen capture exists for them) |
| 2026-10-14 | PDP gallery, variant group, quantity stepper, sticky buy bar (UX15) | measured before (logs/ux15/before.json, the existing build of HEAD 192fa0120 at 380/768/1440 on 3350, /product/6253): a bare 140x41 number field with the spinner hidden and no other way to change the count; zoom on tap or Enter only, a resting mouse did nothing; thumbnails in a wrapping row; no variant group; nothing following the shopper once the buy row scrolled off. Now: ProductGallery magnifies x2 under a resting mouse and follows it, restores on leave, a click pins nothing (pointerType, not a media query), a finger still taps to pin; one nowrap thumbnail strip with scroll-snap and no scrollbar, the strip (not the page) scrolls to the current one. ProductInfo: a fieldset variant group ("בחרו גרסה" / "גרסה: X", aria-pressed, the variant's own price only when it differs, sold-out kept in the row disabled and described, a hint until chosen); the quantity a 140x41 fieldset of minus / field / plus (inputMode numeric, emptiable, stops at 1 and the ceiling, inset-shadow hairline so all three are 44 on touch); an aria-live "נוסף לסל". PdpStickyBar: name, price (the coupon's charge when there is one), variant, quantity and a 44px button on the same handler, mounted only once the row is above the viewport (useScrolledPast: one IntersectionObserver with the root extended downwards, because a below-to-above jump never fired at 380), gone when the row is back, body.pdp-sticky-visible pads the page end and lifts the WhatsApp float, above the phone's cart bar, 1170 centred from 1200; token --spacing-pdp-sticky. After (logs/ux15/after.json): 380 group 140x44 / steppers 44x44 / bar 380x64; 768 and 1440 group 140x41 / steppers 40x41 / hover scale(2) at 25% 75%, click leaves hover, leave clears / bar 768x64 and 1170x64, button 124.6x44. Pinned by ProductGallery.test.tsx (+4), product-variant-quantity.test.tsx (+7), ProductInfo.sticky.test.tsx (6), e2e/product-buy-row.spec.ts (9 passed, 1 skipped on chromium + mobile-chrome). Neighbour e2e: 157 passed, 56 failed, all in UX13's known set except product.spec:133 (strict mode over two .pdp-related__grid strips since STEP 57; not run by UX12/13). Full suite 844 files / 9787 tests green, type-check, repo-wide lint and a fresh build green. | 5.33% / 4.07% / 2.56% (product, frozen Electro captures refs/electro_product_{width}.png; was 5.65 / 4.95 / 2.92 on 25.09; a bare run refuses, live side is our build) |
| 2026-10-14 | Cart page: item cards, quantity controls, remove animation, totals breakdown (UX16) | measured before (logs/ux16/before.json, the existing build of HEAD 41e42094d at 380/768/1440 on 3352, one line of /product/6253 in the basket): the remove press took the article out of the DOM within one frame (midRemove present:false at every width) and everything under it jumped up by the row's height; a plus press moved the field, the line total and the summary with no live region on the line or the total and no animation on either figure; the summary was two rows ("פריטים (1)", shipping) and the total, with nothing about VAT, no breakdown, no savings line and no figure for a purchase carrying an in-store balance; the disabled "+" at the ceiling was its whole explanation. Now: CartLineItem sets data-leaving + aria-busy on the press, freezes every control, measures the row into --cart-line-h and runs cart-line-leave (240ms fold + fade + 12px slide); animationend with that name (a child's pulse is ignored by name) or a 450ms fallback fires the store write exactly once, awaited so a refused removal clears the state on the row the store rolled back; "save for later" parks and removes through the same door; the global reduced-motion rule collapses the fold to 0.01ms and the event still fires. A sr-only output aria-live says "הכמות של X עודכנה ל-N"; ceilingHint under the pill ("זו הכמות המקסימלית במלאי" / "עד 99 יחידות בהזמנה אחת") is aria-describedby on "+"; "unit × count" on the card from two, hidden below 768; the line total pulses when the server's figure moves. CartTotalsSidebar: cartSavings (sumAgorot) as "סך החיסכון" only with two or more discounts and "חסכת ₪X בהזמנה זו" under the total for any; itemsNote under the items row when products and units differ; a closed <details> "פירוט לפי מוצר" (44px summary) once there is more than one unit; cartGrandTotal with the in-store balance named, only when one exists; "המחירים כוללים מע״מ"; aria-live=polite and the pulse on the on-site figure. No new colour. After (logs/ux16/after.json): row geometry unchanged (380 350x379, 768 736x140, 1440 796x140, steppers 44x44, pill 130x44); after a plus press both figures report cart-total-pulse and the live region reads the sentence; mid-remove the row is present with data-leaving, cart-line-leave 0.24s, opacity 0.61 / 0.82 / 0.72, max-height folding, controls disabled, then 0 lines and the empty state; the sidebar grew 18px (the VAT note). Pinned by cart-line-remove-animation.test.tsx (15), cart-totals-breakdown.test.tsx (10), e2e/cart-page.spec.ts (8 passed on chromium + mobile-chrome, reduced motion included). Neighbour e2e (cart, touch-targets, a11y, both projects): 100 passed, 55 failed, 5 skipped; the set is UX15's known set (target-size on a[התחברות] 72x41, Tab stops, legal pages) plus cart.spec:274 on mobile-chrome, which was the cart's own write limiter (120/h per client IP, exhausted by the day's runs from one laptop; the toast said "יותר מדי פעולות") and passes under a fresh E2E_FORWARDED_FOR, now honoured by playwright.config.ts. Full suite 846 files / 9812 tests green, type-check, repo-wide lint and a fresh build green (twice). | n/a (cart gate REFUSED: live side is our build, no frozen cart capture; row written by the gate) |
| 2026-10-14 | Checkout: three-step flow, street autocomplete, payment method selector (UX17) | measured before (logs/ux17/before.json, the existing build of HEAD 47ced0878 at 380/768/1440 on 3354, one line of /product/6253 in the basket): no step rail, every section open at once (details 4 fields, address 14, notes 1), the street a plain input with no role and no list under typing, the payment block one read-only radio line ("תשלום בעזרת כרטיס אשראי") with zero `token_id` radios for a guest, the pay button in the aside at y=3065 of a 3655px page at 380 (2903/3475 at 768). Now: `lib/checkout/steps.ts` gained a three-step layer over the four sections (`CHECKOUT_FLOW_STEPS` details/address/payment, `validateFlowStep`, `firstFlowStepWithErrors`, `initialFlowStep`: a saved address opens on the address step because the slot, carrier and notes live there); `CheckoutForm` renders a `nav.checkout-steps` rail (`aria-current="step"`, done steps are buttons), one open `.checkout-section__body` at a time with the others `hidden` and never unmounted (uncontrolled inputs, DOM-written autofill and resume survive; the one submit still judges the whole form and opens the step that owns the first error), a done step keeps a summary line and an "ערוך" control, "המשך" judges its own step through the same per-section rules, the resume after Google reopens on the first step with something wrong (payment, for a complete form). `StreetAutocomplete` (combobox over the uncontrolled `street` input, 180ms debounce, asks only while focused with a city and two characters, aborts stale answers, sr-only count) over `/api/checkout/streets` (rate limit `street-lookup` 60/10min, 4s deadline, `CacheControl.streets`) over `lib/checkout/street-autocomplete.ts` (CBS street registry on data.gov.il, resource 9ad3862c, `plain=false` ANDed `to_tsquery` with a `:*` prefix, city words in the query and re-checked on our side, ranked prefix-first, capped at 8; `ISRAEL_STREETS_LOOKUP_URL` unset = registry, `off`, or an https template). `PaymentMethodSelector` over `lib/checkout/payment-methods.ts`: a radio group under `token_id` of the saved cards (Hebrew brand + last four, default badge) and the hosted page ("כרטיס אשראי" / "כרטיס אחר", the footer's brand marks beside it); only what `submitCheckout` can charge, no Bit or wallet buttons. The payment block moved from under the order table into the third step; the aside keeps the table. New CSS on tokens and rem only (checkout-page.css has fewer raw px/hex than before: 188/69 vs 193/72); `.checkout-field__hint` to `--color-muted` because axe measured #777 at 4.48:1 on the slot hint. Measured after (logs/ux17/after.json, fresh build on 3355): rail 3 items with step 1 current, details 4 fields visible, address and payment 0, pay button hidden until step 3, page 1972/1918/1696px (was 3655/3475/2890); street `role=combobox` and after typing "דיז" in תל אביב the list opens with דיזנגוף / דיזנגוף סנטר / ככר דיזנגוף and the status reads "3 רחובות מוצעים"; one ticked `token_id=new` radio for a guest. Pinned by flow-steps.test.ts (14), payment-methods.test.ts (9), street-autocomplete.test.ts (20), api/checkout/streets/route.test.ts (5), street-autocomplete.test.tsx (12), payment-method-selector.test.tsx (5), multi-step-checkout.test.tsx (23, replacing single-page-checkout.test.tsx), e2e/checkout-steps.spec.ts (10 passed, 2 skipped because the local build's payment gate is closed; one mobile-chrome run timed out in the shared seeding helper and passed alone), e2e/a11y.spec.ts checkout (2/2, rewritten to the three steps), rtl-mobile and full-purchase-redeem walks updated. Neighbour e2e: rtl-mobile 320 and touch-targets fail everywhere on the known 323 header overflow (UX13). Full suite 852 files / 9878 tests green, type-check, repo-wide lint, hardcoded gate (`--range=HEAD`, 21 files, no new values) and a fresh build green. | cart/checkout refuse (live side is our build, no frozen capture); the gate wrote its REFUSED row for checkout at 380 |
| 2026-10-14 | Account page: tabs (overview, orders, wishlist, addresses, settings) with Hebrew labels (UX18) | measured before (logs/ux18/before.json, the existing build of HEAD 577e2f495 at 380/768/1440 on 3356, signed in as the E2E customer): no tab bar on any account route; the side nav (18 rows, 938px tall at 380 and 768) came first on a phone and the page's own content began at y=1174 (380) / 1137 (768); /account itself rendered "משהו השתבש אצלנו" at every width (`getCustomerVouchers` threw PGRST201 on a bare `suppliers(name)` embed: `vouchers` has two FKs to `suppliers`); the nav's "רשימת המשאלות" pointed at /wishlist, which production's `seo_redirects` holds as an active 410 from the 09.09 seed of 192 (`curl -I` on the built server: 410), so the link landed on a blank Gone; /account/settings was a 404. Now: `lib/account/tabs.ts` (`ACCOUNT_TABS`, `activeAccountTab`: overview exact, orders also /account/return, settings also details / notifications / security / privacy / tokens, nothing for wallet or coupons); `AccountTabsList` (hook-free markup: `nav[aria-label="אזורי החשבון"]` of five links, `aria-current="page"`, no tablist, each 44px) under `AccountTabs` (`usePathname`) in a request-time slot (`await connection()`: the hook resolving inside the prerender wrote a nonce-less `$RC("B:6","S:6")` into 21 account shells and failed csp-shell-gate, logs/ux18/build2.log; the slot puts the boundary on the resume path with the five unlit links as the shell's fallback); the shell grid gives the nav `grid-row: 1 / span 2` so the bar sits over the content column beside the nav on a desktop, and `order: -1` under 900px so it comes first on a phone; one row at every width, sideways scroll at 380, yellow rule under the current one, muted #657888 (4.9:1) for the rest. /account/wishlist is a page inside the shell (`WishlistPageView embedded`: the same list, the shell's breadcrumb, sign-in return path /account/wishlist); /account/settings is the hub (profile form, cards for notifications / security / payment methods / privacy, sign-out) and /account/details is a 308 to it; the side nav points at both. The four `vouchers` reads name `suppliers!vouchers_supplier_id_fkey` (queries/vouchers.ts, payments/voucher-email.ts, actions/gifts.ts, actions/admin/vouchers.ts). `migrations/pending/271` deactivates the /wishlist 410 row (NOT applied; the tab does not wait for it, the header heart does). The legacy map regenerated for the new route (+/account/settings, 192's GENERATED line and checksum). After (logs/ux18/after.json, fresh build on 3357): tab bar 350x44 at y=186.7 before the nav (y=250.7) at 380, 738x44 at 768 (no scroll), 1000x44 at 1440 level with the nav (y=209.3) over the content column (x=75) with the content starting under it (y=273.3); the current tab correct on all six routes; /account renders "האזור האישי" at every width; /account/wishlist 200 inside the shell; /account/details lands on /account/settings; zero page errors. Pinned by tabs.test.ts (23), AccountTabs.test.tsx (4), overview.test.ts (+7 on the hub, the redirect, the in-shell wishlist, the layout slot and the nav), vouchers-supplier-embed.test.ts (4), e2e/account-tabs.spec.ts (8 passed on chromium + mobile-chrome: labels, aria-current through the four clicks, child routes, the details redirect, geometry at both widths). Neighbour e2e: auth + smoke-all-routes 47 passed. Full suite 855 files / 9921 tests green, type-check, repo-wide lint, three builds (the first stopped on CLIENT_HOOK_DYNAMIC, the second on the csp gate, the third clean: 276 shells, every page on the resume path). | n/a (compare.mjs has no account page; live side is our build) |
| 2026-10-14 | Wishlist page: product grid, move to cart, remove with undo, share link (UX20) | measured before (logs/ux20/before.json, the existing build of HEAD f51d0aae1 at 380/768/1440 on 3360, signed in as the E2E customer, /account/wishlist): a one-column list at 380 (two at 768, three at 1440) of 158px rows with an 80px thumbnail beside the name, the move button 36px tall and the remove 40x40, the toolbar one button ("העברת הכל לסל", only from two movable products) and no share control anywhere on the page (the share card returns null while 248 is unapplied: `wishlist_shares` is a 404 and `fn_shared_wishlist` PGRST202 to anon REST on production); a remove press froze every button on the page and took the row out of the DOM with no leaving state, no toast, no undo and no live region (midRemove: animation none, afterRemove: toasts [], live []); a move press did the same (mid present:false). /wishlist itself is still the 410 of UX18 (271 not applied). Now: `WishlistCard` (the catalogue anatomy: a square photo slot with the discount badge, the name as the product link, price with the old price struck, a stock line, "נשמר היום / אתמול / לפני N ימים", and two 44px actions at the foot) in a `.wishlist-grid` of 2 / 3 / 4 across (0 / 768 / 1200); a remove press sets `data-leaving="remove"` + `aria-busy`, freezes the card's own two buttons (the rest of the grid stays live), runs `wishlist-card-leave` (240ms scale + fade; a fold would drag a grid row) and fires the store write once on `animationend` of that name or a 450ms fallback, a refused write puts the card back; the write's toast carries "ביטול", which re-adds through the heart's own toggle and `restoreItem` puts the product back at its old index; a move asks the cart FIRST (`addToCart`, the cart's own toast and validation), `data-leaving="move"` only on acceptance, then the same exit and write; a sr-only `<output aria-live>` announces "X עבר לסל" / "X הוסר מהרשימה" / "X חזר לרשימה" / "N מוצרים עברו לסל". The toolbar: the count, `WishlistShareAction` (one press: with a live link the share sheet or the clipboard + "הקישור הועתק"; with none, `setWishlistShare('enable')` then the same; while 248 is unapplied `data-share="unavailable"`, `aria-disabled`, and a toast "שיתוף הרשימה עוד לא פתוח" instead of hiding), and "העברת הכל לסל (N)". The share state is lifted to the page so the toolbar and the (now controlled) `WishlistShareCard` agree. A skeleton grid of the same cells while the read is in flight; an empty state with the catalogue and the coupons. `wishlist-page.css` on tokens only, imported by the account LAYOUT (a page-owned stylesheet inside the shell's boundary made Fizz write `$RB/$RV` into the shell, build.log) and the page itself is `await connection()` (as a static page its grown client view completed INSIDE the prerender and wrote `$RC("B:5","S:5")` into account/wishlist.html, build3.log; the fourth build is clean: 276 shells). Measured after (logs/ux20/after.json, fresh build on 3361): cards 167x323 at 380 (two across, thumb 141x141), 235x391 at 768 (three across, thumb 209), 238x394 at 1440 (thumb 212; four across from 1200), move 89-160x44 and remove 44x44 at every width, the toolbar's two buttons 44 tall; midRemove: present, `data-leaving="remove"`, `aria-busy`, animation `wishlist-card-leave` 0.24s, opacity 0.887, both buttons disabled; afterRemove: the card gone, toast "X הוסר מהרשימה" + "ביטול", live region reads it, the undo restores the count and the live region reads "X חזר לרשימה"; move: "מעביר..." + `aria-busy` at 80ms, then the card gone, the header cart count +1, the cart's "נוסף לעגלה" toast and the live region "X עבר לסל"; zero page errors. Pinned by page-view.test.ts (14), wishlist-card-leave.test.tsx (8), wishlist-page-view.test.tsx (13), e2e/wishlist-page.spec.ts (grid geometry and the 44px targets, remove with exit + undo, move with the header count, the share button in both of its production states). Full suite 860 files / 9973 tests green, type-check, repo-wide lint and a fresh build green. | n/a (compare.mjs has no wishlist page; live side is our build) |
