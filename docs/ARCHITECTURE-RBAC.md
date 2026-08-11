# ארכיטקטורה: RBAC (תפקידים והרשאות)

מטריצת תפקידים: guest, customer, supplier, supplier-staff, admin, super-admin. מיפוי RLS לפי טבלה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow** (כשרלוונטי)

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-RLS-MATRIX.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-SECURITY-COMPLIANCE.md
docs/ONBOARDING-DEVELOPER.md
```

עקרון: **RLS הוא הגבול.** הדפדפן מחזיק anon key בלבד. `service_role` רק בשרת.

---

## 0. החלטה (D1 עד D10)

| # | הכרעה |
|---|---|
| D1 | שישה principals לוגיים: guest, customer, supplier-owner, supplier-staff (manager/scanner), admin, super-admin. |
| D2 | תפקיד נגזר מ-DB (`profiles`, `supplier_members`), לא מטענות JWT מותאמות. |
| D3 | Route gates ב-Next הם שכבה ראשונה; RLS הוא שכבת האמת. |
| D4 | Redeem רק דרך RPC `SECURITY DEFINER` עם membership + `FOR UPDATE`. |
| D5 | Admin elevation (grant admin, wallet adjust, export CSV) דורש audit. |
| D6 | Scanner ⊂ supplier-staff: סריקה בלבד, בלי עריכת כסף או `platform_percent`. |
| D7 | משתמש יכול להיות customer וגם supplier-member (super-app). |
| D8 | Impersonation אסור: admin לא משלם בשם לקוח. |
| D9 | Env/secrets ו-RBAC grant: super-admin בלבד. |
| D10 | כל שלילת גישה רגישה: אין שורה / `not_found`, לא דליפת קיום voucher. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| RBAC רק ב-middleware בלי RLS | middleware נעקף; RLS חובה על Postgres |
| תפקידים ב-JWT custom claims | claims לא מתעדכנים מייד; מקור אמת = DB |
| supplier כותב ישירות ל-`vouchers` | race על redeem; RPC אטומי בלבד |
| admin עם service_role בדפדפן | דליפת מפתח = עקיפת כל המטריצה |
| role hierarchy בקוד בלבד | policies חייבות helpers (`is_admin()`, `is_supplier_member`) |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.** טבלאות ועמודות שמגדירות תפקיד:

| טבלה / עמודה | שימוש RBAC |
|---|---|
| `profiles.role` | `customer` / `admin` / `super_admin` |
| `profiles.is_admin()` helper | policy admin |
| `supplier_members` (`user_id`, `supplier_id`, `role`) | owner / manager / scanner |
| `supplier_members.status` | active חובה לסריקה |
| `orders.user_id` | בעלות customer |
| `order_items.supplier_id` | visibility לספק |
| `vouchers.user_id`, `vouchers.supplier_id` | owner vs redeem path |
| `audit_log` | append-only לפעולות elevation |

Enums יעד (לפי מיגרציות): `supplier_member_role`, `profile_role`.  
פירוט policies: `docs/ARCHITECTURE-RLS-MATRIX.md`.

---

## 3. מטריצת הרשאות (תמצית)

| Resource | guest | customer | supplier owner | staff manager | scanner | admin | super-admin |
|---|---|---|---|---|---|---|---|
| Catalog read | R | R | R | R | R | R | R |
| Product write (own) | - | - | CUD draft | CUD draft | - | approve | same |
| Checkout / pay | limited | Y | Y | Y | Y | impersonation אסור | אסור |
| Own orders | - | R | R | R | R | R all | R all |
| Redeem voucher | - | - | Y | Y | Y | emergency | emergency |
| Wallet | - | R + checkout | - | - | - | adjust+audit | adjust+audit |
| Settlements | - | - | own | - | - | all | all |
| Env / secrets | - | - | - | - | - | - | Y (ops) |
| Grant admin | - | - | - | - | - | - | Y |

Y = מותר · R = קריאה · CUD = create/update/delete · `-` = אין

### Route gates (Next)

| Path | מינימום |
|---|---|
| `/`, `/product/*` | guest |
| `/cart`, `/checkout` | guest (form); pay לפי מדיניות |
| `/account/**` | customer |
| `/scan`, `/supplier/**` | supplier-member active |
| `/admin/**` | admin |
| `/api/cron/**` | Bearer `CRON_SECRET` |

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| RB-E1 | customer + supplier על אותו `auth.uid()` | שתי הזירות פעילות; policies מבודדות לפי context |
| RB-E2 | membership deactivated באמצע סשן | redeem נכשל `unauthorized`; לא cache ישן |
| RB-E3 | scanner מנסה UPDATE על `platform_percent` | RLS חוסם; audit אם ניסיון דרך API |
| RB-E4 | admin מבקש refund מעל סף | דורש recent auth + audit row |
| RB-E5 | anon מנסה SELECT על voucher של אחר | אין שורה (לא 403 עם id) |
| RB-E6 | super-admin grant admin לעצמו | audit + allowlist; לא ב-production בלי שני אנשים |
| RB-E7 | service_role leaked to client | אין policy שמחזירה; בדיקת bundle חוסמת |

---

## 5. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | `is_super_admin()` vs flag ב-`profiles`: ליישר למיגרציה | 2026-08-12 |
| O2 | emergency redeem admin: SLA ונימוק חובה ב-UI | 2026-08-12 |
| O3 | content_uploader role: מטריצה מלאה ב-RLS-MATRIX | 2026-08-12 |

---

## 6. Acceptance

- [ ] מטריצת תפקידים מכוסה ב-routes וב-RLS
- [ ] scanner בלי עריכת `platform_percent`
- [ ] אין service_role בדפדפן
- [ ] audit על elevation וכסף ידני

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מסמך ראשוני |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING (חלופות, DB, מקרי קצה, פתוחות) |
