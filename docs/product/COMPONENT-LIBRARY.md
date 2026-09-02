# Component library

Status: DRAFT · docs only (do not edit `src/components` from this file)  
Scope: shadcn/ui primitives in `src/components/ui/` plus custom storefront, cart, account, supplier, admin, and chrome.  
RTL: `document.documentElement.dir = rtl`. Prefer logical properties (`inline-start` / `end`). Price strings `dir="ltr"`.

Money in props is **agorot integer** (or a formatted string from `formatIls` / `formatAgorot`). Do not format with `toFixed` on a float in UI.

## Token sheet (storefront)

From `docs/design/DESIGN-AUDIT.md` / `@theme` in globals:

| Token | Value | Use |
|---|---|---|
| `--color-brand-primary` | `#fed700` | CTA, search btn, cart badge, newsletter, hero dots |
| `--color-brand-primary-hover` | `#fedd26` | button hover |
| `--color-brand-dark` | `#1a1a1a` | ink on yellow |
| `--color-brand-accent` | `#eaf4f6` | hero wash |
| `--color-price` | `#dc3545` / `#E4002B` | current price (project) |
| `--color-price-strike` | `#6f6f6f` | `del` |
| `--color-link` | `#0062bd` | product title |
| `--color-heading` | `#333e48` | headings, live dark |
| `--color-sale-badge` | `#328614` / live `#44b81b` | onsale |
| `--color-success` | `#5cb85c` | in-stock / success |
| `--color-surface` | `#ffffff` | cards, header |
| `--color-footer-bg` | `#333e48` | footer |
| `--header-height` | `70px` | desktop compromise; **380 uses 49px handheld**, live masthead ~110px |
| `--container-page` | `1320px` | storefront width |
| `--cart-touch` | `44px` | qty, checkout, drawer rows (`mini-cart.css`) |
| `--spacing-header-topbar` | `37.3px` | top bar |
| `--spacing-header-masthead` | `109px` | live-like masthead |

shadcn maps `primary` to the same yellow in admin/forms. Storefront often uses dedicated CSS (`product-card-deals.css`, `cart-page.css`, `checkout-page.css`) instead of `Button variant="default"`.

Planned (not in `ui/` yet): `Badge` (onsale), `Tabs` (featured products already custom), `Sheet` (drawers are custom), `Skeleton` (category grid has a dedicated skeleton), `Pagination` (custom).

---

## A. shadcn / `src/components/ui`

### Button (`button.tsx`)

| | |
|---|---|
| Props | `ButtonHTMLAttributes` + `variant` + `size` + `asChild?: boolean` (Radix `Slot`) |
| variant | `default` `destructive` `outline` `secondary` `ghost` `link` |
| size | `default` (h-10) `sm` (h-9) `lg` (h-11) `icon` (h-10 w-10) |
| States | hover (`/90` on default), `focus-visible` ring, `disabled` opacity-50 pointer-events-none |
| RTL | icon+label `gap-2`; with `asChild` on `Link` keep Hebrew label. Storefront ATC should stay yellow brand, not necessarily this `primary` if tokens diverge |
| Tokens | `bg-primary` → brand yellow; `destructive` for admin delete |

### Card (`card.tsx`)

Exports: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.

| | |
|---|---|
| Props | `HTMLDivElement` attributes |
| Variants | none (rounded-lg border shadow-sm) |
| States | default only; hover is call-site |
| RTL | header `flex-col`; footer `items-center` (logical start in RTL) |
| Use | admin stats, not Woo loop cards (`ProductCard` / `CategoryProductCard`) |

### Dialog (`dialog.tsx`)

Radix Dialog. Exports: `Dialog`, `Trigger`, `Portal`, `Close`, `Overlay`, `Content`, `Header`, `Footer`, `Title`, `Description`.

| | |
|---|---|
| Props | Radix; `Content` `className` |
| States | open/closed animate; overlay `bg-black/80` |
| RTL | **Close is `absolute right-4 top-4` (physical right).** In RTL the close control should sit at inline-end or start consistently with Hebrew; treat as known debt. Header `sm:text-left` is LTR leftover; override `text-start` |
| Tokens | `bg-background`, ring |

### DropdownMenu (`dropdown-menu.tsx`)

Radix menu. `SubTrigger` `inset?: boolean` adds `pl-8` (physical padding start in LTR). `ChevronRight` on submenus points LTR.

| RTL | Prefer `ps-8` and `ChevronLeft` in RTL, or `dir` on content. Mini-cart is **not** this component (`MiniCartDropdown` / `CartDrawer`) |

