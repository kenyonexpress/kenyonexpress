# 0005 — ‏RLS על הכל; המדיניות היא האכיפה

**סטטוס:** נאכף.

כל טבלה עם ‏RLS; הכלל המסכם: החלטות אבטחה חיות ב-SQL (מדיניות/טריגר/פונקציה),
לא בקוד המסלול — ‏reviews (154) הוא הדגם: האימות הוא ‏INSERT policy, ואף
קוד לא יכול לעקוף. ‏service_role עוקף RLS בכוונה ולכן כל שימוש בו עובר
שער (‏rbac/requireSupplier*) ו-audit. מלכודת מתועדת: פונקציות DEFINER
שלוקחות uid מהקורא (‏memory: definer-fn-caller-controlled-uid).
