# ארכיטקטורת Admin Super App (phase6/admin)

תאריך: 2026-07-23. ענף: `phase6/admin` (נבנה מ-`phase5/homepage`).

מעמד המסמך: מסמך המימוש של פאנל האדמין בפאזה 6. הוא כפוף למסמך
ההכרעות `admin-arch/ARCHITECTURE-ADMIN-OPS-V2.md` (17 ביולי) ואינו
סותר אותו: כל מה שנבנה כאן הוא תת-קבוצה של V2 שמעוגנת במה שקיים
בפועל ב-DB החי. הכרעות המימוש מתועדות ב-`DECISIONS.md`.

---

## 0. עיגון במציאות (ה-DB החי)

נבדק ישירות מול הפרויקט `ixvwfbuvfxxsjiywhbbb` (2026-07-23):

- מיגרציות חיות: 002, 004, 019, 020, 021, 025 (קונסולידציה), 045,
  046, 047, 048. הסדרה 026-042 היא טיוטות קנוניות שטרם הוחלו.
- טבלאות חיות: profiles, products (+images, variants), categories,
  suppliers, vendors, coupon_deals, coupon_codes, orders,
  order_items, carts, payments, payment_webhook_events,
  payment_tokens, wallet_balances, wallet_transactions,
  wallet_accounts, wallet_entries, escrow_holds, split_executions,
  audit_log, user_addresses, rate_limits, user_rate_limits.
- לא קיים ב-DB החי: affiliates, referrals, analytics views (`v_*`),
  security_events, cardcom_settlements, payout_statements,
  supplier_members, agents, notifications.
- enum `user_role` חי: customer, content_uploader, vendor, admin,
  super_admin. תפקיד `support` נולד במיגרציה 049.
- `audit_log` (מיגרציה 011) הוא יומן הביקורת הקנוני;
  `admin_audit_log` הישנה מוזגה לתוכו ונמחקה ב-025.

כלל על (ADM-17): מסך שנשען על טבלה שלא קיימת ב-DB החי לא נבנה
חלקית. הוא לא מוצג בניווט, או מוצג מושבת עם tooltip.

---

## 1. מפת מודולים

| מודול | route | מצב | תשתית חיה |
|---|---|---|---|
| דשבורד (קוקפיט) | `/admin/dashboard` | שכתוב | orders, payments, coupon_codes, profiles, audit_log |
| קטלוג: מוצרים | `/admin/products` | קיים, נשאר | products, product_images, product_variants |
| קטלוג: קטגוריות | `/admin/categories` | קיים, נשאר | categories |
| קטלוג: דילים וקופונים | `/admin/coupons` | קיים + הרחבה | coupon_deals, coupon_codes |
| הזמנות | `/admin/orders` | שכתוב רשימה | orders, order_items (enum I7 חי) |
| משתמשים | `/admin/users` | הרחבה + משתמש 360 | profiles, orders, wallet_balances, coupon_codes |
| תשלומים והתאמות | `/admin/payments` | חדש | payments, payment_webhook_events, escrow_holds, split_executions |
| שותפים (affiliates) | `/admin/affiliates` | חדש | affiliates, referrals (נולדות ב-049) |
| אנליטיקה | `/admin/analytics` | חדש | אגרגציות RSC על orders/payments/coupon_codes |
| יומן ביקורת | `/admin/audit-log` | שכתוב (F3) | audit_log |
| ספקים | `/admin/suppliers` | קיים, נשאר | suppliers, vendors |
| אישורי תוכן | `/admin/approvals` | קיים (048) | products.approval_status |

---

## 2. מבנה routes ושכבות הגנה

```
src/app/(admin)/
  layout.tsx                  requireStaffSession + sidebar לפי תפקיד
  admin/
    dashboard/page.tsx
    products/  categories/  coupons/  suppliers/  approvals/
    orders/page.tsx           orders/[id]/page.tsx
    users/page.tsx            users/[id]/page.tsx      (משתמש 360)
    payments/page.tsx         (טאבים: תשלומים, webhooks, escrow, split)
    affiliates/page.tsx
    analytics/page.tsx
    audit-log/page.tsx
```

