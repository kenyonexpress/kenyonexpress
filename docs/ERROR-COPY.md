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

Wishlist: prefer the long empty on `/account/wishlist` (pass 8). The heart is specified for the PDP and not the header, and **as of pass 14 it ships in neither**: `product/WishlistButton.tsx` has zero import sites and no `WishlistToggle` exists. So the two empty states above are currently the *only* reachable wishlist copy, and `נוסף למועדפים` has no trigger. Keep the strings; they are correct for when the control is wired in. See `docs/COMPONENT-INVENTORY.md` pass 14.

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

## 11. Coverage map: what this document does and does not hold

The sections above were written surface by surface. This is the orthogonal cut,
counted against the source, so the size of the remaining gap is a number rather
than a feeling.

### 11.1 The count

Hebrew string literals under `src/server` and `src/lib`, excluding tests:

| | Count |
|---|---|
| Distinct Hebrew literals | **1075** |
| Already quoted in this document | 82 |
| Not in this document | **993** |

**993 is not a to-do list.** Most of those literals are not UX copy at all, and
a pass that tried to paste them in would bury the strings that matter. The
breakdown by origin, largest first:

| Count | Origin | Is it UX copy? |
|---|---|---|
| 379 | `src/server/actions` | **Yes.** Action results and validation failures. The real gap. |
| 145 | `src/lib/admin` | **No.** Mostly Hebrew *code comments* (`מטמון קטלוג`, `הקריאות עוברות ישר ל-Postgres`). |
| 129 | `src/lib/email` | Partly. Email and WhatsApp templates, a separate surface from in-page copy. |
| 92 | `src/lib/search` | **No.** Synonym and taxonomy data (`{"מסעדה": ["מסעדות"]}`). |
| 85 | `src/lib/ke-live-deals-data.ts` | **No.** Seed catalogue content. |
| 59 | `src/lib/commerce` | Partly. Product-type labels (`מוצר פיזי`). |
| 58 | `src/lib/validations` | **Yes.** Form validation. Fully listed in 11.2. |
| 38 | `src/lib/regions.ts` | **No.** Place names. |
| 26 | `src/lib/geo` | **No.** City names. |
| 26 | `src/lib/supplier` | Partly. Payout status labels (`ממתין`, `פוצל`). |
| 24 | `src/lib/cart` | **Yes.** Cart availability messages. |
| 20 | `src/server/domain` | **Yes.** Refund-eligibility explanations. |
| 19 | `src/lib/ke-live-hero-data.ts` | **No.** Hero slide copy. |
| 17 | `src/lib/push` | Partly. Relative-day labels (`מחר`, `2 ימים`). |
| 16 | `src/lib/health` | **No.** Operator-facing health descriptions. |
| 14 | `src/lib/wallet` | Partly. Wallet-pass field labels. |

Narrowing to strings that are actually **returned to the UI as an error or a
validation message** (an `error:` / `message:` property, or a Zod
`.min()` / `.max()` / `.regex()` / `required_error` message):

| | Count |
|---|---|
| Error and validation strings found | **207** |
| Already in this document | 11 |
| **Undocumented** | **196** |

### 11.2 Validation messages, complete

The one cluster small enough to finish in a single pass, so it is finished here.

`src/lib/validations/auth.ts`

```
אימייל נדרש                              סיסמה נדרשת
אישור סיסמה נדרש                          מספר טלפון נדרש
הסיסמאות אינן תואמות                       מספר טלפון לא תקין
הסיסמה חייבת להכיל לפחות 8 תווים            הקוד מורכב מספרות בלבד
הסיסמה חייבת להכיל לפחות ספרה אחת           שם מלא חייב להכיל לפחות 2 תווים
```

`src/lib/validations/checkout.ts`

```
יש למלא שם פרטי          יש למלא רחוב            אימייל לא תקין
יש למלא שם משפחה         יש למלא מספר בית         אימייל ארוך מדי
יש למלא עיר              יש לאשר את התקנון        שם מלא נדרש
טלפון בפורמט 05XXXXXXXX  שם עיר ארוך מדי          שם רחוב ארוך מדי
מספר בית ארוך מדי         מספר דירה ארוך מדי       קומה ארוכה מדי
ההערות ארוכות מדי         הברכה ארוכה מדי
כתובת המייל של המקבל אינה תקינה
סכום ארנק לא יכול להיות שלילי
```

`src/lib/validations/account.ts`

```
יש להזין שם מלא     השם ארוך מדי        מספר טלפון קצר מדי
יש להזין עיר        שם העיר ארוך מדי     מספר טלפון ארוך מדי
יש להזין רחוב       שם הרחוב ארוך מדי    ההערה ארוכה מדי
```

`src/lib/validations/cart.ts`

```
כמות לא תקינה        כמות מינימלית: 1        כמות מקסימלית: 99
```

`src/lib/cart/store.ts`

```
הפעולה נכשלה, נסו שוב            הפריט הוסר מהעגלה
```

#### Two wording inconsistencies visible only once they are side by side

1. **Three verbs for "fill this in".** `checkout.ts` says `יש למלא`,
   `account.ts` says `יש להזין`, and `steps.ts` (documented in section 2) says
   `שדה חובה`. All three mean the same thing and a shopper meets at least two of
   them in one purchase.
2. **Two phone formats.** `auth.ts` says `מספר טלפון לא תקין`, `checkout.ts`
   says `טלפון בפורמט 05XXXXXXXX`, and `steps.ts` says
   `מספר נייד ישראלי הוא 10 ספרות ומתחיל ב-05`. The third is the most useful
   because it says what to do; the first says only that something is wrong.

Neither is a defect. Both are worth one decision rather than three.

### 11.2a The money path, complete (pass 13)

11.3 named `payments/checkout.ts` and `payments/refund.ts` as the two to take
first, because a shopper who meets one of these has already tried to pay. Both
are now complete, verbatim from source.

**`src/server/actions/payments/checkout.ts`**

| Situation | Copy |
|---|---|
| Not signed in at pay time | יש להתחבר לפני התשלום |
| Rate limited | יותר מדי ניסיונות תשלום, המתינו דקה |
| Duplicate submit | בקשת תשלום כפולה |
| Provider unreachable | שגיאה בחיבור לספק הסליקה |
| Payments switched off | התשלום מושבת כרגע, נסו שוב מאוחר יותר |
| Saved card missing | הכרטיס השמור לא נמצא |
| Saved card expired | תוקף הכרטיס השמור פג |
| Address required (physical) | נדרשת כתובת למשלוח |
| Address fields incomplete | יש למלא שם, עיר, רחוב ומספר בית למשלוח |
| Address invalid | כתובת לא תקינה |
| Address save failed | שמירת הכתובת נכשלה, נסו שוב |
| Cart line vanished | מוצר בעגלה אינו קיים עוד |
| Wallet short | יתרת הארנק אינה מספיקה |
| Stock reservation failed | לא הצלחנו לשריין את המלאי, נסו שוב |
| Subscription mixed into a normal cart | מנוי נרכש בהזמנה נפרדת. סיימו קודם את רכישת המנוי או הסירו אותו מהעגלה |

