# ארכיטקטורה: סוגי מוצר

<!-- v1-final-banner:2026-09-01 -->
> ⚠️ **Partly stale 2026-09-01. See `docs/ARCHITECTURE-OVERVIEW.md` §0.**
>
> `product_type` in production has four values: `coupon, physical, service,
> recurring`. `recurring` is backed by `subscriptions` and `subscription_charges`
> (migration 135) and by `/account/subscriptions`. `service` has schema support
> but no distinct money path; it settles like `physical`.
>
> Escrow is not a property of any product type.

קופון / פיזי / מנוי חוזר: מה משתנה בכל שכבה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-MONEY.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md
docs/ARCHITECTURE-SUBSCRIPTIONS.md
docs/ARCHITECTURE-RECURRING-SUBSCRIPTIONS.md
docs/ARCHITECTURE-INVENTORY.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. אגורות integer. `platform_percent` פר מוצר בלי default.

יחס למסמכים אחרים: המסמך הזה = מפת שכבות בין הסוגים. פירוט עמוק לכל דומיין נשאר במסמך הייעודי; בהתנגשות על כסף/סוג גוברים `BUSINESS-MODEL.md` + `ARCHITECTURE-MONEY.md` + הטבלאות כאן.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| PT1 | שלושה סוגים קנוניים ב-`products.type`: `coupon` \| `physical` \| `subscription`. |
| PT2 | ה-discriminator הוא `type` (לא `is_coupon_enabled` לבד). דגל ישן יכול לרמז ב-cart אבל כתיבה חדשה חייבת `type` עקבי. |
| PT3 | `commission_type` נגזר מ-`type` (CHECK): coupon → `coupon_absolute`; אחרת → `physical_percent`. לא מקור החלטה נפרד. |
| PT4 | קופון: חיוב באתר = `coupon_price` מוחלט; יתרה בעסק; `supplier_due` מהפלטפורמה = 0; הנפקת voucher אחרי `paid`. |
| PT5 | פיזי: חיוב 100% באתר; פיצול residual לפי snapshot; משלוח/איסוף; payout לספק בלוח זמנים (לא Escrow). |
| PT6 | מנוי: חיוב מחזורי ב-Cardcom Token; snapshot `%` פר מחזור; **לא** חלק מ-soft-open קופונים; דגל `SUBSCRIPTIONS_ENABLED`. |
| PT7 | עגלת checkout רגילה תומכת כיום ב-`coupon` + `physical`. מנוי = מסלול הצטרפות נפרד (לא ערבוב voucher עם subscription באותה הזמנה בלי מפרט מפורש). |
| PT8 | פרטי ספק חובה בכל שלושת הסוגים לפרסום. |
| PT9 | מחיר/% מצולמים ל-`order_items` (או invoice מנוי) בזמן חיוב; לא נקראים מחדש מהקטלוג אחרי תשלום. |
| PT10 | בשלות: קופון = מסלול שיגור; פיזי = ארכיטקטורה מוכנה, תפעול משלוחים לפי FULFILLMENT; מנוי = BINDING design, קוד/מיגרציות prod רק אחרי דגל + ייעוץ. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| סוג יחיד + flags בלבד (`is_coupon`) | מבלבל pricing/fulfillment; enum מפורש נדרש ל-CHECK ולדוחות. |
| Escrow על מקדמת קופון עד סריקה | סותר No Escrow / BUSINESS-MODEL. |
| `platform_percent` default או כפייה שקטה ל-0 | מסתיר מוצר לא מוגדר. |
| מנוי כקופון שמתחדש אוטומטית | מודל שונה (token, מחזורים, ביטול); אין voucher מימוש בעסק במפרט המנוי. |
| ערבוב שורות coupon+subscription באותו `beginCheckout` בלי חוקים | סיכון כסף/משפטי; נדחה עד מפרט נפרד. |
| Cardcom Multi-Account כפיצול פיזי בזמן charge | ledger + payout batch במקום. |
| מחיר קופון כאחוז ממחיר הפנים בחיוב | חיוב קנוני = סכום מוחלט בלבד. |

---

## 2. סכמת DB (קיים / יעד; אין DDL חדש במסמך זה)

| רכיב | מצב |
|---|---|
| `product_type` enum | `physical`, `coupon`; `subscription` נוסף במיגרציות המשך (067+). לאמת מול DB חי. |
| `products.type` | discriminator |
| `products.commission_type` | `coupon_absolute` / `physical_percent` + CHECK מול `type` (091) |
| שדות קופון | `coupon_price_*`, `coupon_expiry_days`, face/sticker price |
| שדות פיזי | מחיר, `discount_percent`, מלאי/variants, משלוח (לפי FULFILLMENT) |
| שדות מנוי (יעד) | `billing_interval`, `recurring_amount_agorot`, `max_billing_cycles` |
| `order_items.product_type` | snapshot סוג השורה |
| `vouchers` | רק קופון |
| `subscriptions` / `subscription_invoices` | יעד מנוי (SUBSCRIPTIONS) |

