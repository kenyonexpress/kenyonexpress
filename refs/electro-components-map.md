# Electro home-v7 → KenyonExpress component map

Source page:
https://electro.madrasthemes.com/home-v7/

Measurement artifacts:
refs/electro-measurements-380.md
(viewport 380×667)

refs/electro-measurements-768.md
(viewport 768×1024)

Purpose: give a storefront agent a 1:1 map from Electro DOM regions to target files in this worktree, with measured box models at both breakpoints. No guessing.

---

## Binding target paths (ke-arch)

| Logical component | Primary target path | Alternate / re-export |
|-------------------|---------------------|------------------------|
| Header | `src/components/layout/Header.tsx` | `src/components/layout/SiteHeader.tsx` (re-exports Header), `src/components/Header.tsx` |
| HeroSlider | `src/components/home/HeroSlider.tsx` | `src/components/store/HeroSlider.tsx` (re-exports home), related: `HomeHeroSection.tsx`, `HeroExact.tsx`, `HeroSection.tsx` |
| ProductCard | `src/components/ProductCard.tsx` | Category grid variant: `src/components/category/CategoryProductCard.tsx` |
| CategoryStrip | `src/components/store/CategoryStrip.tsx` | Tokens: `src/lib/electro-hero-tokens.ts` → `ELECTRO_HERO.categoryStrip` |
| Footer | `src/components/layout/SiteFooter.tsx` | `src/components/home/Footer.tsx`, `src/components/SiteFooter.tsx` |

Related helpers (not the five required shells, but used by them):

- Hero category column: `src/components/home/HeroCategorySidebar.tsx`
- Hero promo banners: `src/components/home/HeroPromoBanners.tsx` / `src/components/store/PromoBanners.tsx`
- USP / benefit bar: `src/components/home/BenefitBar.tsx` (`ELECTRO_HERO.uspBar`)
- Category nav / sidebar: `src/components/store/CategoryNav.tsx`, `CategorySidebar.tsx`
- Header search: `src/components/search/HeaderSearch.tsx`
- Hero tokens: `src/lib/electro-hero-tokens.ts`

---

## Homepage sections top → bottom (Electro DOM)

Measured class names from `#content` / `.site-main` children.

