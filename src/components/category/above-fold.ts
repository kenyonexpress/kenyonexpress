/**
 * HOW MANY CARDS A GRID MARKS EAGER, counted from the first.
 *
 * The grid is `.category-products`: two columns below 576px, then fixed 234px
 * cards that wrap inside the content column beside the filter sidebar. At the
 * three gate widths that is 2 / 3 / 4 cards in the first row, and the first
 * row is inside the first viewport at every one of them. Four is the widest
 * row, so four cards drop `loading="lazy"` and are requested the moment the
 * parser reaches them instead of after layout. On a phone the third and
 * fourth sit just under the fold; Chrome's lazy threshold would have fetched
 * them within the same second anyway, so eager costs nothing there and saves
 * the layout wait on the desktop.
 *
 * Only the FIRST card gets `priority` (preload + `fetchpriority="high"`). It is
 * the largest raster in the first viewport at every width, so it is the LCP
 * candidate; marking the whole row high would make four requests compete for
 * the bandwidth the one that matters needs.
 *
 * THIS LIVES IN ITS OWN FILE, NOT IN THE CARD, AND THAT IS THE BUG IT FIXES.
 * `CategoryProductCard.tsx` is `'use client'`. A server component that
 * imports a NON-component export from a client module does not get the
 * value: it gets a client-reference proxy, and `index < proxy` is `index <
 * NaN`, which is false for every card. Measured on the first STEP 35 build
 * (2026-10-07): the built page read `eager: c < j.ABOVE_FOLD_CARD_COUNT`
 * verbatim and the served HTML had zero `loading="eager"` images, while the
 * unit test, which renders the card directly, passed. A module with no
 * directive is a plain value on both sides. `above-fold.test.ts` pins that.
 */
export const ABOVE_FOLD_CARD_COUNT = 4
