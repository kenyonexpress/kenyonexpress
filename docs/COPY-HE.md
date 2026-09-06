# Hebrew copy catalogue

Every customer-facing Hebrew string in one place, grouped by surface. Code identifiers stay English. This file is the voice source for storefront, transactional email, and WhatsApp. Admin console copy is out of scope except where a customer or `coupon_partner` will read it (scan outcomes).

Status: binding for UI and notification wording in this worktree. Docs only.

Companions:

```
docs/ui-design-system/PAGE-ANATOMY.md
docs/ui-design-system/COMPONENTS.md
docs/ui-design-system/TOKENS.md
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
```

Authority for money wording: `BUSINESS-MODEL-RULES.md` (when present) then `docs/PRODUCT-TYPES.md` then `docs/ARCHITECTURE-PRODUCT-TYPES.md`. Never write נאמנות, Escrow, or a fixed commission rate. Never show `platform_percent` to a customer.

---

## 0. Voice

| Rule | Do | Do not |
|---|---|---|
| Person | Second person. Storefront prefers `שלך` / imperative plural `נסו` where live already does | Mix `אתה` and `אתם` in the same paragraph without a reason |
| Brand | Latin `KenyonExpress` or Hebrew `קניון אקספרס` as live does on that surface | Translate the Latin mark on a button |
| Money | Name what is paid **on the site** and what remains **at the business** | Imply the platform holds the remainder |
| Tone | Direct, short, no English filler | "Oops", "Oops!", "Something went wrong" in English |
| Error | Say what happened and what to do | Dump SQL, Cardcom codes, or `digest` as the only explanation (digest is support-only on 500) |
| Empty | One sentence + one CTA | A blank hole or a search box in the header |

Hebrew has no italic tradition (TOKENS). Do not italicise Hebrew for emphasis; use weight.

### 0.1 Formatters (mark every slot)

| Slot in this file | Formatter | Notes |
|---|---|---|
| `{price}` | `formatAgorot` / `shekels` / `formatIls` / `shekelsFromIls` | Integer **agorot** in, `he-IL` ILS out. Shekel sign on the left. Never interpolate raw agorot |
| `{pct}` | integer percent | Live coupon badge glyph is `{pct}%-` (percent then Hebrew minus). Isolate the run |
| `{n}` | decimal `he-IL` | Counts (items, days, results). Integer, not a float |
| `{from}` `{to}` `{total}` | decimal `he-IL` | Supplier/category range line |
| `{date}` | `formatDate` / `formatCouponDate` / `toLocaleDateString('he-IL')` | Calendar day, timezone `Asia/Jerusalem` |
| `{datetime}` | `formatDateTime` / `hebrewDateTime` | Day + time |
| `{q}` | raw query | Isolate mixed Latin with `<bdi>` |
| `{ref}` | order short id | `dir="ltr"`, usually first 8 of UUID uppercased |
| `{code}` | `formatCouponCode` | `dir="ltr"` mono. Never put `{code}` in a WhatsApp prefill to a supplier |
| `{name}` | `name_he` | Product or person. Proper nouns may mix Latin |
| `{phone}` | `formatIsraeliPhoneDisplay` | `dir="ltr"`, local `05X-XXX-XXXX` |
| `{email}` | as typed | Field `dir="ltr"` |

Missing date renders `לא זמין`, never `Invalid Date`.

---

## 1. Chrome (every storefront page)

### 1.1 Skip and consent

| Id | String | Slot |
|---|---|---|
| skip | דילוג לתוכן הראשי | SkipLink |
| consent.aria | הסכמה לאיסוף נתוני שימוש | banner `aria-label` |
| consent.body | אנחנו אוספים נתוני שימוש באתר (עמודים שנצפו, פריטים שנוספו לעגלה) כדי לשפר אותו ולמדוד פרסום. חלק מהנתונים מועברים ל-Google Analytics ול-Meta, בלי שם, מייל או טלפון. בלי אישור שום כלי חיצוני לא נטען כלל. הזמנות ותשלומים נשמרים בכל מקרה, כחלק מהשירות. | body |
| consent.decline | לא תודה | equal-weight button |
| consent.accept | אישור | equal-weight button |

### 1.2 Info bar and header

