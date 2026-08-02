# PROGRESS-CHECKOUT.md

יומן עבודה: תשתית עגלה + צ'קאאוט + הזמנות. branch: `phase6/checkout`, worktree: `kenyon-checkout`.

## 2026-07-21

### 00. נקודת פתיחה
- ה-worktree הוסב לענף חדש `phase6/checkout` (הענף הקודם `phase6/checkout-foundation` נשמר, שניהם על `cf1101b`).
- קיים WIP לא מנוהל (untracked) מסשן קודם, נסקר במלואו:
  - `src/lib/payments/` — הפשטת PaymentProvider מלאה: `types.ts` (ממשק createLowProfile / chargeWithToken / verifyLowProfile), `cardcom.ts`, `mock-cardcom.ts`, `hmac.ts`, `env.ts`, `index.ts` (getPaymentProvider עם CARDCOM_USE_MOCK).
  - `src/lib/commerce/` — `money.ts` (טיפוס Agorot ממותג, basis points, עיגול), `commission.ts` (חישוב עמלה פר שורה) + בדיקות.
  - `src/lib/checkout/` — `split.ts` (תצוגת פיצול wire), `finalize.ts` (מתכנן side effects), `coupon-issue.ts` (קוד 8 ספרות + payload ל-QR), `validate-cart.ts`.
  - `src/lib/validations/checkout.ts` — סכמות zod ל-beginCheckout.
  - `src/server/domain/checkout/memory-store.ts` — חנות זיכרון להזמנות/תשלומים/קופונים.
- נקרא `ARCHITECTURE-CHECKOUT-PAYMENT.md` (664 שורות): Cardcom Low Profile, webhook HMAC + אימות חוזר מול API, `checkout_finalize` אידמפוטנטי, הפניות קוסמטיות בלבד.

### 01. הכרעות מודל (הנחיית המשימה גוברת על מסמכים ישנים)
- מכונת מצבים להזמנה: `pending, paid, split_executed, escrow_held, escrow_released, redeemed, refunded, cancelled` (לפי הנחיית המשימה; מחליפה את ה-enum הישן במסמך הארכיטקטורה).
- עמלת פלטפורמה: `platform_percent` פר-מוצר, **שדה חובה בלי ברירת מחדל** (docs/CONTRADICTIONS.md C1/C2), מחושבת על הסכום שעובר דרך הפלטפורמה בלבד (המקדמה שנגבתה באתר).
- קופון: הלקוח משלם באתר את מחיר הקופון שנקבע פר-מוצר. הסכום נרשם כ-held **פנימי ב-ledger שלנו בלבד** (אין Escrow חיצוני ואין J5). במימוש אצל הספק: ה-held משוחרר לספק בניכוי העמלה. היתרה משולמת ישירות בעסק. פקיעה בלי מימוש: המקדמה נזקפת כקרדיט לארנק הדיגיטלי של הלקוח.
- פיזי: הלקוח משלם 100% באתר. פיצול מיידי (`split_executed`): ספק מקבל face פחות `platform_percent` פר-מוצר.
- עגלה מעורבת: נתמכת. מצב settlement מנוהל פר שורת הזמנה; סטטוס ההזמנה נגזר מהשורות.

### 02. תכנית עבודה
1. דומיין הזמנות: `src/server/domain/orders/` — state machine, escrow, split, redemption + בדיקות Vitest.
2. עדכון `commission.ts` למודל escrow (upfront + עמלה) + עדכון בדיקות.
3. עגלה: שרת (Supabase) + אורח (cookie) + מיזוג, Zustand, אופטימי; דף עגלה + מגירת מיני-עגלה.
4. צ'קאאוט רב-שלבי RTL: פרטים, משלוח/מימוש, תשלום.
5. מימוש שובר: קוד קצר + QR, endpoint אימות לספק, אכיפת שימוש חד-פעמי, תפוגה.
6. דפי הזמנות: היסטוריה + פירוט עם קודי שובר ופרטי ספק בכל שורה.
