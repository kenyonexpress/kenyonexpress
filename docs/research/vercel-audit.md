# Vercel audit: kenyonexpress

ניסיון גישה 2026-08-06 מהסביבה המרוחקת.

## מה נבדק בפועל

- vercel.com וגם api.vercel.com חסומים על ידי מדיניות הרשת של הסביבה (CONNECT 403).
- אין תיקיית .vercel עם project.json ב-repo (הפרויקט לא linked בעותק הזה).
- אין VERCEL_TOKEN בסביבה.

כלומר: אי אפשר לענות מכאן על אף אחת מארבע השאלות עם נתונים אמיתיים. במקום לנחש, ההרצה נעשית מהמחשב בפקודות הבאות.

## מה כן ידוע מה-repo

- vercel.json קיים בשורש הפרויקט (יש קונפיגורציית deploy).
- feat/supplier-portal מתועד כ-"production build green, ready for Vercel" (2026-08-03).
- .vercelignore קיים בקו הישן.

## ההרצה מהמחשב

Terminal (בתיקיית הפרויקט, פעם אחת: npm i -g vercel && vercel login):

```bash
vercel link
vercel ls --yes                | tee ~/Downloads/vercel-deployments.txt
vercel env ls                  | tee ~/Downloads/vercel-env-names.txt
vercel domains ls              | tee ~/Downloads/vercel-domains.txt
vercel inspect --logs $(vercel ls --prod --yes | head -2 | tail -1) 2>&1 | head -50
```

מיפוי לשאלות:

| שאלה | פקודה |
|---|---|
| 1. Production deployment אחרון ומתי | vercel ls (השורה עם prod) |
| 2. שמות Environment Variables | vercel env ls (מציג שמות וסביבות, לא ערכים) |
| 3. דומיינים מחוברים | vercel domains ls |
| 4. deployments שנכשלו השבוע | vercel ls (עמודת state = ERROR) |

לחלופין בדפדפן: vercel.com > הפרויקט > Deployments / Settings > Environment Variables / Domains.

תדביק את הפלט כאן ואני אהפוך אותו ל-vercel-audit.md מלא.
