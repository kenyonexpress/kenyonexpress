# Error copy (Hebrew UX)

Every customer- and cashier-facing Hebrew string for empty states, errors, confirmations, redemption outcomes, and checkout failures. Voice source: `docs/COPY-HE.md`. This file is the **lookup** grouped by situation. Identifiers stay English.

Status: binding for UI wording in this worktree. Docs only.

Rules:

- Second person. Do not mix `אתה` and `אתם` in one paragraph without a reason.
- Say what happened and what to do. No SQL, no Cardcom codes, no `digest` as the only line (`digest` is support-only on 500).
- Empty: one sentence + one CTA. Never a blank hole. Never a header search box.
- Money slots `{price}` go through integer agorot formatters. Never `toFixed`. Missing date: `לא זמין`, never `Invalid Date`.
- Forbidden: נאמנות, Escrow, "מוחזק עד מסירה", customer-visible `platform_percent`, English 404/500, white on `#fed700`.

`{price}` `{n}` `{date}` `{ref}` `{code}` `{q}` `{name}` as in COPY-HE §0.1. Codes and refs `dir="ltr"`.

---

## 1. Empty states

| Surface | Copy | CTA |
|---|---|---|
| Home deals | אין מוצרים להצגה | none (chrome stays) |
| Category / `/products` | לא נמצאו מוצרים התואמים את הבחירה שלך. | keep filters |
| Search | לא נמצאו מוצרים עבור "{q}". נסו מילת חיפוש אחרת. | stay on `/search` |
| Search count (has hits) | נמצאו `{n}` מוצרים | n/a |
| Supplier products | אין מוצרים פעילים לספק הזה כרגע. | |
| Supplier count 1 | מציג תוצאה יחידה | |
| Supplier count n | מציג `{from}` עד `{to}` מתוך `{total}` תוצאות | |
| Supplier 404 title | ספק לא נמצא | |
| Supplier 404 body | הספק לא נמצא או שאינו פעיל בקניון אקספרס. | |
| Supplier eyebrow | ספק | |
| City landing | עדיין אין אצלנו בית עסק רשום באזור הזה. אפשר לראות את כל הדילים באתר… | `/` or `/products` |
| City has municipalities | בתי העסק שאנחנו מכירים באזור הזה נמצאים ביישובים הבאים... | chips → `/products?city={slug}` |
| City unknown slug | 404 (same as forged) | |
| Cart page | סל הקניות שלך ריק כרגע. | חזור לחנות |
| Mini-cart | אין מוצרים בסל הקניות | |
| Cart drawer | העגלה ריקה | |
| Orders | עוד לא ביצעת הזמנות. | לחנות → `/products` |
| Coupons list `/account/coupons` | עדיין לא רכשת קופונים. | |
| Active coupons tile on `/account` | אין כרגע קופונים שממתינים למימוש | |
| Last order tile | עוד לא ביצעת הזמנות. | |
| Wallet ledger `/account/wallet` | עדיין אין תנועות בארנק. | none (zero balance is not this string) |
| Wishlist `/account/wishlist` | עוד לא שמרת מוצרים. לחיצה על הלב בעמוד מוצר שומרת אותו כאן. | לכל המוצרים → `/products` |
| Wishlist (short variant, do not mix on the same screen) | עדיין אין מוצרים במועדפים | להמשך קניות |
| Addresses | עדיין לא הוספת כתובת. | |
| Saved cards | אין כרטיסים שמורים. כרטיס נשמר אוטומטית בתשלום הראשון, אם בחרת בכך. | |
| Subscriptions empty | אין לך מנויים פעילים. | לדילים באתר → `/` (not `/products`) |
| Referrals unused | עדיין לא הצטרף אף אחד דרך הקוד שלכם. | |
| Referrals program off | תוכנית ההפניות תיפתח בקרוב. ברגע שהיא תופעל, יופיע כאן קוד אישי לשיתוף והמעקב אחרי הבונוסים שצברתם. | no share UI |
| WalletButtons missing | render nothing | no fake disabled Apple button |

Wishlist: prefer the long empty on `/account/wishlist` (pass 8). Heart is on the PDP, not in the header.

---

## 2. Validation (forms)

| Id | Copy |
|---|---|
| val.required | שדה חובה |
| val.phone.digits | מספר טלפון מכיל ספרות בלבד |
| val.phone.mobile | מספר נייד ישראלי הוא 10 ספרות ומתחיל ב-05 |
| val.email.space | כתובת אימייל לא יכולה להכיל רווח |
| val.email.bad | כתובת אימייל לא תקינה |
| val.cart.empty | העגלה ריקה |
| val.card.verify | לא ניתן לאמת את הכרטיס השמור כרגע, נסו שוב |
| val.address.verify | לא ניתן לאמת את הכתובת כרגע, נסו שוב |
| val.pay.verify | לא ניתן לאמת את בקשת התשלום כרגע, נסו שוב |
| val.products.load | לא ניתן לטעון את פרטי המוצרים כרגע, נסו שוב |
| val.suppliers.load | לא ניתן לטעון את פרטי בתי העסק כרגע, נסו שוב |
| promo.noCommission | לא ניתן להחיל את הקוד על העגלה הזו |
| promo.noStack | לא ניתן לצרף את הקוד הזה לקוד אחר |
| wishlist.toggle | הפעולה נכשלה. |
| uploader.couponPrice | מחיר בקניון נדרש |
| cart.unavailable | per-line warning; checkout CTA `aria-disabled` (do not invent a second Hebrew code) |

