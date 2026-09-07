# Component Inventory

Read-only scan of `src/components`. Every `.tsx` component is listed, grouped by subdirectory.

Judgements are based on the actual file contents (with `file:line` references where useful). The token system lives in `src/app/globals.css` `@theme` (brand `#fed700`, heading `#333e48`, etc.). Any hardcoded hex or arbitrary Tailwind value (`[#...]` or `[NNpx]`) counts as NOT token compliant. The app renders `dir="rtl"`, so physical direction utilities (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `border-l`, `border-r`) are RTL risks; logical / symmetric utilities are safe.

## Summary

- ~~Total component files: 72 `.tsx`~~ **Stale as of pass 15. Recounted: `138` `.tsx` excluding tests (148 including them).** The six one-line re-export shims (`admin/CouponForm`, `layout/SiteHeader`, `store/CategorySidebar`, `store/HeroSlider`, `store/HomeHeroSection`, `store/PromoBanners`) are unchanged. **25 components are not listed anywhere below**; see "Pass 15".
- ~~NOT token compliant (hardcoded hex or arbitrary values): 33 components.~~ **Stale as of pass 13. Recounted: zero raw hex, 24 components with arbitrary sizes. See "Pass 13" below.**
- ~~RTL risky: 7 components (`CouponCard`, `admin/CouponDealForm`, `admin/ProductForm`, `home/BenefitBar`, `ui/dialog`, `ui/dropdown-menu`, `ui/select`).~~ **Re-verified in pass 21: 9 hits, of which 7 are unexplained. `CouponCard` and `home/BenefitBar` are now CLEAN; four components were missing from the list.** See "Pass 21".
- ~~`src/components/features/` and `src/components/shared/` contain only `.gitkeep`.~~ **Half stale as of pass 15.** `features/` is still only `.gitkeep`. **`shared/` now holds six components**: `FacebookIcon`, `FacebookShareButton`, `GoogleLogo`, `WhatsAppFloat`, `WhatsAppIcon`, `WhatsAppShareButton`.
- Note: many "NOT compliant" cases mix valid tokens (`bg-brand`, `text-[#333e48]`-equivalent heading) with the raw hex of that same token, so the fix is usually swapping `[#fed700]` for `brand-primary`, `[#333e48]` for `heading`, etc.

## src/components/ui

| Component | File | Props (key props / type) | Used in (where imported) | Tokens compliant? | RTL safe? |
|---|---|---|---|---|---|
| SmartImage | src/components/ui/SmartImage.tsx | `ImageProps & { fallbackClassName?, iconSize? }` | home/HeroPromoBanners, home/HeroSlider, layout/SiteFooter (+4) | YES (`bg-slate-100`, `text-slate-400`) | YES (`inset-0`) |
| Button | src/components/ui/button.tsx | `ButtonProps` (button attrs + `variant`, `size`, `asChild?`) | unused | YES (`bg-primary`, `text-primary-foreground`) | YES |
| Card (+Header/Title/Content/Footer/Description) | src/components/ui/card.tsx | `React.HTMLAttributes<HTMLDivElement>` | admin/StatsCard | YES (`bg-card`, `text-card-foreground`) | YES |
| Dialog (Radix wrappers) | src/components/ui/dialog.tsx | Radix Dialog primitives (`className`, children) | admin/CategoriesTable | YES (`bg-background`, `bg-accent`) | RISK: `right-4` close button (:47), `sm:text-left` (:57); `left-[50%]` is centering (safe) |
| DropdownMenu (Radix wrappers) | src/components/ui/dropdown-menu.tsx | Radix DropdownMenu primitives (`inset?` on some) | unused | YES (`bg-popover`, `bg-accent`) | RISK: `pl-8`/`pr-2` (:100,:123), absolute `left-2` indicators (:106,:128), `ml-auto` (:37,:165) |
| Form (react-hook-form wrappers) | src/components/ui/form.tsx | `ControllerProps`, HTML attrs | unused | YES (`text-destructive`, `text-muted-foreground`) | YES |
| Input | src/components/ui/input.tsx | `React.ComponentProps<'input'>` | admin/DataTable | YES (`border-input`, `bg-background`) | YES |
| Label | src/components/ui/label.tsx | Radix Label props + variants | ui/form | YES (semantic text utils) | YES |
| Select (Radix wrappers) | src/components/ui/select.tsx | Radix Select primitives | unused | YES (`bg-popover`, `border-input`) | RISK: `pl-8`/`pr-2` (:101,:114), absolute `left-2` indicators (:119) |
| Toaster | src/components/ui/sonner.tsx | `ToasterProps` (`ComponentProps<typeof Sonner>`) | app/(main)/layout, app/(store)/layout | YES (`group-[.toaster]:bg-background`) | YES |
| Textarea | src/components/ui/textarea.tsx | `React.ComponentProps<'textarea'>` | unused | NO (`min-h-[80px]` :10) | YES |

## src/components (root, not in a listed subdir but part of the tree)

| Component | File | Props (key props / type) | Used in (where imported) | Tokens compliant? | RTL safe? |
|---|---|---|---|---|---|
| CouponCard | src/components/CouponCard.tsx | `{ coupon: Coupon }` | app/(main)/coupons/page | NO (`text-[11px]` :61; rest uses `bg-brand`/gray utils) | RISK: absolute `right-2` badge (:40) |
| Header | src/components/Header.tsx | `{ fullName: string \| null }` | unused | YES (`bg-brand`, `bg-white`) | YES (`max-w-2xl mx-auto`) |
| LeftSidebar | src/components/LeftSidebar.tsx | (no props) | app/(main)/layout | NO (inline styles `#fff5f5` :7, `#f5f5ff` :14, `#f0f7ff` :21, `#FF6B00` :45) | YES |
| ProductCard | src/components/ProductCard.tsx | `{ product: Product; variant?: 'default' \| 'deals' }` | home/DealsOfTheDay, storefront/RelatedProducts, home/FeaturedProducts (+3) | NO (default variant: `text-[#768b9e]`/`text-[#333e48]` :138, `text-[#0062bd]` :146, `text-[#c93636]`/`text-[#2d2d2d]` :177-178, `text-[12px/14px/16px/22px]`) | YES (deals variant uses CSS classes; default uses flex/gap) |
| RightSidebar | src/components/RightSidebar.tsx | (no props) | app/(main)/layout | YES (`bg-brand-secondary`, gray utils) | YES |
| SiteFooter | src/components/SiteFooter.tsx | (no props) | app/(main)/layout | YES (`bg-gray-900`, `bg-brand`) | YES |

## src/components/admin

| Component | File | Props (key props / type) | Used in (where imported) | Tokens compliant? | RTL safe? |
|---|---|---|---|---|---|
| AdminSidebar | src/components/admin/AdminSidebar.tsx | (no props) | app/(admin)/layout | NO (`bg-[#333e48]`, `text-[#fed700]`, `[#000000]`, `[#FFFFFF]` :34-60) | YES |
| CategoriesTable | src/components/admin/CategoriesTable.tsx | `{ rows, categories, parentOptions, editingCategory?, showNewForm? }` | app/(admin)/admin/categories/page | NO (`text-[#000000]` :63,:111, `hover:bg-[#fedd26]` :118, `[#FFFFFF]` :137) | YES |
| CategoryDialog | src/components/admin/CategoryDialog.tsx | `{ open, onClose, category?, parentOptions }` | admin/CategoryTree | NO (`hover:bg-[#fedd26]` :229) | YES (`dir="rtl"` set; `right-1/2 ... translate-x-1/2` :78 is centering) |
| CategoryForm | src/components/admin/CategoryForm.tsx | `{ category?, parentOptions }` | categories/new, categories/[id], admin/CategoriesTable | NO (`hover:bg-[#fedd26]` :155) | YES |
| CategoryTree (+CategoryNode) | src/components/admin/CategoryTree.tsx | `{ categories }` (node: `{ node, allFlat, depth, onEdit, onAddChild }`) | unused | NO (`hover:bg-[#fedd26]` :204) | YES |
| CouponDealForm (+CouponPreviewCard) | src/components/admin/CouponDealForm.tsx | `{ deal?, vendors }` | coupons/new, coupons/[id] | NO (`hover:bg-[#fedd26]` :276) | RISK: absolute `right-2` badge in preview card (:336) |
| CouponForm | src/components/admin/CouponForm.tsx | re-export of CouponDealForm | coupons/page | N/A (shim) | N/A |
| CouponsTable | src/components/admin/CouponsTable.tsx | `{ deals }` | coupons/page | NO (`text-[#000000]` :33,:93) | YES |
| DataTable | src/components/admin/DataTable.tsx | `DataTableProps<T> { data, columns, rowKey, searchKeys?, searchPlaceholder?, emptyMessage?, toolbar? }` | ProductsTable, CategoriesTable, CouponsTable (+UsersTable) | NO (`[#FFFFFF]`/`[#000000]`/`[#fed700]` :94,:101,:111,:135) | YES |
| DeleteButton | src/components/admin/DeleteButton.tsx | `{ label?, onConfirm }` | CategoriesTable, ProductsTable, CouponsTable | YES (`text-red-600`, gray utils) | YES |
| ImageUploader | src/components/admin/ImageUploader.tsx | `{ bucket, folder, value, onChange, maxFiles? }` | VendorForm, ProductForm, CouponDealForm (+2) | YES (gray utils) | YES |
| ProductForm | src/components/admin/ProductForm.tsx | `{ product?, variants?, categories }` | products/new, products/[id]/edit | NO (`hover:bg-[#fedd26]` :422) | RISK: `text-right` on table header row (:330) |
| ProductsTable | src/components/admin/ProductsTable.tsx | `{ products }` | products/page | NO (`text-[#000000]` :35,:88) | YES |
| StatsCard | src/components/admin/StatsCard.tsx | `{ label, value, icon, className?, trend?, variant? }` | admin/dashboard/page | NO (`text-[#333e48]` :28,:41,:47, `bg-[#fed700]/30` :38) | YES |
| StatusBadge (+status helpers) | src/components/admin/StatusBadge.tsx | `{ label, variant, className? }` | suppliers/orders pages, ProductsTable, CategoryTree (+3) | YES (`bg-green-100`, `bg-yellow-100`, etc) | YES |
| UsersTable | src/components/admin/UsersTable.tsx | `{ users, callerRole }` | users/page | NO (`bg-[#fed700]`/`text-[#000000]` role badge :20) | YES |
| VendorForm (+Field) | src/components/admin/VendorForm.tsx | `{ vendor? }` | suppliers/new, suppliers/[id] | NO (`hover:bg-[#fedd26]` :171) | YES |

## src/components/cart

