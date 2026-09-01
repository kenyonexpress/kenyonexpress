# Payments layer

כללי העסקים הסופיים (2026-07-24, STATE.md). כל מסמך או קוד שסותר אותם: בטל.

## המודל

| | קופון | פיזי |
|---|---|---|
| הלקוח משלם באתר | `products.coupon_price_ils` במלואו (סכום מוחלט שהאדמין קובע) | 100% מהמחיר |
| מה נשאר בפלטפורמה | הכל | `platform_percent` מהסכום |
| מה מקבל הספק מהפלטפורמה | 0 | היתרה אחרי העמלה |
| בבית העסק | הלקוח משלם את היתרה (face - coupon_price) בסריקה, ואז הוואוצ'ר פג | אין |
| Escrow | אין | אין |
| אחוז קבוע / ברירת מחדל | אין. מוצר בלי הערך המחייב שלו לא נמכר | אין |

`platform_percent` הוא פר-מוצר ומצולם ל-`order_items` בזמן הקנייה (immutable).
‏settlement לעולם לא קורא אחוז חי מהמוצר.

## הקבצים

| קובץ | תפקיד |
|---|---|
| `src/lib/commerce/commission.ts` | מנוע תצוגת עגלה (customerPaysNow, platformFee) |
| `src/server/domain/orders/settlement.ts` | צילום הכסף להזמנה + פירוק פר-יחידה לוואוצ'רים |
| `src/server/domain/orders/state-machine.ts` | מצבי שורה: `paid -> platform_settled` (קופון) / `split_executed` (פיזי) |
| `src/server/actions/payments/checkout.ts` | ‏beginCheckout: ולידציה, snapshot, ‏Cardcom hosted page |
| `src/server/payments/finalize.ts` | הכותב היחיד של המעבר ל-paid; מנפיק ואוצ'רים דרך `src/server/domain/vouchers/` |
| `src/server/actions/payments/refund.ts` | זיכוי אדמין: חוקי רק כשכל הוואוצ'רים עדיין `issued` |
| `src/server/payments/refund.ts` | מכונת ביצוע הכסף: `pending` -> `wallet_credited` -> `method_reversed` -> `completed` |
| `src/server/domain/vouchers/` | הנפקה, קוד, QR חתום, מכונת מצבים, מימוש |

## אינווריאנטים

- ‏face = paid_on_site + balance_due, פר שורה ופר ואוצ'ר.
- קופון: ‏commission = paid_on_site, ‏supplier_due = 0.
- פיזי: ‏commission + supplier_due = face.
- הנפקת ואוצ'רים אידמפוטנטית (ספירה מול quantity + UNIQUE(code)).
- ‏REFUND לכרטיס חסום ברגע שואוצ'ר אחד נצרך (redeemed/expired).

## Cardcom

‏API ישן (`/Interface/*.aspx`). ‏webhooks לא חתומים: האימות הוא secret ב-URL +
‏GetLpResult חובה מהשרת. פירוט: זכרון הפרויקט `cardcom-legacy-api-truth` ו-
`docs/CARDCOM-ARCHITECTURE.md`.
