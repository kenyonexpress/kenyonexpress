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
| EXISTS | 15 | 9 |
| PARTIAL | 11 | 16 |
| MISSING | 4 | 5 |

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
| 2 | Facets: price, city, category tree, discount, supplier | Amazon, Zap, Booking | EXISTS | PARTIAL | 0 | closed 2026-10-14 on the search page |
| 3 | Sort: relevance, price, discount, newest, rating | all | PARTIAL | PARTIAL | 1 | discount and search-page control closed 2026-10-14; rating needs pending 235 |
| 4 | Infinite scroll, 24 per page, scroll restoration | TikTok Shop, Lazada, Wolt | EXISTS | MISSING | 0 | closed 2026-10-14 |
| 5 | Recently viewed | Amazon, Booking | PARTIAL | PARTIAL | 0.5 | per-browser rail on product and home closed 2026-10-14; per-account history needs a table. See note B |
| 6 | Wishlist | Amazon, Lazada, Booking | EXISTS | EXISTS | 0 | hearts on both card types closed 2026-10-14 |
| 7 | Price-drop alerts | Zap, Amazon | EXISTS | PARTIAL | 0 | none on main |
| 8 | Social proof | Groupon, Booking | EXISTS | EXISTS | 0 | ported with a 24-hour window, closed 2026-10-14; nothing to show on live data yet |
| 9 | Urgency timers | Groupon, Booking, Lazada | EXISTS | PARTIAL | 0 | cards and issued voucher closed 2026-10-14, unit-tested only |
| 10 | Trust bar | Amazon, Booking | PARTIAL | PARTIAL | 0 | bar on product and cart closed 2026-10-14; support hours need the real hours from Ofir |
| 11 | Saved cards (token only, no PAN) | Amazon, Wolt | EXISTS | EXISTS | 0 | none |
| 12 | Apple and Google Wallet passes | Booking, Groupon | EXISTS | EXISTS | 0 | none. Needs certificates, a human item |
| 13 | Offline redemption queue | Wolt (courier), Groupon Merchant | PARTIAL | PARTIAL | 2 | queue ported 2026-10-14; IndexedDB and Background Sync still open |
| 14 | Supplier onboarding wizard, six steps | Wolt, Lazada, TikTok Shop | PARTIAL | PARTIAL | 4 | port three steps, build three |
| 15 | Admin KPI dashboard | all (seller centres) | EXISTS | EXISTS | 0 | ops KPIs ported, active vouchers and payouts due added, closed 2026-10-14 |
| 16 | Product reviews | Amazon, Booking, Lazada | PARTIAL | PARTIAL | 3 | finish. See note C |
| 17 | Q&A on product page | Amazon, Lazada | MISSING | MISSING | 3 | build |
| 18 | Related products | all | EXISTS | PARTIAL | done | closed 2026-10-14 |
| 19 | Bundle deals, N for X | Amazon, Lazada | MISSING | MISSING | 4 | build. Money path |
| 20 | Flash sales | Lazada, TikTok Shop, Groupon | PARTIAL | PARTIAL | 4 | build. Money path |
| 21 | Gift cards | Amazon, Wolt | EXISTS | PARTIAL | 0 | QR, guarded admin switch and wallet link closed 2026-10-14 |
| 22 | Referral program | Wolt, Booking | PARTIAL | EXISTS | 1 | port automatic payout. Money path |
| 23 | Loyalty tiers | Booking (Genius), Lazada | MISSING | PARTIAL | 3 | port, then perks |
| 24 | Push notifications | all | EXISTS | EXISTS | done | prompt wired 2026-10-14 |
| 25 | Abandoned cart recovery | Amazon, Lazada | PARTIAL | PARTIAL | 2 | finish: second email, coupon code |
| 26 | Product comparison, up to four | Zap, Amazon | EXISTS | MISSING | 0 | built 2026-10-14 at /products/compare |
| 27 | Mega-menu | Amazon, Zap, Lazada | MISSING | MISSING | 3 | build. Earlier decision against, see note A |
| 28 | Breadcrumbs with BreadcrumbList JSON-LD | all | EXISTS | EXISTS | done | product trail ported 2026-10-14 |
| 29 | SKU search, header and admin | Zap, Amazon | PARTIAL | PARTIAL | 0.5 | admin list closed 2026-10-14; header under note A |
| 30 | Barcode scan on redemption | Groupon Merchant, Wolt | EXISTS | EXISTS | done | 1D formats added 2026-10-14 |

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

