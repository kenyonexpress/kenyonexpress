# ארכיטקטורה: ארנק קאשבק (Cashback)

אשראי פנימי בלבד: צבירה אחרי `paid`, מימוש בקופה, ledger באגורות, בלי משיכה החוצה.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #15/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין held/נאמן/J5 לקופון. מקדמת קופון אינה נכנסת לארנק.

מסמכים קשורים:

```
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-WALLET-INTEGER.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/CASHBACK-WALLET-SPEC.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-REFERRAL.md
docs/CONTRADICTIONS.md
```

**יחס למסמכים האחרים:** מסמך זה = מחזור earn/spend + כללי עתיד.  
`ARCHITECTURE-CASHBACK-WALLET.md` = חוזה C1-C7 תמציתי.  
`ARCHITECTURE-WALLET-LEDGER.md` = journal / `fn_wallet_transfer`.  
`ARCHITECTURE-ACCOUNT-WALLET.md` = UI אזור אישי + apply בקופה.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| WC1 | הארנק פנימי לשימוש באתר/באפ בלבד. |
| WC2 | **אין cash-out**, אין P2P, אין המרה לכרטיס/בנק/מזומן. |
| WC3 | יתרות ותנועות: integer **agorot** בלבד (1 ₪ = 100). אין float. |
| WC4 | כל תנועה = כפול-רישום דרך `fn_wallet_transfer` + `idempotency_key` UNIQUE. |
| WC5 | מקדמת קופון אינה escrow בארנק (No Escrow). |
| WC6 | מימוש רק על סכום לתשלום **באתר** לפני Cardcom. |
| WC7 | צבירה אחרי `paid` בלבד. |
| WC8 | מפתחות: `order:{order_id}:cashback` ו-`order:{order_id}:spend`. |
| WC9 | אין צבירה על חלק ששולם מארנק (מונע לופ), אלא אם rule מפורש אומר אחרת. |

---

## 1. Ledger באגורות (תמצית)

| ישות | תפקיד |
|---|---|
| `wallet_accounts` | user `available` + חשבונות פלטפורמה |
| `wallet_entries` | debit/credit append-only תחת `journal_id` |
| יתרה מוצגת | cache או view; מקור אמת = journal |

חשבונות פלטפורמה קבועים:

| purpose / code | תפקיד |
|---|---|
| `platform:cashback_reserve` | מקור זיכוי קאשבק |
| `platform:revenue` | יעד spend / התאמות הכנסה |
| `platform:adjustments` | זיכוי/חיוב אדמין |

תיקון טעות = תנועת פיצוי חדשה. אסור UPDATE/DELETE על שורת journal ישנה.

פירוט מלא:

```
docs/ARCHITECTURE-WALLET-LEDGER.md
```

---

## 2. צבירה (earn)

### 2.1 מסלול

```text
order status → paid
  → base = paid_on_site_agorot
       (אחרי wallet spend אם היה; לא face, לא יתרת עסק)
  → cashback = floor(base * rule_percent / 100)
       או flat_agorot מ-rule
  → fn_wallet_transfer(
       from: platform:cashback_reserve,
       to:   user available,
       reason: order_cashback,
       idempotency_key: order:{order_id}:cashback
     )
  → (אופציונלי) enqueue wallet_activity
```

### 2.2 כללים

| כלל | פירוט |
|---|---|
| בסיס | רק מה ששולם באתר בכרטיס/אמצעי חיצוני לפי snapshot ההזמנה |
| מוצר בלי rule | 0; לא ממציאים אחוז |
| עיגול | `floor` פעם אחת לאגורות שלמות |
| כשל אחרי paid | retry עם אותו מפתח; **לא** מבטל Cardcom / לא משנה `paid` |
| Replay webhook | אותו מפתח → journal קיים; אין זיכוי כפול |
| Referral | reason נפרד; לא לערבב עם `order_cashback` |

### 2.3 מתי לא צוברים

- הזמנה לא `paid`
- `paid_on_site_agorot = 0` אחרי spend מלא
- rule לא פעיל / מחוץ לחלון תאריכים
- מוצר/קטגוריה שלא תואמים rule

---

## 3. מימוש (spend)

### 3.1 מסלול checkout

