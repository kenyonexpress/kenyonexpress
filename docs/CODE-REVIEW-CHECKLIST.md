# צ'קליסט Code Review לכל PR

רשימת חובה לסוקר ולמחבר לפני אישור merge. קצר בכוונה.

Status: **BINDING (process)** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/TESTING-STRATEGY.md
docs/ARCHITECTURE-TESTING-CICD.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/CONTRADICTIONS.md
docs/DESIGN-CHECKLIST-FINAL.md
```

---

## 0. לפני שמתחילים

- [ ] ה-PR מתאר **למה**, לא רק אילו קבצים
- [ ] אין סודות ב-diff (`.env`, מפתחות, dump)
- [ ] אין Escrow / נאמן / J5 / "held לספק" בטקסט או בקוד חדש
- [ ] CI / בדיקות מקומיות לפי `TESTING-STRATEGY.md`

---

## 1. כסף באגורות

- [ ] סכומים בלוגיקה/DB חדשים הם **integers באגורות**, לא `number` עם נקודה לחישוב
- [ ] המרה ILS ↔ agorot רק דרך מודול money (לא `* 100` מפוזר)
- [ ] אחוזים: `platform_percent` פר מוצר; אין default קשיח בקוד/סכמה
- [ ] קופון: מקדמה באתר לפלטפורמה; יתרה בעסק; בלי שחרור held
- [ ] פיזי: גבייה מלאה באתר + פיצול לפי percent המוצר
- [ ] אם נגע ב-money/commission/split/settlement/redeem: טסטים לפי מדיניות 100% על money + redeem

---

## 2. RLS / אבטחה

- [ ] טבלה חדשה או עמודה רגישה: מדיניות ב-

```
docs/ARCHITECTURE-SECURITY-RLS.md
```

- [ ] אין `service_role` בצד לקוח; אין leak של מפתחות
- [ ] API ספק/אדמין: בדיקת role + ownership (ספק לא רואה ספק אחר)
- [ ] redeem: idempotency / ייחודיות DB נשמרת; אין "retry שיוצר מימוש כפול"
- [ ] לוגים: בלי PII מלא / בלי PAN כרטיס

---

## 3. RTL / UI עברית

- [ ] מחרוזות למשתמש בעברית
- [ ] `dir="rtl"` נשמר ברמה הגבוהה; אין `dir="ltr"` אלא לקוד/URL
- [ ] Tailwind: logical (`ps`/`pe`/`ms`/`me`/`start`/`end`) לא `pl`/`pr`/`ml`/`mr`/`left`/`right`
- [ ] מחירים ותצוגת ₪ עקביים עם העיצוב הקיים
- [ ] מובייל 380: לא שובר header/CTA בלי בדיקה ויזואלית

---

## 4. Visual: `compare.mjs`

חובה כשמשנים layout/CSS/דפי חנות מרכזיים (בית, מוצר, קטגוריה, עגלה, checkout):

Terminal (שרת בנוי על פורט ייעודי):

```bash
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```

- [ ] הורצה לפחות על הדף שנגעו בו (`home` / אחר לפי הסקריפט)
- [ ] צילום או סיכום diff צורף ל-PR או ל-

```
refs/
```

(לא קומיטים של בינאריים גדולים בלי צורך)
- [ ] פערים ידועים מול electro מתועדים; לא "נראה לי בסדר"

אם השינוי docs-only או לוגיקת שרת בלי UI: סמן N/A בתיאור ה-PR.

---

## 5. כרטיס סיכום לסוקר (העתק ל-PR)

```text
[ ] Agorot / no float money
[ ] platform_percent per product / No Escrow
[ ] RLS / roles OK
[ ] RTL + logical CSS
[ ] Tests per TESTING-STRATEGY (money/redeem 100% if touched)
[ ] compare.mjs run or N/A (reason)
```

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | צ'קליסט ראשוני: agorot, RLS, RTL, compare.mjs |
