# ארכיטקטורה: כסף (Money)

אגורות integer, עיגול, מע"מ, פיצול `platform_percent`, snapshot בזמן קנייה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-INVOICING-TAX.md
docs/ARCHITECTURE-WALLET-INTEGER.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CONTRADICTIONS.md
```

מודולי קוד קנוניים (קריאה בלבד; אין שינוי במסמך זה):

```
src/lib/money.ts
src/lib/commerce/money.ts
src/lib/commerce/product-money.ts
```

מודל עסקי: **No Escrow**. מקדמת קופון באתר = הכנסת פלטפורמה. יתרה בבית העסק מחוץ לפלטפורמה. אין payout פלטפורמה→ספק על קופון.

הערה מול `COMPLETE-SYSTEM-ARCHITECTURE.md`: סעיפי Escrow / `escrow_holds` שם **נדחו**. גובר המסמך הזה + `BUSINESS-MODEL.md`.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| M1 | יחידת כסף פנימית יחידה: **integer agorot**. `1 ₪ = 100` אגורות. אין float במסלול כסף. |
| M2 | כל חישוב כסף עובר בפרימיטיבים של `src/lib/money.ts` / `src/lib/commerce/money.ts` (או wrappers שמבוססים עליהם). |
| M3 | אחוזים ככסף: **basis points** integer. `100% = 10000 bp`. `10% = 1000 bp`. |
| M4 | עיגול קנוני: **half-up** בחשבון integer בלבד (`divRoundHalfUp` / `percentageOf`). |
| M5 | פיצול: עמלה מעוגלת **פעם אחת** על בסיס השורה; חלק הספק = **שארית** `base - platformFee`. אסור לכפול את שני האחוזים בנפרד. |
| M6 | `platform_percent` + `supplier_split_percent` פר מוצר, מסתכמים ל-`100`. **אין default** ב-DB או בקוד. null ≠ 0. |
| M7 | קופון (No Escrow): תשלום באתר = `coupon_price` מוחלט; `supplier_due` מהפלטפורמה = `0`; כל המקדמה = הכנסת פלטפורמה. יתרה = `face - paid_on_site`, נגבית בעסק מחוץ לפלטפורמה. |
| M8 | פיזי: לקוח משלם 100% באתר; `platformFee = applyBp(base, platform_bp)`; `supplierDue = base - platformFee` (payable ביישוב, לא Cardcom Multi-Account). |
| M9 | Snapshot immutable ב-`order_items` ב-`beginCheckout`: אחוזים, סכומי agorot, זהות ספק. אסור לקרוא מחדש מ-`products` אחרי הקנייה. |
| M10 | מע"מ: הפלטפורמה מפיקה חשבונית מס **רק על עמלתה/הכנסתה**. עמלה gross כולל מע"מ; `extractVat`; `vat = gross - net` בלי דליפת עיגול. |
| M11 | שיעור מע"מ קנוני בקוד: `VAT_RATE_BP = 1700` (17%). שינוי חוקי = עדכון קבוע + snapshot שיעור על שורת ledger/חשבונית. |
| M12 | Cardcom מקבל ILS מחרוזת/שתי ספרות רק בשכבת גבול; פנימית תמיד agorot. אימות סכום מול GetLpResult באגורות. |
| M13 | UI מציג ₪; DB ו-ledger שומרים agorot. המרה לתצוגה = `agorot/100` או `formatIls` בלבד. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| `numeric(12,2)` / float כמקור אמת | round-trip שובר אגורה; לא דטרמיניסטי בין סביבות. |
| עיגול banker / floor תמיד / ceil תמיד | לא תואם half-up הישראלי המקובל בחשבונאות כאן; הפרימיטיב כבר half-up. |
| כפל נפרד של `platform%` ו-`supplier%` | יוצר חוסר/עודף אגורה; נדחה לטובת residual. |
| default `platform_percent = 5` או `0` | מסתיר מוצר לא מוגדר; null חייב לחסום publish/checkout. |
| Escrow / held לספק על מקדמת קופון | סותר BUSINESS-MODEL / No Escrow. |
| חישוב מע"מ על face מלא של קופון או על יתרת העסק | חובת המע"מ של גבייה בעסק היא של הספק; הפלטפורמה רק על הכנסתה. |
| קריאת מחיר/% מ-`products` אחרי תשלום | משנה הזמנות היסטוריות כשהקטלוג משתנה. |
| אחוז ממחיר הפנים כחיוב קופון באתר | חיוב קנוני = `coupon_price` מוחלט בלבד. |

---

## 2. סכמת DB (קיים; אין DDL חדש במסמך זה)

שמות עמודות בפרוד עשויים לכלול twin `*_ils` / `*_agorot` / `*_bp` לפי שלב cutover. מקור אמת יעד: **agorot + bp**. פירוט cutover: `ARCHITECTURE-WALLET-INTEGER.md`.

### 2.1 מוצר (`products`)

| שדה (לוגי) | כלל |
|---|---|
| `price` / sticker | מחיר מחירון (face לקופון) |
| `coupon_price` | סכום מוחלט לתשלום באתר (קופון); חובה לסוג coupon |
| `platform_percent` / `platform_bp` | חובה; אין default |
| `supplier_split_percent` | משלים ל-100 (CHECK) |
| `discount_percent` | תצוגה; בקופון נגזר ממחירי sticker/coupon |

### 2.2 שורת הזמנה (`order_items`) — snapshot

| שדה (לוגי) | משמעות |
|---|---|
| `face_value_agorot` | שווי דיל / מחיר מלא × כמות |
| `paid_on_site_agorot` / `customer_pays_now` | מה שחויב באתר |
| `commission_agorot` / `platform_fee_agorot` | חלק פלטפורמה באגורות |
| `supplier_due` / `supplier_immediate_agorot` | לספק מהפלטפורמה (קופון: 0) |
| `balance_due_agorot` | יתרה בעסק (מחוץ לפלטפורמה) |
| `platform_percent` (+ legacy `commission_percent_snapshot`) | האחוז שבו חושב הבילינג |
| `supplier_split_percent`, `discount_percent`, `coupon_price_ils` | עותק הסכם/תצוגה |
| `supplier_name/phone/address/logo` | זהות ספק בזמן קנייה |
| `escrow_held_agorot` | תמיד 0 (No Escrow; legacy) |

### 2.3 Ledger / מע"מ

| רכיב | תפקיד |
|---|---|
| `platform_revenue` | נטו אחרי extractVat |
| `vat_output` | רכיב מע"מ; `gross - net` |
| `supplier_payable` | פיזי בלבד (יישוב) |
| `p_vat_rate_bp` | ברירת מחדל 1700 בפוסטים |

אין DDL חדש במסמך זה.

---

## 3. אגורות integer

```text
Agorot = safe integer
1 ILS = 100 agorot
Cardcom minor unit = אותה סקאלה
```

| פעולה | כלל |
|---|---|
| קלט ILS מממשק | `ilsToAgorot` / parse עם לכל היותר 2 ספרות אחרי הנקודה |
| סכום שורות | `sumAgorot` |
| כמות | `multiplyAgorot(unit, qty)` |
| אחוז | `applyBp` / `percentageOf` |
| תצוגה | `formatIls` / `agorotToIls` רק ב-UI / גבול ספק תשלום |

אסור: `amount * 0.17` ב-float. אסור `Number` לא-שלם כסכום ב-DB.

---

## 4. עיגול (rounding)

| מקרה | נוסחה | הערות |
|---|---|---|
| חלוקה half-up | `divRoundHalfUp(n, d)` | integer בלבד; ties away from zero |
| אחוז על סכום | `round_half_up(amount * bp / 10000)` | פעם אחת על בסיס השורה |
| פיצול | `platformFee = applyBp(base, bp)`; `supplierDue = base - platformFee` | השארית סופגת את האגורה |
| מע"מ מ-gross | `net = round_half_up(gross * 10000 / (10000+vatBp))`; `vat = gross - net` | `net+vat === gross` תמיד |
| אחוז מטופס ("33.33") | המרה דטרמיניסטית ל-bp | לא float חופשי בשרשרת |

אסור לעגל פעמיים (יחידה ואז שורה ואז הזמנה) על אותו רכיב בלי כלל מפורש. כלל נוכחי: עיגול עמלה על **סה"כ שורה** (`paid_on_site` / face לפי סוג).

---

## 5. פיצול `platform_percent`

```text
SPLIT_TOTAL = 100
platform_percent + supplier_split_percent = 100
```

```text
splitOnSiteCharge(base, platformPercent):
  platformFee = percentageOf(base, percentToBp(platformPercent))
  supplierDue = base - platformFee
