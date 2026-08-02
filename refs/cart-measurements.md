# Cart measurements / מדידות עגלה (Electro home-v7)

Source / מקור:

```
https://electro.madrasthemes.com/home-v7/
https://electro.madrasthemes.com/cart/
```

Method / שיטה: Chrome DevTools via CDP `getComputedStyle` + `offsetWidth/Height`.  
Viewports / נקודות שבירה:

| Name / שם | Width | Height | deviceScaleFactor | mobile |
|---|---|---|---|---|
| Mobile / מובייל | **380px** | 900px (cart) / 800px (home) | 2 | true |
| Tablet / טאבלט | **768px** | 1024px | 2 | true |

Seeded cart with 1 line: Universal Headphones Case in Black ($159) + flat shipping $50 → Total $209.  
Measured / נמדד: 2026-08-02.

Brand tokens observed / צבעי מותג שנמדדו:

| Token | RGB | Hex |
|---|---|---|
| Ink / דיו | `rgb(51, 62, 72)` | `#333e48` |
| Yellow CTA / צהוב | `rgb(254, 215, 0)` | `#fed700` |
| Gray button / אפור | `rgb(239, 236, 236)` | `#efecec` |
| Border / מסגרת | `rgb(221, 221, 221)` | `#dddddd` |
| Remove / מחיקה | `rgb(238, 0, 0)` | `#ee0000` |
| White / לבן | `rgb(255, 255, 255)` | `#ffffff` |

---

## 0. Visibility note / הערת נראות

On home-v7 the desktop mini-cart lives under:

```
.container.hidden-lg-down.d-none.d-xl-block … .dropdown-menu-mini-cart
```

So below Bootstrap `xl` (~1200px) the dropdown is **not painted** (`offsetW/H = 0`), even though computed styles still return the design values.  
מתחת ל-`xl` ה-dropdown לא מצויר בפועל; ב-380/768 המשתמש מגיע לעגלה דרך אייקון/פוטר → `/cart/`.

Computed styles below are still the authoritative design contract for the dropdown when it opens (desktop / xl+).

---

## 1. Mini-cart dropdown / תפריט מיני-עגלה

Selector: `.dropdown-menu.dropdown-menu-mini-cart`

### 1.1 Panel / פאנל

| Property / מאפיין | EN | HE | 380px | 768px | Notes |
|---|---|---|---|---|---|
| width | Width | רוחב | **332px** | **332px** | `min-width: 200px` |
| height | Height | גובה | `auto` | `auto` | content-driven |
| padding | Padding | ריפוד | **28px 0 16.8px 0** | same | top / right / bottom / left |
| margin | Margin | שוליים | **-30px 0 0 0** | same | pulls under icon |
| border-radius | Border radius | עיגול פינות | **0 0 7px 7px** | same | bottom corners only |
| box-shadow | Box shadow | צל | `0 2px 4.992px 0 rgba(0,0,0,0.28)` | same | ≈ `0 2px 5px rgba(0,0,0,.28)` |
| font-size | Font size | גודל גופן | **14px** | **14px** | |
| color | Color | צבע טקסט | `#333e48` | `#333e48` | |
| background | Background | רקע | `#ffffff` | `#ffffff` | |
| position | Position | מיקום | `absolute` | `absolute` | `top: 120%`, `right: 0`, `z-index: 1000` |
| display | Display | תצוגה | `block` (when `.show`) | same | parent hidden below xl |

### 1.2 Line item / שורת מוצר

Selector: `.woocommerce-mini-cart-item.mini_cart_item`

| Property | EN | HE | 380 / 768 |
|---|---|---|---|
| margin | Margin | שוליים | `0 28px 14px 28px` |
| padding | Padding | ריפוד | `0 0 16px 0` |
| font-size | Font size | גופן | `14px` |
| color | Color | צבע | `#333e48` |
| remove color | Remove link | צבע הסרה | `#ee0000` |
| thumb | Thumbnail | תמונה | width/height CSS **75px**, margin-right `20px` |
| qty block | Quantity | כמות | margin-left `95px` (clears thumb) |

### 1.3 Product list scroll / רשימה

Selector: `.woocommerce-mini-cart.cart_list`

| Property | EN | HE | Value |
|---|---|---|---|
| max-height | Max height | גובה מקס׳ | **200px** |
| overflow | Overflow | גלילה | `auto` (vertical scroll when many lines) |
| margin-bottom | Margin bottom | שוליים תחתונים | `16px` |

### 1.4 Mini-cart buttons / כפתורים