| Id | String |
|---|---|
| info.login | התחברות |
| info.safe | קניה בטוחה |
| info.shipping | משלוח מהיר חינם |
| info.nationwide | בפריסה ארצית |
| info.homeGreeting | ברוך הבא לעולם של קניון Express |
| nav.aria | ראשי |
| nav.departments | מחלקות |
| nav.region | בחר אזור |
| nav.cart | עגלה, `{n}` פריטים |
| drawer.aria | תפריט קטגוריות |
| wa.float | וואטסאפ |
| footer.newsletter.label | הצטרפו לרשימת הדיוור |
| footer.newsletter.submit | הרשמה |
| footer.newsletter.placeholder | you@example.com (Latin, field `dir="ltr"`) |

### 1.3 Home (structure copy; product names and prices come from live catalogue)

| Id | String | Slot |
|---|---|---|
| home.dealsEmpty | אין מוצרים להצגה | deals grid |
| home.heroCta | לרכישה / קנה עכשיו | hero / promo (live) |
| home.metadata | קניון EXPRESS: מסדרים לך בילוי | document title (keep live) |

USP labels and category names are catalogue/live content, not invented here.

---

## 2. Buttons (purchase and navigation)

| Id | String | Where |
|---|---|---|
| btn.atc | הוספה לעגלה | PDP (children of AddToCartButton) |
| btn.atc.aria | הוסף `{name}` לעגלה | icon ATC on cards |
| btn.buyNow | קנה עכשיו | physical PDP (live-equivalent) |
| btn.checkout | המשך לתשלום | cart, mini-cart |
| btn.placeOrder | לתשלום / הזמנה | checkout final (Electro structure, Hebrew ours) |
| btn.backStore | חזור לחנות | empty cart → `/products` |
| btn.allProducts | לכל המוצרים | 404 |
| btn.browseCategories | עיון בקטגוריות | 404 |
| btn.home | לדף הבית | 404 / 500 |
| btn.retry | נסו שוב | 500 |
| btn.details | פרטים | order row |
| btn.orderDetail | לפרטי ההזמנה | account / email CTA |
| btn.wishlist.add | הוסף למועדפים | |
| btn.wishlist.remove | הסר ממועדפים | |
| btn.qty.inc | הגדל כמות | |
| btn.qty.dec | הקטן כמות | |
| btn.removeLine | הסר | cart line |
| btn.waze | ניווט ב-Waze | Waze stays Latin |
| btn.call | חייג | |
| btn.wallet.apple | (named Apple Wallet link, omit if missing) | |
| btn.wallet.google | (named Google Wallet link, omit if missing) | |
| btn.payRetry | חזרה לעגלה | checkout failed |

Disabled checkout is still labelled `המשך לתשלום` with `aria-disabled`. Do not relabel it "לא זמין" without also naming the blocking line.

---

## 3. Labels (forms and definitions)

### 3.1 Product

| Id | String | Formatter |
|---|---|---|
| pdp.price.regular | מחיר רגיל: `{price}` | strike `{price}` |
| pdp.price.kenyon | מחיר בקניון: `{price}` | current `{price}` |
| pdp.split.online | לתשלום באתר עכשיו | `{price}` |
| pdp.split.business | יתרה לתשלום בבית העסק | `{price}` |
| pdp.split.total | סה"כ שווי | `{price}` |
| pdp.qty | כמות | `{n}` in the field, `dir="ltr"` |
| pdp.expiry | תקף `{n}` ימים מיום הרכישה | `{n}` days |
| pdp.stock | נותרו `{n}` | `{n}` units; omit if untracked |
| pdp.oos | אזל מהמלאי | |
| cat.sort | מיון | |
| cat.crumb.aria | פירורי לחם | |
| cat.pages.aria | עמודים | |
| breadcrumb.home | בית | |
| breadcrumb.search | חיפוש | |
| supplier.eyebrow | ספק | |
| supplier.address | כתובת | omit row if empty |
| supplier.phone | טלפון | `{phone}` |
| supplier.wa | וואטסאפ | |

### 3.2 Cart and totals

| Id | String | Formatter |
|---|---|---|
| cart.h1 | עגלה | |
| cart.total | סה״כ | `{price}` |
| cart.payOnSite | לתשלום באתר / סה"כ לתשלום באתר | `{price}` |
| cart.coupon.invalid | קוד לא תקין | |
| cart.coupon.field | קוד קופון (פלטפורמה) | code `dir="ltr"` |

### 3.3 Checkout