```

| סוג מוצר | `base` לפיצול בפלטפורמה | תוצאה מחייבת |
|---|---|---|
| קופון | המקדמה ששולמה באתר | `commission = paid_on_site`; `supplier_due = 0` (No Escrow). האחוז עדיין מצולם לביקורת/הסכם, אבל אין payable לספק מהמקדמה. |
| פיזי | מחיר אחרי הנחה × כמות | `platformFee` + `supplierDue = base` |
| מנוי (עתידי) | `recurring_amount` לחיוב | אותו residual per invoice |

Publish gate: בלי זוג אחוזים תקין המוצר לא יוצא מ-`draft`. Checkout בלי split → כשל (לא כתיבת 100/0 שקטה).

---

## 6. Snapshot בזמן קנייה

נקודת צילום: `beginCheckout` (יצירת `order` + `order_items`), לפני/עם יצירת LowProfile.

```text
products (חי) ──buildOrderItemSnapshot + settlement──► order_items (immutable)
```

| מה מצולם | למה |
|---|---|
| `platform_percent` / bp שחויב בפועל | שינוי קטלוג לא משנה הזמנה ישנה |
| `supplier_split_percent` | הסכם |
| סכומי agorot (face, paid, commission, due, balance) | התאמה ל-Cardcom / ledger |
| פרטי ספק (שם/טלפון/כתובת/לוגו) | דף קופון/חשבונית אחרי שינוי ספק |
| `coupon_price` | הוכחת מחיר שנגבה |

אחרי `paid`: מימוש/פקיעה/יישוב קוראים **רק** מה-snapshot. עדכון `products.platform_percent` לא נוגע בשורות קיימות.

Idempotency: replay ל-finalize לא משכתב סכומי snapshot; רק משלים הנפקה/סטטוס.

---

## 7. מע"מ (VAT)

| כלל | פירוט |
|---|---|
| בסיס | מחירים ללקוח = **כולל מע"מ** (gross-inclusive) על הכנסת הפלטפורמה |
| חילוץ | `extractVat(gross, VAT_RATE_BP)` |
| הכרה | במעמד `paid` (cash basis לפלטפורמה) |
| היקף | רק על `commission` / הכנסת פלטפורמה (קופון: כל המקדמה; פיזי: העמלה) |
| לא בטווח פלטפורמה | מזומן יתרה בעסק; חובת מע"מ של הספק |
| חשבונית | ראה `ARCHITECTURE-INVOICING-TAX.md`; ייעוץ רו"ח לפני GA מס מלא |

```text
gross (platform income)
  net = round_half_up(gross * 10000 / 11700)   # 17%
  vat = gross - net