| Button | Background | Color | Border | Radius | Padding | Font | Margin |
|---|---|---|---|---|---|---|---|
| View cart / לצפייה בעגלה (`.button.wc-forward`) | `#efecec` | `#333e48` | `1px solid #efecec` | **22px** | `10.5px 28.98px` | 14px / 400 | `0 7px` |
| Checkout / לתשלום (`.button.checkout`) | `#fed700` | `#333e48` | `1px solid #fed700` | **22px** | `10.5px 28.98px` | 14px / 400 | `0 7px` |

Buttons wrap: `.woocommerce-mini-cart__buttons` → `text-align: center`.

### 1.5 Header cart chrome (desktop masthead)

| Element | EN | HE | Styles |
|---|---|---|---|
| Counter badge | Count pill | תג מונה | bg `#fed700`, color `#333e48`, **border-radius 50%**, width ≈ **21px**, font ≈ **12px / 700**, `position: absolute` |
| Wrap margin | Icon wrap | שוליים אייקון | margin-left ≈ **38px** |

### 1.6 Mobile cart entry (380) / כניסה במובייל

| Element | EN | HE | Measured |
|---|---|---|---|
| Handheld header | Sticky yellow bar | סרגל צהוב | bg `#fed700`, height ≈ **55px**, width 380, flex row, padding `6px 0` |
| Footer cart link | Footer cart icon | אייקון עגלה בפוטר | `.footer-cart-contents` → `/cart/`, icon ≈ 22×24, shows count `1` |
| Handheld footer bar | Footer chrome | פוטר כהה | bg `#333e48`, width 380, inner flex column, padding `20px 15px` |

---

## 2. Full cart page / דף עגלה מלא

URL: `https://electro.madrasthemes.com/cart/`

### 2.1 Page layout / פריסת עמוד

| Property | EN | HE | 380px | 768px |
|---|---|---|---|---|
| H1 `.entry-title` | Title | כותרת | 350×48, font **40px / 500**, color `#333e48`, **text-align center** | 690×48, same font, center |
| Form `.woocommerce-cart-form` | Cart form | טופס עגלה | **350×634**, `display: block` | **690×456**, `display: block` |
| Table `.shop_table.cart` | Line table | טבלת שורות | 350 wide, `display: table` but rows **stack as blocks** | 690 wide, real **table-row** cells |
| `.cart-collaterals` | Totals column wrap | עטיפת סיכום | **flex row**, 380 wide, padding-top 14px, margin `0 -15px` | **flex row**, 720 wide, padding-top **70px**, margin `0 -15px` |
| `.cart_totals` | Order summary | סיכום הזמנה | 380 wide, padding `0 15px`, full width under lines | **420px** wide, **margin-left 300px** (pushed right) |

Layout summary:

- **380:** single column. Line items stacked (responsive table). Coupon + Update full-width stacked. Cart totals full width below.
- **768:** horizontal cart table. Coupon + Apply on one row (joined radii). Cart totals ~420px aligned to the end (margin-left 300px inside 720 collaterals).

### 2.2 Line item table / טבלת מוצרים

#### 380px (stacked / רספונסיבי)

| Cell / תא | display | offset | padding | text-align | notes |
|---|---|---|---|---|---|
| `.product-remove` | `block` | 350×57 | ≈ `17.5px 8px` | right | × remove |
| `.product-thumbnail` | **`none`** | hidden | n/a | n/a | image cell hidden |
| `.product-name` | `block` | 350×140 | ≈ `17.5px 8px` | right | name + vendor |
| `.product-price` | `block` | 350×54 | ≈ `17.5px 8px` | right | |
| `.product-quantity` | `block` | 350×75 | ≈ `17.5px 8px` | right | |
| `.product-subtotal` | (same pattern) | full width blocks | | right | |
| `.cart_item` row | `block` | 350×392 | `0 0 10px 0` | | stacked card-like |

Thumbnail image CSS (even if cell hidden): height **92px**, max-width **100px**, padding 4px, border `1px solid #ddd`.

#### 768px (table / טבלה)

| Cell / תא | display | width (approx) | height | padding | text-align |
|---|---|---|---|---|---|
| `.product-remove` | `table-cell` | **35px** | 158 | ≈ `35px 8px 17.5px 8px` | start |
| `.product-thumbnail` | `table-cell` | **136px** | 158 | same | start |
| `.product-name` | `table-cell` | **245px** | 158 | same | start |
| `.product-price` | `table-cell` | **84px** | 158 | same | start |
| `.product-quantity` | `table-cell` | **107px** | 158 | same | start |
| `.product-subtotal` | `table-cell` | **84px** | 158 | same | start |
| `.cart_item` row | `table-row` | **690×158** | | 0 | |

Font in cells: ≈ **17px**, color `#333e48`.

### 2.3 Order summary (Cart totals) / סיכום הזמנה

