# ARCHITECTURE: Admin Dashboard

ארכיטקטורת לוח הבקרה של הפלטפורמה: ניהול מוצרים (כולל `platform_percent` דינמי פר מוצר), ספקים, ודוחות כסף.

Status: **BINDING** · Updated: 2026-08-03 (rev C)  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ADMIN-ARCHITECTURE.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/BUSINESS-MODEL.md
docs/RUNBOOK-PRODUCTION.md
```

Stack: Next.js App Router `src/app/(admin)`, Supabase Postgres + RLS, Cardcom, Server Actions + cron Route Handlers.  
כסף: **integer agorot** פנימית; UI ב-₪ עם 2 עשרונים. אין ערבוב יחידות באותה עמודה.

עקרון: KenyonExpress היא פלטפורמה, לא ספק. אין שורת `suppliers` לפלטפורמה במסלול redeem/payout.

---

## 0. מודל כסף שהאדמין חייב לאכוף (No Escrow)

| כלל | פירוט |
|---|---|
| אין עמלה קבועה | אין 5%/10% כברירת מחדל בקוד או ב-DB |
| `platform_percent` | **דינמי פר מוצר**, כתיבה לאדמין בלבד, בלי default. מצולם ל-`order_items` ברכישה |
| `supplier_split_percent` | הזוג השני; `platform_percent + supplier_split_percent = 100` (CHECK מ-070) |
| `coupon_price_ils` | סכום מוחלט שהלקוח משלם באתר לקופון; נגזרת הנחה לתצוגה בלבד |
| קופון (אין Escrow) | כל תשלום הקופון באתר נשאר בפלטפורמה; לספק 0 מהפלטפורמה; יתרת face נגבית בבית העסק בסריקה |
| פיזי | תשלום מלא באתר; פיצול מיידי לפי אותו זוג מצולם (`platform_percent` לפלטפורמה, יתרה לספק ב-payout) |
| Publish | חסום בלי ספק + לוגו/כתובת/טלפון לפי שערי המוצר |

מסמך ישן שאומר "held עד מימוש ואז שחרור לספק" על מקדמת קופון: **נדחה**.  
`escrow_held_agorot` בשורות היסטוריות / עמודות ישנות: תמיד 0 במודל הזה (או לא בשימוש בדוחות חדשים).

---

## 1. ניהול מוצרים (חובה: `platform_percent` פר מוצר)

### 1.1 משטחים

| Route | תפקיד |
|---|---|
| `/admin/products` | רשימה, פילטרים, bulk pause/archive; עמודה/badge ל-`platform_percent` |
| `/admin/products/new` | יצירה |
| `/admin/products/[id]/edit` | עורך מלא כולל שלושת כפתורי הכסף |
| `/admin/categories` | טקסונומיה |

Actions:

```
src/server/actions/admin/products.ts
src/components/admin/ProductForm.tsx
src/lib/commerce/product-money.ts
```

### 1.2 שדות כסף (admin only)

| UI | עמודה | כללים |
|---|---|---|
| מחיר מחירון | `price_ils` | > 0 |
| מחיר קופון באתר | `coupon_price_ils` | > 0 ו-≤ מחירון לקופון |
| הנחה (תצוגה) | `discount_percent` | נגזרת או מוזנת; לא מקור אמת לחיוב |
| עמלת פלטפורמה | `platform_percent` | 0..100, חובה לפני publish, **בלי default**, **פר מוצר** |
| חלק ספק | `supplier_split_percent` | משלים ל-100 עם הפלטפורמה |
| ספק | `supplier_id` | FK `suppliers`, חובה ל-publish |

חישוב UI מחייב (תצוגה בלבד, לא מקור חיוב):

```text
coupon:
  paid_on_site = coupon_price_ils
  balance_at_business = price_ils - coupon_price_ils
  platform_keeps_online = 100% of paid_on_site
  supplier_from_platform = 0

physical:
  platform_fee = round_once(paid_on_site * platform_percent / 100)
  supplier_due = paid_on_site - platform_fee
