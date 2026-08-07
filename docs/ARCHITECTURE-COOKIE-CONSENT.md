# ARCHITECTURE-COOKIE-CONSENT.md

ארכיטקטורת **הסכמת עוגיות / פרטיות לקוח** (ישראל + שקיפות).

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד.  
Companions: legal, analytics-KPI, notifications V2, account-area.

---

## 0. עקרונות

1. עוגיות הכרחיות (session cart `ke_session_id`, auth Supabase) לא דורשות באנר חוסם.
2. אנליטיקה שאינה הכרחית / מרקטינג: רק אחרי הסכמה אם נדרש לפי מדיניות האתר.
3. קישור קבוע למדיניות פרטיות בפוטר.
4. אין טעינת סקריפטי צד ג׳ כבדים לפני idle/consent.

---

## 1. קטגוריות

| קטגוריה | דוגמאות | ברירת מחדל |
|---|---|---|
| Necessary | `ke_session_id`, auth cookies | תמיד |
| Preferences | UI locale (אם יתווסף) | opt-in או necessary קל |
| Analytics | RUM / non-essential | לפי מדיניות legal |
| Marketing | pixels | opt-in מפורש |

---

## 2. UX

- באנר RTL קצר אם יש non-essential: קבל / רק הכרחיות / הגדרות.
- שמירה ב-`localStorage` + אופציונלי שורת prefs בחשבון.
- לא לחסום גלישה בקטלוג על באנר ענק.

---

## 3. אנליטיקה

- Funnel כסף (`begin_checkout`, `purchase`) בשרת: לא תלוי cookie marketing.
- Client page views: מכבדים opt-out.

---

## 4. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Cookie consent architecture (`arch/docs-queue`) |
