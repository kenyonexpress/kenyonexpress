# ארכיטקטורה: ייצוא ומחיקת נתונים (GDPR / פרטיות)

ייצוא ומחיקת נתוני משתמש (זכויות נושא מידע; יישור לדין הישראלי + עקרונות GDPR כשיחולו).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #45/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף בייצוא: snapshots כפי שנשמרו. **אין** שדות Escrow/held/J5. `platform_percent` כפי שצולם ב-`order_items`; אין default במוצר החי.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
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

---

## 0. החלטה (D1 עד D8)

| # | הכרעה |
|---|---|
| D1 | המשתמש יכול לבקש **ייצוא** ו**מחיקה/הסתרה** מאזור אישי או דרך תמיכה. |
| D2 | ייצוא = ארכיון מכונה (JSON) של נתונים אישיים בבעלות המשתמש; בלי סודות מערכת. |
| D3 | מחיקה מלאה לא מוחקת ראיות כספיות שחובה לשמור (הזמנות, תשלומים, vouchers, audit). |
| D4 | על נתונים כספיים: anonymize / detach מזהה אישי במקום hard-delete כשנדרש שימור. |
| D5 | בקשות דרך טבלה + SLA יעד 30 יום (יעד פנימי: 14 יום עסקים). |
| D6 | Admin/support מבצעים אחרי אימות זהות; פעולה ב-`audit_log`. |
| D7 | Analytics: מחיקת/ניתוק `user_id`; אירועים אגרגטיביים נשארים בלי PII. |
| D8 | ייצוא כסף = snapshots (`platform_percent`, סכומי on-site באגורות, דמי ביטול LEGAL אם היו). **אין** Escrow/held/J5. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| hard-delete מלא של `payments` / `orders` | D3/D4; חובת שימור כספי ו-chargeback |
| ייצוא כולל PAN / Cardcom tokens | PCI; D2 |
| מחיקה מיידית בלי grace period | D1; 7 ימים לביטול בטעות |
| ייצוא CSV בלבד (בלי JSON מובנה) | D2; מכונה קוראת JSON |
| anonymize wallet יתרה ל-0 בלי מדיניות | CASHBACK; יתרה לא נמשכת החוצה |
| self-service מחיקה בלי OTP / recent auth | D6; זיהוי חובה |
| שמירת IP מלא בייצוא | D2; truncated או הוצאה |
| שדות Escrow/held בייצוא "לשקיפות" | D8; אין such fields במודל |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.** טבלאות בקשות ויעד:

```text
data_export_requests:
  id, user_id, status (pending|processing|ready|failed|expired),
  requested_at, completed_at?, download_token_hash?, expires_at?

account_deletion_requests:
  id, user_id, status (pending|grace|processing|completed|cancelled),
  requested_at, grace_ends_at?, completed_at?, reason?

audit_log (append-only):
  action, actor_id, target_user_id?, metadata, created_at
```

נתונים בייצוא (קריאה בלבד):

| מקור | נכלל |
|---|---|
| `profiles` | שם תצוגה, טלפון, העדפות |
| Auth email | כן (מהפרופיל/זהות) |
| כתובות | `user_addresses` |
| הזמנות | מטא + סכומי agorot; בלי PAN |
| `order_items` | snapshot `platform_percent`, charged, fee |
| vouchers | קודים/סטטוסים בבעלות המשתמש |
| ארנק | יתרות ותנועות (agorot) |
| העדפות התראות | כן |
| מתנות | ברכות ששלח/קיבל |
| ביטולים | `cancellation_fee_agorot` אם קיים (LEGAL) |

לא נכלל: `service_role`, Cardcom tokens גולמיים, לוגים פנימיים עם IP מלא (או truncated בלבד).

אחרי מחיקה/anonymize:

- `profiles.deleted_at`, email hashed/anonymized
- `orders`/`payments`/`vouchers`: `user_id` → tombstone / legal_hold flag
- sessions revoked; marketing suppressions

---

## 3. ייצוא

### 3.1 זרימה