| Component | File | Props (key props / type) | Used in (where imported) | Tokens compliant? | RTL safe? |
|---|---|---|---|---|---|
| AddToCartButton | src/components/cart/AddToCartButton.tsx | `{ productId, productName, variantId?, quantity?, disabled?, className?, variant?, children? }` | ProductCard, category/CategoryProductCard | YES (styling passed via className; internals use tokens) | YES |
| CartCheckoutButton | src/components/cart/CartCheckoutButton.tsx | `{ isAuthenticated, disabled? }` | CartPageView | YES | YES |
| CartDrawer (+DrawerLineItem) | src/components/cart/CartDrawer.tsx | (no props; reads `useCart`) | app/(main)/layout, app/(store)/layout | NO (`border-[#ccc]` :133) | YES |
| CartLineItem (+CartEmptyState) | src/components/cart/CartLineItem.tsx | `{ item: CartViewItem }` | CartPageView | YES | YES |
| CartNavLink | src/components/cart/CartNavLink.tsx | (no props) | layout/MastheadNav | NO (`text-[#515151]` :6, `text-[10px]` :30) | YES |
| CartPageView | src/components/cart/CartPageView.tsx | `{ initialCart, isAuthenticated }` | app/(store)/cart/page | YES | YES |
| CartProvider (+useCart/useCartStoreApi) | src/components/cart/CartProvider.tsx | `{ children, initialCart }` | layouts, ProductInfo, CartPageView (+4) | N/A (context provider, no visual markup) | N/A |
| CartTotalsSidebar | src/components/cart/CartTotalsSidebar.tsx | `{ cart: CartView }` | CartPageView | YES | YES |

## src/components/category

| Component | File | Props (key props / type) | Used in (where imported) | Tokens compliant? | RTL safe? |
|---|---|---|---|---|---|
| CategoryBreadcrumb (+defaultHomeCrumb) | src/components/category/CategoryBreadcrumb.tsx | `{ items: Crumb[] }` | (store)/products, (store)/category/[slug] | YES (uses `category-breadcrumb` CSS class) | YES |
| CategoryControlBar (+ViewSwitcher) | src/components/category/CategoryControlBar.tsx | `{ value: SortValue }` | (store)/products, (store)/category/[slug] | YES (`CATEGORY_TOKENS` from category-tokens) | YES (comment: inline-start / inline-end) |
| CategoryFilterSidebar | src/components/category/CategoryFilterSidebar.tsx | `{ categories, currentSlug?, priceMin?, priceMax? }` | (store)/products, (store)/category/[slug] | YES | YES |
| CategoryProductCard | src/components/category/CategoryProductCard.tsx | `{ product: CategoryProduct }` | (store)/products, (store)/category/[slug] | YES (uses CSS classes) | YES |
| CategorySort | src/components/category/CategorySort.tsx | `{ value: SortValue }` (+`SORT_OPTIONS`) | unused | YES | YES |
| Pagination (+Chevron) | src/components/category/Pagination.tsx | `{ pathname, params, currentPage, totalPages }` | (store)/products, (store)/category/[slug] | YES | YES |

## src/components/home

| Component | File | Props (key props / type) | Used in (where imported) | Tokens compliant? | RTL safe? |
|---|---|---|---|---|---|
| BenefitBar | src/components/home/BenefitBar.tsx | (no props) | (store)/page | NO (`text-[#fed700]` :23, `text-[#333e48]` :25, `text-[#7e7e7e]` :28, `border-[#ddd]`, `max-w-[1170px]`, `text-[15px/13px]`) | RISK: `border-l` dividers + `last:border-l-0` (:21) |
| DealsOfTheDay | src/components/home/DealsOfTheDay.tsx | (no props; async, `KE_LIVE_DEALS`) | (store)/page | NO (`max-w-[1150px]` `pt-[30px]` :11, layout px) | YES |
| FeaturedProducts | src/components/home/FeaturedProducts.tsx | (no props; async server, DB) | unused | YES (delegates markup to FeaturedProductsTabs) | YES |
| FeaturedProductsTabs | src/components/home/FeaturedProductsTabs.tsx | `{ products: Product[] }` | home/FeaturedProducts | NO (`border-[#ededed]` :33, `text-[#333e48]` :34,:44,:45, `text-[#fed700]` :44, `text-[#7e7e7e]` :45,:63, `text-[22px]`) | YES |
| Footer | src/components/home/Footer.tsx | (no props; +Instagram/Facebook icons) | unused | NO (`bg-[#333e48]` :50, `text-[#fed700]` :62,:67,:85,:100, `max-w-[1430px]`, `text-[13px/14px/16px/20px]`) | YES |
| HeroCategorySidebar | src/components/home/HeroCategorySidebar.tsx | (no props) | home/HeroSection, home/HeroExact, store/CategorySidebar | NO (`bg-[#f5f5f5]` :56) | YES |
| HeroExact | src/components/home/HeroExact.tsx | (no props) | unused | YES (`max-w-page`, gray utils) | YES (`dir="rtl"`, `flex-row`) |
| HeroPromoBanners (+BannerText/ShopNowButton) | src/components/home/HeroPromoBanners.tsx | (no props) | home/HeroExact, home/HeroSection, store/PromoBanners | NO (`text-[11px]` :72, `h-[80px]` :116, layout px) | YES |
| HeroSection | src/components/home/HeroSection.tsx | (no props) | (store)/page, store/HomeHeroSection | YES (`max-w-page`, gray utils) | YES (`dir="rtl"`, `flex-row`) |
| HeroSlider (+slide subcomponents) | src/components/home/HeroSlider.tsx | `{ slides: HeroSlide[] }` | home/HeroExact, home/HeroSection, store/HeroSlider (+3 libs) | NO (`text-[#fed700]` :39 and many arbitrary px sizes :102-259) | YES (`left-1/2 -translate-x-1/2` :329 is symmetric centering) |

## src/components/layout

| Component | File | Props (key props / type) | Used in (where imported) | Tokens compliant? | RTL safe? |
|---|---|---|---|---|---|
| SiteHeader (default export named SiteHeader) | src/components/layout/Header.tsx | (no props) | app/(main)/layout | NO (`border-[#ddd]` :14,:23,:28,:33,:45, `text-[#333e48]` :15, layout px) | YES |
| InfoBar | src/components/layout/InfoBar.tsx | (no props) | unused | NO (`text-[11px]` :51) | YES |
| MastheadNav | src/components/layout/MastheadNav.tsx | (no props) | layout/Header | NO (`#515151` :5) | YES |
| SiteFooter (+SocialGlyph) | src/components/layout/SiteFooter.tsx | (no props) | app/(store)/layout | NO (`#fed700` :9,:74, `#333e48` :11, `#eaeaea` :12,:218, `[#ddd]` :200, layout px) | YES |
| SiteHeader (shim) | src/components/layout/SiteHeader.tsx | re-export of ./Header | app/(store)/layout | N/A (shim) | N/A |

## src/components/store

| Component | File | Props (key props / type) | Used in (where imported) | Tokens compliant? | RTL safe? |
|---|---|---|---|---|---|
| CategoryNav | src/components/store/CategoryNav.tsx | (no props) | unused | YES (no hardcoded values) | YES |
| CategoryProductSection | src/components/store/CategoryProductSection.tsx | `{ title, categoryHref, products }` | unused | NO (`text-[22px]` :17) | YES |
| CategorySidebar | src/components/store/CategorySidebar.tsx | re-export of home/HeroCategorySidebar | unused | N/A (shim) | N/A |
| CategoryStrip | src/components/store/CategoryStrip.tsx | (no props) | (store)/page | NO (`border-[#e7e7e7]` :52, `text-[#333e48]` :74, `w-[517px]`/`w-[728px]`/`w-[100px]`, `text-[16px]`) | YES |
| DealsSection | src/components/store/DealsSection.tsx | `{ products: Product[] }` | unused | NO (`text-[22px]` :34, `border-[#ddd]` :55) | YES |
| HeroSlider (shim) | src/components/store/HeroSlider.tsx | re-export of home/HeroSlider (+type) | unused | N/A (shim) | N/A |
| HomeHeroSection (shim) | src/components/store/HomeHeroSection.tsx | re-export of home/HeroSection | unused | N/A (shim) | N/A |
| PromoBanners (shim) | src/components/store/PromoBanners.tsx | re-export of home/HeroPromoBanners | unused | N/A (shim) | N/A |

## src/components/storefront

| Component | File | Props (key props / type) | Used in (where imported) | Tokens compliant? | RTL safe? |
|---|---|---|---|---|---|
| ProductGallery | src/components/storefront/ProductGallery.tsx | `{ images: string[], name }` | (store)/product/[slug] | YES | YES |
| ProductInfo | src/components/storefront/ProductInfo.tsx | `{ productId, name, nameEn, basePrice, oldPrice, baseStock, sku, description, attributes, variants, isCoupon }` | (store)/product/[slug] | YES | YES |
| RelatedProducts | src/components/storefront/RelatedProducts.tsx | `{ categoryId, excludeId }` (async server) | (store)/product/[slug] | YES | YES |

## src/components/features and src/components/shared

Both contain only a `.gitkeep` file. No components.

---

## Pass 8: account siblings (wallet, coupons, wishlist)

The tables above are a source scan. This section is the binding UI contract for the three remaining account routes. Props are the server-page contracts, not invented. Tokens: `docs/DESIGN-SYSTEM.md` §8. Anatomy: `docs/ui-design-system/PAGE-ANATOMY.md` §7.6. Copy: `docs/ERROR-COPY.md` and `docs/COPY-HE.md`.

States every interactive control must consider: default, hover, focus-visible, active, disabled, loading, error, empty.

### AccountCouponsPage

- **File:** `src/app/(account)/account/coupons/page.tsx`
- **Purpose:** List this session's vouchers. No QR in the list (cashier screen is `/coupon/[id]`).
- **Props:** none (server). Data from `getMyVouchers()` scoped to `auth.uid()`.
- **Variants:** presentable (`issued`, clock not past `expires_at`) vs closed (redeemed / expired / cancelled / refunded).
- **States:**
  - default: rows with `{name}`, `{code}` LTR, remainder `{price}`, status chip
  - hover: row surface `#f5f5f5`; CTA `#fedd26` if yellow, else black if it is a purchase-family button (this CTA is yellow-to-yellow)
  - focus-visible: 2px `#333e48`
  - active: UNMEASURED
  - disabled: n/a on the list; a missing voucher 404s on the detail route
  - loading: four `account-row` pulses, `aria-label="טוען את האזור האישי"`
  - error: account banner, then 500 copy
  - empty: `עדיין לא רכשת קופונים.`
- **RTL:** full. Code and UUID `dir="ltr"`. Back arrow on the detail page stays the character `←` (it is a back control).
- **A11y:** H1 `הקופונים שלי`. Status not by colour alone. Presentable CTA name `הצגת הקופון ו-QR`. Closed CTA `פרטי הקופון`. Do not put a live QR in a list that can be screenshotted in a shared session.
- **RLS:** `vouchers` SELECT own. Another person's UUID looks like missing.
- **Electro:** none. Redirects `/account/vouchers` and `/account/my-vouchers` must not render a second component.

