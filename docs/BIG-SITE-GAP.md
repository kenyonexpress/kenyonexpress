# Big-Site Gap Matrix

Thirty storefront features that Groupon, Amazon, Zap, Wolt, Booking, Lazada and
TikTok Shop all ship in some form, against what this repository has.

Audited 2026-10-14 (closeout L9), read-only, from code. Two lines were read,
because they are not the same product (`docs/DECISIONS.md` D-44):

- **main**: `c6911b8e1`, where this queue builds.
- **prod**: `origin/audit/final-audit` at `1e84df0e5`, what customers are served.

**EXISTS** means implemented and wired to a surface a user can reach.
**PARTIAL** means some of it exists; the missing part is named.
**MISSING** means no meaningful implementation.

What this audit did not check: the live database, environment variables, and
whether a scheduled job actually fires. "Applied" below means the migration
file sits in `migrations/applied/` or `supabase/migrations/`, not that
production has it.

## Summary

| | main | prod |
|---|---|---|
| EXISTS | 7 | 9 |
| PARTIAL | 15 | 16 |
| MISSING | 8 | 5 |

Nine features are further along on prod than on main: recently viewed,
wishlist, social proof, offline redemption queue, supplier wizard, admin KPIs,
referral, loyalty tiers and breadcrumbs. Two are further along on main:
price-drop alerts and gift cards. Building the first nine again on main
duplicates code that already runs in production, so L10 ports them from prod
where the files apply cleanly and builds fresh only what neither line has.

## Matrix

Effort is for main, in working days for one engineer, including tests. "Route"
is how L10 closes the row: **port** from prod, **build** new, or **finish**
what main has.

| # | Feature | Seen on | main | prod | Effort | Route |
|---|---|---|---|---|---|---|
| 1 | Instant search, typo tolerance, Hebrew synonyms | Amazon, Zap, Wolt | PARTIAL | PARTIAL | 2 | build. Blocked by a product rule, see note A |
| 2 | Facets: price, city, category tree, discount, supplier | Amazon, Zap, Booking | PARTIAL | PARTIAL | 3 | finish |
| 3 | Sort: relevance, price, discount, newest, rating | all | PARTIAL | PARTIAL | 1.5 | finish |
| 4 | Infinite scroll, 24 per page, scroll restoration | TikTok Shop, Lazada, Wolt | MISSING | MISSING | 2 | build |
| 5 | Recently viewed | Amazon, Booking | MISSING | PARTIAL | 1.5 | port, then add home rail. See note B |
| 6 | Wishlist | Amazon, Lazada, Booking | PARTIAL | EXISTS | 1 | port hearts and provider |
| 7 | Price-drop alerts | Zap, Amazon | EXISTS | PARTIAL | 0 | none on main |
| 8 | Social proof | Groupon, Booking | MISSING | EXISTS | 1 | port, add a "today" window |
| 9 | Urgency timers | Groupon, Booking, Lazada | PARTIAL | PARTIAL | 1 | finish: cards and issued voucher |
| 10 | Trust bar | Amazon, Booking | PARTIAL | PARTIAL | 1 | build |
| 11 | Saved cards (token only, no PAN) | Amazon, Wolt | EXISTS | EXISTS | 0 | none |
| 12 | Apple and Google Wallet passes | Booking, Groupon | EXISTS | EXISTS | 0 | none. Needs certificates, a human item |
| 13 | Offline redemption queue | Wolt (courier), Groupon Merchant | PARTIAL | PARTIAL | 3 | port queue, then IndexedDB and Background Sync |
| 14 | Supplier onboarding wizard, six steps | Wolt, Lazada, TikTok Shop | PARTIAL | PARTIAL | 4 | port three steps, build three |
| 15 | Admin KPI dashboard | all (seller centres) | PARTIAL | EXISTS | 1.5 | port ops KPIs, add payout tile |
| 16 | Product reviews | Amazon, Booking, Lazada | PARTIAL | PARTIAL | 3 | finish. See note C |
| 17 | Q&A on product page | Amazon, Lazada | MISSING | MISSING | 3 | build |
| 18 | Related products | all | EXISTS | PARTIAL | done | closed 2026-10-14 |
| 19 | Bundle deals, N for X | Amazon, Lazada | MISSING | MISSING | 4 | build. Money path |
| 20 | Flash sales | Lazada, TikTok Shop, Groupon | PARTIAL | PARTIAL | 4 | build. Money path |
| 21 | Gift cards | Amazon, Wolt | PARTIAL | PARTIAL | 2 | finish: QR, admin toggle, entry link |
| 22 | Referral program | Wolt, Booking | PARTIAL | EXISTS | 1 | port automatic payout. Money path |
| 23 | Loyalty tiers | Booking (Genius), Lazada | MISSING | PARTIAL | 3 | port, then perks |
| 24 | Push notifications | all | EXISTS | EXISTS | 0.5 | wire the post-purchase prompt |
| 25 | Abandoned cart recovery | Amazon, Lazada | PARTIAL | PARTIAL | 2 | finish: second email, coupon code |
| 26 | Product comparison, up to four | Zap, Amazon | MISSING | MISSING | 3 | build |
| 27 | Mega-menu | Amazon, Zap, Lazada | MISSING | MISSING | 3 | build. Earlier decision against, see note A |
| 28 | Breadcrumbs with BreadcrumbList JSON-LD | all | EXISTS | EXISTS | 0.5 | port ancestor trail |
| 29 | SKU search, header and admin | Zap, Amazon | PARTIAL | PARTIAL | 0.5 | admin list closed 2026-10-14; header under note A |
| 30 | Barcode scan on redemption | Groupon Merchant, Wolt | EXISTS | EXISTS | 0.5 | add 1D formats |

