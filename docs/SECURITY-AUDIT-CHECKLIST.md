# SECURITY-AUDIT-CHECKLIST.md
# צ'קליסט ביקורת אבטחה (לפני השקה ואחרי)

רשימת בדיקות חוזרת מול `ARCHITECTURE-SECURITY.md` ו-`ARCHITECTURE-SECURITY-RLS.md`.  
לא מחליפה penetration test חיצוני.

Status: **CHECKLIST** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/CARDCOM-ARCHITECTURE.md
docs/CHECKOUT-OPTIMIZATION.md
docs/DATA-RETENTION-POLICY.md
docs/ARCHITECTURE-DATA-EXPORT-GDPR.md
```

סימון: `[ ]` פתוח · `[x]` עבר · `N/A` לא רלוונטי לגרסה.

---

## 1. זהות והרשאות

- [ ] RLS + FORCE על כל טבלאות כסף / הזמנות / קופונים  
- [ ] אין policy כתיבה ללקוח על ledger / payments  
- [ ] `requireAdminSession` לפני כל `adminClient` mutation  
- [ ] vendor מוגבל ל-`current_user_supplier_id()`  
- [ ] אין העלאת role עצמית מ-client  
- [ ] support: קריאה רחבה, כתיבת כסף רק דרך מסלול מאושר  

---

## 2. כסף ו-Cardcom

- [ ] מקור אמת תשלום: `GetLpResult` / אימות שרת (לא אמון עיוור ב-return URL)  
- [ ] IndicatorUrl / webhook: אימות `?s=` או מנגנון הקיים בקוד; idempotent  
- [ ] אין אחסון PAN / CVV (SAQ-A: Low Profile בלבד)  
- [ ] סכומים integer agorot; אין float בכסף  
- [ ] refund רק admin + audit  
- [ ] `CHECKOUT_ENABLED` kill switch מתועד  

ראה גם: `CHECKOUT-OPTIMIZATION.md`.

---

## 3. קופונים ו-QR

- [ ] חתימת QR keyed (HMAC / Ed25519 לפי SECURITY); לא sha256 פתוח  
- [ ] סריקה idempotent; אין double-redeem  
- [ ] rate limit על `/redeem` ו-scan APIs (fail-closed במסלולי כסף)  
- [ ] לוג `coupon_scan_events` בלי PII מיותר  

ממצא ידוע למעקב: SEC-QR ב-`ARCHITECTURE-SECURITY.md` (חובה לסגור לפני פרוד מלא).

---

## 4. ארנק

- [ ] `fn_wallet_transfer`: EXECUTE לא ל-PUBLIC; service_role בלבד  
- [ ] אין cash-out החוצה  
- [ ] reverse על כשל Cardcom אחרי spend  

ממצא: SEC-WALLET ב-SECURITY.

---

## 5. API, sessions, CSRF

- [ ] mutations מוגנות CSRF לפי המנגנון בפרויקט  
- [ ] cookies session: Secure / HttpOnly / SameSite מתאים  
- [ ] אין service role ב-client bundle  
- [ ] secrets רק ב-Vercel env; לא ב-git  

---

## 6. Rate limiting והונאה

- [ ] Upstash (או יעד מחייב) על login, checkout, redeem  
- [ ] money paths fail-closed כש-RL נפל  
- [ ] velocity rules לפי FRAUD-PREVENTION  
- [ ] chargeback playbook ידוע לתמיכה  

---

## 7. תשתית ופרטיות

- [ ] Headers אבטחה (CSP כפי שאושר, HSTS בפרוד)  
- [ ] Sentry בלי PII / בלי גופי כרטיס  
- [ ] גיבוי/PITR פעילים; תרגול DR לפי BACKUP  
- [ ] ייצוא/מחיקת משתמש לפי DATA-EXPORT  
- [ ] Consent Mode: אין Pixel לפני marketing grant  

---

## 8. אדמין

- [ ] 2FA לחשבונות admin (יעד מחייב ב-SECURITY)  
- [ ] סיבוב סיסמאות / מפתחות Cardcom מתועד  
- [ ] audit log לפעולות כסף  

---

## 9. תדירות

| מתי | היקף |
|---|---|
| לפני soft-open | סעיפים 1–5 + 7 consent |
| אחרי שינוי כסף / QR | 2–4 |
| רבעוני | כל הרשימה + סקירת ממצאים פתוחים |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | צ'קליסט ביקורת אבטחה ראשון מול SECURITY ADR |
