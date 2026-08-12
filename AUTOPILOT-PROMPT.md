[חוקי-המשך]
קרא קודם STATE.md. מצא "המשך מ:" ודלג על שלבים שהושלמו.
עבוד ברצף בלי לעצור, אשר הכל אוטומטית.
עצור רק אם: apply_migration על פרודקשן, מחיקת ענפים עם -D, db push, נגיעה בתיקיית docs/ (שייכת לסוכן Cursor).

הגלים רצים בסדר שהם מופיעים בקובץ הזה: תור סגור (1-9), אחריו DB HARDENING (10-15), אחריו COUPON STOREFRONT (16-21), ואחריו (22).
המילה AUTOPILOT-DONE בשורה הראשונה של STATE.md היא תנאי העצירה של autopilot.sh. אל תכתוב אותה בסוף גל. רק ב-(22), כשכל הגלים סגורים.

[תור סגור]
(1) גבה רשימת 30 הענפים ה-merged לקובץ branches-backup.txt, ואז מחק אותם מקומית עם git branch -d בלבד.
(2) עדכן CLAUDE.md: ענף העבודה הקבוע הוא main, לא phase5/homepage.
(3) הוסף refs/*.png ל-gitignore וסגור את הנושא.
(4) בדוק finalize.ts:312 מול ה-enum ב-DB דרך MCP list_tables. אם חסר: הכן קובץ מיגרציה + תקן קוד, אל תחיל על פרודקשן, תעד ב-STATE.md מה מוכן להחלה.
(5) feat/product-type: השלם את מודל שני סוגי המוצרים לפי docs/ADMIN-ARCHITECTURE.md §0: קופון (מחיר קופון אבסולוטי באתר, יתרה אצל הספק, פיצול המקדמה לפי platform_percent, בלי Escrow) ופיזי (פיצול מיידי). כל האחוזים דינמיים פר מוצר מהאדמין. פרטי ספק בכל דף מוצר. כולל טסטים מלאים.
(6) pixel parity: הרץ scripts/compare.mjs מול refs/ke_live_380.png ו-768. תקן פערי header/hero. כל תיקון = commit נפרד.
(7) אחרי כל שלב: pnpm type-check + טסטים. אדום = תקן לפני שממשיכים.
(8) אחרי כל שלב: commit + push + עדכן STATE.md עם "המשך מ: שלב X".
(9) סגירת גל 1 בלבד: tag + דוח סיום ב-STATE.md. בוצע, tag autopilot-2026-08-12. אל תכתוב כאן AUTOPILOT-DONE, ראה (22).

[גל DB HARDENING - אושר על ידי אופיר 12.08, apply_migration דרך MCP מותר לשלבים האלה בלבד]
(10) הרץ get_advisors דרך MCP (security + performance). תקן את כל 40 ה-auth_rls_initplan: עטוף כל auth.uid() ו-auth.jwt() ב-policies בתוך (select ...). מיגרציה אחת מרוכזת, apply_migration דרך MCP.
(11) אחד את 72 ה-multiple_permissive_policies: policy אחת פר טבלה/פעולה/תפקיד עם OR. אל תרחיב הרשאות, רק אחד. מיגרציה שנייה.
(12) מחק את 4 ה-duplicate_index (carts, products x2, vouchers) והוסף אינדקסים ל-35 ה-FK הלא מאונדקסים. מיגרציה שלישית.
(13) בדוק בקוד אם is_admin, is_supplier_member, check_rate_limit, fn_record_recent_search נקראות מ-anon בפועל. מה שלא נקרא מ-anon: REVOKE EXECUTE FROM anon. מיגרציה רביעית. אל תיגע בהרשאות authenticated.
(14) צור דוח refs/unused-indexes-report.md על 90 ה-unused_index עם המלצה פר אינדקס. אל תמחק אף אחד.
(15) אחרי כל מיגרציה: הרץ get_advisors שוב וודא שהמונה ירד, ואז pnpm type-check + טסטים. עדכן STATE.md.

[גל COUPON STOREFRONT - המהות, אחרי גל DB HARDENING]
(16) קרא docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md ו-docs/ADMIN-ARCHITECTURE.md §0 לפני הכל. §0 הוא המסמך המחייב למודל הכסף. הקובץ claude/BUSINESS-MODEL-RULES.md לא קיים בריפו, אל תחפש אותו.
(17) דף מוצר קופון ללקוח: מחיר קופון אבסולוטי מהאדמין, מחיר מלא אצל הספק, פרטי ספק מלאים בדף, RTL, צהוב KenyonExpress, מבנה לפי electro home-v7. כולל טסטים.
(18) זרימת רכישה: checkout עם Cardcom לקופון בלבד (coupon_price_ils, המחיר האבסולוטי), יצירת voucher בסטטוס issued, עמוד הצלחה עם הקוד, שליחת מייל. פיצול המקדמה לפי platform_percent מיד, בלי Escrow, לפי ADMIN §0 והחלטה A1 ב-STATE.md. היתרה נשארת אצל הספק ואינה עוברת באתר. כולל טסטים.
(19) מסך ספק Read-only: רשימת vouchers שלו, סטטוסים, וזרימת redeem_voucher הקיימת ב-DB מחוברת ל-UI סריקה. כולל טסטים.
(20) חיבור מקצה לקצה: קנייה בדמו מקומי עד voucher redeemed. צילומי מסך ל-refs/coupon-flow/.
(21) אחרי כל שלב: pnpm type-check + טסטים + commit + push + עדכון STATE.md עם "המשך מ: שלב X".

[סגירה סופית]
(22) רק כששלבים 10-21 כולם סגורים: כתוב את המילה AUTOPILOT-DONE בשורה הראשונה של STATE.md, צור tag, וכתוב דוח סיום ב-STATE.md.
