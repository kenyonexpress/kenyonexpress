# Electro home-v7 → KenyonExpress component map

Source:
https://electro.madrasthemes.com/home-v7/

Measurements (Playwright getBoundingClientRect, 2026-08-11):

```
refs/electro-measurements-380.md
```

viewport **380×667**

```
refs/electro-measurements-768.md
```

viewport **768×1024**

Cross-check baseline: `DESIGN-MEASURED.md` + `ELECTRO_HERO` (named file `refs/electro.madrasthemes.com-DESIGN.md` is **missing** in this worktree). Full discrepancy table at the end of this file.

---

## Binding target paths

| Logical component | Primary target path | Alternate / intended |
|-------------------|---------------------|----------------------|
| Header | `src/components/layout/Header.tsx` | `src/components/layout/SiteHeader.tsx`, `src/components/Header.tsx` |
| HeroSlider | `src/components/home/HeroSlider.tsx` | `src/components/store/HeroSlider.tsx` (re-export); `HomeHeroSection.tsx`, `HeroExact.tsx` |
| ProductCard | `src/components/ProductCard.tsx` | `src/components/category/CategoryProductCard.tsx` |
| DealsRow | `src/components/home/DealsOfTheDay.tsx` | `src/components/store/DealsSection.tsx` |
| CategoryStrip | `src/components/store/CategoryStrip.tsx` | tokens: `src/lib/electro-hero-tokens.ts` → `categoryStrip`; in-hero menu: `HeroCategorySidebar.tsx` |
| BrandsCarousel | **intended** `src/components/store/BrandsCarousel.tsx` (not present yet) | nearest live: brand/DA blocks via `PromoBanners.tsx` / `.das-with-banners` section; do not invent a second ProductCard |
| Footer | `src/components/layout/SiteFooter.tsx` | `src/components/home/Footer.tsx`, `src/components/SiteFooter.tsx` |

Helpers:

- `src/components/home/HeroCategorySidebar.tsx`
- `src/components/home/HeroPromoBanners.tsx` / `src/components/store/PromoBanners.tsx`
- `src/components/home/BenefitBar.tsx`
- `src/components/store/CategoryProductSection.tsx`
- `src/components/home/FeaturedProducts.tsx` / `FeaturedProductsTabs.tsx`
- `src/components/search/HeaderSearch.tsx`
- `src/lib/electro-hero-tokens.ts`

---

## Homepage sections top → bottom

| # | Electro class / selector | 380×667 (w×h @ top) | 768×1024 (w×h @ top) | Logical target |
|---|--------------------------|---------------------|----------------------|----------------|
| 0 | `#masthead.site-header.header-v8` | **380×55.52 @ 0** | **768×55.52 @ 0** | Header |
| 1 | `.vertical-menu-slider-category-with-das` | **380×895 @ 55.52** | **768×648 @ 55.52** | HeroSlider + CategoryStrip (in-hero) + promo DAs |
| 1a | `rs-module-wrap#rev_slider_6_1_wrapper` | **348×192 @ 55.52** (left 16) | **688×287 @ 55.52** | HeroSlider |
| 2 | `.section-products-carousel.products-carousel-with-timer` | **350×430.41 @ 950.52** | **690×396.22 @ 703.52** | DealsRow |
| 3 | `.home-v7-banner-block` | **350×35.72 @ 1408.92** | **690×70.42 @ 1139.72** | PromoBanners |
| 4 | `.products-with-category-image` | **350×1754.08 @ 1483.64** | **690×766.08 @ 1249.14** | CategoryProductSection + ProductCard |
| 5 | `.home-v7-da-block.home-two-banners` | **350×76.59 @ 3265.72** | **690×73.3 @ 2055.2** | PromoBanners |
| 6 | `.products-category-with-image` (1) | **350×1190.25 @ 3370.31** | **690×334.59 @ 2156.5** | CategoryProductSection + ProductCard |
| 7 | `.products-category-with-image` (2) | **350×1190.25 @ 4588.56** | **690×334.59 @ 2531.08** | CategoryProductSection + ProductCard |
| 8 | `.two-row-products` | **350×1709.7 @ 5806.81** | **690×1379.98 @ 2905.66** | FeaturedProducts + ProductCard |
| 9 | `.das-with-banners` | **350×465.2 @ 7544.52** | **690×270.56 @ 4325.63** | BrandsCarousel (intended) / PromoBanners until BrandsCarousel exists |
| 10 | `#colophon.site-footer.footer-v2` | **380×576.3 @ 8215.22** | **768×511.73 @ 4761.69** | Footer |

