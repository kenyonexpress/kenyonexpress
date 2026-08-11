# ארכיטקטורה: כללי תמחור

מקור אמת מחייב לתמחור מוצר, פיצול פלטפורמה/ספק, מחיר קופון מוחלט, מבצעי בזק, הנחות תצוגה, וגבול מול אגרות סטטוטוריות.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #5/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-INVENTORY.md
docs/ARCHITECTURE-SEASONAL-CAMPAIGNS.md
docs/ARCHITECTURE-B2B-SALES.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-REFERRAL.md
docs/ARCHITECTURE-CUSTOMER-SUPPORT.md
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
```

מודל כסף מחייב: **No Escrow** לקופונים. `platform_percent` חובה **פר מוצר**, בלי `DEFAULT`. כל חישוב כסף פנימי באגורות integer (אין float אחרי גבול ILS→agorot).

היררכיה: `CONTRADICTIONS.md` (C1–C11) גובר. מסמך זה גובר על נוסחי תמחור ישנים בתוך דומיין המחיר. זרימת קופה: CHECKOUT-FLOW. סיכום מסחר: COMMERCE.

---

## 0. הכרעות (P1–P10)

| # | הכרעה |
|---|---|
| P1 | אין עמלה גלובלית ואין fallback. `products.platform_percent` **פר מוצר**, `NOT NULL`, בלי `DEFAULT`, admin only. Publish/מכירה נכשלים בלי ערך. |
| P2 | `platform_percent + supplier_split_percent = 100` (CHECK במוצר; שני החצאים מצולמים ל-`order_items`). |
| P3 | קופון: `coupon_price` (קנוני: `coupon_price_ils` / agorot מקביל) הוא שדה **מוחלט** באתר, לא נגזרת של אחוז. יתרה בעסק = face − coupon. **No Escrow**: אין נאמן, אין J5, אין held-until-redeem לספק. 100% מהמקדמה באתר = הכנסת פלטפורמה; `supplier_due` מהפלטפורמה = 0. |
| P4 | פיזי: הלקוח משלם 100% באתר. פיצול ledger לפי snapshot: `platform_cut = round(charged × platform_percent / 100)`, יתרה לספק ב-payout (לא בתוך checkout). |
| P5 | `discount_percent` לתצוגה בלבד; לא מקור חיוב ולא מקור פיצול. |
| P6 | מבצע בזק = חלון זמן + מחיר חלופי לפי שעון שרת; אחרי `paid` לא משנה snapshots. |
| P7 | אחרי `paid`: snapshots על `order_items` (אחוזים + סכומי אגורות) לא משתנים. שינוי מוצר חי לא רטרואקטיבי (C10). |
| P8 | `vendors.commission_rate` / `suppliers.commission_percent` / כל "שיעור ספק" **אינם** ברירת מחדל מחייבת לפיצול. לכל היותר רמז UI ביצירת מוצר. הידית היחידה בקופה ובסליקה: `products.platform_percent` (ואחרי קנייה: העתק ב-`order_items`). |
| P9 | כסף: המרה ILS→agorot פעם אחת בגבול; חישובים ב-`integer` / `bigint` אגורות; עיגול half-up פעם אחת על חלק הפלטפורמה; יתרה = total − fee (אין drift). |
| P10 | אגרות סטטוטוריות **אינן** עמלת פלטפורמה ואינן חלק מ-`platform_percent`: דמי ביטול עד 5% או 100 ₪ (הנמוך), ומע״מ 18% (כשחל על חשבונית/דיווח). ראה סעיף 6. |

---

## 1. שדות כסף במוצר

| שדה | תפקיד | חובה? |
|---|---|---|
| `price_ils` / face agorot | מחירון / שווי דיל (face) | כן לפרסום |
| `coupon_price_ils` (או agorot מקביל) | תשלום מוחלט באתר לקופון | כן לסוג קופון |
| `platform_percent` | עמלת פלטפורמה לפיצול פיזי; בקופון לביקורת/עקביות UI | כן תמיד לפני publish |
| `supplier_split_percent` | משלים ל-100 עם `platform_percent` | כן (זוג) |
| `discount_percent` | תווית הנחה לתצוגה (PDP/כרטיס) | אופציונלי |
| `flash_price_*` | מחיר בזק חלופי | אופציונלי |
| `flash_starts_at` / `flash_ends_at` | חלון הבזק (שעון שרת) | עם flash |
| `coupon_expiry_days` | בסיס ל-`expires_at` ב-mint | לקופון |
| `cashback_percent` | אופציונלי; מצולם בקנייה אם קיים | אופציונלי |

כללים:

- `coupon_price` ≤ face (לקופון). יתרה לתצוגה = face − coupon (לא מקור אמת נפרד לחיוב).
- אין לקרוא `commission_percent` כידית פיצול (C2).
- אין לקרוא שיעור ברמת ספק כברירת מחדל לפיצול (P8).
- עגלה לא שומרת מחיר כסמכות; המחיר נפתר בשרת ב-checkout.

### 1.1 ולידציית אדמין לפני publish

| בדיקה | תוצאה על כשל |
|---|---|
| `platform_percent` ריק / NULL | חסימת publish |
| `platform_percent + supplier_split_percent ≠ 100` | חסימה (DB CHECK + UI) |
| קופון בלי `coupon_price` חיובי | חסימה |
| קופון עם `coupon_price` > face | חסימה |
| פיזי בלי מחיר חיובי | חסימה |

---

## 2. קופון: מחיר מוחלט + No Escrow

```text
charged_on_site_agorot = coupon_price_agorot          # מוחלט, לא % מ-face
balance_at_business_agorot = face_agorot - coupon_price_agorot
platform_keeps_agorot = charged_on_site_agorot        # 100% מהמקדמה
supplier_due_from_platform_agorot = 0                 # No Escrow / C11א
```

| כלל | פירוט |
|---|---|
| מקור חיוב | רק `coupon_price` (או flash אם פעיל על אותו שדה חיוב) |
| גילוי ללקוח | "שולם באתר" + "יתרה בבית העסק"; לא להציג face כאילו שולם במלואו |
| סריקה | לא משחררת payout; לא מעבירה מקדמה לספק |
| Payout קופון | אסור כמסלול מוצר (ראה PAYOUT-MECHANISM) |
| אחרי `paid` | שורה `platform_settled` מבחינת מקדמה; יתרה בעסק מחוץ למערכת |

אסור בנוסח: נאמן, J5, held until redeem, שחרור Escrow.

### 2.1 דוגמה מספרית (אגורות)

| | ערך |
|---|---|
| face | 10000 (100.00 ₪) |
| coupon_price | 1500 (15.00 ₪) |
| חיוב Cardcom | 1500 |
| פלטפורמה שומרת | 1500 |
| לספק מהפלטפורמה | 0 |
| יתרה בעסק | 8500 |

`platform_percent` על מוצר קופון אינו קובע את חיוב האתר; החיוב = השדה המוחלט.

---

## 3. פיזי: חיוב מלא + פיצול snapshot

```text
line_total_agorot = unit_price_agorot * quantity
platform_fee_agorot = round_half_up(line_total_agorot * platform_percent / 100)
supplier_due_agorot = line_total_agorot - platform_fee_agorot
charged_on_site_agorot = line_total_agorot
balance_at_business_agorot = 0
```

| שלב | מה קורה |
|---|---|
| `beginCheckout` | קריאת מחיר + `platform_percent` מהשרת; צילום ל-`order_items` |
| `paid` / finalize | ledger לפי snapshot; לא לפי מוצר חי |
| payout | בנקאי נפרד (T+3 / מינימום לפי C8); לא Multi-Account בזמן הסליקה כמודל מחייב |

### 3.1 דוגמה מספרית

| | ערך |
|---|---|
| line_total | 20000 (200.00 ₪) |
| `platform_percent` | 12 |
| platform_fee | 2400 |
| supplier_due | 17600 |
| balance בעסק | 0 |

ארנק/referral בקופה: מפחיתים חיוב כרטיס; **לא** משנים `platform_percent`. הקצאת הארנק באה מצד הפלטפורמה בסליקה, לא מצד הספק (פירוט ב-COMMERCE / CHECKOUT-FLOW).

---

## 4. Snapshot ל-`order_items`

בזמן יצירת הזמנה (לפני/עם Low Profile), לכל שורה מצולמים לפחות:

| שדה snapshot | מקור |
|---|---|
| `platform_percent` | `products.platform_percent` (חובה) |
| `supplier_split_percent` / twin ישן | משלים / backfill |
| unit / line totals (agorot) | מחיר נפתר בשרת (כולל flash) |
| `charged_on_site` / `platform_fee` / `supplier_due` / `balance_due` | לפי סוג מוצר (סעיפים 2–3) |
| זהות ספק / מוצר | לדוחות ומימוש |

אחרי `paid`: אסור לעדכן snapshots בגלל שינוי אדמין במוצר. Refund/dispute נשענים על הסנאפשוט + מסלול REFUNDS.

Invariantים:

```text
קופון: charged_on_site + balance_at_business = face (לשורת הכמות המתאימה)
פיזי:  platform_fee + supplier_due = charged_on_site = line_total
קופון: supplier_due_from_platform = 0
```

---

## 5. מבצעי בזק והנחות

### 5.1 בזק

```text
if now_server() in [flash_starts_at, flash_ends_at) and flash_price set:
  charge = flash_price
