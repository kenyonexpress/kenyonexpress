# ארכיטקטורה: מימוש בפורטל ספקים

פורטל ספקים למימוש קופונים: סריקת QR / קוד, PIN צוות, תפקידי staff, ו-audit מלא. סטטוס מימוש קנוני: `redeemed`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #10/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
```

מודל כסף: **No Escrow**. מקדמה באתר = הכנסת פלטפורמה ב-`paid`. יתרה נגבית בעסק מחוץ לפלטפורמה. סריקה לא משחררת payout ולא יוצרת העברה פלטפורמה→ספק.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| SR1 | מימוש רק דרך RPC `redeem_voucher` (SECURITY DEFINER). אין UPDATE ישיר לספק על voucher. |
| SR2 | כתיבה חדשה: `issued` → `redeemed` (לא `used`). CAS אטומי עם `WHERE status='issued'`. |
| SR3 | הרשאה = `supplier_members` פעיל, לא `profiles.role` לבד. |
| SR4 | תפקידי staff: `owner` \| `manager` \| `scanner`. סריקה מותרת לשלושתם כש-`is_active`. |
| SR5 | PIN צוות: חובה לפני סריקה כשמופעל ברמת ספק (`scan_pin_required`). PIN פר חבר או PIN סניף משותף לפי הגדרה. |
| SR6 | כל ניסיון סריקה (הצלחה/כישלון) נרשם ב-`voucher_redemptions` / scan log + `audit_log`. |
| SR7 | wrong supplier ו-not_found מוחזרים כלקוח כ-`not_found` (anti-enum). הפנימי מדויק בלוג. |
| SR8 | תשובת הצלחה מדגישה `balance_due` / `collect_amount` לגבייה בעסק (snapshot). |
| SR9 | Offline: אימות חתימה מקומי בלבד; מימוש כספי רק אחרי אישור אונליין. |
| SR10 | No Escrow: אין release / held / J5 בסריקה. |

---

## 1. תפקידי staff

```text
supplier_members (supplier_id, user_id, member_role, is_active, pin_hash?, …)
```

| member_role | סריקה | הזמנות/משלוח | דוחות payout | בנק / צוות | מחלוקות |
|---|---|---|---|---|---|
| `owner` | כן | כן | כן | כן | פתיחה |
| `manager` | כן | כן | קריאה | לא | לא (אלא אם הורחב) |
| `scanner` | כן | קריאה מוגבלת | לא | לא | לא |

- `profiles.role = vendor` = שער גס ל-routing (`/supplier`) בלבד.
- כיבוי מיידי: `is_active=false` מנתק סריקה בלי למחוק היסטוריה.
- משתמש יכול להיות חבר בכמה ספקים; RPC בודק membership מול `supplier_id` של השובר.

---

## 2. PIN צוות

### 2.1 מתי נדרש

| מצב | התנהגות |
|---|---|
| `scan_pin_required = false` | JWT membership מספיק |
| `scan_pin_required = true` | אחרי login, לפני/בתוך מסך הסריקה: הזנת PIN |
| PIN שגוי × N | lockout קצר + audit; לא חושף אם החבר קיים |

### 2.2 כללים

- PIN הוא מספר קצר (4–6 ספרות). נשמר כ-hash בלבד (`pin_hash`), לא plaintext.
- אימות PIN בשרת (server action / RPC עזר), לא ב-client בלבד.
- סשן סריקה אחרי PIN תקף לחלון מוגבל (למשל 15 דקות או עד יציאה ממסך הסריקה).
- החלפת PIN: `owner` או האדמין; כל שינוי ב-`audit_log`.
- שכחתי PIN: איפוס דרך owner/אדמין בלבד. אין שליחת PIN במייל plaintext.

### 2.3 למה PIN בנוסף ל-JWT

מכשיר משותף בקופה: עובד אחד מחובר, כמה קופאים. PIN מזהה מי סרק בפועל ומצמצם שימוש לרעה במכשיר פתוח.

---

## 3. זרימת מימוש

```text
/supplier/scan
  → JWT + membership active
  → אם scan_pin_required: verify PIN → scan session
  → QR decode או הזנת קוד ידנית
  → (אופציונלי) אימות חתימה מקומי
  → POST redeem (supplier JWT + scan_method + optional pin_session)
  → redeem_voucher:
       1. auth + member + rate limit
       2. BEGIN
       3. UPDATE vouchers SET status='redeemed', redeemed_at=now(), …
            WHERE code=… AND supplier_id=member.supplier_id
              AND status='issued' AND expires_at > now()
            RETURNING *
       4. INSERT redemption / scan event (תמיד)
       5. COMMIT
  → UI ירוק: שם דיל, לקוח, סכום לגבייה בעסק
  → outbox: voucher_redeemed ללקוח