| Id | String |
|---|---|
| co.step.details | פרטים אישיים |
| co.step.address | כתובת למשלוח |
| co.step.review | ביקורת הזמנה |
| co.step.confirm | אישור ותשלום |
| co.paymentNote | אמצעי התשלום |
| co.privacy | פרטיות |
| co.terms | תנאי שימוש |
| co.failed.h1 | התשלום לא הושלם |
| co.failed.title | התשלום נכשל |
| co.return.checking | בודקים את התשלום… |

Field names (Hebrew visible labels): first/last name, phone, email, city, street, street number, apartment, floor, zip. Zip and phone `dir="ltr"`.

### 3.4 Account

| Id | String | Formatter |
|---|---|---|
| acc.h1 | האזור האישי | |
| acc.sub | סקירה מהירה של החשבון שלך | |
| acc.wallet | יתרת הארנק | `{price}` |
| acc.wallet.note | קרדיט לשימוש באתר בלבד. לא ניתן למשיכה. | |
| acc.wallet.pageNote | הארנק משמש לתשלום חלקי או מלא באתר. אין משיכה למזומן ואין העברה למשתמש אחר. | |
| acc.lastOrder | ההזמנה האחרונה | `{price}` `{date}` `{n}` |
| acc.couponsTile | קופונים פעילים | `{n}` |
| acc.coupons.ready | מוכנים לסריקה בבית העסק | |
| acc.orders.h1 | ההזמנות שלי | |
| acc.orders.count | `{n}` הזמנות | `{n}` |
| acc.orders.meta | `{date} · {n} פריטים` | optional ` · כולל קופונים` |
| acc.wishlist.h1 | רשימת מועדפים | |
| acc.wishlist.cta | להמשך קניות | |
| voucher.pageTitle | הקופון שלי | |
| voucher.back | לכל הקופונים שלי | |
| voucher.showCode | הציגו את הקוד בבית העסק | |
| voucher.paid | שולם באתר | `{price}` |
| voucher.due | לתשלום בבית העסק | `{price}` |
| voucher.face | מחיר מלא | `{price}` |
| voucher.until | בתוקף עד | `{date}` |
| voucher.business | פרטי בית העסק | |
| voucher.fallbackName | שובר | |

### 3.5 Auth

| Id | String |
|---|---|
| auth.login | כניסה לחשבון |
| auth.or | או |
| auth.signup | יצירת חשבון |
| auth.forgot | שחזור סיסמה |
| auth.reset | בחרו סיסמה חדשה |
| auth.reset.help | הסיסמה חייבת להכיל לפחות 8 תווים וספרה אחת. |
| auth.mfa | אימות דו-שלבי |
| auth.mfa.help | הזן את הקוד מאפליקציית האימות שלך כדי להמשיך לפאנל. |
| auth.mfa.aria | קוד אימות |
| auth.phone.hint | מספר ישראלי (050, 052, 054 וכו׳) |
| auth.pass.ph | לפחות 8 תווים + ספרה |
| auth.pass.again | הזינו שוב את הסיסמה |

Email placeholders stay Latin `you@example.com` (`dir="ltr"`). Phone placeholder `050-1234567` (`dir="ltr"`).

---

## 4. Validation errors

Shared:

| Id | String |
|---|---|
| val.required | שדה חובה |
| val.phone.digits | מספר טלפון מכיל ספרות בלבד |
| val.phone.mobile | מספר נייד ישראלי הוא 10 ספרות ומתחיל ב-05 |
| val.email.space | כתובת אימייל לא יכולה להכיל רווח |
| val.email.bad | כתובת אימייל לא תקינה |

Checkout / cart server:

| Id | String |
|---|---|
| val.cart.empty | העגלה ריקה |
| val.card.verify | לא ניתן לאמת את הכרטיס השמור כרגע, נסו שוב |
| val.address.verify | לא ניתן לאמת את הכתובת כרגע, נסו שוב |
| val.pay.verify | לא ניתן לאמת את בקשת התשלום כרגע, נסו שוב |
| val.products.load | לא ניתן לטעון את פרטי המוצרים כרגע, נסו שוב |
| val.suppliers.load | לא ניתן לטעון את פרטי בתי העסק כרגע, נסו שוב |

Promo codes (`src/lib/growth/discount.ts`):

| Id | String |
|---|---|
| promo.noCommission | לא ניתן להחיל את הקוד על העגלה הזו |
| promo.noStack | לא ניתן לצרף את הקוד הזה לקוד אחר |