Closed on main, 2026-10-14, on `/search` and `/api/search/facets`:

- Supplier: `?supplier=<id>`, validated as a uuid. The label is the supplier's
  public name, read by `src/lib/search/facet-labels.ts`; a supplier with no
  name is not offered.
- Discount: `?discount_min=10|25|50`, "at least N% off", filtering on the
  stored `discount_bp`. Thresholds nest, so a count is what the click shows.
- Category tree: the facet lists parents before children with the subtree's
  count, and choosing a parent filters its whole subtree (the engine expands
  the slug through `categorySubtree`). Categories are labelled by name; they
  were printed as slugs before.

Verified on a built server against live data, database engine: for each of
two suppliers, three thresholds and three categories the facet's count equals
the filtered total; the sidebar prints supplier and category names; a bad
supplier id is a 400. Not verified: the tree's nesting on real data, because
all 13 live categories are roots (unit tests only), and Meilisearch, which
needs its settings re-applied and a reindex before `discount_bp` filters; an
older index is asked for the previous facet list instead of failing the
search. Still open: the category pages keep their own sidebar and did not get
these three facets, and the approximate city count there is unchanged. A test
supplier and a test category are live and show up in the facets.

**3. Sort.** main: `src/components/category/CategoryControlBar.tsx` writes
`?sort=`. `price_asc`, `price_desc`, `newest`, `name` and, since 2026-10-14,
`discount_desc` work. The discount is derived from the two prices in
`src/lib/catalogue/discount-sort.ts` because `products.discount_percent` is set
on 1 of 46 active products; verified on a built server, the first eight
products of `/products?sort=discount_desc` match the order computed from live
prices. Still missing: `popularity` and `rating` are offered and fall through
to the default (no column holds either; rating waits on
`migrations/pending/235_product_live_and_rating.sql`). Since 2026-10-14 the
search page has a sort control (`src/components/search/SearchSortNav.tsx`):
five links, relevance, newest, the two price orders and discount, built by
`buildSortOptions` in `src/lib/search/facet-links.ts`, keeping the query and
every facet. Links rather than a select, so the no-input rule holds. Verified
on a built server: for a two-result query the cards follow the engine's order
under `price_asc` and reverse under `price_desc`, and the 90% product leads
under `discount_desc`. The discount order is a stored `discount_bp` on the
index document (`toProductDocument`), listed in `SORTABLE_ATTRIBUTES`. Local
runs answer from the database fallback. On Meilisearch the order needs the
settings re-applied and one full reindex; until then the engine refuses the
sort and the request falls back to the database, which orders correctly.
`src/components/category/CategorySort.tsx` is orphaned. prod: no discount sort
and no search-page control, otherwise identical.

**4. Infinite scroll.** Both lines: numbered `src/components/category/Pagination.tsx`
with `?page=`. No `IntersectionObserver` in `src`. Category page size is 8 on
main and 12 on prod; the queue asks for 24.

Closed on main, 2026-10-14. `src/components/category/InfiniteProductGrid.tsx`
renders the server's first page and appends the next one when the end of the
grid nears, from `/api/catalogue/listing` (the pages' own parsers and cached
loaders, `src/lib/catalogue/listing-page.ts`). Both listings hold 24 a page
(D-45). The numbered links stay in the response and are replaced by a "load
more" button only after the grid has mounted and can observe. What was loaded
and the scroll offset are kept in sessionStorage and put back on a history
navigation only.