Five `לא ניתן לאמת…` / `לא ניתן לטעון…` strings on this path are already in
section 2 and are not repeated here.

**`src/server/actions/payments/refund.ts`**

| Situation | Copy | Code |
|---|---|---|
| Caller is not admin | אין הרשאה | `FORBIDDEN` |
| Unknown order | הזמנה לא נמצאה | `NOT_FOUND` |
| Nothing to credit | לא נמצא תשלום לזיכוי | `STATE_INVALID` |
| No Cardcom transaction id | לתשלום אין מזהה עסקה ב-Cardcom | `STATE_INVALID` |
| Unreadable amount | לתשלום אין סכום קריא | `STATE_INVALID` |
| Order has no items | להזמנה אין פריטים | `STATE_INVALID` |
| Computed refund is zero | סכום הזיכוי הוא אפס | `STATE_INVALID` |

#### Three notes on this set

1. **`בקשת תשלום כפולה` is the double-submit guard, and it is a success-adjacent
   message.** A shopper who sees it may already have a payment in flight. It must
   never sit next to "you were not charged". Pair it with the pending copy in
   section 4, not with the failure copy.
2. **Every refund string is operator-facing.** They surface in the admin panel,
   not to a customer, which is why `לתשלום אין מזהה עסקה ב-Cardcom` may name the
   provider. Do not reuse these on a customer surface: section 3's rule against
   Cardcom codes in customer copy still holds.
3. **`מנוי נרכש בהזמנה נפרדת…` is the only string here that tells the shopper
   what to do next**, and it is the model the rest should follow. Compare it with
   `כתובת לא תקינה`, which says only that something is wrong. Same wording
   problem as the phone messages in 11.2.

### 11.3 The remaining gap, by file

240 undocumented error strings across 32 files under `src/server/actions`.
Largest first, so a later pass can take them in order of reach:

```
20  account.ts            13  reviews.ts          8  admin/discounts.ts
17  payments/checkout.ts  13  auth.ts             8  admin/categories.ts
17  admin/products.ts     11  admin/vouchers.ts   7  payments/refund.ts
13  supplier-lead.ts       9  contact.ts          7  admin/images.ts
                           9  newsletter.ts       6  gifts.ts
                           9  admin/orders.ts     6  subscriptions.ts
                           8  admin/coupon-deals.ts  6  admin/payouts.ts
```

`payments/checkout.ts` and `payments/refund.ts` are the two to take first: they
are the money path, and a shopper who meets one of those strings has already
tried to pay.

## 13. Checkout failure family and gift claim family (pass 14)

Section 4 named three checkout slots. The live voice source (`docs/COPY-HE.md`)
and the anatomy (`docs/ui-design-system/PAGE-ANATOMY.md` §6.5) carry more, and
two of them look interchangeable and are not.

### 13.1 Three different "payment failed" strings

| Slot | Id | Copy | Where |
|---|---|---|---|
| Document title | `co.failed.title` | התשלום נכשל | `/checkout/failed` metadata |
| H1 | `co.failed.h1` | התשלום לא הושלם | same page, visible |
| Body | (ERROR-COPY §4) | החיוב לא בוצע. אפשר לנסות שוב, העגלה שלך נשמרה. | same page |
| CTA | `btn.payRetry` | חזרה לעגלה | → `/cart` |

Do not collapse these into one sentence. The title is a tab label, the H1 is
the outcome, the body is the recovery. A page that prints only `התשלום נכשל`
hides that the cart survived.

### 13.2 Two different "we are checking" strings

| Slot | Id | Copy |
|---|---|---|
| Return metadata helper | `co.return.checking` | בודקים את התשלום… |
| Return pending H1 | `ret.pending.h1` | מאמתים את התשלום... |
| Return pending body | `ret.pending.body` | ההזמנה נקלטה ואנחנו ממתינים לאישור הסליקה. העמוד יתעדכן אוטומטית. |
| Return success H1 | `ret.ok.h1` | התשלום הצליח! |
| Return success sub | `ret.ok.sub` | הזמנה `{ref}` · שולם באתר `{price}` |

Pending is **not** failed. Webhook lost while capture succeeded stays on the
pending pair. Never reuse the failed body on return.

### 13.3 Retryable vs terminal (classify, Hebrew, no provider codes)

From PAGE-ANATOMY §6.5. Provider codes stay off-screen.

| Class | When | Copy already in this file | What the shopper may do |
|---|---|---|---|
| Retryable | `PAYMENT_PROVIDER_ERROR`, `RATE_LIMITED`, saved-card `NOT_FOUND` / `VALIDATION` | `val.card.verify` / `val.pay.verify` | stay on the step, retry |
| Terminal | stock, missing address, checkout disabled, missing `platform_percent` | banner, no fake retry | fix the cart or wait |
| Empty pay | no cart | do not render | bounce `/cart` |
| Verify address | physical step | `val.address.verify` | retry |
| Catalogue / suppliers load | begin-checkout prefetch | `val.products.load` / `val.suppliers.load` | retry |

Forbidden on every row: escrow language, `platform_percent`, "you were charged"
unless Cardcom captured (then pending, not this banner).

Admin refund blockers (already in QA-SCRIPTS 8b, listed here so a writer does
not invent a customer-facing twin):

| Copy | Audience |
|---|---|
| `{n} שוברים כבר מומשו בבית העסק. הערך נצרך ולא ניתן להחזיר אותו לכרטיס.` | admin only |
| `{n} שוברים פגו. ערכם נזקף כפחת ולא חוזר לכרטיס.` | admin only |
| `אין שורות שניתן להחזיר: כולן כבר מומשו או שוחררו לספק.` | admin only |
| `אין שורות שניתן להחזיר בהזמנה הזו.` | admin only |
| `אין הרשאה` | anyone else calling `refundOrder` |

Those four must never appear on `/checkout/failed`. A redeemed voucher is a
cashier fact, not a shopper error during pay.

### 13.4 Gift claim, complete

GET `/gift/[token]` is inert. POST claims. Errors paint under the button
(today a red `<p>`; add `role="alert"`).

| Id | Copy |
|---|---|
| gift.title | קיבלת מתנה |
| gift.helloNamed | `{name}, קיבלת מתנה` |
| gift.loading | רגע, טוענים את המתנה… |
| gift.unusable | לא ניתן לקבל את הקופון הזה. אם לדעתכם מדובר בטעות, פנו אלינו. |
| gift.claimed | המתנה כבר נאספה. אם אתם אספתם אותה, היא נמצאת בקופונים שלי. |
| gift.needAuth | כדי לקבל את הקופון לחשבון שלכם צריך להתחבר או להירשם. הקופון יישמר בחשבון שאיתו תתחברו. |
| gift.loginCta | התחברות וקבלת הקופון |
| gift.claimCta | קבלת הקופון לחשבון שלי |
| gift.claimPending | מעביר את הקופון... |
| gift.err.bad | קישור המתנה אינו תקין |
| gift.err.auth | יש להתחבר כדי לקבל את המתנה |
| gift.err.claimed | המתנה כבר נאספה |
| gift.err.unusable | לא ניתן לקבל את הקופון הזה |
| gift.err.expired | תוקף הקופון פג |
| gift.err.retry | קבלת המתנה נכשלה, נסו שוב |

