# ארכיטקטורה: חשבוניות ומס

מסגרת חשבוניות לשיגור בישראל: קבלות ללקוח, זיכוי על refund, דוחות ספק.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
דורש ייעוץ רו"ח/מס לפני הפעלת חשבוניות מס אמיתיות.

מודל כסף: **No Escrow**. קופון: כל התשלום באתר = הכנסת פלטפורמה. פיזי: settlement batch, לא split ב-Cardcom.

מסמכים קשורים:

```
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-PAYMENT-RECONCILIATION.md
docs/ARCHITECTURE-SUPPLIER-SETTLEMENTS.md
docs/ARCHITECTURE-MONEY.md
docs/CONTRADICTIONS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| T1 | KenyonExpress = **פלטפורמה**. הלקוח משלם ל-KE (Cardcom). |
| T2 | קופון: קבלה/חשבונית על `coupon_price` בלבד; יתרה בבית העסק מחוץ לפלטפורמה. |
| T3 | פיזי: חשבונית ללקוח על הסכום ששולם באתר; דוח ספק על payout batch. |
| T4 | snapshot ב-`paid_at`: שם קונה, last4 (לא PAN), סכומים באגורות, VAT לפי counsel. |
| T5 | תעודת זיכוי על refund מאושר; קישור ל-order + voucher. |
| T6 | אינטגרציה: worker שרתי בלבד; אין מפתחות בדפדפן. |
| T7 | soft-launch: CSV לרו"ח מותר; API ספק חשבוניות לפני GA. |

### מסמכים (יעד)

| מסמך | מתי |
|---|---|
| קבלה / חשבונית מס ללקוח | אחרי `paid_at` |
| תעודת זיכוי | על refund מאושר |
| דוח לספק (פיזי) | על payout batch |

### נתונים ל-snapshot

```text
buyer_name, buyer_email
payment_last4 (לא PAN)
amount_agorot, vat_agorot (לפי counsel)
order_id, order_item_id
line_type: coupon | physical
platform_percent snapshot (פיזי)
terms_version
```

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Cardcom marketplace split | T1: פלטפורמה אחת; settlement נפרד. |
| חשבונית ספק על מקדמת קופון | T2: לא הכנסת ספק מהפלטפורמה. |
| Make/Zapier כ-ledger | T6: worker + idempotency בשרת. |
| מפתחות API בדפדפן | T6: server-only. |
| float בסכומי מס | MONEY: agorot integer. |
| חשבונית שמרמזת על נאמנות | No Escrow: ניסוח counsel. |

---

## סכמת DB

```text
invoices (
  id uuid PK,
  order_id uuid FK,
  order_item_id uuid NULL,
  invoice_type text,           -- receipt | tax_invoice | credit_note
  external_id text,            -- Green Invoice / Morning
  amount_agorot int NOT NULL,
  vat_agorot int,
  buyer_snapshot jsonb,
  issued_at timestamptz,
  idempotency_key text UNIQUE
)

invoice_lines (
  id uuid PK,
  invoice_id uuid FK,
  description_he text,
  quantity int,
  unit_price_agorot int,
  vat_rate_bp int
)
```

| snapshot | מקור |
|---|---|
| `order_items` | platform_percent, coupon_price |
| `orders` | paid_at, payment_method |
| `profiles` | buyer name (RLS-safe copy) |

טבלאות pending migration. עד אז: CSV export + `orders` snapshot.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | webhook replay paid | idempotency_key; invoice אחת |
| CE2 | partial refund | credit note על הסכום המוחזר |
| CE3 | refund לפני invoice | receipt או דילוג לפי counsel |
| CE4 | קופון + פיזי באותה הזמנה | שורות נפרדות |
| CE5 | VAT שונה לפי סוג מוצר | counsel; snapshot ב-issue |
| CE6 | ספק payout batch | דוח נפרד; לא על קופון |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | בחירת ספק (Green Invoice / Morning) | counsel + חוזה |
| O2 | `invoices` migration | pending |
| O3 | VAT rate על קופון vs פיזי | רו"ח |
| O4 | אינטגרציה Cardcom receipt | RECONCILIATION |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | skeleton ב-arch/docs-queue |
| 2026-08-12 | batch-2: תבנית חובה (5 סעיפים), עברית |
