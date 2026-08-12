[חוקי-המשך]
קרא קודם STATE.md. מצא "המשך מ:" ודלג על שלבים שהושלמו.
עבוד ברצף בלי לעצור, אשר הכל אוטומטית.
עצור רק אם: apply_migration על פרודקשן, מחיקת ענפים עם -D, db push, נגיעה בתיקיית docs/ (שייכת לסוכן Cursor).

[תור סגור]
(1) גבה רשימת 30 הענפים ה-merged לקובץ branches-backup.txt, ואז מחק אותם מקומית עם git branch -d בלבד.
(2) עדכן CLAUDE.md: ענף העבודה הקבוע הוא main, לא phase5/homepage.
(3) הוסף refs/*.png ל-gitignore וסגור את הנושא.
(4) בדוק finalize.ts:312 מול ה-enum ב-DB דרך MCP list_tables. אם חסר: הכן קובץ מיגרציה + תקן קוד, אל תחיל על פרודקשן, תעד ב-STATE.md מה מוכן להחלה.
(5) feat/product-type: השלם את מודל שני סוגי המוצרים לפי claude/BUSINESS-MODEL-RULES.md: קופון (תשלום חלקי באתר, יתרה אצל ספק, Escrow) ופיזי (פיצול מיידי). כל האחוזים דינמיים פר מוצר מהאדמין. פרטי ספק בכל דף מוצר. כולל טסטים מלאים.
(6) pixel parity: הרץ scripts/compare.mjs מול refs/ke_live_380.png ו-768. תקן פערי header/hero. כל תיקון = commit נפרד.
(7) אחרי כל שלב: pnpm type-check + טסטים. אדום = תקן לפני שממשיכים.
(8) אחרי כל שלב: commit + push + עדכן STATE.md עם "המשך מ: שלב X".
(9) כשהכל הושלם: כתוב את המילה AUTOPILOT-DONE בשורה הראשונה של STATE.md + צור tag + דוח סיום ב-STATE.md.