### AccountWalletPage

- **File:** `src/app/(account)/account/wallet/page.tsx`
- **Purpose:** Show internal credit and an append-only ledger. No withdrawal control.
- **Props:** none (server). Balance from `wallet_accounts` / view; rows from `v_wallet_ledger` (security invoker, `auth.uid()`).
- **Variants:** zero balance vs positive. Guest never reaches this page (account layout).
- **States:**
  - default: H1 `הארנק שלי`, `היתרה שלך` `{price}` in heading ink (not price red)
  - hover: order link `#0062bd`
  - focus-visible: 2px
  - active: n/a
  - disabled: n/a (no spend button here; spend is checkout clamp)
  - loading: 88px wallet pulse
  - error: do not invent `₪0` on a query fail. Banner + retry
  - empty ledger: `עדיין אין תנועות בארנק.` (balance may still be 0 and that is not empty-error)
- **RTL:** amounts `dir="ltr"` / `<bdi>`. Columns logical. Credit `+{price}`, debit `-{price}` with minus before shekel.
- **A11y:** table headers `תאריך` `פעולה` `סכום` `הזמנה`. Note `קרדיט לשימוש באתר בלבד. לא ניתן למשיכה.` is visible text, not title-only.
- **RLS:** owner SELECT on `wallet_accounts` / `wallet_entries`. Client INSERT/UPDATE/DELETE denied (draft 168: ledger client-read-only). Writes only via `fn_wallet_transfer` as `service_role`.
- **Electro:** none.
- **Forbidden:** `platform_percent`, PAN, treating credit as cash-out.

### AccountWishlistPage

- **File:** `src/app/(account)/account/wishlist/page.tsx`
- **Purpose:** Saved catalogue products. Not money. Checkout re-resolves agorot.
- **Props:** none (server for auth). Guest list is `localStorage` key `ke_wishlist` if a guest route still exists; canonical customer URL is this account page.
- **Variants:** auth list vs guest (if still mounted). Header heart is **not** a variant: it must not mount (standing rule vs live YITH).
- **States:**
  - default: grid 2 / 3 / 5 at 380 / 768 / 1440
  - hover: card shadow Electro (`0px 4px 16px rgba(0, 0, 0, 0.12)`) only if the archive card lifts; live cards are mostly flat
  - focus-visible: heart and product link
  - active: UNMEASURED
  - disabled: product no longer active is pruned on read, not shown grey
  - loading: `CategoryGridSkeleton`
  - error: toast `הפעולה נכשלה.` on toggle fail; page fail uses account banner
  - empty: `עוד לא שמרת מוצרים. לחיצה על הלב בעמוד מוצר שומרת אותו כאן.` CTA `לכל המוצרים` → `/products`
- **RTL:** heart is an object glyph, do not mirror. Price `<bdi>`.
- **A11y:** H1 `רשימת המשאלות שלי`. Add/remove names `הוסף למועדפים` / `הסר ממועדפים`. Cap 100: Hebrew refusal, not silent drop.
- **RLS:** `wishlists` / `wishlist_items` own rows. No public share URL in v1.
- **Electro:** YITH wishlist page structure only. Do not restore header compare or header heart to chase live pixels.
- **Money:** integer agorot formatter. Do not copy `toLocaleString` on `price_ils`.

### WishlistToggle (PDP / card)

- **File:** product info / card heart (not in header)
- **Props:** `{ productId, productName, initialSaved?: boolean }`
- **States:** default outline heart; hover heading ink; focus-visible 2px; active UNMEASURED; disabled while `useTransition`; loading `aria-busy`; error toast; empty n/a; success `נוסף למועדפים`
- **RTL:** no mirror
- **A11y:** `aria-pressed` when it is a toggle. Do not rely on fill colour alone
- **Electro:** `yith-wcwl-add-to-wishlist--link-style` at ~13px `#333e48`

### WalletButtons (voucher screen, not the ledger)

- **File:** `src/components/coupon/WalletButtons.tsx`
- **Props:** `{ voucher: WalletVoucher; presentable: boolean }`
- **States:** default platform links; empty/null: render **nothing** (no disabled fake); loading n/a (server)
- **RTL:** Apple / Google marks not mirrored, not recoloured with `#fed700`
- **A11y:** named links. Pass chrome may use brief `#E4002B`
- **Electro:** none

### SupplierStorefrontPage `/s/[id]`

- **File:** `src/app/(store)/s/[id]/page.tsx`
- **Purpose:** Public shop for one supplier. Not `/supplier/*` (portal) and not `/suppliers` (join-us).
- **Props:** none (server). `params.id`. Data: `loadSupplierStorefrontCached` + paged products `SUPPLIER_PAGE_SIZE`.
- **Variants:** has products / empty active supplier / 404 inactive or missing.
- **States:**
  - default: eyebrow `ספק`, H1 name, city, address (omit empty), count, grid 2 / 3 / 4
  - hover: cards as category cards; tel/Waze/WhatsApp if present
  - focus-visible: 2px
  - active: n/a
  - disabled: n/a
  - loading: title bars + `CategoryGridSkeleton`
  - error: 404 `ספק לא נמצא` / `הספק לא נמצא או שאינו פעיל בקניון אקספרס.`
  - empty (active, zero products): `אין מוצרים פעילים לספק הזה כרגע.` Keep H1
- **RTL:** full. Phone LTR. Pagination arrows mirror.
- **A11y:** one H1 (supplier name). Count is text, not colour. Pagination named.
- **RLS:** public SELECT on published `suppliers` + their active products. No `platform_percent`. No outstanding voucher book.
- **Electro:** shop archive. No pixel twin.
- **SEO:** `docs/SEO-PLAN.md` §3.4. `@id` `{origin}/s/{id}#business`. Never `/supplier/{uuid}` in JSON-LD.

### CityLandingPage `/city/[slug]`

- **File:** `src/app/(store)/city/[slug]/page.tsx` (path as in PAGE-ANATOMY)
- **Purpose:** Region hub for seventeen `REGIONS`. Not a thin extra city factory. Not `/s/[id]`.
- **Props:** none (server). Unknown slug: `notFound()`.
- **Variants:** has geo municipalities / empty region.
- **States:** default list of city chips; hover `#0062bd`; focus-visible 2px; empty copy below; loading: title + chip pulses; error: 404 or §13; empty is **valid**.
- **RTL:** chips `text-start`. City names Hebrew.
- **A11y:** one H1 `דילים ב{name}`. Empty not announced as an error (`role="status"` not `alert`).
- **RLS:** public suppliers filtered by region. No voucher book.
- **Electro:** none. No pixel twin.
- **Linking:** chips → `/products?city={slug}` (noindex). Supplier cards if present → `/s/{id}`. Empty CTA → `/` or `/products`.

### LegalDocumentPage and OfflinePage

- **Files:** `src/app/(store)/legal/*`, WP aliases, `src/app/offline/page.tsx`
- **Purpose:** Counsel documents + PWA fallback. Not Electro.
- **Props:** none. Static / MD.
- **States:** default document; hover on footer legal links `#0062bd`; focus-visible; empty n/a; error 500 Hebrew; offline **is** the error state.
- **RTL:** full. Dates `he-IL` not wrapped LTR.
- **A11y:** one H1 per document. Offline lightning `aria-hidden`. CTA named.
- **RLS:** public. No money tables.
- **Forbidden:** escrow, fixed commission, PAN. Offline: no network in the retry control.

## Pass 12: the busy-state sweep, across every component at once

The per-page sections above carry states and a11y notes for the surfaces they
cover. This section is the orthogonal cut: one property, checked against all 72
component files, so the gap is visible as a set rather than one page at a time.

### The finding: 24 components go busy without saying so

A component that carries `isPending`, `useTransition` or a `pending` flag
changes its appearance while a server action is in flight. Twenty-four of them
change **only** their appearance: no `aria-busy`, no `aria-live`, no
`role="status"`, no `<output>`. A screen-reader user presses "add to cart" and
hears nothing at all until the page happens to change under them.

| Announces | Silent while pending |
|---|---|
| 14 components | **24 components** |

**Corrected in pass 23.** Those two numbers count different sets and should not
be added together. Re-counted:

| | Count |
|---|---|
| Components with `isPending` / `useTransition` / a `pending` flag | **33** |
| Of those, announcing | **9** |
| Of those, **silent** | **24** |
| Components that announce but are **not** stateful | 5 |

So the figure is **24 of 33 stateful components, 73%**, not 24 of 38. The five
extra announcers (`CouponCardSkeleton`, `CategoryGridSkeleton`,
`account/TokenManager`, `geo/CityTags`, `storefront/StockScarcity`) announce
something other than a pending action — a skeleton announcing load state via
`aria-busy` is correct and is a different use.

The silent list below is unchanged and still accurate: all 24 are still silent.

Silent (`pending` state, no announcement):

```
account/ReferralShareCard      admin/CategoryDialog       cart/AddToCartButton
account/SubscriptionList       admin/CategoryForm         cart/CartCouponForm
admin/CouponDealForm           admin/DeleteButton         cart/CartNavLink
admin/ProductForm              admin/ReferralQueueRow     cart/CartPageView
admin/StatusBadge              admin/SupplierForm         cart/MiniCartDropdown
admin/VendorForm               category/CategoryControlBar
category/CategoryFilterSidebar category/CategorySort      gifts/GiftClaimForm
home/CmsHero                   product/Reviews            storefront/ProductInfo
storefront/SupplierLeadForm
```

Announcing already, and the pattern to copy:

```
CouponCardSkeleton        account/AddressManager     cart/CartDrawer
category/CategoryGridSkeleton  account/ProfileDetailsForm  cart/CartLineItem
storefront/ContactForm    account/TokenManager       geo/CityTags
storefront/StockScarcity  admin/DiscountCampaignForm growth/NewsletterSignup
product/ReviewForm        product/WishlistButton
```

**`cart/CartLineItem.tsx` is the reference implementation.** It uses `<output>`
rather than `<p role="status">`, and the reason generalises: `<output>` carries
the same implicit role and it *is* what the element is, a message produced in
response to the shopper's own action. It is announced when a quantity change
turns a line unavailable, rather than only being read on load.

Priority inside the silent set, by how much the shopper is relying on feedback:

| Rank | Component | Why it matters most |
|---|---|---|
| 1 | `cart/AddToCartButton` | The primary conversion action on every product surface. Nothing is announced between press and cart update. |
| 2 | `cart/CartCouponForm` | Already has `aria-invalid` and `aria-describedby` for the error, so the failure path is announced and the **success** path is not. |
| 3 | `cart/CartPageView`, `cart/MiniCartDropdown` | Quantity and removal both mutate money on screen. |
| 4 | `gifts/GiftClaimForm`, `storefront/SupplierLeadForm` | One-shot submissions where a second press is a real risk. |
| 5 | the eight admin forms | Staff surfaces; lower reach, same defect. |

