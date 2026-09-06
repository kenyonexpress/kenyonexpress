# Storefront component inventory

Every customer-facing UI component: purpose, props, variants, states, RTL, accessibility, and the Electro home-v7 block it maps to. Admin and supplier-portal chrome is out of scope. Tokens live in `docs/ui-design-system/TOKENS.md`.

Status: binding for UI work in this worktree. Docs only. Props are the TypeScript contracts in source, not invented.

Electro home-v7 is layout and structure only. Copy, prices and images come from live `kenyonexpress.co.il`.

---

## 0. How to read a row

States that every interactive control must consider:

| State | Meaning |
|---|---|
| default | Resting paint |
| hover | Pointer over. Live buttons go to `#000000` / `#ffffff` (see TOKENS §1.8) |
| focus-visible | Keyboard focus. 2px ring, offset 2px, never yellow-on-yellow |
| active | Pointer down. Cart checkout measures `#a78e00`. Others UNMEASURED |
| disabled | Not activatable. Only live's `update_cart` is measured (`opacity: 0.65`) |
| loading | In-flight write. Spinner + `aria-busy` or `aria-disabled` |
| error | Validation or server refusal. Red copy, `role="alert"` |
| empty | No data. Hebrew copy, never a blank hole |

A component that is not interactive marks hover/active/disabled as n/a.

Standing project rule: **there is no search UI on the storefront.** `HeaderSearch.tsx` and `SearchBox.tsx` exist in the tree and must not be mounted in the header or the drawer. Pixel cost vs live is accepted and recorded.

---

## 1. Electro home-v7 block map

| Electro block (home-v7 / shop / single) | KenyonExpress component |
|---|---|
| Top bar (info strip) | `layout/Header.tsx` inner `InfoBar` / `InfoItem` |
| Header / masthead | `layout/Header.tsx` (`SiteHeader`) |
| Handheld navbar-toggle | `layout/MobileDrawer.tsx` |
| Departments vertical menu | `home/HeroCategorySidebar.tsx` |
| Home v7 slider (`rs-module`) | `home/HeroSlider.tsx` |
| Home v7 ads / da-blocks | `home/HeroPromoBanners.tsx` |
| Product categories list (5-up strip) | `store/CategoryStrip.tsx` |
| Features / icon-boxes | `home/BenefitBar.tsx` |
| Deals of the day / product grid | `home/DealsOfTheDay.tsx` + `ProductCard` variant `deals` |
| Mini-cart | `cart/MiniCartDropdown.tsx` + `cart/CartDrawer.tsx` |
| Footer widgets + newsletter | `layout/SiteFooter.tsx` + `growth/NewsletterSignup.tsx` |
| Breadcrumbs | `category/CategoryBreadcrumb.tsx` |
| Shop control bar (orderby + view) | `category/CategoryControlBar.tsx` |
| Product loop card | `category/CategoryProductCard.tsx` |
| Pagination | `category/Pagination.tsx` |
| Single product gallery | `storefront/ProductGallery.tsx` |
| Single product summary | `storefront/ProductInfo.tsx` + `CouponPricing` |
| Related products | `storefront/RelatedProducts.tsx` |
| Store location / vendor | `storefront/SupplierInfo.tsx` |
| Cart table | `cart/CartPageView.tsx` + `CartLineItem` |
| Cart totals / proceed | `cart/CartTotalsSidebar.tsx` + `CartCheckoutButton` |
| Checkout (WooCommerce/Electro) | `checkout/CheckoutForm.tsx` + `CheckoutShell` |
| Skip to content | `a11y/SkipLink.tsx` (not an Electro block; WCAG 2.4.1) |
| Cookie bar | `analytics/ConsentBanner.tsx` (not Electro; legal) |

Unused Electro chrome we do **not** reproduce: header search, handheld search form, wishlist in the header, compare, Electro's purple/sky demo palette, mega-menu (`yamm`) boilerplate.

---

## 2. Primitives

### 2.1 SkipLink

- **File:** `src/components/a11y/SkipLink.tsx`
- **Purpose:** First focusable control. Bypasses the repeating header (WCAG 2.4.1 / Israeli 5568).
- **Props:** none.
- **Variants:** one. Visually `sr-only` until focused.
- **States:** default hidden; focus-visible `fixed top-4 right-4 z-100`, white paper, black 2px ring. Other states n/a.
- **RTL:** `right-4` (reading origin). Do not change to `left-4`.
- **A11y:** `<a href="#main-content">דילוג לתוכן הראשי</a>`. Target `#main-content` on `<main>` must have `tabIndex={-1}` or focus stays on the link.
- **Electro:** none.

### 2.2 SmartImage

- **File:** `src/components/ui/SmartImage.tsx`
- **Purpose:** `next/image` with a fallback tile when the src is missing or errors.
- **Props:** `ImageProps` plus `fallbackClassName?: string`, `iconSize?: number`.
- **Variants:** image / fallback glyph.
- **States:** default image; error/empty fallback (`bg-slate-100`); loading is the browser/image placeholder (blur when `blurDataURL` is passed).
- **RTL:** `inset-0` (direction-neutral).
- **A11y:** `alt` is required by Next for non-decorative images. Empty `alt` only when the parent already names the product.
- **Electro:** product thumbnail slot.

### 2.3 Button (shadcn)

