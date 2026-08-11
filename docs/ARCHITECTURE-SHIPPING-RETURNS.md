# ארכיטקטורה: משלוחים והחזרות (Shipping & Returns)

מוצרים פיזיים: כתובת, סטטוס משלוח, החזרות. קופונים מחוץ להיקף משלוח.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**. refund דרך Cardcom + ledger; snapshot `platform_percent`.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-ACCOUNT-AREA.md
```

---

## 0. החלטה (SR1 עד SR7)

| # | הכרעה |
|---|---|
| SR1 | פלטפורמה לא מחזיקה מלאי; ספק משלח. |
| SR2 | כתובת חובה ב-checkout אם יש שורת physical. |
| SR3 | snapshot כתובת להזמנה בזמן paid. |
| SR4 | סטטוס פריט: pending → packing → shipped → delivered. |
| SR5 | החזרה physical: תמיכה/ticket v1; לא portal self-serve חובה. |
| SR6 | קופון issued: refund אם לא redeemed; used: בדרך כלל לא. |
| SR7 | refund לא מחשב מחדש `platform_percent` ממחיר חי. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| KE מחזיק מלאי מרכזי | SR1; מודל marketplace |
| carrier API v1 (דואר/צ'יטה) | scope; ספק מעדכן ידני |
| return portal self-serve day-1 | SR5; support מספיק |
| משלוח לקופון | אין physical |
| escrow held עד delivered | No Escrow |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.**

| טבלה / שדה | שימוש |
|---|---|
| `user_addresses` | כתובות לקוח |
| `orders.shipping_address_snapshot` | frozen at paid |
| `order_items.fulfillment_status` | SR4 enum |
| `products.delivery_days` | PDP promise |
| `products.product_type` | physical vs coupon |

---

## 3. זרימות

| סוג | משלוח | החזרה |
|---|---|---|
| Physical | ספק → לקוח | לפי חוק + תנאים |
| Coupon | אין | לפני redeem: refund path |

```text
paid (physical)
  → notify supplier.new_order_physical
  → supplier: packing → shipped
  → customer /account/orders tracking
```

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| SH-E1 | checkout physical בלי כתובת | validation fail |
| SH-E2 | כתובת השתנתה אחרי paid | snapshot wins; support |
| SH-E3 | mixed cart coupon+physical | כתובת רק ל-physical |
| SH-E4 | shipped אחרי cancel request | support + refund policy |
| SH-E5 | coupon partial redeem multi-qty | per-voucher refund rules |
| SH-E6 | supplier never ships | SLA support; refund |
| SH-E7 | international address v1 | block or manual |

---

## 5. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | carrier tracking integration | 2026-08-12 |
| O2 | return portal v2 | 2026-08-12 |
| O3 | `[דורש עו״ד]` remote sale returns copy | 2026-08-12 |

---

## 6. Acceptance

- [ ] SR1-SR7 מתועדים
- [ ] snapshot כתובת ב-paid
- [ ] refund rules coupon vs physical
- [ ] טסטים SR1-SR3 (ראה TESTING)

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | shipping/returns phys |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING |
