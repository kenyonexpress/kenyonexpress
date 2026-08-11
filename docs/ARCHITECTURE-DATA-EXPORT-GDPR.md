# ארכיטקטורה: ייצוא ומחיקת נתונים (GDPR / פרטיות)

ייצוא ומחיקת נתוני משתמש (זכויות נושא מידע; יישור לדין הישראלי + עקרונות GDPR כשיחולו).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #45/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-ACCOUNT-IDENTITY.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-CUSTOMER-SUPPORT.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CONTRADICTIONS.md
```

אזהרה: חוזה הנדסי. לא מחליף ייעוץ משפטי / רשם מאגרי מידע.

מודל כסף בייצוא: snapshots כפי שנשמרו. **אין** שדות Escrow/held/J5.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| D1 | המשתמש יכול לבקש **ייצוא** ו**מחיקה/הסתרה** מאזור אישי או דרך תמיכה. |
| D2 | ייצוא = ארכיון מכונה (JSON) של נתונים אישיים בבעלות המשתמש; בלי סודות מערכת. |
| D3 | מחיקה מלאה לא מוחקת ראיות כספיות שחובה לשמור (הזמנות, תשלומים, vouchers, audit). |
| D4 | על נתונים כספיים: anonymize / detach מזהה אישי במקום hard-delete כשנדרש שימור. |
| D5 | בקשות דרך טבלה + SLA יעד 30 יום (יעד פנימי: 14 יום עסקים). |
| D6 | Admin/support מבצעים אחרי אימות זהות; פעולה ב-`audit_log`. |
| D7 | Analytics: מחיקת/ניתוק `user_id`; אירועים אגרגטיביים נשארים בלי PII. |
| D8 | ייצוא כסף = snapshots (`platform_percent`, סכומי on-site, דמי ביטול LEGAL אם היו). **אין** Escrow/held/J5. |

---

## 1. ייצוא

### 1.1 תוכן הארכיון

| מקור | נכלל |
|---|---|
| `profiles` | שם תצוגה, טלפון, העדפות |
| Auth email | כן (מהפרופיל/זהות) |
| כתובות | `user_addresses` |
| הזמנות | מטא + סכומים; בלי PAN |
| vouchers | קודים/סטטוסים בבעלות המשתמש |
| ארנק | יתרות ותנועות (agorot) |
| העדפות התראות | כן |
| מתנות | ברכות ששלח/קיבל |
| ביטולים | `cancellation_fee_agorot` אם קיים (LEGAL, לא commission) |

לא נכלל: `service_role`, Cardcom tokens גולמיים, לוגים פנימיים עם IP מלא אם לא הכרחי (או IP truncated בלבד).

### 1.2 זרימה

```text
POST /api/account/data-export (auth)
  → job data_export_requests status=pending
  → worker יוצר JSON מוצפן/חתום לזמן קצר
  → מייל קישור הורדה חד-פעמי (תוקף למשל 24ש)
  → audit_log
```

---

## 2. מחיקה / anonymize

```text
account_deletion_requests
  → אימות (סיסמה/OTP / recent auth)
  → grace period אופציונלי (למשל 7 ימים) עם אפשרות ביטול
  → soft-delete פרופיל: deleted_at, email hashed/anonymized
  → revoke sessions
  → suppressions שיווקיים
  → orders/payments/vouchers: user_id → anonymized tombstone או שמירה עם סימון legal_hold
  → wallet: סגירת חשבון; יתרה לא נמשכת החוצה (מדיניות CASHBACK)
```

אסור למחוק שורות `payments` / `payment_webhook_events` / redemption audit שדרושות ל-chargeback.

---

## 3. SLA ותפעול

| בקשה | יעד |
|---|---|
| ייצוא | ≤ 14 יום עסקים (שאיפה: ≤ 48ש אוטומטי) |
| מחיקה/anonymize | ≤ 30 יום |
| דחייה (legal hold) | נימוק בכתב למשתמש |

---

## 4. Acceptance

- [ ] ייצוא JSON למשתמש מאומת  
- [ ] מחיקה לא מוחקת ledger תשלומים  
- [ ] Sessions מבוטלים  
- [ ] Audit על כל בקשה  
- [ ] קישור הורדה חד-פעמי  
- [ ] אין שדות Escrow בייצוא  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | ייצוא ומחיקת נתוני משתמש (GDPR-aligned) |
| 2026-08-06 | QA: קישור CUSTOMER-SUPPORT; RTL עברית |
| 2026-08-07 | QA re-pass: קישור CONTRADICTIONS (No Escrow + platform_percent) |
| 2026-08-07 | QA audit: D8 ייצוא בלי Escrow; קישור PRICING |
| 2026-08-12 | batch #45/50: רענון BINDING; דמי ביטול LEGAL בייצוא |
