# ARCHITECTURE-NOTIFICATIONS-V2.md

מצביע למודל ההתראות הקנוני.

Status: BINDING pointer · Date: 2026-08-03 · docs only.

**הטקסט המלא:**

```
docs/ARCHITECTURE-NOTIFICATIONS.md
```

## Stack (final)

**Resend + Supabase DB Trigger + Edge Function worker.**  
No Make. No Zapier.

## Events (must)

1. `order_confirmation` (לקוח)
2. `coupon_purchased` (לקוח + QR)
3. `coupon_redeemed` (לקוח; ספק משני)
4. `supplier_new_order` (ספק)
5. `refund` (לקוח)

## Also required

תבניות עברית RTL · retry + DLQ · `dedupe_key` + Resend `Idempotency-Key` · מסלול כסף לא מחכה ל-provider.

## Revision

| Date | Change |
|---|---|
| 2026-07-31 | V2 summary |
| 2026-08-03 | מצביע ל-5 אירועי ליבה + idempotency |