`gift.claimed` (page) is longer than `gift.err.claimed` (under the button).
Keep both. The page version is the only one that points at `/account/coupons`.

Signed redeem URL refusals (cashier, not shopper), already in §6 for scan
outcomes; the landing page variants from COPY-HE §16:

| Id | Copy |
|---|---|
| redeem.rate | יותר מדי נסיונות / בוצעו יותר מדי סריקות מכתובת זו בשעה האחרונה. המתינו מעט ונסו שוב, או הזינו את הקוד ידנית במסך הסריקה. |
| redeem.forged | קוד השובר אינו תקין / הקישור אינו נושא חתימה תקפה. אם סרקתם QR מהטלפון של הלקוח, בקשו ממנו לפתוח מחדש את השובר באזור האישי. |
| redeem.readFail | לא ניתן לבדוק את השובר כרגע / התרחשה תקלה זמנית בקריאת השובר. נסו לסרוק שוב בעוד רגע; לא בוצע שום שינוי בשובר. |
| redeem.notFound | השובר לא נמצא / הקוד אינו משויך לבית העסק שלכם, או שאינו קיים. |
| redeem.net | אין חיבור לרשת. בדקו את החיבור ונסו שוב |
| redeem.sys | שגיאת מערכת, נסו שוב |

`redeem.notFound` must not hint that the code is valid at another shop.

### 11.4 How to re-run the count

```bash
python3 - <<'PY'
import re, pathlib, collections
he = re.compile(r"[֐-׿]")
doc = pathlib.Path('docs/ERROR-COPY.md').read_text(encoding='utf-8')
pat = re.compile(r"(?:error|message|msg)\s*:\s*['\"]([^'\"\\\n]{2,120})['\"]|"
                 r"\.(?:min|max|regex|refine|length|email|url)\([^)]*?['\"]([^'\"\\\n]{2,120})['\"]\s*\)|"
                 r"required_error\s*:\s*['\"]([^'\"\\\n]{2,120})['\"]")
out = collections.defaultdict(set)
for base in ('src/server/actions', 'src/lib/validations', 'src/lib/cart'):
    for p in pathlib.Path(base).rglob('*.ts'):
        if '.test.' in p.name: continue
        for m in pat.finditer(p.read_text(encoding='utf-8')):
            s = next((g for g in m.groups() if g), '').strip()
            if s and he.search(s) and s not in doc:
                out[s].add(str(p))
print(len(out), "undocumented")
PY
```

## 12. The money path, documented in full

Section 11.3 named `payments/checkout.ts` and `payments/refund.ts` as the two
files to take first, because a shopper who meets one of their strings has
already tried to pay. Both are done here.

### 12.1 `src/server/actions/payments/checkout.ts`

Already in this document: `לא ניתן לאמת את הכרטיס השמור כרגע, נסו שוב`,
`שגיאה בחיבור לספק הסליקה`, `התשלום מושבת כרגע, נסו שוב מאוחר יותר`,
`יש להתחבר לפני התשלום`, `יותר מדי ניסיונות תשלום, המתינו דקה`,
`נדרשת כתובת למשלוח`, `לא ניתן לאמת את הכתובת כרגע, נסו שוב`,
`כתובת לא תקינה`, `לא ניתן לאמת את בקשת התשלום כרגע, נסו שוב`,
`בקשת תשלום כפולה`, `מוצר בעגלה אינו קיים עוד`,
`לא ניתן לטעון את פרטי המוצרים כרגע, נסו שוב`,
`לא ניתן לטעון את פרטי בתי העסק כרגע, נסו שוב`, `יתרת הארנק אינה מספיקה`,
`לא הצלחנו לשריין את המלאי, נסו שוב`,
`יש למלא שם, עיר, רחוב ומספר בית למשלוח`, `שמירת הכתובת נכשלה, נסו שוב`.

Newly documented:

| Line | Copy | Code |
|---|---|---|
| 154 | `הכרטיס השמור לא נמצא` | |
| 160 | `תוקף הכרטיס השמור פג` | |
| 226 | `החיוב נדחה` | `PAYMENT_PROVIDER_ERROR` (fallback only, see 12.3) |
| 273 | `נתוני תשלום לא תקינים` | |
| 285 | `העגלה אינה תקינה` | |
| 393 | `מנוי נרכש בהזמנה נפרדת. סיימו קודם את רכישת המנוי או הסירו אותו מהעגלה` | |
| 472 | `לא הוגדר מחיר קופון` | `INTERNAL` |
| 495 | `לא הוגדר מחיר` | `INTERNAL` |
| 728 | `אחד הפריטים אזל מהמלאי` / `אין מספיק במלאי לאחד הפריטים` | |
| 197, 861 | `הזמנה {first 8 of order id}` | payment description, not an error |

### 12.2 `src/server/actions/payments/refund.ts`

| Line | Copy |
|---|---|
| 78 | `אין הרשאה` |
| 92 | `הזמנה לא נמצאה` |
| 104 | `לא ניתן לזכות הזמנה במצב {status}` |
| 134 | `לא נמצא תשלום לזיכוי` |
| 138 | `לתשלום אין מזהה עסקה ב-Cardcom` |
| 143 | `לתשלום אין סכום קריא` |
| 151 | `להזמנה אין פריטים` |
| 182 | `שוברים שכבר מומשו או פגו דורשים טיפול ידני` |
| 218 | `סכום הזיכוי הוא אפס` |
| 231 | `זיכוי הזמנה {first 8 of order id}: {reason}` (the Cardcom description, not UI copy) |
| 244 | `הזיכוי נדחה על ידי Cardcom` |

Refund strings are admin-facing, so naming Cardcom in `לתשלום אין מזהה עסקה ב-Cardcom`
is correct there. The same word in a customer-facing string would not be.

### 12.3 Five strings break this document's own rule

Rule 10 at the top of this file says: **say what happened and what to do, no
SQL, no Cardcom codes.** Five strings on the money path interpolate a raw
upstream message into Hebrew and return it as the action's `error`:

| Line | Copy | What gets appended |
|---|---|---|
| 186 | `יצירת תשלום נכשלה: ${paymentError?.message}` | a **PostgREST/Postgres** error |
| 598 | `יצירת הזמנה נכשלה: ${orderError?.message}` | a **Postgres** error |
| 689 | `שמירת פריטי הזמנה נכשלה: ${itemsError.message}` | a **Postgres** error |
| 462 | `למוצר "{name}" לא הוגדר פיצול עמלה: ${split.message}` | an internal split message |
| 226 | `charged.failureMessage ?? 'החיוב נדחה'` | the **provider's own** failure text |

**These reach the customer.** Traced one hop at a time rather than assumed:

```
checkout.ts        return { ok: false, error: `…: ${err.message}`, code: 'INTERNAL' }
CheckoutForm.tsx   const formError = state && 'error' in state ? state.error : null   (:354)
CheckoutForm.tsx   <div className="checkout-error" role="alert"><span>{formError}</span>  (:920-922)
```

`{formError}` is rendered verbatim. So a Postgres constraint message, or
whatever Cardcom returns as `failureMessage`, is painted into a `role="alert"`
on the checkout page and announced to a screen reader.

