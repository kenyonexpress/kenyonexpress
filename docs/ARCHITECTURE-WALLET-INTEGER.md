# ארכיטקטורה: Wallet Integer (agorot cutover)

תכנית בטוחה: מעבר מלא לכסף ב-**integer agorot**, יישור `fn_wallet_transfer`, וסגירת SEC-WALLET.  
לא להריץ מיגרציית cutover בלי אישור מפורש וחלון תחזוקה.

Status: **BINDING (plan)** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #17/50  
אין שינוי קוד כאן. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין held/נאמן/J5 לקופון.

מסמכים קשורים:

```
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-SECURITY.md
docs/GAPS-CODE-VS-DOCS.md
docs/ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md
docs/ARCHITECTURE-COMMERCE.md
docs/SECURITY-AUDIT-CHECKLIST.md
docs/BACKUP-RESTORE-RUNBOOK.md
```

רקע מדיד:

- G5 ב-`GAPS-CODE-VS-DOCS.md`: הקוד ממיר ל-float כי RPC מקבל `p_amount_ils`.  
- D3 ב-MASTER-CHECKOUT: יעד אגורות מאושר; קבצי `PENDING-money-integer-fix.sql` / `059_money_integer_units.sql` **אסורים להחלה עיוורת** בלי cutover קוד.  
- SEC-WALLET: `EXECUTE` ל-`fn_wallet_transfer` חייב להיות `service_role` בלבד.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| WI1 | מקור אמת לכל סכום כסף: **`bigint`/`integer` אגורות** (1 ₪ = 100). |
| WI2 | UI מציג ₪; המרה רק בשכבת תצוגה / Cardcom Amount. |
| WI3 | `fn_wallet_transfer` יעד: `p_amount_agorot int` (לא `numeric` ILS). |
| WI4 | SEC-WALLET נסגר **לפני או באותה חבילה** כמו שינוי חתימה: `REVOKE` מ-PUBLIC/anon/authenticated. |
| WI5 | סדר: אבטחה → עמודות twin → קוד קורא agorot → rename legacy → drop. |
| WI6 | מיגרציות prod רק MCP, אחת-אחת, עם שאילתות אימות. |
| WI7 | `CHECKOUT_ENABLED=false` בחלון cutover כסף. |
| WI8 | אין float בנתיבי finalize / spendWallet אחרי cutover. |
| WI9 | חישובי אחוזים דרך helpers באגורות (למשל `percentageOf`), לא `* 0.01` ב-float. |

---

## 1. סיכונים אם מריצים לא נכון

| סיכון | תוצאה | הפחתה |
|---|---|---|
| קוד עדיין קורא `*_ils` אחרי rename | מחירים ×100 או קריסה | feature flag / deploy אטומי |
| `fn_wallet_transfer` עדיין `numeric` + קוד שולח אגורות | זיכוי מאית | בדיקת חתימה + טסטים |
| PUBLIC EXECUTE נשאר | מיניט יתרות (SEC-WALLET) | REVOKE ראשון |
| Backfill drift | חוסר איזון ledger | DO block עם RAISE |
| שחזור חלקי | DB/קוד לא תואמים | PITR + rollback plan |
| float ב-finalize | סטיית אגורה / כפילות | שער CI על money path |

---

## 2. שלב A: אבטחה (SEC-WALLET): מיידי

לפני כל שינוי סכמה גדול:

```sql
-- התאם חתימה לפונקציה החיה לפני REVOKE
REVOKE ALL ON FUNCTION public.fn_wallet_transfer(/* exact args */)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_wallet_transfer(/* exact args */)
  TO service_role;
```

