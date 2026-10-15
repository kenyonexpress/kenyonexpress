# KenyonExpress — Project State

Updated: 2026-10-14 (Asia/Bangkok). Queue: FINAL-CLOSEOUT L1 to L16, issued 14.10.

## Current Position

**המשך מ: שלב L10 (BUILD GAPS), השורות שנותרו: 1/27/29 (חיפוש בכותרת ומגה-מניו, סותרות כלל קיים), 13 (IndexedDB + Background Sync), 14, 16, 17, 23, 25, ואז מסלול הכסף (19, 20, 22) אחד לכל PR. הבא: מסלול הכסף 19, 20 (22 הועברה) (14 ו-25 ממתינות ל-245/244, 17 חלקית, 16 מושהית) (חבילת contact), ואז מסלול הכסף. 16 נדחתה: סותרת מיגרציה 232 וכלל המודל העסקי, ממתינה לאישור. 25 (עגלה נטושה): קוד הועבר, ממתין למיגרציה 244 (BLOCKED-MIGRATION), בלי קופון. סגורות: 2, 4, 6, 8, 9, 15, 18, 21, 24, 26, 28, 30, 29 (אדמין), 3 (חוץ מדירוג ופופולריות), 5 (פר-דפדפן), 10 (חוץ משעות שירות)**

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
- Row 24: the post-purchase push prompt is rendered on the paid return page.
- Row 30: the till camera asks for QR plus four 1D formats the device
  supports. Unit tested only; no physical barcode was scanned.
  511 files, 5959 tests, build exit 0.
- Row 28: `category-tree.ts` ported from prod. Product breadcrumb and JSON-LD
  walk the full ancestor chain; the admin category action now refuses parent
  cycles and depth over three, server-side. 512 files, 5996 tests, build 0.
  The category page's own trail is still one hop.
- Row 3, search page: a sort control of four links (relevance, newest, price
  up, price down) in the results header (`SearchSortNav.tsx`). 512 files, 6003
  tests, build 0. Built server, two-result query: cards follow the engine's
  order and reverse between the two price sorts. Not measured: CLS of the new
  header line (a hidden copy of the line holds its height in the shell).
- Row 3, discount on search: `sort=discount_desc`, from a stored
  `discount_bp` on the index document. 512 files, 6006 tests, build 0. Built
  server, database engine, three queries: order correct, but the largest
  result set was two products. Meilisearch itself was not exercised: it needs
  the settings re-applied and a full reindex before it sorts on the new field
  (until then it refuses and the database fallback answers).
- Row 2, facets on the search page: supplier, discount threshold and a
  category tree. 512 files, 6019 tests, build 0. Built server, live data,
  database engine: facet counts equal filtered totals for two suppliers,
  three thresholds, three categories. The tree's nesting is unit-tested only:
  all 13 live categories are roots. Meilisearch not exercised. The category
  pages did not get these facets.
- Row 4, infinite scroll: both listings at 24 a page (D-45), next page
  appended on scroll, Back restores the loaded pages and the offset. 515
  files, 6041 tests, build 0. Chromium on a built server, `/products`: 24
  then 46 cards, Back to the same offset, fresh visit at the top, numbered
  links present without script. A category second page was not seen in a
  browser: no live category has more than 24 products.
- Row 4, a mistake caught by the build: an edit script deleted
  `generateMetadata` and `generateStaticParams` from the category page. Tests,
  type-check and lint all passed without them. Restored from git before
  commit; every removed line of both pages was then read.
- Row 5, recently viewed: ported from prod, plus a home rail below the deals
  grid. 517 files, 6052 tests, build 0. Chromium, built server: empty on a
  first visit, two cards on the third product viewed, three on home. Home
  parity gate 10.93 / 10.61 / 7.81. Row stays PARTIAL: per-account history
  needs a table (migration, not written).
- Row 9, urgency timers: voucher countdown ported from prod (voucher page
  and order page), deadline badge on listing cards within a week of
  `offer_valid_until`. 519 files, 6067 tests, build 0. Unit tests only: no
  live product has a deadline, and the voucher pages need a signed-in
  customer with a coupon.