Line 226 is the subtlest of the five: `'החיוב נדחה'` is only the **fallback**.
When the provider supplies any `failureMessage`, that is what the shopper sees,
and this document has no control over its wording, language or content.

The shape a fix would take, for whoever takes it: keep the Hebrew sentence, log
the upstream message with the request id, and show the shopper the sentence
alone. `code: 'INTERNAL'` is already on four of the five, so the classifier has
what it needs to choose the retry affordance without the raw text.

Recorded, not changed: this file is documentation and the fix is in `.ts`.

### 12.4 Two vague strings worth a decision

- **Line 728**, `אחד הפריטים אזל מהמלאי` and `אין מספיק במלאי לאחד הפריטים`.
  "One of the items" names nothing. The cart already has per-line availability
  messages (section 2, `cart.unavailable`), so the shopper is told precisely on
  one screen and vaguely on the next.
- **Line 104**, `לא ניתן לזכות הזמנה במצב {status}`. `status` is an English
  enum value interpolated into a Hebrew sentence. Admin-facing, so it is
  legible to its reader, but it is also the one refund string a support agent
  is most likely to quote to a customer.

## 13. Auth and account, documented in full

Continuing section 11.3's order of reach. After the money path, `auth.ts` is
the file every customer meets and `account.ts` is the one they meet repeatedly.

### 13.1 `src/server/actions/auth.ts`

| Line | Copy |
|---|---|
| 37 | `כתובת אימייל או סיסמה שגויים` |
| 38 | `כתובת האימייל טרם אומתה — בדקו את תיבת הדואר` |
| 39 | `כתובת האימייל כבר רשומה במערכת` |
| 40 | `הסיסמה חייבת להכיל לפחות 6 תווים` |
| 41 | `ההרשמה סגורה כרגע` |
| 42 | `יותר מדי ניסיונות — נסו שוב מאוחר יותר` |
| 51 | `אירעה שגיאה, נסו שוב` |
| 60 | `קישור האיפוס פג או שכבר נעשה בו שימוש — בקשו קישור חדש` |
| 137 | `יותר מדי ניסיונות כניסה — נסו שוב בעוד שעה` |
| 143 | `נתונים לא תקינים` |
| 186 | `יותר מדי ניסיונות הרשמה — נסו שוב בעוד שעה` |
| 214 | `יותר מדי ניסיונות — נסו שוב בעוד שעה` |
| 227 | `שלחנו קישור כניסה לאימייל שלך — בדקו את תיבת הדואר` |
| 302 | `כניסה בטלפון אינה זמינה כרגע` |
| 316 | `יש להזין מספר טלפון נייד ישראלי (05X)` |
| 322 | `יותר מדי בקשות למספר הזה — נסו שוב בעוד שעה` |
| 352 | `מספר הטלפון אינו תקין` |

**A password minimum of 6 here, 8 in validation.** Line 40 says
`הסיסמה חייבת להכיל לפחות 6 תווים`; `src/lib/validations/auth.ts` (section 11.2)
says `הסיסמה חייבת להכיל לפחות 8 תווים`. Both are shipped strings and a shopper
can be told two different minimums for the same field. Worth one decision.

**Four rate-limit messages, three different windows.** `מאוחר יותר` (42),
`בעוד שעה` (137, 186, 214, 322). Line 42 is the only one that does not say how
long, and it is the generic one.

### 13.2 `src/server/actions/account.ts`

Errors:

| Line | Copy |
|---|---|
| 52 | `הפרטים אינם תקינים` |
| 62 | `שמירת הפרטים נכשלה` |
| 92 | `הכתובת אינה תקינה` |
| 139 | `מזהה כתובת לא תקין` |
| 148 | `מחיקת הכתובת נכשלה` |
| 176 | `עדכון ברירת המחדל נכשל` |
| 190 | `מזהה כרטיס לא תקין` |
| 196 | `מחיקת הכרטיס נכשלה` |
| 312 | `מחיקת החשבון נכשלה. פנו לתמיכה.` |
| 326 | `מחיקת החשבון נכשלה באמצע. פנו לתמיכה.` |
| 347 | `הנתונים נמחקו אך ההתנתקות נכשלה. פנו לתמיכה.` |

Success confirmations, a category section 5 covers and did not hold these:

| Line | Copy |
|---|---|
| 66 | `הפרטים נשמרו` |
| 128 | `הכתובת עודכנה` / `הכתובת נוספה` |
| 151 | `הכתובת נמחקה` |
| 179 | `הכתובת נקבעה כברירת מחדל` |
| 199 | `הכרטיס הוסר` |
| 223 | `הכרטיס נקבע כברירת מחדל` |
| 331 | `משתמש שנמחק` (the anonymised display name, not a message) |

**The three account-deletion failures are the best-written strings in the
codebase and should be the model.** Each says which stage failed and what to do:
failed outright, failed part-way, and succeeded-but-logout-failed are three
different facts and a shopper needs to know which one happened. Compare with
`הפעולה נכשלה.` (section 3), which says none of the three.

### 13.3 The em-dash, counted

`auth.ts` uses **U+2014** as a sentence separator in 14 strings. Repository-wide,
inside Hebrew string literals:

| Occurrences | File |
|---|---|
| 14 | `src/server/actions/auth.ts` |
| 5 | `src/server/actions/cart.ts` |
| 3 | `src/lib/cart/format.ts` |
| 2 | `src/server/actions/admin/shipping.ts` |
| 1 | `src/lib/auth/password-reset.ts` |
| 1 | `src/lib/images/validate.ts` |
| | **27 total across 7 files** |

Every other string in this document uses a comma or a full stop for the same
pause. `docs/SEO-PLAN.md` section 0 already carries a "do not copy U+2014" rule,
scoped to **titles**, so there is precedent for the character being unwanted and
no rule covering body copy.

This document does not invent one. It records that the separator is used in 27
places and nowhere else, so whoever sets the voice can settle it once rather
than meeting it a file at a time.

## 14. The cart cluster, documented in full

Section 2 carries `cart.unavailable` as a single row saying "per-line warning".
There are **five distinct per-line messages**, and the distinction between them
is the whole value: each names a different cause and a different action.

### 14.1 `src/lib/cart/format.ts`, the per-line warnings

| Line | Copy | Cause | Action it asks for |
|---|---|---|---|
| 37 | `המוצר כבר לא נמכר — הסירו מהעגלה כדי להמשיך` | delisted | remove |
| 39 | `המוצר אזל מהמלאי — הסירו מהעגלה כדי להמשיך` | out of stock | remove |
| 42 | `המוצר אינו זמין בכמות המבוקשת` | quantity too high, ceiling unknown | (none stated) |
| 43 | `נותרו {max_quantity} במלאי — הפחיתו את הכמות כדי להמשיך` | quantity too high, ceiling known | **reduce**, and it says to what |
| 45 | `המוצר אינו זמין להזמנה כרגע — הסירו מהעגלה כדי להמשיך` | not orderable now | remove |

Line 43 is the model: it is the only one that gives the shopper the number they
need. Line 42 is its fallback for when `max_quantity` is unknown, and it is the
one line in the set that asks for nothing.