אימות:

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid),
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.nspname
WHERE n.nspname = 'public' AND p.proname = 'fn_wallet_transfer';
```

יעד: `anon_exec=false`, `auth_exec=false`, `service_exec=true`.

הגנה נוספת (מומלץ בגוף אחרי recreate): דחיית קריאה כש-`auth.uid()` לא null ואינו admin.

ראה `ARCHITECTURE-SECURITY.md`.

---

## 3. שלב B: עמודות twin (agorot) בלי שבירת קוד

דפוס:

1. `ADD COLUMN IF NOT EXISTS foo_agorot integer/bigint`  
2. Backfill: `foo_agorot = round(foo_ils * 100)::bigint` איפה ש-null  
3. Verify drift = 0  
4. **עדיין לא** DROP/RENAME של `*_ils` עד שכל הקוד קורא agorot  

טבלאות קריטיות לארנק:

| טבלה | ישן | חדש |
|---|---|---|
| `wallet_entries` | `amount_ils` | `amount_agorot` |
| `wallet_accounts` (cache) | `balance_ils` | `balance_agorot` |
| כללי cashback | סכומי ILS | `*_agorot` / percent נשאר numeric לתצוגת אחוז בלבד |

הזמנות/תשלומים: לפי D3 / 059; לא לערבב באצ' אחד בלי רשימת קבצי אפליקציה.

---

## 4. שלב C: יישור `fn_wallet_transfer`

### 4.1 חתימת יעד

```sql
fn_wallet_transfer(
  p_debit_account uuid,
  p_credit_account uuid,
  p_amount_agorot int,          -- STRICT > 0
  p_reason wallet_reason,       -- או text
  p_idempotency_key text
  -- אופציונלי: order_id, meta
) RETURNS uuid
```

### 4.2 גוף

- כתיבת `amount_agorot` בלבד  
- Idempotency UNIQUE  
- יתרת משתמש לא שלילית אחרי העברה  
- SECURITY DEFINER + `search_path` קשיח  
- EXECUTE רק ל-`service_role`  

### 4.3 תאימות זמנית

עומס יתר לפונקציה ישנה **אסור** אם מבלבל ILS/agorot. עדיף:

1. Deploy קוד שמדבר רק agorot לפונקציה חדשה `fn_wallet_transfer_agorot`  
2. החלפת קריאות  
3. Drop/rename הישנה  

מפתחות נשארים: `order:{id}:cashback`, `order:{id}:spend`.

---

## 5. שלב D: cutover קוד (אפליקציה)

רשימת נגיעה מינימלית (לא לערוך במסמך זה):

- `finalize.ts` / spend wallet: להסיר `/ 100` ו-float  
- admin wallet adjust  
- תצוגת `/account/wallet`  
- טסטים שמניחים `amount_ils`  
- helpers ב-`src/lib/money.ts` כנתיב יחיד  

שערים לפני הפעלת checkout:

- [ ] Vitest money modules ירוקים  
- [ ] E2E: רכישה עם ארנק (sandbox)  
- [ ] יתרה לפני/אחרי באגורות זהה לציפייה  
- [ ] SEC-WALLET query ירוק  
- [ ] אין `Number`/`parseFloat` על סכומי כסף בנתיב החי  

---

## 6. שלב E: ניקוי legacy

אחרי ≥ N ימים יציבים:

1. RENAME `amount_ils` → `amount_ils_legacy` (או DROP אם מדיניות מאפשרת)  
2. NOT NULL + CHECK על עמודות agorot  
3. עדכון views (`v_wallet_ledger`)  
4. תיעוד ב-STATE + GAPS (סגירת G5/D3)

---

## 7. תכנית rollback

| שלב שנכשל | פעולה |
|---|---|
| A בלבד | לא נדרש rollback כסף; רק הרשאות |
| B (twin) | DROP עמודות agorot החדשות אם ריקות/לא בשימוש |
| C/D | Instant Rollback קוד + השארת twin; `CHECKOUT_ENABLED=false` |
| אחרי rename | PITR לנקודה לפני המיגרציה (BACKUP-RESTORE) |

אין "תיקון ידני" של יתרות בלי journal נגדי.

---

## 8. סדר ביצוע מומלץ (צ׳קליסט)

1. [ ] גיבוי/PITR מאומת  
2. [ ] `CHECKOUT_ENABLED=false`  
3. [ ] שלב A: SEC-WALLET REVOKE + אימות  
4. [ ] שלב B: twin columns + drift 0  
5. [ ] Deploy קוד שכותב/קורא agorot (feature flag אם אפשר)  
6. [ ] שלב C: פונקציית transfer באגורות + GRANT  
7. [ ] Smoke: earn/spend/idempotency replay  
8. [ ] `CHECKOUT_ENABLED=true`  
9. [ ] ניטור 48ש: אין drift ב-`v_wallet_balance_drift`  
10. [ ] שלב E בניקוי מאוחר  

---

## 9. אין float בנתיב הכסף (חוק קבוע)

| מותר | אסור |
|---|---|
| `bigint`/`int` אגורות ב-DB ובשרת | `float` / `double` / `Number` על סכום |
| `numeric` רק לאחוז rule (לא לסכום) | `amount_ils` כמקור אמת אחרי cutover |
| המרה ל-₪ רק ב-UI / Cardcom string | `* 0.01` בשרשרת חישוב |
| `floor` באגורות | עיגול כפול בשקלים |

כל חישוב עובר דרך:

```
src/lib/money.ts
```

---

## 10. Acceptance

- [ ] `authenticated` לא יכול EXECUTE ל-transfer  
- [ ] אין `p_amount_ils` בנתיב החי  
- [ ] כל תנועות ארנק חדשות באגורות integer  
- [ ] G5 נסגר בתיעוד אחרי מדידה  
- [ ] אין float ב-finalize wallet  
- [ ] UI מציג ₪ נכון (agorot/100 רק לתצוגה)  
- [ ] No Escrow לא נשבר ב-cutover  

---

## 11. מה לא לעשות

1. להריץ 059 / PENDING על פרוד בלי cutover קוד.  
2. לשלוח אגורות לפונקציה שעדיין מצפה לשקלים.  
3. להשאיר PUBLIC EXECUTE "רק לטסט".  
4. לעגל באחוזים עם float במקום helper באגורות.  
5. לערבב payout ספקים עם ארנק משתמש (דומיינים נפרדים).  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | תכנית בטוחה: SEC-WALLET + money-integer cutover |
| 2026-08-12 | batch-2 #17: רענון BINDING על `arch/docs-batch-2`; No Escrow מאושר |
| 2026-08-12 | batch-2 #17 pass-2: cutover מלא; חוק no-float על money path |
