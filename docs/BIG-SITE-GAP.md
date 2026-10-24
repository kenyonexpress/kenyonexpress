# Big-site gap audit (C10) — 2026-10-25

Benchmarks: Groupon, Groo, BuyMe, Amazon, Wolt.
Method: static audit of `src/app` routes, `src/components`, `src/lib`, `src/app/api`
and `docs/`. EXISTS/PARTIAL/MISSING describe code reachability, not production
behaviour (Supabase MCP is unauthenticated, so nothing was verified against the DB).
Reference sites were judged from public product knowledge, not crawled.

Legend: EXISTS = shipped in code. PARTIAL = built but incomplete, or backend without
storefront UI. MISSING = absent. N/A = excluded by locked policy (not a gap).
Benchmarks: G = Groupon, Gr = Groo, B = BuyMe, A = Amazon, W = Wolt.

## Policy exclusions (never build)

| Feature | Seen on | Reason |
| --- | --- | --- |
| Product ratings and reviews UI, review links | G, A, W | Iron rule: no reviews UI, no Google review links |
| Social network links, social login buttons in footer | all | Iron rule: no social links |
| Billing address step | A | Shipping address only, physical products only |
| Languages beyond Hebrew RTL | A | RTL everywhere; `messages/en.json` exists but is not a product goal |

## Matrix

### Discovery and search

| Feature | Seen on | Status | Evidence / note | Priority |
| --- | --- | --- | --- | --- |
| Category tree and mega menu | all | EXISTS | `layout/MegaMenu`, `/category/[slug]`, `/c/[slug]` | — |
| City landing pages | G, W | EXISTS | `/city/[slug]`, `lib/city-page.ts` | — |
| Keyword search page with Hebrew synonyms | A, G | EXISTS | `/search`, `lib/search/hebrew-synonyms`, Meilisearch pipeline | — |
| Search autocomplete / suggestions in header | A, W, G | PARTIAL | Index and synonyms exist; header has a guard test (`layout/no-search-ui.test.ts`) and header is a locked component | P1 |
| Sort and price filter on listings | A, G | EXISTS | `/products`, `/category/[slug]` (`priceMin`, `sort`) | — |
| Facet filters (brand, region, rating-free attributes) | A, G | PARTIAL | Price and type (coupon/physical) only | P1 |
| Near-me / distance sorting | G, W | PARTIAL | `lib/geo/distance`, Waze pin, city filter; no browser geolocation prompt | P2 |
| Recently viewed strip | A | MISSING | Only a footer mention | P2 |
| Personalised recommendations | A, G | PARTIAL | `related-products.ts` and `RelatedProducts`; nothing behavioural | P2 |
| Deals of the day / hot coupons | G, Gr | EXISTS | `home/DealsOfTheDay`, `HotCouponCard` | — |
| Brand row | A, B | EXISTS | `home/BrandsRow` | — |
| Occasion / recipient browse (birthday, couple, for him) | B | MISSING | Categories are by product type only | P1 |

### Product page

| Feature | Seen on | Status | Evidence / note | Priority |
| --- | --- | --- | --- | --- |
| Gallery with swipe and zoom | A, G | EXISTS | `ProductGallery`, `SwipeableGallery` | — |
| Variants and quantity | A | EXISTS | `ProductInfo`, `product-variant-quantity.test` | — |
| Stock scarcity and purchase count | G, A | EXISTS | `StockScarcity`, `PurchaseCount` | — |
| Countdown to deal end | G, Gr | PARTIAL | Present on hot coupon card and product info; not on every deal | P2 |
| Sticky buy bar on mobile | A, G | EXISTS | `ProductStickyCartBar` | — |
| Merchant/supplier info and map pin | G, W | EXISTS | `SupplierInfo`, `LocationPin`, Waze | — |
| "Notify me when back" | A | EXISTS | `NotifyMeButton` | — |
| Shipping and returns info block | A | EXISTS | `ShippingInfo`, `/returns` | — |
| Ask the seller via WhatsApp | W, A | EXISTS | `ProductQuestionLink` | — |
| Product Q&A board | A | MISSING | Only WhatsApp link | P2 |
| Structured data (Product, Offer) | A, G | EXISTS | `lib/product-seo.ts` | — |

### Cart and checkout

| Feature | Seen on | Status | Evidence / note | Priority |
| --- | --- | --- | --- | --- |
| Persistent cart, mini cart | all | EXISTS | `/cart`, `components/cart`, `api/cart` | — |
| Guest checkout | A, G | EXISTS | `payments/guest-identity` | — |
| Cardcom card payment | — | EXISTS | `payments/cardcom`, return/failed/confirmation routes | — |
| Bit / Apple Pay / Google Pay wallets | W, A, B | MISSING | No Apple/Google Pay code; Bit only in gift claim tokens | P1 |
| Installments (תשלומים) selector | B, A | PARTIAL | Mentioned in product info and supplier payouts; no checkout selector | P1 |
| Coupon / promo code entry | A, G | EXISTS | `lib/coupons`, `/coupon/[id]` | — |
| Abandoned cart nudges | A, G | PARTIAL | `abandoned_cart_nudges` table, no sender wired in matrix | P1 |
| Free-shipping progress bar | A, W | PARTIAL | Free-shipping flag exists; no progress meter in cart | P2 |
| Delivery slot / ETA picker | W, A | MISSING | Physical shipping has no ETA selector | P2 |
| Order confirmation email and SMS | all | EXISTS | `lib/email`, `lib/sms`, `checkout/confirmation` | — |

### Gifting and vouchers (core category for BuyMe)

