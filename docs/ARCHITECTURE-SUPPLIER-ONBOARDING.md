# ארכיטקטורה: הצטרפות ספק

בקשת ספק, אישור אדמין, בנק/Cardcom checklist, והסכמי **`platform_percent` פר מוצר בלבד** (אין תעריף ברמת ספק).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. קופון = מקדמה לפלטפורמה + יתרה בעסק. פיזי = פיצול לפי אחוז **המוצר**. אין held/J5.

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

---

## 0. החלטה (מחייבת)

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
| O11 | סליקת לקוח במסוף פלטפורמה (MVP). Cardcom לספק = אופציונלי. |
| O12 | אין העתקת אחוז ממוצר אחר בלי אישור מפעיל מפורש. |

**אין מכירה בלי בקשה מאושרת + שורת `suppliers` + `supplier_members(owner)`.**

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| `default_platform_percent` ברמת ספק | מסתיר משא ומתן פר מוצר; null חייב לחסום publish. |
| bulk-apply אחוז לכל מוצרי הספק | אין אישור פר שורה; נדחה. |
| Escrow / held בחוזה ספק | סותר No Escrow; נוסח חוזי נדחה. |
| approve אוטומטי על ח.פ תקין | fraud; אדמין חובה. |
| בנק חובה לפני סריקה | חוסם redeem; בנק רק ל-payout פיזי. |
| סליקה ישירה במסוף ספק ב-MVP | מורכבות; מסוף פלטפורמה בלבד. |

---

## 2. סכמת DB (קיים / יעד)

| טבלה | תפקיד |
|---|---|
| `supplier_applications` | זרימת אישור; `status`, `reject_reason`, cooldown |
| `suppliers` | ישות חיה; `status`, `payout_hold_business_days`, `cardcom_account_id?` |
| `supplier_members` | RBAC: `member_role`, `is_active`, `pin_hash?` |
| `supplier_branches` | סניפים |
| `supplier_bank_accounts` | payout פיזי; אימות אדמין |
| `product_split_agreements` | היסטוריית הסכמות אחוז פר מוצר |
| `products` | `platform_percent` חי; אין default |
| `order_items` | snapshot אחוז ברכישה |

```sql
-- כיוון; יישור למיגרציות
CREATE TABLE public.product_split_agreements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES public.products(id),
  supplier_id        uuid NOT NULL REFERENCES public.suppliers(id),
  platform_percent   numeric(5,2) NOT NULL
    CHECK (platform_percent > 0 AND platform_percent < 100),
  coupon_price_agorot integer,
  agreed_with_admin  uuid NOT NULL REFERENCES auth.users(id),
  agreed_at          timestamptz NOT NULL DEFAULT now(),
  notes_he           text,
  superseded_at      timestamptz
);
```

אין DDL חדש במסמך זה (טבלת agreements = יעד).

---

## 3. זרימת בקשה (onboarding)

```text
מועמד נרשם / מתחבר
  → /supplier/apply (RTL)
  → מסמכים ל-Storage פרטי
  → supplier_applications.status = pending
  → מייל לאדמין
  → /admin/suppliers/applications:
       approve → suppliers + owner + welcome
       reject  → reason + cooldown
  → כניסה ל-/supplier
  → לכל מוצר: הסכמת platform_percent + publish אדמין
```

| כלל | פירוט |
|---|---|
| בקשה פתוחה | לכל היותר `pending` אחת למשתמש |
| כפילות ח.פ | בדיקה ידנית |
| Cooldown אחרי reject | ≥ 7 ימים |
| Approve | אידמפוטנטי על `application_id` |

---

## 4. מכונת מצבים

```text
(draft) → pending → approved
                 └→ rejected → (cooldown) → pending מחדש
```

אחרי `approved`: `suppliers.status` = `active` / `suspended` / `closed` נפרד.

`suspended` / `closed`: חוסם redeem ו-publish חדש; לא מוחק היסטוריה.

---

## 5. מסמכים ובנק

| שדה | לאישור | ל-payout פיזי |
|---|---|---|
| שם עסק בעברית | כן | |
| ח.פ / עוסק | כן | |
| טלפון + אימייל | כן | |
| כתובת / עיר | כן ל-publish | |
| לוגו | כן ל-publish | |
| חשבון בנק + אישור | | כן |

סריקה מותרת בלי בנק. payout פיזי חסום עד אימות בנק.

---

## 6. צ'קליסט Cardcom (אופציונלי)

**MVP:** סליקת לקוח במסוף הפלטפורמה בלבד.

| # | שער |
|---|---|
| C1 | פרטי עסק תואמים למסמכי הצטרפות |
| C2 | חשבון נוצר/מקושר |
| C3 | `suppliers.cardcom_account_id` |
| C4 | הרשאות API |
| C5 | Webhook secrets מופרדים |
| C6 | אין חיוב לקוח דרך מסוף הספק ב-MVP |
| C7 | Payout לפי Transfer/CSV, לא Escrow |

---

## 7. מקרי קצה

| מקרה | התנהגות |
|---|---|
| duplicate pending application | reject שנייה |
| approve פעמיים (race) | idempotent על application_id |
| reject בלי reason | חסימת API |
| ספק suspended עם מוצרים live | redeem חסום; הזמנות קיימות נשמרות |
| owner עוזב לפני handoff | admin ממנה owner חדש |
| ח.פ כפול (שני מועמדים) | בדיקה ידנית; לא approve כפול |
| publish בלי platform_percent | חסימה |
| בנק לא מאומת + פיזי paid | payout skipped; redeem OK |
| cooldown override | admin בלבד + audit |

---

## 8. Acceptance

- [ ] Approve יוצר `suppliers` + owner
- [ ] Reject דורש סיבה + audit
- [ ] אין שדה תעריף ברמת ספק
- [ ] כל מוצר עם `platform_percent` + snapshot
- [ ] No Escrow בנוסח
- [ ] UI עברית RTL

---

## 9. פתוחות

| ID | שאלה | ברירת מחדל |
|---|---|---|
| Q-ON-LEGAL | `[דורש עו״ד]` לטקסט חוזה ספק | LEGAL-TERMS-SUPPLIERS |
| Q-ON-CARD | Multi-Account מתי? | N/A ב-MVP |

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | הצטרפות: מסמכים, בנק, סניפים |
| 2026-08-11 | application flow + per-product % |
| 2026-08-12 | batch-2: BINDING template; חמשת סעיפי חובה |
