# Wireframes (ASCII)

Status: DRAFT · docs only  
Viewports: **380** (handheld, שער `compare.mjs --width=380`) and **1440** (desktop measure from live).  
Direction: `dir="rtl"`. In these diagrams the **right edge is inline-start**. ASCII is LTR; labels say START/END.

## Sources

Live HTML snapshots live under `refs/` and are gitignored:

- `refs/ke_live_home.html`
- `refs/ke_live_category.html`
- `refs/ke_live_product.html`
- `refs/ke_live_cart.html`
- `refs/ke_live_checkout.html`
- `refs/ke_live_380.png`

Reconstruction: `KE_LIVE_SPEC.md`, `MEASURED-LIVE.md`, `docs/design/DESIGN-AUDIT.md`, `docs/design/MOBILE-380-SPEC.md`, `docs/design/COMPONENT-INVENTORY.md`.

Project overrides vs live WP: Heebo (not Inter), no region picker and no search in the header (logo + 3 icons), price `#E4002B` / `--color-price`, product title `--color-link` `#0062bd`, `--container-page` 1320px. Yellow CTA `--color-brand-primary` `#fed700`.

## Chrome tokens

| Surface | 380 | 1440 |
|---|---|---|
| Top bar | folded into drawer | ~38px `#333e48` text on light |
| Header | **49px** white handheld (not `--header-height` 70) | masthead ~110px under top bar |
| Touch | `--cart-touch` 44px | hover ok; still 44 on qty |
| Home grid | 2 cols | 3 cols (`columns-3` live) |
| Category grid | 2 cols | 6 cols desktop archive |
| Gutter | 15px, content ~350 | container 1320 inside 1440 |

Money strings always `dir="ltr"` (₪ + digits). No float. Coupon PDP shows three numbers: coupon (on-site), strike/value, balance at business.

WhatsApp float: bottom inline-end, `972524635550`.

Legend: `[YEL]` = yellow `#fed700`. `[RED]` = price. `[SALE]` = green onsale badge.

---

## 1. Home

Live section order (`KE_LIVE_SPEC.md`): top bar, header, category nav, hero row (departments | slider | 3 mini banners), category strip, product grid, feature bar, newsletter, footer.

### 380

```
+--------------------------------------+ 380
| [=]  LOGO-sm              (cart 0)   | 49px handheld
+--------------------------------------+
|                                      |
|  [ HERO SLIDE 1 / 5 ........  (o) ]  | stacked; no 3-col
|  ברוכים הבאים לקניון Express         |
|  [YEL] לדילים                        |
|                                      |
|  [ mini banner ]                     |
|  [ mini banner ]                     |
|  [ mini banner ]                     |
|                                      |
|  מחלקות  ----scroll---->             | 5-up strip becomes
|  [cat][cat][cat]                     | horizontal scroll
|                                      |
|  דילים                               |
|  +---------------+ +---------------+ |
|  |[SALE]  img    | | img           | | 2-col cards
|  | מסעדות        | | יופי          | | ~172px card
|  | name 12px     | | name          | | img ~144
|  | ~99  [RED]    | | 149 [RED]     | |
|  +---------------+ +---------------+ |
|  ...                                 |
|  לכל חלקי הארץ | קניה חכמה | ...     | benefit bar stacked
|  [YEL] ניוזלטר: אימייל [הירשם]      |
|  פוטר נערם                           |
+--------------------------------------+
| (WA float)                           |
```

Drawer (hamburger, opens from START / visual right): 11 departments, search, login, top-bar links. Mini-cart is a **separate** drawer.

### 1440

