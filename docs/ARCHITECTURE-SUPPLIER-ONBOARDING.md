# ARCHITECTURE: Supplier Onboarding

הצטרפות ספק: בקשה, מסמכים, אישור אדמין, כניסה לפורטל.

Status: **BINDING** · Updated: 2026-08-03 (pack-20)
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| O1 | ספק לא מוכר בלי `supplier_applications` מאושרת + שורת `suppliers` + `supplier_members(owner)`. |
| O2 | מסמכים מינימום: עוסק/ח.פ או עוסק מורשה, אישור ניהול חשבון (לבנק ל-payout פיזי), טלפון, כתובת, לוגו. |
| O3 | אישור/דחייה: admin בלבד; דחייה עם סיבה חובה. |
| O4 | אחרי אישור: `profiles.role` יכול להיות `vendor` לניתוב; הרשאות אמיתיות מ-membership. |
| O5 | Suspend חוסם redeem ו-publish. |
| O6 | UI הצטרפות בעברית RTL; אין תשלום הצטרפות ב-MVP. |

---

## 1. State machine

```text
submit → pending → approved → suppliers.active + owner membership
                 ↘ rejected (reason) → optional re-apply after cooldown
```

Partial unique: בקשה `pending` אחת למשתמש.

---

## 2. מסמכים ושדות

| שדה | חובה לאישור |
|---|---|
| `business_name_he` | כן |
| `business_id` (ח.פ/עוסק) | כן |
| `phone`, `email` | כן |
| `address`, `city`, `lat/lng` | כן ל-publish מוצרים |
| `logo_url` | כן ל-publish |
| `bank_*` | כן לפני payout פיזי (לא חוסם סריקת קופונים) |
| קבצים (אישורים) | Storage פרטי; גישה admin/owner |

---

## 3. זרימת אדמין

1. `/admin/suppliers` תור pending  
2. בדיקת מסמכים + פרטי קשר  
3. Approve → RPC/action יוצר supplier + owner  
4. מייל `supplier` welcome (Resend)  
5. הספק נכנס ל-`/supplier`

---

## 4. Acceptance

- [ ] אין redeem בלי membership פעיל
- [ ] Reject עם סיבה
- [ ] Bank verify לפני payout
- [ ] RTL onboarding

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-08-03 | pack-20: supplier onboarding |
