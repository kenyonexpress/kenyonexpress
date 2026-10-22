# Payment options spec

Status: DRAFT · docs only  
Audience: product, checkout, support  
PSP: Cardcom only. CoinId ILS. Amounts: integer agorot. Display: ₪ via `src/lib/money.ts`.  
Companions: `docs/CARDCOM-ARCHITECTURE.md`, `docs/ARCHITECTURE-INVOICING-TAX.md`, `.claude/skills/cardcom-payments/SKILL.md`

Coupon model (binding): the customer pays the coupon price on the site. The remainder is paid at the business after QR scan. Commission is taken from the on-site amount only. Wallet credit never withdraws to a bank or card.

Legend: **LIVE** is in HEAD. **PLANNED** is this spec. Do not ship a checkout radio for a PLANNED rail until Cardcom terminal flags and Hebrew copy below are both wired.

---

## 0. What the customer can choose today

| Rail | Status | Charged amount |
|---|---|---|
| Cardcom Low Profile (new card) | LIVE | on-site remainder after wallet |
| Saved Cardcom token (`ChargeToken`) | LIVE | same |
| Internal wallet | LIVE | applied first; if it covers all, no PSP call |
| Installments 1 to 12 | PLANNED | card charge only |
| Apple Pay | PLANNED (Cardcom hosted, not a KE toggle) | card charge; no J5 |
| Google Pay | PLANNED (same) | card charge; no J5 |
| Bit | PLANNED (same) | card charge; no J5 |

There is no Stripe, PayPal as KE product, or supplier-split at the terminal. Multi-account Cardcom is out of this spec.

Hebrew block title (LIVE):

```
תשלום בעזרת כרטיס אשראי
```

Subtitle (LIVE):

```
תשלום מאובטח באשראי, באמצעות Cardcom.
```

---

## 1. Installments 1 to 12 (PLANNED)

Not offered today. `createLowProfile` does not send `NumOfPayments` or installment `AdvancedDefinition`. `ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md` §12: "Installments. Not offered."

### 1.1 Product rules when enabled

| Rule | Value |
|---|---|
| Allowed N | integer 1 to 12 inclusive. 1 = single charge (current behavior) |
| Who sees the picker | logged-in checkout, credit card rail only |
| What is split | `cardCharge` agorot after wallet and site discounts. Never the till remainder |
| Coupon remainder | not installmentable. Copy must say the business still collects the remainder in one payment |
| Physical | full on-site price (minus wallet) may be split |
| Min per installment | do not offer N if `floor(cardCharge / N) < 5000` agorot (₪50). If Cardcom terminal floor is higher, the terminal wins |
| Currency | ILS only |
| Default | 1 |
| Persistence | store N on the `payments` row. Snapshot. Do not reread a later UI default |

Forbidden combinations:

- Installments + Bit
- Installments + Apple Pay
- Installments + Google Pay
- Installments + wallet-only (`cardCharge = 0`)
- Installments on the till remainder
- Changing N after Low Profile URL is created (create a new payment row)

Refunds: refund the on-site charged total through the existing refund path. Do not invent per-installment customer UI. Cardcom and the issuer unwind remaining installments.

### 1.2 Hebrew UI copy (installments)

Picker label:

```
מספר תשלומים
```

Options:

```
תשלום אחד
2 תשלומים
…
12 תשלומים
```

Helper under the picker (coupon line in cart):

```
התשלומים חלים רק על מה שנגבה באתר. יתרה בבית העסק, אם יש, משולמת שם במלואה אחרי סריקה.
```

Disabled Bit/wallets helper:

```
תשלומים זמינים בכרטיס אשראי בלבד.
```

Too-small amount:

```
לתשלומים האלה הסכום באתר נמוך מדי. בחרו פחות תשלומים או תשלום אחד.
```

Order review row:

```
תשלום באתר: {amount} ב-{n} תשלומים
```

---

## 2. Apple Pay, Google Pay, Bit (PLANNED)

Cardcom Low Profile can expose these on the hosted page (`UrlToBit` and wallet buttons via terminal / `AdvancedDefinition`). KenyonExpress checkout today has no first-class toggle and no Hebrew radio for them.

### 2.1 Product rules

