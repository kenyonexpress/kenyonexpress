# עמודי האתר הישן: רשימה חלקית מאינדקס גוגל

נאסף מחיפוש מאונדקס בלבד (הרשת כאן חוסמת גישה ישירה לאתר). הרשימה המלאה תגיע מהרצת
scripts/baseline-old-site.mjs
שמושך את כל ה-sitemap.

## דף הבית

- https://kenyonexpress.co.il/
  title: "קניון אקספרס"

## קטגוריות

- https://kenyonexpress.co.il/product-category/יופי-בריאות-וטיפוח/
  title: "יופי בריאות וטיפוח - קניון אקספרס"

קטגוריות נוספות שמופיעות באתר לפי תיאורי האינדקס (URL מדויק יגיע מה-sitemap): מסעדות ובתי קפה, טלפונים מחשבים ואביזרים, תינוקות וילדים, צימרים ובתי מלון, ציוד ומזון לבעלי חיים.

## מוצרים / דילים

- https://kenyonexpress.co.il/product/צימר-שוויץ-בצפון/
  title: "צימר שוויץ בצפון"
- https://kenyonexpress.co.il/product/מזקקת-ויסקי/
  title: "מזקקת וויסקי: סיור מופלא במזקקת ויסקי מובילה"
- https://kenyonexpress.co.il/product/restaurants-meat-3/
  title: "מוצר ראשי מאסטר Master Product"
- https://kenyonexpress.co.il/product/restaurants-meat/
  title: "פלטת 1 ק\"ג בשרים זוגית וקינוח במסעדה הכשרה בהרצליה"
- https://kenyonexpress.co.il/product/תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה/
  title: "תספורת לגבר, ילד, סידור זקן בפתח תקווה"
- https://kenyonexpress.co.il/product/pampers-premium-care-diaper-pants-medium/
  title: "מארז מפנק לתינוק"

## הערות ל-redirects

1. ה-URLs של הקטגוריות והמוצרים הם בעברית מקודדת (percent-encoded). מיפוי 301 חייב לשמר את הקידוד המדויק.
2. יש מוצרים עם slug באנגלית (restaurants-meat, pampers-premium-care-diaper-pants-medium) לצד slugs בעברית: שתי הסכמות קיימות באתר הישן.
3. קיים עמוד "מוצר ראשי מאסטר Master Product" שנראה כתבנית פנימית שדלפה לאינדקס: מועמד ל-410 או noindex במקום redirect.