Total for main: about 54 working days. It is not a number that fits in one
session, and the rows marked "Money path" should not be rushed to fit one.

## Notes that change how a row can be closed

### A. A header search box and a mega-menu both contradict rules already in the code

`src/components/layout/no-search-ui.test.ts` fails the suite if any search
input appears in the site shell. On prod the same file calls it an "absolute
product rule" with no exemptions. `src/components/layout/RegionMenu.tsx` records
that a multi-column mega panel was deliberately not built. Rows 1, 27 and the
header half of row 29 ask for exactly those two things.

The queue is the newer instruction, so L10 builds them. It does so by changing
the test to describe the new rule, in the same commit and with the reason,
never by deleting the test.

### B. `/recently-viewed` answers 410 in production

`migrations/applied/192_seed_seo_redirects.sql` seeds the old WordPress path as
gone. A rail on the home and product pages is unaffected; a page at that path
would be dead on arrival.

### C. Reviews are hidden from visitors on purpose

`migrations/applied/232_reviews_admin_moderation_only.sql` revoked anonymous
SELECT on reviews. Showing a public list needs a new grant, which is a
migration, which waits in `migrations/pending/` for approval. The code can be
finished; the list stays empty in production until that file is applied.

### D. Migration numbers are not shared between the lines

`232` is `reviews_admin_moderation_only` on main and `supplier_self_service` on
prod. `201_scheduled_price_changes` is applied on main and pending on prod.
Anything ported with a migration gets a new number on main, above 242.

## Evidence per feature

Paths are relative to the repository root. "prod:" paths were read with
`git show origin/audit/final-audit:<path>`.

**1. Instant search.** main: Meilisearch settings with a Hebrew typo budget and
synonyms are applied by `ensureIndex`; `/search?q=` works. The only typing
field is a category-scoped autocomplete inside the filter sidebar.
`src/lib/search/meili-settings.ts`, `src/lib/search/hebrew-synonyms.ts`,
`src/components/category/CategoryAutocomplete.tsx`. Missing: a search entry
point on home, `/products` and `/search`; `src/hooks/useSearch.ts` and
`/api/search/quick-links` have no consumer. prod: same backend plus
`/api/search/suggest`, and no typing field anywhere.

**2. Facets.** main: `src/components/search/SearchFacetNav.tsx` renders counted
link facets (type, category, city, brand, tags, in stock) and price min/max,
URL-driven; category pages have `CategoryFilterSidebar.tsx`. Missing: discount
facet, supplier facet (`supplier_id` is filterable in Meilisearch and not
exposed), category tree (flat list only); the city filter runs after
pagination, so counts are approximate. prod: filter chips on category pages
(`src/components/category/FilterChips.tsx`), none on search.