```text
checkout (משתמש מחובר, יתרה > 0):
  T = on_site total agorot
  W = min(balance_agorot, T, cap_if_any)
  Cardcom charge = T - W

on paid:
  fn_wallet_transfer(
    from: user available,
    to:   platform:revenue,
    reason: order_spend,
    idempotency_key: order:{order_id}:spend
  )

on failed / cancel לפני paid:
  אין confirm spend; יתרה נשארת (או reverse אם כבר נרשם hold זמני)
```

### 3.2 כללים

| כלל | פירוט |
|---|---|
| מתי | לפני יצירת חיוב Cardcom |
| קופון | רק על `coupon_price` (חלק האתר); לא על יתרת בית העסק |
| פיזי | על סכום העגלה באתר |
| תצוגה | "ימומש מהארנק: ₪X · לתשלום בכרטיס: ₪Y" |
| Double-spend | FOR UPDATE + יתרה לא שלילית + UNIQUE על מפתח spend |
| כשל Cardcom אחרי ניסיון spend | reverse / אל תאשר; לא לאבד יתרה בשקט |

ולידציה ב-`beginCheckout` היא מייעצת. החיוב הסופי ליתרה רק אחרי `paid` (או מנגנון hold+confirm מתועד), עם אותו מפתח.

---

## 4. Idempotency (מחייב)

| פעולה | מפתח | התנהגות replay |
|---|---|---|
| Earn | `order:{order_id}:cashback` | החזר journal קיים |
| Spend | `order:{order_id}:spend` | החזר journal קיים |
| Admin credit | `adj:{uuid}` | חד-פעמי |
| Refund credit | `order:{order_id}:refund` | חד-פעמי (כשמופעל) |

אין מפתחות חלופיים (`cashback:{id}` וכו') בנתיב חדש. אם קיים legacy במערכת, מיפוי חד-כיווני לתיעוד בלבד; קוד חדש כותב רק את הצורה למעלה.

---

## 5. כללי צבירה עתידיים (לא soft-open חובה)

| Rule ID | רעיון | תלות |
|---|---|---|
| F1 | אחוז דיפרנציאלי לפי `product.type` | `cashback_rules` |
| F2 | תקרת צבירה חודשית למשתמש | cron + counter |
| F3 | בונוס referral נפרד | REFERRAL; לא לערבב |
| F4 | תוקף יתרה (expiry לזכות ישנה) | journal expire → reserve |
| F5 | מבצע כפל קאשבק בחלון זמן | שעון שרת |
| F6 | אין צבירה על סכום ששולם מארנק | ברירת מחדל מומלצת |

עד הפעלה: rule table ריקה או percent=0 = אין earn.

---

## 6. מה אסור

- משיכה / ביט / העברה למשתמש אחר  
- הצגת יתרת ארנק כ"כסף נאמן" / Escrow  
- צבירה על יתרה שתשולם בעסק  
- כתיבת יתרה בלי journal  
- float בנתיב earn/spend  
- cash-out לכל אמצעי חיצוני  

---

## 7. אינטגרציה ל-finalize

```text
Cardcom webhook / finalizeOrder (paid)
  → issue vouchers / mark physical
  → confirm spend אם W > 0 (order:{id}:spend)
  → compute cashback מה-rule + paid_on_site snapshot
  → earn (order:{id}:cashback)
  → notification אופציונלי (לא חוסם)
```

סדר מומלץ: קודם confirm spend (אם רלוונטי), אחר כך earn על הבסיס אחרי spend. שניהם idempotent.

---

## 8. Acceptance

- [ ] Agorot + double-entry מתועדים  
- [ ] אין cash-out  
- [ ] Earn אחרי `paid` בלבד  
- [ ] Spend מפחית חיוב Cardcom באתר  
- [ ] מפתחות `order:{id}:cashback` ו-`order:{id}:spend`  
- [ ] Replay לא מזכה/מחייב פעמיים  
- [ ] No Escrow מפורש  
- [ ] קופון: ארנק לא מכסה יתרת עסק  
- [ ] טבלת כללי עתיד F1-F6  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING: earn/spend, ledger agorot, future accrual rules |
| 2026-08-12 | batch-2 #15: רענון BINDING על `arch/docs-batch-2`; No Escrow מאושר |
| 2026-08-12 | batch-2 #15 pass-2: מחזור מלא; מפתחות `order:{id}:cashback` / `order:{id}:spend` |
