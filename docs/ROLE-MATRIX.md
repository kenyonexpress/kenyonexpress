# מטריצת תפקידים

**נקרא מפרודקשן ב-07.09.2026**, לא מהתיעוד. כל שורה כאן מגובה במדיניות
חיה או בטריגר חי. `src/db/__tests__/rls-role-boundaries.test.ts` אוכף אותה.

## התפקידים שקיימים באמת

```
user_role = customer, content_uploader, vendor, admin, super_admin, support
```

**אין `coupon_partner`.** ראה `docs/DECISION-LOG.md` D-001. בכל מקום שתור
העבודה אומר "coupon-partner", הכוונה ל-`vendor`, וההרשאה בפועל נגזרת
מחברות ב-`supplier_members`.

| תפקיד | מדיניויות שמזכירות אותו | איך הוא מקבל גישה בפועל |
|---|---|---|
| `customer` | ברירת המחדל | `auth.uid()` על השורות שלו |
| `content_uploader` | 12 | `has_role()` ו/או `created_by = auth.uid()` |
| `vendor` | **0** | **לא דרך התפקיד.** דרך `supplier_members` |
| `admin` | דרך `is_admin()` | `is_admin()` |
| `super_admin` | דרך `is_admin()` | `is_admin()` |
| `support` | קריאה בלבד במסלולי החזר | — |

## הספק: החברות היא ההרשאה, לא התפקיד

`redeem_voucher` בפרודקשן גוזר את הספק מ-`supplier_members` דרך `auth.uid()`
ואינו קורא את `profiles.role` בכלל. אותו דבר `is_supplier_member()`.
משתמש עם `vendor` בפרופיל ובלי שורת חברות **אינו ספק בשום מסלול**.

בתוך ספק, `supplier_members.member_role` הוא `owner` / `manager` / `scanner`
(‏W35 מרחיב את גבולות הצמדים האלה).

## `content_uploader`, לפי מה שנמדד

| טבלה | פעולה | התנאי החי |
|---|---|---|
| `products` | SELECT | פעיל, או `is_admin()`, או `created_by = auth.uid()`, או `is_supplier_member(supplier_id)` |
| `products` | INSERT | `is_admin() OR has_role(...) OR (role=... AND created_by = auth.uid())` |
| `products` | UPDATE | `is_admin() OR has_role(...) OR (role=... AND created_by = auth.uid())` |
| `product_variants` | SELECT/INSERT/UPDATE/DELETE | `is_admin() OR has_role(...)` |
| `media_assets` | INSERT/UPDATE | `is_admin() OR has_role(...)` |
| `suppliers` | INSERT/UPDATE | `is_admin() OR has_role(...)` |
| `categories` | SELECT | פעיל, או `is_admin()`, או `created_by = auth.uid()` |

### שלוש עובדות שהטבלה הזו לא מראה לבד

1. **פרסום חסום ב-DB.** הטריגר `enforce_product_approval` הוא
   `SECURITY DEFINER` ומעלה `42501` על כל כתיבת לא-אדמין שבה
   `NEW.status = 'active'`. זו האכיפה של "לעולם לא לפרסם", והיא לא ב-UI.
2. **ולכן מוצר חי אינו נגיש כלל ל-`content_uploader`.** הטריגר נופל על כל
   `status='active'`, גם בעדכון שנוגע רק באחוזים.
3. **הסיפא על הבעלות מתה ב-`products_update_unified`.** `has_role(...)`
   ו-`created_by = auth.uid()` מאוחדים ב-OR באותה מדיניות, כך שכל
   `content_uploader` עובר ברישא. בפועל: הוא יכול לערוך **טיוטה של אחר**.
   פתוח בכוונה עד `W8`, ראה `DECISION-LOG.md` D-003.

## מה שאף אחד מלבד אדמין ושירות לא נוגע בו

`payments`, `refunds`, `wallet_entries`, `wallet_accounts`,
`voucher_redemptions` (כתיבה), `order_items.settlement_status`. כתיבה שם היא
service role בלבד. `refunds` דלוקה עם שתי מדיניויות SELECT בלבד, בעל ההזמנה
ו-admin/super_admin/support, ואפס מדיניויות INSERT/UPDATE/DELETE.