**3. Sort.** main: `src/components/category/CategoryControlBar.tsx` writes
`?sort=`. `price_asc`, `price_desc`, `newest` and `name` work; `popularity` and
`rating` are offered and fall through to the default. Missing: discount
descending, real rating and relevance sorts, any sort on the search page.
`src/components/category/CategorySort.tsx` is orphaned. prod: identical.

**4. Infinite scroll.** Both lines: numbered `src/components/category/Pagination.tsx`
with `?page=`. No `IntersectionObserver` in `src`. Category page size is 8 on
main and 12 on prod; the queue asks for 24.

**5. Recently viewed.** main: nothing. prod: `src/components/storefront/RecentlyViewedRail.tsx`
on the product page, localStorage key `ke_recently_viewed`, 12 items, hydrated
by `src/server/actions/recently-viewed.ts`. Missing on prod: home rail,
per-account history.

**6. Wishlist.** main: `wishlists` with owner-only RLS
(`migrations/applied/154_reviews_wishlist.sql`), `toggleWishlist` in
`src/server/actions/reviews.ts`, `/account/wishlist`,
`src/components/product/WishlistButton.tsx` on the product page only. Missing:
heart on cards. prod: `src/components/wishlist/WishlistProvider.tsx`,
`WishlistHeart.tsx` on `ProductCard`, move to cart, a share page. Missing on
prod: heart on `CategoryProductCard`, the card listings actually use.

**7. Price-drop alerts.** main: daily `src/app/api/cron/wishlist-alerts/route.ts`
compares `price_history` for wishlisted products and enqueues `price_drop`;
email and push templates, preferences and unsubscribe are wired
(`migrations/applied/233_wishlist_alerts.sql`). prod: same pipeline without
preferences, and no confirmed schedule.

**8. Social proof.** main: only `src/components/storefront/StockScarcity.tsx`.
prod: `src/components/storefront/BoughtThisWeek.tsx` and
`src/lib/commerce/bought-this-week.ts`, real paid order items over seven days,
hidden below three.

**9. Urgency timers.** main: `src/components/storefront/CouponExpiryCountdown.tsx`
on coupon product pages. Missing: cards, and the issued voucher. prod has the
opposite half: `src/components/coupon/ValidityCountdown.tsx` on the voucher,
none on the product page. `src/components/store/DealsSection.tsx` is orphaned
on both and its timer is a hardcoded 23:59:59.

**10. Trust bar.** Both: `src/components/home/BenefitBar.tsx` is a selling-point
strip, checkout has one line naming Cardcom, the footer links the refund
policy. Missing: secure-payment badge, support hours, refund policy in one
bar, anything on product or cart. `src/components/layout/InfoBar.tsx` has no
importer.

**11. Saved cards.** Both: `payment_tokens` holds the Cardcom token, last four,
brand and expiry; `src/server/actions/payments/checkout.ts`,
`src/components/account/TokenManager.tsx`, `/account/tokens`,
`src/lib/account/saved-cards.test.ts` keeps the token server-side.

**12. Wallet passes.** Both: `src/app/api/wallet/apple/[id]/route.ts`,
`src/lib/wallet/pkpass.ts`, `src/lib/wallet/google-wallet.ts`,
`src/components/coupon/WalletButtons.tsx`. The buttons render nothing until the
`APPLE_WALLET_*` and `GOOGLE_WALLET_*` variables are set.

**13. Offline redemption queue.** main: `public/sw.js` and an idempotent
`src/app/api/supplier/vouchers/redeem-batch/route.ts` that nothing calls;
`src/app/(supplier)/scan/ScanClient.tsx` posts straight to the single-redeem
route. prod: `src/lib/vouchers/offline-queue.ts` queues up to 200 scans in
localStorage and drains on the `online` event. Missing on both: IndexedDB and
Background Sync.

**14. Supplier wizard.** main: one-step lead form
(`src/components/storefront/SupplierLeadForm.tsx`) and an admin checklist.
prod: `src/components/supplier/SupplierApplyWizard.tsx`, three steps (business
with address, bank, contract) and document upload; its tables exist only in
`migrations/pending/204_supplier_onboarding.sql`. Missing on both: products,
opening hours, review.

