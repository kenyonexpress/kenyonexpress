# ארכיטקטורה: Super App (יכולות Wolt-like)

בנייה פנימית של יכולות דמויות Wolt: גילוי, הזמנה, מעקב, ארנק, התראות. **לא** אינטגרציה ל-Wolt/משלוחים צד ג׳ כפלטפורמה.

Status: **BINDING (vision)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-ROADMAP-V1.1.md
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/ARCHITECTURE-PRODUCT-TYPES.md
docs/ARCHITECTURE-GEO-FEATURE.md
docs/ARCHITECTURE-PWA.md
docs/BUSINESS-MODEL.md
docs/V2-VISION.md
```

מודל כסף: **No Escrow**. קופון = עמוד השדרה של V1. Super App = שכבות על הקטלוג והחשבון הקיימים, לא marketplace משלוחים חיצוני.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| SA1 | Super App = מוצר KenyonExpress עצמו (Web + PWA + אפ עתידי), לא white-label של Wolt. |
| SA2 | אין אינטגרציית API ל-Wolt / שליחים צד ג׳ כתלות ליבה ב-V1.1. |
| SA3 | עמודי תווך פנימיים: גילוי גאו, הזמנה (קופון/פיזי), מעקב מימוש/משלוח, ארנק פנימי, התראות, אזור אישי. |
| SA4 | קופון נשאר המסלול הראשי לשיגור; פיזי/מנוי/סופר-אפ = שכבות לפי ROADMAP. |
| SA5 | חוויית "הכל במקום אחד": בית מותאם מיקום, חיפוש, הזמנות פעילות, QR, תמיכה. |
| SA6 | כסף: אותם כללי MONEY; אין escrow חדש בשם "משלוח". |
| SA7 | בניית יכולת פנימית לפני שותפויות לוגיסטיקה; שותף משלוחים = אופציונלי אחרי V1.1. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| אינטגרציה ל-Wolt כערוץ מכירה/משלוח ליבה | תלות ספק, מותג מדולל, מחוץ למודל קופון. |
| בניית צי שליחים עצמי ב-V1 | עלות/OPS; לא קריטי לקופונים. |
| העתקת UX וולט 1:1 | מותג וזכות יוצרים; לוקחים עקרונות לא מסכים. |
| Marketplace כללי בלי ספק מאומת | סותר onboarding/RBAC. |

---

## 2. סכמת DB

אין DDL חדש. שימוש בטבלאות קיימות/מתוכננות: products, orders, vouchers, carts, wallet_*, notifications, suppliers, geo fields על suppliers/products.

---

## 3. מפת יכולות (פנימי)

| יכולת "Wolt-like" | מימוש פנימי | תלות |
|---|---|---|
| גילוי לפי מיקום | GEO + lat/lng ספק | ARCHITECTURE-GEO |
| הזמנה מהירה | PDP → cart → checkout | CHECKOUT |
| מעקב הזמנה | אזור אישי + סטטוס voucher/משלוח | ACCOUNT / FULFILLMENT |
| תשלום שמור | Cardcom token | CARDCOM |
| ארנק הטבות | cashback פנימי | WALLET-CASHBACK |
| התראות push/SMS | outbox + PWA | NOTIFICATIONS / PWA |
| סופר-אפ מובייל | React Native / מעטפת אפ | MOBILE-SUPERAPP |
| דירוג עסק | עתידי | לא חוסם V1 |

---

## 4. מקרי קצה

| קוד | תוצאה |
|---|---|
| `wolt_api_dependency` | אסור בליבה |
| `geo_denied` | ברירת מחדל כל הארץ |
| `offline_qr` | תצוגה אופליין; redeem דורש רשת |
| `wallet_cashout_request` | נדחה (פנימי בלבד) |

---

## 5. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | מתי אפ native מול PWA בלבד | PWA קודם |
| O2 | שותף משלוחים פיזי | אחרי payout פיזי יציב |
| O3 | הזמנות אוכל בזמן אמת | מחוץ ל-V1.1 |

עודכן: 2026-08-12.

---

## 6. Acceptance

- [ ] אין תלות Wolt  
- [ ] יכולות ממופות לדומיינים קיימים  
- [ ] No Escrow  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | יצירת BINDING vision: Super App פנימי |