| Feature | Seen on | Status | Evidence / note | Priority |
| --- | --- | --- | --- | --- |
| Send as gift with claim link | B | EXISTS | `/gift/[token]`, `GiftPurchaseForm`, `GiftClaimForm` | — |
| Voucher with QR and redeem at merchant | G, B | EXISTS | `/voucher`, `/redeem/[token]`, supplier `/scan` | — |
| Wallet of vouchers | G, B | EXISTS | `/account/wallet`, `/account/vouchers` | — |
| Gift personalisation (card design, message, scheduled send) | B | PARTIAL | Claim token exists; scheduling and designs unconfirmed | P1 |
| Gift-value voucher usable across merchants (open-value) | B | MISSING | Vouchers are per product | P1 |
| Corporate / bulk gifting (B2B) | B, G | MISSING | One incidental mention | P2 |
| Expiry reminders | G, B | EXISTS | `lib/reminders` | — |

### Account and retention

| Feature | Seen on | Status | Evidence / note | Priority |
| --- | --- | --- | --- | --- |
| Orders list, detail, cancel | A | EXISTS | `/account/orders` | — |
| Addresses, details, security, MFA | A | EXISTS | `/account/*`, `(auth)/mfa` | — |
| Wishlist | A | EXISTS | `/account/wishlist` | — |
| Club tiers and cashback | A (Prime), G+ | EXISTS | `/club`, `/account/tier`, `lib/club`, `lib/cashback` | — |
| Referrals and affiliates | G, Gr | EXISTS | `/account/referrals`, `/affiliate` | — |
| Notification preferences, web push | A, W | EXISTS | `/account/notifications`, `lib/push` | — |
| Price-drop alerts | A | MISSING | Only back-in-stock | P2 |
| Subscriptions | A | PARTIAL | `/account/subscriptions` page; subscribe-and-save on product not confirmed | P2 |
| Saved payment methods | A, W | PARTIAL | Token expiry logic exists; no storefront management page | P1 |
| Returns self-service (RMA flow) | A | PARTIAL | `/returns` policy and refunds admin; no customer-initiated return form | P1 |
| Order tracking page with carrier timeline | A, W | PARTIAL | `tracking_number` stored (admin); no customer timeline | P1 |

### Content, trust and support

| Feature | Seen on | Status | Evidence / note | Priority |
| --- | --- | --- | --- | --- |
| FAQ, About, Contact | all | EXISTS | `/faq`, `/about`, `/contact` | — |
| Legal set (terms, privacy, returns, accessibility, cookies) | all | EXISTS | `(legal)` group | — |
| Blog | A, G | EXISTS | `/blog` | — |
| Newsletter double opt-in | G | EXISTS | `(main)/newsletter` | — |
| WhatsApp contact | W, B | EXISTS | `lib/whatsapp` | — |
| Support chat / AI assistant | A, W | PARTIAL | `ARCHITECTURE-AI-AGENTS-SUPPORT` and agent code, no storefront widget | P2 |
| Help center search | A | MISSING | FAQ is a flat page | P2 |
| Supplier self-onboarding | G, W | EXISTS | `/suppliers`, `api/supplier-apply`, supplier portal | — |

### Platform

| Feature | Seen on | Status | Evidence / note | Priority |
| --- | --- | --- | --- | --- |
| PWA, offline page, install | W, A | EXISTS | C09 report | — |
| Native app shell | W, A | PARTIAL | `ios/`, `android/`, Capacitor config; not published | P2 |
| Admin: orders, refunds, payouts, discounts, flags | all | EXISTS | `(admin)/admin/*` | — |
| Group buying (deal unlocks at N buyers) | G, Gr | PARTIAL | Only `group-purchase-schema.ts` and manifest entry, no UI | P1 |
| Live order tracking / courier map | W | MISSING | Not applicable to vouchers; physical only | P2 |
| Merchant promoted placement / ads | A, W | MISSING | No sponsored slots | P2 |

## MISSING summary by priority

| Priority | Item |
| --- | --- |
| P0 | none. Core purchase, voucher, gift, redeem and account flows exist. Blockers for launch are credentials (Cardcom production, Supabase key) and the C08 visual gate, not feature gaps |
| P1 | Bit / Apple Pay / Google Pay |
| P1 | Occasion and recipient browse (BuyMe-style) |
| P1 | Open-value cross-merchant gift voucher |
| P1 | Facet filters beyond price and type |
| P1 | Search autocomplete (needs header, locked component, so would need a separate unlocked mount) |
| P1 | Checkout installments selector (PARTIAL) |
| P1 | Customer return request flow (PARTIAL) |
| P1 | Order tracking timeline (PARTIAL) |
| P1 | Group buying UI (PARTIAL) |
| P1 | Saved payment methods page (PARTIAL) |
| P1 | Abandoned-cart sender (PARTIAL) |
| P1 | Gift scheduling and personalisation (PARTIAL) |
| P2 | Recently viewed, price-drop alerts, product Q&A, help-center search, delivery slot picker, corporate gifting, sponsored placements, courier live map |

## Notes

- Autocomplete and any header change are blocked by the forbidden-files rule
  (`Header.tsx`, `MainHeader.tsx`, `TopBar.tsx`, `components/header/**`). Per the
  iron rule, record `BLOCKED locked-component` for that item when it is picked up.
- Review, rating and social features that all five benchmarks have are excluded by
  policy and are intentionally not scored as gaps.
- Existing related reports: `docs/GAP-MATRIX.md` (table-level reachability) and
  `docs/GAP-AUDIT-FINAL.md`.