`role="alert"` on the message. Colour is not the only signal.

---

## 3. Page and inline errors

| Surface | Copy |
|---|---|
| 404 title | הדף לא נמצא |
| 404 H1 | הדף שחיפשתם לא נמצא |
| 404 body | ייתכן שהקישור ישן, שהמוצר כבר לא במלאי, או שנפלה שגיאת הקלדה בכתובת. |
| 500 H1 | משהו השתבש אצלנו |
| 500 body (`error.tsx`) | התקלה נרשמה אצלנו ואנחנו מטפלים בה. אפשר לנסות לטעון את הדף מחדש. |
| 500 global | התקלה נרשמה ואנחנו מטפלים בה. אפשר לנסות שוב בעוד רגע. |
| 500 retry | נסו שוב |
| 500 home | לדף הבית |
| Coupon unsellable | הקופון אינו זמין לרכישה |
| Coupon price missing | מחיר הקופון טרם הוגדר. נסו שוב מאוחר יותר. |
| Coupon offer ended | המבצע הסתיים |
| Coupon offer expired | תוקף ההצעה חלף. ייתכן שיפורסם מבצע חדש בקרוב. |
| Physical stock 0 | אזל מהמלאי |
| QR render fail | לא ניתן להציג QR כרגע. הקריאו את הקוד לקופאי. |
| Voucher math | יש אי התאמה בפירוט התשלום של השובר. בבית העסק ייגבה הסכום הרשום כאן, ואם משהו נראה לא תקין פנו לשירות הלקוחות לפני המימוש. |
| Supplier missing title | ספק לא נמצא |
| Supplier missing body | הספק לא נמצא או שאינו פעיל בקניון אקספרס. |
| Subscriptions load fail | לא הצלחנו לטעון את המנויים כרגע. נסה שוב עוד רגע. |
| Referrals flagged | בבדיקה (never `חשד`) |
| Gift already claimed | המתנה כבר נאספה |
| Date missing | לא זמין |
| Promo / cart | קוד לא תקין |
| Wishlist / generic write | הפעולה נכשלה. |

500 must not print the exception. Optional `error.digest` in `dir="ltr"` mono for support.

---

## 4. Checkout failures

Cart is **kept**. No vouchers. No “you were charged” unless Cardcom captured (then pending return, not this page).

| Slot | Copy |
|---|---|
| Failed page body | החיוב לא בוצע. אפשר לנסות שוב, העגלה שלך נשמרה. |
| Generic incomplete | התשלום לא הושלם |
| Return pending H1 | מאמתים את התשלום... |
| Return pending body | ההזמנה נקלטה ואנחנו ממתינים לאישור הסליקה. העמוד יתעדכן אוטומטית. |
| Return success H1 | התשלום הצליח! |
| Return success sub | הזמנה `{ref}` · שולם באתר `{price}` |
| Classify banner | `classifyCheckoutFailure` strings stay Hebrew; map provider codes off-screen |
| Empty pay | do not render; bounce `/cart` |

Do not toast a successful payment. Confirmation is the route plus email.

Webhook lost while capture succeeded: do **not** tell the customer they were not charged. Stay on pending copy.

---

## 5. Confirmations (destructive and spend)

| Surface | Copy |
|---|---|
| Delete account | Typed confirm. Body: ledger retained as required by law. Never a single click. Never “everything vanishes”. |
| Remove cart line | Instant `הסר`. No extra dialog. |
| Place order | Terms tick `תנאי שימוש` is the confirmation |
| Cancel subscription | `ביטול המנוי` then `אישור ביטול`. Notice: no refund for time already paid |
| Gift claim button | קבלת הקופון לחשבון שלי |
| Gift claim pending | מעביר את הקופון... |
| Scan confirm `/scan` | אשר וממש |
| Scan confirm `/redeem/[token]` | אשר מימוש |
| Redeem working | מאשר... |
| Redeem done | סריקה נוספת |
| Consent accept | אישור |
| Consent decline | לא תודה |

Gift must not claim on GET (mail scanners). Error from the server in red; add `role="alert"` (gap today).

---

## 6. Redemption outcomes (cashier)

Largest number on success is `{price}` **remainder at the business**, not the on-site take.

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

### 6.1 Audited against source, 2026-09-07

Checked the table above against `OUTCOME_MESSAGES` in
`src/app/api/supplier/vouchers/redeem/route.ts`. **Six of the six documented
server outcomes match the source byte for byte.** No drift.