This set is also the answer to the vagueness flagged in section 12.4: the cart
names the line and the cause precisely, and then
`payments/checkout.ts:728` says only `אחד הפריטים אזל מהמלאי` one screen later.
The good copy already exists; the checkout does not reuse it.

### 14.2 `src/server/actions/cart.ts`

| Line | Copy |
|---|---|
| 321 | `המוצר לא זמין` |
| 334 | `גרסה לא תקינה` |
| 339 | `אין מספיק במלאי` |
| 378 | `נתונים לא תקינים` |
| 383 | `יותר מדי פעולות — נסו שוב מאוחר יותר` |
| 448 | `העגלה ריקה` |
| 467 | `פריט לא נמצא בעגלה` |
| 651 | `יש להזין קוד קופון` |
| 652 | `קוד הקופון ארוך מדי` |
| 658 | `יותר מדי ניסיונות — נסו שוב מאוחר יותר` |

Two rate-limit strings in one file with different nouns: `יותר מדי פעולות`
(383, cart mutations) and `יותר מדי ניסיונות` (658, coupon attempts). The split
is defensible, since they limit different things, and it is worth being
deliberate about rather than incidental.

### 14.3 Three ways to say the same thing about stock

Collected across the three files a shopper meets in one purchase:

| Where | Copy |
|---|---|
| `lib/cart/format.ts:39` | `המוצר אזל מהמלאי — הסירו מהעגלה כדי להמשיך` |
| `actions/cart.ts:339` | `אין מספיק במלאי` |
| `payments/checkout.ts:728` | `אחד הפריטים אזל מהמלאי` / `אין מספיק במלאי לאחד הפריטים` |

Same condition, three levels of precision, in the order the shopper meets them:
precise on the cart line, terse on the cart action, vague at checkout. The
information available at each point runs the other way, since checkout knows
exactly which line failed.

## 15. Subscriptions, and the one string that changes with the data

`gifts.ts` is already covered in full by sections 3 and 5. `subscriptions.ts`
was not.

### 15.1 `src/server/actions/subscriptions.ts`

| Line | Copy | Kind |
|---|---|---|
| 41 | `מזהה מנוי לא תקין` | validation |
| 55 | `יש להתחבר` | auth |
| 74 | `המנויים אינם זמינים כרגע` | feature off |
| 77 | `ביטול המנוי נכשל` | failure |
| 84 | `המנוי לא נמצא` | not found |
| 87 | `המנוי כבר בוטל` | idempotent repeat |
| 111 | `המנוי בוטל. לא יבוצע חיוב נוסף.` | **success** |

Line 87 is the one worth keeping deliberately: cancelling an already-cancelled
subscription is a **repeat, not an error**, and the copy says so without
implying the shopper did something wrong. That is the same shape as
`השובר כבר מומש` in section 6.

### 15.2 `cancellationNotice()` has three branches, and only one names a date

`src/lib/commerce/recurring.ts:354` builds the notice shown **before** the
shopper confirms:

| Condition | Copy |
|---|---|
| `paidThroughIso === null` | `המנוי יבוטל מיידית ולא יבוצע חיוב נוסף.` |
| date unparseable | `המנוי יבוטל ולא יבוצע חיוב נוסף.` |
| normal | `לא יבוצע חיוב נוסף. המנוי פעיל עד {date}, ואין החזר על התקופה ששולמה.` |

Three things about this are right and are recorded so they are not "simplified":

1. **The unparseable-date branch drops the word `מיידית`.** An unreadable date is
   not the same fact as no date, and the copy refuses to claim immediate
   cancellation when it does not know. That is the same discipline as
   `docs/ROLE-MATRIX.md` section 4.2's "an unreadable membership must not read
   as no membership".
2. **The normal branch states the no-refund term up front**, before confirmation,
   rather than after. Section 5 requires exactly this.
3. **The date is `toLocaleDateString('he-IL')`**, a Hebrew-locale string that
   already carries its own ordering. Per `docs/RTL-PITFALLS.md` section 2.5 it
   must **not** be wrapped in `dir="ltr"`, which would reverse day, month and
   year.

