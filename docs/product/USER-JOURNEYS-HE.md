# מסעות משתמש (12)

Status: DRAFT · docs only  
Screens match live IA: `/`, `/category/{slug}`, `/product/{slug}`, `/cart`, `/checkout`, `/checkout/return`, `/account/*`, `/scan`.  
Money: agorot. Coupon: pay on-site coupon price; remainder at till after QR. No escrow. Wallet is site credit only.

Analytics (live names in `src/lib/analytics/events.ts` plus server):

| Event | Where |
|---|---|
| `page_view` | client, אחרי הסכמת באנר מדידה |
| `view_category` | client, `category_id` |
| `view_product` | client, `product_id` |
| `add_to_cart` / `remove_from_cart` | client |
| `checkout_step` | client: `identity` `address` `payment_redirect` |
| `begin_checkout` | **server only** מ-`beginCheckout` |
| `purchase` | **server** ב-finalize, idempotent על `order_id` (לא אירוע דפדפן בטקסונומיית הלקוח) |

מיילים: Resend דרך `notification_outbox` + cron `notifications`. אם cron דומם, המסך באזור האישי עדיין האמת.

---

## 1. גולש אנונימי מוצא קופון

מטרה: מהבית ל-PDP קופון בלי חשבון.

| # | מסך | מצב תקין | שגיאה / מבוי סתום | מייל | Analytics |
|---|---|---|---|---|---|
| 1 | `/` | RTL, הירו, גריד דילים, וואטסאפ צף | 5xx / קטלוג ריק בגלל URL סופאבייס כבוי | אין | `page_view` |
| 2 | באנר עוגיות | קבל / רק הכרחיות | באנר חוזר אחרי bump של `CONSENT_WORDING_VERSION` | אין | בלי מדידה צד-ג׳ עד `granted` |
| 3 | `/category/restaurants-cafes` | 2/6 עמודות לפי רוחב, מיון | קטגוריה ריקה: noindex / לא 404 שבור | אין | `view_category` |
| 4 | `/product/{slug}` | שלושה מחירים, בלוק ספק, משפט יתרה | `paused` / לא `coupon` בשיגור | אין | `view_product` |
| 5 | CTA הוספה לסל | כפתור צהוב 44px | סירוב מלאי / סוג לא למכירה | אין | `add_to_cart` |

יציאה מוצלחת: שורת סל עם מחיר קופון באתר, לא שווי דיל.

---

## 2. התחברות Google והשלמת זהות בקופה

מטרה: מזהה לפני סליקה.

| # | מסך | מצב תקין | שגיאה | מייל | Analytics |
|---|---|---|---|---|---|
| 1 | `/cart` | שורות, יתרות נפרדות מ"לתשלום עכשיו" | שורה לא זמינה חוסמת checkout | אין | `page_view` |
| 2 | `/checkout` זהות | Google / סשן קיים | OAuth נכשל, חשבון חסום | אין | `checkout_step` `identity` |
| 3 | כתובת | פיזי בלבד; קופון יכול לדלג | כתובת חובה בפיזי | אין | `checkout_step` `address` |
| 4 | ארנק (אם יתרה) | חלק ארנק + חלק כרטיס | יתרה 0 מוסתר | אין | props ב-`begin_checkout` |

יציאה: משתמש עם `user.id`, מוכן ל-`begin_checkout`.

---

## 3. תשלום קופון עד שובר ביד

מטרה: `paid_at` + שובר `issued`.

| # | מסך | מצב תקין | שגיאה | מייל | Analytics |
|---|---|---|---|---|---|
| 1 | `/checkout` תשלום | סכום = מחיר קופון (+ארנק) | `CHECKOUT_ENABLED` לא `true` בייצור | אין | `begin_checkout` (server) |
| 2 | הפניה Cardcom | דף סולק, בלי PAN אצלנו | סגירת חלון, סירוב אשראי | אין | `checkout_step` `payment_redirect` |
| 3 | `/checkout/return` | ספינר עד webhook/finalize | חזרה מוקדמת: "ממתינים לאישור", לא קוד שובר | אין עדיין | אין `purchase` עד finalize |
| 4 | הצלחה | מספר הזמנה, בלי קוד אם עדיין לא `paid_at` | חיוב בלי שובר: פלייבוק תשלום | `order_paid` או `voucher_issued` (אחד, לא שניהם בשיגור) | `purchase` server |
| 5 | `/account/coupons` ו-`/coupon/{id}` | QR + **קוד טקסט** | מייל בלי קוד: עדיין כאן | אותו שובר; QR אסור כ-`data:` URI יחיד | `page_view` |