ארבע שכבות הרשאה, תמיד (עיקרון V2 מס' 3; UI שמסתיר כפתור אינו הגנה):

1. **Proxy** (`src/proxy.ts`, Next 16: מחליף את middleware): `/admin/*`
   דורש משתמש מחובר עם תפקיד staff (כולל support מ-049). בדיקה
   אופטימית בלבד.
2. **Layout guard**: `requireStaffSession()` ב-`(admin)/layout.tsx`.
3. **Per-page gate**: כל page קורא `requireSection('<section>')` לפי
   מטריצת ההרשאות (סעיף 3). server actions שומרים guard קשיח משלהם
   בתוך הפעולה (Next 16: כל server function נגיש כ-POST ישיר, אסור
   להסתמך על proxy).
4. **RLS**: מדיניות `is_admin()` / `has_role()` / `is_support()`
   ב-DB. פעולות כספיות נכתבות רק דרך service-role או SECURITY
   DEFINER.

כללי Next 16 מחייבים (מ-`node_modules/next/dist/docs/`):
`await` על cookies/params/searchParams תמיד; `revalidateTag` דורש
פרופיל שני או `updateTag` בתוך actions; `(admin)` כולו דינמי
(`export const dynamic = 'force-dynamic'` ב-layout).

---

## 3. RBAC

### 3.1 תפקידים

| תפקיד במפרט | מימוש בפועל | הערה |
|---|---|---|
| super_admin | `super_admin` קיים | כסף יוצא, הענקת admin+ |
| editor | `content_uploader` קיים | קטלוג בלבד; אין ערך enum חדש (DECISIONS D3) |
| support | `support` חדש (049) | קריאה תפעולית, בלי כסף, בלי audit/security |

מודל ההרשאות: עמודת `profiles.role` (enum) + פונקציות
`is_admin()/has_role()/is_support()` + מטריצה קשיחה בקוד
(`src/lib/admin/permissions.ts`, טהורה וניתנת לבדיקה). אין טבלאות
roles/permissions ב-DB, בהתאם להכרעת V2 (DECISIONS D5).

### 3.2 מטריצת גישה פר-סקשן (תת-קבוצה חיה של V2 סעיף 6.2)

| section | content_uploader | support | admin | super_admin |
|---|---|---|---|---|
| dashboard | - | R (בלי כסף) | R | R |
| catalog (products/categories/coupons/approvals) | R+W | - | R+W | R+W |
| orders | - | R | R+W | R+W |
| users | - | R | R+W (עד support) | R+W (הכול) |
| payments | - | - | R | R |
| affiliates | - | R | R+W | R+W |
| analytics | - | - | R | R |
| audit-log | - | - | R | R |
| suppliers | - | R | R+W | R+W |

### 3.3 פעולות רגישות

- `updateUserRole` לתפקיד admin+: רק super_admin (קיים, נשאר).
- הענקת content_uploader/support: admin ומעלה.
- שינוי סטטוס הזמנה ידני: רק `pending -> cancelled` עם סיבה (F2).
- אין מחיקה קשיחה בשום מסך; רק `deleted_at`.

---

## 4. ערכת UI לאדמין (RTL-first)

- `src/components/admin/ServerDataTable.tsx`: טבלה עם pagination
  צד-שרת, מיון וסינון דרך searchParams (מצב ב-URL, RSC טהור,
  אפס fetching בצד לקוח), בחירת שורות ופעולות bulk.
- `src/components/admin/TablePagination.tsx`: ניווט עמודים (offset
  לרשימות קטנות, cursor ל-audit-log).
- `src/components/admin/FilterBar.tsx`: פסי סינון מבוססי URL.
- `src/lib/admin/labels.ts`: קובץ תוויות עברי יחיד לכל ערכי ה-enum
  (ADM-16); ערך לא מוכר מוצג גולמי.
- `src/lib/admin/page-params.ts`: סכימות Zod לכל פרמטרי הרשימות
  (מורחב: page, per, sort, dir, q, פילטרים פר-מסך).
- קיימים ונשארים: `DataTable` (client, לרשימות קטנות), `StatsCard`,
  `StatusBadge`, `DeleteButton`, `ImageUploader`.
- כל הרכיבים: Tailwind v4 עם מאפיינים לוגיים בלבד (ps/pe/ms/me/
  start/end), עברית, `he-IL` למספרים, `₪` למחירים.

---

## 5. שכבת הנתונים והפעולות

- כל mutation: server action עם `'use server'`, סכימת Zod (הודעות
  בעברית), guard בתוך הפעולה, אפס אמון בקלט לקוח.
- מעטפת אחידה חדשה: `ActionResult<T> = { ok: true, data } |
  { ok: false, error }` (F6). קבצים קיימים מוסבים בהזדמנות;
  חדשים נולדים איתה.
- כל mutation כותבת שורת audit דרך `src/lib/admin/audit.ts`
  (insert ל-`audit_log` עם service client; actor, action, entity,
  changes). אין כתיבה בלי audit (עיקרון V2 מס' 2).
- קריאות רשימה: RSC ישיר מול Supabase עם `count: 'exact'` + range.

---

## 6. מיגרציות

| קובץ | תוכן | סטטוס |
|---|---|---|
| `048_product_approval_workflow.sql` | משוחזר מהענף הישן כפי שהוחל על ה-DB (verbatim) | חובה לפריטת parity |
| `049_admin_rbac_support.sql` | תפקיד support (enum + `is_support()` + מדיניות SELECT מפורשות), טבלאות affiliates + referrals (לפי צורות 010), `v_admin_pending_queues` מעל טבלאות חיות בלבד | חדש |

כללי כתיבה: idempotent מלא לפי skill `supabase-migrations`;
השוואות תפקיד ב-`is_support()` דרך `role::text` כדי לא להשתמש בערך
enum חדש באותה טרנזקציה; החלה רק דרך MCP `apply_migration`.

---

## 7. סדר בנייה

| שלב | תכולה | commit |
|---|---|---|
| M0 | מסמכים (קובץ זה + DECISIONS.md) | docs(admin) |
| M1 | מיגרציות 048 (שחזור) + 049 + טיפוסי DB | feat(db) |
| M2 | RBAC: roles/permissions/rbac/labels/audit + proxy + layout | feat(admin-rbac) |
| M3 | ערכת UI: ServerDataTable + pagination + filters | feat(admin-ui) |
| M4 | audit-log (שכתוב F3) | feat(admin-audit) |
| M5 | orders (שכתוב רשימה + F2) | feat(admin-orders) |
| M6 | users (+ משתמש 360) | feat(admin-users) |
| M7 | payments (טאבים + התאמות בסיס) | feat(admin-payments) |
| M8 | coupons/deals (הרחבת קודים) | feat(admin-coupons) |
| M9 | affiliates | feat(admin-affiliates) |
| M10 | analytics | feat(admin-analytics) |
| M11 | dashboard (קוקפיט) | feat(admin-dashboard) |
| M12 | STATE.md + סיכום | docs(state) |

אחרי כל שלב: `pnpm type-check && pnpm build` חייבים לעבור לפני
ה-commit. הודעות commit בפורמט conventional commits.
