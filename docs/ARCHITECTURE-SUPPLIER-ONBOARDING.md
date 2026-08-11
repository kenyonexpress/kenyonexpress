# ארכיטקטורה: הצטרפות ספק

בקשת ספק, אישור אדמין, צ'קליסט פתיחת חשבון/מסוף Cardcom (כשנדרש), **הסכם פיצול פר מוצר** (אין תעריף ברמת ספק), ומודל נתונים לחוזה.

Status: **BINDING** · עודכן: 2026-08-11 · QA: PASS (#1)  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/SUPPLIER-ONBOARDING.md
docs/LEGAL-TERMS-SUPPLIERS.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-B2B-SALES.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CARDCOM-ARCHITECTURE.md
docs/PAYOUT-ARCHITECTURE.md
docs/VENDOR-PAYOUT-SPEC.md
docs/CONTRADICTIONS.md
```

---

## 0. המלצה אחת (מחייבת)

**אין מכירה בלי בקשה מאושרת + שורת `suppliers` + `supplier_members(owner)`. אין `platform_percent` ברמת ספק. כל מוצר מקבל אחוז פיצול שנקבע בהסכמה פרטית עם המפעיל ונשמר על שורת המוצר (snapshot בהזמנה). No Escrow לקופון.**

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| O1 | אין מכירה בלי בקשה מאושרת + `suppliers` + `supplier_members(owner)`. |
| O2 | מסמכים מינימום: עוסק/ח.פ, טלפון, כתובת, לוגו (לפני publish). |
| O3 | פרטי בנק חובה לפני payout פיזי; לא חוסמים סריקת קופונים. |
| O4 | אישור/דחייה: admin בלבד; דחייה עם סיבה חובה. |
| O5 | סניפים = ישויות משנה תחת אותו ספק. |
| O6 | עובדים = `supplier_members` עם `owner` / `manager` / `scanner`. |
| O7 | UI הצטרפות בעברית RTL. |
| O8 | **No Escrow:** קופון = מקדמה באתר לפלטפורמה; יתרה בעסק; אין held/J5/נאמן. פיזי = פיצול לפי `platform_percent` **פר מוצר**. |
| O9 | **אין תעריף ספק:** אסור עמודה/שדה `suppliers.default_platform_percent` (או מקביל) כמקור אמת. |
| O10 | כל מוצר חדש: אחוז מוסכם פרטית עם המפעיל → נשמר ב-`products.platform_percent` + רשומת הסכם (§6). |
| O11 | סליקה ללקוח: מסוף פלטפורמה יחיד (MVP). חשבון/מסוף Cardcom לספק = אופציונלי/עתידי לפי צ'קליסט §5; payout לספק לפי `PAYOUT-ARCHITECTURE.md`. |

---

## 2. זרימת בקשה (application flow)

```text
מועמד נרשם / מתחבר
  → ממלא טופס /supplier/apply (עברית RTL)
  → מועלה מסמכים ל-Storage פרטי
  → שורה ב-supplier_applications: status=pending
  → מייל לאדמין: "בקשת ספק ממתינה"
  → אדמין ב-/admin/suppliers/applications:
       · approve → יוצר suppliers + owner membership + welcome
       · reject  → reason חובה + cooldown להגשה מחדש
  → אחרי approve: ספק נכנס ל-/supplier (סניפים, עובדים, מוצרים בהמתנה)
  → מוצרים לא עולים לחיים בלי platform_percent + הסכם פר מוצר + publish אדמין
```

| כלל | פירוט |
|---|---|
| בקשה פתוחה | `pending` אחת למשתמש בזמן נתון |
| כפילות ח.פ | אדמין בודק ידנית; אין approve אוטומטי |
| Cooldown אחרי reject | ≥ 7 ימים (מוצר; ניתן לדרוס באדמין) |
| Audit | כל approve/reject ב-`audit_log` |

---

## 3. מכונת מצבים (בקשה)

```text
draft (אופציונלי) → pending → approved
                          └→ rejected → (cooldown) → pending מחדש
```

אחרי `approved`: הסטטוס על `suppliers` (למשל `active` / `paused`) נפרד ממכונת הבקשה.

---

## 4. מסמכים ופרטי בנק

| שדה | לאישור | ל-payout פיזי |
|---|---|---|
| שם עסק בעברית | כן | |
| ח.פ / עוסק | כן | |
| טלפון + אימייל | כן | |
| כתובת, עיר, lat/lng | כן ל-publish | |
| לוגו | כן ל-publish | |
| חשבון בנק + אישור ניהול | | כן (`supplier_bank_accounts`) |
| קבצים סרוקים | Storage פרטי (admin/owner) | |

סריקת קופונים מותרת בלי בנק. payout פיזי חסום עד בנק מאומת (`PAYOUT-ARCHITECTURE.md`).

---

## 5. צ'קליסט Cardcom (חשבון / מסוף ספק)

**MVP מחייב:** סליקת לקוח במסוף הפלטפורמה בלבד. אין תלות ב-sub-account לספק כדי למכור או לסרוק.

כשמוחלט לפתוח חשבון/מסוף Cardcom לספק (Multi-Account / `NewCompany` וכו'; ראה `CARDCOM-ARCHITECTURE.md`), לפני סימון "מוכן":

| # | שער | ראיה |
|---|---|---|
| C1 | פרטי עסק תואמים למסמכי ההצטרפות | צילום פאנל Cardcom |
| C2 | חשבון/מסוף נוצר (או מקושר) תחת חשבון האם של הפלטפורמה | מזהה חשבון |
| C3 | מזהה נשמר ב-`suppliers.cardcom_account_id` (או עמודת חוזה מוסכמת) | שורת DB |
| C4 | הרשאות API: מה מותר לספק מול מה שנשאר בפלטפורמה | טבלת הרשאות |
| C5 | Webhook / IndicatorUrl: לא לערבב עם מסוף הפלטפורמה בלי הפרדת סודות | secrets נפרדים אם נדרש |
| C6 | Smoke: אין חיוב לקוח דרך מסוף הספק ב-MVP אלא אם ADR מפורש שינה | לוג |
| C7 | Payout לספק עדיין לפי TransferFromDigitalBank / CSV fallback, לא "כסף נעלם במסוף ספק" | `PAYOUT-ARCHITECTURE.md` |

אם Multi-Account לא מופעל: סמן C1–C7 כ-`N/A (single terminal)` ואל תחסום הצטרפות.

---

## 6. הסכם פר מוצר (אין תעריף ספק)

### 6.1 כלל זהב

| מותר | אסור |
|---|---|
| `products.platform_percent` ייחודי לכל מוצר | default גלובלי / "10% לכל הספקים" |
| משא ומתן פר דיל עם המפעיל | הסקת אחוז ממוצר קודם בלי אישור |
| snapshot ל-`order_items` ברגע הקנייה | שינוי אחוז רטרו על הזמנות ישנות |

קופון: הלקוח משלם `coupon_price` באתר (הכנסת פלטפורמה); יתרה בעסק.  
פיזי: הלקוח משלם מלא; פיצול לפי `platform_percent` של **אותו** מוצר.

### 6.2 זרימת הסכמה

```text
טיוטת מוצר (ספק או אדמין)
  → מפעיל קובע platform_percent (+ coupon_price אם קופון) בהסכמה עם הספק
  → נרשמת שורת product_split_agreements (או מקביל)
  → products.platform_percent = הערך המוסכם
  → publish רק אחרי אחוז מלא + תמונה + סטטוס
```

אין UI שמראה "תעריף ברירת מחדל של הספק".

### 6.3 מודל נתונים לחוזה / הסכם

תמצית יעד (שמות סופיים במיגרציה עתידית; עד אז audit + עמודות מוצר):

```sql
-- בקשת הצטרפות
CREATE TABLE public.supplier_applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  business_name_he text NOT NULL,
  company_id      text NOT NULL,          -- ח.פ / עוסק
  phone           text NOT NULL,
  email           text NOT NULL,
  address_json    jsonb NOT NULL,
  status          text NOT NULL CHECK (status IN ('pending','approved','rejected')),
  reject_reason   text,
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id) -- או partial unique על pending בלבד
);

