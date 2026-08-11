# GO-LIVE

צ'קליסט העלאה לאוויר kenyonexpress.co.il.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
מודל: **No Escrow** · רקע: `ARCHITECTURE-DEPLOYMENT.md`

---

## 1. החלטה (מחייבת)

| # | שער |
|---|---|
| G1 | **אין go-live** עד כל ⛔ ירוק. |
| G2 | tests: 1823+/1823, E2E 191 pass, compare <11% (3 ריצות). |
| G3 | **11/11 suppliers** חסרים address+logo = חוסם נתונים. |
| G4 | **0** money E2E בפרוד (4 orders, 0 vouchers). |
| G5 | Cardcom prod + DNS + env = **אופיר**. |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| soft-open בלי Cardcom | no charges |
| invent supplier address | שליח לקוחות לכתובת שגויה |
| Hobby cron 6 jobs | Pro או merge routes |
| Escrow go-live | No Escrow |

---

## 3. סכמת DB

| מדד (07.08 prod) | ערך |
|---|---:|
| suppliers | 11 |
| products active | 61 |
| orders | 4 |
| vouchers | 0 |
| migrations applied | 107, 108 |

---

## 4. מקרי קצה

| # | מצב |
|---|---|
| E1 | compare first request spike (~11%) |
| E2 | edit active product blocked (supplier gate) |
| E3 | cron without CRON_SECRET → 401 fail-closed |
| E4 | auth leaked password protection off |
| E5 | 6 cron vs Hobby limit |

---

## 5. פתוחות (⛔)

| # | פריט | סטטוס |
|---|---|---|
| O1 | supplier address/logo (11/11) | **open** |
| O2 | Cardcom production | **open** |
| O3 | DNS cutover | **open** |
| O4 | 6 crons / plan | **open** |
| O5 | end-to-end purchase smoke | **open** |

### ✅ נסגר (נשאר לאימות חוזר)

- migration numbering conflict (`e4b580f`)
- `vercel.json` + expire-vouchers cron
- favorites/history removed from shell

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING batch-2 |
| 2026-08-07 | audit [57] |
| 2026-08-01 | measured pass |
