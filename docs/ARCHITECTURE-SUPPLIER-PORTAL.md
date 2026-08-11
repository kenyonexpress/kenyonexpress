# ארכיטקטורה: פורטל ספק

הרשאות, מסכים, סריקה, דוחות, onboarding.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md
docs/ARCHITECTURE-SUPPLIER-ANALYTICS.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/PAYOUT-ARCHITECTURE.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-MONEY.md
docs/ARCHITECTURE-PRODUCT-TYPES.md
docs/CONTRADICTIONS.md
```

מודולי קוד קנוניים (קריאה בלבד):

```
src/lib/supplier/rbac.ts
src/app/(supplier)/layout.tsx
src/app/api/supplier/vouchers/redeem/route.ts
src/lib/admin/supplier-onboarding.ts
```

מודל כסף: **No Escrow**. קופון: מקדמה = הכנסת פלטפורמה; יתרה בקופה. פיזי: יתרת ספק ב-payout לפי snapshot. אין `escrow_held` פעיל ב-UI/דוחות. מסמכי settlements ישנים עם held-until-redeem **נדחים**.

יחס ל-ONBOARDING / REDEMPTION / ANALYTICS: המסמך הזה = מפת פורטל. פירוט עמוק נשאר במסמכים הייעודיים; בהתנגשות על כסף/הרשאות גובר המסמך הזה + MONEY.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| SP1 | KenyonExpress היא פלטפורמה, לא ספק. לא ב-`suppliers`, לא מממשת קופונים. |
| SP2 | שער פורטל = `supplier_members` פעיל (`is_active`). לא מספיק `profiles.role=vendor`. |
| SP3 | תפקידים: `owner` \| `manager` \| `scanner`. |
| SP4 | מימוש רק דרך RPC `redeem_voucher` (או adapter דק מעליו). אין UPDATE ישיר ל-`vouchers` מ-JWT ספק. |
| SP5 | No Escrow. אין תשלום קופון מהפלטפורמה לספק אחרי redeem. אין KPI בשם `escrow_held`. |
| SP6 | Payout מהפלטפורמה: **פיזי בלבד**. שורות קופון לא ב-statement. |
| SP7 | ספק לא כותב `platform_percent` / `coupon_price` / `discount_percent` / `supplier_split_percent`. |
| SP8 | UI פורטל עברית RTL; כסף פנימי agorot, תצוגה ₪. |
| SP9 | Multi-supplier: בחירת הקשר; redeem מול כל memberships הפעילים של `auth.uid()`. |
| SP10 | Onboarding: אין מסחר בלי `suppliers` + owner membership; בנק חובה ל-payout לא לסריקה. |
| SP11 | `suspended` / `closed` על הספק חוסם redeem ו-publish חדש. |
| SP12 | אין optimistic UI שמסמן redeemed לפני תשובת שרת. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| הרשאה לפי `profiles.role` בלבד | בלי tenant; IDOR בין ספקים; RLS מבוסס membership. |
| ספק מעדכן voucher ישירות | עוקף CAS/rate-limit/audit של RPC. |
| Escrow / "מוחזק עד סריקה" בפורטל | סותר BUSINESS-MODEL / MONEY. |
| ספק עורך `platform_percent` | תנאי עמלה של המפעיל בלבד. |
| בנק חובה לפני סריקה | חוסם מימוש ללקוח שכבר שילם; בנק רק ל-payout פיזי. |
| תפקיד יחיד לכל העובדים | צריך scanner בלי גישה לבנק/צוות. |
| הצגת issued של חנויות אחרות | דליפת עסקים מתחרים / enumeration. |

---

## 2. סכמת DB (קיים; אין DDL חדש במסמך זה)

| טבלה | תפקיד בפורטל |
|---|---|
| `suppliers` | עסק חי; `status` active/suspended/closed |
| `supplier_applications` | בקשת הצטרפות |
| `supplier_members` | `user_id`, `supplier_id`, `member_role`, `is_active`, PIN אופציונלי |
| `supplier_bank_accounts` | בנק ל-payout; owner |
| `vouchers` / `voucher_redemptions` | מימוש + היסטוריה |
| `order_items` / `orders` | תור פיזי (manager+) |
| `payout_statements` (+ lines) | דוחות תשלום פיזיים |
| `products` | טיוטות/קריאה; בלי כתיבת % |

Helpers SQL: `is_supplier_member`, `is_supplier_owner` (ומקבילים).  
אפליקציה: `requireSupplierMember()` / הרחבה עתידית `minRole`.

אין DDL במסמך זה.

---

## 3. הרשאות (RBAC)

| יכולת | scanner | manager | owner |
|---|---|---|---|
| בית / סיכום היום | כן | כן | כן |
| סריקה / redeem | כן | כן | כן |
| היסטוריית מימושים | כן | כן | כן |
| דוחות סריקה בסיסיים (ספירות) | כן | כן | כן |
| דוחות כסף / אנליטיקס עסקי | לא | כן | כן |
| תור הזמנות פיזיות + shipped | לא | כן | כן |
| מוצרים (קריאה / טיוטה) | לא | כן | כן |
| צוות (הזמנה/השעיה) | לא | לא | כן |
| בנק / payouts | לא | לא | כן |
| הגדרות עסק / סניפים | לא | לא | כן |

כללי חסימה נוספים:

| תנאי | תוצאה |
|---|---|
| אין session | redirect ל-`/login?next=/supplier/...` |
| אין membership פעיל | כמו לא מחובר לפורטל |
| `suppliers.status` לא active | חוסם redeem (ופעולות מסחר) |
| PIN נדרש (`scan_pin_required`) | חובה לפני/בתוך מסך סריקה (REDEMPTION) |

Helper: `requireSupplierMember({ minRole })` (יעד). כיום הקוד טוען membership ראשון פעיל; בחירת ספק מרובה = פתוחה אם יש יותר מאחד.

---

## 4. מפת מסכים

```text
/supplier                 בית (היום)
/supplier/scan            סורק QR / קוד ידני
/supplier/redemptions     היסטוריית מימושים
/supplier/orders          תור פיזי + סימון נשלח          (manager+)
/supplier/products        מוצרים (קריאה/טיוטה)           (manager+)
/supplier/payouts         דוחות תשלום (לא draft)         (owner)
/supplier/reports         דוחות תקופתיים                 (manager+; ראה ANALYTICS)
/supplier/settings        עסק / סניפים / צוות / בנק      (owner)
/supplier/apply           הצטרפות (לפני membership)
```

Aliases קיימים אפשריים: `/scan` תחת קבוצת supplier. מקור אמת לנתיב סריקה: `/supplier/scan`.

Layout `(supplier)`: כל הנתיבים מאחורי `requireSupplierMember` חוץ מ-apply (אורח/מועמד).

---

## 5. Dashboard (בית)

סיכום **היום** (`Asia/Jerusalem`):

| כרטיס | מקור | מי רואה |
|---|---|---|
| סריקות היום | `voucher_redemptions` success | הכל |
| יתרה שנגבתה בקופה היום | סכום `remaining` על מימושים | הכל (זו גבייה מקומית, לא העברה) |
| הזמנות פיזיות פתוחות | `order_items` פיזי לא fulfilled | manager+ |
| CTA סריקה | קישור ל-`/supplier/scan` | הכל |

אסור ב-dashboard:

- `escrow_held` / "מוחזק עד סריקה"
- "ממתין להעברה מ-KenyonExpress" על קופון
- עריכת `platform_percent`

---

## 6. סריקה

מסך `/supplier/scan` (PWA, mobile-first):

```text
מצלמה QR | הזנת קוד
  → (PIN אם נדרש)
  → POST /api/supplier/vouchers/redeem
       { code | qr_payload, scan_method, idempotency_key? }
  → redeem_voucher (SECURITY DEFINER)
       membership ∩ supplier_id
       rate limit
       UPDATE CAS issued→redeemed
       INSERT voucher_redemptions
  → UI הצלחה: שם מוצר + סכום לגבייה בקופה