Verified in Chromium against a built server and live data, `/products`, 46
products: 24 cards, then 46 after scrolling, no duplicates, the count line
follows; a click on card 31 and Back returns 46 cards at the same offset
(2245); a fresh visit starts at 24 and the top. With script disabled the
response carries the numbered links. Not verified: a category page in the
browser (no live category holds more than 24, so none has a second page;
covered by unit tests and the endpoint), Safari and Firefox, and layout shift.
The search page keeps its single page of 48.

**5. Recently viewed.** main: nothing. prod: `src/components/storefront/RecentlyViewedRail.tsx`
on the product page, localStorage key `ke_recently_viewed`, 12 items, hydrated
by `src/server/actions/recently-viewed.ts`. Missing on prod: home rail,
per-account history.

main, 2026-10-14: the three production files are ported and the rail has two
placements. On a product page it records the view and lists the others. On the
home page it only reads, shows one row of four, and sits below the deals grid
so that only the footer moves when it appears. Verified in Chromium on a built
server with live data: nothing on a first visit; after three product views
the third product's page lists the other two and the home page shows three
cards under the grid (rail top y4966, grid bottom y4906). Home parity gate
after the change: 10.93 / 10.61 / 7.81 at 380 / 768 / 1440, all under 11.
Still open, and why the row stays PARTIAL: history is per browser. Following
a shopper across devices needs a table and a merge on sign-in, which is a
migration and waits for approval.

**6. Wishlist.** main: `wishlists` with owner-only RLS
(`migrations/applied/154_reviews_wishlist.sql`), `toggleWishlist` in
`src/server/actions/reviews.ts`, `/account/wishlist`,
`src/components/product/WishlistButton.tsx` on the product page only. Missing:
heart on cards. prod: `src/components/wishlist/WishlistProvider.tsx`,
`WishlistHeart.tsx` on `ProductCard`, move to cart, a share page. Missing on
prod: heart on `CategoryProductCard`, the card listings actually use.

Closed on main, 2026-10-14. Ported: `WishlistProvider`, `WishlistHeart` (card
shape), the guest list in localStorage, and three actions in
`src/server/actions/wishlist.ts` (own ids, remove, merge on sign-in). The
heart is on `CategoryProductCard` and on `ProductCard`. One change from prod:
the provider reads the session flag the cart store already holds instead of
building a Supabase browser client, so store pages gain no request and no
client library. Signed out, a press saves to the browser; on sign-in the list
is merged into the account and the browser copy cleared only if the server
confirmed.

Verified in Chromium, built server, signed out, at 380 and 1440 on
`/products`: 24 hearts on 24 cards, 44 by 44, on the image's top corner, not
over the discount badge; a press saves without navigating, survives a reload,
and a second press removes it. Not verified in a browser: the signed-in path
and the merge (unit tests with mocked actions only). Not ported: move to
cart, the share page, a header counter. A signed-out shopper has no page that
lists what they saved until they sign in; the product page's own
`WishlistButton` still keeps separate state and can disagree with a card
heart until reload.

**7. Price-drop alerts.** main: daily `src/app/api/cron/wishlist-alerts/route.ts`
compares `price_history` for wishlisted products and enqueues `price_drop`;
email and push templates, preferences and unsubscribe are wired
(`migrations/applied/233_wishlist_alerts.sql`). prod: same pipeline without
preferences, and no confirmed schedule.

**8. Social proof.** main: only `src/components/storefront/StockScarcity.tsx`.
prod: `src/components/storefront/BoughtThisWeek.tsx` and
`src/lib/commerce/bought-this-week.ts`, real paid order items over seven days,
hidden below three.

Closed on main, 2026-10-14. Ported: the rule (`social-proof.ts`), the two
reads (`bought-this-week.ts`), the mock-charge test (`mock-transaction-id.ts`)
and the streamed line on the product page. New here: a count over the
trailing twenty-four hours from the same rows, printed instead of the week's
when it clears the floor of three on its own. It says "in the last 24 hours",
not "today", because that is the window that was counted. Verified: unit
tests; six product pages answer 200 on a built server with no read error
logged; the same two queries run read-only against live data return zero
paid items in the trailing week, so the line is absent everywhere, which is
what the rule requires. The line itself has therefore not been seen rendered
with a real number.