else:
  charge = coupon_price (קופון) או price (פיזי)
```

| כלל | פירוט |
|---|---|
| שעון | שרת בלבד |
| הארכה | admin + audit בלבד; אין הארכה אוטומטית |
| מלאי | מכסת מלאי/קופון עדיין חלה |
| הזמנות ישנות | flash חדש לא משנה snapshots |
| snapshot | המחיר שנכנס ל-LP הוא מה שנשמר בשורה |

### 5.2 הנחות תצוגה וקופוני ארנק

| סוג | התנהגות |
|---|---|
| תווית `discount_percent` | תצוגה; אפשר נגזרת מחירון מול קופון |
| ארנק / referral | מפחיתים on-site בקופה; לא משנים % |
| קוד הנחה עתידי | snapshot בזמן checkout; לא רטרואקטיבי |
| B2B / עונתי | מסמכים נפרדים; חייבים לציית ל-P1/P3/P7 |

---

## 6. פטור / הפרדה מאגרות סטטוטוריות

אגרות אלה **אינן** חלק ממודל העמלה ואינן ממלאות `platform_percent`:

| אגרה | כלל מחייב | הערה |
|---|---|---|
| דמי ביטול | עד **5% או 100 ₪**, הנמוך, כשמותר בחוק | `fee_agorot = min(floor(paid_on_site * 5/100), 10000)`. לקופון: על מה ששולם באתר בלבד. פגם/אי אספקה → 0. פירוט: LEGAL / REFUNDS. |
| מע״מ | **18%** כשחל על חשבונית/דיווח מס | לא נכנס לנוסחת פיצול הספק; לא "עמלה". הצגה/חשבונית לפי מדיניות חשבונאית נפרדת. |

`platform_percent` = חלוקת הכנסה מסחרית בין פלטפורמה לספק (פיזי) או ביקורת תמחור (קופון). דמי ביטול ומע״מ = חובות דין/מס מחוץ לידית הפיצול.

אין לבלבל:

| מושג | האם זה `platform_percent`? |
|---|---|
| עמלת פלטפורמה בפיזי | כן |
| מקדמת קופון באתר | לא (זה `coupon_price`) |
| דמי ביטול 5%/100 ₪ | לא |
| מע״מ 18% | לא |
| שיעור ברירת מחדל לספק | לא קיים כמחייב |

---

## 7. טבלת סיכום: מי מקבל מה

| סוג | לקוח באתר | פלטפורמה | ספק מהפלטפורמה | ספק מחוץ לפלטפורמה |
|---|---|---|---|---|
| קופון | `coupon_price` | 100% מהמקדמה | 0 | יתרת face − coupon בעסק |
| פיזי | מחיר מלא | `platform_percent` מהשורה (snapshot) | `100 − platform_percent` ב-payout | אין יתרה בעסק |
| מנוי | `recurring_amount` למחזור | אותו מנגנון % מצולם פר חיוב | יתרה פר מחזור | לפי מוצר |

---

## 8. אסור (anti-patterns)

- default `platform_percent = 5` / 10 / כל קבוע במוצר או בקוד קופה  
- נאמן / J5 / held לספק על מקדמת קופון  
- גזירת `coupon_price` מ-`platform_percent × face` כמקור חיוב  
- שינוי רטרואקטיבי של % על הזמנות `paid`  
- חיוב מלקוח לפי מחיר ששמר האורח בעגלה  
- קריאת `vendors.commission_rate` / `suppliers.commission_percent` ב-settlement  
- הצגת דמי ביטול או מע״מ כאילו הם עמלת פלטפורמה  

---

## 9. Acceptance

- [ ] Publish נכשל בלי `platform_percent` (וגם בלי זוג שסכומו 100)
- [ ] אין fallback ל-5%/10% או לשיעור ספק בקופה / settlement
- [ ] קופון: חיוב = `coupon_price` מוחלט; `supplier_due` פלטפורמה = 0; אין held לספק
- [ ] פיזי: חיוב מלא; fee + supplier = line; snapshot לפני LP
- [ ] שינוי % אחרי `paid` לא משנה `order_items` ישנים
- [ ] Flash לא שובר snapshots ישנים; שעון שרת
- [ ] דמי ביטול 5%/100 ₪ ומע״מ 18% לא נכתבים כ-`platform_percent`
- [ ] UI אדמין: זוג אחוזים = 100; תצוגת יתרה בעסק לקופון
- [ ] חישובים באגורות integer; Cardcom מקבל ILS רק בגבול הספק

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | `platform_percent` + בזק + הנחות |
| 2026-08-06 | QA: קישור SEASONAL/B2B; חיזוק No Escrow |
| 2026-08-07 | QA: CONTRADICTIONS, SUPPORT, REFERRAL, EMAIL; איסור J5/held ב-P3 |
| 2026-08-12 | batch #5/50: הרחבה מחייבת P1–P10, snapshot, P8 נגד שיעור ספק, הפרדת דמי ביטול/מע״מ, אגורות, דוגמאות |