```
+----------------------------------------------------------------------------------------+ 1440
| ברוך הבא לעולם של קניון Express | בפריסה ארצית | ...                    התחברות START |
+----------------------------------------------------------------------------------------+ ~38
| LOGO 300x79 | [search live WP only] | [region live WP only] | account | cart[n]        | ~110
| PROJECT: LOGO                         (no search/region)              | acc | cart     |
+----------------------------------------------------------------------------------------+
| דילים חמים | עד 99 | החדשים | מסעדות | יופי | ... | קורסים בקרוב                       | nav
+------------+----------------------------------------+----------------------------------+
| מחלקות     |                                        | [mini] hottest                   |
| [list 11]  |         HERO SLIDER 5 slides           | [mini] consoles                  |
| START col  |         #eef7f9 / #eaf4f6              | [mini] laptops                   |
| ~241px     |         dots [YEL]                     | END col                          |
+------------+----------------------------------------+----------------------------------+
| category strip columns-5  [img 100] [img] [img] [img] [img]                            |
+----------------------------------------------------------------------------------------+
| product grid columns-3                                                                 |
| [card] [card] [card]   card: cat link, 1:1 img, title, [SALE], del+ins price ltr       |
+----------------------------------------------------------------------------------------+
| feature x5 | newsletter 80px [YEL] | footer widgets + copyright                        |
+----------------------------------------------------------------------------------------+
```

Compare gate: `PORT=3311 pnpm start` then `LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home`. Diff must stay under 11%.

---

## 2. Category (archive)

Live: breadcrumbs, title, filters sidebar (desktop), 6-col grid desktop / 2-col mobile. No home hero.

### 380

```
+--------------------------------------+ 380
| [=]  LOGO-sm              (cart n)   |
+--------------------------------------+
| בית > מסעדות ובתי קפה                | breadcrumb ~55px top~116
+--------------------------------------+
| מסעדות ובתי קפה                      | h1
| [מיון v]  [סינון]                    | control bar; filter = sheet
| +---------------+ +---------------+  |
| | 186-like 1:1  | |               |  | 2 cols, gap normal
| | name          | |               |  |
| | del 399 ins 99| |               |  |
| +---------------+ +---------------+  |
|            [ 1  2  3 > ]             | pagination 44px hits
+--------------------------------------+
```

Filter sheet: price range, city tags (`/city/*`), coupon-only in soft-launch. Apply/Reset 44px.

### 1440

```
+----------------------------------------------------------------------------------------+
| top bar + masthead + category nav (same chrome as home)                                |
+----------------------------------------------------------------------------------------+
| בית > מסעדות ובתי קפה                                                                  |
+------------+---------------------------------------------------------------------------+
| סינון      | h1 מסעדות ובתי קפה          מיון: פופולרי | מחיר | חדש                    |
| מחיר       | +------+ +------+ +------+ +------+ +------+ +------+                     |
| עיר        | |card  | |      | |      | |      | |      | |      |  6-col ~234px card |
| סוג        | |186^2 | |      | |      | |      | |      | |      |  img 186x186
|            | +------+ +------+ +------+ +------+ +------+ +------+                     |
|            | pagination                                                                |
+------------+---------------------------------------------------------------------------+
| footer                                                                                 |
+----------------------------------------------------------------------------------------+
```

Empty: "אין דילים בקטגוריה הזו עכשיו" + link home. Do not 404 a live nav category.

---

## 3. Product coupon (PDP)

Live `ke_live_product.html`: gallery + summary (title, price, qty, ATC). Project adds coupon economics: on-site price, value strike, balance at business, redemption block, supplier block. No review tab on live WP.

### 380

```
+--------------------------------------+ 380
| [=]  LOGO                   (cart)   |
+--------------------------------------+
| בית > מסעדות > שם הדיל               |
| [============== gallery 1:1 ======]  |
|     (thumbs scroll under)            |
| ארוחה זוגית אצל נונה...              | h1  ~25px
| שווי 399  מחיר קופון 99 [RED]        | ltr prices
| יתרה 300 בבית העסק אחרי סריקה        |
| [ - 1 + ]  [YEL הוספה לסל ]          | 44px qty + ATC
| ספק: נונה | טל | כתובת               |
| מימוש: לתאם, להציג QR, יתרה בקופה    |
| תנאים קצרים                          |
| --- קשורים 2-col ---                 |
+--------------------------------------+
```

### 1440

```
+----------------------------------------------------------------------------------------+
| chrome                                                                                 |
+----------------------------------+-----------------------------------------------------+
| gallery                          | h1                                                  |
| main image                       | price block: del 21px / ins 35px [RED]              |
| thumbs --columns-5               | "משלמים באתר 99. יתרה 300 בעסק."                    |
|                                  | qty + [YEL ATC ~192x53]                             |
|                                  | supplier card START                                 |
|                                  | redemption_instructions_he                          |
|                                  | highlights                                          |
+----------------------------------+-----------------------------------------------------+
| related products  (grid, not 6-col cramped)                                            |
+----------------------------------------------------------------------------------------+
```

