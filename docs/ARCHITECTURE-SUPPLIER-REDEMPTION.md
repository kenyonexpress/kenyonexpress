# ארכיטקטורה: מימוש בפורטל ספקים

פורטל ספקים למימוש קופונים: סריקת QR / קוד, PIN צוות, תפקידי staff, ו-audit מלא. סטטוס מימוש קנוני: `redeemed`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. מקדמה באתר = הכנסת פלטפורמה ב-`paid`. יתרה נגבית בעסק מחוץ לפלטפורמה. סריקה לא משחררת payout.

מסמכים קשורים:

```
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/CONTRADICTIONS.md
```

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| SR1 | מימוש רק דרך RPC `redeem_voucher` (SECURITY DEFINER). אין UPDATE ישיר לספק על voucher. |
| SR2 | כתיבה חדשה: `issued` → `redeemed` (לא `used`). CAS אטומי עם `WHERE status='issued'`. |
| SR3 | הרשאה = `supplier_members` פעיל, לא `profiles.role` לבד. |
| SR4 | תפקידי staff: `owner` \| `manager` \| `scanner`. סריקה מותרת לשלושתם. |
| SR5 | PIN צוות: חובה כש-`scan_pin_required`; hash בלבד. |
| SR6 | כל ניסיון סריקה נרשם ב-`voucher_redemptions` + `audit_log`. |
| SR7 | wrong supplier / not_found → `not_found` חיצוני (anti-enum). |
| SR8 | תשובת הצלחה מדגישה `balance_due` / `collect_amount` לגבייה בעסק. |
| SR9 | Offline: אימות חתימה מקומי; מימוש כספי רק אחרי אונליין. |
| SR10 | No Escrow: אין release / held / J5 בסריקה. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| UPDATE ישיר ל-voucher מ-client | bypass RLS; fraud |
| סטטוס `used` במקום `redeemed` | inconsistency; `redeemed` קנוני |
| release Escrow בסריקה | סותר No Escrow |
| payout record על redeem | supplier_due מהפלטפורמה = 0 |
| wrong supplier → שגיאה מפורשת | enum attack; `not_found` חיצוני |
| redeem offline ללא sync | double-spend; sync queue בלבד |

---

## 2. סכמת DB (קיים; אין DDL חדש)

| ישות | שדות / שימוש |
|---|---|
| `vouchers` | `code`, `status`, `redeemed_at`, `supplier_id`, `expires_at`, `qr_payload` |
| `voucher_redemptions` | append-only scan log |
| `supplier_members` | `member_role`, `is_active`, `pin_hash`, `scan_pin_required` |
| `order_items` | snapshot `balance_due_agorot`, `paid_on_site_agorot` |
| `audit_log` | SECURITY DEFINER writes |

```text
supplier_members (supplier_id, user_id, member_role, is_active, pin_hash?, …)
```

אין DDL חדש במסמך זה.

---

## 3. תפקידי staff

| member_role | סריקה | הזמנות | payout | בנק / צוות |
|---|---|---|---|---|
| `owner` | כן | כן | כן | כן |
| `manager` | כן | כן | קריאה | לא |
| `scanner` | כן | מוגבל | לא | לא |

---

## 4. PIN צוות

| מצב | התנהגות |
|---|---|
| `scan_pin_required = false` | JWT membership מספיק |
| `scan_pin_required = true` | PIN לפני סריקה |
| PIN שגוי × N | lockout + audit |

PIN: 4–6 ספרות, `pin_hash` בלבד, אימות בשרת.

---

## 5. זרימת מימוש

```text
/supplier/scan
  → JWT + membership active
  → PIN אם נדרש
  → QR / קוד ידני
  → redeem_voucher (CAS)
  → UI: collect_amount בעסק
```

---

## 6. מקרי קצה

| מקרה | התנהגות |
|---|---|
| שתי סריקות במקביל | CAS: אחת success; שנייה `already_redeemed` |
| redeem אחרי refund/freeze | `frozen` / blocked |
| voucher expired | `expired` |
| rate limit abuse | `rate_limited` + audit |
| wrong supplier | `not_found` חיצוני |
| offline queue replay | idempotent; sync אחרי אונליין |
| member deactivated mid-scan | 403 |
| PIN brute force | lockout + ntfy fraud |
| collect_amount שונה מ-snapshot | UI מציג snapshot; לא override |

---

## 7. קשר למודל כסף

| נושא | כלל |
|---|---|
| מקדמת אתר | `platform_settled` ב-finalize; סריקה לא נוגעת |
| יתרה בעסק | מוצגת לסורק; נגבית מחוץ למערכת |
| Payout | אין שורת payout על redeem |
| No Escrow | אין held לספק |

---

## 8. Acceptance

- [ ] CAS: שני redeem מקבילים → הצלחה אחת
- [ ] wrong shop → `not_found` חיצוני
- [ ] כל ניסיון ב-audit
- [ ] No Escrow: אין release בסריקה
- [ ] `redeemed` בלבד

---

## 9. פתוחות

| ID | שאלה | ברירת מחדל |
|---|---|---|
| Q-SR-PIN | PIN פר סניף vs פר member? | פר member |
| Q-SR-OFFLINE | max queue depth offline? | 50 |

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING template; PIN, staff, audit; No Escrow |
