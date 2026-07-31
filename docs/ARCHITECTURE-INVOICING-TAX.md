# ARCHITECTURE-INVOICING-TAX.md

ארכיטקטורת **חשבוניות / מס** (מסגרת מוצר לשיגור בישראל).

Status: BINDING product skeleton · `ke-arch` · Date: 2026-07-31 · docs only.  
דורש ייעוץ רו״ח/מס לפני הפעלת חשבוניות מס אמיתיות.

## Model
KenyonExpress is a **platform**. Customer pays KenyonExpress (Cardcom).  
Coupon prepaid stays with platform; physical supplier payout is settlement, not a Cardcom marketplace split.

## Documents (target)
| Doc | When |
|---|---|
| קבלה / חשבונית מס ללקוח | אחרי `paid_at` |
| תעודת זיכוי | על refund מאושר |
| דוח לספק (פיזי) | על payout batch (לא על מקדמת קופון) |

## Data to snapshot at pay
Buyer name, last4 (not PAN), amounts in agorot, VAT treatment per counsel, order_id, line types.

## Integration options (decide before GA)
1. Manual export CSV for accountant (soft-launch OK).  
2. Israeli invoicing provider API (Green Invoice / Morning / equivalent) via **server-only** worker.  
3. No browser keys. No Make/Zapier as ledger.

## Forbidden
Issuing supplier "payout invoice" that implies coupon prepaid was held in Escrow.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Invoicing/tax skeleton in `ke-arch` (`arch/docs-queue`) |
