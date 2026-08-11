# ארכיטקטורה: Testing ו-CI/CD

שערי CI למיזוג, רצפות כיסוי על נתיבי כסף, וחוזה טסטים שתואם את מודל הכסף החי.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #37/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/TESTING-STRATEGY.md
docs/ARCHITECTURE-TESTING-QA.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/CONTRADICTIONS.md
.github/workflows/ci.yml
vitest.config.ts
```

---

## 0. תיקוני אמת (חובה; מחליפים טקסט ישן)

המסמך ההיסטורי הכיל ארבעה כשלים שמייצרים "טסט ירוק על שקר". **בטל אותם כמצב פתוח:**

| # | היה (שגוי) | מצב מחייב עכשיו |
|---|---|---|
| A | פיצול קופון "10%/90%" כברירת מחדל | `coupon_price` מוחלט פר מוצר; אין יחס קבוע |
| B | E2E בונה גוף webhook **חתום HMAC** | **אין** חתימת גוף Cardcom. אימות = `?s=` + `GetLpResult` |
| C | assert "escrow is held" | **No Escrow**. אין held/נאמן/J5 |
| D | רצפת coverage על `escrow.ts` + `DEFAULT_PLATFORM_COMMISSION = 5` | **אין** קובץ escrow במודל; **אין** `DEFAULT_PLATFORM_COMMISSION`; **אין** default 5% ל-`platform_percent` |

### 0.1 Assert: אין commission default

1. אסור בקוד ובטסטים: `DEFAULT_PLATFORM_COMMISSION`, `DEFAULT_PLATFORM_COMMISSION_PERCENT`, או כל קבוע 5/10 כאחוז עמלה גלובלי.  
2. `platform_percent` מגיע מהמוצר (או snapshot בהזמנה). חסר = כשל ולידציה / כשל טסט.  
3. טסט settlement **מעביר percent במפורש** בקלט וטוען את החשבון.  
4. דמי ביטול חוקיים 5% או 100₪ הם **statutory**, לא commission, ולא מחליפים את הכלל למעלה.  
5. כל אזכור ישן ל-5% כ-open/current commission default במסמך זה או בקונפיג CI = חוב לתיקון קוד/docs, לא מדיניות פתוחה.

---

## 1. עקרון שערי CI

אין אחוז כיסוי גלובלי שפותח merge. יש:

1. רשימת invariants כסף סגורה (סעיף 2) עם לפחות טסט אחד לכל invariant.  
2. רצפות per-file על מודולי money/redeem לפי `TESTING-STRATEGY.md` (**100%** על ליבה; לא 95% כתחליף).  
3. lint + typecheck + build ירוקים.  
4. e2e עם mock Cardcom כש-`CI_SUPABASE_*` קיימים.

Target branch למיזוג מוגן: הענף הראשי של הריפו (אחרי cutover: `main`). ענף עבודה יומי יכול לקבל push ישיר; השער על ה-PR למיזוג.

---

## 2. Invariants כסף (unit)

| מודול | מה חייבים לנעול |
|---|---|
| money (agorot) | parse מדויק, דחיית >2 ספרות, allocation (סכום חלקים = מקור), בלי float |
| split / settlement | קופון: on-site = `coupon_price`; `supplier_due` מפלטפורמה = 0; פיזי: fee מ-`platform_percent` **מפורש** |
| redemption gate | not_found / wrong_supplier / already_used / expired / success |
| QR verify | payload תקין עובר; שינוי digest נכשל |
| cart merge (pure) | איחוד כמויות; atomicity ב-DB/integration לא ב-unit |

אסור:

- hardcode יחס 10/90 כמודל  
- `platformPercent` חסר עם fallback שקט ל-5  
- חתימת HMAC ל-Cardcom כשלב חובה  
- expect על escrow held  

---

## 3. E2E (CI)

| Flow | דרישה |
|---|---|
| Checkout | guest/user → mock LP return → paid + voucher issued |
| Redeem | סריקה ראשונה success; שנייה already_used; race → שורה אחת |
| Refund | לפי מדיניות לפני/אחרי redeem |

Stub Cardcom:

1. Low Profile create דרך `CHECKOUT_PROVIDER=mock` (או מקביל).  
2. Webhook/return: גוף עם `?s=<secret>` + mock `GetLpResult`. **אין** `signCardcomBody`.  

אין secrets של מסוף אמיתי ב-CI.

---

## 4. Pipeline GitHub Actions

סדר חוסם:

```text
lint → typecheck → test(--coverage) → build → e2e (conditional)
```

| Job | הערות |
|---|---|
| lint | diff-scoped מותר; לא לחסום על רעש ב-`scripts/` אם מדיניות כך |
| typecheck | `tsc --noEmit` |
| test | רצפות money; **בלי** threshold על `escrow.ts` |
| build | דורש `CI_SUPABASE_*` ציבוריים ל-build |
| e2e | Playwright he-IL; skip אם אין secrets DB |

Concurrency: `ci-${{ github.ref }}`, cancel-in-progress.

Preview Vercel: לעיון ידני; **לא** כותב כסף אמיתי ל-prod DB מ-CI.

---

## 5. Branch protection (יעד)

על ענף המיזוג:

- אין push ישיר  
- required checks: lint, typecheck, test, build (+ e2e כשמוכן)  
- linear history מומלץ  
- אין force push  

מיגרציות remote: MCP בלבד, לא `db push` מ-CI.

---

## 6. חוב קוד מתועד (לא פתוח כמדיניות)

אם בריפו הראשי עדיין מופיעים:

- `DEFAULT_PLATFORM_COMMISSION*`  
- threshold ל-`escrow.ts`  
- טסטי HMAC Cardcom  

אלה באגים מול CONTRADICTIONS / PRICING-RULES. המדיניות כאן: **להסיר**, לא "לחכות להחלטה על default 5%".

---

## 7. Acceptance

- [ ] אין `DEFAULT_PLATFORM_COMMISSION` / default 5% כעמלה פתוחה  
- [ ] אין HMAC גוף כדרישת CI  
- [ ] אין Escrow held בטסטים  
- [ ] percent מפורש בכל טסט settlement  
- [ ] statutory cancellation fee מופרד מ-commission  
- [ ] CI: lint/typecheck/test/build מתועדים כשערים  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-07 | טיוטה אנגלית עם HMAC / escrow / DEFAULT 5% (מיושן) |
| 2026-08-06 | QA באנר על ארבעה תיקונים |
| 2026-08-12 | batch-2 #37: BINDING מלא; סעיף 0.1 Assert אין commission default; הסרת 5% כ-open/current |