| # | Electro selector / class | 380×667 box (w×h @ top) | 768×1024 box (w×h @ top) | Target component(s) |
|---|--------------------------|-------------------------|--------------------------|---------------------|
| 0 | `#masthead.site-header.header-v8` | 380×55.52 @ 0 | 768×55.52 @ 0 | Header |
| 1 | `.vertical-menu-slider-category-with-das` | 380×895 @ 55.52 | 768×648 @ 55.52 | HeroSlider + HeroCategorySidebar + HeroPromoBanners |
| 1a | `rs-module-wrap#rev_slider_6_1_wrapper` (slider inside #1) | 348×192 @ 55.52 (left 16) | 688×287 @ 55.52 | HeroSlider |
| 2 | `.section-products-carousel.products-carousel-with-timer` | 350×430.41 @ 950.52 | 690×396.22 @ 703.52 | Deals / carousel (`src/components/home/DealsOfTheDay.tsx`, `store/DealsSection.tsx`) using ProductCard cells |
| 3 | `.home-v7-banner-block` | 350×35.72 @ 1408.92 | 690×70.42 @ 1139.72 | PromoBanners |
| 4 | `.products-with-category-image` | 350×1754.08 @ 1483.64 | 690×766.08 @ 1249.14 | CategoryProductSection + ProductCard |
| 5 | `.home-v7-da-block.home-two-banners` | 350×76.59 @ 3265.72 | 690×73.3 @ 2055.2 | PromoBanners |
| 6 | `.products-category-with-image` (1) | 350×1190.25 @ 3370.31 | 690×334.59 @ 2156.5 | CategoryProductSection + ProductCard |
| 7 | `.products-category-with-image` (2) | 350×1190.25 @ 4588.56 | 690×334.59 @ 2531.08 | CategoryProductSection + ProductCard |
| 8 | `.two-row-products` | 350×1709.7 @ 5806.81 | 690×1379.98 @ 2905.66 | FeaturedProducts / two-row grid + ProductCard |
| 9 | `.das-with-banners` | 350×465.2 @ 7544.52 | 690×270.56 @ 4325.63 | PromoBanners |
| 10 | `#colophon.site-footer.footer-v2` | 380×576.3 @ 8215.22 | 768×511.73 @ 4761.69 | Footer |

Main content gutter: `.site-main` width **350** at 380vp, **690** at 768vp (15px side padding inside container).

---

## 1. Header

**Electro:** `#masthead` (class `site-header header-v8`)

**Target:** `src/components/layout/Header.tsx`

| Property | 380×667 | 768×1024 |
|----------|---------|----------|
| width | 380 | 768 |
| height | 55.52 | 55.52 |
| top / left | 0 / 0 | 0 / 0 |
| padding | 0 | 0 |
| position | static | static |
| body/header font | 14px / weight 400 / `#333e48` | same |

Notes:

- `.top-bar` exists but `display: none` at both breakpoints (Bootstrap `d-none d-xl-block`). Height 0. Do not render a desktop top bar under 1200px.
- Sticky header selectors not present at rest (no `.stuck` / `.is-sticky` match).
- Desktop `.navbar-search` is in DOM with width 0 at these breakpoints (collapsed into handheld header pattern). Use handheld header layout under 1200px.
- Prior mobile capture in sibling docs used `.handheld-header-wrap` (~54.52px). Live home-v7 `#masthead` now measures **55.52px** at 380 and 768.

---

## 2. HeroSlider

**Electro:** `rs-module-wrap#rev_slider_6_1_wrapper`

**Target:** `src/components/home/HeroSlider.tsx`

| Property | 380×667 | 768×1024 |
|----------|---------|----------|
| width | 348 | 688 |
| height | 192 | 287 |
| top | 55.52 | 55.52 |
| left | 16 | (centered in container; see raw JSON) |
| padding / margin | 0 | 0 |
| position | relative | relative |

Parent block `.vertical-menu-slider-category-with-das`:

| Viewport | width × height |
|----------|----------------|
| 380 | 380 × 895 |
| 768 | 768 × 648 |

Tokens file still codes desktop RevSlider as **743×377** (`ELECTRO_HERO.slider`). That is a desktop (1440) token, not these breakpoints. See discrepancies.

---

## 3. ProductCard

**Electro:** first `li.product` / `.product` in `ul.products`

**Target:** `src/components/ProductCard.tsx`

| Sub-element | 380×667 | 768×1024 |
|-------------|---------|----------|
| Card | 175 × 273.75 | 172.5 × 271.25 |
| Image | 147 × 147 | (see measurement JSON) |
| Title `h2.woocommerce-loop-product__title` | 147×28; font **11.998px** / 700 / `#0062bd`; line-height ~14; margin-bottom 8 | see JSON |
| Price `.price` | ~59×16; font **16.002px** / 400 / `#333e48` | font **16.002px** / `#333e48` |
| Category link | font **11.2px** / `#768b9e` | see JSON |
| Badge `.onsale` | none on first card sample | none on first card sample |
| Card padding/margin | 0 | 0 |

Grid gap note: adjacent cards report `horizontalGap: 0` with `sameRow: true` (touching cells in a 2-up row at 380). At 768, first measured cards are ~172.5 wide inside a ~352px products list fragment (carousel/partial grid), not the full 6-up desktop 234px card from DESIGN-MEASURED.

---

## 4. CategoryStrip

**Electro expectation (desktop docs):** `.product-categories-carousel` / strip height 170, label 14/600.

**Live home-v7 at 380 and 768:** no standalone `.product-categories-carousel` match. Category UI is folded into `.vertical-menu-slider-category-with-das` with the slider (vertical menu + slider + DA banners).

**Target still:** `src/components/store/CategoryStrip.tsx` for the storefront's dedicated strip (ke_live / desktop pattern), plus `HeroCategorySidebar.tsx` for the in-hero vertical menu at tablet/mobile when matching Electro home-v7 structure.

| Viewport | Standalone strip matched? | Hero category block |
|----------|---------------------------|---------------------|
| 380 | no | `.vertical-menu-slider-category-with-das` 380×895 |
| 768 | no | `.vertical-menu-slider-category-with-das` 768×648 |

Token claim (`ELECTRO_HERO.categoryStrip.height = 170`) is desktop-oriented; not observed as a separate strip at these widths.

---

## 5. Footer

**Electro:** `#colophon.site-footer.footer-v2`

**Target:** `src/components/layout/SiteFooter.tsx`

| Property | 380×667 | 768×1024 |
|----------|---------|----------|
| width | 380 | 768 |
| height | 576.3 | 511.73 |
| top | 8215.22 | 4761.69 |
| padding | 0 | 0 |

Sub-nodes (`.footer-widgets`, `.footer-newsletter`, `.copyright`) returned **0×0** in the automated pass (likely collapsed columns / off-viewport without dedicated scrollIntoView per child). Treat `#colophon` outer box as authoritative for total footer height; re-measure children with per-node `scrollIntoView` before coding newsletter/copyright bars if pixel-locking those strips.

Body text color in footer region remains `#333e48`, font-size 14px (matches DESIGN-MEASURED footer body).

---

## Typography snapshot (page)

| Role | 380 | 768 | DESIGN-MEASURED / tokens claim |
|------|-----|-----|--------------------------------|
| Body | 14px / `#333e48` | 14px / `#333e48` | match |
| Loop product title | ~12px / 700 / `#0062bd` | ~12px class | DESIGN says category card title 14px/700/`#0062bd` (desktop/live category) |
| Loop price | ~16px / `#333e48` | ~16px / `#333e48` | DESIGN category card price 20px |
| Section heading sample | 17px / 700 | ~22px / 400 | DESIGN section heading 25px/500 |

---

## Agent build rules

1. Prefer the **Primary target path** table above; do not invent parallel components.
2. Use **380 and 768 boxes from this file** for responsive CSS; use `ELECTRO_HERO` / DESIGN-MEASURED only for ≥1200 desktop unless a token is explicitly labeled mobile.
3. Full JSON for every measured node lives inside the measurement markdown files (fenced `json` blocks).
4. Discrepancies vs design docs: `refs/electro-design-discrepancies.md`.
