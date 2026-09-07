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