**15. Admin KPIs.** main: `/admin/dashboard` (today's orders, collected,
vouchers, redemptions) and `/admin/analytics` (GMV, revenue, funnel, top
products and suppliers). Missing: refund rate, active vouchers, payouts-due
total. prod adds `src/lib/analytics/ops-kpis.ts`.

**16. Reviews.** main: table, rating and body, buyer-only form
(`src/components/product/Reviews.tsx`), admin moderation at `/admin/reviews`
with no sidebar link. Missing: public list (note C), owner edit, star summary
(needs `migrations/pending/235_product_live_and_rating.sql`). prod: a public
`/product/[slug]/reviews` page whose read grant is itself pending.

**17. Q&A.** Both: nothing stored. prod has a WhatsApp deep link
(`src/components/contact/ProductQuestionLink.tsx`).

**18. Related products.** main, closed 2026-10-14: `src/lib/related-products.ts`
reads the 24 newest products in the category and `src/lib/related-ranking.ts`
orders them by shared tags, then closeness within a 30% price band, then
newest. Measured against production the same day: `products.tags` exists and
is empty on all 46 active products, so only the price band changes the order
until tags are entered. prod: five newest in the same category, no ranking.

**19. Bundles.** Both: nothing.

**20. Flash sales.** main: `scheduled_price_changes`
(`migrations/applied/201_scheduled_price_changes.sql`),
`src/lib/pricing/flash-deals.ts`, a daily cron, and nothing in `src` that
writes a row. No end time, no banner, no countdown. prod: an admin form at
`/admin/flash-deals` with no sidebar link.

**21. Gift cards.** main: `products.is_gift_card`, `gift_cards`,
`redeem_gift_card` (`migrations/applied/234_gift_cards.sql`), issue at
finalize, email, `/gift-card` to check and redeem to wallet. Missing: printable
QR, an admin control for the flag, any link to `/gift-card`. prod: gifting a
purchased voucher instead, a different feature.

**22. Referral.** main: code per user, `?ref` cookie, claim at signup,
`src/server/referrals/complete.ts` on the first order. The bonus is paid only
when an admin presses Approve. prod: `src/server/referrals/pay.ts` pays both
sides automatically.

**23. Loyalty tiers.** main: `src/lib/analytics/cashback-tier.ts`, an analytics
property that says of itself it is not a loyalty programme. prod:
`src/lib/club/tiers.ts`, four tiers from trailing-year spend, shown on
`/account`; display only, no perks, table pending.

**24. Push.** Both: VAPID web push (`src/lib/push/web-push.ts`,
`src/components/pwa/PushOptIn.tsx`), Expo token registration in
`apps/mobile/src/lib/push.ts`. main: `PostPurchasePushPrompt.tsx` has no
consumer.

**25. Abandoned cart.** main: hourly `src/app/api/cron/abandoned-cart/route.ts`,
one email ever at three hours, newsletter subscribers only. Missing: second
email, coupon code. prod: two reminders, the second needing a pending
migration.

**26. Comparison.** Both: nothing.

**27. Mega-menu.** Both: `src/components/layout/MastheadNav.tsx` with a
single-column city menu.

**28. Breadcrumbs.** Both: `buildBreadcrumbJsonLd` in `src/lib/seo/json-ld.ts`
on product, category and city pages, with visible trails. prod adds the full
ancestor trail (`src/lib/category-tree.ts`).

**29. SKU search.** Both: `sku` is a searchable attribute with typo tolerance
off, and `/search?q=` answers. main, 2026-10-14: the admin product list matches
name, SKU or slug through `src/lib/admin/product-search.ts`. Still missing on
main: a header search box (note A), and SKU in the admin command palette,
which searches orders only. prod: the admin list filters `name_he` only.

**30. Barcode scan.** Both: native `BarcodeDetector` with `qr_code` over
`getUserMedia`, manual entry as fallback (`src/app/(supplier)/scan/ScanClient.tsx`
on main), `expo-camera` in the mobile app. QR only.
