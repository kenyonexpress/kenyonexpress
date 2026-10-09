# ARCHITECTURE-INVOICING-TAX.md

<!-- v1-final-banner:2026-09-01 -->
> ⚠️ **Correction 2026-09-01. See `docs/ARCHITECTURE-OVERVIEW.md` §3.1.**
>
> **VAT is 18%**, one definition for the whole app: `VAT_RATE_BP = 1800` in
> `src/lib/money.ts`. The rate rose from 17% on 2025-01-01. The invoice module
> derives from that constant rather than carrying a second copy.
>
> VAT is extracted from a gross, VAT-inclusive amount, and the VAT half is
> computed by subtraction so `net + vat === gross` exactly. The platform books
> VAT only on its own commission. There is no escrow leg to tax.

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
