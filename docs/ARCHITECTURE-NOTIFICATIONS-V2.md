# ARCHITECTURE-NOTIFICATIONS-V2.md

מצביע למודל ההתראות הסופי (V2).

Status: BINDING pointer · Date: 2026-08-02 · docs only.

**הטקסט המלא הקנוני:**

```
docs/ARCHITECTURE-NOTIFICATIONS.md
```

(עודכן 2026-08-02: מיזוג מלא של V2 לתוך הקובץ הקנוני ב-`ke-arch` / `arch/docs-queue`.)

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
| 2026-08-02 | מצביע מעודכן: הטקסט המלא חי ב-`ARCHITECTURE-NOTIFICATIONS.md` |