| Rail | When to show | Constraints |
|---|---|---|
| Bit | after terminal Bit is live in production, not sandbox-only | immediate charge, no J5, no installments, no save-card checkbox |
| Apple Pay | Safari / iOS (and macOS Safari) where Cardcom enables it | same |
| Google Pay | Chrome / Android where Cardcom enables it | same |

Wallet mix: customer may still apply KenyonExpress wallet first. The hosted wallet pays only `cardCharge`.

Save-card: off and hidden on Bit / Apple Pay / Google Pay. Tokenization stays on the card rail (`ChargeAndCreateToken`).

Failure: same `/checkout/failed` as card. Cart kept. Do not say "Bit declined" unless Cardcom result is that specific; otherwise generic failure copy.

### 2.2 Hebrew UI copy (wallets)

Radio group label (LIVE word, keep):

```
אמצעי תשלום
```

New radios (PLANNED):

```
כרטיס אשראי
Bit
Apple Pay
Google Pay
```

Bit helper:

```
התשלום בביט הוא מיידי. אין תשלומים ואין שמירת אמצעי לתשלום הבא.
```

Apple Pay helper:

```
Apple Pay זמין במכשירים נתמכים. החיוב מיידי מול Cardcom.
```

Google Pay helper:

```
Google Pay זמין במכשירים נתמכים. החיוב מיידי מול Cardcom.
```

Unavailable on this device:

```
אמצעי התשלום הזה אינו זמין במכשיר הנוכחי. בחרו כרטיס אשראי.
```

Do not promise "pay with Bit at the restaurant". Bit here is the on-site PSP rail only.

---

## 3. Saved cards (LIVE)

Table: `payment_tokens`. Service role holds `cardcom_token`. Browser roles never read the token. Customer sees brand + last 4 + expiry.

| Column | Role |
|---|---|
| `cardcom_token` | ChargeToken input |
| `last_4` | display |
| `card_brand` | display |
| `expiry_month` / `expiry_year` | expiry badge |
| `is_default` | one default per profile |
| `cardcom_account_id` | token scoped to terminal |

Account route: `/account/tokens` (not `/payment-methods`).

Checkout radios (LIVE):

```
{brand} המסתיים ב-{last4}
כרטיס אחר
```

Save checkbox (LIVE, default on when paying with a new card):

```
שמירת כרטיס לתשלום מהיר בפעם הבאה
```

Account title (LIVE):

```
אמצעי תשלום
```

Subtitle (LIVE):

```
נשמרות רק 4 הספרות האחרונות והטוקן של Cardcom. מספר הכרטיס המלא לא נשמר אצלנו.
```

Empty (LIVE):

```
אין כרטיסים שמורים. כרטיס נשמר אוטומטית בתשלום הראשון, אם בחרת בכך.
```

Expired badge: `פג תוקף`. Default: `ברירת מחדל`. Action: `קביעה כברירת מחדל`.

Rules:

1. First paid card payment may tokenize (`ChargeAndCreateToken` or webhook persist).
2. Expired tokens stay listed until the customer removes them. Checkout must not charge an expired token; fall back to Low Profile.
3. Terminal rotation: token with the wrong `cardcom_account_id` is unusable. Do not ChargeToken across accounts.
4. Refunds use the original deal / token path. Customer cannot pick a different saved card for a refund.

---

## 4. Invoice display (LIVE)

Queue: `src/server/payments/invoices.ts`. Customer download: `/account/orders/[id]/invoice`.

| Order mix | Document | VAT |
|---|---|---|
| Coupon only | `coupon_receipt` | stated 0 (advance; VAT event not at this step) |
| Physical or mixed | `tax_invoice_receipt` | 18% (`VAT_RATE_BP = 1800`) unless `INVOICE_VAT_PERCENT` overrides |
| Refund | `credit_note` | matches original basis |
| Wallet-only (no Cardcom deal) | none | no download |

Amount basis: what Cardcom charged (after wallet and discounts), not deal face value.

Queue: `pending` / `issued` / `failed` / `dead`. Max 5 attempts. Wallet-only orders must not create a fake invoice row.

Hebrew (LIVE):

```
חשבונית מס / קבלה
הורדת חשבונית
```

Not ready:

```
החשבונית עדיין לא הונפקה
```

Support must not email a PAN, CVV, or full token. Invoice PDF is enough.