Forbidden on this page: "תשלום מלא באתר", escrow, fake stock, QR of a real customer.

---

## 4. Product physical (PDP)

Soft-launch: not `active` in public catalog. Wireframe is for when physical is on. One on-site price, shipping block, no QR redemption, no balance-at-business sentence.

### 380

```
+--------------------------------------+ 380
| [=]  LOGO                   (cart)   |
+--------------------------------------+
| בית > קטגוריה > שם מוצר              |
| [============== gallery ==========]  |
| שם מוצר פיזי                         |
| 249 [RED]   (מחיר מלא באתר)          | single amount
| משלוח: הספק שולח / איסוף             | ShippingInfo
| [ - 1 + ]  [YEL הוספה לסל ]          |
| ספק + מדיניות החזרה קצרה             |
| אין בלוק QR / יתרה                   |
+--------------------------------------+
```

### 1440

```
+----------------------------------+-----------------------------------------------------+
| gallery                          | h1 + single price                                   |
|                                  | shipping: zone, ETA copy from product               |
|                                  | qty + ATC                                           |
|                                  | no redemption_instructions coupon block             |
+----------------------------------+-----------------------------------------------------+
```

Cart/checkout must not mix coupon-balance copy into a physical line.

---

## 5. Cart

Live `ke_live_cart.html`: table of lines, qty, totals, proceed. Project: coupon lines show on-site charge vs balance due later; physical shows full; site coupon form; checkout CTA yellow.

### 380

```
+--------------------------------------+ 380
| [=]  LOGO                   (cart n) |
+--------------------------------------+
| סל הקניות                            |
| +----------------------------------+ |
| | img | name                       | |
| |     | קופון 99 באתר              | |
| |     | יתרה 300 בעסק              | |
| |     | [ - 1 + ] [x]              | | 44px steppers
| +----------------------------------+ |
| קופון אתר [____] [החל]               | CartCouponForm
| לתשלום באתר        99 [ltr]          |
| יתרה בעסקים (לא עכשיו) 300           |
| [YEL מעבר לתשלום ]                   | full width 44px
| ריק: "הסל ריק" + לקטלוג              |
+--------------------------------------+
```

Mini-cart drawer (from header): same numbers, link `/cart` and `/checkout`. Unavailable line blocks checkout (`CartCheckoutButton`).

### 1440

```
+------------------------------------------------------+----------------------+
| chrome                                                                        |
+------------------------------------------------------+----------------------+
| תמונה | מוצר | מחיר אתר | כמות | מחיר שורה | הסר     | סיכום               |
|       | קופון + יתרה הערה                         | לתשלום באתר  99    |
|       |                                              | יתרות בעסק   300    |
|       |                                              | קופון אתר [  ]     |
|       |                                              | [YEL תשלום]        |
+------------------------------------------------------+----------------------+
```

Empty 1440: centered message, CTA home, no fake lines.

---

## 6. Checkout

Live `ke_live_checkout.html`: billing + order review + pay. Project: Google login if needed, wallet apply (site credit only), CardCom iframe/redirect, no PAN on our page. Soft-launch coupon-only.

### 380

```
+--------------------------------------+ 380
| LOGO (reduced chrome; still RTL)     |
+--------------------------------------+
| תשלום                                |
| שורות הזמנה (קריאה)                  |
|   דיל נונה     99 באתר               |
| לתשלום באתר              99          |
| ארנק (אופציונלי)  [החל יתרה]         | never "משיכה"
| התחברות Google אם חסר סשן            |
| [YEL לתשלום מאובטח ]                 | 44px
| משפטי ביטול קצרים + קישור /returns   |
+--------------------------------------+
```

Do not show "נאמן" / escrow. Wallet cannot exceed charged-on-site.

### 1440

```
+-------------------------------------------+---------------------------+
| פרטי לקוח / התחברות                       | סיכום הזמנה              |
| ארנק                                      | שורות + charged_on_site  |
| הערת קופון: יתרה בעסק לא נגבית כאן        | [YEL pay]                |
+-------------------------------------------+---------------------------+
```

Loading: disable double submit. Failure path: `/checkout/failed`, cart kept.