### Exactly one form field is unlabelled

`admin/FilterBar.tsx:35` renders `<input type="search" name="q">` with a
`placeholder` and no `<label>` and no `aria-label`. A placeholder is not an
accessible name: it is inconsistently announced and it disappears the moment
the field has content.

Nothing else in the tree has this. That is worth stating explicitly, because
two searches that look like they find more do not:

- **`ui/input.tsx` and `ui/textarea.tsx` carry no label by design.** They are
  primitives; the consumer supplies the label, and `ui/form.tsx` wires
  `<Label>` to them.
- **`account/TokenManager.tsx`'s two inputs are `type="hidden"`.** A hidden
  input needs no label.

### The "no aria attribute" list is not a defect list

Thirty-plus components contain no `aria-` or `role=` at all, and **that is
mostly correct**. A scan that reports them as findings is wrong, and this
section records the check so it is not run again as if it were new:

- Twenty-two components have `<button>` and no `aria-label`. Every one that was
  opened carries **visible Hebrew text** inside the button
  (`admin/DeleteButton` renders `כן, מחיקה` / `ביטול`,
  `admin/ReferralQueueRow` renders `דחייה` / `ביטול` / `כן, שלם`). Text content
  is an accessible name. `aria-label` on top of it would be a second, competing
  name.
- Presentational components (`CopyrightYear`, `admin/StatusBadge`,
  `admin/AuditDiff`) have nothing to name.

The genuine icon-only cases are already handled elsewhere and already have
labels: the header cart and account links, `cart/CartLineItem`'s remove button
(`aria-label={\`הסר ${name} מהעגלה\`}`), and the drawer toggle.

### How to re-run this sweep

```bash
# silent while pending
for f in $(find src/components -name '*.tsx' ! -name '*.test.tsx' | sort); do
  if grep -qE "isPending|useTransition|\bpending\b" "$f" \
     && ! grep -qE "aria-busy|aria-live|role=\"status\"|<output" "$f"; then
    echo "${f#src/components/}"
  fi
done

# fields with no label -- then OPEN each hit, because hidden inputs and
# primitives are expected to have none
for f in $(find src/components -name '*.tsx' ! -name '*.test.tsx'); do
  i=$(grep -cE "<input|<textarea|<select" "$f")
  l=$(grep -cE "<label|aria-label" "$f")
  [ "$i" -gt 0 ] && [ "$l" -eq 0 ] && echo "${f#src/components/} fields:$i"
done
```

Quote the `--include` globs when grepping: zsh expands an unquoted `*.tsx`
before grep sees it and aborts the whole command on no match.

## Pass 12: the states and a11y sweep, tree-wide

The per-page sections above carry states and a11y notes for the surfaces they
cover. This pass asks the same two questions of **every** component file, so the
answer is a count rather than a sample.

Method: `find src/components -name '*.tsx' ! -name '*.test.tsx'`, then grep for
the state markers (`isPending`, `useTransition`, `pending`, `disabled=`) and the
announcement markers (`aria-live`, `aria-busy`, `role="status"`, `<output>`).

### 12.1 The finding: a busy state that is visible but not announced

**38 components carry an in-flight state. 14 announce it. 24 do not.**

A sighted user sees the button go dim and the label change to `שולח...`. A
screen-reader user pressing the same button hears nothing at all, and nothing
again when it finishes. On the cart and checkout path that is a shopper who
cannot tell whether their money moved.

The 24 with a pending or transition state and **no** announcement:

| Area | Components |
|---|---|
| cart | `AddToCartButton`, `CartCouponForm`, `CartNavLink`, `CartPageView`, `MiniCartDropdown` |
| category | `CategoryControlBar`, `CategoryFilterSidebar`, `CategorySort` |
| account | `ReferralShareCard`, `SubscriptionList` |
| admin | `CategoryDialog`, `CategoryForm`, `CouponDealForm`, `DeleteButton`, `ProductForm`, `ReferralQueueRow`, `StatusBadge`, `SupplierForm`, `VendorForm` |
| storefront / other | `ProductInfo`, `SupplierLeadForm`, `GiftClaimForm`, `CmsHero`, `product/Reviews` |

`cart/AddToCartButton` is the one to fix first: it is the most-pressed control
on the site and it sits at the top of the purchase funnel.

### 12.2 The pattern to copy, from the 14 that do announce

| Component | Mechanism |
|---|---|
| `cart/CartLineItem` | `<output role="status">` |
| `product/WishlistButton` | `<output aria-live="polite">` |
| `account/AddressManager`, `account/ProfileDetailsForm`, `account/TokenManager` | `<output>` |
| `storefront/StockScarcity`, `storefront/ContactForm` | `<output>` |
| `admin/DiscountCampaignForm` | `aria-describedby` + `aria-invalid` |
| `cart/CartDrawer`, `geo/CityTags`, `growth/NewsletterSignup`, `product/ReviewForm`, `CouponCardSkeleton`, `category/CategoryGridSkeleton` | `<output>` / `aria-busy` |

`<output>` is the house pattern and it is the right one: it carries an implicit
`role="status"`, so it is announced politely without a redundant attribute, and
it *is* what these elements are, a result produced in response to the user's own
action. `cart/CartLineItem` states this reasoning in place.

### 12.3 Form fields: one real defect, not the twenty-two a naive grep reports

A grep for "component has `<input>` but no `<label>`" returns four files, and
**three of them are false positives.** Recorded here so the next pass does not
re-raise them:

| Component | Verdict |
|---|---|
| `admin/FilterBar` | **REAL.** The `type="search"` field carries a `placeholder` and no label, no `aria-label`. A placeholder is not an accessible name: it disappears on first keystroke and is announced inconsistently. |
| `account/TokenManager` | Not a defect. Both inputs are `type="hidden"`. |
| `ui/input`, `ui/textarea` | Not a defect. Primitives; the consumer supplies the label, and `ui/form` + `ui/label` are the wrappers that do. |

### 12.4 The "buttons with no `aria-label`" list is not a defect list

22 components contain a `<button>` and no `aria-label`. **Checked, and they are
overwhelmingly fine**: a button with visible text takes its accessible name from
its content. Spot-verified in `admin/DeleteButton` (`כן, מחיקה`, `ביטול`),
`admin/ReferralQueueRow` (`דחייה`, `ביטול`, `כן, שלם`), `admin/DataTable`,
`admin/CategoriesTable` and `home/FeaturedProductsTabs`.

`aria-label` is only required where the control is **icon-only**. The components
that do it correctly are the ones that need it: `cart/CartLineItem`'s remove
button names the product (`הסר {name} מהעגלה`), and the header's cart and
account icons carry theirs.

**Do not "fix" this list.** Adding `aria-label` to a button that already has
visible text overrides the visible name, which breaks voice control: the user
says the words they can see and nothing happens.

### 12.5 Components with no `aria-` or `role=` at all

30 files. Most are presentational and correctly carry none: `CopyrightYear`,
`admin/StatusBadge`, `admin/AuditDiff`, `analytics/*` (which render no UI),
`cart/CartProvider` and `cart/CartBootstrap` (providers, no DOM).

The count is recorded as a denominator, not as a defect list. The two that are
worth a look on a later pass are `admin/CategoriesTable` and `admin/UsersTable`,
because a data table is where `scope` and a caption start to matter.

---

## Pass 13: the token-compliance count is stale, and the hex half is finished

The summary's "33 components NOT token compliant (hardcoded hex or arbitrary
values)" merged two different things and is no longer true of either.

### Raw hex: zero, and it is gated

Counted across every `.tsx` under `src/`, applying the same rule
`src/styles/tokens.test.ts` applies:

```
raw hex in .tsx outside the allowlist:  0 occurrences, 0 files
```

The allowlist has exactly two entries and both have a stated reason:

| File | Why it is allowed |
|---|---|
| `src/app/global-error.tsx` | It renders before the stylesheet loads and supplies its own `<html>` and `<body>`, so it cannot reference a CSS variable. Inline hex is the only thing guaranteed to paint at that point. |
| `src/components/shared/GoogleLogo.tsx` | A third-party mark. Recolouring it with a project token is forbidden by the same rule that protects the WhatsApp and Facebook marks. |

So the hex half of the old count is **finished**, not merely reduced. The
inventory tables above still carry per-component `NO (text-[#768b9e] …)` cells
from before that sweep; treat the table cells as historical and this count as
current until they are rewritten.

This is enforced, not merely tidy: `tokens.test.ts` fails the suite on any new
hex in a `.tsx`, and names the file. A cell in the tables above that says a
component holds `#0062bd` today would be a failing build.

### Arbitrary sizes: 24 components, and no arbitrary colour among them

```
11  [15px]    3  [8rem]    2  [80px]   2  [50px]     1  [534px]
 4  [38px]    3  [42%]     2  [43px]   2  [9999px]   1  [90vh] (x2 files)
 3  [50%]     2  [-50%]    2  [51px]   2  [12rem]    1  [20%]
             2  [48%]     2  [11px]   2  [18rem]
```

**Not one arbitrary value is a colour.** Every remaining `[...]` is a size, a
percentage or a radius. That matters because the two halves of the old count
have different severities: an arbitrary colour bypasses the palette, an
arbitrary size does not.

Three groups, by what should happen to each:

| Group | Components | Verdict |
|---|---|---|
| **`[15px]`, the gutter** | `layout/Header` x2, `layout/MobileDrawer` x2, `layout/SiteFooter` x3, `home/HeroSlider` x3, `cart/CartPageView` | **Should become `--spacing-gutter`.** It is the single most common padding on the live site (768 occurrences, section 2.0 of DESIGN-SYSTEM) and it already has a token. Eleven call sites, one token, no measurement risk. |
| **Measured one-offs** | `search/HeaderSearch` `[534px]` `[41px]` `[22px]`, `home/HeroSlider` `[43px]` `[51px]` `[42%]`, `layout/MastheadNav` `[38px]`, `layout/RegionMenu` `[53px]` | **Leave, or promote deliberately.** Each is a measured live value. `[43px]`/`[51px]` are already `--text-hero-line1`/`-lg`; `[534px]`/`[41px]`/`[22px]` are the header search, which this project deliberately does not ship. |
| **Radix / layout primitives** | `ui/dialog` `[50%]` `[-50%]` `[48%]`, `ui/dropdown-menu` `[8rem]`, `ui/select` `[8rem]`, `ui/textarea` `[80px]`, `admin/*` `[12rem]` `[18rem]` `[90vh]` | **Leave.** Centring transforms and menu min-widths are component mechanics, not design tokens. `[9999px]` in the two forms is a pill radius and could use `--radius-round` (200px), though 9999 and 200 both round the same on those elements. |

