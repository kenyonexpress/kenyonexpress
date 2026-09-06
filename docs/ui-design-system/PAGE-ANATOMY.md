# Storefront page anatomy

Top-to-bottom breakdown of every customer-facing route: section order, data each section needs, loading skeleton, empty copy, error copy.

Status: binding for UI work in this worktree. Docs only.

Companions:

```
docs/ui-design-system/TOKENS.md
docs/ui-design-system/COMPONENTS.md
docs/COUPON-STOREFRONT-SPEC.md
docs/PRODUCT-PAGE-SPEC.md
docs/ARCHITECTURE-CATEGORY-PAGE.md
docs/ARCHITECTURE-CART-CHECKOUT.md
docs/ARCHITECTURE-ACCOUNT-AREA.md
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
docs/ARCHITECTURE-PRODUCT-TYPES.md
docs/BUSINESS-MODEL.md
```

Electro home-v7 supplies layout and structure only. Copy, prices and images come from live `kenyonexpress.co.il`. Money is integer agorot via `packages/money.ts`. `platform_percent` is never painted for the customer.

Authority for money and product type: `BUSINESS-MODEL-RULES.md` (when present) then `docs/PRODUCT-TYPES.md` then `docs/ARCHITECTURE-PRODUCT-TYPES.md` then research docs. This file owns section order and customer-facing empty/error copy.

Standing chrome rule: **no search field in the header or the drawer.** `/search` exists as a route with a page-level form. Do not reintroduce a masthead search to chase live pixels.

---

## 0. How to read this file

Every route below is wrapped in the storefront shell unless the row says otherwise.

Shared shell (top to bottom), from COMPONENTS §3:

1. SkipLink
2. ConsentBanner (hidden after decide)
3. SiteHeader (InfoBar + masthead + MobileDrawer)
4. `<main id="main-content">` (the sections in this file)
5. SiteFooter (home uses the wider home footer; inner pages use the 1200px store footer)
6. WhatsAppFloat (`z-40`)
7. PWA InstallPrompt (optional)

The voucher/QR page (`/coupon/[id]`) is **outside** this shell on purpose: a cashier is waiting. Global 500 (`global-error.tsx`) supplies its own `html`/`body` because the layout itself failed.

Skeleton rule: reserve the **painted height** of the real block (TOKENS spacing + COMPONENTS geometry). A skeleton that is shorter than the real section jumps the footer and fails CLS. Skeletons are not focusable. Use `aria-busy="true"` and a Hebrew `aria-label` that names the block.

Copy voice: second person, Hebrew, no English except proper nouns, SKUs, Latin brand names, and `Waze`. Prices via the agorot formatter (`shekels` / `formatIls` / `formatAgorot`). Dates via `he-IL`. Numerals, prices, phones and Latin names sit in `<bdi>` or `dir="ltr"` (TOKENS RTL).

`{n}`, `{price}`, `{date}`, `{q}` in copy mark a formatted value. Never interpolate a raw integer of agorot into a sentence.

---

## 1. Home `/`

| | |
|---|---|
| File | `src/app/(store)/page.tsx` |
| Robots | index, follow |
| H1 | None on the page chrome. Hero welcome line is display type, not the document H1. Live metadata title: `קניון EXPRESS: מסדרים לך בילוי` (keep the live string) |
| Electro | home-v7: departments + slider + ads, category strip, features, deals of the day, footer |
| Pixel gate | `compare.mjs --page=home` at 380 / 768 / 1440, under 11 percent |

`HOMEPAGE_SPEC.md` (2026-06-04) is stale on section order (it puts FeatureBar after Deals and names CategoryRing). This file follows COMPONENTS + the 2026-09 live capture.

### 1.1 Section order

| # | Section | 380 | 768 | 1440 | Component |
|---|---|---|---|---|---|
| 1 | Hero row: slider | yes | yes | yes | `HeroSlider` |
| | Hero row: category sidebar | no | no | yes (inline-start, visual right) | `HeroCategorySidebar` |
| | Hero row: three promo banners | no | no | yes (inline-end, visual left) | `HeroPromoBanners` |
| 2 | Category strip (5 tiles) | no | yes (shares slider x/width) | yes | `CategoryStrip` |
| 3 | Benefit / USP bar | 31px empty strip (items not painted) | yes | yes | `BenefitBar` |
| 4 | Deals of the day grid | 1 col | 2 col | 4 col | `DealsOfTheDay` + `ProductCard` variant `deals` |
| 5 | Footer (home box, `--container-footer` 1430px) | accordion | accordion | columns | `home/Footer` |

Hero height tokens: 213 / 495 / 613 (TOKENS `--spacing-hero-mobile/tablet/desktop`).

### 1.2 Data per section

| Section | Needs |
|---|---|
| Hero slider | `KE_LIVE` slides: id, variant (`welcome` / `product` / `app`), titles, tagline, promo lines, **display** price string (not a float), image layout. Product slides may join live catalogue by slug for href only |
| Category sidebar / strip / drawer | `KE_LIVE_CATEGORIES` (eleven rows). Same list everywhere |
| Promo banners | Live stills + Hebrew CTA `קנה עכשיו` + target href |
| Benefit bar | Static five USPs (copy from live) |
| Deals grid | Published products for the home fixture / `is_featured` then catalogue. Fields: `id`, `slug`, `name_he`, `kenyon_price` (agorot), `full_price?`, `images`, `stock_quantity`, `category?`. **Never** `platform_percent` |