The rule this file states at the top ("Missing date: `לא זמין`, never
`Invalid Date`") is honoured here by a different and better route: the branch
does not print a placeholder date, it prints a sentence that does not need one.

## 16. The three public forms, and a honeypot that answers differently

`contact.ts`, `newsletter.ts` and `supplier-lead.ts` are the actions a
**signed-out** visitor can reach (`docs/ROLE-MATRIX.md` 6a.2). Their copy is
therefore the first Hebrew many visitors read.

### 16.1 `contact.ts`

| Line | Copy |
|---|---|
| 16 | `נא למלא שם` / `השם ארוך מדי` |
| 17 | `כתובת מייל לא תקינה` |
| 18 | `ההודעה קצרה מדי` / `ההודעה ארוכה מדי` |
| 49 | `בדקו את הפרטים ונסו שוב.` |
| 54 | `תודה. ההודעה התקבלה ונחזור אליך בהקדם.` |
| 59 | `יותר מדי ניסיונות. נסו שוב מאוחר יותר.` |
| 81 | `השליחה נכשלה. נסו שוב, או פנו בוואטסאפ.` |

Line 81 is the model for a failed submission: it offers a **second channel**
rather than only asking the visitor to try again.

### 16.2 `newsletter.ts`

| Line | Copy |
|---|---|
| 32 | `כתובת מייל לא תקינה` |
| 60 | `יותר מדי ניסיונות. נסו שוב מאוחר יותר.` |
| 78 | `אם הכתובת תקינה, שלחנו אליה מייל לאישור ההרשמה.` |
| 102 | `ההרשמה נכשלה. נסו שוב.` |
| 122 | `קישור לא תקין` |
| 136 | `הקישור אינו תקף או שכבר נעשה בו שימוש` |
| 145 | `ההרשמה אושרה. תודה!` |
| 157 | `ההסרה נכשלה. נסו שוב.` |
| 173 | `הוסרת מרשימת הדיוור.` |

**Line 78 is deliberately non-committal and should stay that way.**
"*If* the address is valid, we sent it a confirmation" does not reveal whether
the address is already subscribed or even exists. Rewriting it to
`שלחנו לך מייל` would turn the newsletter form into an address-enumeration
oracle. Line 136 does the same job for a consumed token: expired and
already-used are one message.

### 16.3 `supplier-lead.ts`, and the honeypot that is one word away from silent

| Line | Copy |
|---|---|
| 33 | `נא למלא שם עסק` / `שם העסק ארוך מדי` |
| 34 | `נא למלא שם איש קשר` / `השם ארוך מדי` |
| 35 | `כתובת מייל לא תקינה` |
| 36 | `נא למלא טלפון` / `מספר לא תקין` |
| 40 | `ההודעה ארוכה מדי` |
| 72 | `בדקו את הפרטים ונסו שוב.` |
| 81 | `נא להזין מספר טלפון נייד ישראלי (05X).` |
| 86 | `יותר מדי ניסיונות. נסו שוב מאוחר יותר.` |
| 105 | `לא הצלחנו לשמור את הפרטים. נסו שוב או פנו אלינו בוואטסאפ.` |

**The finding.** There are two success strings, and they are not a duplication:

```
:76   honeypot hit   תודה, קיבלנו את הפרטים ונחזור אליכם.
:136  real success   תודה, קיבלנו את הפרטים ונחזור אליכם בהקדם.
```

The comment at `:75` states the intent exactly: "Honeypot hit: pretend success so
the bot does not retry with a new shape."

**The pretence is one word short.** The decoy omits `בהקדם`. A bot that submits
twice, once with the honeypot field (`company`) filled and once without, gets two
different strings and learns which field is the trap. After that the honeypot
catches nothing, and the form's only spam defence is the rate limit.

The fix is to make the two responses **byte-identical**. That is the whole
requirement of a honeypot: an indistinguishable answer. As written, the decoy
announces itself to anyone who compares.

This is copy, not logic, which is why it belongs here: the security property is
carried entirely by the string.

### 16.4 A fourth verb for "fill this in"

Section 11.2 recorded three (`יש למלא`, `יש להזין`, `שדה חובה`). These forms add
**`נא למלא`** and **`נא להזין`**. So the same instruction now appears as:

```
יש למלא    checkout.ts
יש להזין   account.ts, auth.ts
נא למלא    contact.ts, supplier-lead.ts
נא להזין   supplier-lead.ts
שדה חובה   steps.ts
```

`supplier-lead.ts` uses **both** `נא למלא` and `נא להזין` within one file.

## 17. Reviews and wishlist, and the person split counted

### 17.1 `src/server/actions/reviews.ts`

| Line | Copy |
|---|---|
| 27 | `צריך להתחבר כדי לכתוב ביקורת.` |
| 30 | `יותר מדי ביקורות בשעה האחרונה. נסה שוב מאוחר יותר.` |
| 39 | `קלט לא תקין.` |
| 52 | `ביקורת אפשר לכתוב רק על מוצר שרכשת.` |
| 55 | `כבר כתבת ביקורת על הרכישה הזו.` |
| 58 | `הביקורות עוד לא פתוחות. נסה שוב בקרוב.` |
| 60 | `שמירת הביקורת נכשלה. נסה שוב.` |
| 74 | `מוצר לא תקין.` |
| 80 | `צריך להתחבר כדי לשמור מוצרים.` |
| 83 | `יותר מדי פעולות. נסה שוב בעוד רגע.` |
| 92 | `רשימת המשאלות עוד לא פתוחה.` |
| 94 | `הפעולה נכשלה. נסה שוב.` |

Two are worth keeping as written:

- **`ביקורת אפשר לכתוב רק על מוצר שרכשת.`** states the verified-purchase rule as
  a fact about the product rather than an accusation. The DB enforces the same
  rule in the `reviews` INSERT policy (`docs/ROLE-MATRIX.md` 7.4), so this is
  the copy half of a two-layer control.
- **`הביקורות עוד לא פתוחות.`** and **`רשימת המשאלות עוד לא פתוחה.`** are
  feature-flag messages that say "not yet", not "error". Correct: a disabled
  feature is not a failure.

### 17.2 The person split, counted

Rule 1 at the top of this document says: *second person, do not mix `אתה` and
`אתם` in one paragraph without a reason.* Counted across `src/`, inside string
literals:

| Form | Occurrences | Files |
|---|---|---|
| `נסו` (plural) | **50** | 19 |
| `נסה` (singular) | **20** | 8 |

The plural is the site's voice by a factor of 2.5. The singular is concentrated:

| Count | File |
|---|---|
| 7 | `src/server/actions/reviews.ts` |
| 3 | `src/server/actions/referrals.ts` |
| 3 | `account/security/SecurityClient.tsx` |
| 2 | `scan/ScanClient.tsx` |
| 2 | `(auth)/mfa/MfaChallengeForm.tsx` |
| 1 each | `queries/reports.ts`, `api/supplier/vouchers/redeem/route.ts`, `admin/queues/RetryButton.tsx` |

**`reviews.ts` is the largest single source**, and a shopper meets it on a
product page immediately after meeting `cart.ts` and `checkout.ts`, both plural.

Two of the eight have a defensible reason to differ: `ScanClient` and the
supplier redeem route address **a cashier**, one person at a till, and
`MfaChallengeForm` addresses one account holder. The remaining five have no
stated reason.

This is the fourth voice inconsistency this document has counted, alongside the
five verbs for "fill this in" (16.4), the two password minimums (13.1) and the
27 em-dashes (13.3). None is a defect on its own. Together they are the shape of
copy written file by file without a sheet to check against, and this document is
now that sheet.

## 18. Milestone: every customer-facing cluster is documented

As of pass 20, the undocumented error and validation strings remaining under
`src/server/actions/` are **entirely admin-facing**:

```
10  admin/products.ts    6  admin/coupon-deals.ts   5  admin/orders.ts
 9  admin/vouchers.ts    6  admin/images.ts         5  admin/users.ts
 8  admin/discounts.ts   5  admin/shipping.ts
```

Every string a **shopper or a cashier** can meet is now in this file: checkout
and refund (12), auth and account (13), cart (14), subscriptions (15), the three
public forms (16), reviews and wishlist (17), plus the empty states, page
errors, redemption outcomes and validation already in sections 1 to 10.

That changes what this document is for. It is no longer a partial lookup with a
backlog; for customer copy it is **the** lookup, and a string on a customer
screen that is not in here is either new or wrong.

### 18.1 The two admin money paths, documented anyway

`admin/vouchers.ts` and `admin/orders.ts` move money or void it, so they are
worth the same treatment even though only staff read them.

`src/server/actions/admin/vouchers.ts`

| Line | Copy |
|---|---|
| 91 | `יותר מדי בדיקות, נסו שוב בעוד רגע` |
| 94 | `קוד שובר לא תקין` |
| 117 | `יותר מדי מימושים, נסו שוב בעוד רגע` |
| 122 | `חובה לציין סיבה למימוש ידני` |
| 129 | `לא ניתן לקרוא את השובר כרגע` |
| 135 | `השובר אינו ניתן למימוש` |
| 152 | `מימוש השובר נכשל` |
| 153 | `השובר כבר לא ניתן למימוש` |
| 178 | `השובר מומש ידנית` |

**Line 122 is the important one.** A manual redemption *requires* a reason, so
an admin cannot silently redeem someone's voucher. That is an audit control
expressed as a validation message, and it pairs with the `audit_log` row every
admin mutation writes (`docs/QA-SCRIPTS.md` 7b.1).

Lines 129 and 135 are correctly distinct: **"cannot read" is not "not
redeemable"**, which is the same rule as `orFail` and `membershipReadOrFail`
(`docs/SEO-PLAN.md` 5.2.3), here in the copy layer for the third time.

`src/server/actions/admin/orders.ts`

| Line | Copy |
|---|---|
| 14 | `מזהה הזמנה לא תקין` |
| 18 | `חובה לציין סיבת ביטול (לפחות 3 תווים)` |
| 19 | `סיבת הביטול ארוכה מדי` |
| 57 | `הזמנה ששולמה אינה מבוטלת ידנית; החזר כספי מתבצע דרך מסלול ההחזרים` |
| 58 | `רק הזמנה בסטטוס ממתין ניתנת לביטול ידני` |
| 62 | `ביטול אדמין: {reason}` |
| 102 | `ההזמנה בוטלה` |
| 107 | `ההערה ריקה` / `ההערה ארוכה מדי` |
| 160 | `ההערה נוספה` |

**Line 57 is the best-written refusal in the codebase.** It refuses *and routes*:
a paid order is not cancelled by hand, and the refund path is named in the same
sentence. Compare with `הפעולה נכשלה.`, which refuses and strands.

Line 18 mirrors 122 above: a cancellation needs a stated reason, minimum three
characters, so `.` will not pass.

## 19. Drift check: the wishlist strings specified here are not the ones in the code

Pass 21 checked every Hebrew string this document quotes against the source.
**196 quoted, 19 not found verbatim.** Fourteen of the nineteen are this
document's own notation (`{max_quantity}`, `{date}`, `{reason}`, trailing `…`)
or a code fragment quoted with its surrounding expression, and three more exist
in files the scan did not reach. Those are not drift.

**Two are.**

| This document says | The code says |
|---|---|
| `הוסף למועדפים` (245) | `הוסף לרשימת המשאלות` |
| `הסר ממועדפים` (246) | `הסר מרשימת המשאלות` |
| `נוסף למועדפים` (247, 280) | **nothing. There is no toast.** |

`src/components/product/WishlistButton.tsx:45` carries the whole of it:

```
aria-label={saved ? 'הסר מרשימת המשאלות' : 'הוסף לרשימת המשאלות'}
```

plus `'הפעולה נכשלה.'` for the error. Three Hebrew strings in the file, and none
of them is the one this document specifies.

### 19.1 This is a different fact from the pass-14 finding

Section 1's note already records that the heart "ships in neither" the PDP nor
the header, and concludes: "Keep the strings; they are correct for when the
control is wired in."

That conclusion no longer holds as written. The control that would be wired in
**already has strings**, and they are not these. So wiring it in would not
produce `הוסף למועדפים`; it would produce `הוסף לרשימת המשאלות`.

The decision is therefore not "wire it in and the copy appears". It is:

1. **Change the component** to match this document, or
2. **Change this document** to match the component, or
3. Decide the vocabulary question underneath, which is the real one.

### 19.2 The vocabulary question

Two words are in play for one feature:

| Word | Where |
|---|---|
| `רשימת המשאלות` | `WishlistButton` labels; the page H1 `רשימת המשאלות שלי`; the long empty state |
| `מועדפים` | this document's rows 245-247 and 280; the short empty variant `עדיין אין מוצרים במועדפים`; `MastheadNav.tsx:51` `aria-label="המועדפים שלי"` |

**`מועדפים` appears exactly once in the entire source**, on that
`MastheadNav` `aria-label`. Everywhere else the code says `רשימת המשאלות`.

Section 1 already warns "do not mix on the same screen". The stronger statement
is now available: the codebase has effectively chosen `רשימת המשאלות`, by 3
strings plus an H1 plus an empty state against 1 `aria-label`, and this document
is the main thing still carrying the other word.

Recorded, not resolved: which word is right is a brand decision, not a
documentation one. What is settled is that the two cannot both be correct and
the code has already voted.

## 20. Correction: every count in this document is literal-only (pass 22)

Sections 11 and 19 both count Hebrew strings by scanning for **quoted literals**
(`'…'`, `"…"`, `` `…` ``). That misses an entire class, and the miss was found
by accident: pass 19 listed `אין חיבור לאינטרנט` as "not found in src", then a
manual grep found it immediately at `src/app/offline/page.tsx:27`.

It is written as **JSX text**:

```jsx
<h1 className="mt-5 font-bold text-2xl text-heading">אין חיבור לאינטרנט</h1>
```

Not a literal. Invisible to every count in this file.

### 20.1 The size of the blind spot

Across `src/app` and `src/components`:

| | Count |
|---|---|
| Distinct Hebrew strings in **quoted literals** | 905 |
| Distinct Hebrew strings in **JSX text** | 816 |
| **Only** in JSX text, invisible to a literal scan | **655** |

### 20.2 What this does and does not invalidate

**It does not invalidate the drift finding.** Pass 19 found the two wishlist
labels by comparing this document's quotes against source; those two were real
and remain real. A blind spot causes **false "not found"**, not false
"mismatch".

**It does qualify the coverage numbers.** Section 11's headline — "1075 distinct
Hebrew literals under `src/server` and `src/lib`" — is accurate *as literals* and
is not the size of the corpus. Section 11 is mostly safe because `src/server`
and `src/lib` are `.ts`, where JSX text does not occur; the exposure is in
`src/app` and `src/components`, which section 11 did not count anyway.

**It does qualify section 19's "194 of 196 verified".** That is 194 of 196
*quoted* strings. Any specification in this file whose implementation is JSX
text was neither confirmed nor refuted.

### 20.3 Why the raw 655 overstates the problem

JSX splits a sentence around every interpolation, so the extracted fragments
include `או`, `, או לבטל את המנוי.`, `(שולמו לו כבר` and `/ ניהול`. Those are
pieces of messages, not messages. A count of distinct *user-visible sentences*
would be far lower.

That is itself worth knowing: **a sentence assembled from JSX fragments cannot
be grepped, cannot be drift-checked, and cannot be found by a translator.** It is
the same property that makes `docs/RTL-PITFALLS.md` section 4 care about where a
Hebrew run ends and a Latin one begins — the fragment boundaries are real, and
they are where bidi problems appear.

### 20.4 The fix for a future pass

Extend the scan to JSX text with a `>([^<>{}]+)<` pattern, deduplicate against
the literal set, and re-run section 19's comparison over the union. Expect more
false "not found" from fragments, so the result needs reading rather than
counting — which is the same rule `docs/QA-SCRIPTS.md` 0.2 states for every
other scan in this set.

## 21. The extended drift check, run (pass 23)

Section 20.4 recommended re-running the drift check over JSX text as well as
quoted literals. Done, by searching raw file content across `src/` and
`public/` rather than parsing string literals, so JSX text, `.json` and the
service worker are all included.

| | Count |
|---|---|
| Hebrew strings this document quotes, placeholders excluded | **191** |
| Found in source | **187** |
| **Not found** | **4** |

The four:

| String | Verdict |
|---|---|
| `הוסף למועדפים` | **real drift** — the code says `הוסף לרשימת המשאלות` (section 19) |
| `הסר ממועדפים` | **real drift** — the code says `הסר מרשימת המשאלות` |
| `נוסף למועדפים` | **real drift** — there is no toast at all |
| `שלחנו לך מייל` | **intentional.** Section 16.2 quotes it as the wording that *would* turn the newsletter form into an address-enumeration oracle. It should not exist in source, and it does not |

### 21.1 The JSX blind spot hid nothing

That is the finding. Section 20 established that a literal-only scan misses 655
Hebrew strings, and the honest worry was that the "194 of 196" result had been
flattered by it.

**It had not.** Extending the search to raw file content moved the count from
194/196 to 187/191 — a different denominator, because this run excludes
placeholder-bearing strings the earlier one counted — and turned up **no new
drift**. The three wishlist labels were the whole of it.

So the two runs agree on substance:

| Run | Method | Real drift found |
|---|---|---|
| Pass 21 | quoted literals only | 3 (wishlist) |
| Pass 23 | raw file content, all of `src/` and `public/` | **3 (wishlist)** |

### 21.2 What that means for maintaining this file

The blind spot is real and worth knowing, and it turns out **not** to be the
limiting factor on this document's accuracy. A specification that is wrong tends
to be wrong about a string someone *changed*, and a changed string is usually a
literal — labels, messages and errors live in props and returns, not in prose
nodes.

So the cheap check stays cheap: search raw file content for each quoted string,
read the misses rather than counting them, and expect the misses to be
placeholders and hypotheticals. Three real ones in 191 is the current state.

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | Catalogue of empty, validation, page errors, checkout fail, confirmations, scan outcomes, wallet/coupons/wishlist |
| 2026-09-07 | Pass 9: supplier empty vs 404 (inactive is 404, not empty) |
| 2026-09-07 | Pass 10: city empty is a real answer; unknown slug 404 |
| 2026-09-07 | Pass 11: legal H1s and offline, no escrow in returns |
| 2026-09-07 | Redemption copy audited against source: 6/6 match, 3 outcomes were missing, HTTP status map added |
| 2026-09-07 | Pass 12: coverage map counted against source (1075 Hebrew literals, 196 undocumented error strings); validations completed in full; two wording inconsistencies |
| 2026-09-07 | Pass 13: the money path complete (11.2a). checkout.ts and refund.ts verbatim; the double-submit string is success-adjacent; refund copy is operator-facing and may name Cardcom |
| 2026-09-07 | Pass 13: the money path documented in full (checkout.ts, refund.ts). Five strings interpolate a raw Postgres or Cardcom message and are rendered verbatim to the shopper, breaking rule 10 of this file |
| 2026-09-07 | Pass 14: three failed-payment strings are not one; two pending strings are not one; gift claim catalogue from COPY-HE; admin refund blockers must never paint on `/checkout/failed` |

## 14. Auth chrome, and the wishlist empty that cannot be filled from the PDP (pass 15)

### 14.1 Auth (COPY-HE §3.5)

| Id | Copy |
|---|---|
| auth.login | כניסה לחשבון |
| auth.login.google | כניסה עם Google |
| auth.login.sms | כניסה עם קוד ב-SMS |
| auth.login.magic | כניסה ללא סיסמה (קישור מאובטח לאימייל) |
| auth.login.submit | כניסה |
| auth.login.fail | הכניסה נכשלה (source comments contain U+2014; do not copy it) |
| auth.or | או |
| auth.signup | יצירת חשבון |
| auth.confirm.h2 | בדקו את תיבת הדואר |
| auth.confirm.body | שלחנו לכם קישור לאימות. לחצו עליו כדי להפעיל את החשבון. |
| auth.forgot | שחזור סיסמה |
| auth.reset | בחרו סיסמה חדשה |
| auth.reset.help | הסיסמה חייבת להכיל לפחות 8 תווים וספרה אחת. |
| auth.mfa | אימות דו-שלבי |
| auth.mfa.help | הזן את הקוד מאפליקציית האימות שלך כדי להמשיך לפאנל. |
| auth.mfa.aria | קוד אימות |
| supplier.login.h1 | כניסה לאזור הספקים |
| supplier.login.cta | התחברות לספקים |
| supplier.login.back | חזרה לחנות |

`auth.mfa.*` is staff-only (`docs/ROLE-MATRIX.md` §10.1). Do not show it after a
customer login.

### 14.2 Wishlist empty is currently the only reachable state from the storefront

Section 1 documents two empty strings and says the heart is on the PDP.
`docs/COMPONENT-INVENTORY.md` Pass 14: `product/WishlistButton` has **zero
import sites**. `/account/wishlist` renders. Nothing on the PDP writes to it.

Keep the empty copy. Stop documenting `הוסף למועדפים` / `נוסף למועדפים` as a
shipped shopper path until a caller exists. The account page empty is not a
defect; a QA script that requires adding from the PDP cannot pass.

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | Catalogue of empty, validation, page errors, checkout fail, confirmations, scan outcomes, wallet/coupons/wishlist |
| 2026-09-07 | Pass 9: supplier empty vs 404 (inactive is 404, not empty) |
| 2026-09-07 | Pass 10: city empty is a real answer; unknown slug 404 |
| 2026-09-07 | Pass 11: legal H1s and offline, no escrow in returns |
| 2026-09-07 | Redemption copy audited against source: 6/6 match, 3 outcomes were missing, HTTP status map added |
| 2026-09-07 | Pass 12: coverage map counted against source (1075 Hebrew literals, 196 undocumented error strings); validations completed in full; two wording inconsistencies |
| 2026-09-07 | Pass 13: the money path complete (11.2a). checkout.ts and refund.ts verbatim; the double-submit string is success-adjacent; refund copy is operator-facing and may name Cardcom |
| 2026-09-07 | Pass 13: the money path documented in full (checkout.ts, refund.ts). Five strings interpolate a raw Postgres or Cardcom message and are rendered verbatim to the shopper, breaking rule 10 of this file |
| 2026-09-07 | Pass 14: three failed-payment strings are not one; two pending strings are not one; gift claim catalogue from COPY-HE; admin refund blockers must never paint on `/checkout/failed` |
| 2026-09-07 | Pass 15: auth chrome from COPY-HE; PDP wishlist heart is not a shipped path (`WishlistButton` unimported) |
| 2026-09-07 | Pass 15: auth.ts and account.ts in full. Password minimum is 6 in one string and 8 in another, and U+2014 counted at 27 occurrences across 7 files |
| 2026-09-07 | Pass 16: the cart cluster in full. Five distinct per-line warnings behind one table row, and three levels of precision for the same stock condition across cart line, cart action and checkout |
| 2026-09-07 | Pass 17: subscriptions in full, and cancellationNotice three branches. The unparseable-date branch drops "immediately" rather than guessing, which is the same discipline as the membership-read rule |
| 2026-09-07 | Pass 18: the three public forms. The supplier-lead honeypot answers one word differently from real success, which makes it detectable; plus a fourth and fifth verb for "fill this in" |
| 2026-09-07 | Pass 19: reviews and wishlist, and the person split counted. 50 plural against 20 singular, with reviews.ts the largest singular source |
| 2026-09-07 | Pass 20: milestone, every customer-facing cluster is documented; the remaining backlog is entirely admin. Plus the two admin money paths, vouchers and orders |
| 2026-09-07 | Pass 21: drift check on all 196 quoted strings. Two are real drift: the wishlist labels specified here are not the ones in WishlistButton, and the toast does not exist |
| 2026-09-07 | Pass 22: correction. Every count here is literal-only and misses JSX text; 655 Hebrew strings exist only as JSX. Qualifies the coverage numbers, does not invalidate the drift finding |
| 2026-09-07 | Pass 23: ran the extended drift check over raw file content. 187 of 191 found; the JSX blind spot hid no additional drift, and the three wishlist labels remain the whole of it |