Only the first group is worth changing, and it is a single find-and-replace
across five files.

### How to re-run both counts

```bash
python3 - <<'PY'
import re, pathlib
allow = {'src/components/shared/GoogleLogo.tsx', 'src/app/global-error.tsx'}
hexre = re.compile(r'#[0-9a-fA-F]{3,8}\b')
arb   = re.compile(r'\[(#[0-9a-fA-F]{3,8}|-?\d+(?:\.\d+)?(?:px|rem|vh|vw|%))\]')
hexoff, arboff = [], set()
for p in pathlib.Path('src').rglob('*.tsx'):
    f, t = str(p), p.read_text(encoding='utf-8')
    if f not in allow:
        hexoff += [(f, h) for h in hexre.findall(t)]
    if arb.search(t) and f.startswith('src/components/'):
        arboff.add(f)
print('raw hex:', len(hexoff), 'arbitrary:', len(arboff))
PY
```

## Pass 14: the original 72-file scan never listed the conversion components

The opening tables scanned `src/components` and stopped. The storefront
contract in `docs/ui-design-system/COMPONENTS.md` includes files that live
under `src/app/` and under directories the 72-file count never opened. Those
are the components that take money, consent, or a gift token. Binding props
and states are copied from COMPONENTS, not invented here.

States every interactive control must still consider: default, hover,
focus-visible, active, disabled, loading, error, empty. Tokens:
`docs/DESIGN-SYSTEM.md` §4.0 and §11. Copy: `docs/ERROR-COPY.md`.

### Directories the 72-file scan never opened

| Directory / area | Why it was missed | Components that matter |
|---|---|---|
| `src/components/a11y/` | not in the original subdirectory list | `SkipLink` |
| `src/components/analytics/` | same | `ConsentBanner` |
| `src/components/gifts/` | same | `GiftClaimForm` |
| `src/components/coupon/` | same | `WalletButtons` (QR page, not the ledger) |
| `src/components/geo/` | same | `CityTags` |
| `src/components/growth/` | same | `NewsletterSignup` |
| `src/components/product/` | same | `WishlistButton`, `Reviews`, `ReviewForm` |
| `src/components/search/` | same, and must **not** mount in chrome | `HeaderSearch` exists in the tree and stays unmounted |
| `src/app/(store)/checkout/` | lives under `app/`, not `components/` | `CheckoutShell`, `CheckoutForm` |
| `src/app/(account)/` | pages, not `src/components` | wallet / coupons / wishlist contracts in Pass 8 |

### SkipLink

- **File:** `src/components/a11y/SkipLink.tsx`
- **Props:** none
- **States:** default visually hidden; focus-visible `fixed`, paper white, 2px black ring, `z-skip` (100). Other states n/a
- **RTL:** `right-4` is the reading origin in RTL. Do not "fix" to `left-4`
- **A11y:** `<a href="#main-content">דילוג לתוכן הראשי</a>`. Target `#main-content` needs `tabIndex={-1}` or focus stays on the link
- **Electro:** none (WCAG 2.4.1 / Israeli 5568)

### ConsentBanner

- **File:** `src/components/analytics/ConsentBanner.tsx`
- **Props:** none (reads consent cookie / `html[data-consent]`)
- **States:** default undecided, two equal-weight actions `אישור` / `לא תודה`; hidden after decide. Hover/focus on both actions. Loading n/a. Error n/a
- **RTL:** full. Fill `#fed700`, ink `#333e48`. Hairline `--color-overlay-hairline`
- **A11y:** `aria-label="הסכמה לאיסוף נתוני שימוש"`. Accept and decline must both be reachable at 380. An undecided banner steals the passwordless toggle on `/login` (QA §0)
- **Electro:** none (legal)
- **Stacking:** not a z-index fight. `fixed bottom-0` plus `padding-bottom` on `body`

### CheckoutShell

- **File:** `src/app/(store)/checkout/CheckoutShell.tsx`
- **Props:** none
- **States:** loading only. Reserves guest notice + stepper + two columns (560 / 992). `aria-hidden` scenery, not focusable
- **RTL:** same classes as the real form
- **A11y:** no tab stops. A 0-height fallback is a CLS fail
- **Electro:** checkout layout, unpainted

### CheckoutForm

- **File:** `src/app/(store)/checkout/CheckoutForm.tsx`
- **Props:** `{ cart, clientRef, needsAddress, address, walletBalance, savedCards?, isAuthenticated, resuming?, channel?: 'web' | 'app' }`
- **Variants:** guest vs auth; physical (address required) vs coupon-only (address skipped); web vs app return; resume-from-Google
- **States:**
  - default: `ol.checkout-steps` current / done / upcoming
  - hover: place-order family goes **black**, not `#fedd26` (DESIGN-SYSTEM §4.0)
  - focus-visible: 2px heading ink, offset 2px
  - active: place-order UNMEASURED (cart checkout measured `#a78e00`)
  - disabled: next until `validateStep`; empty cart does not render, bounce `/cart`
  - loading: `useActionState` / `aria-busy` on place-order (today: listed silent in Pass 12 if it shares the pending pattern)
  - error: `StepErrors` per field + `classifyCheckoutFailure` banner `role="alert"`
  - empty: not painted; redirect
- **RTL:** stepper arrows mirror. Phone, email, zip, last4 `dir="ltr"`. Place-order radius **50px**, type 19.418px / 700, fill `#fed700`, ink `#333e48`
- **A11y:** `aria-current="step"`. Iframe titled. Escape from a failed iframe. Terms tick is the confirmation, not a second dialog
- **RLS:** cart scoped to session / `auth.uid()`. `platform_percent` snapshotted server-side, never painted
- **Electro:** `#place_order`

### GiftClaimForm

- **File:** `src/components/gifts/GiftClaimForm.tsx`
- **Props:** token from the URL, never claimed on GET
- **States:** default `קבלת הקופון לחשבון שלי` on yellow; pending `מעביר את הקופון...`; error under the button (today a red `<p>`, not yet `role="alert"`); already claimed `המתנה כבר נאספה`
- **RTL:** full. Codes LTR
- **A11y:** one-shot. Second press must no-op. Mail scanners hitting GET must not claim
- **RLS:** claim writes the voucher to `auth.uid()`. Forged token is a Hebrew error, not a 500 stack

### HeaderSearch (unmounted on purpose)

- **File:** `src/components/search/HeaderSearch.tsx`
- **Props:** n/a on the storefront. Must not mount in the header or the drawer
- **States:** n/a while unmounted
- **RTL:** n/a
- **A11y:** the live 534×41 yellow-border field is the pixel cost we accept
- **Electro:** header search. Standing rule vs live. See UI-PARITY-LOG §10

### State × token cheat sheet (purchase family)

Copied from COMPONENTS §12 so this inventory holds it too.

| Control | 380 rest | 768+ rest | Hover | Radius |
|---|---|---|---|---|
| PDP add-to-cart | `#333e48` / white, 6px, full width | `#fed700` / `#333e48`, 25.2px | black / white | family, not `--radius-*` |
| Card add-to-cart | transparent / heading | same | black | 22px pill |
| Cart checkout | `#fed700` / heading | same | black | 21.994px |
| Place order | `#fed700` / heading, 50px, 19.418px/700 | same | black | 50px |
| Account coupon CTA | `#fed700` / heading | same | **`#fedd26`** (this list is not a Woo twin) | 22px |
| Wishlist heart | 13px heading link | same | heading | n/a |
| Consent accept | `#fed700` / heading | same | `#fedd26` or black, either is legal (not scored) | pill |

White on `#fed700` is forbidden on every row.

## Pass 14: eleven components are never imported

The tables above mark a handful of components "unused" one row at a time. This
is the sweep: every `.tsx` under `src/components`, checked for an actual
`import` site anywhere in `src/`.

**Eleven of 138 have zero import sites.**

```
category/CategorySort           store/CategoryNav
home/FeaturedProducts           store/CategoryProductSection
home/HeroExact                  store/DealsSection
layout/InfoBar                  store/HomeHeroSection
legal/LegalDocumentView         storefront/BlogPostHeader
product/WishlistButton
```

### The headline: the PDP wishlist heart does not ship

`product/WishlistButton.tsx` exists, is 59 lines, and **nothing imports it**.
There is no `WishlistToggle` anywhere in the tree either. `storefront/ProductInfo.tsx`
mentions a wishlist exactly once, in a **comment**, describing a star rating and
a wishlist link as things live has.

Three documents describe this as shipped:

| Document | Claim |
|---|---|
| this file, pass 8 | a `WishlistToggle (PDP / card)` component section |
| `docs/QA-SCRIPTS.md` section 3 row 7 | "Wishlist heart on PDP, not header. `הוסף למועדפים` / toast `נוסף למועדפים`" |
| `docs/ERROR-COPY.md` section 1 | two wishlist empty states, and "Heart is on the PDP, not in the header" |

The account page `/account/wishlist` **does** exist and render. What does not
exist is any way for a shopper to add to it from a product page. So the QA row
is a test that cannot pass, and the empty state is the only state reachable.

Either wire `WishlistButton` into the PDP, or mark the feature as not shipped in
all three documents. It should not stay documented as working.

### The rest, and what each probably is

| Component | Likely status |
|---|---|
| `home/FeaturedProducts` | dead chain: its only plausible caller `home/FeaturedProductsTabs` is **also** unimported, so both ends are orphaned |
| `home/HeroExact` | a superseded hero variant; `HeroSlider` is the live one |
| `store/HomeHeroSection`, `store/PromoBanners`, `store/CategorySidebar` | re-export shims. Note that `PromoBanners` and `CategorySidebar` **do** have import sites and are live; only `HomeHeroSection` is orphaned |
| `store/CategoryNav`, `store/CategoryProductSection`, `store/DealsSection` | superseded by the `category/` and `home/` implementations |
| `layout/InfoBar` | the top bar was folded into `layout/Header.tsx` directly |
| `legal/LegalDocumentView` | legal pages render their document inline |
| `storefront/BlogPostHeader` | blog post header is inline |
| `category/CategorySort` | sorting lives in `category/CategoryControlBar` |

None of these is a defect on its own. Dead components are a maintenance cost,
not a bug, and several are deliberate leftovers from a rebuild. They are listed
so that:

1. a reader does not "fix" a component nothing renders, and
2. the busy-state and token findings in passes 12 and 13 can be **descoped**:
   `category/CategorySort` appears in the pass 12 silent-while-pending list and
   is unreachable, so it is not worth fixing.

### Pass 15 correction: it is 23, not 11

**The eleven above is wrong and this supersedes it.** Pass 14 grepped for
`import ... <ComponentName>`, which misses two real import forms:

| Missed form | Example | Effect |
|---|---|---|
| lowercase module paths | `from '@/components/ui/button'` | all five unused `ui/` primitives were scored as used |
| relative imports | `Reviews.tsx` does `from './ReviewFormGate'` | components imported by a sibling were scored as unused |

