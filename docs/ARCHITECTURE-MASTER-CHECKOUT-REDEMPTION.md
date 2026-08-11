# ארכיטקטורה ראשית: Checkout, עמלות, מימוש קופון

מסמך מאסטר לפיצול כסף (קופון מול פיזי), snapshot של `platform_percent`, מימוש בלי payout, ויומן הכרעות D1-D6. מקור אמת לתשלום = `GetLpResult`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #7/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/CONTRADICTIONS.md
docs/GAPS-CODE-VS-DOCS.md
```

מודל כסף: **No Escrow**. אין held/נאמן/J5. אגורות integer. אין default ל-`platform_percent` (C1).

---

## 0. הכרעות (סיכום)

| # | הכרעה |
|---|---|
| M1 | מקור אמת לתשלום = `GetLpResult` בלבד. Return URL ו-webhook הם טריגר/UI. |
| M2 | כסף פנימי = אגורות integer. המרה ILS↔agorot רק בגבול Cardcom / UI. |
| M3 | `products.platform_percent` חובה פר מוצר (`NOT NULL`, בלי `DEFAULT`). מצולם ל-`order_items` ב-`beginCheckout`. |
| M4 | קופון: אין Escrow; מקדמה באתר = הכנסת פלטפורמה; יתרה בבית העסק מחוץ למערכת; payout פלטפורמה→ספק = 0. |
| M5 | פיזי: חיוב מלא באתר; פיצול ledger לפי snapshot; payout בנקאי נפרד (לא בתוך checkout). |
| M6 | מימוש קופון = CAS `issued`→`redeemed` ב-RPC; סריקה לא משחררת כסף ולא יוצרת payout. |

פירוט היסטורי: סעיף 5 (D1-D6).

---

## 1. נוסחאות כסף (אגורות)

כל החישובים אחרי גבול הכניסה הם על integers. אחוז נשמר כ-`numeric(5,2)` לתצוגה אדמין, ובחישוב עובר ל-basis points או לחלוקה עם עיגול half-up לאגורה הקרובה (`percentageOf`).

### 1.1 הגדרות משותפות

```text
face_agorot           = unit_price_agorot * quantity   (שווי נקוב / דיל)
platform_percent_bps  = round(platform_percent_snapshot * 100)   (למשל 12.50 → 1250)
platform_cut_agorot   = percentageOf(face_agorot, platform_percent_bps)
supplier_share_agorot = face_agorot - platform_cut_agorot

Invariant: face_agorot = platform_cut_agorot + supplier_share_agorot
```

`platform_percent` על השורה הוא **snapshot** מזמן הקנייה, לא הערך החי במוצר.

### 1.2 קופון (No Escrow)

| גודל | נוסחה | מי מקבל / מתי |
|---|---|---|
| `coupon_price_agorot` | שדה חופשי פר מוצר (C4), לא נגזרת אוטומטית מ-`platform_percent` | חיוב Cardcom באתר |
| `balance_due_agorot` / `collect_in_store` | `face_agorot - coupon_price_agorot` | גבייה בקופה בעסק, מחוץ לפלטפורמה |
| הכנסת פלטפורמה | כל `coupon_price_agorot` ב-`paid` | פלטפורמה מיד אחרי finalize |
| `supplier_due` מהפלטפורמה | **0** | אין העברה פלטפורמה→ספק על קופון |
| ארנק | מפחית רק את חיוב הכרטיס, עד `coupon_price_agorot` | לא משנה את יתרת העסק |

```text
paid_on_site_agorot     = coupon_price_agorot
card_charge_agorot      = paid_on_site_agorot - wallet_applied_agorot   (≥ 0)
platform_revenue        = paid_on_site_agorot
platform_to_supplier    = 0
collect_in_store_agorot = face_agorot - coupon_price_agorot
```

אסור: Escrow, held לספק, J5, "שחרור" כסף אחרי סריקה, חישוב יתרת עסק כחלק מ-payout.

### 1.3 פיזי

```text
paid_on_site_agorot  = face_agorot
platform_cut_agorot  = percentageOf(face_agorot, platform_percent_bps)
supplier_due_agorot  = face_agorot - platform_cut_agorot
card_charge_agorot   = paid_on_site_agorot - wallet_applied_agorot
```

אחרי `GetLpResult` + `finalizeOrder`: `settlement_status` / ledger (`split_executed` וכד') רושמים חוב לספק. העברה בנקאית = מסלול

```
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
```

לא חלק מ-checkout ולא ממימוש קופון.

### 1.4 השוואה מהירה

| | קופון | פיזי |
|---|---|---|
| חיוב באתר | `coupon_price` | 100% face |
| פלטפורמה | כל המקדמה | `platform_cut` מה-snapshot |
| ספק מהפלטפורמה | 0 | `supplier_due` (ledger → payout) |
| יתרה בעסק | `face − coupon` | 0 |
| אחרי סריקה | סטטוס בלבד; אין כסף נוסף | לא רלוונטי |

---

## 2. Snapshot של `platform_percent`

### 2.1 למה

C10: אחרי רכישה האחוזים והסכומים על השורה קבועים. דוחות, refund, ו-payout פיזי נשענים על מה שנקנה, לא על המוצר החי.

### 2.2 מתי

ב-`beginCheckout` / בניית `order_items`, **לפני** יצירת Low Profile:

| שדה | מקור |
|---|---|
| `platform_percent` (snapshot) | `products.platform_percent` (חובה) |
| `supplier_split_percent` | משלים ל-100 עם platform (פיזי) |
| מחירים / face / coupon | מוצר בשרת בלבד (אגורות) |
| `supplier_id` | מהמוצר; לא מהלקוח |

Finalize **לא** קורא מחדש למוצר החי לפיצול כסף. שינוי אחוז באדמין חל רק על הזמנות עתידיות. הזמנת `pending` עם LP פתוח לא מרעננת אחוז (מונע amount_mismatch מול `GetLpResult`).

### 2.3 ידית פיצול

ידית אחת: `platform_percent` (C2). `commission_percent` אינה ידית פיצול. אין fallback ל-5%/10% קבוע.

---

## 3. Checkout → תשלום → finalize (בקצרה)

```text
beginCheckout → snapshot + order(pending) + payment(lp:{client_ref}) → Low Profile
Return / IndicatorUrl → ?s= secret → GetLpResult (אמת) → amount match → finalizeOrder
קופון: paid + platform_settled + mint issued (אין Escrow / אין חוב ספק)
פיזי: split_executed + ledger; payout במסלול נפרד
```

פירוט: `ARCHITECTURE-CHECKOUT-FLOW.md`, `ARCHITECTURE-CARDCOM-WEBHOOKS.md`.

---

## 4. מימוש קופון בלי payout

סריקה משנה **סטטוס ו-audit** בלבד. היא לא מזיזה כסף בפלטפורמה.

```text
POST /api/supplier/vouchers/redeem
  → verify QR HMAC (אם qr_payload)
  → redeem_voucher RPC: CAS issued → redeemed
  → voucher_redemptions (outcome + amount_collected_agorot כתיעוד גבייה מקומית)
  → order_items.settlement_status = redeemed
  → payout_ils / platform→supplier = 0   (מכוון, C11א)
