# ארכיטקטורה: פורטל ספק

לוח ספק: בית (dashboard), סריקה, מימושים, ותצוגת payouts.  
אין מודל פעיל של כסף מוחזק לספק על קופון; אין מדד `escrow_held` פעיל ב-UI או בדוחות.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: `arch/docs-batch-2` · batch #23/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/PAYOUT-ARCHITECTURE.md
docs/ADMIN-ARCHITECTURE.md
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
```

Stack: `(supplier)` App Router, Supabase RLS, PWA scanner, Resend.  
כסף: integer agorot. RPC מימוש: `public.redeem_voucher`.

מודל כסף: **No Escrow**. קופון: מקדמה באתר = הכנסת פלטפורמה; יתרה בקופה. פיזי: יתרת ספק אחרי `platform_percent` snapshot, דרך payout (לא "held עד סריקה").

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| SP1 | KenyonExpress היא פלטפורמה, לא ספק. לא מופיעה ב-`suppliers` ולא מממשת קופונים. |
| SP2 | `platform_percent` דינמי פר מוצר, admin only, snapshot ב-`order_items`. |
| SP3 | **No Escrow.** אין נאמן, אין J5 hold, אין תשלום קופון מהפלטפורמה לספק אחרי redeem. |
| SP4 | הרשאת פורטל = `supplier_members`, לא `profiles.role=vendor` לבדו. |
| SP5 | מימוש רק דרך RPC; אין UPDATE ישיר ל-`vouchers` מ-JWT ספק. |
| SP6 | Payout מהפלטפורמה: **פיזי בלבד**. שורות קופון לא נכנסות ל-statement. |
| SP7 | תצוגת payouts לספק: statements שאינם `draft`; **אין** מדד/כרטיס `escrow_held` פעיל. |
| SP8 | PDP מציג זהות ספק (שם, טלפון, כתובת, לוגו). |
| SP9 | כסף בפורטל באגורות פנימית; UI ב-₪. |
| SP10 | UI פורטל עברית RTL בכל המסכים. |

---

## 1. זהות והרשאות

| ישות | טבלה |
|---|---|
| עסק חי | `suppliers` |
| בקשה | `supplier_applications` |
| חברות | `supplier_members` (`owner` / `manager` / `scanner`) |
| בנק | `supplier_bank_accounts` |

| יכולת | scanner | manager | owner |
|---|---|---|---|
| בית / סטטיסטיקת היום | כן | כן | כן |
| סריקה / redeem | כן | כן | כן |
| היסטוריית מימושים | כן | כן | כן |
| תור הזמנות פיזיות | לא | כן | כן |
| מוצרים (קריאה / טיוטה) | לא | כן | כן |
| צוות / בנק / payouts | לא | לא | כן |

Helper אפליקטיבי: `requireSupplierMember({ minRole })`.  
SQL: `is_supplier_member`, `is_supplier_owner`.  
`is_active=false` או `suppliers.status` מושעה → חוסם redeem.

---

## 2. מפת מסכים

```text
/supplier                  בית (היום: סריקות, הזמנות פתוחות)
/supplier/scan             סורק QR / הזנת קוד
/supplier/redemptions      היסטוריית מימושים
/supplier/orders           תור פיזי + סימון נשלח
/supplier/products         רשימת מוצרים (בלי עריכת %)
/supplier/payouts          דוחות תשלום (לא draft)
/supplier/settings         פרטי עסק / סניפים / צוות / בנק (owner)
```

Multi-supplier: בחירת הקשר; redeem לפי **כל** ה-memberships הפעילים.

---

## 3. Dashboard (בית)

מסך `/supplier` מציג סיכום **היום** (אזור זמן `Asia/Jerusalem`):

| כרטיס | מקור | הערה |
|---|---|---|
| סריקות היום | `voucher_redemptions` להיום | מונה בלבד |
| יתרה שנגבתה בקופה (היום) | סכום `remaining_amount_due` על מימושים | לא "הועבר מפלטפורמה" |
| הזמנות פיזיות פתוחות | `order_items` פיזי במצב לא fulfilled | manager+ בלבד לקישור לתור |
| קיצור לסריקה | CTA ל-`/supplier/scan` | כל התפקידים |

אסור ב-dashboard:

- כרטיס / מדד בשם `escrow_held` או "מוחזק עד סריקה"
- יתרת קופון ש"ממתינה להעברה מ-KenyonExpress"
- עריכת `platform_percent`

---

## 4. כסף לפי סוג מוצר (מבט ספק)

| סוג | לקוח באתר | לקוח בעסק | מה הפלטפורמה שומרת | מה הספק מקבל מהפלטפורמה |
|---|---|---|---|---|
| קופון | `coupon_price` | face − coupon | 100% ממקדמת האתר | **0** (הכנסה = גבייה בקופה) |
| פיזי | חיוב מלא | 0 | `platform_percent` מה-snapshot | יתרה אחרי fee, ב-payout |

במימוש מוצלח: מציגים **יתרה לגבייה בבית העסק** (`remaining_amount_due_agorot`).  
אסור להציג "יועבר מ-KenyonExpress" על קופון.

---

## 5. סריקה ומימושים (scan + redemptions)

### 5.1 סריקה

מסך `/supplier/scan` (PWA-friendly):

1. מצלמה ל-QR או הזנת קוד ידנית
2. קריאה ל-API → RPC `redeem_voucher`
3. תוצאה מיידית בעברית; בלי optimistic UI שמסמן redeemed לפני תשובת שרת

זרימה:

```text
POST /api/supplier/vouchers/redeem  (או alias /api/supplier/redeem)
  → redeem_voucher (auth.uid + membership + rate limit + idempotency)
  → CAS: status issued → redeemed רק אם supplier_id ∈ memberships
  → voucher_redemptions + audit