אין DDL במסמך זה.

---

## 3. תמונה אחת: שלושת הסוגים

| ממד | קופון | פיזי | מנוי חוזר |
|---|---|---|---|
| מה הלקוח קונה | זכות מימוש בעסק (שובר) | מוצר למשלוח/איסוף | גישה/שירות לתקופה |
| תשלום באתר | `coupon_price` | 100% מחיר אחרי הנחה | `recurring_amount` כל מחזור |
| יתרה מחוץ לאתר | `face - coupon` בעסק | 0 | 0 |
| הכנסת פלטפורמה | 100% מהמקדמה | `platform_percent` מהשורה | `%` מהחיוב (snapshot) |
| לספק מהפלטפורמה | 0 | יתרה ב-payout | יתרה פר מחזור (אם יש ספק) |
| אחרי `paid` | הנפקת voucher+QR | הזמנת משלוח לספק | `subscription` active + token |
| סיום ערך | redeem / expire / refund | delivered / return | cancel / expire cycles |
| בשלות שיגור | כן (מסלול ראשי) | חלקי (כסף מוכן; משלוח לפי doc) | design; דגל כבוי בשיגור קופונים |

---

## 4. מה משתנה בכל שכבה

### 4.1 קטלוג / Admin

| שכבה | קופון | פיזי | מנוי |
|---|---|---|---|
| שדות חובה | coupon_price, expiry_days, face, split pair, ספק | מחיר, discount, split pair, מלאי/variant, ספק | recurring_amount, interval=monthly, split pair, ספק |
| Publish gate | בלי coupon_price → חסום | בלי % → חסום | בלי recurring → חסום |
| UI אדמין | תוויות "מחיר בקניון" / יתרה מחושבת | מפצל % נראה | שדות חיוב חוזר |
| SEO/PDP copy | יתרה בעסק + תוקף | משלוח/מלאי | תנאי ביטול מחזוריים |

הערת CONTRADICTION: מסמכי admin ישנים שכופים `platform_percent=100` על קופון כ-CHECK יחיד נדחים לטובת No Escrow settlement (`supplier_due=0`) תוך צילום האחוז להסכם/ביקורת. ראה MONEY.

### 4.2 Storefront (PDP / קטגוריה)

| | קופון | פיזי | מנוי |
|---|---|---|---|
| מחיר מוצג | coupon + יתרה + face | מחיר אחרי הנחה | מחיר לחודש |
| CTA | הוסף לעגלה | הוסף לעגלה | הצטרף / התחל מנוי (מסלול נפרד) |
| אייקוני אמון | מימוש בעסק / QR | משלוח | ביטול מאזור אישי |
| אורח | עגלה כן; תשלום אחרי login | כמו קופון | login חובה בהצטרפות (SU7) |

### 4.3 עגלה

| | קופון | פיזי | מנוי |
|---|---|---|---|
| שורת עגלה | כן | כן | לא ב-cart הרגיל (יעד: checkout מנוי ייעודי) |
| תמחור תצוגה | coupon_price × qty | discounted × qty | N/A בעגלה רגילה |
| מלאי | quota / cap מימושים (INVENTORY) | stock_quantity / variant | אין מלאי יחידות; מגבלת מנויים אופציונלית |
| ערבוב בעגלה | coupon+physical מותר באותה הזמנה | אותו | לא עם השניים בלי מפרט |

### 4.4 Checkout / תשלום

| | קופון | פיזי | מנוי |
|---|---|---|---|
| `beginCheckout` | שורות coupon ב-settlement | שורות physical | לא דרך אותו flow ב-GA |
| Cardcom | Low Profile חד-פעמי | Low Profile חד-פעמי | ChargeAndCreateToken ואז Token charge |
| סכום ל-LP | סכום מקדמות (+פיזי אם מעורב) | מלא | recurring_amount |
| אחרי GetLpResult | finalize → mint vouchers | finalize → fanout ספק | activate subscription + invoice#1 |
| Wallet | ניתן לקיזוז על paid_on_site | כן | לפי מפרט מנוי (פתוח) |

### 4.5 כסף / Ledger (MONEY)

| | קופון | פיזי | מנוי |
|---|---|---|---|
| `paid_on_site` | coupon × qty | base מלא | amount למחזור |
| `commission` / platform | = paid_on_site | applyBp(base, %) | applyBp(amount, % snapshot) |
| `supplier_due` | 0 | base − fee | amount − fee |
| `balance_due` בעסק | face − coupon | 0 | 0 |
| מע"מ פלטפורמה | על כל המקדמה | על העמלה | על חלק הפלטפורמה בחיוב |
| escrow_held | תמיד 0 | 0 | 0 |

