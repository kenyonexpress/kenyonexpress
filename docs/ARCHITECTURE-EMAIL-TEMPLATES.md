# ארכיטקטורה: תבניות מייל

תבניות **RTL** לכל אירוע במחזור חיי קופון (Resend).

Status: **BINDING** · עודכן: 2026-08-06  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
```

---

## 0. מעטפת חובה

- `lang="he"` + `dir="rtl"` על המסמך ועל טבלאות  
- `text-align: right`  
- פונט: `Arial, Helvetica, sans-serif`  
- פס מותג `#fed700`, דיו `#1a1a1a`  
- קודים/סכומים ב-`<bdi dir="ltr">`  
- חלק plaintext תמיד  
- Escape לכל משתנה  
- CTA ראשי אחד  

אסור: QR כ-`data:` URI; נוסח Escrow/נאמן; הבטחת העברה לבנק.

---

## 1. תבניות לכל אירוע קופון

| kind | Subject | גוף חובה |
|---|---|---|
| `coupon_issued` | הקופון שלך מוכן · {{product}} | קוד, שולם באתר, יתרה בעסק, תוקף, לינק `/coupon/{{id}}`, CTA ארנק |
| `coupon_expiry_48h` | תזכורת: הקופון פג תוך 48 שעות | קוד, תוקף, לינק |
| `coupon_redeemed` | הקופון מומש · {{product}} | עסק, זמן, סכום שנגבה בעסק, "אם לא אתם…" |
| `coupon_expired` | הקופון פג תוקף · {{product}} | הסבר קצר |
| `coupon_refunded` | הקופון בוטל / הוחזר · {{product}} | סכום החזר, דמי ביטול אם חלו, שאינו ניתן למימוש |

אירועים נלווים (לא מחליפים את מחזור הקופון):

| kind | Subject |
|---|---|
| `order_paid` | ההזמנה התקבלה · {{ref}} (רק בלי vouchers) |
| `supplier_sale` | הזמנה חדשה (תפעולי; בלי payout מקופון) |
| `wallet_activity` | עדכון בארנק · {{amount}} |

---

## 2. שלד HTML

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<body style="margin:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" dir="rtl" style="direction:rtl;text-align:right;">
    <tr><td align="center">
      <table width="560" dir="rtl" style="direction:rtl;text-align:right;background:#fff;border-top:4px solid #fed700;">
        <!-- לוגו, כותרת, גוף, CTA, פוטר -->
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 3. Acceptance

- [ ] כל אירוע קופון (הונפק/תזכורת/מומש/פג/הוחזר) עם subject + RTL  
- [ ] כסף: שולם באתר + יתרה בעסק  
- [ ] Preview ב-Resend לפני soft-open  

---

## 4. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | תבניות RTL לכל אירוע קופון כולל הוחזר |
