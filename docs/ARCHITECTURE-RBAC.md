# ARCHITECTURE: RBAC

מטריצת תפקידים והרשאות: guest, customer, supplier, supplier-staff, admin, super-admin. מיפוי RLS לפי טבלה.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-SECURITY-COMPLIANCE.md
docs/ARCHITECTURE-ADMIN-REPORTS.md
docs/ONBOARDING-DEVELOPER.md
```

עקרון: **RLS הוא הגבול.** הדפדפן מחזיק anon key בלבד. `service_role` רק בשרת.

---

## 0. תפקידים

| Role | איך נקבע | תיאור |
|---|---|---|
| `guest` | אין session | גלישה, עגלה מקומית/אורח, checkout לפי מדיניות |
| `customer` | `auth.users` + `profiles` רגיל | חשבון, הזמנות, קופונים, ארנק |
| `supplier` | `supplier_members` role `owner` | ניהול עסק, מוצרים, דוחות, סריקה |
| `supplier-staff` | `supplier_members` role `manager` או `scanner` | manager: מוצרים/סריקה; scanner: סריקה בלבד |
| `admin` | `profiles.role` / `is_admin()` | תפעול פלטפורמה, אישורי מוצרים, refunds |
| `super-admin` | תת-קבוצה של admin (flag / allowlist) | secrets רגישים, רוטציות, שינוי RBAC, DR |

הערות:

- משתמש יכול להיות customer וגם supplier-member במקביל (super-app).
- `scanner` ⊂ supplier-staff בלי גישת כסף.

---

## 1. Permission matrix (per resource)

| Resource | guest | customer | supplier (owner) | staff manager | staff scanner | admin | super-admin |
|---|---|---|---|---|---|---|---|
| Catalog read | R | R | R | R | R | R | R |
| Product write (own) | — | — | CUD draft | CUD draft | — | approve/publish any | same |
| Cart | own | own | own | own | own | — | — |
| Checkout / pay | limited | Y | Y | Y | Y | impersonation אסור | אסור |
| Own orders | — | R | R | R | R | R all | R all |
| Own vouchers / QR | — | R | — | — | — | R all | R all |
| Redeem voucher | — | — | Y | Y | Y | emergency only | emergency only |
| Wallet | — | R + redeem at checkout | — | — | — | adjust+audit | adjust+audit |
| Supplier portal | — | — | Y | limited | scan only | Y | Y |
| Settlements view | — | — | own | — | — | all | all |
| Refund approve | — | request | evidence | — | — | Y | Y |
| Admin reports CSV | — | — | — | — | — | Y | Y |
| Env / secrets | — | — | — | — | — | — | Y (ops) |
| RBAC grant admin | — | — | — | — | — | — | Y |
| Support tickets | create | own | supplier thread | — | — | all | all |

Y = מותר · R = קריאה · CUD = יצירה/עדכון/מחיקה · — = אין

---

## 2. Route gates (Next)

| Path prefix | מינימום |
|---|---|
| `/` catalog | guest |
| `/cart`, `/checkout` | guest (form); pay לפי מדיניות |
| `/account/**` | customer |
| `/coupon/[id]` | customer owner |
| `/scan`, `/supplier/**` | supplier-member active |
| `/admin/**` | admin |
| `/api/cron/**` | Bearer `CRON_SECRET` |
| Cardcom webhook | password/signature |

---

## 3. RLS mapping (per table)

שמות פונקציות לוגיים; ליישר למיגרציות בפועל.

| Table | guest/anon | customer (auth) | supplier-member | admin |
|---|---|---|---|---|
| `products` (published) | SELECT | SELECT | SELECT; UPDATE own drafts | ALL |
| `categories` | SELECT | SELECT | SELECT | ALL |
| `suppliers` public fields | SELECT limited | SELECT limited | SELECT/UPDATE own | ALL |
| `supplier_members` | — | — | SELECT own supplier; owner manages | ALL |
| `orders` | — | SELECT own | SELECT lines for own supplier | SELECT all |
| `order_items` | — | via order | SELECT where supplier_id = mine | ALL |
| `payments` | — | SELECT own order | — | SELECT |
| `vouchers` | — | SELECT own | SELECT for redeem path / own supplier | SELECT |
| `wallet_accounts` / `wallet_ledger` | — | SELECT own | — | ALL + adjust |
| `notification_outbox` | — | — | — | SELECT |
| `support_tickets` | — | own | escalated | ALL |
| `analytics_events` | INSERT limited | INSERT | — | SELECT |
| `refunds` | — | SELECT own | — | ALL |

עקרונות RLS:

1. אין policy שמחזירה service_role ל-client.
2. Redeem: RPC `SECURITY DEFINER` עם בדיקות role + `FOR UPDATE`, לא UPDATE חופשי מ-client על `vouchers`.
3. Admin: `is_admin()`; super-admin: `is_super_admin()` לפעולות הרסניות.
4. כל שלילת גישה = אין שורה, לא דליפת קיום כשצריך (למשל voucher של אחר).

---

## 4. Helper functions (יעד)

```text
is_admin()
is_super_admin()
is_supplier_member(supplier_id)
is_supplier_role(supplier_id, roles[])
current_user_id()
```

שימוש ב-policies בלבד; לא לסמוך על טענות JWT מזויפות מעבר ל-Supabase Auth.

---

## 5. Elevation and audit

| פעולה | דורש |
|---|---|
| Grant admin | super-admin + audit |
| Refund מעל סף | admin + recent auth |
| Manual wallet adjust | admin + reason + audit |
| Export CSV reports | admin + audit |
| PITR restore | super-admin / ops |

---

## 6. Acceptance

- [ ] מטריצת תפקידים מכוסה ב-routes
- [ ] scanner בלי עריכת `platform_percent`
- [ ] RLS על P0 tables
- [ ] אין service_role בדפדפן
- [ ] audit על elevation וכסף ידני

---

## 7. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
