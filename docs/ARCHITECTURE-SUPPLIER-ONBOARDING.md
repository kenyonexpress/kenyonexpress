# ארכיטקטורה: הצטרפות ספק

בקשת ספק, אישור אדמין, בנק/Cardcom checklist, והסכמי **`platform_percent` פר מוצר בלבד** (אין תעריף ברמת ספק).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #24/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/SUPPLIER-ONBOARDING.md
docs/LEGAL-TERMS-SUPPLIERS.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/PAYOUT-ARCHITECTURE.md
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. קופון = מקדמה לפלטפורמה + יתרה בעסק. פיזי = פיצול לפי אחוז **המוצר**. אין held/J5.

---

## 0. המלצה אחת

**אין מכירה בלי בקשה מאושרת + שורת `suppliers` + `supplier_members(owner)`. אין `platform_percent` ברמת ספק. כל מוצר מקבל אחוז מוסכם פרטית עם המפעיל ונשמר על המוצר (snapshot בהזמנה).**

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| O1 | אין מכירה בלי approve + `suppliers` + owner membership. |
| O2 | מינימום מסמכים: עוסק/ח.פ, טלפון, כתובת, לוגו (לפני publish). |
| O3 | בנק חובה לפני payout פיזי; לא חוסם סריקת קופונים. |
| O4 | אישור/דחייה: admin בלבד; דחייה עם סיבה חובה + audit. |
| O5 | סניפים = ישויות משנה תחת אותו ספק. |
| O6 | עובדים = `supplier_members`: `owner` / `manager` / `scanner`. |
| O7 | UI הצטרפות עברית RTL. |
| O8 | **No Escrow** לקופון ולנוסח חוזי. |
| O9 | אסור `suppliers.default_platform_percent` (או מקביל) כמקור אמת. |
| O10 | כל מוצר: הסכם פרטי → `products.platform_percent` + רשומת הסכם. |
| O11 | סליקת לקוח במסוף פלטפורמה (MVP). Cardcom לספק = אופציונלי לפי §5. |

---

## 2. זרימת בקשה

```text
מועמד נרשם / מתחבר
  → /supplier/apply (RTL)
  → מסמכים ל-Storage פרטי
  → supplier_applications.status = pending
  → מייל לאדמין
  → /admin/suppliers/applications:
       approve → suppliers + owner + welcome
       reject  → reason + cooldown להגשה מחדש
  → כניסה ל-/supplier (סניפים, צוות, טיוטות מוצר)
  → מוצרים לא עולים לחיים בלי platform_percent מוסכם + publish אדמין
```

| כלל | פירוט |
|---|---|
| בקשה פתוחה | לכל היותר `pending` אחת למשתמש |
| כפילות ח.פ | בדיקה ידנית; אין approve אוטומטי |
| Cooldown אחרי reject | ≥ 7 ימים (ניתן לדרוס באדמין) |
| Approve | אידמפוטנטי על `application_id` |

---

## 3. מכונת מצבים

```text
(draft אופציונלי) → pending → approved
                           └→ rejected → (cooldown) → pending מחדש
```

אחרי `approved`: סטטוס חי על `suppliers` (`active` / `suspended` / `closed`) נפרד ממכונת הבקשה.

---

## 4. מסמכים ובנק

| שדה | לאישור | ל-payout פיזי |
|---|---|---|
| שם עסק בעברית | כן | |
| ח.פ / עוסק | כן | |
| טלפון + אימייל | כן | |
| כתובת / עיר / lat/lng | כן ל-publish | |
| לוגו | כן ל-publish | |
| חשבון בנק + אישור ניהול | | כן (`supplier_bank_accounts`) |

סריקה מותרת בלי בנק. payout פיזי חסום עד אימות בנק (PAYOUT-ARCHITECTURE).

---

## 5. צ'קליסט Cardcom (אופציונלי)

**MVP:** סליקת לקוח במסוף הפלטפורמה בלבד.

כשפותחים חשבון/מסוף לספק:

| # | שער |
|---|---|
| C1 | פרטי עסק תואמים למסמכי הצטרפות |
| C2 | חשבון נוצר/מקושר תחת חשבון האם |
| C3 | מזהה ב-`suppliers.cardcom_account_id` (או עמודה מוסכמת) |
| C4 | הרשאות API מוגדרות |
| C5 | Webhook secrets מופרדים ממסוף הפלטפורמה אם נדרש |
| C6 | אין חיוב לקוח דרך מסוף הספק ב-MVP בלי ADR |
| C7 | Payout לספק לפי Transfer/CSV, לא "כסף נעלם במסוף" |