### 1.3 Loading skeleton

- Hero: first still-frame at the reserved height. No grey hole.
- Category strip: five  squarish tiles at 727.89×170 (desktop shared with slider).
- Deals: card-geometry grid, 1 / 2 / 4 columns, image tile + three text bars (category, price, title) matching the **deals** DOM order (category, price, title, image, footer). `aria-label="טוען דילים של היום"`.
- Footer: paint immediately (static).

### 1.4 Empty

| Section | Copy |
|---|---|
| Deals grid | `אין מוצרים להצגה` |
| Promo column | Hide the column. Do not invent banners |
| Slider with zero product slides | Keep the welcome slide. Do not mount a zero-slide carousel |

### 1.5 Error

| Section | Copy |
|---|---|
| Catalogue read fails | Same as empty deals: `אין מוצרים להצגה`. Home must still paint chrome + hero welcome. Do not crash the route |
| Image error | `SmartImage` fallback tile. No toast |

---

## 2. Category listing `/category/[slug]`

| | |
|---|---|
| Aliases | `/products` (all-catalogue archive, same chrome). `/city/[slug]` is a region landing, not this template |
| File | `src/app/(store)/category/[slug]/page.tsx` |
| Robots | index,follow on the canonical (no sort/filter). `noindex,follow` when `sort`, `min`, `max`, `supplier` or `type` is set |
| Electro | shop archive: breadcrumb, control bar, sidebar, loop, pagination |

URL state: `?page=&sort=&min=&max=&supplier=&type=`. Invalid params are dropped, not a 500. Unknown slug: `notFound()` → §12.

### 2.1 Section order

1. CategoryBreadcrumb (`בית` > category)
2. H1 (`name_he`) + result count
3. Desktop: sidebar (inline-start / visual right) + main
   - Sidebar: category tree, optional price min/max, optional type coupon/physical
   - Main: CategoryControlBar (view-switcher scenery + sort `<select>`) then product grid then Pagination
4. Handheld: H1, control bar, grid, pagination. Filters in `<details>` / drawer, not a second grid

Grid: 2 columns handheld, 3 tablet, 4 desktop. Card anatomy is live loop: price above title above thumb (COMPONENTS §5.4).

### 2.2 Data per section

| Section | Needs |
|---|---|
| Breadcrumb | `{ href, label }[]`. First crumb is always Home |
| H1 | `categories.name_he`, `slug` |
| Count | integer `total` (formatter: decimal `he-IL`) |
| Sidebar | active categories (`is_active`, `sort_order`, `slug`, `name_he`), current slug, optional `priceMin`/`priceMax` as **agorot** (inputs display ILS) |
| Grid | `CategoryProduct`: `id`, `slug`, `name_he`, `kenyon_price`, `full_price?`, `images`, `stock_quantity?`, `categories?`, `supplier?`, `distanceKm?` (only for `לידי` sort) |
| Sort | `SORT_OPTIONS` / live `orderby` mapping |
| Pagination | `pathname`, current page, `totalPages` |

Customer never sees `platform_percent`, cost, or supplier split.

### 2.3 Loading skeleton

`CategoryGridSkeleton` default 8 cards. Same grid class as the real list. Image rectangle + two text bars + price bar. `aria-label="טוען מוצרים"`. Count line is a 12em pulse. Sidebar links can stream; do not collapse the grid height.

### 2.4 Empty

```
לא נמצאו מוצרים התואמים את הבחירה שלך.
```

Keep H1, breadcrumb and filters. Hide pagination when `totalPages <= 1` (including zero).

Unknown slug is not this empty: it is 404.

### 2.5 Error

| Case | Copy / behaviour |
|---|---|
| Query throws | Route error boundary (§13). Do not paint an empty grid that looks like "no products" |
| Bad page number | Clamp or empty grid with the empty copy above, not a crash |
| Image per card | fallback tile |

---

## 3. Product page, coupon type `/product/[slug]`

`products.type = 'coupon'` (or coupon path when `is_coupon_enabled` is the live discriminator; new writes must set `type`). Same URL as physical. The template branches on type.

| | |
|---|---|
| File | `src/app/(store)/product/[slug]/page.tsx` |
| Robots | index,follow when published. Unknown slug: 404 |
| Electro | single-product: gallery + summary, tabs/description, related |
| Binding UI | `docs/COUPON-STOREFRONT-SPEC.md` |

Forbidden in the customer DOM: `platform_percent`, `supplier_split_percent`, escrow language, internal SKU, admin cost.

### 3.1 Section order

380: stacked. 768+: gallery inline-start (visual right), summary inline-end.

