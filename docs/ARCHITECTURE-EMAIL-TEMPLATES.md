# ARCHITECTURE: Email Templates

עיצוב **RTL** לכל תבנית מייל טרנזקציונית (Resend).

Status: **BINDING** · Updated: 2026-08-03 (pack-20)
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
```

---

## 0. מעטפת מחייבת

- `lang="he"` + `dir="rtl"` על `<html>` ועל טבלאות פנימיות
- `text-align: right`
- פונט: `Arial, Helvetica, sans-serif`
- מותג: פס עליון `#fed700`, דיו `#1a1a1a` / `#333e48`
- קודים וסכומים ב-`<bdi dir="ltr">`
- חלק plaintext תמיד
- Escape לכל משתנה
- CTA ראשי אחד למייל

---

## 1. קטלוג תבניות

| kind | Subject (עברית) | גוף חובה |
|---|---|---|
| `coupon_issued` | הקופון שלך מוכן · {product} | קוד, שולם באתר, יתרה בעסק, תוקף, לינק `/coupon/{id}`, CTA ארנק |
| `coupon_redeemed` | הקופון מומש · {product} | עסק, זמן, סכום שנגבה בעסק, "אם לא אתם…" |
| `coupon_expiry_48h` | תזכורת: הקופון פג תוך 48 שעות | קוד, תוקף, לינק |
| `coupon_expired` | הקופון פג תוקף · {product} | הסבר קצר |
| `order_paid` | ההזמנה שלך התקבלה · {ref} | רק בלי vouchers |
| `supplier_sale` | הזמנה חדשה ב-KenyonExpress | סיכום תפעולי; בלי הבטחת payout מקופון |
| `wallet_activity` | עדכון בארנק · {amount} | יתרה פנימית; "לא ניתן למשיכה" |
| `referral_bonus` | קיבלתם בונוס חבר מביא חבר | סכום ליתרה פנימית |
| `password_or_security` | התראת אבטחה | ללא קישורים גולמיים חשודים |
| `support_reply` | עדכון לפנייה {ticket} | תקציר בעברית |

אסור: QR כ-`data:` URI; נוסח Escrow/נאמן; הבטחת העברה לבנק.

---

## 2. מבנה HTML מינימלי

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<body style="margin:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" dir="rtl" style="direction:rtl;text-align:right;">
    <tr><td align="center">
      <table width="560" dir="rtl" style="direction:rtl;text-align:right;background:#fff;border-top:4px solid #fed700;">
        <!-- logo, title, body, CTA, footer unsubscribe -->
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 3. Acceptance

- [ ] כל kind עם subject + RTL shell
- [ ] Coupon money: שולם באתר + יתרה בעסק
- [ ] Preview ב-Resend לפני soft-open
- [ ] Unsubscribe רק ל-topics המותרים

---

## 4. Revision

| Date | Change |
|---|---|
| 2026-08-03 | pack-20: קטלוג תבניות RTL |
