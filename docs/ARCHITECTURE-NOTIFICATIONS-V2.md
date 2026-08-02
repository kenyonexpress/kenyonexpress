# ARCHITECTURE-NOTIFICATIONS-V2.md

מצביע למודל ההתראות הקנוני.

Status: BINDING pointer · Date: 2026-08-03 · docs only.

**הטקסט המלא:**

```
docs/ARCHITECTURE-NOTIFICATIONS.md
```

## Stack (final)

**Resend + Supabase Trigger + Edge Function worker.**  
No Make. No Zapier.  
גשר זמני מותר: Vercel cron עם אותה סמנטיקת outbox.

## Events (must)

1. אישור הזמנה ללקוח (`order_paid`)
2. הודעת מכירה/קופון לספק (`supplier_sale`)
3. אישור סריקה ללקוח (`voucher_redeemed`)

## Also required

תבניות עברית RTL · retry + DLQ · suppression/unsubscribe · מסלול כסף לא מחכה ל-provider.

## Revision

| Date | Change |
|---|---|
| 2026-07-31 | V2 summary |
| 2026-08-02 | מצביע לטקסט המלא |
| 2026-08-03 | מצביע מעודכן אחרי rewrite ב-`docs/final-pack` |
