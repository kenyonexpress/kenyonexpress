# KenyonExpress — Project State

Updated: 2026-10-14 (Asia/Bangkok). Queue: FINAL-CLOSEOUT L1 to L16, issued 14.10.

## Current Position

**המשך מ: שלב L10 (BUILD GAPS), שורה 3: בקרת מיון בדף החיפוש, ואז שורה 2 (facets). סגורות: 18, 29 (אדמין), מיון לפי הנחה**

The checklist with evidence is `docs/FINAL-CLOSEOUT.md`. Decisions taken alone
are `docs/DECISIONS.md` D-42 onward.

## L10: in progress (14.10)

Closed so far, each with type-check, lint, test green (510 files, 5949 passed):

- Row 18, related products: ranked by shared tags, then a 30% price band, then
  newest (`src/lib/related-ranking.ts`). Build exit 0 with this change. Live
  check: `products.tags` is empty on all 46 active products, so only price
  reorders anything today.
- Row 29, admin half: the admin product list searches name, SKU or slug
  (`src/lib/admin/product-search.ts`). The header half waits on note A.

- Row 3, discount sort: `?sort=discount_desc` on category and `/products`,
  derived from the two prices (`src/lib/catalogue/discount-sort.ts`). Verified
  on a built server against live prices, first eight in the expected order.
  511 files, 5955 tests, build exit 0. Rating and popularity sorts still fall
  through: no column holds either.

Open: 21 rows on main, about 52 working days by the matrix estimate. Order to
take them: 3, 2, 4, 9, 10, 6, 8, 5, then the rows with migrations, then the
money-path rows (19, 20, 22) last and one per pull request.

## L9: closed (14.10, merged, PR #65)

`docs/BIG-SITE-GAP.md`, 30 rows, read-only from code on both lines.

- main: 6 EXISTS, 16 PARTIAL, 8 MISSING. prod: 9 / 16 / 5.
- About 54 working days to bring main to all EXISTS.
- Nine rows are further along on prod; L10 ports those rather than rewriting.
- Rows 1, 27 and half of 29 contradict `no-search-ui.test.ts` and the recorded
  decision against a mega panel. The queue is newer, so L10 builds them and
  rewrites the test with the reason in the same commit.
- Public reviews need a pending grant migration (232 revoked anon SELECT).

## L1: closed (14.10, merged as `c6911b8e1`, PR #64)

Measured with the harness env stripped (`env -i`), `CARDCOM_USE_MOCK` unset:

- `pnpm type-check` exit 0, `pnpm lint` exit 0, `pnpm build` exit 0.
- `pnpm test`: 508 files, 5934 passed, 12 skipped. Before the new file: 507 / 5913.
- `packages/money/tests/invariants.test.ts`: 21 tests, green.
- Landmine fixed: required check `Diff-scoped lint gates` was red on PR #62
  (`product-page.css 159 -> 162`, the gate counts px literals inside comments).
  Local re-run over `origin/main...HEAD`: no new hardcoded values.

Decisions (details in `docs/DECISIONS.md`):

- D-42: there is no `packages/money.ts`. The test imports `src/lib/money.ts`.
- D-43: VAT stays extracted from a VAT-inclusive price. The queue's
  `floor(subtotal * vat / 100)` on top would raise every total by 18%.
- D-44: work lands on `main` through pull requests. `audit/final-audit` is not
  touched and no migration is applied.
- Commits carry the model that wrote them (Opus 5.5). The queue's trailer named
  Opus 4.7 and another session's URL; neither describes this session.

## Still true from 13.10, and still open

- **Production serves `audit/final-audit` (`1e84df0e5`), not `main`.** `main` is
  1,242 commits behind it and 122 ahead; `src/` differs by 1,395 files. The two
  lines carry colliding migration numbers (211, 235 to 242).
- `claude/MANUAL.md` item 1 (which branch is the release line) has no answer.
  The 14.10 queue says `main`, so `main` it is, per D-44. Features built on
  `main` in L10 do not reach customers until that is resolved.
- Production migration ledger: 162 rows, last `20260910085722`. Nothing applied
  since 10.09. Nothing applied by this queue.
- PR #63 (heading fix ported to the production branch) is a draft. Merging it
  deploys to production.

## Rules in force

- Never apply a migration, never push to `audit/final-audit`, never `git add -A`.
- Run build, test, start and `git commit` under `env -i` (the shell injects
  placeholder secrets and `CARDCOM_USE_MOCK=true`).
- `main` is protected: PR plus five required checks (`Diff-scoped lint gates`,
  `Typecheck (changed files)`, `Unit tests + money coverage floors`, `Build`,
  `pr-size-guard`). A PR over 50 commits is refused.
- The Cursor agent owns the `ke-arch` worktree. Not touched from here.

## Local servers

- 3311 and 3711 each have a `next start` listening. The L1 build rewrote
  `.next` in this checkout, so a server started from it before 14.10 serves a
  stale build. Restart by listener PID before measuring anything.
