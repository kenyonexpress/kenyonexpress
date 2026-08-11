# Changelog

Status: **BINDING (process)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
פורמט: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

היסטוריה לפני 2026-08-03: git + `STATE.md`.

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| C1 | רשומות **מכאן והלאה** בלבד; לא רטרו מלא. |
| C2 | סעיפים: Added / Changed / Fixed / Removed / Docs. |
| C3 | docs batch-2: commit **נפרד** לכל מסמך. |
| C4 | No Escrow בכל docs חדשים. |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| CHANGELOG = STATE.md | תפקידים נפרדים |
| auto-gen from git | noise |
| Escrow entries as current | No Escrow |

---

## 3. סכמת DB

אין DDL. Changelog = תהליך תיעוד.

---

## 4. מקרי קצה

| # | מצב |
|---|---|
| E1 | Unreleased pile-up | squash at release |
| E2 | doc-only vs code | tag Docs section |
| E3 | duplicate entry | one line per PR |

---

## 5. פתוחות

| # | פער |
|---|---|
| O1 | release tag v1.0 | when go-live |

---

## [Unreleased]

### Docs (2026-08-12 batch-2)

- תבנית BINDING 5 סעיפים ל-23 מסמכי audit/index/root
- No Escrow; הסרת dumps 1000+ שורות → snapshot + git history

### Docs (2026-08-10)

- Launch pack: MOBILE-APP, LAUNCH-VALIDATION, RUNBOOK-LAUNCH-DAY
- PAYOUT-MECHANISM (BINDING)
- launch-week-plan, NOTIFICATIONS, SEO-PERFORMANCE

### Docs (2026-08-07)

- QA pass ROADMAP-V2 #1-20: No Escrow, קישורים הדדיים
- CONTRADICTIONS C11א

### Docs (2026-08-06)

- ROADMAP-V2 QA; PERSONAL-AREA P7

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | process BINDING header |
| 2026-08-03 | changelog start |