The correct test is **any import specifier ending in the filename**, in either
form. That gives **23 of 138**, and it passes a control (`ui/dialog`, imported
once by `admin/CategoriesTable`, is correctly excluded):

```
admin/CategoryTree          search/DeferredHeaderSearch   store/PromoBanners
category/CategorySort       search/HeaderSearch           storefront/BlogPostHeader
growth/NewsletterSignup     store/CategoryNav             ui/button
home/FeaturedProducts       store/CategoryProductSection  ui/dropdown-menu
home/Footer                 store/CategorySidebar         ui/form
home/HeroExact              store/DealsSection            ui/select
layout/InfoBar              store/HomeHeroSection         ui/textarea
legal/LegalDocumentView     product/WishlistButton
```

Three consequences.

**1. Five of the six `ui/` primitives are dead**, and only `ui/dialog` ships.
That descopes findings in two earlier passes:

- The Summary's "RTL risky: 7 components" includes `ui/dropdown-menu` and
  `ui/select`. Both are unreachable, so their `pl-8` / `left-2` risks cannot
  affect a rendered page. The live RTL-risk count is **5**, not 7.
- Pass 13's arbitrary-value list includes `ui/textarea` `[80px]`,
  `ui/dropdown-menu` `[8rem]` and `ui/select` `[8rem]`. All unreachable.

**2. Both search components are dead, and that is the standing rule made
visible.** `search/HeaderSearch` and `search/DeferredHeaderSearch` have zero
import sites. This project deliberately ships **no search UI**
(`DESIGN-SYSTEM.md` 4.1, and it is a recorded pixel cost against live). The
components exist and nothing renders them, which is exactly what that rule looks
like in the tree. **Do not "fix" this by wiring them in.**

**3. `growth/NewsletterSignup` was a false positive in pass 14's other
direction.** Pass 14 said it was live, "used by `LoginForm` and `SiteFooter`".
It is not: `SiteFooter.tsx:180` mentions it **in a comment**. It has zero import
sites and belongs on this list.

### Method, and the false positives it produced first

The first attempt matched import **paths** and reported **27**. That was wrong:
`NewsletterSignup` (used by `LoginForm` and `SiteFooter`) and `ReviewForm` (used
by `Reviews` and `ReviewFormGate`) were both flagged and both are live.

The second attempt matched the component **name** with a word boundary and
reported 13. That was closer but still caught `CategorySidebar` and
`PromoBanners`, which have three import sites each and are imported under
different local names.

Only the third method is reliable: grep for an actual `import` statement naming
the component.

```bash
for c in <ComponentName>; do
  echo "$c: $(grep -rE "import[^;]*\b$c\b|from '[^']*$c'" \
    --include='*.tsx' --include='*.ts' src/ | grep -vc '\.test\.')"
done
```

Three methods, three answers (27, 13, 11). **Quote the method with the number.**

## Pass 15: CouponPricing, RegionMenu, WhatsAppFloat

Money, chrome, and a third-party mark. Still not in the original 72-file
tables. Props from `docs/ui-design-system/COMPONENTS.md`. The PDP heart in
Pass 8 is **not shipped** (Pass 14 dead-code sweep); do not treat WishlistToggle
as a live control until something imports `WishlistButton`.

### CouponPricing (PDP, coupon branch only)

- **File:** storefront coupon price block (COMPONENTS §6.3)
- **Props:** `{ kenyonAgorot, remainderAgorot, faceAgorot?, expiresAt? }` all integers. Never `platform_percent`
- **Variants:** coupon (two amounts) vs physical (this component must not mount)
- **States:** default two rows `לתשלום באתר עכשיו` / `יתרה לתשלום בבית העסק`; hover n/a; disabled when unsellable (parent kills ATC); loading skeleton two bars; error if agorot missing (`מחיר הקופון טרם הוגדר`)
- **RTL:** each `{price}` in `<bdi>` / `dir="ltr"`. Labels `text-start`
- **A11y:** the split is text, not colour. On-site amount uses `--color-price` (`#dc3545`). Do not paint remainder in brand yellow
- **Electro:** single product summary. Live often shows one Woo price; our split is the product rule

### RegionMenu

- **File:** `src/components/layout/RegionMenu.tsx`
- **Props:** none. Seventeen `REGIONS` only
- **States:** default closed; hover/focus-visible on the trigger (2px heading, not yellow-on-yellow); open: 200px panel, 2px `#fed700` top border (`--spacing-region-menu`)
- **RTL:** panel follows live DOM order. City names Hebrew
- **A11y:** trigger named. Links to `/city/{slug}`
- **Electro:** header secondary nav. `[53px]` in the arbitrary-size leftover list is this control

### WhatsAppFloat

- **File:** layout / home WhatsApp FAB
- **Props:** `href` from env / live number. Prefill Hebrew **without** `{code}` when the share is aimed at the business
- **States:** default mark `#25d366`; hover darkens the mark, never `#fed700`; focus-visible 2px
- **RTL:** mark does **not** mirror. `z-sticky` (40)
- **A11y:** named link, not icon-only without a name

### ProductCard (deals): stay flat

- **File:** `src/components/ProductCard.tsx` variant `deals`
- **Props:** `{ product, variant?: 'default' | 'deals' }`
- **States:** default square (`--radius-none`); hover may use Electro `--shadow-card-hover` (`docs/DESIGN-SYSTEM.md` §1.5). Live does not. Focus-visible 2px heading. Price `#dc3545` or home-grid `#c93636`, never yellow text
- **RTL:** title `#0062bd`. Price `<bdi>`
- **A11y:** name is the product title. ATC in the footer. No percent
- **Electro:** home-v7 deals grid. Elevation is the documented departure

## Pass 15: the inventory is 66 components short of the tree

The Summary's counts predate a lot of the tree. Recounted by walking
`src/components` rather than by trusting the header.

| Claim | Was | Is |
|---|---|---|
| Total component files | 72 `.tsx` | **138** excluding tests (148 with them) |
| `src/components/shared/` | "only `.gitkeep`" | **six components** |
| `src/components/features/` | "only `.gitkeep`" | still only `.gitkeep`, correct |

### The 25 components this document does not mention at all

Not "listed without detail": absent. Their filenames appear nowhere in the file.

| Area | Components |
|---|---|
| Root | `ProductDealCard` |
| Account | `account/AccountNav` |
| Admin | `admin/CommandPalette`, `admin/ServerDataTable`, `admin/TablePagination`, `admin/VoucherLookupForm` |
| Admin charts | `admin/analytics/BarSeries`, `admin/analytics/FunnelBars`, `admin/reports/SalesChart` |
| Analytics | `analytics/AnalyticsProvider`, `analytics/ThirdPartyTags`, `analytics/ViewTracker` |
| Cart | `cart/HeaderCart` |
| PWA | `pwa/InstallPrompt`, `pwa/ServiceWorkerRegistrar` |
| Search | `search/DeferredHeaderSearch`, `search/SearchBox` |
| Shared | `shared/FacebookIcon`, `shared/FacebookShareButton`, `shared/WhatsAppIcon`, `shared/WhatsAppShareButton` |
| Store | `store/DeferredStoreChrome` |
| Storefront | `storefront/ShippingInfo`, `storefront/SupplierInfo` |
| Supplier | `supplier/SupplierNav` |

Four of them are load-bearing for things other documents already assert, which
is why the gap is worth closing rather than noting:

- **`cart/HeaderCart`** is the cart badge in the masthead. `docs/DESIGN-SYSTEM.md`
  section 4.1 specifies its geometry (21x21, `#fed700`, `#333e48` at 12px) and
  the component behind that spec is not inventoried.
- **`search/SearchBox` and `search/DeferredHeaderSearch` exist**, and the two
  are in different states. Traced rather than assumed, because the first
  version of this note overstated it:

  | Component | Mounted? |
  |---|---|
  | `search/DeferredHeaderSearch` | **nowhere.** `MastheadNav.tsx` deleted the slot; the only remaining reference is the comment explaining why |
  | `search/SearchBox` | **yes, twice**, both on `/search` itself (`page.tsx:159` empty state, `:215` results) |

  So the standing rule is precisely **"no search UI in the site chrome"**, not
  "no search component anywhere". The `/search` route exists, carries
  `robots: { index: false }`, and has its own box. That is not a violation of
  the rule and never was.

  `MastheadNav.tsx` states the reasoning and it is worth keeping: the slot is
  **gone rather than hidden**, because "a CSS-hidden field is still in the DOM,
  still in the tab order, and still ships its client chunk". `justify-end`
  closes the gap, and that is named as the one place the component knowingly
  departs from the measured layout.

  `DeferredHeaderSearch` is therefore **unreferenced code**: it survives the
  removal of its only call site. Worth knowing before someone concludes from
  its existence that the chrome search is coming back.
- **`shared/WhatsAppShareButton` and `shared/FacebookShareButton`** carry the
  third-party marks whose colour rules `docs/DESIGN-SYSTEM.md` section 1.4 sets
  out (`--color-whatsapp-ink` at 7.67:1, `--color-facebook` `#166fe5`, and the
  standing "never rebrand a mark with `--color-brand-*`"). The tokens are
  documented; their only consumers are not.

### What this does not change

The per-component judgements already in this file were made by opening those
files, so they stand. The RTL-risky seven and the pass-13 token recount were
both derived from scans over the whole tree, not from this list, so neither is
affected by the list being short.

What is affected is any reader who treats the tables as exhaustive. They are
not, and the header said 72 while the tree held 138.

## Pass 16: the four load-bearing components from pass 15

Pass 15 named 25 components absent from this file and singled out four as
load-bearing for claims other documents already make. Those four are documented
here; the remaining 21 stay listed in pass 15 as known-absent.

| Component | File | Props | Used in | Tokens | RTL / a11y |
|---|---|---|---|---|---|
| HeaderCart | `cart/HeaderCart.tsx` | none | `layout/Header.tsx` (handheld row) | `.mini-cart` class; colours from `mini-cart.css` | wraps `CartNavLink` + `MiniCartDropdown` |
| SearchBox | `search/SearchBox.tsx` | `{ defaultValue?: string }` | `/search` only, twice (`:159` empty, `:215` results) | Tailwind utilities | `aria-label="חיפוש מוצרים"` on the form, `aria-label="חיפוש"` on the field |
| WhatsAppShareButton | `shared/WhatsAppShareButton.tsx` | `{ message, appendCurrentUrl?, label?, className?, productId? }` | PDP and coupon shares | `text-whatsapp-ink` / `hover:text-whatsapp-ink-hover` | button with visible Hebrew label `שתפו בוואטסאפ` |
| FacebookShareButton | `shared/FacebookShareButton.tsx` | `{ …, label?, className? }` | share rows | Facebook token | visible label `שיתוף בפייסבוק` |

### What each one settles