ledger: credit platform_revenue(net), credit vat_output(vat)
```

---

## 8. זרימת סכומים (סיכום)

### 8.1 קופון

```text
face = sticker × qty
paid_on_site = coupon_price × qty
balance_at_business = face - paid_on_site   # מחוץ לפלטפורמה
commission = paid_on_site
supplier_due_platform = 0
escrow_held = 0
VAT על commission בלבד
```

### 8.2 פיזי

```text
base = discounted_unit × qty   # עיגול יחידה לפי physicalOnSiteCharge ואז כמות לפי כללי settlement
platformFee = applyBp(base, platform_bp)
supplierDue = base - platformFee
VAT על platformFee
supplierDue → settlement batch (לא ב-charge)
```

---

## 9. מקרי קצה

| קוד | סימפטום | תוצאה |
|---|---|---|
| `null_platform_percent` | מוצר בלי אחוז | חסימת publish/checkout; לא מסיקים 0 |
| `split_not_100` | 70+20 | דחיית טופס/כתיבה |
| `agorot_float` | ערך לא-שלם | RangeError / דחייה |
| `amount_mismatch` | Cardcom ≠ paid_on_site | לא `paid`; ראה CHECKOUT / WEBHOOKS |
| `catalog_price_change_after_buy` | שינוי מוצר אחרי snapshot | שורת הזמנה ללא שינוי |
| `double_round` | עיגול יחידה+שורה לא עקבי | באג; חישוב רק דרך פרימיטיב אחד ל-settlement |
| `vat_leak` | net+vat ≠ gross | אסור; תמיד vat = gross-net |
| `coupon_supplier_due_nonzero` | ניסיון held/payable על מקדמה | אסור תחת No Escrow |
| `wallet_partial` | ארנק + כרטיס | כל רכיב באגורות; סה"כ = paid_on_site |

---

## 10. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | יישור שמות עמודות חיים (`platform_fee_agorot` מול `commission_agorot` / `*_ils`) | תיעוד מול DB; cutover ב-WALLET-INTEGER; בלי DDL כאן |
| O2 | האם שיעור מע"מ מצולם פר שורת הזמנה או רק ב-ledger event | מומלץ snapshot `vat_rate_bp` על journal; לקבע לפני חשבוניות אוטומטיות |
| O3 | ספק חשבוניות (Green Invoice / Morning / ייצוא ידני) | INVOICING-TAX; ייעוץ רו"ח |
| O4 | עיגול הנחה פיזית: ברמת יחידה בלבד או גם על שורה אחרי qty | לקבע ב-PRICING-RULES מול הקוד החי |
| O5 | מנוי: האם snapshot אחוזים מחדש בכל חיוב חוזר או רק ב-subscribe | SUBSCRIPTIONS; ברירת מחדל מומלצת = צילום מחדש ממוצר בחיוב, עם audit |

עודכן: 2026-08-12.

---

## 11. Acceptance

- [ ] אגורות integer + bp בלי float במסלול כסף  
- [ ] half-up מתועד כעיגול יחיד  
- [ ] פיצול residual; אין default ל-`platform_percent`  
- [ ] קופון No Escrow: `supplier_due=0`  
- [ ] Snapshot ב-beginCheckout immutable  
- [ ] מע"מ רק על הכנסת פלטפורמה; extractVat בלי דליפה  
- [ ] חלופות שנדחו + DB + מקרי קצה + פתוחות  

---

## 12. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | יצירת BINDING: agorot, rounding, VAT, split, snapshot |
