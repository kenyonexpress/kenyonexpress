# Docs pack crosswalk (tasks 1 to 10)

Cross-check of the documents written 2026-09-07 against each other, live `kenyonexpress.co.il`, Electro home-v7, and older research. Use this when two files disagree. Do not "fix" live paint toward the autonomous prompt's brief colours if that moves `compare.mjs`.

---

## 1. Brief vs live vs shipped (paint)

Recorded in `docs/ui-design-system/TOKENS.md` §0.1. Repeated here so SEO/launch do not restore 1320px or `#E4002B` on the storefront.

| Brief (prompt) | Live `kenyonexpress.co.il` | Shipped tokens | Winner for storefront paint |
|---|---|---|---|
| Yellow `#fed700` | `#fed700` | same | all agree |
| Hover `#fedd26` | yellow-to-yellow rarely; buttons go **black** | both tokens exist | black hover for CTAs (TOKENS §1.8) |
| Price red `#E4002B` | `#dc3545` / home `#c93636` | `--color-price: #dc3545` | live |
| Link `#0062bd` | same | same | all agree |
| Container `1320px` | `1200px` page, `1170px` hero | `--container-page: 1200px` | live |
| Heebo | Open Sans (no Hebrew glyphs; OS fallback) | Heebo | Heebo (Hebrew storefront) |

Consumer-protection copy (coupon on-site vs remainder) **wins over** byte parity with live WooCommerce, which did not spell the split. See `CouponPricing` and COPY-HE.

---

## 2. Role names

| Prompt | Production | Docs that state it |
|---|---|---|
| `coupon_partner` | `supplier_members.scanner` | DATA-CONTRACTS §0, GLOSSARY-HE-EN §4, ROLE-JOURNEYS §4 |
| `content_uploader` | `profiles.role` | same |
| `admin` | `is_admin()` includes `super_admin` | DATA-CONTRACTS |
| extra enum values `vendor`, `support` | exist | not in the four-role brief; support reads, no money write |

Do not add `coupon_partner` to `user_role`. MEGA-BLOCK-AUDIT already rejected that fork.

---

## 3. Home section order

| Source | Order after hero |
|---|---|
| `HOMEPAGE_SPEC.md` (2026-06-04) | CategoryRing, Deals, FeatureBar |
| COMPONENTS + PAGE-ANATOMY (2026-09-07, live capture) | CategoryStrip, BenefitBar, DealsOfTheDay |

Winner: COMPONENTS / PAGE-ANATOMY. HOMEPAGE_SPEC is stale.

---

## 4. Search

| Surface | Rule |
|---|---|
| Header / drawer | **must not** mount search |
| `/search` | exists, **noindex**, page-level `SearchBox` |
| 404 | links to `/products` and categories, **not** `/search` |
| JSON-LD `SearchAction` | **omit** (SEO-CONTENT-PLAN) |

ADR `0010-no-search-ui-then-header` is the standing rule. ARCHITECTURE-SEARCH describing header suggest is research, not chrome.

---

## 5. Money snapshot

All of DATA-CONTRACTS §1, ROLE-JOURNEYS (beginCheckout), EDGE-CASES (price change, admin percent), GLOSSARY-HE-EN agree:

Changing `products.platform_percent` never rewrites `order_items.platform_percent` or issued `vouchers.platform_percent`.

Fossil: `products.commission_percent` default 5 in old DB-SCHEMA. Forbidden as a silent rate.

---

## 6. Launch docs

| File | Role after 2026-09-07 |
|---|---|
| `docs/LAUNCH-CHECKLIST.md` | Day-of **checkboxes** (Box registrar, migrations, secrets, env, cron, smoke, 24h, rollback) |
| `docs/LAUNCH-RUNBOOK.md` | Command sequence; steps 1 to 6 done; DNS pending |
| `docs/DNS-CUTOVER-PLAN.md` | Apex/www records + two-zone trap |
| Old LAUNCH-CHECKLIST (19.08) | Replaced. Do not restore the PASS/FAIL sheet over the checkboxes |

Cron: ten jobs, external scheduler. `docs/VERCEL-CRON.md` is stale. `docs/CRON-EXTERNAL.md` wins.

---

## 7. Routes PAGE-ANATOMY vs app tree

Covered: home, category, coupon PDP, physical PDP, cart, checkout, account, orders, `/coupon/[id]`, `/s/[id]`, search, 404, 500.

Mentioned but not full anatomy (deepen next): `/checkout/return`, `/checkout/failed`, `/city/[slug]`, `/products`, `/account/orders/[id]`, gift claim, legal pages, offline.

Public supplier is `/s/[id]`, not `/suppliers/[slug]`. `/suppliers` is join-us marketing.

---

## 8. Copy voice

COPY-HE vs account pages: mix of `שלך` and `שלכם` (referrals). Canonical: keep the string that is already on that screen; new screens use `שלך` except scan (cashier, no person) and emails (`שלום {name}`).

Share message in `buildShareMessage` uses a dash in source. COPY-HE canonical is a colon.

---

## 9. JSON-LD vs July SEO architecture

ARCHITECTURE-SEO-SITEMAP (2026-07-29) said zero JSON-LD in repo. SEO-CONTENT-PLAN requires Organization on home, BreadcrumbList on category, Product+Offer ILS on product. If code still has none, that is an implementation gap, not a reason to drop the plan.

---

## 10. What this pack still does not own

- Admin component inventory (out of COMPONENTS scope)
- Electro measurement dumps (`refs/`)
- Legal counsel wording (`docs/legal/`)
- Applying migrations or DNS

---

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | First crosswalk after tasks 1 to 10 |
