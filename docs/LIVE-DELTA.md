# Live delta

Our built homepage against the live site, section by section, measured in a real
browser at 1440 on 2026-09-06. Live was scrolled top to bottom before measuring,
because Elementor and the Jet listing grid lazy-load below the fold — without
that, live reports two sections and hides its own deals grid.

## The headline: no section is missing

The premise this audit was commissioned on was that live has sections we have not
built. **It does not.** Every band on live has a counterpart in our build, at the
same offset, and the first three match to the pixel.

| section | live | ours | delta |
|---|---|---|---|
| header (top bar + masthead) | y38 h110 | y38 h110 | **0** |
| hero row (departments, slider, category strip, ads block) | y148 h613 | y148 h613 | **0** |
| feature / benefit bar | y761 h134 | y761 h134 | **0** |
| deals grid | y896 h4012 | y895 h4035 | +23 |
| gap between grid and footer | 60px | **0px** | −60 |
| footer | y4968 h525 | y4930 h536 | +11 |
| **page total** | **5492** | **5578** | **+86** |

Live's own structure, for the record — it is Elementor, three top-level blocks
inside `.elementor-5202`:

```
y148  h613   elementor-top-section   electro_vertical_nav_menu_element
                                     + wp-widget-rev-slider-widget
                                     + electro_product_categories_list_element
                                     + electro_elementor_ads_block
y761  h134   elementor-top-section   electro_elementor_feature_block
y896  h4012  elementor-element       jet-listing-grid  (3992 of the 4012)
```

Which is what `docs/COMPONENT-QUEUE.md` already concluded when it refused rows
06, 07, 09 and 12 on the grounds that live does not run Electro's homepage. This
audit confirms that from the rendered page rather than from class-name counts.

## Sections we build that live does not have

None at section level.

Live has one thing we deliberately do not: **a search field** in the masthead
(its DOM carries `Search for:`). That is the standing product rule, gated by
`src/components/layout/no-search-ui.test.ts` and `e2e/home.spec.ts`, and it is
not a delta to close.

## The three real deltas, and what they are worth

**None of them is measured by the gate.** `scripts/compare.mjs` compares the
first 2600px, and all three sit below y4000. Fixing them cannot improve
10.68 / 7.71 / 8.13 and is not a way to buy points.

### 1. The missing 60px gap before the footer — recommend closing

Live leaves 60px between the end of the deals grid and the start of the footer.
We leave zero: our grid ends at 4930 and our footer begins at 4930.

This is the largest of the three and the cheapest to fix, and it is the one a
person would notice — the footer currently butts straight into the last row of
product cards. It is a spacing token on the grid's container, not a component.

### 2. The deals grid is 23px taller — recommend leaving

23px across 4012 is 0.6%. Both render 32 cards in four columns. Chasing 23px
across eight card rows means changing a card metric that is already measured, and
the measurement it would break is one the gate *does* score, up in the y1500-1800
band where the residual diff actually lives. Bad trade.

### 3. The footer is 11px taller — recommend leaving

11px across 525. Below the measured window, invisible to a reader, and the footer
was rebuilt against live in queue row 10.

## Where the residual 8.13% actually is

Not below the fold at all. Banded at 1440 on the current build:

| band | diff |
|---|---|
| y2500-2600 | 31.6% |
| y1700-1800 | 19.4% |
| y1600-1700 | 16.2% |
| y1100-1200 | 6.2% |
| y1900-2000 | 5.8% |

That is inside the deals grid, and it is card *content*, not card geometry — our
catalogue and live's do not hold the same products in the same order, so
corresponding cells carry different photographs. The queue already recorded the
same thing when refilling the ledger-row slot moved 1440 from 14.48% to 8.13%:
count is load-bearing, contents differ.

**Recommendation: do not chase it.** Closing that band means seeding our
catalogue to match live's product-for-product, which is a content decision with
no engineering answer, and `docs/SOURCING-RULES.md` already says content comes
from live's catalogue rather than from a fixture built to match a screenshot.

## Summary

| finding | recommendation |
|---|---|
| No missing sections | Nothing to build. The queue's refusals were right. |
| 60px gap before the footer | **Close it.** One spacing value, visible, no gate risk. |
| Deals grid +23px | Leave. 0.6%, and the fix risks a scored band. |
| Footer +11px | Leave. Below the measured window. |
| Residual 8.13% in y1600-2600 | Leave. Card contents, not geometry. |