`.site-main` width: **350px** @ 380vp, **690px** @ 768vp.

---

## 1. Header

Electro: `#masthead`

Target:
`src/components/layout/Header.tsx`

| Property | 380×667 | 768×1024 |
|----------|---------|----------|
| width × height | 380 × 55.52 | 768 × 55.52 |
| top / left | 0 / 0 | 0 / 0 |
| padding | 0 | 0 |
| position | static | static |
| font | 14px / 400 / rgb(51,62,72) | same |

- `.top-bar`: **display none**, box **0×0** at both viewports.
- Desktop search `.navbar-search`: width **0** (handheld pattern).
- Sticky class not present at rest.

---

## 2. HeroSlider

Electro: `rs-module-wrap#rev_slider_6_1_wrapper`

Target:
`src/components/home/HeroSlider.tsx`

| Property | 380×667 | 768×1024 |
|----------|---------|----------|
| width × height | 348 × 192 | 688 × 287 |
| top | 55.52 | 55.52 |
| left | 16 | see JSON |
| padding / margin | 0 | 0 |
| position | relative | relative |

Parent `.vertical-menu-slider-category-with-das`: **380×895** / **768×648**.

Desktop token still claims **743×377** (`ELECTRO_HERO.slider`). Do not apply at 380/768.

---

## 3. ProductCard

Electro: first `.product` / `li.product`

Target:
`src/components/ProductCard.tsx`

| Sub-element | 380×667 | 768×1024 |
|-------------|---------|----------|
| Card | **175 × 273.75** | **172.5 × 271.25** |
| Image | **147 × 147** | see measurement JSON |
| Title | font **11.998px** / 700 / `#0062bd`; box 147×28; mb 8 | see JSON |
| Price | font **16.002px** / 400 / `#333e48` | font **16.002px** / `#333e48` |
| Category link | font **11.2px** / `#768b9e` | see JSON |
| Padding / margin on card | 0 | 0 |
| Gap between adjacent cards | horizontalGap **0** (same row) | horizontalGap **0** (same row) |

Desktop DESIGN claim: card **234×?** image **186×186**. Not valid at these breakpoints.

---

## 4. DealsRow

Electro: `.section-products-carousel.products-carousel-with-timer`

Target:
`src/components/home/DealsOfTheDay.tsx`
(alternate `src/components/store/DealsSection.tsx`)

| Property | 380×667 | 768×1024 |
|----------|---------|----------|
| section w×h | **350 × 430.41** | **690 × 396.22** |
| top | 950.52 | 703.52 |
| cells | ProductCard instances inside carousel | same |

Build 1:1 timer header + horizontal product cells using ProductCard metrics above.

---

## 5. CategoryStrip

Electro desktop docs expect `.product-categories-carousel` height **170**.

At 380/768: **no standalone strip match**. Category UI lives in `.vertical-menu-slider-category-with-das`.

Targets:

- Storefront strip (desktop / ke_live pattern):
  `src/components/store/CategoryStrip.tsx`
- In-hero vertical categories at tablet/mobile Electro structure:
  `src/components/home/HeroCategorySidebar.tsx`

| Viewport | Standalone strip | Hero category block |
|----------|------------------|---------------------|
| 380 | unmatched | **380 × 895** @ 55.52 |
| 768 | unmatched | **768 × 648** @ 55.52 |

Token `ELECTRO_HERO.categoryStrip.height = 170` is desktop-only.

---

## 6. BrandsCarousel

Electro: no dedicated `.brands` carousel selector matched. Closest measured block with brand/DA imagery: `.das-with-banners`.