1. CategoryBreadcrumb (`בית` > category > product)
2. ProductGallery (470px frame desktop + thumbs + optional `N%-` badge)
3. ProductInfo summary:
   - Category / city eyebrow
   - H1 `name_he`
   - Rating slot (optional)
   - WishlistButton
   - **CouponPricing**: `מחיר רגיל` / `מחיר בקניון` + split `לתשלום באתר עכשיו` / `יתרה לתשלום בבית העסק`
   - Expiry hint (`תקף {n} ימים מיום הרכישה`)
   - Variant picker if variants exist
   - Qty (plain number, live has no +/−)
   - Add to cart (TOKENS family 1: slate at 380, yellow from 768)
   - Share (WhatsApp, Facebook)
   - StockScarcity streamed (`נותרו {n}` or nothing)
4. SupplierInfo (mandatory block; omit empty rows, never `כתובת:` with a blank)
5. Description (`description_he` / short)
6. Redemption instructions (`redemption_instructions_he`)
7. Reviews + ReviewFormGate
8. RelatedProducts
9. Sticky ATC on 380 only, must not cover SupplierInfo without scroll

**Do not** mount `ShippingInfo` on coupon.

### 3.2 Data per section

| Section | Needs |
|---|---|
| Gallery | `images[]`, `name_he`, optional `GalleryAsset` alt/blur, display prices only for the `%` badge ratio |
| CouponPricing | `CouponOffer`: `sellable`, `reason`, `fullPriceIls` (formatted from agorot), `paidOnlineIls`, `balanceAtBusinessIls`, `discountPercent` |
| Expiry | `coupon_expiry_days` (integer days, not a clock) |
| Qty / ATC | `productId`, `variantId?`, `stock_quantity` / cap, `priceAgorot` for analytics **after** accept |
| SupplierInfo | `SupplierSummary` + `productType: 'coupon'` + fulfilment note |
| Related | `categoryId`, `excludeId` |
| Reviews | `productId`, approved list |

Split amounts: server integer math, display via money helper. Face − coupon = remainder at business. No escrow.

### 3.3 Loading skeleton

- Gallery: 356px (380) / 470px (desktop) rounded frame
- Summary: H1 bar, two price bars, qty + 53px CTA
- Supplier: 4 line bars
- Related: card row, omit heading until cards exist
- StockScarcity: empty fallback (must not shift the buy row)

### 3.4 Empty

| Section | Copy |
|---|---|
| Not sellable / expired offer | `המבצע הסתיים` |
| Coupon not priced | `הקופון אינו זמין לרכישה` |
| No variants | hide picker |
| No related | omit the whole section |
| No reviews | gate / form only, no empty heading |
| No supplier address | omit the address row |

### 3.5 Error

| Case | Copy |
|---|---|
| Unknown slug | 404 |
| Add to cart refused | toast from cart store; button re-enables. Do not navigate |
| Wishlist fail | `הפעולה נכשלה.` |
| Image | empty gallery frame (📦), not a broken img |

---

## 4. Product page, physical type `/product/[slug]`

`products.type = 'physical'` (service currently settles like physical; recurring is a separate join path and is not this template).

Same chrome as §3 with these substitutions.

### 4.1 Section order (diffs vs coupon)

1. Breadcrumb
2. Gallery (same)
3. ProductInfo:
   - H1, wishlist, rating
   - **Single price block**: current `--color-price`, strike `--color-price-strike` when `full_price > kenyon_price`
   - **No** on-site / at-business split
   - Variant picker
   - Qty
   - Add to cart
   - Buy now (`--pdp-buy` `#c94b28`, hover `#b8401f`)
   - Share
   - StockScarcity
4. SupplierInfo with `productType: 'physical'`
5. ShippingInfo (physical only: pickup / delivery copy)
6. Description, highlights, warranty/condition if set
7. Reviews
8. Related

Customer pays **100% on site**. Split by snapshotted `platform_percent` is ledger-only. Never show the percent. Never write "מוחזק עד מסירה" / escrow.

### 4.2 Data per section

| Section | Needs |
|---|---|
| Price | `kenyon_price` agorot, `full_price?` agorot |
| Stock | `stock_quantity`, variant stock, `max_per_order` |
| ShippingInfo | shipping/pickup flags and Hebrew copy. Omit the block when empty |
| Buy now | same cart write then `/checkout`, or dedicated buy path; disabled when unsellable |
| Supplier | same as coupon, fulfilment note for physical |

Missing `platform_percent` on the product: line is **unavailable** at cart/checkout, not a silent 0%. PDP may still render; ATC/buy must refuse.

### 4.3 Loading skeleton

Same as coupon, plus a shipping block (3 lines) under supplier. Buy-now is a second 53px bar under ATC.

### 4.4 Empty

| Section | Copy |
|---|---|
| Stock 0 | disable ATC/buy. Visible: `אזל מהמלאי` (not a blank button) |
| No shipping copy | omit ShippingInfo |
| No related / reviews | same as coupon |

### 4.5 Error

Same as coupon. Address is collected at checkout when the cart `needsAddress`, not on this page.

---

## 5. Cart `/cart`

| | |
|---|---|
| File | `src/app/(store)/cart/page.tsx` + `CartPageView` |
| Robots | noindex |
| Electro | cart table + collaterals + checkout button |
| Pixel | scored (empty cart matches live). Handheld footer must stay the short accordion, not the desktop footer stacked |

Guests may hold a cart. Login happens on pay.

### 5.1 Section order