Wishlist failure: `הפעולה נכשלה.`

---

## 5. Toasts

Sonner light theme (TOKENS §1.7). `role="status"` unless the page also needs `role="alert"`.

| Id | Typical string | Kind |
|---|---|---|
| toast.atc.ok | (product added; keep short, include `{name}` if shown) | success |
| toast.atc.fail | from cart store refusal | error |
| toast.wishlist.ok | נוסף למועדפים | success |
| toast.wishlist.fail | הפעולה נכשלה. | error |
| toast.newsletter.ok | (double opt-in sent; see newsletter action) | success |
| toast.newsletter.err | from `NewsletterState` | error |
| toast.contact.ok | (lead received) | success |

Do not toast a successful payment. Confirmation is a route (`/checkout/return`) plus email.

---

## 6. Empty states

| Surface | Copy | CTA |
|---|---|---|
| Home deals | אין מוצרים להצגה | none (chrome stays) |
| Category / `/products` | לא נמצאו מוצרים התואמים את הבחירה שלך. | keep filters |
| Search | לא נמצאו מוצרים עבור "{q}". נסו מילת חיפוש אחרת. | `{q}` |
| Search count | נמצאו `{n}` מוצרים | `{n}` |
| Supplier products | אין מוצרים פעילים לספק הזה כרגע. | |
| Supplier count 1 | מציג תוצאה יחידה | |
| Supplier count n | מציג `{from}` עד `{to}` מתוך `{total}` תוצאות | |
| Cart page | סל הקניות שלך ריק כרגע. | חזור לחנות |
| Mini-cart | אין מוצרים בסל הקניות | |
| Cart drawer | העגלה ריקה | |
| Orders | עוד לא ביצעת הזמנות. | |
| Coupons list | עדיין לא רכשת קופונים. | |
| Active coupons tile | אין כרגע קופונים שממתינים למימוש | |
| Wallet ledger | עדיין אין תנועות בארנק. | |
| Wishlist | עדיין אין מוצרים במועדפים | להמשך קניות |
| Saved cards | אין כרטיסים שמורים. כרטיס נשמר אוטומטית בתשלום הראשון, אם בחרת בכך. | |
| Referrals | עדיין לא הצטרף אף אחד דרך הקוד שלכם. | |
| City landing | עדיין אין אצלנו בית עסק רשום באזור הזה. אפשר לראות את כל הדילים באתר… | |

---

## 7. Confirmation dialogs

| Surface | Copy |
|---|---|
| Delete account | Typed confirm. Destructive. Never a single click. Body must say the ledger is retained as required by law (privacy page), not "everything vanishes". |
| Remove cart line | Instant; named `הסר`. No extra dialog. |
| Place order | The terms tick on checkout confirm is the confirmation. Label `תנאי שימוש`. |
| Supplier scan confirm | אשר וממש (scan UX). Double submit blocked by idempotency key, not by copy. |

---

## 8. Error states (pages and inline)

| Surface | Copy |
|---|---|
| 404 title | הדף לא נמצא |
| 404 h1 | הדף שחיפשתם לא נמצא |
| 404 body | ייתכן שהקישור ישן, שהמוצר כבר לא במלאי, או שנפלה שגיאת הקלדה בכתובת. |
| 500 h1 | משהו השתבש אצלנו |
| 500 body | התקלה נרשמה אצלנו ואנחנו מטפלים בה. אפשר לנסות לטעון את הדף מחדש. |
| 500 global | התקלה נרשמה ואנחנו מטפלים בה. אפשר לנסות שוב בעוד רגע. |
| Coupon unsellable | הקופון אינו זמין לרכישה / מחיר הקופון טרם הוגדר. נסו שוב מאוחר יותר. |
| Coupon expired offer | המבצע הסתיים / תוקף ההצעה חלף. ייתכן שיפורסם מבצע חדש בקרוב. |
| Checkout failed body | החיוב לא בוצע. אפשר לנסות שוב, העגלה שלך נשמרה. |
| QR render fail | לא ניתן להציג QR כרגע. הקריאו את הקוד לקופאי. |
| Voucher math | יש אי התאמה בפירוט התשלום של השובר. בבית העסק ייגבה הסכום הרשום כאן, ואם משהו נראה לא תקין פנו לשירות הלקוחות לפני המימוש. |
| Supplier missing title | ספק לא נמצא |
| Supplier missing desc | הספק לא נמצא או שאינו פעיל בקניון אקספרס. |
| Date missing | לא זמין |