Counsel still gates legal wording of coupon receipts vs tax invoices. Until counsel signs, treat this as operational display, not a tax opinion.

---

## 5. Edge cases

| Case | Behavior | Copy |
|---|---|---|
| Guest hits Pay | stash form, Google OAuth, resume checkout | `יש להתחבר לפני התשלום` |
| Wallet + card | wallet first, card = remainder | `שימוש ביתרת ארנק (זמין: …)` |
| Wallet covers all | finalize, no Cardcom, no invoice | success without "Cardcom window" |
| Insufficient wallet | no PSP call | `יתרת הארנק אינה מספיקה` |
| Coupon remainder | not charged here | `יתרה לתשלום בעסק (בקופון)` / line `תשלום באתר: … · יתרה בעסק: …` |
| Failed charge | payment `failed`, cart kept | `התשלום לא הושלם` · `החיוב לא בוצע. אפשר לנסות שוב, העגלה שלך נשמרה.` · `חזרה לעגלה` |
| User retries after a spinner | begin_checkout 10 / 60s per user | `יותר מדי ניסיונות תשלום, המתינו דקה` |
| Kill switch | `CHECKOUT_ENABLED` not `true` | `התשלום מושבת כרגע, נסו שוב מאוחר יותר` |
| Charged, no order | do not pay again | `אם חויבת ולא רואה הזמנה, אל תשלם שוב. בדקו במייל או פנו לתמיכה` |
| Refund fee | min(5%, ₪100), 0 on defect or same-day cancel | never call it a "Cardcom fee" to the customer |
| Cashback | wallet credit, not a card refund | never "החזר לכרטיס" |
| Bit + installments | refuse | installments copy in §1.2 |
| Apple Pay on Android Chrome | hide or disable | `אמצעי התשלום הזה אינו זמין במכשיר הנוכחי` |
| Hosted Cardcom still open | iframe/page | `החיוב מתבצע מול Cardcom. אל תסגור את החלון עד לסיום התשלום.` |

Phone on details step (LIVE): Israeli mobile 10 digits starting `05`. Error: `מספר נייד ישראלי הוא 10 ספרות ומתחיל ב-05`.

---

## 6. Checkout Hebrew copy (LIVE, do not rewrite in this spec)

Steps: `פרטים אישיים` · `כתובת למשלוח` · `ביקורת הזמנה` · `אישור ותשלום`

Guest: `קונית כאן בעבר?` · `יש ללחוץ כאן כדי להתחבר`

Privacy: `הפרטים האישיים ישמשו לצורך ביצוע הרכישה, ולא יועברו לגורם שאינו מורשה בהתאם למדיניות הפרטיות.`

Terms checkbox: `קראתי ואני מסכים לאתר תנאי שימוש` · error `יש לאשר את תנאי השימוש`

CTA: `שליחת הזמנה` · busy `מחייב את הכרטיס השמור...` / `מעביר לדף תשלום מאובטח...`

Success: `התשלום הצליח!` · `לתשלום בעסק במימוש: …` · `הקופונים שמורים גם באזור האישי`

Pending: `מאמתים את התשלום...` · `ההזמנה נקלטה ואנחנו ממתינים לאישור הסליקה. העמוד יתעדכן אוטומטית.`

Frame title: `תשלום מאובטח`

---

## 7. Money and audit

- All charges, wallet applies, refunds, invoice totals: agorot integer. No float.
- Webhook authenticity: `?s=` shared secret + `GetLpResult`. No Cardcom HMAC. Re-fetched amount must match the payment row.
- Journal `payment_webhook_events` before acting. 5xx on persist failure that is not a unique violation.
- No retry on `ChargeToken` / `RefundDeal` after an unknown timeout.
- PAN never in logs, invoices UI, or support tickets.

---

## 8. Acceptance

Installments: picker appears only on card rail, N stored on payment, Bit/Apple/Google hidden or disabled when N>1, coupon remainder copy visible.

Wallets: no KE save-card, no J5 language, failure uses `/checkout/failed`.

Saved cards: last 4 only, expired token not charged.

Invoice: coupon-only receipt vs tax invoice vs none for wallet-only, as §4.

Visual gate: checkout compare is not the home 11% gate, but RTL, ₪ `dir=ltr`, and 44px pay CTA still apply.