**9. Urgency timers.** main: `src/components/storefront/CouponExpiryCountdown.tsx`
on coupon product pages. Missing: cards, and the issued voucher. prod has the
opposite half: `src/components/coupon/ValidityCountdown.tsx` on the voucher,
none on the product page. `src/components/store/DealsSection.tsx` is orphaned
on both and its timer is a hardcoded 23:59:59.

Closed on main, 2026-10-14. Voucher: `ValidityCountdown` and
`src/lib/vouchers/countdown.ts` are ported from prod and sit under the
"valid until" date on `/coupon/[id]` and on each coupon of an order, only
while the coupon can still be used. Cards: `CardOfferDeadline` prints the
product page's own sentence over the card image when
`products.offer_valid_until` is within a week, and nothing otherwise; the
listing queries now select that column. Every number traces to a column, so
no timer is invented. Verified: unit tests, and the listings still answer
200 with the added column on a built server. Not seen in a browser: no live
product has `offer_valid_until` set (0 of 46), and the voucher pages need a
signed-in customer holding a coupon. `DealsSection.tsx` and its hardcoded
timer are still orphaned and still in the tree.

**10. Trust bar.** Both: `src/components/home/BenefitBar.tsx` is a selling-point
strip, checkout has one line naming Cardcom, the footer links the refund
policy. Missing: secure-payment badge, support hours, refund policy in one
bar, anything on product or cart. `src/components/layout/InfoBar.tsx` has no
importer.

