# ארכיטקטורה: הסכמת עוגיות (Cookie Consent)

קטגוריות עוגיות, באנר RTL, והפרדה מ-guest cart / אנליטיקס כסף.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-CART-GUEST.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-TRUST-SAFETY.md
```

מודל כסף: **No Escrow**. עוגיות לא מחזיקות סכומי כסף.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| CC1 | הכרחיות (`ke_session_id`, auth Supabase) תמיד; לא דורשות באנר חוסם. |
| CC2 | Analytics שאינו הכרחי + Marketing: רק אחרי opt-in מפורש. |
| CC3 | Funnel כסף בשרת (`begin_checkout`, `purchase`) לא תלוי cookie שיווקי. |
| CC4 | באנר RTL קצר; לא חוסם גלישת קטלוג. |
| CC5 | קישור קבוע למדיניות פרטיות בפוטר. |
| CC6 | אין טעינת פיקסלים כבדים לפני consent/idle. |
| CC7 | `ke_session_id` לא נשלח ל-Meta/Cardcom כ-`external_id`. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| חסימת כל האתר עד לחיצה | פוגע ב-SEO ובשיעור נטישה. |
| דרישת consent ל-`ke_session_id` | שובר עגלה; הכרחי לתפקוד. |
| טעינת כל הפיקסלים כברירת מחדל | סותר פרטיות/שקיפות. |
| ערבוב guest cart id באנליטיקס שיווק בלי הסכמה | PII מיותר. |

---

## 2. סכמת DB

| רכיב | תפקיד |
|---|---|
| `consent_events` (אם קיים) | audit בחירות |
| localStorage prefs | UX מיידי |
| prefs בחשבון (אופציונלי) | סנכרון בין מכשירים |

אין DDL במסמך זה.

---

## 3. קטגוריות

| קטגוריה | דוגמאות | ברירת מחדל |
|---|---|---|
| Necessary | `ke_session_id`, auth | תמיד |
| Preferences | העדפות UI קלות | לפי LEGAL |
| Analytics | RUM לא-הכרחי | opt-in |
| Marketing | pixels | opt-in מפורש |

---

## 4. מקרי קצה

| קוד | תוצאה |
|---|---|
| `consent_denied_marketing` | אין pixels; funnel שרת חי |
| `storage_blocked` | עגלה ב-cookie httpOnly עדיין עובדת |
| `banner_cls` | באנר לא דוחף layout של hero מעבר לתקציב |

---

## 5. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | חובת באנר לפי ייעוץ עו״ד ישראלי | הכרחיות בלי באנר; שיווק עם opt-in |
| O2 | שמירת consent ב-DB ללקוח מחובר | localStorage מספיק ל-MVP |

עודכן: 2026-08-12.

---

## 6. Acceptance

- [ ] הכרחי מול שיווק מופרדים  
- [ ] Funnel כסף בשרת  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | שלד ראשון |
| 2026-08-12 | BINDING מלא לפי תבנית על arch/docs-batch-2 |
