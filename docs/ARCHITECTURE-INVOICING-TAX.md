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

## Implemented (STEP 42, 2026-10-08)

The platform issues its own documents. The provider's document module is a
reference, not the issuer.

| Concern | Where | Rule |
|---|---|---|
| Queue | `invoices` (107, 116), filled by `finalizeOrder` and `refundOrder` | one row per document, `idempotency_key` unique, `net + vat = total` CHECK |
| Number | `fn_next_invoice_number` (228, live) via `ensureInvoiceNumber` | one series per `<terminal>:<type>`; drawn once, written to the row, reused on retry (gapless) |
| Format | `src/lib/invoices/pdf.ts`, `composeInvoiceText` | issuer name / ח.פ / address, title + number, מקור/העתק, issue date (Asia/Jerusalem), customer, lines, net / VAT % / gross, means of payment + clearing reference, "מסמך ממוחשב", page X of Y; credit note names the invoice it reverses |
| VAT | `splitVatInclusive`, `VAT_RATE_BP` | extracted from the gross; coupon receipt states no VAT (advance) |
| Archive | R2 `invoices/<order>/<number>.pdf` via `archivePdf` | best effort; `document_url` null without R2, the account route renders a marked העתק on demand |
| Email | `buildInvoiceEmail` + `sendEmail` attachments | sent after the issued-write, idempotent on the invoice id, recorded in `emailed_at` / `email_error` (257, pending) |
| Provider | `requestProviderReference` | best effort, `sendByEmail: false`, number kept in `provider_response.provider`; `mock-doc-N` never reaches `document_number` |
| Not modelled | VAT exemption (Eilat, exempt dealer), allocation numbers (מספרי הקצאה) for invoices over the threshold | both need counsel and a field; neither is guessed |

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Invoicing/tax skeleton in `ke-arch` (`arch/docs-queue`) |
| 2026-10-08 | STEP 42: platform-issued PDF, own sequence, R2 archive, attached email; provider demoted to reference |
