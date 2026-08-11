# ארכיטקטורה: Testing & QA

פירמידת בדיקות: Vitest unit, integration מול DB, Playwright e2e, מטריצת CI, שערי coverage על נתיבי כסף.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף בבדיקות: **No Escrow**. אין assert על held/נאמן/J5.  
אין HMAC גוף Cardcom. אימות = `?s=` + `GetLpResult`.  
אין default ל-`platform_percent`.

מסמכים קשורים:

```
docs/ARCHITECTURE-TESTING.md
docs/ARCHITECTURE-TESTING-CICD.md
docs/TESTING-STRATEGY.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
.github/workflows/ci.yml
```

`TESTING-STRATEGY.md` גובר על רף money/redeem (100% ליבה).

---

## 1. החלטה

| # | הכרעה |
|---|---|
| Q1 | פירמידה: הרבה unit → פחות integration → מעט E2E יציבים. |
| Q2 | Money/redeem: coverage **100%** על קבצי ליבה; אין רף גלובלי 80%. |
| Q3 | E2E ב-CI עם mock Cardcom; אין חיוב אמיתי ב-PR. |
| Q4 | ארבע זרימות קריטיות: E1 voucher checkout, E2 physical split, E3 redeem, E4 refund. |
| Q5 | אסור טסט Escrow held / HMAC webhook / default 5%. |
| Q6 | Integration: RLS, race redeem, finalize אחרי GetLpResult. |
| Q7 | Mock בגבול (Supabase client), לא בתוך פונקציות כסף. |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| Cardcom אמיתי ב-PR | עלות + flakiness; mock LP. |
| assert 10%/90% קופון | No Escrow; coupon_price מוחלט. |
| mock `splitPhysical` בטסט קורא | לא בודק כלום. |
| E2E לכל unit | יקר; פירמידה Q1. |
| coverage 95% על `escrow.ts` | קובץ לא במודל. |
| integration בלי DB | RLS לא נבדק. |

---

## 3. סכמת DB (בדיקות)

**אין DDL חדש.** Integration דורש:

| טבלה/RPC | assert |
|---|---|
| `vouchers` + `redeem_voucher` | already_used, wrong_supplier |
| `orders` + finalize | paid_at, idempotency |
| `wallet_entries` | ledger מאוזן |
| RLS policies | own rows בלבד |

Secrets CI: `CI_SUPABASE_*`. אין service role בלוג דפדפן.

---

## 4. פירמידה ו-E1–E4

```text
        /\
       /E2E\          mock Cardcom, he-IL
      /------\
     / Integr.\       DB + RPC/RLS
    /----------\
   / Unit Vitest \    money, split, settlement, gate
  /----------------\
```

| # | זרימה | assert מרכזי |
|---|---|---|
| E1 | checkout voucher | mock LP → voucher; No Escrow בנוסח |
| E2 | checkout physical | split לפי % מפורש; אין held |
| E3 | redeem scan | חד-פעמי; שנייה נכשלת |
| E4 | refund | לפני/אחרי redeem; settlement |

Unit: agorot integer; allocation invariant; קופון supplier_due=0.

---

## 5. מקרי קצה

| # | מצב | assert |
|---|---|---|
| E1 | percent חסר בטסט settlement | throw / fail |
| E2 | שני redeem parallel | שורה אחת |
| E3 | GetLpResult fail | order נשאר pending |
| E4 | wallet spend > balance | reject |
| E5 | HMAC webhook test ישן | להסיר; לא CI |
| E6 | float ב-money output | fail |
| E7 | E2E בלי secrets | skip + log |

---

## 6. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | E2E full checkout + iframe | 2026-08-12 |
| O2 | component tests RTL | 2026-08-12 |
| O3 | race tests R1-R5 מלאים | 2026-08-12 |

---

## 7. Acceptance

- [ ] אין PR כספי בלי unit ירוק על money/redeem  
- [ ] אין טסט Escrow / HMAC / default 5%  
- [ ] E1–E4 מתועדים  
- [ ] CI: lint/typecheck/test/build  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | פירמידה + E1–E4 |
| 2026-08-12 | batch-2: BINDING מלא; תבנית חובה |
