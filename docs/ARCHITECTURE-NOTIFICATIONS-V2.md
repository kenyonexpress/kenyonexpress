# ARCHITECTURE-NOTIFICATIONS-V2.md

ארכיטקטורת התראות **V2** (סיכום מחייב ב-`ke-arch`).

Status: BINDING pointer · Date: 2026-07-31 · docs only.  
Full text: `ke-arch-notifications-v2/docs/ARCHITECTURE-NOTIFICATIONS-V2.md`.

## Stack (final)
**Resend + Supabase Trigger + Edge Function worker.**  
No Make. No Zapier.

## Events (must)
1. Coupon purchase: email+WhatsApp to customer with QR; supplier sold alert (no payout).  
2. Coupon redeem: customer confirm; supplier summary.  
3. Expiry in 48h: customer reminder.  
4. Physical order: supplier ship alert.

## Also required
RTL Hebrew templates · retry+DLQ · unsubscribe/consent · money paths never await provider.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | V2 summary mirrored into `ke-arch` (`arch/docs-queue`) |