- **File:** `src/components/ui/button.tsx`
- **Purpose:** Generic shadcn button. **Not** the storefront CTA family. Storefront purchase controls use CSS classes from TOKENS §1.8, not this primitive.
- **Props:** `ButtonProps`: native button attrs + `variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'`, `size?: 'default' | 'sm' | 'lg' | 'icon'`, `asChild?: boolean`.
- **Variants:** six visual × four sizes.
- **States:** default; hover `bg-primary/90` (yellow wash, **not** live's black); focus-visible ring; disabled `opacity-50 pointer-events-none`; loading n/a (caller adds spinner); error n/a.
- **RTL:** `inline-flex` + `gap-2`, safe. Do not use this for primary storefront CTAs.
- **A11y:** native `<button>` or `Slot`. Must have a name (children or `aria-label`).
- **Electro:** none (shadcn). Map storefront CTAs to Electro's yellow pill instead.

### 2.4 Input, Label, Textarea

- **Files:** `ui/input.tsx`, `ui/label.tsx`, `ui/textarea.tsx`
- **Purpose:** Form controls for account / checkout fallbacks. Checkout itself uses page CSS, not these.
- **Props:** native `input` / `textarea` / Radix Label.
- **States:** default white paper, `border-input`; hover n/a; focus-visible ring; disabled opacity; error via `aria-invalid` + sibling message (Form); empty is the placeholder.
- **RTL:** `text-start`. Email and URL fields: `dir="ltr"` on the control (see NewsletterSignup).
- **A11y:** every input has a `Label` with matching `htmlFor`. Error: `aria-describedby` + `role="alert"` on the message.
- **Electro:** WooCommerce form-row.

### 2.5 Dialog, DropdownMenu, Select

- **Files:** `ui/dialog.tsx`, `ui/dropdown-menu.tsx`, `ui/select.tsx`
- **Purpose:** Radix overlays. Storefront uses custom `RegionMenu` and `MobileDrawer` instead of these for chrome. Dialog appears on account delete and some admin (admin out of scope).
- **States:** closed; open (overlay `z-50`, dim `bg-black/80`); focus trapped; Escape closes; disabled items `data-disabled`.
- **RTL risk:** Dialog close uses physical `right-4`; Select/Dropdown indicators use `left-2` and `pl-8`. New work must switch to logical `end-4` / `ps-8` / `start-2`.
- **A11y:** `role="dialog"` / `menu` / `listbox` from Radix. Focus return to trigger.
- **Electro:** modal / dropdown.

### 2.6 Toaster (Sonner)

- **File:** `ui/sonner.tsx`
- **Purpose:** Transient notices (add-to-cart, refusal, newsletter).
- **Props:** `ToasterProps`.
- **Variants:** success, info, warning, error. Light-theme inks are AA-corrected in `globals.css` (TOKENS §1.7).
- **States:** entering; visible (~4s); exiting. No focus steal.
- **RTL:** toasts inherit `dir="rtl"`.
- **A11y:** `role="status"` (polite). Errors that must be read immediately: use `role="alert"` in-page, not only a toast.
- **Electro:** none.

---

## 3. Shell

### 3.1 SiteHeader / Header

- **File:** `src/components/layout/Header.tsx` (re-export `SiteHeader.tsx`)
- **Purpose:** Sticky masthead on every storefront route: logo, handheld icons, desktop nav, cart, account, region menu, drawer trigger.
- **Props:** none (reads cart via `HeaderCart` / context).
- **Variants:** handheld (`< xl`: 84px row, hamburger + logo + cart/account) vs desktop (`xl+`: 110px masthead + nav). Home-only greeting in the top bar via `body:has([data-home])`.
- **States:** default white, `border-b border-border`, `z-40`. Hover on nav links: brand yellow wash (`bg-brand-accent` / live yellow). Focus-visible on every control. No disabled header. Loading: cart badge may lag until `CartBootstrap`.
- **RTL:** DOM order is side order. Hamburger first = inline-start = visual **right**. Cart last = visual left. Matches live at 380 (hamburger x=319).
- **A11y:** `<header>`. Logo is a link named with the site name. Icon-only cart and account have `aria-label`. Hamburger: `aria-expanded`, `aria-controls`.
- **Electro:** Header + handheld navbar.

### 3.2 InfoBar (top strip)

- **File:** `src/components/layout/InfoBar.tsx` (also inlined as `InfoItem` in Header)
- **Purpose:** Four info items: `התחברות`, `קניה בטוחה`, `משלוח מהיר חינם`, `בפריסה ארצית`. Home adds `ברוך הבא לעולם של קניון Express`.
- **Props:** none.
- **Variants:** 380 home = three wrapped rows (113px); 380 inner pages = two rows (76px); `md+` = one 38px row.
- **States:** default; first item is a link (`/login`) with hover/focus; others are text. Empty n/a.
- **RTL:** items in live's RTL order. Dividers `w-px`, not physical left borders.
- **A11y:** icons `aria-hidden`. Only the login item is a link.
- **Electro:** top bar.

### 3.3 MastheadNav

- **File:** `src/components/layout/MastheadNav.tsx`
- **Purpose:** Desktop primary nav + region trigger + cart/account cluster.
- **Props:** none.
- **States:** default 14px slate icons (`--color-icon`); hover; focus-visible. Current route: optional `aria-current="page"`.
- **RTL:** row runs start to end.
- **A11y:** `<nav aria-label="ראשי">` (or equivalent).
- **Electro:** primary nav.

### 3.4 RegionMenu

- **File:** `src/components/layout/RegionMenu.tsx`
- **Purpose:** `בחר אזור`. Seventeen `/city/<slug>/` links. Live's `secondary-nav` (one item, not a mega-menu).
- **Props:** none. Data from `REGIONS` in `src/lib/regions.ts`.
- **Variants:** closed / open.
- **States:** default trigger; hover opens on hover-capable devices; click / Enter / Space / ArrowDown also open (live is hover-only, we add keyboard); focus-visible on trigger and items; Escape closes and returns focus; click-outside closes; no disabled; empty n/a (static list).
- **RTL:** panel `end-0` (visual left under the trigger in RTL). Chevron does not need mirroring (points down when open).
- **A11y:** `aria-haspopup="menu"`, `aria-expanded`, `role="menu"` / `menuitem`. No focus trap (matches MobileDrawer: items are links, Tab may leave). Width `--spacing-region-menu` 200px, 2px brand-yellow top border.
- **Electro:** secondary-nav dropdown.

### 3.5 MobileDrawer

- **File:** `src/components/layout/MobileDrawer.tsx`
- **Purpose:** Off-canvas category list below `xl`. Eleven rows = `KE_LIVE_CATEGORIES` (same list as the hero sidebar).
- **Props:** none.
- **Variants:** 280px at 380, 350px at 768. Paper `--color-drawer-bg`.
- **States:** closed; open (backdrop `bg-black/50`, `z-50`); hover on rows; focus-visible; Escape closes and refocuses hamburger; body scroll locked while open; no search field (standing rule).
- **RTL:** panel `inset-y-0 right-0` (physical right = inline-start in RTL). Prefer `inset-inline-start-0` in new work. Hamburger not mirrored.
- **A11y:** trigger `aria-expanded`, `aria-controls`, `aria-label` for open. Panel `role="dialog"` or labelled `aria-labelledby` ("תפריט קטגוריות"). Close button named. Close on link click, **not** via `usePathname()` (that opts the whole header into dynamic rendering).
- **Electro:** off-canvas navigation.

### 3.6 SiteFooter / home Footer

- **Files:** `layout/SiteFooter.tsx` (inner pages, `--container-store-footer` 1200px); `home/Footer.tsx` (home, `--container-footer` 1430px). They are different boxes.
- **Purpose:** Newsletter bar, columns, copyright strip `--color-bottom-bar`.
- **Props:** none.
- **States:** default; links hover to brand yellow or white depending on the dark footer; focus-visible; NewsletterSignup owns loading/error/empty for the form.
- **RTL:** columns start from the right. Phone number `dir="ltr"` / `<bdi>`.
- **A11y:** `<footer>`. Social icons have names. Newsletter: see 9.2.
- **Electro:** footer widgets.

### 3.7 WhatsAppFloat

- **File:** `src/components/shared/WhatsAppFloat.tsx`
- **Purpose:** Fixed contact chip.
- **Props:** none (href from env / config).
- **States:** default `--color-whatsapp` fill, white glyph; hover `scale-105`; focus-visible outline `--color-whatsapp`; n/a disabled.
- **RTL:** `end-5` (visual left). **Do not mirror the glyph.**
- **A11y:** `aria-label` Hebrew (e.g. "וואטסאפ"). `z-40`.
- **Electro:** none (third-party mark).

---

## 4. Home

### 4.1 HeroSection

- **File:** `src/components/home/HeroSection.tsx` (shim `store/HomeHeroSection.tsx`)
- **Purpose:** Home v7 row: sidebar + slider + side banners. Height tokens `--spacing-hero-mobile/tablet/desktop` (213 / 495 / 613).
- **Props:** none.
- **Variants:** 380 slider only; 768 slider + category strip; 1440 sidebar + slider + three side banners.
- **States:** loading is the still-frame / first slide (no skeleton hole); error: slider still paints welcome slide from `KE_LIVE` data; empty: filler slides.
- **RTL:** `dir="rtl"`, flex row. Category column is inline-start (visual right).
- **A11y:** slider labelled; pause on `prefers-reduced-motion`.
- **Electro:** home-v7 hero row.

### 4.2 HeroSlider

- **File:** `src/components/home/HeroSlider.tsx`
- **Purpose:** Five-slide Revolution-style slider. Not a static banner.
- **Props:** `{ slides: HeroSlide[] }`. `HeroSlide`: `id`, `variant: 'welcome' | 'product' | 'app'`, titles, tagline, promo lines, `price` (display string from live, not a float), image layout (`offsetTop`, `widthPercent`, `insetPercent`).
- **Variants:** welcome / product / app. Animated WebP only from `min-width: 1024px`; still frames below.
- **States:** default active slide `z-10 opacity-100`; idle slides `opacity-0`; hover on CTA (black, TOKENS §1.8); focus-visible on dots and CTA; auto-advance 5s, paused on reduced motion; loading still frame; empty: do not mount a zero-slide slider.
- **RTL:** slider `dir="rtl"`. Image `insetPercent` is from inline-start (right). Dots: "next" is leftward. Dot hit box padded to 44px around the painted circle.
- **A11y:** `role="region"` / `aria-roledescription="carousel"`. Dots are buttons named by slide. Only the active slide's links are in tab order (`inert` or `pointer-events-none` + `tabIndex={-1}` on idle).
- **Electro:** `rs-module` home-v7 slider.

### 4.3 HeroCategorySidebar

- **File:** `src/components/home/HeroCategorySidebar.tsx` (shim `store/CategorySidebar.tsx`)
- **Purpose:** "מחלקות" column, 241×593 at 1440. Same eleven categories as the drawer.
- **Props:** none (static `KE_LIVE_CATEGORIES`).
- **States:** default; hover yellow; focus-visible; no empty (static).
- **RTL:** list from the top, links `text-start`.
- **A11y:** heading "מחלקות". Each row is a link.
- **Electro:** departments vertical menu.

### 4.4 HeroPromoBanners

- **File:** `src/components/home/HeroPromoBanners.tsx` (shim `store/PromoBanners.tsx`)
- **Purpose:** Three stacked da-blocks, 201.36×197, 1440 only.
- **Props:** none (live stills).
- **States:** default; hover on "קנה עכשיו"; focus-visible; empty: hide the column rather than invent banners.
- **RTL:** text `items-end` (inline-start).
- **A11y:** each banner is a link. Image alt from live copy.
- **Electro:** home-v7 ads.

### 4.5 CategoryStrip

- **File:** `src/components/store/CategoryStrip.tsx`
- **Purpose:** Five category tiles under the slider at 768 and 1440. Absent at 380. Shares the slider's x and width (727.89×170), not a right-offset strip.
- **Props:** none.
- **States:** default; hover; focus-visible; empty: do not paint a second full-width copy below `lg` (that was a scored defect).
- **RTL:** 5-up row, start = right.
- **A11y:** list of links. Labels 14px / 600 / `--color-heading`.
- **Electro:** product-categories-list.

### 4.6 BenefitBar (feature / USP)

- **File:** `src/components/home/BenefitBar.tsx`
- **Purpose:** Five icon+label items. 31px empty strip at 380 (items not rendered). 134px from `md`.
- **Props:** none.
- **States:** static. Below 374px, if ever shown, items stack (globals.css). No hover affordance required.
- **RTL:** `border-e` between items, not `border-l`. Icons are objects: do not mirror truck, shield, pin.
- **A11y:** list. Icons `aria-hidden`; text is the name.
- **Electro:** features / icon-boxes.

### 4.7 DealsOfTheDay

- **File:** `src/components/home/DealsOfTheDay.tsx`
- **Purpose:** Home product grid. Live: 1 / 2 / 4 columns at 380 / 768 / 1440. Gap to feature bar 3px.
- **Props:** none (server; `KE_LIVE_DEALS` / catalogue query).
- **States:** default grid; loading: reserved height via card tokens (avoid CLS); empty: Hebrew empty copy (see PAGE-ANATOMY); error: same empty, do not crash the home page.
- **RTL:** grid, no physical offsets.
- **A11y:** section heading. Grid is a list of cards.
- **Electro:** deals of the day.

### 4.8 ProductCard (deals)

- **File:** `src/components/ProductCard.tsx`
- **Purpose:** Home-grid card. DOM order is **category, price, title, image+badge, footer price + ATC**. Not image-title-price.
- **Props:** `{ product: Product; variant?: 'default' | 'deals' }`. `Product`: `id`, `slug`, `name_he`, `kenyon_price`, `images`, `stock_quantity`, `full_price?`, `category?`.
- **Variants:** `deals` (home, `--color-deal-*`) vs `default` (legacy). Prefer `deals` on home.
- **States:** default; hover lift `--shadow-card-hover` if used; focus-visible on title link and ATC; ATC loading spinner; ATC disabled when `stock_quantity === 0`; empty image: fallback tile; error on add: toast, card stays.
- **RTL:** prices in `<bdi>` or `dir="ltr"` amount. Title is a link (`--color-link`). Badge over the thumb `z-raised`.
- **A11y:** article or `li`. ATC icon variant: `aria-label={`הוסף ${name} לעגלה`}`. Discount badge is extra, not the only price.
- **Electro:** product-loop card (home grid).
- **Money:** display via integer path. Card currently formats shekel numbers for live glyph parity; the cart still bills agorot.

---

## 5. Catalog (category, products listing)

### 5.1 CategoryBreadcrumb

- **File:** `src/components/category/CategoryBreadcrumb.tsx`
- **Purpose:** Home > category trail.
- **Props:** `{ items: Crumb[] }`. `defaultHomeCrumb()` for the first node.
- **States:** default; hover on links; current page is text, not a link (`aria-current="page"`); empty: at least Home.
- **RTL:** trail reads right to left. Separators **do** mirror (or use `/` which is neutral).
- **A11y:** `<nav aria-label="פירורי לחם">` + `ol`.
- **Electro:** woocommerce breadcrumb.

### 5.2 CategoryControlBar

- **File:** `src/components/category/CategoryControlBar.tsx`
- **Purpose:** View switcher (visual only, `aria-hidden`) on inline-start; sort `<select>` on inline-end.
- **Props:** `{ value: SortValue }`.
- **Variants:** sort values from `SORT_OPTIONS` (`CategorySort.tsx`): live `orderby` mapping.
- **States:** default bar `#efefef`; select hover/focus; loading `useTransition` while the router replaces; disabled n/a; empty n/a.
- **RTL:** switcher at inline-start (right). Select native, LTR value / Hebrew labels.
- **A11y:** real control is the `<select>` labelled "מיון". View switcher is scenery (live's four icons, first "active", no behaviour).
- **Electro:** shop control bar.

### 5.3 CategoryFilterSidebar

- **File:** `src/components/category/CategoryFilterSidebar.tsx`
- **Purpose:** Category list + optional price filter.
- **Props:** `{ categories: SidebarCategory[]; currentSlug?: string; priceMin?: number; priceMax?: number }`.
- **States:** default; current slug indicated; hover/focus on links; empty categories: hide the block; error: do not zero the grid.
- **RTL:** `text-start`. Price inputs `dir="ltr"` + `tabular-nums`.
- **A11y:** current link `aria-current="page"`. Price fields labelled.
- **Electro:** shop sidebar.

### 5.4 CategoryProductCard

- **File:** `src/components/category/CategoryProductCard.tsx`
- **Purpose:** Archive card, 234px at 1440, live loop anatomy (price above title above thumb).
- **Props:** `{ product: CategoryProduct }` (`id`, `slug`, `name_he`, `kenyon_price`, `full_price?`, `images`, `stock_quantity?`, `categories?`, `supplier?`, `distanceKm?`).
- **States:** default; hover; focus-visible; ATC loading; ATC disabled when stock 0; empty image fallback; distance line only when `distanceKm` is set ("לידי" sort).
- **RTL:** pin icon not mirrored. Distance number LTR.
- **A11y:** same as ProductCard. Optional `MapPin` is decorative beside the city text.
- **Electro:** product-loop card (shop).

### 5.5 CategoryGridSkeleton

- **File:** `src/components/category/CategoryGridSkeleton.tsx`
- **Purpose:** Streaming fallback with live card geometry so the footer does not jump.
- **Props:** `{ count?: number }` default 8.
- **States:** loading only (`aria-busy="true"`).
- **RTL:** same grid as the real list.
- **A11y:** `aria-label="טוען מוצרים"`. No focusable ghosts.
- **Electro:** product loop, unpainted.

### 5.6 Pagination

- **File:** `src/components/category/Pagination.tsx`
- **Purpose:** Compact window: first, last, current ±1, gaps.
- **Props:** `{ pathname, params, currentPage, totalPages }`.
- **States:** default; current page is not a link; hover/focus on others; disabled prev on page 1 / next on last (`aria-disabled` + no href, or omit); empty: hide when `totalPages <= 1`.
- **RTL:** prev chevron points to inline-start (right); next to inline-end (left). Implemented in `Chevron`.
- **A11y:** `<nav aria-label="עמודים">`. Current `aria-current="page"`.
- **Electro:** woocommerce pagination.

---

## 6. Product page

### 6.1 ProductGallery

- **File:** `src/components/storefront/ProductGallery.tsx`
- **Purpose:** 470px main frame + thumbnail row. Electro single-product gallery.
- **Props:** `{ images: string[]; name: string; assets?: Record<string, GalleryAsset>; price?: number | null; oldPrice?: number | null }`. `GalleryAsset`: `alt`, `blurDataURL`. Price args are **the same unit as each other** (ratio only).
- **Variants:** with / without discount badge (`-N%` only when `oldPrice > price`).
- **States:** default; thumb hover; thumb selected (`aria-pressed` or `aria-current`); focus-visible on thumbs; empty: `pdp-gallery__frame--empty` (📦); loading blur.
- **RTL:** thumbs row start = right. Badge over the image, do not mirror `%`.
- **A11y:** main image `alt` from asset or `name`. Thumbs named. Empty frame is not a button.
- **Electro:** single product images.

### 6.2 ProductInfo

- **File:** `src/components/storefront/ProductInfo.tsx`
- **Purpose:** Summary column: eyebrow, H1, rating slot, prices, variants, qty, ATC, buy-now, share.
- **Props:** `productId`, `name`, `nameEn`, `basePrice`, `oldPrice`, `baseStock`, `scarcitySlot?: ReactNode`, `sku`, `categoryName`, `city`, `attributes`, `variants`, `isCoupon`, `couponOffer`, `recurringOffer?`.
- **Variants:** coupon (`CouponPricing` + coupon ATC) vs physical (full price + buy-now `#c94b28`) vs recurring (describeRecurringPrice).
- **States:** default; variant selected; qty default 1, ceiling `productQuantityCeiling`; ATC hover black / loading spinner / disabled when unsellable; buy-now same; error toast from cart; empty variants: hide the picker.
- **RTL:** qty is a plain number input (live has no +/- stepper). `dir="ltr"` on the value. Share icons: WhatsApp/Facebook **not** mirrored.
- **A11y:** H1 is the product name. Qty labelled "כמות". ATC named. Variant radios/select labelled. City via `CityTag`.
- **Electro:** `div.summary.entry-summary`.

### 6.3 CouponPricing

- **File:** `src/components/storefront/CouponPricing.tsx`
- **Purpose:** Coupon price block. Live wording `מחיר רגיל` / `מחיר בקניון`. Split table (`לתשלום באתר עכשיו` / `יתרה לתשלום בבית העסק`) is a **deliberate** divergence: consumer-protection copy for the no-escrow model.
- **Props:** `{ offer: CouponOffer }` (`sellable`, `reason`, `fullPriceIls`, `paidOnlineIls`, `balanceAtBusinessIls`, `discountPercent`).
- **Variants:** sellable vs expired vs not priced.
- **States:** default; error/empty: "המבצע הסתיים" or "הקופון אינו זמין לרכישה"; hover n/a.
- **RTL:** amounts `tabular-nums` + `dir="ltr"` or `<bdi>`. Percent badge `N%-` (Hebrew minus after the number is the live glyph order: isolate the run).
- **A11y:** `<dl>` for the split. Error is visible text, not colour alone.
- **Electro:** price on single product (coupon template).

### 6.4 StockScarcity

- **File:** `src/components/storefront/StockScarcity.tsx`
- **Purpose:** "נותרו X" streamed in its own Suspense boundary so the cached PDP stays cacheable.
- **Props:** `{ productId, trackedLevel, isCoupon, ... }` (live stock reader).
- **States:** default message; empty/untracked: **render nothing**; loading: boundary fallback empty or a short pulse (must not shift the buy row).
- **RTL:** numeral LTR inside Hebrew sentence (`<bdi>`).
- **A11y:** live region optional (`aria-live="polite"`). Not a button.
- **Electro:** stock HTML.

### 6.5 SupplierInfo

- **File:** `src/components/storefront/SupplierInfo.tsx`
- **Purpose:** Mandatory address / Waze / phone / WhatsApp on every product type. Missing fields omit the row (most live suppliers have no address).
- **Props:** `{ supplier: SupplierSummary; productType: 'coupon' | 'physical' | 'service' | 'recurring'; productName?: string | null; whatsappEnabled?: boolean }` default WhatsApp false.
- **Variants:** fulfilment note per `productType` (`FULFILMENT_NOTE`).
- **States:** default; empty supplier: hide the block or show name-less note, never "כתובת:" with a blank; hover on tel/Waze/WhatsApp links.
- **RTL:** pin / phone / nav icons are objects, not mirrored. Phone `<bdi dir="ltr">`. WhatsApp mark not mirrored, not recoloured with brand yellow.
- **A11y:** heading with supplier name. Links named (Waze, חייג, וואטסאפ).
- **Electro:** store location / vendor.

### 6.6 ShippingInfo

- **File:** `src/components/storefront/ShippingInfo.tsx`
- **Purpose:** Shipping / pickup copy on physical products.
- **Props:** product/shipping fields as declared in file (static Electro tabs vs live text).
- **States:** default; empty: omit.
- **RTL:** `text-start`.
- **A11y:** heading + body.
- **Electro:** shipping tab.

### 6.7 RelatedProducts

- **File:** `src/components/storefront/RelatedProducts.tsx`
- **Purpose:** Related / upsell carousel. Live currently often holds **one** card; we hold several. `compare.mjs` refuses this page for that catalogue mismatch. Do not cut to one card to chase the number.
- **Props:** `{ categoryId, excludeId }` (async server).
- **States:** default; empty: omit the section (no heading without cards); loading skeleton of card geometry.
- **RTL:** carousel prev/next **do** mirror.
- **A11y:** section heading. Carousel buttons named.
- **Electro:** related products.

### 6.8 WishlistButton

- **File:** `src/components/product/WishlistButton.tsx`
- **Purpose:** Heart. Client-only so the cached PDP is not per-session.
- **Props:** `{ productId: string }`.
- **Variants:** saved / unsaved.
- **States:** default unsaved; loading `useTransition`; error message "הפעולה נכשלה."; hover/focus; disabled while pending.
- **RTL:** heart is an object, not mirrored.
- **A11y:** toggle `aria-pressed`. Name "הוסף למועדפים" / "הסר ממועדפים".
- **Electro:** wishlist on summary (live position).

### 6.9 Reviews / ReviewForm / ReviewFormGate

- **Files:** `product/Reviews.tsx`, `ReviewForm.tsx`, `ReviewFormGate.tsx`
- **Purpose:** Approved reviews (cacheable) + per-session form behind a gate.
- **Props:** Reviews `{ productId }`. Form: rating + body.
- **States:** empty: gate only, no heading; default list; form default / focus / disabled submit / error / success; loading gate after paint.
- **RTL:** stars are not directional. `dir="auto"` on the review body if user text can be Latin.
- **A11y:** `aria-labelledby="reviews-heading"`. Rating `aria-label={`${n} מתוך 5`}`. `time dateTime`.
- **Electro:** woocommerce reviews.

### 6.10 Share buttons

- **Files:** `shared/WhatsAppShareButton.tsx`, `FacebookShareButton.tsx`
- **Purpose:** Share the product URL with a Hebrew message from `buildShareMessage`.
- **Props:** url + text (see files).
- **States:** default; hover; focus-visible; n/a disabled.
- **RTL:** marks not mirrored, not recoloured with `--color-brand-*`.
- **A11y:** named buttons. `rel="noopener noreferrer"` on the popup/link.
- **Electro:** share icons on summary.

---

## 7. Cart

### 7.1 AddToCartButton

- **File:** `src/components/cart/AddToCartButton.tsx`
- **Purpose:** Writes a line through `useCart().addToCart`. Fires analytics only if the server **accepted**.
- **Props:** `{ productId, productName, variantId?: string | null, quantity?: number, disabled?: boolean, className?: string, priceAgorot?: number | null, variant?: 'button' | 'icon', children? }`.
- **Variants:** `button` (full CTA) vs `icon` (deals/category card).
- **States:** default; hover (parent CSS, live black); focus-visible; active (parent); disabled (`disabled || busy || isPending`); loading `LoaderCircle` + `aria-busy`; error: toast from cart store, button re-enables; empty n/a.
- **RTL:** icon ATC is an object glyph, not mirrored.
- **A11y:** icon variant **requires** `aria-label={`הוסף ${productName} לעגלה`}`. Button variant uses children as the name (`הוספה לעגלה` / live equivalent).
- **Electro:** `add_to_cart_button` / card ATC / `single_add_to_cart_button`.

### 7.2 HeaderCart / CartNavLink

- **Files:** `cart/HeaderCart.tsx`, `cart/CartNavLink.tsx`
- **Purpose:** Masthead cart icon + count badge (`#fed700`, 10–12px slate ink).
- **Props:** none (context).
- **States:** default 0 hides or shows `0` per live; hover; focus-visible; `aria-expanded` when mini-cart open.
- **RTL:** badge position logical (`end` of the icon). Digits LTR.
- **A11y:** `aria-label` including count, e.g. "עגלה, 2 פריטים".
- **Electro:** navbar mini-cart toggle.

### 7.3 MiniCartDropdown + CartDrawer

- **Files:** `cart/MiniCartDropdown.tsx`, `cart/CartDrawer.tsx`
- **Purpose:** One feature, two widths: dropdown beside the icon, full-height sheet on handheld. Shared `drawerOpen` flag. CSS picks visibility.
- **Props:** none.
- **States:** closed; open (`z-50` / inner `z-60`); empty: empty copy + link to shop; line hover; remove pending; checkout disabled when a line is unavailable (see CartCheckoutButton); Escape / overlay click closes.
- **RTL:** sheet from inline-end or live's physical side; keep consistent with the header icon (visual left). Trash not mirrored. Prices `shekels(agorot)`.
- **A11y:** `role="dialog"` labelled "עגלה". Focus the panel on open, return to the icon on close. Overlay click closes.
- **Electro:** mini-cart.

### 7.4 CartPageView

- **File:** `src/components/cart/CartPageView.tsx`
- **Purpose:** Full cart route: lines, coupon form, totals, checkout CTA. H1 ~40px / 500.
- **Props:** `{ initialCart, isAuthenticated }`.
- **States:** default with lines; empty: `CartEmptyState`; loading: initialCart then client sync; error toasts; coupon error inline.
- **RTL:** table/grid with logical padding. Qty steppers: minus/plus are not directional arrows of the page, they are operators; do not mirror.
- **A11y:** H1 "עגלה". Each line grouped. Totals `dl` or table.
- **Electro:** cart page.

### 7.5 CartLineItem + CartEmptyState

- **File:** `src/components/cart/CartLineItem.tsx` (`CartEmptyState` exported from the same file)
- **Purpose:** One row: thumb, name, unit price, qty, line total, remove. Warning when unavailable.
- **Props:** `{ item: CartViewItem }`.
- **States:** default; qty ± (ceiling `lineQuantityCeiling`, floor 1); pending `isPending`; disabled + at ceiling; error warning `unavailableMessage`; empty page: `CartEmptyState` Hebrew CTA to catalogue (not `/search`).
- **RTL:** `Minus`/`Plus` not mirrored. `Trash2` not mirrored. Price `dir="ltr"`.
- **A11y:** qty buttons named "הגדל כמות" / "הקטן כמות". Remove "הסר". Warning `role="status"` or `alert` if it blocks checkout.
- **Electro:** cart table row / empty cart.

### 7.6 CartTotalsSidebar

- **File:** `src/components/cart/CartTotalsSidebar.tsx`
- **Purpose:** Subtotal, discounts, total. All agorot via `shekels()`.
- **Props:** `{ cart: CartView }`.
- **States:** default; empty cart: zeros or hide; error n/a (parent).
- **RTL:** labels start, amounts end, amounts LTR.
- **A11y:** `dl`. Total named "סה״כ".
- **Electro:** cart collaterals.

### 7.7 CartCheckoutButton

- **File:** `src/components/cart/CartCheckoutButton.tsx`
- **Purpose:** Link to `/checkout`. Guests allowed (login happens on pay).
- **Props:** `{ isAuthenticated, disabled?, className?, onNavigate? }`.
- **States:** default yellow slate-ink pill (TOKENS family 2); hover black; active `#a78e00`; **disabled is enforced in the click handler**, not only CSS: `aria-disabled` + `preventDefault` so Enter on a focused link cannot proceed with an unavailable line; loading n/a.
- **RTL:** full-width on handheld.
- **A11y:** if disabled, `aria-disabled="true"` and excluded from being a working link. Name "המשך לתשלום" (or live checkout label).
- **Electro:** `.checkout-button`.

### 7.8 CartCouponForm

- **File:** `src/components/cart/CartCouponForm.tsx`
- **Purpose:** Promo-code field on the cart (platform coupon, not a voucher product).
- **Props:** as declared (code submit action).
- **States:** default; focus; loading; error "קוד לא תקין"; success applied line in totals; empty field: submit no-op or validation.
- **RTL:** code `dir="ltr"` `font-mono`.
- **A11y:** labelled field. Error `role="alert"`.
- **Electro:** cart coupon form. Live often has **no** `apply_coupon` control (UNMEASURED in TOKEN-PROVENANCE); this is ours.

---

## 8. Checkout

### 8.1 CheckoutShell

- **File:** `src/app/(store)/checkout/CheckoutShell.tsx`
- **Purpose:** Suspense fallback at the **height of the real form** (CLS). Reserves guest notice, stepper, columns.
- **Props:** none.
- **States:** loading only. `aria-hidden` scenery, **not** focusable.
- **RTL:** same classes as the real page (`checkout-page.css`), including 560 / 992 breakpoints.
- **A11y:** no tab stops. Real form replaces it.
- **Electro:** checkout layout, unpainted.

### 8.2 CheckoutForm

- **File:** `src/app/(store)/checkout/CheckoutForm.tsx`
- **Purpose:** Multi-step Electro checkout: identity, address (if `needsAddress`), payment, place order. Cardcom iframe / redirect. Wallet clamp. Saved cards.
- **Props:** `{ cart, clientRef, needsAddress, address: CheckoutAddressPrefill, walletBalance, savedCards?, isAuthenticated, resuming?, channel?: 'web' | 'app' }`.
- **Variants:** guest vs authenticated; physical (address) vs coupon-only (may skip address); web vs app return URL; resume-from-Google (`sessionStorage` `ke.checkout.resume`).
- **States:**
  - default step (`data-state` current / done / upcoming)
  - hover / focus-visible on fields and nav
  - active place-order (TOKENS family 3, 50px radius, 19.418px / 700)
  - disabled next until `validateStep` passes
  - loading `useActionState` on submit
  - error `StepErrors` per field + `classifyCheckoutFailure` banner (`role="alert"`)
  - empty cart: bounce to `/cart` (do not render an empty pay button)
- **RTL:** stepper arrows mirror. Labels `text-start`. Phone, email, zip, card last4: `dir="ltr"` / `<bdi>`. Place-order full width.
- **A11y:** `ol.checkout-steps` with `aria-current="step"`. Fields associated labels. Pay button name live-equivalent (`הזמנה` / "לתשלום"). Iframe title for Cardcom. Do not trap focus inside a failed iframe without an escape.
- **Electro:** checkout / `#place_order`.

---

## 9. Account, voucher, supplier public

### 9.1 Account shell

- **File:** `src/app/(account)/layout.tsx` plus pages under `account/`
- **Purpose:** Orders, vouchers, details, security, wishlist, referrals, wallet, addresses, subscriptions.
- **Props:** per page (server).
- **States:** default lists; empty Hebrew per PAGE-ANATOMY; error banners; loading tables.
- **RTL:** full. Order ids `dir="ltr"`.
- **A11y:** nav `aria-current`. Destructive actions (`DeleteAccountSection`) use a dialog + typed confirm.
- **Electro:** my-account (WooCommerce), structure only.

### 9.2 WalletButtons (voucher / QR page)

- **File:** `src/components/coupon/WalletButtons.tsx`
- **Purpose:** Apple Wallet / Google Wallet links. Render **nothing** if not presentable or if credentials are missing (no disabled fake button).
- **Props:** `{ voucher: WalletVoucher; presentable: boolean }`.
- **States:** default links; empty/null: `null`; no loading client bundle (server component).
- **RTL:** platform marks not mirrored.
- **A11y:** named links. This screen is opened with a cashier waiting: keep it server-rendered.
- **Electro:** none (wallet is ours). QR itself is page-level, not a shared card component: isolate the payload, do not mirror the QR.

### 9.3 GiftClaimForm

- **File:** `src/components/gifts/GiftClaimForm.tsx`
- **Purpose:** Deliberate POST claim of a gift token. Must not run on GET (mail scanners).
- **Props:** `{ token: string }` (path credential, never painted).
- **Variants:** one button.
- **States:** default `קבלת הקופון לחשבון שלי` on `#fed700` / heading ink; hover `bg-brand-primary-hover`; focus-visible 2px; active UNMEASURED; disabled + opacity 0.6 while pending; loading label `מעביר את הקופון...`; error: server Hebrew string in red `<p>` (no `role="alert"` yet; gap); empty n/a; success: navigate `/account/coupons`.
- **RTL:** button inherits page RTL. Token not shown.
- **A11y:** `type="button"`; disabled while `useTransition`. Add `aria-busy` and `role="alert"` on error in a later UI pass. Do not auto-submit.
- **Electro:** none.

### 9.3b RedeemConfirm

- **File:** `src/app/redeem/[token]/RedeemConfirm.tsx` (route-local, not shared)
- **Purpose:** Show remainder `{price}` then irreversible `redeem_voucher` with one idempotency key per mount.
- **Props:** token, code, `codeDisplay`, status, names, `faceValue`/`paidOnline`/`toCollect` already formatted through `shekels(agorot())`, `{date}` labels, `expired` boolean.
- **States:** ready (`אשר מימוש`); working (`מאשר...`, button disabled); done (button gone, `סריקה נוספת`); already closed: start at done with used/expired copy; network: message + return to ready **same key**; server: `output aria-live="polite"`.
- **RTL:** `dir="rtl"` page, code `dir="ltr"` mono.
- **A11y:** remainder is the primary number. Confirm min height ~44px. Do not treat HMAC as single-use in the UI.
- **Electro:** none.
- **Copy split:** `/scan` uses `אשר וממש`. This screen uses `אשר מימוש`.

### 9.4 SupplierLeadForm / ContactForm

- **Files:** `storefront/SupplierLeadForm.tsx`, `storefront/ContactForm.tsx`
- **Purpose:** Public join / contact.
- **States:** default; hover/focus; loading; error; success toast or inline.
- **RTL:** `text-start`. Email/phone LTR.
- **A11y:** labels, required indicated in Hebrew (not colour alone).
- **Electro:** contact form.

### 9.5 NewsletterSignup

- **File:** `src/components/growth/NewsletterSignup.tsx`
- **Purpose:** Footer double-opt-in. Consent is the submit act, **not** a pre-ticked checkbox.
- **Props:** `{ source?: string }` default `'footer'`.
- **States:** default; pending `useActionState`; error from `NewsletterState`; success; empty invalid email: native `required`.
- **RTL:** form `dir="rtl"`, email field `dir="ltr"`. Pill radii `--radius-pill-start/end`.
- **A11y:** `label` "הצטרפו לרשימת הדיוור". Button "הרשמה". Error `role="alert"`.
- **Electro:** footer newsletter.

---

## 10. Consent and analytics chrome

### 10.1 ConsentBanner

- **File:** `src/components/analytics/ConsentBanner.tsx`
- **Purpose:** Equal-weight Accept / Decline. Ships in HTML. Hidden at first paint via `html[data-consent="decided"]`.
- **Props:** none. Font Arial on purpose (LCP).
- **States:** undecided visible `z-50` + body padding reservation (TOKENS); decided `display: none`; hover on both buttons; focus-visible; no loading (form POST).
- **RTL:** `insetInline: 0`. Buttons in a row, decline not visually weaker.
- **A11y:** `aria-label="הסכמה לאיסוף נתוני שימוש"`. Both submits min-height 44px. Decline "לא תודה", accept "אישור" with `text-heading` on `bg-brand-primary`.
- **Electro:** none.

### 10.2 PWA InstallPrompt

- **File:** `src/components/pwa/InstallPrompt.tsx`
- **Purpose:** Optional install chip. `z-40`.
- **States:** hidden / shown; dismiss; focus-visible.
- **RTL:** `end-4` on `sm+`.
- **A11y:** named; dismiss named.
- **Electro:** none.

---

## 11. Search (must not mount in chrome)

| File | Status |
|---|---|
| `search/HeaderSearch.tsx` | Present. Standing rule: do not put in header or drawer |
| `search/SearchBox.tsx` | Present. `/search` route may use a page-level form; header must not |
| `search/DeferredHeaderSearch.tsx` | Deferred mount helper; still subject to the standing rule |

If `/search` exists as a route, PAGE-ANATOMY describes it. Do not reintroduce a 534px masthead field to chase live pixels.

---

## 11.1 Checkout success coupon card (deepen)

- **File:** inline in `src/app/(store)/checkout/return/page.tsx` (not a shared component yet)
- **Purpose:** After pay, show each issued voucher with code, remainder `{price}`, `{date}`, QR 264px, WhatsApp share of **this customer's** coupon (code allowed here).
- **Props:** voucher row + `qrDataUrl` + `collect_amount_agorot` as `Agorot`.
- **States:** default paid; pending is a different page state (H1 `מאמתים את התשלום...`); empty list: omit section; QR error: still show code (same rule as `/coupon/[id]`).
- **RTL:** code `dir="ltr"`. QR not mirrored. Share glyph not mirrored.
- **A11y:** section `aria-label="הקופונים שלך"`. Images alt from product name + code.
- **Electro:** none (ours). Must not read `coupon_codes`.
- **Money:** `shekels(agorot(...))` only. Generation probe on `orders` so a missing column cannot 404 a charged customer (EDGE-CASES).

---

## 12. State × token cheat sheet (purchase controls)

| Control | Default | Hover | Active | Disabled | Loading |
|---|---|---|---|---|---|
| PDP ATC 380 | slate `#333e48` / white, radius 6, full width | black / white | UNMEASURED | UNMEASURED (use `disabled` + 0.65 only if we paint it) | spinner, keep size 52.98px |
| PDP ATC 768+ | `#fed700` / `#333e48` (not live white), radius 25.2, 192px | black / white | UNMEASURED | UNMEASURED | spinner |
| Buy now | `#c94b28` / white | `#b8401f` | UNMEASURED | UNMEASURED | spinner |
| Cart checkout | `#fed700` / `#333e48`, radius ~22, 47.52px | black / white | `#a78e00` | `preventDefault` + `aria-disabled` | n/a (navigation) |
| Place order | `#fed700` / `#333e48`, radius 50, 64.28px, 19.418/700 | black / white | UNMEASURED | until step valid | `aria-busy` |
| Card ATC icon | transparent / `#333e48`, 37.14×33.88, radius 22 | black / white | UNMEASURED | stock 0 | `LoaderCircle` 16px |
| Consent accept | `#fed700` / `#333e48` | opacity 0.9 | n/a | n/a | n/a |
| Consent decline | border / muted ink | `bg-black/4` | n/a | n/a | n/a |

Focus-visible for all of the above: 2px solid `#333e48` (or white on dark fills), offset 2px.

---

## 13. Revision

| Date | Change |
|---|---|
| 2026-09-07 | Initial inventory of storefront components with props, states, RTL, a11y, and Electro home-v7 mapping |
| 2026-09-07 | Deepen: checkout return voucher card (reads `vouchers`, generation probe) |
| 2026-09-07 | Deepen: GiftClaimForm real states; RedeemConfirm remainder + idempotency |