יציאה: שובר `issued`, קוד 10 תווים, HMAC `KEV1`.

---

## 4. מימוש בבית העסק

מטרה: סריקה ירוקה, יתרה בקופה, שובר terminal.

| # | מסך | מצב תקין | שגיאה | מייל | Analytics |
|---|---|---|---|---|---|
| 1 | לקוח: `/coupon/{id}` | QR + קוד | צילום מייל מטושטש | אין | `page_view` |
| 2 | ספק: `/scan` input | מצלמה או הקלדה | אין רשת: אין תור אופליין ב-HEAD | אין | אין אירוע כסף בדפדפן |
| 3 | lookup (confirm) | מציג יתרה **לפני** שריפה | כבר מומש / פג / עסק אחר → מסך אדום, בלי כתיבה | אין | אין |
| 4 | redeem POST | idempotency_key, `UPDATE` מותנה | כפילות לחיצה: `replayed` לא מימוש שני | `voucher_redeemed` ללקוח | נגזר מ-`vouchers.status` |
| 5 | קופה פיזית | גביית יתרה במזומן/אשראי של העסק | לקוח דורש "הכל שולם באתר" בניגוד למסך | אין מהפלטפורמה על היתרה | אין |

יציאה: סטטוס `used` (או `redeemed` בסביבה ישנה עד מיפוי). חד פעמי.

---

## 5. ארנק, קאשבק, ותשלום מעורב

מטרה: זיכוי לארנק אחרי רכישה, שימוש ברכישה הבאה.

| # | מסך | מצב תקין | שגיאה | מייל | Analytics |
|---|---|---|---|---|---|
| 1 | הצלחת הזמנה | קאשבק לפי כללי תוכנית, integer | ביטול מאוחר: clawback | `cashback_credited` | `purchase` כבר נורה |
| 2 | `/account/wallet` | יתרה + יומן. כיתוב אין משיכה | "העבר לבנק" לא קיים | אין | `page_view` |
| 3 | קופה הבאה | קיזוז ארנק ואז כרטיס | יתרה לא מכסה, כרטיס נכשל: ארנק לא נשרף פעמיים | אין | `begin_checkout` עם wallet applied |

יציאה: `wallet_entries` בחתימה יחידה דרך הפונקציה הייעודית, לא עדכון יתרה ידני.

---

## 6. ביטול קופון שלא מומש

מטרה: החזר הסכום שנגבה באתר.

| # | מסך | מצב תקין | שגיאה | מייל | Analytics |
|---|---|---|---|---|---|
| 1 | `/account/orders` | בקשת ביטול | שובר כבר `used` | אין | `page_view` |
| 2 | תור אדמין | בודק `issued` + חלון 14 יום | פג תוקף: לא אוטומטי | אין | אין |
| 3 | RefundDeal | פעם אחת, בלי retry | כפילות החזר | `refund` | הקטנת net GMV לפי יום posting |
| 4 | לקוח | כרטיס עד 14 ימי עסקים או ארנק | דמי ביטול בלי מדיניות חיה | אותו | אין |

יציאה: שובר `refunded`. קאשבק מבוטל אם ניתן.

---

## 7. מוצר פיזי (לא שיגור ציבורי)

מטרה: מסע מוכן כשהבעלים מאשר `active` פיזי.

| # | מסך | מצב תקין | שגיאה | מייל | Analytics |
|---|---|---|---|---|---|
| 1 | PDP `type=physical` | מחיר מלא באתר, בלי יתרה/QR מימוש | מופיע בשיגור בניגוד למדיניות | אין | `view_product` |
| 2 | קופה + כתובת | חובה | כתובת חסרה | אין | `checkout_step` `address` |
| 3 | תשלום | 100% on-site | כמו מסע 3 | `order_paid` (לא voucher) | `purchase` |
| 4 | ספק: תור משלוח | כתובת מה-snapshot | ספק רואה GMV פלטפורמה: אסור | `order_shipped` כשיסומן | אין |
| 5 | לקוח | מעקב ב-`/account/orders` | פגום: ביטול בלי דמי ביטול לפי returns | תמיכה | אין |

עמלה: `platform_percent` שצולם בשורה, לא האחוז החי במוצר.

---

## 8. סל נטוש

מטרה: תזכורת opt-in, לא ספאם.