| Property | EN | HE | 380px | 768px |
|---|---|---|---|---|
| Heading h2 | "Cart totals" | כותרת סיכום | 350×51, font **25px / 500**, padding-bottom 10px, margin-bottom 12.5px | 390×51, same type |
| Totals table | Summary table | טבלת סיכום | 350×234, `display: block` | 390×234, `display: block` |
| Row layout | Row | שורה | **`display: flex`**, width 350 | **`display: flex`**, width 390 |
| Subtotal row | Subtotal | ביניים | height 40; th 700 / td 400; padding ≈ `8px` | same pattern, width 390 |
| Shipping row | Shipping | משלוח | height ≈ 153; border-top `1px solid #ddd` | same |
| Total row | Total | סה״כ | height ≈ 41; border-top `1px solid #ddd` | same |
| Label weight | th font-weight | משקל תווית | **700** | **700** |
| Value weight | td font-weight | משקל ערך | **400** | **400** |
| Font size | Font | גופן | **14px** | **14px** |
| Color | Color | צבע | `#333e48` | `#333e48` |

### 2.4 Buttons / כפתורים

| Button | EN | HE | 380px | 768px |
|---|---|---|---|---|
| Apply coupon | Apply coupon | החל קופון | **334×48**, bg `#333e48`, color `#fff`, radius ≈ **22px**, padding ≈ `14.5px 15.9px`, font 14/**700**, **full width block** | **129×48**, bg `#333e48`, color `#fff`, radius **`0 22px 22px 0`** (joined to input), font 14/**700** |
| Update cart | Update cart | עדכון עגלה | **334×47**, bg `#efecec`, color `#333e48`, radius **22px**, padding ≈ `14.5px 30px`, font 14/400, full width, margin-bottom 20 | **138×47**, same colors/radius, **inline-block** (not full width) |
| Proceed to checkout | Proceed to checkout | המשך לתשלום | **350×55** visible instance, bg `#fed700`, color `#333e48`, border `1px solid #fed700`, radius **22px**, padding ≈ `14.5px 30px`, font 14/**700**, width 350 | **200×48**, same colors/radius/type, width ≈ **200px** (not full bleed) |

`.actions` (coupon + update region):

| BP | display | size | padding | text-align |
|---|---|---|---|---|
| 380 | `block` | 350×242 | `42px 8px 8px 8px` | left |
| 768 | `table-cell` | 690×257 | `80px 8px 8px 8px` | **right** |

### 2.5 Input fields / שדות קלט

| Field | EN | HE | 380px | 768px |
|---|---|---|---|---|
| Qty `input.qty` | Quantity | כמות | **70×40**, padding `7px 14px`, border `1px solid #ddd`, radius **14px**, bg `#fff`, color `#333e48`, font 14, max-width 70 | **85×40**, padding `7px 14px`, radius **14px**, border `#ddd`, bg `#fff` |
| Coupon `input#coupon_code` | Coupon code | קוד קופון | **334×41**, padding ≈ `7.5px 25px`, border `#ddd`, radius ≈ **22px** (all corners), bg `#fff`, margin-bottom 16, **full width block** | **152×48**, padding ≈ `7.5px 25px`, radius **`22px 0 0 22px`**, sits left of Apply |
| Placeholder | Placeholder | מציין מקום | `Coupon code` | same |

Coupon row at 768 = input + button visually one pill (left radius on input, right radius on button).

---

## 3. Quick copy tokens / אסימונים מהירים להטמעה

```
ink:        #333e48
yellow:     #fed700
gray-btn:   #efecec
border:     #dddddd
remove:     #ee0000
radius-sm:  7px   (mini-cart panel bottom)
radius-md:  14px  (qty)
radius-pill:22px  (buttons / coupon)
mini-cart-w: 332px
mini-cart-pad: 28px 0 16.8px
mini-cart-shadow: 0 2px 5px rgba(0,0,0,0.28)
mini-list-max-h: 200px
font-body: 14px
font-h1: 40px / 500
font-h2-totals: 25px / 500
```

---

## 4. Breakpoint behavior cheat-sheet / סיכום התנהגות

| Topic / נושא | 380 (mobile) | 768 (tablet) |
|---|---|---|
| Mini-cart dropdown painted? | No (parent `d-none` until xl) | No (same) |
| Cart entry | Footer / header link → `/cart/` | Same until xl; desktop masthead cart at xl+ |
| Cart lines | Stacked blocks, thumb cell hidden | Multi-column table |
| Coupon UI | Stacked full-width field + button | Inline joined field+button |
| Update cart | Full width | Compact inline |
| Checkout CTA | Full width (~350) yellow pill | ~200px yellow pill |
| Cart totals | Full width under lines | ~420px, right-biased (`margin-left: 300px`) |

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-08-02 | Initial extract from Electro home-v7 + `/cart/` at 380 and 768 (CDP computed styles) |
