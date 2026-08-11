# ארכיטקטורת Payout (סקירה)

תקציר BINDING לתשלום ספק על **מוצר פיזי** בלבד. פירוט מנגנון, באצ', T+N:

```
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/VENDOR-PAYOUT-SPEC.md
docs/ARCHITECTURE-SUPPLIER-SETTLEMENTS.md
```

Status: **BINDING (pointer)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; קופון = **אין payout**.

---

## החלטה

| # | הכרעה |
|---|---|
| PO1 | **קופון: אין payout** מהפלטפורמה; ספק גובה יתרה בעסק. |
| PO2 | **פיזי:** ledger ב-`settlement_events` (agorot); `kind` כולל `payout_settled`, `supplier_debit`. |
| PO3 | Snapshot: `order_items.supplier_immediate_agorot`, `platform_percent` בזמן רכישה. |
| PO4 | באצ' שבועי + אישור admin; העברה בנק **ידנית** (CSV) עד automation. |
| PO5 | T+N ימי עסקים (`payout_hold_business_days`); סף מינימום (ברירת מחדל ₪100). |
| PO6 | `platform_percent` פר מוצר, **בלי default**; לא recompute ב-settlement. |
| PO7 | Chargeback/refund אחרי payout → `supplier_debit` בבאצ' הבא. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow release אחרי מימוש קופון | No Escrow; אין held לספק. |
| payout אוטומטי יומי MVP | manual batch + audit קודם. |
| `payout_statements` בלי יישום | G1: טבלאות לא בפרוד; ledger קיים. |
| float בשקלים ב-ledger | agorot bigint בלבד. |
| percent גלובלי לספק | פר מוצר + snapshot. |

---

## סכמת DB

**קיים:**

```text
settlement_events: kind, amount_agorot, supplier_id, order_item_id, idempotency_key
order_items: supplier_immediate_agorot, settlement_status, platform_percent (snapshot)
suppliers: min_payout_ils, payout_hold_business_days (מ-051, אם הוחל)
```

**לא בפרוד (G1):**

```text
payout_statements, supplier_payouts, payout_status enum
```

פונקציות מ-051 (אם הוחל): `add_business_days`, `payout_available_at`.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | ספק בלי פרטי בנק | לא נכנס לבאצ'; קופון OK. |
| CE2 | יתרה < סף מינימום | roll לבאצ' הבא. |
| CE3 | refund לפני payout | לא `payout_settled`; adjust ledger. |
| CE4 | refund אחרי payout | `supplier_debit`. |
| CE5 | ספק מושעה | block new accrual; existing owed נשאר. |
| CE6 | כפילות generate batch | idempotency_key + admin lock. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | `payout_statements` UI + RPC | G1; מיגרציות pending לא הוחלו. |
| O2 | Cardcom TransferFromDigitalBank | O3 ב-CARDCOM-ARCHITECTURE. |
| O3 | עמודות בנק ב-`suppliers` | LAUNCH B2; אין עמודות בפרוד 07.08. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | DEPRECATED banner → pointer |
| 2026-08-12 | batch-2: BINDING 5 סעיפים; קיצור |