```

### 3.1 תוצאות RPC

| תוצאה | ללקוח הסורק | לוג פנימי |
|---|---|---|
| `success` | מסך ירוק + collect | success + member_id + pin_session_id? |
| `already_redeemed` | כבר מומש + מועד | already_redeemed |
| `expired` | פג תוקף | expired |
| `frozen` / blocked | לא ניתן למימוש | frozen |
| `not_found` | לא נמצא | not_found **או** wrong_supplier |
| `rate_limited` | נסה שוב | rate_limited |
| `pin_required` / `pin_invalid` | הזן PIN | pin_* |

### 3.2 Race

שתי סריקות במקביל: UPDATE מותנה אחד מצליח; השני 0 שורות → `already_redeemed`. אין SERIALIZABLE חובה. אין side effects כספיים על כישלון.

---

## 4. Audit

כל אירוע סריקה כולל לפחות:

| שדה | משמעות |
|---|---|
| `voucher_id` / code hash | מה נסרק |
| `supplier_id` | ספק הסורק |
| `member_user_id` | מי מחובר |
| `member_role` | owner/manager/scanner |
| `scan_method` | `qr` \| `manual` \| `sync_queue` |
| `pin_verified` | האם PIN אומת בסשן |
| `result` | success / already_redeemed / … |
| `ip_truncated` / device hint | abuse |
| `created_at` | זמן |

עקרונות:

- Append-only לטבלת סריקות (אין UPDATE/DELETE ל-API רגיל).
- `audit_log` דרך SECURITY DEFINER בלבד.
- מחלוקת "לא מומש": הלוג הוא מקור האמת (מי, מתי, איך).
- אדמין רואה ציר זמן מלא; scanner רואה רק הצלחות/כישלונות של הספק שלו לפי RLS.

---

## 5. מסכי פורטל (מימוש)

```text
/supplier/scan          מסך סריקה (PWA, mobile-first)
/supplier/coupons       רשימת שוברים של הספק (issued/redeemed/…)
/supplier/settings/team ניהול חברים + PIN (owner)
```

UI הצלחה: סכום לגבייה בענק, שם לקוח לאימות זהות בחשד, שם מוצר.  
UI כישלון: מסך אדום מלא + מועד מימוש קודם אם `already_redeemed`.

פרטים ויזואליים: `ARCHITECTURE-COUPON-REDEMPTION-UX.md`.

---

## 6. קשר למודל כסף

| נושא | כלל |
|---|---|
| מקדמת אתר | כבר `platform_settled` ב-finalize; סריקה לא נוגעת |
| יתרה בעסק | מוצגת לסורק; נגבית מחוץ למערכת |
| Payout | אין שורת payout על redeem של קופון |
| No Escrow | אין held לספק על מקדמה |

---

## 7. Acceptance

- [ ] CAS: שני redeem מקבילים → הצלחה אחת  
- [ ] scanner בלי PIN כשנדרש → חסום  
- [ ] wrong shop → `not_found` חיצוני + לוג מדויק  
- [ ] כל ניסיון ב-audit / scan log  
- [ ] No Escrow: אין אירוע release בסריקה  
- [ ] כתיבה חדשה ל-`redeemed` בלבד  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #10/50: פורטל מימוש, PIN, staff roles, audit; יישור ל-`redeemed` + No Escrow |