אם Multi-Account לא מופעל: סמן C1-C7 כ-`N/A (single terminal)`.

---

## 6. הסכם פר מוצר בלבד

### 6.1 כלל זהב

| מותר | אסור |
|---|---|
| `products.platform_percent` ייחודי לכל מוצר | default גלובלי / "X% לכל הספקים" |
| משא ומתן פר דיל עם המפעיל | הסקת אחוז ממוצר קודם בלי אישור |
| snapshot ל-`order_items` ברכישה | שינוי אחוז רטרו על הזמנות ישנות |

קופון: `coupon_price` באתר (הכנסת פלטפורמה); יתרה בעסק.  
פיזי: חיוב מלא; פיצול לפי `platform_percent` של **אותו** מוצר.

### 6.2 זרימת הסכמה

```text
טיוטת מוצר (ספק או אדמין)
  → מפעיל קובע platform_percent (+ coupon_price אם קופון) בהסכמה
  → product_split_agreements (או מקביל) + products.platform_percent
  → publish רק אחרי אחוז מלא + שערים אחרים
```

אין UI "תעריף ברירת מחדל של הספק".

### 6.3 מודל נתונים (יעד)

```sql
-- הסכם פיצול פר מוצר (אין rate ברמת ספק)
CREATE TABLE public.product_split_agreements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES public.products(id),
  supplier_id        uuid NOT NULL REFERENCES public.suppliers(id),
  platform_percent   numeric(5,2) NOT NULL
    CHECK (platform_percent > 0 AND platform_percent < 100),
  coupon_price_agorot integer,  -- NULL לפיזי
  agreed_with_admin  uuid NOT NULL REFERENCES auth.users(id),
  agreed_at          timestamptz NOT NULL DEFAULT now(),
  notes_he           text,
  superseded_at      timestamptz  -- NULL = פעיל
);
```

| טבלה | תפקיד |
|---|---|
| `supplier_applications` | זרימת אישור |
| `suppliers` + `supplier_members` | ישות חיה + RBAC |
| `supplier_branches` | סניפים |
| `supplier_bank_accounts` | payout פיזי |
| `product_split_agreements` | היסטוריית הסכמות אחוז |
| `products` | אחוז חי לפרסום |
| snapshot ב-`order_items` | אחוז שחל על העסקה |

חוזה משפטי כללי: `LEGAL-TERMS-SUPPLIERS.md` (**[דורש עו״ד]**). האחוז המסחרי חי במוצר.

---

## 7. סניפים ועובדים

| תפקיד | הרשאות |
|---|---|
| `scanner` | סריקה + היסטוריה |
| `manager` | scanner + הזמנות פיזיות + סניפים |
| `owner` | manager + הזמנת עובדים + בנק + הגדרות |

`is_active=false` חוסם redeem. Redeem לפי `supplier_id`; סניף ב-audit אם נבחר.

---

## 8. אחרי אישור (סדר תפעולי)

1. כניסה ל-`/supplier`  
2. סניפים + עובדים  
3. טיוטות מוצר → הסכמת אחוז → `platform_percent`  
4. אדמין publish  
5. בנק מאומת → זכאות payout פיזי  
6. (אופציונלי) צ'קליסט Cardcom §5  

---

## 9. Acceptance

- [ ] Approve יוצר `suppliers` + owner  
- [ ] Reject דורש סיבה + audit  
- [ ] אין שדה תעריף ברמת ספק במודל / UI  
- [ ] כל מוצר חי עם `platform_percent` מוסכם + snapshot  
- [ ] בנק לפני payout בלבד  
- [ ] Cardcom sub-account: צ'קליסט או N/A מפורש  
- [ ] No Escrow בנוסח  
- [ ] UI עברית RTL  

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | הצטרפות: מסמכים, בנק, סניפים, עובדים |
| 2026-08-11 | application flow + הסכם פר מוצר + Cardcom checklist |
| 2026-08-12 | batch #24: ריענון BINDING; הסכמים רק per-product `platform_percent` |