main, 2026-10-14: `src/components/storefront/TrustBar.tsx` at the foot of the
product page and of the cart. Three items: secure card payment through
Cardcom (the checkout's own sentence), a link to the cancellation policy, a
link to the contact page. A test fails on any digit in the bar. Verified in
Chromium at 380 and 1440 on both pages: one bar, three items, two links, no
horizontal overflow, above the footer. Product parity gate after the change:
4.30 / 4.18 / 2.06 at 380 / 768 / 1440. The cart gate produced no number: it
has no reference and refuses. Why the row stays PARTIAL: support hours are
not printed, because no opening hours are recorded anywhere in the
repository. That is one fact from Ofir and a one-line change.

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

main, 2026-10-14: the queue is ported and wired into `/scan`. A lookup or a
redeem that cannot reach the server is kept with the idempotency key it was
minted with, a banner shows the pending count and says the scans are not yet
checked, and the queue drains through the batch route on the `online` event
or the button. Only a verdict about the voucher removes a scan; a failed
batch removes nothing. Verified by unit tests, including five on the screen
itself (kept on a failed lookup, drained with the original key, kept on a
failed batch, removed when refused, same key when the redeem drops after the
lookup). Not verified: a real till in a browser, which needs a supplier
session and a live voucher to burn. Why the row stays PARTIAL: storage is
still localStorage and draining needs the tab open; IndexedDB and Background
Sync are not built.

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

Closed on main, 2026-10-14. `/admin/analytics` now carries, for the chosen
period: voucher redemption rate, redeemed over issued, completed refunds with
their share of paid orders, and the amount refunded with its share of GMV
(ported). Two tiles are new and ignore the period, because they are what is
outstanding now: active vouchers (issued, not expired) and payouts due (sum
and count of `payout_statements` awaiting approval or payment; a rolled-over
statement is cancelled and not counted, so the money is not counted twice).
Verified: unit tests, build, and the loader's exact filters run read-only
against live data: 30 days gives 19 issued, 4 redeemed, 2 voided, 2 refunds
both completed; 18 vouchers active now; 0 statements due. Not verified: the
page in a browser, which needs an admin session.

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

Closed on main, 2026-10-14.

- Admin control: a switch on the product edit page, saved by its own action
  (`src/server/actions/admin/product-gift-card.ts`), admin tier only. Turning
  it on is refused unless the product has no supplier, a platform share of
  100, is not a coupon or a subscription, and is priced at its full value
  (`src/lib/gift-cards/product-rule.ts`). Those are the four things finalize
  and migration 234 assume and nothing in the database enforces. Turning it
  off is always allowed.
- Printable QR: checking the balance of an active card shows a QR and a print
  button. The QR opens `/gift-card#CODE`. The code is in the URL fragment,
  which is never sent to a server, and the page removes it from the address
  bar after typing it into the field.
- Link: the wallet page links to `/gift-card`. The footer was left alone: the
  home parity gate has 0.07 points of headroom at 380.

Verified: unit tests; in Chromium on a built server the fragment fills the
field, the address becomes `/gift-card`, and no request carried the code; an
unknown code is refused with no QR. Not verified: the QR for a real card (no
gift card has ever been issued: `gift_cards` has 0 rows, and no product is
flagged), and the admin switch in a browser (needs an admin session). A
nested `<main>` on the page was also replaced with a `<div>`.

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
`apps/mobile/src/lib/push.ts`. main, 2026-10-14: `PostPurchasePushPrompt.tsx`
is rendered on the paid `checkout/return` page, as on prod. It is a link to
the notifications page, not a permission dialog.

**25. Abandoned cart.** main: hourly `src/app/api/cron/abandoned-cart/route.ts`,
one email ever at three hours, newsletter subscribers only. Missing: second
email, coupon code. prod: two reminders, the second needing a pending
migration.

**26. Comparison.** Both: nothing.

Built on main, 2026-10-14. A scales toggle on each listing card picks up to
four products into localStorage; a bar above the grid counts them and links to
the table once there are two; `/products/compare` lays them out as a real
table with a column per product: price, full price, saving in shekels and
percent, category, availability, voucher life, description, add to cart and
remove. The lowest price is marked only when it is the only lowest. Saving and
discount are integer agorot and the same basis points the discount sort uses
(`src/lib/compare/rows.ts`). The page is at `/products/compare` because
`/compare` is an old WordPress URL that `data/legacy/redirect-map.json`
answers 410; the local server confirms both (200 and 410).

Verified in Chromium, built server, live data, 380 and 1440: 24 toggles, each
44 by 44 on the image and clear of the heart; three picks give the bar and a
three-column table with the lowest of 699 / 600 / 180 marked; the page does
not scroll sideways (the table does, inside its box, at 380); removing a
column leaves two and survives a reload. Not verified: add to cart from the
table, Safari and Firefox. The toggle is on the listing card only, not on the
product page or the home grid.

**27. Mega-menu.** Both: `src/components/layout/MastheadNav.tsx` with a
single-column city menu.

**28. Breadcrumbs.** Both: `buildBreadcrumbJsonLd` in `src/lib/seo/json-ld.ts`
on product, category and city pages, with visible trails. main, 2026-10-14:
`src/lib/category-tree.ts` and its tests are ported from prod, the product
page builds its visible trail and its BreadcrumbList from the full ancestor
chain, and the admin category write refuses a parent that would create a cycle
or a tree deeper than three levels (`parentChoiceError`, server-side). Still
one hop on main: the category page's own trail (`getCategoryParent`). No
visible change today, because every production category is a root.

**29. SKU search.** Both: `sku` is a searchable attribute with typo tolerance
off, and `/search?q=` answers. main, 2026-10-14: the admin product list matches
name, SKU or slug through `src/lib/admin/product-search.ts`. Still missing on
main: a header search box (note A), and SKU in the admin command palette,
which searches orders only. prod: the admin list filters `name_he` only.

**30. Barcode scan.** Both: native `BarcodeDetector` over `getUserMedia`,
manual entry as fallback (`src/app/(supplier)/scan/ScanClient.tsx` on main),
`expo-camera` in the mobile app. main, 2026-10-14: the detector asks for QR
plus Code 128, Code 39, EAN-13 and ITF, intersected with what the device
reports (`pickScanFormats` in `src/lib/vouchers/scan-input.ts`), because
constructing a detector with an unsupported format throws. The picker is unit
tested; no physical 1D barcode was scanned, and nothing this site prints is a
1D barcode. prod: QR only.