| Property | 380×667 | 768×1024 |
|----------|---------|----------|
| `.das-with-banners` | **350 × 465.2** @ 7544.52 | **690 × 270.56** @ 4325.63 |

Target path (intended, create when implementing):

```
src/components/store/BrandsCarousel.tsx
```

Until that file exists, map the section to
`src/components/store/PromoBanners.tsx`
without inventing a parallel card component.

---

## 7. Footer

Electro: `#colophon.site-footer.footer-v2`

Target:
`src/components/layout/SiteFooter.tsx`

| Property | 380×667 | 768×1024 |
|----------|---------|----------|
| width × height | **380 × 576.3** | **768 × 511.73** |
| top | 8215.22 | 4761.69 |
| padding | 0 | 0 |

Children (`.footer-widgets`, `.footer-newsletter`, `.copyright`) returned **0×0** in this automated pass. Outer `#colophon` is authoritative for total height; re-measure children with per-node `scrollIntoView` before locking newsletter/copyright strips.

---

## Design discrepancies (exact px)

Baseline: `DESIGN-MEASURED.md` + `ELECTRO_HERO`. Named
`refs/electro.madrasthemes.com-DESIGN.md`
**not found** (D01).

| ID | Design claim (exact) | Measured 380 | Measured 768 | Severity |
|----|----------------------|--------------|--------------|----------|
| D01 | File `electro.madrasthemes.com-DESIGN.md` exists under refs/ | missing | missing | blocker |
| D02 | Top bar height **38px**; masthead top **38.34** | top-bar **0×0** display:none; masthead top **0** | same | high |
| D03 | Header height **110px** (109.94 @ 1440) | header **55.52px** | header **55.52px** | high |
| D04 | Hero slider **743×377** | slider **348×192** | slider **688×287** | high |
| D05 | Hero grid row **512**; columns 200 / 1fr / 225 | parent block **380×895** | parent block **768×648** | high |
| D06 | Category strip height **170px**, max-width **728** | strip unmatched | strip unmatched | high |
| D07 | Strip label **14px / 600** | n/a (no strip) | n/a | medium |
| D08 | USP bar max-width **1170**, radius **8** | USP unmatched | USP unmatched | medium |
| D09 | Product card width **234px** | card **175×273.75** | card **172.5×271.25** | high |
| D10 | Card image **186×186** | image **147×147** | see JSON | high |
| D11 | Card title **14px / 700 / `#0062bd`**, lh **18** | title **11.998px / 700 / `#0062bd`**, lh **~14.00** | see JSON | medium |
| D12 | Card price **20px / `#333e48`** | price **16.002px / `#333e48`** | price **16.002px / `#333e48`** | medium |
| D13 | Category tag **12px / `#768b9e`** | tag **11.2px / `#768b9e`** | see JSON | low |
| D14 | Section heading **25px / 500** | heading sample **17px / 700** | heading sample **21.994px / 400** | medium |
| D15 | Content container **1170px** | `.site-main` **350px** | `.site-main` **690px** | doc gap |
| D16 | Footer widgets pad ~**59.9 / 62.2**; newsletter h **80**; copyright h **45** | `#colophon` **380×576.3**; children **0×0** | `#colophon` **768×511.73**; children **0×0** | medium |
| D17 | Search **534×41**; logo **300×79** | search w **0**; logo hit **0×0** | search w **0**; logo hit **0×0** | high |
| D18 | Sale badge **12px/700** on `#44b81b` | no `.onsale` on first cards | no `.onsale` on first cards | low |
| D19 | Layout numbers presented as electro home-v7 truth without desktop-only label | applying 1440 px at 380/768 is wrong | same | high |
| D20 | Agents routed to `electro.madrasthemes.com-DESIGN.md` | actual files: DESIGN-MEASURED + ELECTRO_HERO + these refs | same | medium |

**Discrepancy count: 20 (D01–D20).**

Agent rule: at **380** and **768** use this map + measurement JSON; at **≥1200** use DESIGN-MEASURED / ELECTRO_HERO.
