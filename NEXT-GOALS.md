# NEXT-GOALS

Status: **BINDING (queue)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
מודל: **No Escrow** · כסף: agorot · migrations: MCP only

תור מלא (~770 שורות): git history לפני commit זה.

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| Q1 | תור [1]-[64] **סגור** (FINAL-REPORT). |
| Q2 | goals 9-20: **19/20 done**; goal 15 wallet integer **blocked** (no migration). |
| Q3 | **שער הבא:** GO-LIVE human gates (suppliers, Cardcom, DNS). |
| Q4 | compare home gate **נסגר** ([20]: 24%→11.5%). |
| Q5 | L1 product p95 **עדיין FAIL** (~750-1120ms vs 800ms). |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| wallet agorot before schema | x100 bug |
| db push migrations | MCP only |
| skip GO-LIVE audit [13] | found real blockers |
| Escrow completion goals | No Escrow |

---

## 3. סכמת DB

| item | status |
|---|---|
| money integer PENDING | blocked |
| 104 RLS | pending approval |
| payout 027 | not applied |

---

## 4. מקרי קצה

| # | goal | note |
|---|---|---|
| E1 | [15] wallet | 52 files read ILS names |
| E2 | [19] L1 | product perf |
| E3 | [20] home compare | inline width:auto bug fixed |
| E4 | [11] search | QStash optional |
| E5 | [13] GO-LIVE | 11 suppliers incomplete |

---

## 5. פתוחות (תור הבא)

| # | goal |
|---|---|
| O1 | GO-LIVE blockers (GO-LIVE.md) |
| O2 | goal 15 wallet (after migration approval) |
| O3 | L1 product perf budget |
| O4 | docs-batch-2 (this branch) |
| O5 | launch 10 deals → suppliers |

---

## תור קצר (סטטוס)

| range | status |
|---|---|
| [1]-[12] commerce core | ✅ |
| [13] GO-LIVE audit | ✅ |
| [14]-[20] import, LH, load, final | ✅ |
| [21]-[64] (see STATE.md) | ✅ |
| goals 9-20 | ✅ except 15 ⛔ |
| post-launch | GO-LIVE + human gates |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING wrapper; queue → git history |
| 2026-08-03 | goals 9-20 |