**`HeaderCart` is a positioning decision, not a wrapper.** Its comment: the icon
and the mini-cart panel are wrapped together *because the panel is positioned
against this element*. Rendering the dropdown higher up, beside `CartDrawer`,
would anchor it to the page rather than the icon, "which is the whole difference
between a dropdown and a sheet."

It also carries a `<Suspense fallback={null}>` around the panel for a reason
worth keeping: the panel calls `usePathname`, which under `cacheComponents` is
runtime data on any route with a dynamic param. Without the boundary the
masthead takes `/product/[slug]`, `/category/[slug]` and every admin and account
`[id]` route out of the static shell, **which is the whole site**. The null
fallback costs nothing to look at, because the panel renders nothing until the
icon is pressed.

**`SearchBox` confirms the search rule's real scope.** It is labelled twice
(form and field) and lives only on `/search`, which is `noindex`. See pass 15
for why "no search UI" means "no search UI in the chrome".

**The two share buttons are the missing consumers of the third-party mark
tokens.** `docs/DESIGN-SYSTEM.md` section 1.4 documents
`--color-whatsapp-ink` (`#075e54`, 7.67:1) and `--color-whatsapp-ink-hover`
(`#043c36`, 12.32:1) as WhatsApp's own darker teal, chosen so the mark is not
rebranded with a colour this project invented. `WhatsAppShareButton` uses
exactly `text-whatsapp-ink hover:text-whatsapp-ink-hover`. The token and its
only consumer now appear in the same set of documents.

Both share buttons carry a **visible Hebrew label** beside the icon
(`שתפו בוואטסאפ`, `שיתוף בפייסבוק`), so they are named by their content and
belong in the pass-12 false-positive list rather than the icon-only set.

**One behaviour worth a QA step:** `WhatsAppShareButton` fires its
`whatsapp_click` event *before* `window.open`, and says why: "an exit to a chat
is precisely the moment the page loses the shopper, so the event must not wait
for a return." A test that asserts the event after the window opens will look
correct and measure nothing.

## Pass 17: the analytics trio

Three of the 25 from pass 15. They are grouped because together they are the
consent boundary, and because `docs/MIGRATION-REVIEW.md` section 2 records that
four of the events they emit are currently discarded by the database.

| Component | File | Props | Client? | Tokens | a11y |
|---|---|---|---|---|---|
| AnalyticsProvider | `analytics/AnalyticsProvider.tsx` | none | yes | none (renders nothing) | none (renders nothing) |
| ViewTracker | `analytics/ViewTracker.tsx` | `{ event, props }` | yes | none | none |
| ThirdPartyTags | `analytics/ThirdPartyTags.tsx` | none | yes | none | none |

None of the three renders visible output, so they carry no tokens and no RTL or
a11y surface. What they carry is policy.

### ThirdPartyTags is the consent boundary, and it is stricter than the vendor pattern

**Nothing renders before consent.** Not a script tag, not a stub, not a
consent-mode-denied bootstrap. `<Script>` is not in the tree at all until
`allowed` is true, so there is **no third-party request of any kind** before
agreement.

The file states why this beats Google's recommended Consent Mode, which loads
`gtag.js` immediately with everything denied: fetching the script already hands
Google the visitor's IP, "and that transfer is the thing consent exists for".
The stricter version is also the one "that can be checked in a network log
rather than taken on a vendor's word", which is what makes it testable.

Two implementation details that look like bugs and are not:

- **The cookie is read in an effect, not during render.** `document` does not
  exist on the server, and reading it while rendering hydrates a different tree
  than the server produced. So the first client paint has no tags even for a
  visitor who consented months ago; they arrive one tick later.
- **A `ke:consent-granted` window event** is what makes Accept take effect
  immediately. Without it the tags would wait for a navigation, and "the visit
  that consented would be the one visit never measured".

### AnalyticsProvider normalises the route before it reports it

`routeTemplate(pathname)` maps dynamic paths onto templates
(`/checkout/[step]`, `/account/[section]`) before `page_view` is emitted, so the
event stream groups by route shape rather than exploding one row per id. It also
emits sampled Web Vitals.

"Every call is a no-op without consent, so this can sit in" the tree
unconditionally: the gate is in the tracker, not in the mounting.

### ViewTracker is keyed by its event props

`key = JSON.stringify(props)`, so navigating between two products of the same
type re-fires rather than being deduplicated into one view. That is the intended
behaviour and the reason the key is the props rather than the pathname.

### The open loop these three sit on

`AnalyticsProvider` emits `page_view` and `web_vital`; both are on the database
whitelist. The **server** events (`begin_checkout`, `purchase`,
`voucher_redeemed`, `order_refunded`) are not, until migration 169 applies, and
`fn_ingest_analytics_events` skips unknown names silently with an HTTP 200.

So these components work and the funnel's money moments do not arrive. The
client half is not the problem, and this table is here so nobody debugs it as
though it were.

## Pass 18: the PWA pair

Two more of the 25. Neither renders on the first paint, and both carry a
constraint that is easy to undo.

| Component | File | Props | Renders | a11y |
|---|---|---|---|---|
| InstallPrompt | `pwa/InstallPrompt.tsx` | none | a banner, conditionally | a real banner with buttons |
| ServiceWorkerRegistrar | `pwa/ServiceWorkerRegistrar.tsx` | none | nothing | none |

### InstallPrompt: capturing the event creates an obligation

Chrome fires `beforeinstallprompt` and lets the page defer it. **The moment we
call `preventDefault`, the native mini-infobar is suppressed**, so once the
event is captured we are obliged to offer the install ourselves or the visitor
loses the option entirely.

That is why the banner renders **off a captured event and never off a guess
about the browser**. A UA-sniffing version of this component would show a banner
where no install is possible, and suppress nothing where it is.

Two constraints in the same file:

- **Not shown on the money paths.** "A bar sliding up over the checkout during
  payment costs an order, and the install is worth less than the order." That is
  a business decision encoded in a render condition; a refactor that moves the
  banner into a global layout would break it silently.
- **A dismissal is remembered** in `localStorage` under `ke:pwa-install-dismissed`.
  "Re-asking every visit is how a prompt gets ignored permanently, and there is
  no second chance after that."

For QA: the dismissal key must be cleared to see the banner again, and the
banner must **not** appear on `/checkout` or `/cart`.

### ServiceWorkerRegistrar: production only, and after `load`

Registers `public/sw.js` at scope `/`, and **only in production**.

Registering in development is not merely pointless, it is harmful: `next dev`
serves uncompiled chunk URLs that change on every edit, and a worker that has
claimed the origin keeps answering for them. It also **survives switching
branches**, which turns "the dev server is serving the wrong build" into a bug
that takes an afternoon to find.

That is the same failure mode `docs/QA-SCRIPTS.md` section 0.1 step 1 guards
against from the other direction, and it is worth connecting: a stale service
worker and a stale `next start` produce identical symptoms, and only one of them
is fixed by restarting the server.

Registration is deferred to the `load` event, because it competes with hydration
for the main thread and this page group's LCP was fought for deliberately.
Nothing it does is needed on the first paint.

It deliberately does **not** capture `beforeinstallprompt`; that is
`InstallPrompt`'s concern. The two are separate on purpose.

## Pass 19: the admin table and navigation cluster

Three more of the 25. All three are staff-facing and all three carry a11y work
worth recording, which the summary tables' RTL/tokens columns do not capture.

| Component | File | Props | a11y |
|---|---|---|---|
| CommandPalette | `admin/CommandPalette.tsx` | none | `aria-label="חיפוש מהיר"`, Escape closes, arrow-key navigation |
| ServerDataTable | `admin/ServerDataTable.tsx` | `ServerColumn<T>[]` + rows | `aria-label="בחירת שורה"` on the row checkbox |
| TablePagination | `admin/TablePagination.tsx` | page, total, etc. | `<nav aria-label="ניווט עמודים">`, `aria-current="page"`, `aria-hidden` on the inert ellipsis |

### CommandPalette holds no credentials, and says so

Cmd+K anywhere in the panel: find an order by invoice number, email or phone.

The important line is about **where the authorization lives**:

> The search itself is a server action behind `requireSection('orders','read')`,
> so this component holds no credentials and can reach nothing an admin could
> not already read. It is a keyboard shortcut over an authorised query.

That is the correct shape for a global search box, and it is why the component
does not appear in `docs/ROLE-MATRIX.md`'s guard tables: the guard is on
`quick-search.ts`, which section 6 already lists at `requireSection('orders','read')`
— the one admin action with a **read** rather than a write gate. Support can use
it; `content_uploader` cannot.

It is "mounted once in the admin layout rather than per page, because the whole
point is that it works from wherever the operator happens to be standing when
the phone rings."

Behaviour worth testing: `metaKey || ctrlKey` plus `k`, with `preventDefault`,
so it works on both platforms and does not fight the browser. Escape closes.
`DEBOUNCE_MS = 250` and `MIN_TERM = 2`, so a single character does not query.

### TablePagination is the best-labelled control in the panel

It carries all three of the things pagination usually omits:

- `<nav aria-label="ניווט עמודים">` — the region is named
- `aria-current={p === page ? 'page' : undefined}` — the current page is
  programmatically current, not merely styled
- `aria-hidden` on the ellipsis span — the gap is decorative and is not read out