| # | מסך | מצב תקין | שגיאה | מייל | Analytics |
|---|---|---|---|---|---|
| 1 | `/cart` נטוש | שורות שמורות בסשן/משתמש | שורה הפכה `paused` | אין | `add_to_cart` בעבר |
| 2 | cron `abandoned-cart` | רק אם מתזמן חי + opt-in | cron דומם: אין מייל, זה לא באג סל | `abandoned_cart` (שיווקי) | אין רכישה |
| 3 | חזרה לסל | מחירים מעודכנים באגורות | מחיר ישן בקופי: לפסול | אין | `page_view` |

אין מלאי "נשארו 2" בלי נתון.

---

## 9. מעלה תוכן עד פרסום

מטרה: `draft` → `active` אחרי אדם.

| # | מסך | מצב תקין | שגיאה | מייל | Analytics |
|---|---|---|---|---|---|
| 1 | `/admin/products/new` | type `coupon`, מחירים אגורות | `physical` כ-active בשיגור | אין | אין ציבורי |
| 2 | תמונות | ≥800×800, alt עברי | picsum / מתחרה | אין | אין |
| 3 | AI `catalog_enrichment` | טיוטה `pending_admin` | פרסום אוטומטי | אין | אין |
| 4 | `/admin/approvals` | מאשר אדמין | דחייה עם קוד מ-`UPLOADER-GUIDE` | אופציונלי פנימי | אין |
| 5 | PDP ציבורי | משפט חובה, ספק מלא | שער פיקסלים נשבר | אין | `view_product` אחרי פרסום |

Audit: `created` / `status_change` על המוצר.

---

## 10. כשלי סריקה אצל הספק (צוות)

מטרה: מסך אדום נכון, בלי מימוש שווא.

| # | מסך | מצב תקין | שגיאה שמכוונת | מייל | Analytics |
|---|---|---|---|---|---|
| 1 | `/supplier/login` | Google של חבר `scanner`+ | עובד בלי שורת `supplier_members` | אין | אין |
| 2 | `/scan` | שם העסק | סורק של עסק א': קוד של עסק ב' | אין | אין |
| 3 | אדום: כבר מומש | לא שורפים שוב | ויכוח "הלקוח לא היה" | אין כפול | אין |
| 4 | אדום: פג | תוקף מהשובר | דרישת מימוש מחוץ לשעות שפורסמו: סירוב מותר | תמיכה | אין |

אין אימייל ללקוח על כשל סריקה (רק על הצלחה).

---

## 11. חשבון, הזמנות, מחיקה

מטרה: שקיפות תיקון 13.

| # | מסך | מצב תקין | שגיאה | מייל | Analytics |
|---|---|---|---|---|---|
| 1 | `/account` | ניווט, יתרת ארנק מעוצבת | role ספק נכנס לאדמין: אסור | אין | `page_view` |
| 2 | הזמנות / קופונים / ארנק | מספרי אגורות → ₪ | קוד שובר חסר בזמן `pending` | לפי אירוע | לפי מסך |
| 3 | בקשת מחיקה | anonymized_at לפי מדיניות | מחיקת שורות כסף: אסור | אישור פנימי | אין |
| 4 | דיוור | opt-out 30א | דיוור בלי הסכמה | הפסקה | אין |

---

## 12. אחרי מימוש: ביקורת ו-win-back

מטרה: שיווק רק ב-opt-in.

| # | מסך | מצב תקין | שגיאה | מייל / WA | Analytics |
|---|---|---|---|---|---|
| 1 | אחרי `used` | בקשת ביקורת | ביקורת בלי קנייה אם המדיניות אוסרת | `review_request` | אין רכישה חדשה |
| 2 | `/admin` מודרציה | אישור/דחייה | ספאם, PII | אין ללקוח | אין |
| 3 | 60 יום בלי `paid_at` | win-back | רשימה בלי opt-in | `win_back` | `page_view` אם חוזר |
| 4 | נחיתה לדיל | PDP חי `active` | דיל שנגמר בקופי | אין | `view_product` |

---

## אירועי מייל מול מסעות

| Kind | מסעות |
|---|---|
| `voucher_issued` / `order_paid` | 3 |
| `voucher_redeemed` | 4 |
| `cashback_credited` | 5 |
| `refund` | 6 |
| `order_shipped` | 7 |
| `abandoned_cart` | 8 |
| `welcome` | 2 (פעם ראשונה) |
| `review_request` / `win_back` | 12 |

תבניות: `docs/marketing/WHATSAPP-TEMPLATES-HE.md`, `docs/marketing/EMAIL-SEQUENCES-HE.md`.

---

## מה לא מסע

- Escrow / שחרור כסף לספק על קופון.
- משיכת ארנק.
- סריקה אופליין ששורפת שובר (לא מיושם).
- `purchase` מהדפדפן כמקור אמת כסף.