```

| Outcome | UI |
|---|---|
| `success` | ירוק; סכום קופה; בלי הבטחת payout |
| `already_redeemed` / `expired` / `refunded` / `cancelled` | אדום + פירוט |
| `not_found` (כולל wrong shop) | אחיד; anti-enum |
| `rate_limited` | 429; נסו שוב |
| `unauthorized` | חזרה ל-login |

כללים: אין סימון redeemed לפני תשובה; HMAC על QR לפני RPC אם נשלח payload; פירוט locks/races ב-COUPON-LIFECYCLE.

---

## 7. דוחות

| דוח / מסך | תוכן | תפקיד מינ' | מקור |
|---|---|---|---|
| Redemptions list | לוג סריקות (הצלחה/כישלון לפי RLS) | scanner | `voucher_redemptions` |
| Reports / Analytics | ספירות redeemed, יתרות קופה מצטברות, פיזי due | manager | ראה SUPPLIER-ANALYTICS |
| Payouts | statements `pending_approval`+ (לא `draft`) | owner | `payout_statements` + lines פיזיות |
| Orders queue | סטטוס משלוח | manager | `order_items` / fulfillment |

כללי דוחות:

| כלל | פירוט |
|---|---|
| קופון ב-payout | לא מופיע |
| סכומי קופה | תווית "נגבה בעסק", לא "שולם ע״י הפלטפורמה" |
| טיוטות payout | מוסתרות מספק |
| ייצוא CSV | owner/manager לפי ANALYTICS; בלי PAN/בנק מלא ל-scanner |
| אגורות | חישוב פנימי; תצוגה ₪ |

ביצוע העברה בנקאית: אדמין/מערכת בלבד (PAYOUT-ARCHITECTURE). הספק רואה סטטוס ואסמכתה.

---

## 8. Onboarding (בתוך ומחוץ לפורטל)

### 8.1 זרימה

```text
מועמד → /supplier/apply
  → supplier_applications pending
  → admin approve
       → INSERT suppliers (active)
       → INSERT supplier_members(owner)
       → welcome mail
  → כניסה ל-/supplier
  → השלמת זהות / לוגו / כתובת (חוסם publish)
  → הוספת צוות (scanner+)
  → בנק (לפני payout פיזי)
  → טיוטות מוצר → אדמין קובע platform_percent → publish