### Form (`form.tsx`)

react-hook-form `FormProvider`. `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`.

| States | error: `FormMessage` from `fieldState.error` |
| RTL | labels `text-start`; keep `dir="ltr"` on money, slug, SKU inputs |

### Input (`input.tsx`)

Native `input` props (`type`, `disabled`, …). Height h-10, rounded-md, focus ring.

| RTL | default inherits `dir=rtl`; set `dir="ltr"` for email, card-unrelated ids, prices typed as ₪, slug |
| States | disabled, file: prefix, placeholder muted |

### Label (`label.tsx`)

Radix Label. `peer-disabled` opacity. No extra variants.

### Select (`select.tsx`)

Radix Select. `Select`, `Group`, `Value`, `Trigger`, `Content` (`position`: `popper` default), `Item`, `Label`, `Separator`, scroll buttons.

| States | placeholder muted, disabled, open animations |
| RTL | chevron on inline-end; popper translations are physical `translate-x`. Check icon on items: keep start of row in RTL |

### Textarea (`textarea.tsx`)

`min-h-[80px]`. Same ring/disabled as Input. Hebrew descriptions in admin `ProductForm` often use a raw `<textarea>` instead; both must stay RTL.

### Sonner (`sonner.tsx`)

`Toaster` wraps `sonner`. Theme from `next-themes`. Icons: success, info, warning, error, loading.

| States | toast / description / action / cancel classNames |
| RTL | toaster should inherit `dir` from `html`; action buttons on inline-end |
| Use | admin save, cart errors; not a replacement for checkout failure page |

### SmartImage (`SmartImage.tsx`)

`next/image` + fallback.

| Props | `ImageProps` + `fallbackClassName?` (default `absolute inset-0`) + `iconSize?` (32) |
| States | loading (next), **error/missing** → gray `bg-slate-100` + lucide `ImageIcon`; `alt` becomes `aria-label` on fallback |
| RTL | decorative fallback `aria-hidden` if no alt |
| Planned | AVIF/WebP via loader; never picsum |

---

## B. Layout / chrome

| Component | Props (main) | Variants / states | RTL / tokens |
|---|---|---|---|
| `layout/SiteHeader.tsx` | none / children chrome | 380: 49px handheld hamburger+logo+cart; desktop masthead | START hamburger; END cart. `--header-height` vs 49px |
| `layout/Header.tsx` | (legacy/alternate header) | same IA | do not show WP 300×79 logo at 380 |
| `layout/MastheadNav.tsx` | category links | `בקרוב` disabled | first item START; ₪ in `dir=ltr` |
| `layout/InfoBar.tsx` | top trust/login strip | desktop ~38px; mobile into drawer | live copy from `KE_LIVE_SPEC` |
| `layout/SiteFooter.tsx` | legal + account links | newsletter 80px yellow | contact column START |
| `home/Footer.tsx` | storefront footer variant | widgets / copyright | `--container-footer` |
| `Header.tsx` (root) | cart+account icons | badge count | `--color-brand-primary` badge |
| `CopyrightYear.tsx` | none | current year | |
| `LeftSidebar.tsx` | departments | home only desktop | first column START (~241px live) |
| `shared/WhatsAppFloat.tsx` | none | hidden on some legal? | bottom **inline-end**; 972524635550 |
| `shared/WhatsAppIcon.tsx` / `FacebookIcon.tsx` | size | | decorative |
| `shared/WhatsAppShareButton.tsx` / `FacebookShareButton.tsx` | url, title | | share text Hebrew; OG is 1200×630 from coupon **on-site** price |
| `shared/GoogleLogo.tsx` | | login button | LTR mark |
| `pwa/InstallPrompt.tsx` | | hidden if installed / iOS rules | Hebrew; no fake “app store” |
| `pwa/ServiceWorkerRegistrar.tsx` | | | no cache of `/cart` `/checkout` `/account` `/redeem` |
| `analytics/ConsentBanner.tsx` | | accepted / rejected / unset | RTL banner; no tags before consent |
| `analytics/AnalyticsProvider.tsx` / `ViewTracker.tsx` / `ThirdPartyTags.tsx` | event names | | no PII; `page_view` |
| `growth/NewsletterSignup.tsx` | | success / error | 30א; yellow bar |
| `legal/LegalDocumentView.tsx` | title, html/md | | `dir=rtl`, Heebo |
| `geo/CityTag.tsx` / `CityTags.tsx` | slug, name_he | `/city/*` | 17 regions |
| `search/SearchBox.tsx` / `HeaderSearch.tsx` / `DeferredHeaderSearch.tsx` | query | empty / results / zero | project: search **not** in header (override); drawer or page |
| `store/DeferredStoreChrome.tsx` | | below-fold | |