1. H1 `עגלה` (~40px / 500 at desktop)
2. If empty: CartEmptyState only (no totals, no checkout)
3. If lines:
   - Line list / table: thumb, name, unit price, qty, line total, remove
   - Unavailable warning on a line that cannot check out
   - CartCouponForm (platform promo code, **not** a voucher product). Live often has no `apply_coupon`; this control is ours
   - CartTotalsSidebar: subtotal, discounts, total
   - CartCheckoutButton `המשך לתשלום`
4. Footer (store footer; handheld accordion)

Mini-cart (header) is not this page: see COMPONENTS §7.3. Empty mini-cart: `אין מוצרים בסל הקניות`. Drawer empty: `העגלה ריקה`.

### 5.2 Data per section

| Section | Needs |
|---|---|
| Lines | `CartViewItem`: product name, slug, image, qty, unit agorot, line agorot, variant label, `unavailableMessage?` |
| Totals | `CartView` agorot fields via `shekels()` |
| Coupon form | code string (`dir="ltr"` mono) |
| Checkout button | `isAuthenticated` (guests still see the link; pay gates login), `disabled` when any line unavailable |

Re-price on the server. A catalogue price change does not silently ship: the line becomes unavailable or the total updates before pay. Historical `order_items.platform_percent` is irrelevant here (no order yet).

### 5.3 Loading skeleton

`initialCart` from the server, then client sync. Skeleton if hydrating: two line rows (thumb 64px + four text bars) + totals box 180px. Do not flash empty then fill (that looks like §5.4).

### 5.4 Empty

```
סל הקניות שלך ריק כרגע.
```

CTA:

```
חזור לחנות
```

Href: `/products`. **Not** `/search`.

Server refusal when pay is attempted on empty: `העגלה ריקה` (`EMPTY_CART`).

### 5.5 Error

| Case | Copy |
|---|---|
| Promo invalid | `קוד לא תקין` (`role="alert"`) |
| Line unavailable (deleted product, stock 0, missing percent, type unsellable) | per-line `unavailableMessage`; checkout `aria-disabled` + `preventDefault` |
| Qty at ceiling | disable plus; named `הגדל כמות` |
| Network on qty/remove | toast error; line stays until confirmed |

---

## 6. Checkout `/checkout`

| | |
|---|---|
| File | `src/app/(store)/checkout/page.tsx` + `CheckoutForm` + `CheckoutShell` |
| Robots | noindex |
| Electro | WooCommerce checkout (steps + columns + `#place_order`) |
| Related | `/checkout/return` (Cardcom land), `/checkout/confirmation` (alias redirect), `/checkout/failed`, `/checkout/frame-return`, `/checkout/app-return` |

Empty cart: **bounce to `/cart`**. Do not render a pay button on zero lines.

Login-at-pay: guest filling identity may be sent through Google/OTP, then `mergeGuestCart`, then resume (`sessionStorage` `ke.checkout.resume`).

### 6.1 Section order

1. Optional guest notice (login vs continue as guest until pay)
2. Stepper (`ol.checkout-steps`): identity → address (if `needsAddress`) → payment → place order
3. Two columns from the 992px checkout breakpoint: form | order review
4. Identity: name, phone, email
5. Address (physical line present): street, city, zip. Coupon-only carts skip this step
6. Payment: saved cards and/or Cardcom iframe/Low Profile. Wallet clamp (credit in agorot)
7. Review: lines, totals (agorot), disclosure that coupon remainder is paid at the business (when any coupon line)
8. Place order (TOKENS family 3: yellow, 50px radius, 19.418px / 700)
9. Failed / pending / return are **separate routes**, not extra sections here

### 6.2 Data per section

| Section | Needs |
|---|---|
| Form | `cart`, `clientRef`, `needsAddress`, `CheckoutAddressPrefill`, `walletBalance` agorot, `savedCards?`, `isAuthenticated`, `resuming?`, `channel: 'web' \| 'app'` |
| Review lines | name, qty, unit/line agorot, type (coupon vs physical) for the remainder sentence |
| Wallet | balance agorot, clamp so paid_on_site cannot go negative |
| Cardcom | server-created Low Profile URL only. Never a client secret |

`beginCheckout` re-prices, requires `platform_percent` on every physical line, snapshots into `order_items`. Changing catalogue percent later must not affect this order (DATA-CONTRACTS / money invariant).

### 6.3 Loading skeleton

`CheckoutShell`: reserved height of guest notice + stepper + two columns (checkout CSS 560 / 992). Scenery `aria-hidden`, not focusable. Iframe area: 400px pulse. Do not mount a 0-height fallback (CLS).

Return page: spinner + `בודקים את התשלום…` until webhook/finalize.

### 6.4 Empty

Not an empty state: redirect `/cart`.

### 6.5 Error

