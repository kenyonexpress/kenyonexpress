# ארכיטקטורה: Testing & QA

פירמידת בדיקות: Vitest unit, integration מול DB, Playwright e2e, מטריצת CI, ושערי coverage על נתיבי כסף.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #36/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/TESTING-STRATEGY.md
docs/ARCHITECTURE-TESTING-CICD.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CONTRADICTIONS.md
.github/workflows/ci.yml
```

מודל כסף בבדיקות: **No Escrow**. אין assert על held/נאמן/J5.  
אין HMAC גוף Cardcom. אימות תשלום = `?s=` + `GetLpResult`.  
אין default ל-`platform_percent` (כולל אסור `DEFAULT_PLATFORM_COMMISSION` / 5%).

`TESTING-STRATEGY.md` גובר על רף money/redeem (100% על ליבת כסף). מסמך זה לא מוריד רף.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| Q1 | פירמידה: הרבה unit → פחות integration → מעט E2E יציבים. |
| Q2 | Money/redeem: coverage **100%** על קבצי ליבה; אין רף גלובלי 80% על כל `src/`. |
| Q3 | E2E ב-CI עם mock Cardcom בלבד; אין חיוב אמיתי ב-PR. |
| Q4 | ארבע זרימות קריטיות: voucher checkout, physical split, redeem scan, refund. |
| Q5 | אסור טסט שמצפה ל-Escrow held או HMAC webhook. |
| Q6 | אסור טסט שמניח default עמלה 5%/10%; כל percent מפורש בקלט. |
| Q7 | Integration על RLS / race redeem / finalize. |

---

## 1. פירמידה

```text
        /\
       /E2E\          מעט, he-IL, mock Cardcom
      /------\
     / Integr.\       DB + RPC/RLS
    /----------\
   / Unit Vitest \    רוב הנפח; טהור בלי I/O כשאפשר
  /----------------\
```

| שכבה | כלי | חובה |
|---|---|---|
| Unit | Vitest | money, split, settlement, redemption gate, state machine |
| Integration | Vitest/SQL מול DB CI | RLS, `redeem` כפול, finalize אחרי GetLpResult |
| E2E | Playwright | E1–E4 למטה |

---

## 2. Unit (חוזה)

- בלי רשת Cardcom ובלי DB כשניתן.  
- אגורות integer בלבד; allocation invariant (סכום חלקים = מקור).  
- קופון: `coupon_price` מוחלט; `supplier_due` מפלטפורמה = 0 (No Escrow).  
- פיזי: `platform_fee` מ-`platform_percent` **שסופק במפורש** בקלט הטסט.  
- אין קונפיג coverage על `escrow.ts` (הקובץ אינו חלק מהמודל).

---

## 3. Integration

מינימום:

1. לקוח לא קורא הזמנות של אחר; ספק לא מממש קופון של ספק אחר.  
2. שני redeem במקביל → מימוש אחד.  
3. Webhook/return: `?s=` + אימות `GetLpResult` (בלי HMAC מזויף).  
4. Refund: כתיבת ledger / `settlement_events` לפי REFUNDS-DISPUTES.

Secrets: `CI_SUPABASE_*`. אין service role בלוגי דפדפן.

---

## 4. E2E קריטיים (E1–E4)

| # | זרימה | assert מרכזי |
|---|---|---|
| E1 | checkout voucher | mock LP → order/voucher issued; No Escrow בנוסח/סכומים |
| E2 | checkout physical split | פיצול לפי % מפורש על המוצר; אין held |
| E3 | redeem scan | מימוש חד-פעמי; ניסיון שני נכשל |
| E4 | refund | לפני/אחרי redeem לפי מדיניות; סטטוס + settlement |

אסור: תשלום אמיתי ב-PR; assert על escrow; המצאת percent default.

---

## 5. CI matrix (יעד)

```text
lint ──┐
typecheck ──┼──► test (money floors) ──► build ──► e2e (אם secrets)
            └──► integration (כשמופעל)
```

| Job | חוסם merge? |
|---|---|
| lint / typecheck / test | כן |
| build | כן (כשהסודות קיימים) |
| integration | כן אחרי הפעלה |
| e2e | כן אחרי `CI_SUPABASE_*`; עד אז skip עם אזהרה |

Coverage diff-scoped לשאר הקוד **לא** מחליף 100% money/redeem.

---

## 6. Acceptance

- [ ] אין PR כספי בלי unit ירוק על money/redeem  
- [ ] אין טסט Escrow held / HMAC webhook / default 5% commission  
- [ ] E1–E4 מתועדים כיעד יציב  
- [ ] CI: lint/typecheck/test/build  
- [ ] `TESTING-STRATEGY.md` לא מופר  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | פירמידה + E1–E4 + coverage changed-files |
| 2026-08-12 | batch-2 #36: BINDING; Q5/Q6 נגד Escrow ו-default עמלה |
| 2026-08-12 | batch-2 #36 pass-2: BINDING על arch/docs-batch-2 (המשך תור) |