**Do not revive** invented trust copy (“הזולים בארץ”, “99%”) on a second benefit bar. Live five titles: לכל חלקי הארץ, קניה חכמה, שירות לקוחות, מחירים מנצחים, מותגי יוקרה מובילים. Component: `home/BenefitBar.tsx`.

---

## C. Home / category / product

| Component | Props | Variants / states | RTL / tokens |
|---|---|---|---|
| `home/HeroSlider.tsx` `HeroSection.tsx` `HeroExact.tsx` `CmsHero.tsx` `store/HeroSlider.tsx` `HomeHeroSection.tsx` | slides CMS | 5 slides live; dots; reduced motion | dots `--color-brand-primary`; stack at 380 |
| `home/HeroPromoBanners.tsx` `store/PromoBanners.tsx` | 3 minis | hover | END column on 1440; stack 380 |
| `home/HeroCategorySidebar.tsx` `store/CategorySidebar.tsx` `store/CategoryNav.tsx` | departments | hover row; בקרוב | START column |
| `home/CategoryStrip` via `store/CategoryStrip.tsx` | cats | 5-up desktop; scroll 380 | |
| `home/FeaturedProducts.tsx` `FeaturedProductsTabs.tsx` `DealsOfTheDay.tsx` `store/DealsSection.tsx` `CategoryProductSection.tsx` | products[] | tabs / empty | 3-col desktop home, 2-col 380 |
| `ProductCard.tsx` `CouponCard.tsx` `category/CategoryProductCard.tsx` | `Product` (id, slug, name_he, kenyon_price, images, stock, full_price, category) | default, sale (del+ins), out of stock, hover shadow | title START; sale badge **inline-end** of image; price `dir=ltr`; ATC icon |
| `CouponCardSkeleton.tsx` `CategoryGridSkeleton.tsx` | count | loading | same grid |
| `category/CategoryBreadcrumb.tsx` | crumbs | home hidden | בית at START |
| `category/CategoryControlBar.tsx` `CategorySort.tsx` `CategoryFilterSidebar.tsx` `Pagination.tsx` | sort, page, filters | sheet on 380 | 44px hits |
| `storefront/ProductGallery.tsx` | images, alt | main + thumbs; missing → SmartImage | thumbs row |
| `storefront/ProductInfo.tsx` | product | coupon vs physical | |
| `storefront/CouponPricing.tsx` | `offer: CouponOffer` | sellable / expired / unavailable | `--color-price`; split table is **intentional** vs live WP |
| `storefront/SupplierInfo.tsx` | name, phone, address, hours | missing fields hidden not invented | |
| `storefront/ShippingInfo.tsx` | physical only | | no QR copy |
| `storefront/StockScarcity.tsx` | qty | **do not fake “נשארו 2”** | hide if unknown |
| `storefront/RelatedProducts.tsx` | list | 2-col 380 | |
| `storefront/ContactForm.tsx` `SupplierLeadForm.tsx` | | submitting / error / done | |
| `storefront/BlogPostHeader.tsx` | title, date | | |
| `coupon/WalletButtons.tsx` | `voucher`, `presentable` | Apple and/or Google links **or render nothing** if no certs | hide if spent; API 404 not 500 |
| `gifts/GiftClaimForm.tsx` | code | | |

---

## D. Cart / checkout

| Component | Props | Variants / states | RTL / tokens |
|---|---|---|---|
| `cart/CartProvider.tsx` `CartBootstrap.tsx` | children | hydration | |
| `cart/AddToCartButton.tsx` | productId, productName, variantId?, quantity?, disabled?, priceAgorot?, variant `button` \| `icon` | loading spinner, disabled, refusal | yellow ATC; `priceAgorot` integer for ads |
| `cart/HeaderCart.tsx` `CartNavLink.tsx` | count | 0 / n | badge 21px live-like |
| `cart/MiniCartDropdown.tsx` `CartDrawer.tsx` | open | empty / lines / blocked | drawer inline-end; `--cart-touch` |
| `cart/CartPageView.tsx` `CartLineItem.tsx` | line | coupon vs physical copy; qty; remove | steppers 44px; amounts ltr |
| `cart/CartTotalsSidebar.tsx` | charged on site, balances | | never call remaining “due now” |
| `cart/CartCouponForm.tsx` | code | invalid / applied | site coupon ≠ product voucher |
| `cart/CartCheckoutButton.tsx` | | disabled if unavailable line | full-width 380 |