`camera` and `lookup unavailable` are not in that record: they are client-side
strings from the scan screen and the lookup route, a different source. Kept in
the table because the cashier cannot tell the difference, but noted here so a
future audit does not go looking for them in the wrong file.

**Three outcomes exist in the source and were missing from this document:**

| Outcome | Copy | Note |
|---|---|---|
| `cancelled` | השובר בוטל | Distinct from `expired`: someone cancelled it, it did not lapse |
| `refunded` | השובר הוחזר ללקוח | The money went back. The till must not honour it |
| `invalid_request` | בקשה לא תקינה | Malformed body or an unparseable QR payload |

`refunded` matters most at a till: it is the one outcome where the customer may
genuinely believe the voucher is good, because they were holding it before the
refund happened.

### 6.2 The HTTP status each outcome returns

Not previously recorded anywhere. A till app that branches on status rather than
on `outcome` needs this, and so does anyone reading a log.

| Status | Outcomes |
|---|---|
| `200` | `success` |
| `400` | `invalid_request` |
| `401` | `unauthorized` |
| `404` | `not_found` |
| `409` | `already_redeemed`, `expired`, `cancelled`, `refunded` |
| `429` | `rate_limited` |

**All four "the voucher exists but you may not burn it" outcomes share `409`.**
So status alone cannot tell a cashier why, and any UI that shows a message must
read `outcome`, not the code. A client that maps 409 to one sentence will tell a
customer their refunded voucher was "already redeemed".

Holder screen when not presentable:

| Status | Copy |
|---|---|
| redeemed | מומש ב־`{date}` |
| refunded | הסכום ששולם באתר הוחזר לאמצעי התשלום. |
| expiring 0 | הקופון פג היום |
| expiring n | נותרו `{n}` ימים לניצול הקופון |
| chips | פעיל / מומש / פג תוקף / בוטל / הוחזר |

Email after redeem: `הקופון מומש · {name}` plus `אם לא אתם מימשתם את הקופון, פנו אלינו מיד.`

Customer on `/coupon/[id]` hint: `הציגו את הקוד בבית העסק`.

---

## 7. Wallet and coupons (account siblings)

| Slot | Copy |
|---|---|
| Wallet H1 | הארנק שלי |
| Wallet sub | קרדיט פנימי לשימוש באתר |
| Wallet balance label | היתרה שלך |
| Wallet note | קרדיט לשימוש באתר בלבד. לא ניתן למשיכה. |
| Ledger reasons | קאשבק על רכישה / שימוש בארנק / החזר על ביטול / זיכוי ידני / קרדיט על קופון שפג |
| Order link | לצפייה |
| Coupons H1 | הקופונים שלי |
| Coupons sub | הצגת הקוד או ה-QR בבית העסק. היתרה משולמת שם בזמן הסריקה. |
| Coupons CTA open | הצגת הקופון ו-QR |
| Coupons CTA closed | פרטי הקופון |
| Back to list | ← לכל הקופונים שלי |
| Wishlist H1 | רשימת המשאלות שלי |
| Wishlist add | הוסף למועדפים |
| Wishlist remove | הסר ממועדפים |
| Wishlist toast | נוסף למועדפים |

Order chips: `ממתינה לתשלום` / `שולמה` / `הושלמה` / `מומשה` / `זוכתה` / `בוטלה`. Unknown status: raw English token, do not invent Hebrew.

---

## 8. Auth chrome (short)

| Slot | Copy |
|---|---|
| info.login | התחברות |
| skip | דילוג לתוכן הראשי |
| consent.aria | הסכמה לאיסוף נתוני שימוש |

Password hints stay Hebrew. Email placeholder Latin `you@example.com` LTR.

---

## 9. Offline PWA and legal H1s

Must paint from cache. Retry is a `Link` to `/`, not an `onClick` chunk.

Copy lives in COPY-HE §15. Ink on `#fed700` is `#333e48`. H1 `אין חיבור לאינטרנט`. Title `אין חיבור`.

Legal H1s: `תקנון` / `פרטיות` / `ביטולים והחזרים` / `הצהרת נגישות`. Returns: no escrow language.

---

## 10. Toasts

| Kind | Typical |
|---|---|
| ATC fail | from cart store refusal |
| wishlist ok | נוסף למועדפים |
| wishlist fail | הפעולה נכשלה. |
| newsletter / contact | action state Hebrew |

`role="status"` unless the page also needs `role="alert"`.

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | Catalogue of empty, validation, page errors, checkout fail, confirmations, scan outcomes, wallet/coupons/wishlist |
| 2026-09-07 | Pass 9: supplier empty vs 404 (inactive is 404, not empty) |
| 2026-09-07 | Pass 10: city empty is a real answer; unknown slug 404 |
| 2026-09-07 | Pass 11: legal H1s and offline, no escrow in returns |
| 2026-09-07 | Redemption copy audited against source: 6/6 match, 3 outcomes were missing, HTTP status map added |