| Case | Copy |
|---|---|
| Failed route | H1 `התשלום לא הושלם`. Body `החיוב לא בוצע. אפשר לנסות שוב, העגלה שלך נשמרה.` CTA `חזרה לעגלה` |
| Retryable (`PAYMENT_PROVIDER_ERROR`, `RATE_LIMITED`, saved-card `NOT_FOUND`/`VALIDATION`) | inline banner `role="alert"` + stay on step. Offer retry |
| Terminal (stock, missing address, disabled checkout, missing percent) | banner, no fake retry that loops the same refusal |
| Saved card verify | `לא ניתן לאמת את הכרטיס השמור כרגע, נסו שוב` |
| Address verify | `לא ניתן לאמת את הכתובת כרגע, נסו שוב` |
| Pay request | `לא ניתן לאמת את בקשת התשלום כרגע, נסו שוב` |
| Catalogue / suppliers load | `לא ניתן לטעון את פרטי המוצרים כרגע, נסו שוב` / `לא ניתן לטעון את פרטי בתי העסק כרגע, נסו שוב` |
| Field validation | `StepErrors` per field, Hebrew labels, `aria-describedby` |

Never tell the customer that money is in escrow. Never show `platform_percent`.

---

## 7. Account `/account`

| | |
|---|---|
| File | `src/app/(account)/account/page.tsx` + `(account)/layout.tsx` |
| Auth | Session required. Unauthenticated → `/login?next=/account` |
| Robots | noindex |
| Electro | my-account structure only (Woo columns). Tokens from account CSS |

Nav (layout, `aria-current` on the active item), then the overview.

### 7.1 Section order (overview)

1. H1 `האזור האישי`
2. Subtitle `סקירה מהירה של החשבון שלך`
3. Wallet balance: label `יתרת הארנק`, `{price}`, note `קרדיט לשימוש באתר בלבד. לא ניתן למשיכה.`
4. Card: `ההזמנה האחרונה` or empty
5. Card: `קופונים פעילים` count + helper
6. Shortcuts into: orders, coupons/vouchers, details, security, wishlist, referrals, wallet, addresses, tokens, subscriptions