Voucher status chips (`COUPON_STATUS_LABELS`): `פעיל` / `מומש` / `פג תוקף` / `בוטל` / `הוחזר`.

Order chips: `ממתינה לתשלום` / `שולמה` / `הושלמה` / `מומשה` / `זוכתה` / `בוטלה`.

Voucher not presentable:

| Status | Extra |
|---|---|
| redeemed | מומש ב־`{date}` |
| refunded | הסכום ששולם באתר הוחזר לאמצעי התשלום. |
| expiring 0 | הקופון פג היום |
| expiring n | נותרו `{n}` ימים לניצול הקופון |

---

## 9. Email subjects

All subjects Hebrew. `{price}` via `formatAgorot`. `{ref}` LTR. `{n}` count. `{name}` product. `{datetime}` from payload snapshot, never live catalogue.

| Kind | Subject |
|---|---|
| voucher_issued ×1 | הקופון שלך מוכן: `{name}` (fallback `קופון KenyonExpress`) |
| voucher_issued ×n | `{n}` קופונים מוכנים לך ב-KenyonExpress |
| order_paid | ההזמנה שלך התקבלה · `{ref}` |
| supplier_sale | מכירה חדשה ב-KenyonExpress · הזמנה `{ref}` |
| voucher_redeemed | הקופון מומש · `{name}` |
| voucher_gifted | `{sender}` שלח לך מתנה: `{name}` (no sender: `קיבלת מתנה: {name}`) |
| voucher_expiring 1d | `{name}` פג מחר |
| voucher_expiring | `{name}` פג `{when}` (`מחר` / `בעוד יומיים` / `בעוד {n} ימים`) |
| cashback_credited | נכנס לך קאשבק של `{price}` |
| refund_completed | הזיכוי שלך בוצע: `{price}` |
| welcome | ברוכים הבאים ל-KenyonExpress |
| invoice_dead (ops) | נכשלה הנפקת מסמך להזמנה `{ref}` |
| low_stock (ops) | מלאי נמוך: `{name}` / `אזל המלאי: {name}` |
| reconciliation_gap (ops) | פערי סליקה מול המסוף (`{day}`) |

Customer body rules:

- Greeting `שלום {name},` or `שלום,`
- Order paid: `התשלום התקבל וההזמנה שלך נקלטה.` Lines: `מספר הזמנה`, `סך הכל שולם באתר: {price}`, `פריטים: {n}`. CTA `לפרטי ההזמנה`. Footer `קיבלת את המייל הזה כי ביצעת רכישה ב-KenyonExpress.`
- Voucher issued: `הקופון שלך מוכן לשימוש.` Each block: code, `שולם באתר: {price}`, `לתשלום בבית העסק: {price}`, `מחיר מלא: {price}`, `בתוקף עד {date}`. Button `הצגת הקופון ו-QR`. No embedded QR image. Hint to read the code aloud if the screen will not scan.
- Redeemed: where and `{datetime}`, `נגבה בבית העסק: {price}` if collected > 0, plus `אם לא אתם מימשתם את הקופון, פנו אלינו מיד.`
- Expiring: must include a real deadline or do not send.
- Refund: never promise a bank date. `cancel_only`: `ביטלנו את החיוב… הסכום לא ייגבה כלל.` Else `זיכינו את הכרטיס שלך ב-{price}`. Fee line only if fee > 0: `נוכו דמי ביטול בסך {price} לפי התקנון.`
- Cashback: do not send for `{price}` of 0.
- Invoice link points at `/account/orders/{id}/invoice`, never a raw provider URL.
- Supplier sale: not called a payout. `התקבלה אצלכם מכירה חדשה.` `סכום ההזמנה אצלכם: {price}`.

---

## 10. WhatsApp templates

Prefill text. Numbers `{phone}` are in the URL, not the body, except display.

