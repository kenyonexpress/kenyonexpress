# 0007 — ‏Cardcom LowProfile על ה-API הישן

**סטטוס:** נאכף. **ראיה מלאה:** ‏memory ‏cardcom-legacy-api-truth + ‏docs/DEPLOYMENT.md.

הקוד מדבר ‏/Interface/*.aspx (הישן). ‏callbacks אינם חתומים — האימות הוא
סוד על ‏IndicatorUrl (‏?s=) בהשוואת זמן-קבוע, עם ‏_PREVIOUS לחלון סבב.
אין idempotency key בפרוטוקול → ‏retry הוא ‏opt-in פר-endpoint: קריאות
קריאה כן, ‏Charge/Refund/BillGold לעולם לא. מסמכי חשבונאות מונפקים על ידי
Cardcom (קבלה 4 / זיכוי 3), לא על ידינו.