```text
POST /api/account/data-export (auth)
  → job data_export_requests status=pending
  → worker יוצר JSON מוצפן/חתום לזמן קצר
  → מייל קישור הורדה חד-פעמי (תוקף למשל 24ש)
  → audit_log
```

### 3.2 תוכן כסף ב-JSON

| שדה | כלל |
|---|---|
| `platform_percent` | snapshot מ-`order_items`; לא מהמוצר החי |
| סכומים | agorot integer + שדה תצוגה ₪ אופציונלי |
| קופון | coupon_price, face, balance at business |
| Escrow/held | **לא קיים** בייצוא |

---

## 4. מחיקה / anonymize

```text
account_deletion_requests
  → אימות (OTP / recent auth)
  → grace period (למשל 7 ימים) עם אפשרות ביטול
  → soft-delete פרופיל
  → revoke sessions
  → suppressions שיווקיים
  → orders/payments/vouchers: anonymize user_id
  → wallet: סגירת חשבון; יתרה לא נמשכת החוצה (CASHBACK)
```

אסור למחוק שורות `payments` / `payment_webhook_events` / redemption audit שדרושות ל-chargeback.

---

## 5. SLA ותפעול

| בקשה | יעד |
|---|---|
| ייצוא | ≤ 14 יום עסקים (שאיפה: ≤ 48ש אוטומטי) |
| מחיקה/anonymize | ≤ 30 יום |
| דחייה (legal hold) | נימוק בכתב למשתמש |

---

## 6. מקרי קצה

| מקרה | תרחיש | התנהגות | הערה |
|---|---|---|---|
| DGE1 | ייצוא בזמן order pending | כולל snapshot עד רגע הבקשה | לא מבטל pending |
| DGE2 | מחיקה עם voucher `issued` פעיל | legal hold / anonymize עם voucher | REFUNDS |
| DGE3 | מחיקה עם chargeback פתוח | דחייה + נימוק | D3 |
| DGE4 | שני ייצואים מקבילים | dedupe / queue | idempotency |
| DGE5 | קישור הורדה פג (24ש) | regenerate job | token חד-פעמי |
| DGE6 | impersonation attempt | recent auth + audit | D6 |
| DGE7 | wallet יתרה > 0 במחיקה | סגירה; לא payout החוצה | CASHBACK |
| DGE8 | supplier user (לא לקוח) | מסלול נפרד / admin | RBAC |
| DGE9 | GDPR + תמיכה פתוחה | merge tickets; המשך anonymize | CUSTOMER-SUPPORT |
| DGE10 | ייצוא כולל `platform_percent` null (legacy) | snapshot כפי שמור; flag legacy | C1 forward only |
| DGE11 | replay download token | one-time use | security |
| DGE12 | worker failure mid-export | status=failed; retry | audit |

---

## 7. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | `/api/account/data-export` קיים בקוד או backlog | ACCOUNT |
| O2 | grace period: 7 vs 14 ימים | LEGAL |
| O3 | פורмат JSON schema versioned | D2 |
| O4 | tombstone `user_id` format אחיד | anonymize |
| O5 | legal_hold flag: enum vs boolean | D4 |
| O6 | אוטומציה 48ש vs ידני admin | ops capacity |

עודכן: 2026-08-12.

---

## 8. Acceptance

- [ ] ייצוא JSON למשתמש מאומת  
- [ ] מחיקה לא מוחקת ledger תשלומים  
- [ ] Sessions מבוטלים  
- [ ] Audit על כל בקשה  
- [ ] קישור הורדה חד-פעמי  
- [ ] אין שדות Escrow בייצוא  
- [ ] החלטה + חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | ייצוא ומחיקת נתוני משתמש (GDPR-aligned) |
| 2026-08-07 | QA: D8 ייצוא בלי Escrow; קישור PRICING |
| 2026-08-12 | batch #45/50: רענון BINDING |
| 2026-08-12 | batch-2 pass-3: DOCS-TEMPLATE-BINDING (חלופות, מקרי קצה, פתוחות) |