---

## 7. Success (`/checkout/return`)

### 380

```
+--------------------------------------+ 380
| chrome                                                     |
+--------------------------------------+
| התשלום הצליח!                        | or "מאמתים..."
| הזמנה #________                      |
| שולם באתר 99                         |
| הקופון מחכה ב-/account/coupons       |
| [YEL לקופונים שלי]                   |
| [ לקטלוג ]                           |
| אין QR ענק במייל כ-data URI כאן      | page may deep-link coupon
+--------------------------------------+
```

Pending webhook: "מאמתים את התשלום..." + auto refresh. Do not show a voucher code until `paid_at` is set.

### 1440

```
+----------------------------------------------------------------------------------------+
|                         התשלום הצליח!                                                  |
|                         הזמנה ...  |  שולם באתר ...                                    |
|                         [ קופונים ]  [ הזמנות ]                                        |
+----------------------------------------------------------------------------------------+
```

Physical (later): "הספק יטפל במשלוח" instead of coupons CTA.

---

## 8. Account wallet (`/account/wallet`)

Not in live WP refs. Project screen. Credit **only** for on-site pay. Not withdrawable.

### 380

```
+--------------------------------------+ 380
| [=]  LOGO                   (cart)   |
+--------------------------------------+
| חשבון | הזמנות | קופונים | ארנק      | AccountNav; badge = formatIls
| הארנק שלי                            |
| היתרה שלך                            |
| ₪45.00  [ltr]                        | from agorot, not float UI math
| אין משיכה למזומן ואין העברה.         |
| תנועות                               |
| תאריך | פעולה | סכום | הזמנה         | empty: "עדיין אין תנועות"
+--------------------------------------+
```

### 1440

```
+------------+------------------------------------------------------------------+
| nav        | h1 הארנק שלי                                                     |
| הזמנות     | יתרה גדולה + משפט אי-משיכה                                       |
| קופונים    | table ledger: date, reason label, signed amount, order link      |
| ארנק [45]  | cashback / refund-to-wallet / spend-at-checkout rows             |
+------------+------------------------------------------------------------------+
```

---

## 9. Supplier scanner (`/scan` or `/supplier/scan`)

Not in storefront refs. Three stages in `ScanClient`: input, confirm (lookup, no write), result (redeem + balance to collect).

### 380

```
+--------------------------------------+ 380
| KenyonExpress  |  {supplierName}     | SupplierNav
+--------------------------------------+
| סריקת קופון                          |
| [ camera preview / permission ]      |
| או קוד ידני [__________]             | 10 char / payload paste
| [YEL בדיקה ]                         | lookup only
|                                      |
| -- confirm --                        |
| מוצר: ...                            |
| לקוח: ...                            |
| שולם באתר: 99                        |
| לגבות בקופה: 300  (LARGE)            |
| [ אישור מימוש ] [ ביטול ]            |
|                                      |
| -- result --                         |
| מומש. לגבות 300 עכשיו.               |
| [ סריקה הבאה ]                       |
+--------------------------------------+
```

Errors: expired, already redeemed, wrong supplier, network. Never invent a balance. Double-tap uses idempotency key.

### 1440

```
+---------------------------+-----------------------------------------------+
| nav: סריקה | דוחות | צוות |                                               |
+---------------------------+  preview + manual entry side by side          |
|                           |  confirm panel: amounts ltr, CTA yellow       |
|                           |  result: print-friendly balance due           |
+---------------------------+-----------------------------------------------+
```

Staff login: `https://kenyonexpress.co.il/supplier/login`. Public scan URL: `https://kenyonexpress.co.il/scan`.

---

## Cross-cutting

| Topic | Rule |
|---|---|
| RTL | hamburger and departments at inline-start (right). Cart at inline-end (left). No `left-0` drawers. |
| Price | `dir="ltr"`. Coupon: three numbers. Physical: one. |
| Sale badge | inline-end of image (left in RTL), `#44b81b` live / `--color-sale-badge` |
| Footer | newsletter yellow 80px, widgets, copyright. Legal links: terms, privacy, returns, accessibility. |
| Compare | home (and other pages when added) vs live refs; keep under 11%. |
| Soft-launch | public IA coupon-first; physical PDP/cart copy must not leak onto coupon SKUs. |
