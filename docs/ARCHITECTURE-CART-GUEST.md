# ארכיטקטורה: עגלת אורח (Guest Cart)

Guest token, מיזוג אחרי login, ומדיניות עוגיות. מחירים לא נקבעים בעגלת האורח.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #4/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/GUEST-VS-MEMBER-STRATEGY.md
docs/ARCHITECTURE-ACCOUNT-IDENTITY.md
docs/ARCHITECTURE-TRUST-SAFETY.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. עגלה לא מחזיקה עמלה/escrow; פיצול כסף רק ב-`beginCheckout` snapshots.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| GC1 | גלישה והוספה לעגלה מותרים בלי login. |
| GC2 | לחיצת תשלום / קופון: חשבון חובה לפני Low Profile. |
| GC3 | מזהה אורח = cookie `ke_session_id` (httpOnly). |
| GC4 | אחרי login: `mergeGuestCart(userId, sessionId)` מאחד כמויות ומוחק עגלת אורח. |
| GC5 | מחיר ותקינות תמיד מהמוצר החי ב-validate/checkout; לא ממחיר ששמור אצל האורח. |
| GC6 | מיזוג לא מקבל `userId` זר מהלקוח; רק מה-session המאומת. |
| GC7 | כמות מקסימלית אחרי מיזוג: 99 ליחידת מפתח. |
| GC8 | כשל מיזוג לא חוסם יצירת session משתמש; עגלת המשתמש הקיימת נשארת. |

---

## 1. Guest token

| רכיב | ערך |
|---|---|
| Cookie name | `ke_session_id` |
| ערך | UUID (או `{uuid}.{sig}` חתום מ-proxy; הפרסור לוקח את ה-UUID) |
| Flags | `httpOnly`, `sameSite=lax`, `path=/`, `maxAge=30d` |
| יצירה | `ensureGuestSessionId()` בשרת כשחסר |
| אחסון עגלה | `carts.session_id` עם `profile_id IS NULL` |

אסור: לשמור PAN, כתובת מלאה, או מחיר סופי ב-cookie. ה-cookie הוא מזהה בלבד.

ניקוי: אחרי מיזוג מוצלח אפשר `clearGuestSessionCookie()`; עגלת האורח נמחקת מה-DB תמיד במיזוג.

---

## 2. מבנה עגלה

```text
carts
  profile_id  (משתמש) XOR session_id (אורח)
  items jsonb[]  { product_id, variant_id?, quantity, … }
  expires_at     (אורח; חידוש בפעילות)
```

| כלל | פירוט |
|---|---|
| מפתח שורה | product (+ variant אם יש) |
| כמות | integer; cap 99 |
| מחיר בעגלה | תצוגה בלבד מהמוצר החי ב-`resolveCartView` |
| מלאי | validate ב-checkout; בעגלה clamp/drop לא חוסם browse |

---

## 3. מיזוג אחרי login

טריגר: OAuth/OTP callback / פעולת שרת אחרי `auth.getUser()` הצליח.

```text
mergeGuestCart(userId, sessionId)
  → טען guest cart (session_id, profile_id null)
  → טען user cart (profile_id)
  → אם אין פריטי אורח → return
  → union לפי itemKey:
       אותה שורה → quantity = min(99, user + guest)
       שורה חדשה → הוסף
  → UPDATE/INSERT user cart
  → DELETE guest cart
```

| תכונה | התנהגות |
|---|---|
| Idempotency | אחרי מחיקת עגלת אורח, replay = no-op |
| סדר עדיפות | כמויות מצטברות; אין "אורח דורס משתמש" |
| מחיר | לא מועתק מהאורח; יחושב ב-checkout מהמוצר |
| אבטחה | `sessionId` מ-cookie של המשתמש הנוכחי בלבד; לא פרמטר פתוח מ-client body בלי אימות |

אין מיזוג מלקוח עם `userId` של משתמש אחר (IDOR).

---

## 4. Cookie policy (תמצית מוצר)

| נושא | מדיניות |
|---|---|
| הכרחי לתפקוד | `ke_session_id` = עגלה; session auth נפרד (Supabase) |
| אנליטיקס | רק אחרי consent (Consent Mode); לא מעורבב עם guest cart id כ-PII |
| משך | 30 יום לעגלת אורח; מתחדש בפעילות |
| Secure | בפרוד: HTTPS; להעדיף `Secure` כשהאתר תמיד TLS |
| שיתוף צד ג' | מזהה העגלה לא נשלח ל-Cardcom/Meta כמזהה משתמש |

פירוט משפטי: `ARCHITECTURE-LEGAL-COMPLIANCE.md` / באנר consent.

---

## 5. מסלול עד תשלום

```text
guest browse → addToCart (session cookie)
  → login / OAuth
  → mergeGuestCart
  → validateCart
  → beginCheckout (auth חובה)
  → Cardcom Low Profile
```

אורח שמגיע ל-checkout בלי login: `UNAUTHENTICATED`; העגלה נשמרת תחת ה-session עד מיזוג.

---

## 6. כשלים

| קוד | סימפטום | פעולה |
|---|---|---|
| `cookie_missing` | אין session | יצירת UUID חדש בשרת |
| `cookie_invalid` | לא UUID | התעלמות + יצירה מחדש |
| `merge_empty` | אין עגלת אורח | no-op |
| `merge_failed` | שגיאת DB | לוג; לא שוברים login; עגלת user נשארת |
| `qty_cap` | סכום > 99 | clamp ל-99 |
| `stale_guest` | expires_at עבר | עגלה ריקה / נמחקת ב-cleanup |

---

## 7. Acceptance

- [ ] Cookie httpOnly + שם `ke_session_id` מתועד  
- [ ] מיזוג כמויות עם cap 99 ומחיקת עגלת אורח  
- [ ] מחיר לא ננעל בעגלת אורח  
- [ ] תשלום דורש auth  
- [ ] אין IDOR על userId במיזוג  
- [ ] מדיניות cookie/consent מופרדת מאנליטיקס  
- [ ] No Escrow (עגלה לא מחזיקה כסף ספק)  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING ראשון (batch-2 #4): token, merge, cookie policy |