`docs/QA-SCRIPTS.md` section 2 step 5 asks for exactly this ("arrows mirror;
current page `aria-current`"). This component satisfies it; the check is worth
keeping for the storefront pagination, which is a different implementation.

### ServerDataTable names its row selector

`aria-label="בחירת שורה"` on the per-row checkbox. Without it a bulk-select
table gives a screen reader a column of unnamed checkboxes, which is the most
common failure in an admin grid.

## Pass 20: the storefront supplier pair

Two more of the 25, both on the PDP, both carrying reasoning that is easy to
lose in a refactor.

| Component | File | Props | a11y |
|---|---|---|---|
| SupplierInfo | `storefront/SupplierInfo.tsx` | `{ supplier: SupplierSummary, type: SupplierInfoProductType, ... }` | conditional rows; links are real links |
| ShippingInfo | `storefront/ShippingInfo.tsx` | `{ requiresShipping, weightGrams, warrantyMonths }` | `<section aria-label="משלוח ואספקה">` |

### SupplierInfo exists because the address used to appear only after payment

`docs/BUSINESS-MODEL.md` section 2 requires address plus Waze and phone plus
WhatsApp on every product page. The component's own header records why that
mattered:

> Fifteen of the live products are coupons, redeemed in person at a counter, and
> until now the address only appeared on `/coupon/[id]` — **AFTER paying**. A
> shopper deciding whether to buy could not see where the business is or ask it
> a question.

This is also the component that satisfies the PDP -> `/s/{id}` edge in
`docs/SEO-PLAN.md` section 4's linking map, verified there in 4.1.3.

**Every field is conditional, and that is the design, not laziness.** Measured
against production: **11 of 11 suppliers have no address and 6 have no phone at
all.** An unconditional row would print `כתובת:` followed by nothing on most
pages. A missing field renders nothing; a present one renders a working link.

### The product-type bug this component records is worth reading twice

`SupplierInfoProductType` has four members and the file explains a defect that
shipped:

> `recurring`, not `subscription`. […] this prop used to say `subscription` — a
> string no product row ever holds. **Nothing failed loudly**: the union simply
> never matched, so a monthly subscription fell through to the physical branch
> and told the customer their subscription `נשלח ומסופק על ידי הספק`.

Two things make it instructive:

1. **The compiler could not catch it**, because `products.type` is typed from
   unmigrated production where the member does not exist.
2. A wrong union member did not throw; it selected a **wrong-but-valid** branch,
   so the only symptom was one sentence of Hebrew that made no sense for a
   subscription.

The four fulfilment notes are the strings that branch:

| Type | Note |
|---|---|
| `coupon` | `מימוש הקופון מתבצע ישירות מול הספק בבית העסק.` |
| `physical` | `המוצר נשלח ומסופק על ידי הספק.` |
| `service` | `השירות ניתן על ידי הספק.` |
| `recurring` | `המנוי מתחדש אוטומטית ומסופק על ידי הספק. אפשר לבטל בכל עת מהאזור האישי.` |

There is a second trap named in the same comment: a caller that hands over
`products.type` raw picks the wrong note for the **five live products whose
`type` says physical and whose `is_coupon_enabled` says coupon**. The resolver
in `lib/commerce/product-type.ts` is the correct source, not the column.

### ShippingInfo is defined by what it omits

Its first comment: "What is deliberately absent: the platform/supplier split.
`platform_percent`…" — the same rule `docs/SEO-PLAN.md` 3.10 verifies for
JSON-LD, enforced here in the DOM.

Weight is rendered via `toLocaleString('he-IL', { maximumFractionDigits: 2 })`
in kilograms. Not money, so the integer-agorot rule does not apply, and the
Hebrew locale is right for a decimal a shopper reads.

## Pass 21: the RTL-risky list re-verified

The Summary's list of seven dates from the original scan and had never been
re-run. Re-run with comments stripped.

### The corrected list

| Component | Hit | Verdict |
|---|---|---|
| `ui/dropdown-menu.tsx` | `left-2`, `pl-8`, `pr-2` | **real**, vendored Radix default |
| `ui/select.tsx` | `left-2`, `pl-8`, `pr-2` | **real**, vendored Radix default |
| `ui/dialog.tsx` | `right-4` | **real**, the close button |
| `admin/CouponDealForm.tsx` | `right-2` | **real**, the preview card's badge |
| `admin/ProductForm.tsx` | `text-right` | **real**, a table header row |
| `admin/ReferralQueueRow.tsx` | `mr-2` | **real, and new to this list** |
| `storefront/SupplierLeadForm.tsx` | `text-right` | **real, and new to this list** |
| `admin/CategoryDialog.tsx` | `right-1/2` | **not a defect**: centring, paired with `translate-x-1/2`. The table above this section already said so |
| `layout/MobileDrawer.tsx` | `right-0` | **not a defect**: deliberate and commented — "RTL: the drawer slides in from the right, so it is anchored right and translated +100% when closed" |

**Seven real, two explained.** Two of the original seven, `CouponCard` and
`home/BenefitBar`, no longer contain any physical direction utility: they were
fixed at some point after the scan and the Summary never caught up.

Two components were **missing** from the original list entirely
(`admin/ReferralQueueRow`, `storefront/SupplierLeadForm`).

### `MobileDrawer`'s `right-0` is worth keeping as written

`docs/DESIGN-SYSTEM.md` 5.1 forbids `right-*` in favour of `end-*`. This is the
documented exception, and the comment carries the reasoning: the drawer is
`xl:hidden` inside a `dir="rtl"` document and slides from the visual right,
where the hamburger is. `start-0` would be equivalent today and more robust to a
direction change the app does not have. Either is defensible; what matters is
that it is a decision with a comment rather than a leftover.

### And the scan that produced "38"

The first run of this re-verification reported **38** components. Every one of
the extra 29 was `rounded-lg` matched by a `rounded-l` pattern: a **size**
utility caught by a **direction** pattern.

That is the fourth false-positive class this document set has recorded, after
the RTL lint's comment prose, the buttons with visible Hebrew labels, and the
`<h1>` matches inside comments. The pattern needed
`rounded-l(?![a-z])` to exclude `rounded-lg`, `rounded-lb` and friends.

`docs/QA-SCRIPTS.md` 0.2 states the rule this keeps proving: **open the thing
before you write it down. A count is a lead, not a finding.**

## Pass 22: the last summary number, and what "not token compliant" actually means

The Summary's three headline numbers have now all been re-verified: total files
(pass 15), RTL-risky (pass 21), and token compliance here.

### Raw hex: one component, and it is allowlisted

| | Count |
|---|---|
| Components containing a raw hex, comments stripped | **1** |
| Of those, allowlisted | **1** |
| **Unallowlisted raw hex** | **0** |

The one is `shared/GoogleLogo.tsx` (`#4285F4`, `#EA4335`, `#FBBC05`,
`#34A853`), and `src/styles/tokens.test.ts:208` names it explicitly:

```
const HEX_ALLOWLIST = new Set(['src/components/shared/GoogleLogo.tsx',
                               'src/app/global-error.tsx'])
```

Those are Google's own brand colours in a vendor mark, which is the same
exemption `docs/DESIGN-SYSTEM.md` 1.4 gives WhatsApp and Facebook: **never
rebrand a third-party mark with `--color-brand-*`**. So the original "33 not
token compliant" has resolved to **zero real violations**, and the test is why.

### Arbitrary sizes: 19 components, and most are measured values

Nineteen components use a `[Npx]` / `[Nrem]` arbitrary value. **Four of the
values duplicate an existing token:**

| Value | Uses | Token that exists |
|---|---|---|
| `15px` | **11** | `--spacing-gutter`, i.e. `p-gutter` / `gap-gutter` |
| `10px` | 1 | `--spacing-md` |
| `14px` | 1 | `--spacing-lg` |
| `22px` | 1 | `--radius-pill` |

**`[15px]` at eleven uses is the one worth fixing.** It is the site's single most
common padding (862 occurrences on live, `DESIGN-SYSTEM` 2.0), it has a named
token generated as a Tailwind utility, and writing it as an arbitrary value
makes it ungreppable as the gutter. `Header`, `MobileDrawer`, `SiteFooter`,
`CartPageView` and others each spell it out.

The other 36 distinct values have **no token, and mostly should not have one**:

- `534px`, `41px`, `22px` (`search/HeaderSearch`) are live's search field, in a
  component `docs/COMPONENT-INVENTORY.md` pass 15 records as **unmounted**.
- `43px`, `51px`, `38px`, `110px`, `13px`, `11px` (`home/HeroSlider`) are the
  hero display ramp, and `DESIGN-SYSTEM` 3.4 explains which of those were
  promoted to tokens and which deliberately were not: "the sizes that really are
  used once stay in that file's `RS` constant".
- `0.929em` (`layout/Header`) is the top bar's font size, measured.
- `9999px` is an inset shadow idiom, not a size.

So "arbitrary value" is not a synonym for "unprincipled". The distinction the
Summary needs, and now has, is between **a value that has a token and ignores
it** (four, of which `[15px]` x11 is the real one) and **a measured one-off with
its provenance in a comment** (the rest).

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | Pass 8: wallet, coupons, wishlist pages with props, states, RTL, a11y, RLS notes |
| 2026-09-07 | Pass 9: `/s/[id]` storefront page contract |
| 2026-09-07 | Pass 10: `/city/[slug]` region hub |
| 2026-09-07 | Pass 11: legal aliases + offline (no JS retry chunk) |
| 2026-09-07 | Pass 12: tree-wide states and a11y sweep; 24 of 38 in-flight states unannounced; three form-field false positives retired |
| 2026-09-07 | Pass 12: busy-state sweep across all 72 components; 24 silent while pending, one unlabelled field, and the false-positive lists recorded so they are not re-reported |
| 2026-09-07 | Pass 13: token-compliance recount. Raw hex is ZERO and gated; 24 components hold arbitrary SIZES only, none a colour; the eleven [15px] are the one group worth changing |
| 2026-09-07 | Pass 14: conversion components the 72-file scan never opened (SkipLink, ConsentBanner, CheckoutForm, GiftClaimForm, unmounted HeaderSearch) plus the purchase-family hover split |
| 2026-09-07 | Pass 15: CouponPricing (split amounts, never percent), RegionMenu (seventeen regions), WhatsAppFloat (mark not yellow) |
| 2026-09-07 | Pass 16: ProductCard deals stay radius 0; hover lift is Electro, live is flat |
| 2026-09-07 | Pass 14: dead-code sweep. Eleven components never imported, including WishlistButton, so the PDP wishlist heart does not ship despite three documents describing it |
| 2026-09-07 | Pass 15: recounted the tree. 138 components not 72, shared/ is no longer empty, and 25 components are absent from the file entirely |
| 2026-09-07 | Pass 15: dead-code count corrected from 11 to 23. Five of six ui/ primitives are dead (descopes two RTL risks), both search components are dead by design, NewsletterSignup was a pass-14 false positive |
| 2026-09-07 | Pass 16: documented the four load-bearing components pass 15 flagged (HeaderCart, SearchBox, the two share buttons); 21 of the 25 remain known-absent |
| 2026-09-07 | Pass 17: the analytics trio. ThirdPartyTags is the consent boundary and is stricter than Consent Mode; the client half works while the server events are still discarded by the DB |
| 2026-09-07 | Pass 18: the PWA pair. Capturing beforeinstallprompt creates an obligation, and a dev-registered service worker produces the same symptom as a stale next start |
| 2026-09-07 | Pass 19: the admin table and navigation cluster. CommandPalette is a shortcut over an authorised query and holds no credentials; TablePagination is the best-labelled control in the panel |
| 2026-09-07 | Pass 20: the storefront supplier pair. SupplierInfo exists because the address used to appear only after payment, and it records a wrong-union-member bug that selected a valid branch instead of throwing |
| 2026-09-07 | Pass 21: RTL-risky list re-verified. Nine hits, seven real; CouponCard and BenefitBar are now clean and two components were missing. The first run said 38, all extras being rounded-lg matched by a rounded-l pattern |
| 2026-09-07 | Pass 22: token compliance re-verified. Zero unallowlisted raw hex; of 19 components with arbitrary sizes, only four duplicate an existing token and [15px] x11 is the one worth fixing |
| 2026-09-07 | Pass 23: corrected the busy-state figure. 24 of 33 stateful components are silent (73%), not 24 of 38; the earlier pair counted two different sets |