| Id | Template | Slots | Must not |
|---|---|---|---|
| wa.productShare | מצאתי משהו שווה ב-KenyonExpress: `{name}`: `{price-split}` (`{pct}% הנחה`) | Coupon: `{price}` באתר ועוד `{price}` בבית העסק. Physical: single `{price}`. Unsellable coupon: name only, no sticker price | Bake the URL (the channel appends it). Quote `price_ils` on a coupon |
| wa.couponForward | קופון מ-KenyonExpress 🎁 / `{name}` / `קוד: {code}` / `לתשלום בעסק במימוש: {price}` / `בתוקף עד {date}` / `{url}` | `{price}` from remaining due agorot | Divide agorot by 100 in the caller |
| wa.supplierInquiry | שלום, ראיתי ב-KenyonExpress ואשמח לפרטים על "{name}" | fallback `על דיל שראיתי` | |
| wa.redeemInquiry | שלום, יש לי קופון מ-KenyonExpress על "{name}" ואשמח לתאם מימוש | | Include `{code}` |
| wa.orderInquiry | שלום, אשמח לעדכון על הזמנה `{ref}` שביצעתי באתר KenyonExpress | `{ref}` | |
| wa.orderUpdate | שלום `{name}`, / עדכון מ-KenyonExpress על הזמנה `{ref}`: `{status}` | greeting without name: `שלום,` | |

Share builder currently concatenates with a dash in source. Canonical here is a colon so the sentence stays Hebrew punctuation.

---

## 11. Scan outcomes (`coupon_partner` / supplier)

From `docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md`. Cashier-facing.

| Outcome | Copy |
|---|---|
| success | השובר מומש בהצלחה |
| already_redeemed | השובר כבר מומש |
| expired | תוקף השובר פג |
| not_found | קוד שובר לא נמצא |
| unauthorized | אין הרשאת ספק |
| rate_limited | יותר מדי סריקות, המתן רגע |
| camera | לא ניתן לגשת למצלמה |
| lookup unavailable | לא ניתן לבדוק את השובר כרגע, נסו שוב בעוד רגע |

Success screen: the **largest** number is `{price}` remainder at the business. Do not congratulate with the on-site amount alone.

---

## 12. Forbidden phrases

Do not ship:

- נאמנות, Escrow, "מוחזק עד מסירה", "שחרור לספק אחרי סריקה"
- Any customer-visible `platform_percent` or "עמלת פלטפורמה `{pct}%`" as a fixed rate
- English 404/500 ("Not Found", "Application error")
- Header/drawer search prompt (standing rule)
- Sticker price as the share price of a coupon
- Voucher code in a WhatsApp message to the business
- `Invalid Date`, `undefined`, `cancelled` as a visible chip (use `בוטל`)
- White text on `#fed700` (contrast). Ink on yellow is slate `#333e48`

---

## 13. Checkout return and city (deepen)

| Id | String | Slot |
|---|---|---|
| ret.title | אישור הזמנה | metadata |
| ret.pending.h1 | מאמתים את התשלום... | pending / Suspense |
| ret.pending.body | ההזמנה נקלטה ואנחנו ממתינים לאישור הסליקה. העמוד יתעדכן אוטומטית. | |
| ret.ok.h1 | התשלום הצליח! | paid |
| ret.ok.sub | הזמנה `{ref}` · שולם באתר `{price}` | `{ref}` LTR, `{price}` formatter |
| ret.coupons | הקופונים שלך | h2 + aria-label |
| ret.collect | לתשלום בעסק במימוש: `{price}` | |
| ret.until | בתוקף עד `{date}` · הציגו את הקוד או את ה-QR בבית העסק | `{date}` he-IL |
| city.title | דילים ב`{name}` | H1 and title |
| city.meta | קופונים ומבצעים מבתי עסק ב`{name}`. כל שובר נסרק פעם אחת, והתוקף מוצג לפני הרכישה. | |
| city.body | בתי העסק שאנחנו מכירים באזור הזה נמצאים ביישובים הבאים. בחרו יישוב כדי לראות את הדילים שלו. | |
| crumb.homeAlt | דף הבית | city trail (elsewhere `בית`) |
| nav.trail | מסלול ניווט | city `aria-label` (elsewhere `פירורי לחם`) |

`דף הבית` vs `בית` is live drift. New breadcrumbs use `בית` (COPY-HE §3.1). Do not mass-edit city until a dedicated unify pass.

---

## 14. Revision

| Date | Change |
|---|---|
| 2026-09-07 | Initial catalogue: chrome, buttons, labels, validation, toasts, empty, dialogs, errors, email subjects, WhatsApp, scan outcomes |
| 2026-09-07 | Deepen: checkout return and city strings |