```

כל שינוי לכפתורי כסף אחרי publish:

1. Server Action מוודא `admin` / `super_admin`
2. Strip ל-`content_uploader`
3. כתיבה ל-`audit_log` עם before/after
4. אין עדכון רטרואקטיבי ל-`order_items` שכבר שולמו

### 1.3 UI חובה בעורך מוצר

- שני שדות מקושרים: שינוי `platform_percent` מעדכן את תצוגת `supplier_split_percent` (ולהפך) כך שסכום = 100
- אזהרה מפורשת לקופון: "תשלום הקופון באתר נשאר בפלטפורמה; הספק מקבל את היתרה מהלקוח בבית העסק"
- Preview: שולם באתר / יתרה בעסק / (לפיזי) עמלה וחלק ספק
- ברשימת מוצרים: הצגת `platform_percent` הנוכחי פר שורה (read from product; לא מחישוב גלובלי)

### 1.4 הרשאות אחרי אישור

| קבוצת שדות | content_uploader | admin |
|---|---|---|
| תוכן, גלריה, SEO | כן (טיוטה) | כן |
| מלאי / וריאנטים | כן | כן |
| `platform_percent`, split, `coupon_price_ils`, מחירון | **לא** | **כן** |
| `supplier_id` אחרי create | לא | כן + audit |
| publish / pause / archive | submit בלבד | כן |

### 1.5 שערי publish (`assertPublishable`)

- סוג מוצר תקין
- ספק משויך ומלא פרטי תצוגה
- לקופון: `coupon_price_ils` + זוג אחוזים תקין (גם אם לספק 0 מקופון, הזוג נשמר לביקורת/עקביות)
- לפיזי: מחיר + זוג אחוזים + מלאי בסיסי
- תמונה ראשית

### 1.6 ייבוא / WP

CSV או מיגרציית WP יוצרים טיוטות עם כסף **null** עד שאדמין ממלא `platform_percent` ו-`coupon_price_ils`. אסור להמציא 10% בייבוא.

---

## 2. ניהול ספקים (אישור, חברים, בנק, payout פיזי)

### 2.1 מדריך וישויות

| UI | נתונים |
|---|---|
| `/admin/suppliers` | `suppliers` (לא `vendors` כמקור אמת) |
| תור אישור | `supplier_applications` status `pending` |
| חברי ספק | `supplier_members` (owner/manager/scanner) |
| חשבון בנק | `supplier_bank_accounts` + verified_by/at |

### 2.2 פעולות מחייבות

| פעולה | תוצאה |
|---|---|
| Approve | יוצר `suppliers` + owner membership; מעדכן role לפי RBAC |
| Reject | סיבה חובה |
| Suspend | `suppliers.status=suspended`; כיבוי memberships; unpublish מוצרים |
| Verify bank | חובה לפני payout משמעותי (פיזי) |
| Impersonation / portal link | אופציונלי; audit תמיד |

ספק לא `active` בלי אישור אדמין. Redeem רק ל-`supplier_members` פעילים.

### 2.3 מוצרים מול ספק

במסך ספק: רשימת מוצרים, סטטוס publish, וצילום אחוזי הפיצול הנוכחיים (לקריאה). שינוי אחוזים רק דרך עורך המוצר.

### 2.4 Payouts (תמצית)

| Route | `/admin/payouts` |
|---|---|
| טבלאות | `payout_statements`, `payout_statement_lines` |
| סטטוסים | `draft → pending_approval → approved → paid` (+ cancelled) |
| Mark paid | `super_admin` + recent auth בלבד |
| קופון | **אין** שורת payout מקופון; הכנסת הספק היא בקופה בבית העסק |
| פיזי | residual אחרי `platform_percent` המצולם; T+3 + מינימום לפי מדיניות |

פרטים: `ARCHITECTURE-SUPPLIER-PORTAL.md`.

---

## 3. הזמנות ותשלומים (תפעול)

| Route | מקור |
|---|---|
| `/admin/orders` | `orders`, `order_items`, `payments`, `vouchers` |
| `/admin/payments` | תור stuck / reconcile Cardcom |

פילטרים: סטטוס, תאריך, ספק, סוג מוצר, תשלום תקוע, q (id/email).

Ledger לשורה (agorot, UI ÷100), **רק snapshots מ-`order_items`**:

- `face_value_agorot`, `paid_on_site_agorot`
- `commission_agorot` (לקופון: כל המקדמה; לפיזי: לפי `platform_percent`)
- `supplier_immediate_agorot` / residual (פיזי בלבד; קופון = 0)
- `platform_percent`, `supplier_split_percent` מצולמים
- `balance_due_agorot` לקופון (יתרה בבית העסק)

אסור לחשב מחדש מ-`products.platform_percent` החי.  
אסור להציג "held / escrow released" כמדד תפעולי.

Refund: חסום אם voucher קשור `redeemed`/`expired` לפי מדיניות legal/fraud.

---

## 4. דוחות (snapshots בלבד; בלי held/Escrow)

### 4.1 משטחים

| Route | תוכן |
|---|---|
| `/admin/analytics` | KPI יומי/תקופתי |
| Export CSV/JSON | הזמנות, payouts, redemptions (admin+ עם `canSeeMoney`) |

### 4.2 מדדים מחייבים

| מדד | הגדרה |
|---|---|
| GMV אתר | סכום ששולם באתר (paid orders) |
| Platform take (קופון) | 100% מ-`paid_on_site` על שורות קופון |
| Platform take (פיזי) | סכום `commission_agorot` מצולם לפי `platform_percent` |
| Supplier payable (פיזי) | residual אחרי עמלה; לא כולל קופונים |
| Redemptions | ספירת `vouchers` → `redeemed` |
| Till due (קופון) | סכום `balance_due_agorot` על issued / שנצבר במימושים |
| Expiry | פקיעות / תזכורות 48ש |
| By supplier | take + physical payable + redeemed count |
| By product | כולל פירוט `platform_percent` **המצולם** (לא החי) |

### 4.3 כללי דיווח

1. כסף מדוחות = snapshots / ledger, לא מחיר חי מקטלוג.
2. Support בלי `canSeeMoney` לא רואה עמלות/payout.
3. ייצוא PII: admin+ בלבד + audit.
4. אין Make/Zapier כמקור דוח ייצור.
5. אין מדד "Escrow held פתוח" במודל המחייב.

### 4.4 קופונים / vouchers (תפעול)

| תצוגה | מקור |
|---|---|
| מלאי לפי סטטוס | `vouchers` |
| ציר מימוש | `voucher_redemptions` / scan log |
| חריגות | burst `already_used`, wrong_supplier, multi-IP (ראה FRAUD) |

---

## 5. RBAC + audit

Roles: `customer | content_uploader | vendor | support | admin | super_admin`.

| פעולה רגישה | דרישה |
|---|---|
| שינוי `platform_percent` | admin+ + audit |
| Role elevation | super_admin rules + recent auth |
| Wallet adjust | super_admin + recent auth + reason |
| Mark payout paid | super_admin + recent auth |
| Force refund | admin+ + blockers fraud/legal |

`audit_log`: כל שינוי כסף, ספק, refund, payout, role.

---

## 6. אבטחה (אדמין)

| ניסיון | בקרה |
|---|---|
| שינוי `platform_percent` בלי הרשאה | Action strip + אין policy כתיבה ללקוח |
| ספק כותב `platform_percent` | נחסם ב-Server Action; כתיבה רק admin service path |
| Ledger tampering ב-PostgREST | אין WRITE ללקוח על wallet/payout lines |
| Refund אחרי redeem | blocker אפליקטיבי + סטטוס voucher |
| ספק מתחזה לאדמין | shells נפרדים; membership ≠ `is_admin()` |
| CSRF / session | SameSite; recent auth לפעולות כסף |

---

## 7. מפת קבצים (יעד / as-built)

```
src/app/(admin)/**
src/server/actions/admin/products.ts
src/server/actions/admin/categories.ts
src/server/actions/admin/payouts.ts
src/lib/admin/rbac.ts
src/lib/admin/permissions.ts
src/lib/commerce/product-money.ts
src/components/admin/ProductForm.tsx
```

---

## 8. Acceptance

- [ ] עורך מוצר מציג ושומר `platform_percent` + `supplier_split_percent` **פר מוצר** עם סכום 100
- [ ] אין default עמלה בקוד/DB; publish נכשל בלי אחוזים
- [ ] רשימת מוצרים מציגה `platform_percent` פר שורה
- [ ] שינוי כסף נרשם ב-`audit_log` ולא משנה הזמנות ישנות
- [ ] קופון: דוחות/UI בלי held/Escrow; take = כל המקדמה; לספק 0 מפלטפורמה
- [ ] `/admin/suppliers` על `suppliers` + applications
- [ ] Money UI מוסתר מ-support בלי `canSeeMoney`

---

## 9. Related

```
docs/ADMIN-ARCHITECTURE.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/BUSINESS-MODEL.md
docs/RUNBOOK-PRODUCTION.md
```

---

## 10. Revision

| Date | Change |
|---|---|
| 2026-07-28 | Draft admin dashboard (arch/admin-supplier) |
| 2026-08-02 | יישור ל-feat/admin-core |
| 2026-08-03 | Binding ב-`ke-arch`: platform_percent פר מוצר (גרסת Escrow) |
| 2026-08-03 | ke-arch docs-lifecycle: No Escrow; `platform_percent` דינמי פר מוצר; דוחות בלי held |
| 2026-08-03 | rev C: נעילת מוצרים/ספקים/דוחות עם platform_percent פר מוצר |
