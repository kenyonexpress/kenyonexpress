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
from the top down. **If Ofir sends the real list, it replaces this table.**

## The queue

| # | Component | Geometry source | Content source | Status |
|---|---|---|---|---|
| 01 | Top bar | `refs/electro_home.html` `.top-bar` | live top strip | not started |
| 02 | Masthead + header icon cluster | Electro masthead | live logo, live cart state | not started |
| 03 | Departments menu + mega panel | Electro `departments-menu-v2` | `KE_LIVE_CATEGORIES` | not started |
| 04 | Hero slider | Electro slider mechanics | live slide copy; imagery pending | not started |
| 05 | Category strip | Electro category strip | live departments | not started |
| 06 | Deals carousel + countdown | Electro deals block | live deal products | not started |
| 07 | Two-banner block | Electro banner block | live banners | not started |
| 08 | Products-category-with-image block | Electro block | live catalogue | not started |
| 09 | Brand strip | Electro brand strip | live brands | not started |
| 10 | Footer + payment logos | Electro footer | live footer links | not started |
| 11 | Handheld header + off-canvas drawer | Electro handheld header | live departments | not started |
| 12 | Mobile bottom nav | Electro bottom nav | live destinations | not started |

## Standing rules for every component in this queue

From `docs/SOURCING-RULES.md`, repeated here because they are the ones most
often broken mid-component:

1. **Two icons in the header cluster, at every breakpoint:** wishlist heart,
   then cart. No account icon in the cluster — the account entry point lives in
   the shell's top-left corner and must exist in exactly one place. No compare
   icon. No search icon.
2. **No search field anywhere.** Already enforced by
   `src/components/layout/no-search-ui.test.ts` and `e2e/home.spec.ts`.
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