```

Checklist אדמין (קוד: `onboardingSteps`): identity → active → members → products.

| שלב | חוסם מסחר? |
|---|---|
| חסרים פרטי זהות ל-PDP | כן ל-publish |
| status לא active | כן |
| 0 חברי צוות פעילים | כן ל-redeem (לקוח תקוע עם voucher) |
| 0 מוצרים | לא שבור; ספק חדש |
| בלי בנק | לא חוסם סריקה; חוסם תשלום payout |

### 8.2 אחרי אישור

| פעולה | מי |
|---|---|
| הזמנת scanner/manager | owner |
| השעיית חבר | owner |
| עדכון בנק | owner (verified_* לא עצמי ללא בקרת אדמין) |
| הגשת טיוטת מוצר | manager+ |
| קביעת `%` ו-publish | admin בלבד |

פירוט בקשה/מסמכים/cooldown: `ARCHITECTURE-SUPPLIER-ONBOARDING.md`.

---

## 9. כסף במבט ספק

| סוג | בעסק / פורטל | מהפלטפורמה |
|---|---|---|
| קופון | גביית יתרה בקופה בעת סריקה | 0 |
| פיזי | משלוח; יתרה ב-payout אחרי T+N + סף | `base - platformFee` מה-snapshot |

`platform_percent` מצולם בהזמנה; הספק קורא בלבד.

---

## 10. הזמנות פיזיות (manager+)

```text
paid → packing? → shipped | ready_for_pickup → fulfilled/delivered
```

Server Actions בלבד; כתובת משלוח לפי מדיניות PII; tracking חובה כשמוגדר ב-FULFILLMENT. אין Escrow release במסירה.

---

## 11. RLS (תמצית)

| טבלה | SELECT ספק | כתיבה |
|---|---|---|
| `supplier_members` | חברי אותו ספק | owner/admin |
| `voucher_redemptions` | membership | RPC |
| `vouchers` | לא issued זר; redeemed של הספק | RPC |
| `order_items` | `supplier_id` שלו | לא ישיר |
| `payout_statements` | ≠ draft | אדמין/definer |
| `supplier_bank_accounts` | owner | owner (מגבלות verified) |
| `products` | של הספק | טיוטה מוגבלת; לא עמודות כסף רגישות |

---

## 12. מקרי קצה

| קוד | סימפטום | תוצאה |
|---|---|---|
| `no_membership` | משתמש בלי שורה פעילה | redirect login / אין פורטל |
| `supplier_suspended` | status לא active | redeem נחסם |
| `scan_race` | שני סורקים | אחד success; שני already_redeemed |
| `wrong_shop` | קוד של ספק אחר | not_found ללקוח |
| `scanner_sees_bank` | ניסיון גישה | 403 / הסתרת נתיב |
| `approve_no_owner` | suppliers בלי member | onboarding blocking; אין redeem |
| `payout_draft_leak` | draft ב-API | אסור ב-SELECT ספק |
| `edit_percent` | ניסיון כתיבה | נדחה ב-action/RLS |
| `apply_duplicate_pending` | שתי בקשות פתוחות | נחסם (ONBOARDING) |

---

## 13. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | UI בחירת ספק כשיש >1 membership | הקוד לוקח את הראשון לפי `created_at` |
| O2 | האם `/supplier/reports` נפרד מ-dashboard או טאב | ANALYTICS |
| O3 | PIN: חובה גלובלית או לפי ספק/סיכון | REDEMPTION O3 |
| O4 | האם manager רואה payouts קריאה בלבד | כרגע owner בלבד; לשקול |
| O5 | יישור נתיבי `/scan` מול `/supplier/scan` | להשאיר redirect אחד |

עודכן: 2026-08-12.

---

## 14. Acceptance

- [ ] RBAC טבלה מלאה (scanner/manager/owner)  
- [ ] מפת מסכים + שער layout  
- [ ] סריקה → RPC + anti-optimistic + anti-enum  
- [ ] דוחות בלי escrow_held; payout פיזי בלבד  
- [ ] Onboarding: apply → approve → members → bank/products  
- [ ] חלופות שנדחו + DB + מקרי קצה + פתוחות  
- [ ] No Escrow + RTL  

---

## 15. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | BINDING רחב |
| 2026-08-12 | batch #23 / pass-2 |
| 2026-08-12 | שכתוב לפי תבנית: הרשאות, מסכים, סריקה, דוחות, onboarding, חלופות, פתוחות |
