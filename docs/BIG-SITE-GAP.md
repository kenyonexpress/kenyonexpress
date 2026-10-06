# Big Site Gap Audit: 2026-10-06

Compared against Groupon / Amazon / Zap (coupons) / Wolt (delivery) / Booking (travel).
Every verdict was read from this tree on
`main`
at
`3f6ca53c3`
(local), not copied from a brief. A pasted matrix that marked sort, wishlist UI, wallet passes, offline queue, KPI charts and price-drop alerts as missing is false against the files named below.

Framing: KenyonExpress is a coupon marketplace, not Amazon. "Missing vs Amazon" is not automatically a defect. Rows marked **by design** are product rules, not backlog.

| Feature | EXISTS | Status | Evidence |
|---------|--------|--------|----------|
| Search instant + typo tolerance | PARTIAL | Backend ready. Header box is forbidden. | `/api/search`, `/api/search/suggest`, Meilisearch with Postgres fallback. No search input in the shell: ADR `docs/adr/0010-no-search-ui-then-header.md`, gate `src/components/layout/no-search-ui.test.ts`. `/search` answers `?q=` with no field on the page. |
| Search facets (price/city/category) | EXISTS | Wired | `/api/search/facets` (`FACET_ATTRIBUTES`: type, category_slug, city, brand, tags, in_stock) plus `priceMin`/`priceMax` in agorot. Storefront sidebar: `CategoryFilterSidebar` on `/products`, `/category/[slug]`, `/search`. |
| Sort (relevance/price/new) | EXISTS | On the shop and category archives | `src/lib/category-tokens.ts` `sortOptions`: menu_order, popularity, rating, date, price, price-desc. `parseSort` on `/products`. Faceted API also sorts `price_asc` / `price_desc` / `newest`. |
| Infinite scroll | EXISTS | Shop archive | `ProductShopFeed` + GET `/api/products`, 20 per page. Category archives still click-paginate. |
| Recently viewed | MISSING | Removed on purpose | `SiteFooter.tsx`: WP leftover, no route. Rebuilding it is a product decision, not a forgotten page. |
| Wishlist | EXISTS | Backend + list UI | `src/app/(account)/account/wishlist/page.tsx`, `WishlistHeart`, guest storage, merge on login. |
| Price drop alerts | EXISTS | Cron enqueues mail | `src/lib/wishlist/alerts.ts` (5% and 500-agorot floor). `/api/cron/wishlist-alerts` writes `notification_outbox`. Drain still depends on the notifications cron actually running. |
| Social proof (bought count, viewed) | PARTIAL | Ratings, not live counts | `attachRatings` + `RatingStars` on category cards. No "X bought today" / view-count on the card. |
| Urgency timers | EXISTS | Home countdown | `src/components/home/CountdownBanner.tsx` (deadline painted on the server, digits on the client). |
| Trust bar (payment/refund/shipping) | EXISTS | Home | `src/components/home/BenefitBar.tsx`. Not repeated on the PDP. |
| Saved cards | EXISTS | Account UI | `/account/tokens`, `TokenManager`, Cardcom tokens (last four only). |
| Apple/Google wallet pass | EXISTS | Pass files + buttons | `src/lib/wallet/pkpass.ts`, `google-wallet.ts`, `WalletButtons`, `/api/wallet/apple/[id]`. Issuing still needs live wallet credentials. |
| Redemption offline queue | EXISTS | Web till + Expo | `src/lib/vouchers/offline-queue.ts` (localStorage, not queue.db), `/scan`, `apps/mobile`. Drains through `/api/supplier/vouchers/redeem-batch`. |
| Supplier onboarding wizard | EXISTS | Multi-step | `src/components/supplier/SupplierApplyWizard.tsx`. |
| Admin KPI dashboard | EXISTS | Charts | `/admin/analytics`: sales buckets, funnel, top products/suppliers (`BarSeries`, `FunnelBars`). `/admin/dashboard` and `/admin/reports` sit beside it. |

## Summary

- **Fully implemented in this tree:** sort, wishlist list, price-drop job, countdown, trust bar, saved cards, wallet pass code, offline till queue, supplier wizard, admin analytics charts, faceted search API.
- **Partial:** storefront search (engine yes, masthead box no, by ADR), social proof (stars yes, live purchase/view counts no), wallet/pass credentials and cron drain in production.
- **Missing as a big-site feature, not as a forgotten module:** infinite scroll, recently-viewed rail, "bought/viewed" counters on the card.

## Recommendation

Do not rebuild what already exists. Highest remaining impact, in order:

1. Confirm notifications cron actually drains `wishlist-alerts` in the live scheduler (retention already coded).
2. Social proof as purchase/view counts on the product card (conversion), without inventing numbers.
3. Infinite scroll only if pagination is measured as a drop-off, not because Groupon has it.
4. Recently viewed only if product wants the WP behaviour back. The footer comment already refused it.
5. Do not add a header search box. That fights ADR 0010 and the copy/layout gates.