### 4.6 אחרי תשלום / Fulfillment

| | קופון | פיזי | מנוי |
|---|---|---|---|
| ארטיפקט | `vouchers` + QR `KEV1` | שורת משלוח / supplier order | `subscriptions` + invoices |
| סטטוס שורה | item issued; settlement platform_settled → redeemed בסריקה | pending → packed → shipped → delivered | N/A order line מחזורית |
| פעולת ספק | סריקת QR בלבד | mark shipped + tracking | אין סריקה; דוח הכנסות מחזור |
| Payout | אין מהמקדמה | T+3 / min balance (PAYOUT) | פר מחזור אחרי paid invoice |
| התראות | voucher_issued, redeemed | order_shipped, delivered | invoice paid/failed, cancel |

### 4.7 אזור אישי / ספק / אדמין

| | קופון | פיזי | מנוי |
|---|---|---|---|
| לקוח | הקופונים שלי + QR | הזמנות + מעקב | המנויים שלי + ביטול |
| ספק | סורק + היסטוריית מימוש | תור משלוחים | (עתידי) דוח מנויים |
| אדמין | vouchers, disputes redeem | payouts, refunds משלוח | מנויים, כשלי חיוב, retry |
| Refund | חסום אחרי redeemed/expired לפי REFUNDS | לפי חלון החזרה/משלוח | זיכוי מחזור / void לפי LEGAL |

### 4.8 אנליטיקס / Fraud / Legal

| | קופון | פיזי | מנוי |
|---|---|---|---|
| אירועים | begin_checkout, purchase, redeem | purchase, shipped | subscribe, renew, cancel, dunning |
| Fraud | ניחוש קוד, multi-scan, velocity | address/chargeback | token abuse, retry storms |
| גילוי נאות | יתרה בעסק, תוקף, ביטול | משלוח, החזרה | חיוב חוזר, ביטול מחזור |

---

## 5. מכונות מצב (תמצית)

```text
COUPON:   catalog → cart → pay → voucher issued → redeemed|expired|refunded
PHYSICAL: catalog → cart → pay → fulfill shipped → delivered → (payout schedule)
SUB:      PDP → join(pay#1+token) → active → renew*|past_due → cancelled|expired
```

אין מעבר סוג אחרי שיש `order_items` / invoices היסטוריים לאותה שורה. שינוי `products.type` משפיע רק על קניות חדשות.

---

## 6. מקרי קצה

| קוד | סימפטום | תוצאה |
|---|---|---|
| `type_flag_mismatch` | `type=physical` אבל `is_coupon_enabled` | cart עלול לסווג coupon; תקן נתונים; כתיבה חדשה אוסרת drift |
| `commission_type_drift` | לא תואם type | CHECK דוחה כתיבה |
| `mixed_cart_sub` | מנוי בעגלת קופון | אסור עד מפרט; CTA מנוי נפרד |
| `coupon_missing_price` | בלי coupon_price | לא publish / לא priceable בעגלה |
| `physical_no_percent` | בלי platform_percent | שורה unavailable |
| `sub_without_flag` | SUBSCRIPTIONS_ENABLED=false | הסתרת CTA / 404 מוצר |
| `type_change_after_orders` | החלפת type במוצר חי | הזמנות ישנות נשארות על snapshot; מוצר חדש לפי type חדש |
| `refund_redeemed_coupon` | ניסיון זיכוי אחרי redeem | חסום |
| `physical_escrow_language` | טקסט "מוחזק עד מסירה" | אסור ב-UI/ספק |

---

## 7. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | האם פיזי ב-soft-open או אחרי קופונים בלבד | GO-LIVE; ארכיטקטורה מוכנה |
| O2 | יישור `is_coupon_enabled` מול `type` בפרוד (כבוי/הסרה) | CONTRADICTIONS / מיגרציה באישור |
| O3 | האם מנוי משתמש ב-`commission_type` חדש או נשאר `physical_percent` | CHECK ב-091 כיום: non-coupon → physical_percent; לעדכן כש-subscription נכנס ל-publish |
| O4 | ערבוב coupon+physical+wallet באותו LP: גבולות סכום | CHECKOUT; נמדוד לפני הרחבה |
| O5 | ניסוח עו״ד למנוי (ביטול, חיוב חוזר) | לפני קוד פרוד מנויים |

עודכן: 2026-08-12.

---

## 8. Acceptance

- [ ] שלושת הסוגים + בשלות מתועדים  
- [ ] מטריצת שכבות: admin, PDP, cart, checkout, money, fulfill, account  
- [ ] No Escrow; קופון supplier_due=0  
- [ ] מנוי מחוץ לשיגור קופונים (דגל)  
- [ ] חלופות שנדחו + DB + מקרי קצה + פתוחות  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | יצירת BINDING: שכבות coupon/physical/subscription |
