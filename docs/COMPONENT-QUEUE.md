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