Sibling routes (same shell, not this page's sections): `/account/details`, `/security`, `/wishlist`, `/referrals`, `/wallet`, `/addresses`, `/tokens`, `/subscriptions`, `/coupons`, `/vouchers`, `/my-vouchers`.

### 7.2 Data per section

| Section | Needs |
|---|---|
| Wallet tile | `balanceAgorot` via `formatIls` |
| Last order | `totalAgorot`, `settlementStatus` (label + tone), `createdAt` (`formatDate`), `itemCount` |
| Active coupons | vouchers filtered by `isCouponPresentable` (status `issued` and not expired) |

### 7.3 Loading skeleton

Layout nav paints immediately. Main: title bar + 88px wallet block + two cards (120px). Tables: 4 rows of `account-row` pulses. `aria-label="טוען את האזור האישי"`.

### 7.4 Empty

| Slot | Copy |
|---|---|
| Last order | `עוד לא ביצעת הזמנות.` |
| Active coupons | `אין כרגע קופונים שממתינים למימוש` |
| Wallet movements (`/account/wallet`) | `עדיין אין תנועות בארנק.` |
| Coupons list | `עדיין לא רכשת קופונים.` |
| Wishlist | `עדיין אין מוצרים במועדפים` + CTA `להמשך קניות` |
| Saved cards | `אין כרטיסים שמורים. כרטיס נשמר אוטומטית בתשלום הראשון, אם בחרת בכך.` |
| Referrals unused | `עדיין לא הצטרף אף אחד דרך הקוד שלכם.` |

### 7.5 Error

| Case | Copy |
|---|---|
| Query fail | account banner, then §13 if the layout throws |
| Delete account | dialog + typed confirm (destructive). Never a single click |
| Wishlist toggle | `הפעולה נכשלה.` |

---

## 8. Order history `/account/orders`

| | |
|---|---|
| File | `src/app/(account)/account/orders/page.tsx` |
| Detail | `/account/orders/[id]` |
| Robots | noindex |

### 8.1 Section order

1. H1 `ההזמנות שלי`
2. Subtitle `{n} הזמנות` (`n` is a decimal count, `he-IL`)
3. List of `account-row`:
   - `{price}` + status chip (`orderStatusLabel`)
   - `{date} · {n} פריטים` and ` · כולל קופונים` when `hasVouchers`
   - Link `פרטים` → `/account/orders/[id]`
4. Detail page (not the list): line items, snapshots (unit price, **snapshotted** `platform_percent` is internal; do not show the percent to the customer), voucher links for coupon lines, physical fulfilment status, refund state

### 8.2 Data per section

| Section | Needs |
|---|---|
| List | `getMyOrders()`: id, `totalAgorot`, `settlementStatus`, `createdAt`, `itemCount`, `hasVouchers` |
| Detail | order + `order_items` snapshots (prices, qty, product name at purchase, voucher ids). Catalogue edits must not rewrite these rows |

### 8.3 Loading skeleton

Four `account-row` bars (title + meta + 88px action). Detail: header + 3 line rows + totals box.

### 8.4 Empty

```
עוד לא ביצעת הזמנות.
```

Keep the H1. CTA optional: `לחנות` → `/products`.

### 8.5 Error

Unknown id: 404 inside the account shell (or notFound). RLS miss is indistinguishable from missing: same 404. Do not leak another user's order.

---

## 9. Voucher / QR `/coupon/[id]`

| | |
|---|---|
| File | `src/app/coupon/[id]/page.tsx` |
| Auth | Session required. Signed out → `/login?next=/coupon/{id}` (not 404) |
| Robots | **noindex, nofollow** (live QR) |
| Shell | **No** store header/footer/cart. Max width `md`, grey page, white card |
| Electro | none (ours) |
| List | `/account/coupons` (and aliases `/account/vouchers`, `/account/my-vouchers`) |

Id is a UUID, not a secret. RLS + `user_id` make another person's id look like missing.

### 9.1 Section order

1. Back nav `← לכל הקופונים שלי` → `/account/coupons` (the arrow **does** mirror conceptually; keep the character, it is a back control)
2. Card header: H1 product `name_he` (fallback `שובר`), supplier name, status chip
3. If presentable (`issued`, not expired):
   - QR 240×240 (do **not** mirror)
   - Code `dir="ltr"` mono (`formatCouponCode`)
   - Hint `הציגו את הקוד בבית העסק`
4. If not presentable: status label, redeemed `{date}` or refund sentence, dimmed code, **no QR**
5. WalletButtons (Apple/Google). Render **nothing** if not presentable or credentials missing
6. Expiring-soon banner
7. Money `dl`: `שולם באתר`, `לתשלום בבית העסק` (emphasis), `מחיר מלא`, `בתוקף עד {date}`
8. Conservation warning if snapshot math does not add up
9. Supplier footer: name, address + Waze, phone `dir="ltr"`, WhatsApp (mark not mirrored)

### 9.2 Data per section

| Section | Needs |
|---|---|
| Body | `getCustomerVoucher(id)`: code, `qr_payload`, status, `expires_at`, `redeemed_at`, product name, supplier contact, money triple in **agorot** (`paidOnline`, `dueAtBusiness`, `faceValue`) |
| QR | `voucherQrDataUrl(qr_payload)` only when `status.presentable` |
| Wallet | `WalletVoucher` + `presentable` |

Money on this screen is the **voucher snapshot**, not live `products.platform_percent` and not a recompute of face from the catalogue.

### 9.3 Loading skeleton

Suspense fallback: `min-h-screen` grey column, no card. Do not prerender a QR. `aria-label="טוען קופון"`.

### 9.4 Empty / not presentable

| Status | Copy |
|---|---|
| Missing / other user | 404 (`הדף שחיפשתם לא נמצא`) after auth |
| Redeemed | chip + `מומש ב־{date}` |
| Refunded | `הסכום ששולם באתר הוחזר לאמצעי התשלום.` |
| Expired / cancelled | status label from `couponStatusView`, no QR |
| List page empty | `עדיין לא רכשת קופונים.` |

### 9.5 Error

| Case | Copy |
|---|---|
| QR image fail | `לא ניתן להציג QR כרגע. הקריאו את הקוד לקופאי.` |
| Money not conserved | `יש אי התאמה בפירוט התשלום של השובר. בבית העסק ייגבה הסכום הרשום כאן, ואם משהו נראה לא תקין פנו לשירות הלקוחות לפני המימוש.` |
| Expiring today | `הקופון פג היום` |
| Expiring in n days | `נותרו {n} ימים לניצול הקופון` (`n` is an integer day count) |

Cashier-facing scan errors live on `/supplier/scan`, not here: `השובר מומש בהצלחה`, `השובר כבר מומש`, `תוקף השובר פג`, `קוד שובר לא נמצא`, `אין הרשאת ספק`, `יותר מדי סריקות, המתן רגע`.

---

## 10. Supplier page `/s/[id]`

Public storefront for one supplier. **Not** the portal (`/supplier/*`). `/suppliers` is the join-us marketing page.

| | |
|---|---|
| File | `src/app/(store)/s/[id]/page.tsx` |
| Robots | index when the supplier exists and is active. Unknown: 404 + `noindex,follow` |
| Electro | shop archive chrome (category CSS), no 1:1 live capture (`refs/ke_live_supplier.html` does not exist) |
| Pixel | not scored |

### 10.1 Section order

1. Store shell header/footer
2. Eyebrow `ספק`
3. H1 `suppliers.name`
4. City, then address (omit empty)
5. Count line
6. Product grid (`CategoryProductCard`, 2 / 3 / 4 cols)
7. Pagination when `totalPages > 1`

### 10.2 Data per section

| Section | Needs |
|---|---|
| Header | `loadSupplierStorefrontCached`: name, city, address, active flag |
| Grid | published products for this `supplier_id`, page size `SUPPLIER_PAGE_SIZE` |
| Count | `total`, `from`, `to` (integers) |
| Metadata | `{name} ב{city} בקניון אקספרס. קופונים, מבצעים ומוצרים.` |

Inactive supplier: `notFound()`, not an empty grid.

### 10.3 Loading skeleton

`CategoryGridSkeleton count={SUPPLIER_PAGE_SIZE}`. Title block: 2 text bars above the grid.

### 10.4 Empty

```
אין מוצרים פעילים לספק הזה כרגע.
```

Count line uses that sentence when `total === 0`. Singular: `מציג תוצאה יחידה`. Else: `מציג {from} עד {to} מתוך {total} תוצאות`.

### 10.5 Error

| Case | Copy |
|---|---|
| Bad id / missing | 404, title `ספק לא נמצא`, description `הספק לא נמצא או שאינו פעיל בקניון אקספרס.` |
| Grid query throw | §13 |

---

## 11. Search results `/search`

| | |
|---|---|
| File | `src/app/(store)/search/page.tsx` |
| Robots | **noindex** always |
| Chrome | Category listing shell + **page-level** `SearchBox`. Header/drawer must not grow a field |
| Engine | Postgres FTS first, Meilisearch optional. Min query length 2 |

### 11.1 Section order

1. Breadcrumb (`בית` > `חיפוש`)
2. H1 `חיפוש מוצרים` or results title
3. SearchBox (this page only)
4. Count `נמצאו {n} מוצרים`
5. Sidebar filters (category list / type) + grid of `CategoryProductCard`
6. Empty block when zero hits

Do not record keystrokes in suggest. Recording happens on this results page with the final `q` and `total`.

### 11.2 Data per section

| Section | Needs |
|---|---|
| Query | `q` trimmed, `type` filter |
| Grid | `searchProductsCached(q, 48, productType)` |
| Count | `total` (integer) |

### 11.3 Loading skeleton

Same `CategoryGridSkeleton` as category. Count pulse 16em. SearchBox paints immediately (static form).

### 11.4 Empty

`q` shorter than 2: prompt to type, no grid.

Zero hits:

```
לא נמצאו מוצרים עבור "{q}".
נסו מילת חיפוש אחרת.
```

`{q}` is the raw query string, RTL-isolated if mixed Latin.

### 11.5 Error

Engine failure: §13, not a fake zero-results (zero-results is a product signal and is recorded).

---

## 12. 404 `not-found.tsx`

Every `notFound()` lands here: unknown product slug, unknown category, unknown supplier, unknown voucher after auth, mistyped URL.

| | |
|---|---|
| File | `src/app/not-found.tsx` |
| Title | `הדף לא נמצא` |
| Robots | **noindex, follow** |
| Electro | none |

### 12.1 Section order

1. Store shell if the root layout survived
2. Display `404` (aria-hidden, brand yellow)
3. H1 `הדף שחיפשתם לא נמצא`
4. Body `ייתכן שהקישור ישן, שהמוצר כבר לא במלאי, או שנפלה שגיאת הקלדה בכתובת.`
5. Actions: `לכל המוצרים` → `/products`, `עיון בקטגוריות` → `/products?view=categories`, `לדף הבית` → `/`

**No** link to `/search` (standing rule; this was the last storefront entry point and it was removed).

### 12.2 Data

None. Static.

### 12.3 Loading skeleton

n/a.

### 12.4 Empty

This page **is** the empty URL.

### 12.5 Error

n/a. If this page throws, §13.

---

## 13. 500 `error.tsx` / `global-error.tsx`

| | |
|---|---|
| In-layout | `src/app/error.tsx` (client). Catches trees under the root layout |
| Last resort | `src/app/global-error.tsx`. Layout itself threw. Own `html lang="he" dir="rtl"`. Inline styles only (CSS may be the failure) |

Robots: not indexed (error responses).

### 13.1 Section order (`error.tsx`)

1. Warning glyph (aria-hidden)
2. H1 `משהו השתבש אצלנו`
3. Body `התקלה נרשמה אצלנו ואנחנו מטפלים בה. אפשר לנסות לטעון את הדף מחדש.`
4. `נסו שוב` (`reset()`)
5. `לדף הבית`
6. `error.digest` in `dir="ltr"` mono if present (support handle, not a stack)

### 13.2 Section order (`global-error.tsx`)

Same H1. Body `התקלה נרשמה ואנחנו מטפלים בה. אפשר לנסות שוב בעוד רגע.` Single button `לדף הבית` (`window.location.assign('/')`). Digest if present.

### 13.3 Data

`error.digest` only. Never the exception message (may contain SQL or PII).

### 13.4 Loading skeleton

n/a.

### 13.5 Empty

n/a.

### 13.6 Error copy (this page)

The strings above **are** the error copy. Retry first on `error.tsx` because many failures are a dropped connection or a cold start.

---

## 14. Cross-cutting skeletons (cheat sheet)

| Surface | Shape | Min height cue |
|---|---|---|
| Home hero | still frame | 213 / 495 / 613 |
| Home deals | N cards, deals DOM order | card token height × rows |
| Category / search / supplier grid | `CategoryGridSkeleton` 8 (or page size) | live card 234px at 1440 |
| PDP | frame + summary bars | gallery 356 / 470 |
| Cart | 2 line rows + totals | avoid empty flash |
| Checkout | `CheckoutShell` full form | checkout CSS columns |
| Account | wallet block + 2 cards | 88px + 120px |
| Voucher | grey column, no QR | `min-h-screen` |
| 404 / 500 | static | n/a |

---

## 15. Copy index (empty + error only)

Canonical user-facing catalogue continues in `docs/COPY-HE.md`. This table is the anatomy subset so a route can be built without that file open.

| Route | Empty | Error |
|---|---|---|
| Home deals | `אין מוצרים להצגה` | same; do not crash home |
| Category / products | `לא נמצאו מוצרים התואמים את הבחירה שלך.` | boundary |
| Coupon PDP | `המבצע הסתיים` / `הקופון אינו זמין לרכישה` | 404 / cart toast / `הפעולה נכשלה.` |
| Physical PDP | `אזל מהמלאי` | same |
| Cart | `סל הקניות שלך ריק כרגע.` | `קוד לא תקין` / `העגלה ריקה` |
| Mini-cart | `אין מוצרים בסל הקניות` | (drawer `העגלה ריקה`) |
| Checkout | redirect cart | `התשלום לא הושלם` + provider strings in §6.5 |
| Account | see §7.4 | delete dialog; `הפעולה נכשלה.` |
| Orders | `עוד לא ביצעת הזמנות.` | 404 |
| Voucher | no QR + status | `לא ניתן להציג QR כרגע. הקריאו את הקוד לקופאי.` |
| Supplier | `אין מוצרים פעילים לספק הזה כרגע.` | 404 `ספק לא נמצא` |
| Search | `לא נמצאו מוצרים עבור "{q}".` | boundary (not fake zero) |
| 404 | (the page) | `הדף שחיפשתם לא נמצא` |
| 500 | n/a | `משהו השתבש אצלנו` |

---

## 17. Checkout return `/checkout/return` (deepen)

Cardcom land. Alias `/checkout/confirmation` redirects here. Title `אישור הזמנה`. Robots noindex. Requires `order_id`. Missing or `not_found` → 404. `failed` → `/checkout/failed?order_id=`.

### 17.1 Section order

1. **Pending** (Suspense fallback and `status === 'pending'`): H1 `מאמתים את התשלום...` Body `ההזמנה נקלטה ואנחנו ממתינים לאישור הסליקה. העמוד יתעדכן אוטומטית.` AutoRefresh. Do not say they were not charged (EDGE-CASES §1).
2. **Paid:** H1 `התשלום הצליח!` Sub: `הזמנה {ref} · שולם באתר {price}`
3. If vouchers: section `הקופונים שלך` (`aria-label` same). Per voucher: `{name}`, `{code}` LTR, `לתשלום בעסק במימוש: {price}`, `בתוקף עד {date} · הציגו את הקוד או את ה-QR בבית העסק`, QR 264, WhatsApp share via `buildCouponShareText` (includes `{code}` because the **customer** forwards their own coupon, unlike supplier inquiry)
4. Optional cashback line if wallet entry > 0
5. WhatsApp order inquiry

Reads `vouchers`, not fossil `coupon_codes`. Money via generation probe (no 42703 → fake 404 after a charge).

### 17.2 Skeleton

The pending block **is** the skeleton. Same height as success title+sub so the footer does not jump.

### 17.3 Empty / error

No vouchers on a physical-only order: omit the coupons section, keep success. Failed verify: failed route, cart kept.

---

## 18. City `/city/[slug]` (deepen)

Seventeen regions from `REGIONS`. Unknown slug: 404. Title `דילים ב{name}`. Breadcrumb JSON-LD Home → region. H1 `דילים ב{name}`.

Has cities: body `בתי העסק שאנחנו מכירים באזור הזה נמצאים ביישובים הבאים...` links `/products?city={slug}`.

Empty (six regions with no geo municipality): `עדיין אין אצלנו בית עסק רשום באזור הזה. אפשר לראות את כל הדילים באתר...` plus catalogue CTA. This empty is a real answer, not a failed query.

Not yet: branch map, LocalBusiness per branch (queue J3). SEO-CONTENT-PLAN: do not invent thin extra city URLs beyond these seventeen.

---

## 19. Legal, content, offline (deepen)

Store shell. Indexable except offline. Copy is counsel-owned (`docs/legal/`); this file only owns chrome.

Architecture 2026-07 named `/terms`. The app tree has **both** WP-style aliases and `/legal/*`. Footer must use the routes that 200. Do not invent a third slug.

| Route | H1 / title (functional) | Data | Empty | Error |
|---|---|---|---|---|
| `/legal/terms`, `/terms-and-conditions` | תקנון | static MD/TS content + last-updated date | n/a | 500 |
| `/legal/privacy`, `/privacy-policy` | פרטיות | same | n/a | 500 |
| `/legal/returns`, `/refund_returns` | ביטולים והחזרים | must match money model: coupon remainder at business, no escrow, redeemed = done | n/a | 500 |
| `/legal/accessibility`, `/accessibility` | הצהרת נגישות | ISR | n/a | 500 |
| `/about` | about H1 from page | static | n/a | 500 |
| `/contact` | contact + `ContactForm` | form states COPY-HE | n/a | validation |
| `/faq` | FAQ | static | n/a | 500 |
| `/blog` | blog index | posts or empty | empty list Hebrew | 500 |
| `/offline` | `אין חיבור לאינטרנט` | **no fetches** (SW cache). Title `אין חיבור`. CTA is a **link** retry, not a JS button | n/a | this page **is** the error |

Skeleton: none (static). Newsletter still in footer except offline (may be the cached shell).

Legal body must not say escrow or a fixed 10% commission. Checkout terms tick links here in a new tab.

---

## 16. Revision

| Date | Change |
|---|---|
| 2026-09-07 | Initial anatomy for home, category, coupon PDP, physical PDP, cart, checkout, account, orders, voucher/QR, supplier, search, 404, 500 |
| 2026-09-07 | Deepen: `/checkout/return` paid/pending/QR, `/city/[slug]` empty vs city chips |
