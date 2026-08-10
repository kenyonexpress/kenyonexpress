# EMAIL-TEMPLATES-SPEC.md
# מפרט תבניות Resend (עברית, RTL)

מיפוי `kind` → מבנה טכני + חובות RTL. נוסחים מלאים:

```
docs/EMAIL-TEMPLATES-COPY.md
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
```

Status: **SPEC** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

ספק משלוח: **Resend**. MVP התראות: מייל לפני WhatsApp שיווקי.

---

## 0. מעטפת חובה (כל מייל)

| כלל | פירוט |
|---|---|
| שפה | `lang="he"` על `<html>` |
| כיוון | `dir="rtl"` על html + tables |
| יישור | `text-align: right` |
| פונט | `Arial, Helvetica, sans-serif` |
| מותג | פס עליון `#fed700`; דיו `#1a1a1a` |
| LTR בתוך RTL | קודים, URLs, סכומים ב-`<bdi dir="ltr">` |
| Plaintext | חובה לצד HTML |
| Escape | כל משתנה מ-DB |
| CTA | אחד ראשי |
| אסור | QR כ-`data:` URI; Escrow/נאמן/J5/held; הבטחת העברה לבנק |

רוחב תוכן מומלץ: 560px.

---

## 1. קטלוג תבניות

| kind | מתי נשלח | עותק ב-COPY | שיווקי? |
|---|---|---|---|
| `order_paid` | הזמנה paid בלי/לפני פירוט קופונים | §1 | לא |
| `coupon_issued` | voucher `issued` | §2 | לא |
| `coupon_expiry_48h` | 48ש לפני `expires_at` | §3 | לא |
| `coupon_redeemed` | אחרי מימוש מוצלח | ARCH subject + גוף קצר | לא |
| `coupon_expired` | cron פקיעה | ARCH | לא |
| `coupon_refunded` | אחרי refund מאושר | §7 | לא |
| `wallet_activity` | earn/spend ארנק | §4 | לא |
| `abandoned_cart` | נטישה + consent | §5 | **כן** (unsubscribe) |
| `supplier_sale` | הזמנה לספק | §6 | לא (תפעולי) |
| `welcome` | אחרי הרשמה | §8 | אופציונלי |

`coupon_redeemed` / `coupon_expired`: אם חסרים ב-COPY, להשלים לפי ARCHITECTURE-EMAIL-TEMPLATES לפני soft-open.

---

## 2. משתנים משותפים

| משתנה | משמעות |
|---|---|
| `{{first_name}}` | שם פרטי או ריק→"שלום" |
| `{{order_ref}}` | מזהה הזמנה לתצוגה |
| `{{product_name}}` | שם דיל בעברית |
| `{{code}}` | קוד קופון (LTR) |
| `{{paid_now_ils}}` | שולם באתר |
| `{{balance_at_business_ils}}` | יתרה בעסק |
| `{{expires_at_he}}` | תוקף מפורמט |
| `{{order_url}}` / `{{coupon_url}}` | לינקים absolute |
| `{{unsubscribe_url}}` | רק שיווקי |
| `{{contact_url}}` | תמיכה |

סכומים מגיעים מאגורות בשרת ומומרים לתצוגה; מקור אמת = DB.

---

## 3. שלד HTML מינימלי

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

---

## 4. Resend (תפעול)

| נושא | כלל |
|---|---|
| From | דומיין מאומת (SPF/DKIM) |
| Idempotency | מפתח פר `(kind, entity_id)` למניעת כפילות |
| Retry | תור + DLQ לפי NOTIFICATIONS |
| Preview | חובה ב-Resend לפני D0 לכל kind ליבה |
| לוג | message id בלי גוף מלא עם PII מיותר |

---

## 5. Acceptance לפני soft-open

- [ ] כל kind ליבת קופון: issued / expiry_48h / redeemed / expired / refunded  
- [ ] order_paid + plaintext  
- [ ] אין Escrow בנוסח  
- [ ] unsubscribe רק בשיווקי  
- [ ] בדיקת RTL ב-Gmail / Apple Mail  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מפרט Resend: קטלוג kind, מעטפת RTL, משתנים, acceptance |