-- ספק אחרי אישור (קיים / מורחב)
-- suppliers: id, name_he, company_id, cardcom_account_id NULL,
--            bank verified via supplier_bank_accounts, …

-- הסכם פיצול פר מוצר (אין rate ברמת ספק)
CREATE TABLE public.product_split_agreements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES public.products(id),
  supplier_id        uuid NOT NULL REFERENCES public.suppliers(id),
  platform_percent   numeric(5,2) NOT NULL CHECK (platform_percent > 0 AND platform_percent < 100),
  coupon_price_agorot integer,           -- NULL לפיזי
  agreed_with_admin  uuid NOT NULL REFERENCES auth.users(id),
  agreed_at          timestamptz NOT NULL DEFAULT now(),
  notes_he           text,
  superseded_at      timestamptz          -- NULL = פעיל
);

-- products.platform_percent = הערך הפעיל; הזמנה מצלמת snapshot
```

| טבלה | תפקיד |
|---|---|
| `supplier_applications` | זרימת אישור |
| `suppliers` + `supplier_members` | ישות חיה + RBAC |
| `supplier_branches` | סניפים |
| `supplier_bank_accounts` | payout פיזי |
| `product_split_agreements` | היסטוריית הסכמות אחוז פר מוצר |
| `products` | אחוז חי לפרסום |
| `order_items.*_snapshot` | אחוז שחל על העסקה |

חוזה משפטי כללי מול ספק: `LEGAL-TERMS-SUPPLIERS.md` (**[דורש עו״ד]** לפני חתימה). האחוז המסחרי חי במוצר, לא כסעיף יחיד בחוזה הגלובלי.

---

## 7. סניפים ועובדים

```text
supplier_branches (
  id, supplier_id, name_he, address, city, phone,
  lat, lng, hours_json, is_active
)
```

| תפקיד | הרשאות |
|---|---|
| `scanner` | סריקה + היסטוריית מימושים |
| `manager` | scanner + הזמנות פיזיות + סניפים |
| `owner` | manager + הזמנת עובדים + בנק + הגדרות |

`is_active=false` על membership חוסם redeem. Redeem לפי `supplier_id`; סניף ב-audit אם נבחר.

---

## 8. אחרי אישור (סדר תפעולי)

1. כניסה ל-`/supplier`  
2. סניפים + עובדים  
3. טיוטות מוצר → הסכמת אחוז עם המפעיל → `platform_percent`  
4. אדמין publish  
5. בנק מאומת → זכאות payout פיזי  
6. (אופציונלי) צ'קליסט Cardcom §5  

---

## 9. Acceptance

- [ ] Approve יוצר `suppliers` + owner  
- [ ] Reject דורש סיבה + audit  
- [ ] אין שדה תעריף ברמת ספק במודל / UI  
- [ ] כל מוצר חי עם `platform_percent` מוסכם + snapshot בהזמנה  
- [ ] בנק לפני payout בלבד  
- [ ] Cardcom sub-account: צ'קליסט או N/A מפורש  
- [ ] No Escrow בנוסח ובתשלומים  
- [ ] UI עברית RTL  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | חידוד הצטרפות: מסמכים, בנק, סניפים, עובדים |
| 2026-08-06 | QA: O8 No Escrow + `platform_percent`; קישורים B2B/PRICING |
| 2026-08-07 | QA re-pass: קישור CONTRADICTIONS |
| 2026-08-11 | application flow, Cardcom checklist, הסכם פר מוצר בלבד, מודל חוזה |