```

| תוצאה | UI |
|---|---|
| success | שם מוצר + סכום לגבייה בקופה |
| already_redeemed / expired / … | הודעה ברורה |
| wrong shop | קורס ל-`not_found` ב-API (anti-enum) |

### 5.2 היסטוריית מימושים

`/supplier/redemptions`: SELECT על `voucher_redemptions` / vouchers שמומשו אצל הספק.  
Issued של חנויות אחרות: לא ברשימה.  
סינון לפי תאריך / סניף (אם קיים ב-audit).

פירוט RPC: COUPON-REDEMPTION + COUPON-LIFECYCLE.

---

## 6. הזמנות פיזיות

Manager+ רואה `order_items` עם `supplier_id` שלו על הזמנות `paid` / fulfilled חלקי.

מעברים (Server Action, לא UPDATE לקוח):

```text
paid → packing? → shipped | ready_for_pickup → fulfilled
```

כתובת משלוח רק כש-`is_supplier_shipping_order`.  
PII מעבר למשלוח: מינימום; אימייל לקוח כבוי כברירת מחדל ב-v1.

---

## 7. תצוגת payouts (בלי escrow_held פעיל)

| מקור | תפקיד |
|---|---|
| `payout_statements` | תקופה, סכומים, סטטוס, אסמכתה |
| `payout_statement_lines` | שורות **פיזיות** בלבד |
| `settlement_events` | מקור זכאות (ראה PAYOUT-MECHANISM) |

סטטוסים לספק: `pending_approval` / `approved` / `paid` / `cancelled` (לא `draft`).

| כלל | פירוט |
|---|---|
| קופון | לא בשורות payout |
| זכאות | T+N ימי עסקים + סף מינימום (ברירת מחדל ₪100) |
| בנק | חובה מאומת לפני תשלום בפועל |
| UI | יתרה לתשלום / שולם / ממתין לאישור |
| אסור | שדה, כרטיס, עמודה או KPI בשם `escrow_held` (לא מודל פעיל) |

ביצוע כסף: PAYOUT-ARCHITECTURE (`TransferFromDigitalBank` + CSV fallback). הספק רואה תוצאה; לא מריץ Transfer.

---

## 8. מוצרים בפורטל

ספק יוצר טיוטה / מגיש לביקורת.  
**אסור** לכתוב `platform_percent`, `coupon_price`, `discount_percent`, `supplier_split_percent` מ-JWT ספק.  
קריאה של האחוז המפורסם מותרת לשקיפות. Publish = אדמין בלבד.

---

## 9. RLS (תמצית)

| טבלה | SELECT ספק | כתיבה |
|---|---|---|
| `order_items` | `is_supplier_member(supplier_id)` | לא ישיר |
| `orders` | דרך `is_supplier_order` | לא ישיר |
| `voucher_redemptions` | membership | RPC בלבד |
| `vouchers` | redeemed אצל הספק / לא issued זר | RPC בלבד |
| `payout_statements` | membership ו-status ≠ draft | אדמין/definer בלבד |
| `supplier_bank_accounts` | owner | owner (בלי verified_* עצמי) |

---

## 10. Acceptance

- [ ] Membership gate על כל `/supplier/**`
- [ ] Dashboard היום בלי `escrow_held` ובלי "מוחזק לספק"
- [ ] Scan → redeem_voucher אטומי; wrong shop לא מנחש; anti-optimistic
- [ ] Redemptions: היסטוריה לספק בלבד
- [ ] תור פיזי ל-manager+
- [ ] Payouts: פיזי בלבד; אין escrow_held פעיל
- [ ] ספק לא עורך `platform_percent`
- [ ] No Escrow בנוסח ובדוחות
- [ ] UI עברית RTL

---

## 11. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | BINDING רחב: portal + redeem + payout |
| 2026-08-12 | batch #23: ריענון ממוקד dashboard/redemptions/payouts; escrow_held לא מודל פעיל |
| 2026-08-12 | batch #23/50 pass-2: חיזוק dashboard/scan/redemptions/payouts; איסור escrow_held פעיל |
