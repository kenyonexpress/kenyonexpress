# Component Inventory

Status: **BINDING (inventory)** · עודכן: 2026-08-12
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`
אין שינוי קוד. אין נגיעה בתיקייה הראשית.
מודל כסף: No Escrow (לא רלוונטי; רשימת קומפוננטות).

---

## 1. החלטה

| # | הכרעה |
|---|---|
| I1 | 72 קומפוננטות `.tsx` (6 shims) |
| I2 | 33 לא token-compliant (hex/arbitrary) |
| I3 | 7 RTL risky (physical ml/mr/left/right) |
| I4 | tokens ב-globals.css @theme |

---

## 2. חלופות שנדחו

| חלופה | נימוק |
|---|---|
| refactor all at once | scope |
| ignore RTL in admin | P2 still keyboard |
| Inter fallback | FAIL gate |

---

## 3. סכמת DB

**אין DDL.** inventory read-only של `src/components`.

---

## 4. מקרי קצה

| E1 | hardcoded #fed700 vs token | swap to brand |
| E2 | border-l in BenefitBar | RTL risk |

---

## 5. פתוחות

| O1 | unused components cleanup | post-GA | 2026-08-12 |

---

## Summary

- Total component files: 72 `.tsx` (of which 6 are one line re-export shims: `admin/CouponForm`, `layout/SiteHeader`, `store/CategorySidebar`, `store/HeroSlider`, `store/HomeHeroSection`, `store/PromoBanners`).
- NOT token compliant (hardcoded hex or arbitrary values): 33 components.
- RTL risky (physical direction utilities that can break in `dir="rtl"`): 7 components (`CouponCard`, `admin/CouponDealForm`, `admin/ProductForm`, `home/BenefitBar`, `ui/dialog`, `ui/dropdown-menu`, `ui/select`).
- `src/components/features/` and `src/components/shared/` contain only `.gitkeep` (no components).
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

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING batch-2: החלטה, חלופות, DB, קצה, פתוחות |