Checkout pages are route-level (`checkout/return`, `failed`) more than shared UI. Success: no voucher code until `paid_at`.

---

## E. Account

| Component | Props | States | RTL / money |
|---|---|---|---|
| `account/AccountNav.tsx` | `walletBalanceAgorot: Agorot` | active route; wallet badge | `formatIls` only |
| `account/ProfileDetailsForm.tsx` | profile | validation | |
| `account/AddressManager.tsx` | addresses | empty / default | physical later |
| `account/TokenManager.tsx` | cards/tokens | | no PAN |
| `account/SubscriptionList.tsx` | subs | **planned/gated** until `135_recurring_subscriptions` | 14ח cancel |
| `account/ReferralShareCard.tsx` | code | | |

Wallet page itself is a route, not a primitive: balance + ledger + “אין משיכה”.

---

## F. Supplier

| Component | Props | States | Notes |
|---|---|---|---|
| `supplier/SupplierNav.tsx` | | scan / reports / staff | RTL nav |
| `ScanClient` (app, not `components/`) | `supplierName` | `input` `confirm` `result`; camera vs manual; error | confirm = lookup no write; redeem idempotent; balance due largest type |

---

## G. Admin

| Component | Props | Variants / states | RTL |
|---|---|---|---|
| `admin/AdminSidebar.tsx` | role | uploader vs admin sections | |
| `admin/CommandPalette.tsx` | | open / empty | |
| `admin/StatusBadge.tsx` | `label`, `variant`: green yellow red gray blue | product: draft/active/paused/archived | Hebrew labels |
| `admin/StatsCard.tsx` | title, value, hint | | agorot → ₪ display |
| `admin/FilterBar.tsx` `TablePagination.tsx` `DataTable.tsx` `ServerDataTable.tsx` | columns, rows | loading / empty | |
| `admin/ProductForm.tsx` | product, categories, suppliers | coupon / physical / recurring; draft→active gated | money fields `dir=ltr`; `platform_percent` required |
| `admin/ImageUploader.tsx` | max 8, 8MB | progress / reject type | Hebrew alt |
| `admin/SupplierForm.tsx` `VendorForm.tsx` | | readiness gaps | |
| `admin/CategoryForm.tsx` `CategoryDialog.tsx` `CategoryTree.tsx` `CategoriesTable.tsx` | | | |
| `admin/CouponForm.tsx` `CouponDealForm.tsx` `CouponsTable.tsx` `DiscountCampaignForm.tsx` | site campaigns | schedule | not product voucher |
| `admin/UsersTable.tsx` `ProductsTable.tsx` | | | |
| `admin/DeleteButton.tsx` | confirm | destructive | no silent delete of paid orders |
| `admin/AuditDiff.tsx` | before/after | | |
| `admin/ReferralQueueRow.tsx` | row | approve / reject | |
| `admin/reports/SalesChart.tsx` `analytics/FunnelBars.tsx` `BarSeries.tsx` | series from KPI views | empty | Asia/Jerusalem days; agorot |

---

## H. Planned (not shadcnized yet)

| Name | Why | Notes |
|---|---|---|
| `SaleBadge` | onsale on cards | token `--color-sale-badge`; inline-end |
| `Price` | one formatter | agorot in, `dir=ltr` ₪ out |
| `Sheet` | replace ad-hoc drawers | side = inline-start/end |
| `Tabs` | featured products | keyboard |
| `Alert` | checkout/scan errors | not toast-only for money |
| `Stepper` | qty | `--cart-touch` |
| `EmptyState` | cart / category / wallet | Hebrew + CTA |
| `VoucherCode` | 10-char + QR | never email `data:` URI QR as only copy |
| `KpiStat` | admin weekly | `paid_at IS NOT NULL` |

---

## I. Hard rules for new components

1. No em dash in Hebrew UI copy. No “הכי זול בארץ”.
2. Coupon vs physical copy never on the same card.
3. Dialog/dropdown physical `left`/`right`/`pl-` is debt; fix with logical props when touching the file.
4. Do not add shadcn `Table` for storefront cart; cart CSS is measured against live refs.
5. Visual gate: home compare `< 11%` (`scripts/compare.mjs --page=home`).
