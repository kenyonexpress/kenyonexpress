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
| `coupon_redeemed` | אחרי מעבר voucher → `redeemed` | ARCH + גוף קצר בעברית | לא |
| `coupon_expired` | cron פקיעה → `expired` | ARCH | לא |
| `coupon_refunded` | אחרי מעבר → `refunded` | §7 | לא |
| `wallet_activity` | earn/spend ארנק | §4 | לא |
| `abandoned_cart` | נטישה + consent | §5 | **כן** (unsubscribe) |
| `supplier_sale` | הזמנה לספק | §6 | לא (תפעולי) |
| `welcome` | אחרי הרשמה | §8 | אופציונלי |

`coupon_redeemed` / `coupon_expired`: אם חסרים ב-COPY, להשלים לפי ARCHITECTURE-EMAIL-TEMPLATES לפני soft-open.  
סטטוסי voucher: `issued` / `redeemed` / `expired` / `refunded` (`COUPON-LIFECYCLE-SPEC.md`).

---

## 1.1 גוף מלא לכל kind (עברית)

### `order_paid`

**נושא:** ההזמנה שלך התקבלה · {{order_ref}}  
**גוף:** היי {{first_name}}, התשלום עבר. מספר הזמנה {{order_ref}}. שולם באתר: ₪{{paid_now_ils}}. {{#if balance_at_business}}יתרה בעסק: ₪{{balance_at_business_ils}}.{{/if}}  
**CTA:** צפייה בהזמנה → {{order_url}}

### `coupon_issued`

**נושא:** הקופון שלך מוכן · {{product_name}}  
**גוף:** היי {{first_name}}, הקופון ל-{{product_name}} מוכן. קוד: {{code}}. תוקף עד {{expires_at_he}}. שולם באתר ₪{{paid_now_ils}}. {{#if balance_at_business_ils}}יתרה בעסק ₪{{balance_at_business_ils}}.{{/if}} מציגים QR בעסק לסריקה.  
**CTA:** פתחו את הקופון → {{coupon_url}}

### `coupon_expiry_48h`

**נושא:** תזכורת: הקופון ל-{{product_name}} פג בעוד כ-48 שעות  
**גוף:** היי {{first_name}}, הקופון ל-{{product_name}} בתוקף עד {{expires_at_he}}. קוד: {{code}}. אחרי התאריך אי אפשר לממש.  
**CTA:** פתחו קופון → {{coupon_url}}

### `coupon_redeemed`

**נושא:** הקופון ל-{{product_name}} מומש  
**גוף:** היי {{first_name}}, הקופון שלכם נסרק בהצלחה אצל {{supplier_name}} ב-{{redeemed_at_he}}. אם לא אתם ביצעתם את המימוש, פנו מיד לתמיכה.  
**CTA:** ההזמנות שלי → {{orders_url}}

### `coupon_expired`

**נושא:** פג תוקף: {{product_name}}  
**גוף:** היי {{first_name}}, הקופון ל-{{product_name}} פג ב-{{expires_at_he}} ולא ניתן למימוש. שאלות? {{contact_url}}.  
**CTA:** דילים נוספים → {{home_url}}

### `coupon_refunded`

**נושא:** ההחזר בוצע · {{order_ref}}  
**גוף:** היי {{first_name}}, אישרנו החזר להזמנה {{order_ref}}. סכום: ₪{{refund_ils}}. {{#if cancel_fee}}דמי ביטול: ₪{{cancel_fee_ils}}.{{/if}} הקופון אינו ניתן למימוש.  
**CTA:** ההזמנות שלי → {{orders_url}}

### `wallet_activity`

**נושא:** ₪{{amount_ils}} נכנסו לארנק שלכם  
**גוף:** היי {{first_name}}, נוספו ₪{{amount_ils}} ליתרת הארנק (זיכוי פנימי באתר בלבד, לא משיכה לבנק). יתרה: ₪{{wallet_balance_ils}}.  
**CTA:** הארנק שלי → {{wallet_url}}

### `abandoned_cart` (שיווקי)

**נושא:** שכחתם משהו בעגלה?  
**גוף:** היי {{first_name}}, התחלתם הזמנה ולא סיימתם. לחצו לחזרה לעגלה. להסרה: {{unsubscribe_url}}.  
**CTA:** חזרו לעגלה → {{cart_url}}

### `supplier_sale`

**נושא:** הזמנה חדשה · {{order_ref}} · {{product_name}}  
**גוף:** שלום {{supplier_contact_name}}, נרשמה הזמנה {{order_ref}} ל-{{product_name}}. {{#if is_coupon}}יתרת לקוח בעסק: ₪{{balance_due_ils}}. סריקה רק במערכת.{{/if}} בלי הבטחת payout מקופון.  
**CTA:** פורטל ספק → {{supplier_order_url}}

### `welcome`

**נושא:** ברוכים הבאים ל-KenyonExpress  
**גוף:** היי {{first_name}}, אחרי קנייה הקופון יופיע תחת "הקופונים שלי". מציגים QR בעסק ומשלמים יתרה בקופה.  
**CTA:** לדף הבית → {{home_url}}

נוסחים מורחבים (כולל plaintext מלא): `EMAIL-TEMPLATES-COPY.md`.

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

## 4.1 Webhooks Resend (סטטוסי משלוח)

| אירוע Resend | פעולה אצלנו |
|---|---|
| `email.sent` | עדכון `notification_deliveries.status=sent` |
| `email.delivered` | `delivered` + timestamp |
| `email.bounced` / `complained` | `failed`; השבתת שיווק לכתובת; אל תכבה טרנזקציוני בלי מדיניות |
| `email.delivery_delayed` | לוג; retry לפי תור |

Webhook חתום + idempotent לפי `email_id`. אין לשמור גוף HTML מלא בלוג האירועים.

---

## 5. Acceptance לפני soft-open

- [ ] כל kind ליבת קופון: issued / expiry_48h / redeemed / expired / refunded  
- [ ] order_paid + plaintext  
- [ ] wallet_activity / abandoned_cart / supplier_sale / welcome לפי צורך השקה  
- [ ] אין Escrow בנוסח  
- [ ] unsubscribe רק בשיווקי  
- [ ] בדיקת RTL ב-Gmail / Apple Mail  
- [ ] דומיין From מאומת (SPF/DKIM) ב-Resend  
- [ ] webhook משלוח מחובר (לפחות delivered/bounced)  

מפת kind מלאה בסעיף 1; גופים בעברית בסעיף 1.1; COPY מורחב ב-`EMAIL-TEMPLATES-COPY.md`.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מפרט Resend: קטלוג kind, מעטפת RTL, משתנים, acceptance |
| 2026-08-11 | גופי מינימום ל-redeemed/expired + קישור lifecycle |
| 2026-08-11 | גוף מלא בעברית לכל 10 ה-kinds |
| 2026-08-11 | Acceptance: DKIM + מיפוי מפורש ל-COPY |
| 2026-08-11 | Webhooks Resend לסטטוסי משלוח |
