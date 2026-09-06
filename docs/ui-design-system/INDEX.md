# UI design system index

Map of storefront presentation docs in this worktree. Layout and structure: Electro home-v7. Content, strings, prices, images: live `kenyonexpress.co.il`. Pixel gate: `scripts/compare.mjs` under 11 percent at 380 / 768 / 1440.

| File | Owns |
|---|---|
| `TOKENS.md` | Colour, type (Heebo weights, px/rem at 380/768/1440), spacing, radius, shadow, z-index, breakpoints, containers, RTL |
| `COMPONENTS.md` | Every storefront component: props, variants, states, RTL, a11y, Electro block |
| `PAGE-ANATOMY.md` | Every route: section order, data, skeleton, Hebrew empty/error. Deepened: return, city, legal, offline, gift, redeem |
| `../COPY-HE.md` | All user-facing Hebrew strings |
| `../DATA-CONTRACTS.md` | Fields, R/W, `order_items.platform_percent` freeze |
| `../ROLE-JOURNEYS.md` | Six role narratives |
| `../EDGE-CASES.md` | Failure behaviour |
| `../SEO-CONTENT-PLAN.md` | Keywords, titles, JSON-LD, sitemap |
| `../LAUNCH-CHECKLIST.md` | Day-of checkboxes and rollback |
| `../GLOSSARY-HE-EN.md` | Hebrew UI vs English identifiers |
| `../STOREFRONT-ROUTES.md` | Every customer/cashier URL, robots, anatomy pointer |

Authority when these disagree with older research: `BUSINESS-MODEL-RULES.md` then `docs/PRODUCT-TYPES.md` then `docs/ARCHITECTURE-PRODUCT-TYPES.md`. Presentation conflicts: TOKENS 0.1 (brief vs live vs shipped) wins for paint; COPY-HE wins for consumer-protection wording (coupon split table).

Standing rules this pack must not undo:

1. No search field in header or drawer.
2. Money is integer agorot. No floats. No fixed commission.
3. `platform_percent` is never in the customer DOM.
4. `coupon_partner` is `supplier_members.scanner`, not a `user_role`.
5. Markdown only in this agent. No edits to `.ts` / `.tsx` / `.css`.

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | Index after tasks 1 to 10 |
| 2026-09-07 | Point at STOREFRONT-ROUTES after gift/redeem/legal deepen |
