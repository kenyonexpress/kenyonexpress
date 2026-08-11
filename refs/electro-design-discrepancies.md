# Electro design discrepancies

Cross-check of live Playwright measurements (2026-08-11) against the design corpus that agents were told to use.

## Source of truth for this check

| Artifact | Status in ke-arch |
|----------|-------------------|
| `refs/electro.madrasthemes.com-DESIGN.md` | **MISSING** (searched `refs/`, `docs/`, repo root). Referenced by sibling docs (e.g. PRODUCT-PAGE-SPEC wording in other trees) but not present here. |
| `DESIGN-MEASURED.md` (repo root) | Present. Used as primary design baseline. |
| `src/lib/electro-hero-tokens.ts` (`ELECTRO_HERO`) | Present. Desktop (1440) electro home-v7 tokens. |
| Live measurements | `refs/electro-measurements-380.md` (380×667), `refs/electro-measurements-768.md` (768×1024) |

Every row below is a concrete mismatch between a design claim and the new measurement (or a missing required design file).

---

## Discrepancy list

| ID | Claim (design / tokens) | Measured (380 / 768) | Severity |
|----|-------------------------|----------------------|----------|
| D01 | File `refs/electro.madrasthemes.com-DESIGN.md` exists as the electro design binding | File not found anywhere in this worktree | blocker for named cross-check |
| D02 | Top bar height **38px**; masthead sits at top **38.34** (DESIGN-MEASURED §3) | Top bar `display:none` (0×0) at 380 and 768; masthead top **0** | high (breakpoint) |
| D03 | Header `#masthead` height **110px** at 1440 (DESIGN-MEASURED) | Header height **55.52px** at both 380 and 768 | high (breakpoint) |
| D04 | Hero slider height **377px**, width **743** (`ELECTRO_HERO.slider` / DESIGN-MEASURED) | Slider **348×192** (380), **688×287** (768) | high (breakpoint) |
| D05 | Hero grid columns `200px minmax(0,1fr) 225px`, row height **512** (`ELECTRO_HERO.grid`) | At 380/768 the hero is inside `.vertical-menu-slider-category-with-das` (**380×895** / **768×648**); no 200/743/220 three-column row | high (layout mode) |
| D06 | Category strip height **170px**, border `#e7e7e7`, max-width **728** (`ELECTRO_HERO.categoryStrip` / DESIGN-MEASURED) | No standalone `.product-categories-carousel` / strip match at 380 or 768 | high |
| D07 | Category strip label **14px / 600 / `#333e48`** | Strip not isolated; cannot confirm label metrics at these viewports | medium |
| D08 | USP / benefit bar max-width **1170**, border `#ddd`, radius **8** (`ELECTRO_HERO.uspBar`) | No USP/features selector matched on home-v7 at 380 or 768 | medium |
| D09 | Product card width **234px** (6-up in 1170 grid, DESIGN-MEASURED live category) | Card **175×273.75** (380), **172.5×271.25** (768) | high (breakpoint) |
| D10 | Card image **186×186** (DESIGN-MEASURED) | Image **147×147** at 380 | high (breakpoint) |
| D11 | Category/card title **14px / 700 / `#0062bd`**, line-height **18** | Loop title **~12px** (11.998) / 700 / `#0062bd`, line-height **~14** at 380 | medium |
| D12 | Card price **20px / `#333e48`** (DESIGN-MEASURED category card) | Loop price **~16px** (16.002) / `#333e48` at 380 and 768 | medium |
| D13 | Card category tag **12px / `#768b9e`** | Measured category link **11.2px / `#768b9e`** at 380 | low |
| D14 | Section heading **25px / 500 / `#333e48`** | Sample home heading **17px/700** (380), **~22px/400** (768) | medium |
| D15 | Content container **1170px** (DESIGN-MEASURED desktop) | `.site-main` content width **350** (380), **690** (768) | expected at these viewports; docs omit mobile container widths |
| D16 | Footer widgets padding-top **~60**, padding-bottom **~62**, bg `#f8f8f8`; newsletter bar height **80**; copyright height **45** (DESIGN-MEASURED) | Only outer `#colophon` sized (**380×576.3** / **768×511.73**); widgets/newsletter/copyright children reported 0×0 in this pass | medium (measurement gap + possible doc desktop-only) |
| D17 | Sticky / desktop search bar **534×41**, logo **300×79** (DESIGN-MEASURED) | Search width **0** at 380/768; logo selector hit non-visible `vc_single_image` (0×0). Handheld header pattern applies instead | high (breakpoint) |
| D18 | Sale badge **12px/700 white on `#44b81b`** (DESIGN-MEASURED) | No `.onsale` on first sampled product cards at either viewport | low (catalog dependent) |
| D19 | DESIGN-MEASURED / tokens present themselves as electro home-v7 measured truth without stating they are **desktop-only (1440)** for layout numbers | Applying those px values 1:1 at 380/768 would be wrong for header, hero, strip, and cards | high (doc clarity) |
| D20 | Implied durable artifact name `electro.madrasthemes.com-DESIGN.md` under `refs/` (ARCHITECTURE / PRODUCT-PAGE-SPEC references) | Actual durable measured design in-tree is `DESIGN-MEASURED.md` + `electro-hero-tokens.ts`, not the named file | medium (indexing / agent routing) |

---

## Count

**20 discrepancies** listed (D01–D20).

Of these:

- 1 missing binding file (D01)
- Multiple desktop-vs-mobile/tablet layout mismatches (D02–D10, D15, D17, D19)
- Typography scale mismatches at small viewports (D11–D14)
- Footer sub-element measurement gap (D16)
- Catalog-dependent badge absence (D18)
- Naming / routing drift (D20)

---

## How to use

1. For storefront work at **380** and **768**, prefer `refs/electro-measurements-*.md` + `refs/electro-components-map.md`.
2. For **≥1200 / 1440** desktop, prefer `DESIGN-MEASURED.md` + `ELECTRO_HERO`.
3. Do not treat missing `electro.madrasthemes.com-DESIGN.md` as optional silence: recreate it from DESIGN-MEASURED + these measurements, or update MASTER-INDEX to point at the real files.