- Row 10, trust bar: payment, cancellation policy and contact at the foot of
  the product page and the cart. 520 files, 6070 tests, build 0. Chromium at
  380 and 1440: present, no overflow. Product parity 4.30 / 4.18 / 2.06. The
  cart gate has no reference and gave no number. Support hours are not
  printed: none are recorded anywhere. Needs the real hours from Ofir.
- Row 6, wishlist hearts: provider, heart and guest list ported from prod;
  hearts on both card types. 522 files, 6096 tests, build 0. Chromium,
  signed out, 380 and 1440: 24 hearts, save without navigating, survives a
  reload. Signed-in path and merge: unit tests only.
- Row 8, social proof: "N bought this week" ported from prod, plus a
  24-hour count from the same rows. 525 files, 6122 tests, build 0. Live
  data has zero paid items in the trailing week, so the line is absent on
  every page and was not seen rendered with a number.
- Row 15, admin KPIs: redemption and refund rates ported from prod; active
  vouchers and payouts due added. 526 files, 6131 tests, build 0.
  The loader's filters run read-only on live data: 19 issued / 4 redeemed /
  2 voided in 30 days, 18 active, 0 statements due. Page not opened in a
  browser (needs an admin session).
- Row 13, offline queue: ported from prod and wired into `/scan`. 528 files,
  6156 tests, build 0. Unit tests only, five of them on the screen. Not run
  on a real till: that needs a supplier session and burns a live voucher.
  Stays PARTIAL: localStorage, no IndexedDB, no Background Sync.
- Row 26, comparison: toggle on listing cards, bar above the grid, table at
  `/products/compare`. 531 files, 6178 tests, build 0. Chromium at 380 and
  1440 with live data: pick three, table of three, remove one, reload keeps
  two. `/compare` itself is a legacy URL answered 410, which is why the page
  is not there; the route-inventory test is what caught it.
- Row 21, gift cards: guarded admin switch for `is_gift_card`, printable QR
  with the code in the URL fragment, link from the wallet. 534 files, 6195
  tests, build 0. Chromium: fragment prefill works and no request carried the
  code. No gift card exists live, so the QR was not seen for a real card.
  Two repo guards fired during the work and were followed: QR encoding only
  through `lib/vouchers/qr-image.ts`, and `requireAdminSession` for the switch.
- Row 20, flash deals: admin form and action ported, cancel button and a
  link added. 535 files, 6210 tests, build 0. The ported page claimed a
  five-minute cadence; main's cron is daily at 03:00 UTC, and the page now
  says so. Stays PARTIAL: no end time, banner or countdown, and a daily cron
  cannot run an afternoon deal (plan and schedule question for Ofir).
- Row 23, club tiers: display ported from prod onto `/account`, thresholds
  from a pending table (`243_club_tiers.sql`, not applied) with compiled
  fallback. 539 files, 6246 tests, build 0. Live `club_tiers` is PGRST205,
  so the fallback is what runs. No perks; card says so.
