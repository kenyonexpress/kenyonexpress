# ארכיטקטורה: תבניות מייל

תבניות **RTL** לאירועי מחזור חיי קופון (Resend).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: `arch/docs-batch-2` · batch #27/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/CONTRADICTIONS.md
```

---

## 0. מעטפת חובה

| כלל | פירוט |
|---|---|
| שפה | `lang="he"` + `dir="rtl"` על המסמך ועל טבלאות |
| יישור | `text-align: right` |
| פונט | `Arial, Helvetica, sans-serif` |
| מותג | פס עליון `#fed700`, דיו `#1a1a1a` |
| LTR tokens | קודים/סכומים/URL ב-`<bdi dir="ltr">` |
| Plaintext | תמיד מקביל ל-HTML |
| Escape | לכל משתנה דינמי |
| CTA | ראשי אחד בלבד |

אסור: QR כ-`data:` URI; נוסח נאמן / held / J5; הבטחת העברה לבנק; עמלה קבועה בתבניות.  
מודל כסף בנוסח: **שולם באתר** + **יתרה בעסק**. סכומים מ-`*_agorot` בלבד.

---

## 1. תבניות מחזור קופון

| kind | Subject | גוף חובה |
|---|---|---|
| `coupon_issued` / `voucher_issued` | הקופון שלך מוכן · {{product}} | קוד, שולם באתר, יתרה בעסק, תוקף, לינק `/coupon/{{id}}`, CTA ארנק/קופונים |
| `coupon_expiry_48h` | תזכורת: הקופון פג תוך 48 שעות | קוד, תוקף, לינק (בלי דילים קידומיים) |
| `coupon_redeemed` / `voucher_redeemed` | הקופון מומש · {{product}} | עסק, זמן, סכום שנגבה בעסק, "אם לא אתם…" |
| `coupon_expired` | הקופון פג תוקף · {{product}} | הסבר קצר; בלי upsell חובה |
| `coupon_refunded` | הקופון בוטל / הוחזר · {{product}} | סכום החזר, דמי ביטול אם חלו, שאינו ניתן למימוש |

אירועים נלווים (לא מחליפים מחזור קופון):

| kind | Subject |
|---|---|
| `order_paid` | ההזמנה התקבלה · {{ref}} (רק כשאין vouchers / או בנוסף לפי NOTIFICATIONS) |
| `supplier_sale` | הזמנה חדשה (תפעולי לספק) |
| `wallet_cashback_earned` / `wallet_activity` | עדכון בארנק · {{amount}} |

מיפוי `kind` ב-outbox ל-template key: לפי `ARCHITECTURE-NOTIFICATIONS.md`. Alias ישנים (`coupon_*`) וחדשים (`voucher_*`) מצביעים על אותה מעטפת RTL.

---

## 2. שלד HTML

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<body style="margin:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" dir="rtl" style="direction:rtl;text-align:right;">
    <tr><td align="center">
      <table width="560" dir="rtl" style="direction:rtl;text-align:right;background:#fff;border-top:4px solid #fed700;">
        <!-- לוגו, כותרת, גוף, CTA יחיד, פוטר -->
      </table>
    </td></tr>
  </table>
</body>
</html>
```

פוטר טרנזקציוני: שם העסק + קישור חשבון.  
פוטר שיווקי: בנוסף "פרסומת", הסרה, ח.פ. (ראה MARKETING).

---

## 3. משתנים וכסף

| משתנה | מקור | הערה |
|---|---|---|
| `{{product}}` | snapshot מוצר | עברית |
| `{{code}}` | קוד שובר | ב-`<bdi>` |
| `{{paid_agorot}}` | payload | תצוגה ₪ = agorot/100 |
| `{{balance_agorot}}` | payload | "יתרה בעסק" |
| `{{expires_at}}` | Asia/Jerusalem | פורמט עברי קריא |
| `{{cta_url}}` | absolute HTTPS | לא shortener חשוד |

אסור לחשב כסף בתבנית ממקור שני. אין שדות held.

---

## 4. Acceptance

- [ ] כל אירוע קופון (הונפק / 48h / מומש / פג / הוחזר) עם subject + RTL
- [ ] כסף: שולם באתר + יתרה בעסק; agorot בלבד
- [ ] Escape + plaintext + CTA יחיד
- [ ] Preview ב-Resend לפני soft-open

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #27/50: ריענון BINDING (RTL לכל אירועי מחזור קופון) |