```

| אחרי redeem | כן | לא |
|---|---|---|
| `voucher.status = redeemed` | ✓ | |
| תיעוד יתרה שנגבתה בעסק | ✓ | |
| שחרור Escrow / held | | ✗ |
| יצירת שורת payout | | ✗ |
| שינוי `platform_percent` על הזמנה ישנה | | ✗ |

פירוט RPC / outcomes / RLS:

```
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
```

UX (אין optimistic redeemed):

```
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
```

---

## 5. יומן הכרעות D1-D6

השאלות מ-23.07 הוכרעו. הן נשמרות עם התשובה (מסמך שמוחק שאלה משאיר קוראים בלי הקשר).

| # | מה נשאל | ההכרעה | איפה חיה |
|---|---|---|---|
| D1 | להוציא Escrow ממסלול קופון ולאשר "10% באתר / 90% בעסק" | **Escrow הוצא** (אין חיצוני, אין J5, אין held→payout לספק). **10/90 נדחה.** מקדמה = `coupon_price` חופשי; יתרה בעסק; לספק 0 מהפלטפורמה (C11א) | CONTRADICTIONS C3/C4/C11 |
| D2 | לאחד על `platform_percent` + ברירת מחדל 10% | אוחד על `platform_percent`. **ברירת המחדל בוטלה:** `NOT NULL` בלי `DEFAULT` | מיגרציה 050; C1/C2 |
| D3 | להעביר עמודות כסף לאגורות integer | **מאושר כיעד.** חלק מהעמודות/קוד עדיין ILS numeric; cutover מלא = פער מול קוד (סעיף 6) | GAPS / PENDING money integer |
| D4 | להחליף QR בלי מפתח ב-HMAC | **בוצע כחוזה.** `VOUCHER_QR_SECRET` + `KEV1`; בעלות על תמונת QR אינה מימוש | COUPON-LIFECYCLE / REDEMPTION |
| D5 | לשלוח מיגרציית מימוש (048 / redeem path) | **בוצע ככיוון חי.** טבלת audit קנונית: `voucher_redemptions`; RPC `redeem_voucher` | COUPON-REDEMPTION |
| D6 | Multi-Account בזמן עסקה מול payout batch (פיזי) | פיצול ledger ב-finalize; ביצוע payout = מסלול נפרד (`TransferFromDigitalBank` / CSV fallback). צד הביצוע בפרוד עדיין חלקי | PAYOUT-MECHANISM |

פתוח מהרשימה הזו בפועל: השלמת D3 (integer money בכל השכבות) והשלמת צינור D6 בפרודקשן. השאר סגור כהכרעה מחייבת.

---

## 6. פערים מול קוד (docs גוברים)

הכללים למעלה מחייבים. איפה שהקוד/סכימה חורגים, הקוד משתנה (לא המודל).

| פער | מצב טיפוסי | כיוון |
|---|---|---|
| כסף ILS `numeric` מול אגורות | עמודות/קריאות ישנות בשקלים | D3: agorot integer + גבול המרה יחיד |
| שמות `used` מול `redeemed` | קוראים/enums ישנים | כתיבה חדשה: `redeemed` בלבד; map ישן→חדש |
| `escrow_holds` / עמודות escrow | שאריות מסלול ישן | לא להפעיל כמסלול כסף; להסיר מהחוזה |
| `commission_percent` כידית | עמודה כפולה | להתעלם כפיצול; רק `platform_percent` |
| payout פיזי חלקי | ledger קיים; Transfer/UI חלקי | PAYOUT-MECHANISM; לא Escrow לקופון |
| `payout_ils = 0` על redeem | נראה כמו באג | **מכוון** תחת C11א |

רשימת פערים מורחבת:

```
docs/GAPS-CODE-VS-DOCS.md
```

---

## 7. Acceptance

- [ ] נוסחאות קופון/פיזי באגורות + invariants; snapshot ב-beginCheckout  
- [ ] GetLpResult לפני paid; No Escrow; redeem בלי payout  
- [ ] D1-D6 מתועדים; פערים מול קוד מסומנים; אין 10/90 ואין default לאחוז  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING batch #7: נוסחאות, snapshot, redeem בלי payout, D1-D6, gaps |
