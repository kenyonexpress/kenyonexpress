# 0009 — שכבת ה-cache היא ‏use cache של Next + תג אחד

**סטטוס:** נאכף.

קריאות הקטלוג רצות בתוך ‏'use cache' עם ‏cacheTag(CATALOGUE_TAG); כל
מוטציית אדמין קוראת ‏updateTag. אין Redis-cache שני (נדחה ב-STEP 33) —
שני מנגנוני פינוי מתבדרים. העץ הקטלוגי נשמר נטול-cookies על ידי
‏catalogue-render-path.test; מה שתלוי-סשן זורם ב-Suspense או נשאל
מהלקוח דרך action.
