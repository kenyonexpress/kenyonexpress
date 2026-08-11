# ארכיטקטורה: Wallet Integer (agorot cutover)

תכנית בטוחה: מעבר מלא לכסף ב-**integer agorot**, יישור `fn_wallet_transfer`, וסגירת SEC-WALLET.  
לא להריץ מיגרציית cutover בלי אישור מפורש וחלון תחזוקה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין held/נאמן/J5 לקופון.

מסמכים קשורים:

```
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-SECURITY.md
docs/GAPS-CODE-VS-DOCS.md
docs/BACKUP-RESTORE-RUNBOOK.md
```

---

## 1. החלטה

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
| WI10 | כל חישוב עובר דרך `src/lib/money.ts` כנתיב יחיד. |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| `numeric(10,2)` ILS כמקור אמת | float/עיגול שקלי יוצר סטיית אגורה; G5 ב-GAPS מתעד את הבעיה. |
| cutover "בבת אחת" (rename + deploy בלי twin) | שובר קוד שעדיין קורא `*_ils`; drift בין DB לשרת. |
| השארת `EXECUTE` ל-`authenticated` "זמנית" | SEC-WALLET: מיניט יתרות; אין חריג לטסט. |
| המרה ב-JS עם `Number()` / `parseFloat` | לא SafeInteger; כשל על סכומים גדולים. |
| Escrow wallet לספק במקביל ל-cutover | No Escrow; דומיינים נפרדים; לא לערבב בחבילה אחת. |
| `db push` ליישום 059 | אסור; מיגרציה ב-`migrations/pending` + MCP בלבד. |

---

## 3. סכמת DB

**אין DDL חדש במסמך זה.** Cutover מתוכנן על סכמה קיימת + קבצי pending (למשל `059_money_integer_units.sql`).  
לא להחיל על prod בלי חלון ואישור.

### טבלאות קריטיות (מצב יעד)

| טבלה | ישן (legacy) | חדש (canonical) |
|---|---|---|
| `wallet_entries` | `amount_ils` | `amount_agorot` |
| `wallet_accounts` | `balance_ils` (cache) | `balance_agorot` |
| `order_items` / snapshots | עמודות ILS | `*_agorot` לפי D3 |

### `fn_wallet_transfer` (חתימת יעד)

```sql
fn_wallet_transfer(
  p_debit_account uuid,
  p_credit_account uuid,
  p_amount_agorot int,          -- STRICT > 0
  p_reason wallet_reason,
  p_idempotency_key text
) RETURNS uuid
```

EXECUTE: `service_role` בלבד. Idempotency: UNIQUE על `idempotency_key`.

מפתחות earn/spend: `order:{id}:cashback`, `order:{id}:spend`.

---

## 4. שלבי cutover (תמצית)

### 4.1 שלב A: SEC-WALLET

```sql
REVOKE ALL ON FUNCTION public.fn_wallet_transfer(/* exact args */)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_wallet_transfer(/* exact args */)
  TO service_role;
```

יעד: `anon_exec=false`, `auth_exec=false`, `service_exec=true`.

### 4.2 שלב B: עמודות twin

1. `ADD COLUMN IF NOT EXISTS foo_agorot integer/bigint`  
2. Backfill: `foo_agorot = round(foo_ils * 100)::bigint`  
3. Verify drift = 0  
4. **עדיין לא** DROP/RENAME של `*_ils` עד שכל הקוד קורא agorot  

### 4.3 שלב C-E

- Deploy קוד שמדבר agorot בלבד  
- Smoke: earn/spend/idempotency replay  
- אחרי יציבות: rename/drop legacy + עדכון `v_wallet_ledger`  

Rollback: PITR לפני rename; אין "תיקון ידני" של יתרות בלי journal נגדי.

---

## 5. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | קוד שולח אגורות לפונקציה שמצפה ל-ILS | זיכוי ×100; חסימה בטests + verify חתימה לפני deploy |
| E2 | replay אותו `idempotency_key` | journal קיים; אין כפילות |
| E3 | spend במקביל על יתרה דקה | `FOR UPDATE` + יתרה ≥ amount; אחד נכשל |
| E4 | cutover חלקי (DB agorot, קוד ILS) | `CHECKOUT_ENABLED=false`; PITR |
| E5 | backfill drift (ILS×100 ≠ agorot) | DO block עם RAISE; לא prod |
| E6 | PUBLIC EXECUTE נשאר אחרי recreate | query SEC-WALLET חוסם merge |
| E7 | float ב-finalize אחרי cutover | CI gate על money path |
| E8 | אחוז cashback עם float | `floor` באגורות בלבד |

---

## 6. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | תאריך חלון cutover prod | ממתין לאישור מפורש + גיבוי PITR | 2026-08-12 |
| O2 | `fn_wallet_transfer_agorot` vs rename ישיר | prefer wrapper זמני אם חתימה חיה שונה | 2026-08-12 |
| O3 | סגירת G5 ב-GAPS | אחרי מדידה post-cutover | 2026-08-12 |
| O4 | N ימים לפני drop legacy | ≥7 ימים יציבים + drift=0 | 2026-08-12 |

---

## 7. Acceptance

- [ ] `authenticated` לא יכול EXECUTE ל-transfer  
- [ ] אין `p_amount_ils` בנתיב החי  
- [ ] כל תנועות ארנק חדשות באגורות integer  
- [ ] G5 נסגר בתיעוד אחרי מדידה  
- [ ] אין float ב-finalize wallet  
- [ ] UI מציג ₪ נכון (agorot/100 רק לתצוגה)  
- [ ] No Escrow לא נשבר ב-cutover  
- [ ] חלופות שנדחו + DB + מקרי קצה + פתוחות מתועדים  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | תכנית בטוחה: SEC-WALLET + money-integer cutover |
| 2026-08-12 | batch-2: BINDING מלא; תבנית חובה (החלטה, חלופות, DB, קצה, פתוחות) |