- Row 25, abandoned cart: second reminder ported from prod (route, mail
  builder, tests). 542 files, 6271 tests, type-check and lint clean, build 0
  (needs the main checkout's env sourced; this worktree has no .env.local).
  `244_abandoned_cart_second_reminder.sql` written to pending, NOT applied:
  BLOCKED-MIGRATION. Degrades to one mail per cart until then. No coupon.
  A goal line said "next L2"; the queue here has no L2 to L8, so the order in
  this file was followed (D-decision, conservative).
- Row 16, reviews: NOT built, decision taken alone (15.10). Migration 232
  (applied) is headed "reviews are collected, not published" and records that
  the business model shows no review content to visitors; a public list or a
  star summary reverses it, and `claude/BUSINESS-MODEL-RULES.md` named in the
  goal does not exist in this checkout to say otherwise. Owner edit needs an
  UPDATE grant 232 also removed. Conservative reading: leave it, ask Ofir to
  confirm the rule has changed before 247 (prod's anon SELECT grant) is ported.
- Row 17, Q&A: only the zero-migration piece exists, prod's WhatsApp
  `ProductQuestionLink`. It rides on a contact subsystem main lacks
  (`lib/contact/channels`, `inquiry-links`, `no-outbound-whatsapp` test), so
  it is a port of five files and a rule, not a component. Not started.
  Next: row 14 (supplier wizard, three steps from prod, tables in 204).
- Row 14, supplier wizard (16.10): three steps ported from prod, page at
  `/suppliers/apply`. 546 files, 6308 tests, type-check and lint clean, build
  0. `245_supplier_onboarding.sql` pending, NOT applied: BLOCKED-MIGRATION,
  the page is dead until then. Two rate-limit keys added and documented. Not
  seen in a browser. Products, hours and review steps not built.
- Row 17, Q&A (16.10): click-to-chat product question link built natively
  (prod's version needs an i18n layer and a contact subsystem main lacks, so
  it was not ported). 547 files, 6309 tests, lint and type-check clean, build
  0. Product parity gate REFUSED (no refs in this worktree): unmeasured. Stored
  Q&A not built, same publishing question as row 16.
- Row 22, referral payout (16.10, money path, own PR): `pay.ts` ported
  without the mail, `complete.ts` follows `ready_to_pay`. 549 files green
  locally, type-check clean. Mail to both sides open (needs outbox kind
  migration written for main's own kind list, plus a builder). Not checked
  that 098 is applied on the hosted project.
- L11 to L16 (16.10): BLOCKED, no specification. `docs/FINAL-CLOSEOUT.md`
  holds only the titles (Growth plumbing, Hardening, Phase 2 behind flags,
  Launch gate, Regression and tag, Maintenance); the issuing prompt of 14.10
  is not in the repo, `claude/BUSINESS-MODEL-RULES.md` does not exist, and
  git history only has the unrelated autopilot L11/L12 of another queue.
  Inventing scope for a launch gate and for tags rc3 to rc5 would produce
  evidence that measures nothing, so none was started and no tag was made.
  Needs the L11 to L16 text. Meanwhile L10 rows 19 and 20 wait on decisions
  (see BIG-SITE-GAP notes), row 16 on the publishing rule.
- L15 (16.10): regression gates run on 83d9aed34 (row 22 branch, stacked on
  row 25/14/17): type-check 0, lint 0, test 548 files / 6316 passed / 12
  skipped, build 0 (BUILD_ID Lj26ZJGFC_PYnrH-EP-el). One test
  (`invoices.test.ts`) failed only when the real `.env.local` was sourced,
  because credentials exist there; it passes in a clean env. Tag
  `v2.0.0-rc3` created LOCALLY, not pushed. It certifies the regression gates,
  not a launch: L11 to L14 have no scope text and were not run. rc4 and rc5
  wait for those.
- L16 maintenance, 16.10 00:10: backup written to
  `~/Desktop/kenyonexpress-backup-2026-10-16-0009.tar.gz` (853 MB, listing
  verified), oldest of four pruned so three remain (pre-approved exception).
  Sleep prevention live (two caffeinate processes, sleep 0). The loop script
  was not checked by name: pgrep cannot see the inline `bash -c while`.
- 14.10: other autopilot sessions (STEP 69, 70) run in
  `/Users/ofir/kenyonexpress-autopilot` on another branch. This checkout
  showed no foreign edits, so work continued.
- Disk: the build died once with ENOSPC. Later the temp directory was cleared
  by something else and free space is 20 GB. 658 MB free after a clean rebuild.
  Nothing outside this checkout's own `.next` was removed. 1.6 GB sits in
  another session's temp directory (`3d900add...`), three desktop backups are
  0.8 GB each. The next build may fail the same way.
- 14.10: Ofir sent the Upstash console URL with no instruction. The code is
  already wired to `UPSTASH_REDIS_REST_URL` / `_TOKEN`; neither is in
  `.env.local`, Vercel not checked. Nothing was changed. Belongs to L12.

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
