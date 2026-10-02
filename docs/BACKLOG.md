# Backlog: manual items for Ofir

Created 2026-09-29 (M15-c51) as the single canonical list. Before this file
existed, `STATE.md` and `docs/LAUNCH-READINESS.md` each kept their own
"ידני לאופיר" list, and the two had drifted: different migration numbers,
two items present in one and missing from the other (the catalogue decision,
the `cron-jobs.json`/`main` mismatch), two more present in `STATE.md`'s
blockers but never carried into its own action list (`RESEND_API_KEY`, the
ח.פ line). This file merges both, in the order that a real customer would
hit them, deduplicated. `STATE.md` and `docs/LAUNCH-READINESS.md` now point
here instead of keeping their own copy — see each file's own evidence
sections (STATE.md "חוסמים פתוחים", LAUNCH-READINESS.md "Blocking line")
for the measurement behind each item; this file lists the action and its
source, not the evidence itself.

Nothing here is an action an agent may take alone (Vercel env, DNS, secret
rotation, a value only Ofir has, or a decision the ledger says is an
operator's, not the agent's — see `CLAUDE.md`'s stop conditions).

**Re-checked 2026-09-29 (M15-c52) against `git log -20`:** still 15 items,
same order, no duplicate, no new item. Only item 4's commit count changed
(47 -> 66, git-only, production not re-probed).

**Updated 2026-09-29 (M18-c52):** item 5's file list gained `247` (`anon`
holds zero grants on `public.reviews`, measured read-only against
production; see `migrations/pending/247_reviews_grant_anon_select.sql`).

**Re-checked 2026-09-29 (M15-c53) against `git log -20`:** still 15 items,
same order, no duplicate, no new item. Item 1 (DNS) was already RESOLVED
(M01-c52) but this file's own wording still called it an open action; fixed
below. Item 4's commit count changed again (66 -> 83, git-only). Item 7's
finding count was wrong since 2026-09-10: the ledger
(`supabase/catalogue-known-issues.json`) holds 26 rows, not 25 — a
`no-image` entry (`מזקקת וויסקי`, empty images array) was added in the same
commit (`00375d705`) that introduced the other 25 and the count was never
corrected anywhere; fixed below.

**Re-checked 2026-09-29 (M15-c54) against `git log -20`:** still 15 items,
same order, no duplicate, no new item. Nine code-change commits landed since
M15-c53 (M06-c54..M14-c54); none touched a blocking line or added a manual
item — see `STATE.md` for each one's own DONE entry. Item 4's commit count
changed again (83 -> 101, `git rev-list --count a388118f1..HEAD`, git-only,
production not re-probed this item). Item 7's finding count (26) re-checked
against the ledger, unchanged.

**Re-checked 2026-09-29 (M15-c55) against `git log -20`:** still 15 items,
same order, no duplicate, no new item. Sixteen commits landed since M15-c54
(M01-c55..M14-c55); only two touched code (`posthog-js` patch bump, M04-c55;
new `refund-requests` branch-coverage tests, M10-c55), neither touched a
blocking line or added a manual item. Item 4's commit count changed again
(101 -> 118, `git rev-list --count a388118f1..HEAD`, git-only, production
not re-probed this item — M01-c55's own deploy attempt measured 105 on the
same day, before nine more commits landed). Item 7's finding count (26)
re-checked directly against `supabase/catalogue-known-issues.json`'s
`known` object, unchanged.

**Re-checked 2026-09-29 (M09-c55) via a direct read-only Vercel API call
(`filter_project_envs`, no value decrypted) on all 39 env vars of project
`kenyonexpress`:** item 3 and item 8 both confirmed unchanged (still no
`CARDCOM_TERMINAL_NUMBER`/`API_NAME`/`API_PASSWORD` in Production, still
`ALLOW_INCOMPLETE_ENV` set, `SUPABASE_SECRET_KEY` still flagged
`readable-secret` by Vercel itself). Same call surfaced that
`CARDCOM_WEBHOOK_SECRET` also carries the `readable-secret` flag — not
previously recorded anywhere. No new numbered item: rotating it is the same
Ofir-only action as item 8 (secret rotation), just a second key needing it;
folded into item 8's wording below rather than given its own number.

**Re-checked 2026-09-29 (M15-c56) against `git log -20`:** still 15 items,
same order, no duplicate, no new item. Fourteen commits landed since
M15-c55 (M01-c56..M14-c56); only two touched code (`posthog-js` patch
bump, M04-c56; new `orders/status-transitions.ts` branch-coverage tests,
M10-c56), neither touched a blocking line or added a manual item. Item 4's
commit count changed again (118 -> 136, `git rev-list --count
a388118f1..HEAD`, git-only, production not re-probed this item). Item 5's
18-file list re-checked directly against `migrations/pending/`, all
present, no new file. Item 7's finding count (26) re-checked directly
against `supabase/catalogue-known-issues.json`'s `known` object,
unchanged.

**Re-checked 2026-09-30 (M15-c57) against `git log f96702549..HEAD`:**
still 15 items, same order, no duplicate, no new item. Sixteen commits
landed since M15-c56 (M16-c56..M18-c56, M01-c57..M14-c57); only two
touched code (`money-format.ts` branch-coverage tests, 20.83% to 100%,
M10-c57; two minor 0.x dependency bumps, `@anthropic-ai/sdk` and
`@supabase/ssr`, M04-c57), neither touched a blocking line or added a
manual item. Item 4's commit count changed again (136 -> 153, `git
rev-list --count a388118f1..HEAD`, git-only, production not re-probed
this item). Item 5's 18-file list re-checked directly against
`migrations/pending/`, all present, no new file. Item 7's finding count
(26) re-checked directly against
`supabase/catalogue-known-issues.json`'s `known` object, unchanged. Item
15's stash count (32) re-checked with `git stash list`, unchanged.

**Re-checked 2026-09-30 (M15-c58) against `git log e636a64f9..HEAD`:**
still 15 items, same order, no duplicate, no new item. Seventeen commits
landed since M15-c57 (M16-c57..M18-c57, M01-c58..M14-c58); only two
touched code (`refund-wallet.ts` branch-coverage test, M10-c58; one
minor dependency bump, `@aws-sdk/client-s3`+`@aws-sdk/s3-request-presigner`,
M04-c58), neither touched a blocking line or added a manual item. Item
4's commit count changed again (153 -> 171, `git rev-list --count
a388118f1..HEAD`, git-only, production not re-probed this item). Item
5's 18-file list re-checked directly against `migrations/pending/`, all
present, no new file. Item 7's finding count (26) re-checked directly
against `supabase/catalogue-known-issues.json`'s `known` object,
unchanged. Item 15's stash count (32) re-checked with `git stash list`,
unchanged.

**Re-checked 2026-09-30 (M15-c59) against `git log 456becb9c..HEAD`:**
still 15 items, same order, no duplicate, no new item. Seventeen commits
landed since M15-c58 (M16-c58..M18-c58, M01-c59..M14-c59); only two
touched a path this file's items depend on (`pnpm-lock.yaml`
`caniuse-lite` bump, M04-c59; `payment-money-columns.test.ts` test-only,
M10-c59), neither touched a blocking line or added a manual item. Item
4's commit count changed again (171 -> 189, `git rev-list --count
a388118f1..HEAD`, git-only, production not re-probed this item). Item
5's 18-file list re-checked directly against `migrations/pending/`, all
present, no new file. Item 7's finding count (26) re-checked directly
against `supabase/catalogue-known-issues.json`'s `known` object,
unchanged. Item 12's `dns-watch.sh` process re-checked with `pgrep -fl`,
still pid 957 under `caffeinate` pid 999, unchanged. Item 15's stash
count (32) re-checked with `git stash list`, unchanged.

**Re-checked 2026-09-30 (M15-c60) against `git log a353fa3db..HEAD`:**
still 15 items, same order, no duplicate, no new item. Seventeen commits
landed since M15-c59 (M16-c59..M18-c59, M01-c60..M14-c60); none touched
code on a path this file's items depend on (`git diff --stat
a353fa3db..HEAD -- src/ next.config.ts next.config.mjs package.json
pnpm-lock.yaml vercel.json supabase/ migrations/` returns only three
test files: `bought-this-week.test.ts`, `stock-live.test.ts`,
`scan-context.test.ts`). Item 4's commit count changed again (189 ->
207, `git rev-list --count a388118f1..HEAD`, git-only, production not
re-probed this item). Item 5's 18-file list re-checked directly against
`migrations/pending/`, all present, no new file. Item 7's finding count
(26) re-checked directly against `supabase/catalogue-known-issues.json`'s
`known` object, unchanged. Item 12's `dns-watch.sh` process re-checked
with `pgrep -fl`, still pid 957 under `caffeinate` pid 999, unchanged.
Item 15's stash count (32) re-checked with `git stash list`, unchanged.

**Re-checked 2026-09-30 (M08-c61) against `git log 466ebc6fa..HEAD`:**
still 15 items, same order, no duplicate, no new item. Ten commits
landed since M15-c60 (M16-c60..M18-c60, M01-c61..M07-c61); only two
touched a path this file's items depend on (`fast-xml-parser` patch
bump, M04-c61, `package.json`+`pnpm-lock.yaml`), neither touched a
blocking line or added a manual item (`git diff --stat
466ebc6fa..HEAD -- docs/BACKLOG.md migrations/pending
supabase/catalogue-known-issues.json src/ next.config.ts
next.config.mjs package.json pnpm-lock.yaml vercel.json supabase/`
confirms). Item 4's commit count changed again (207 -> 218, `git
rev-list --count a388118f1..HEAD`, git-only, production not
re-probed this item). Item 5's 18-file list re-checked directly
against `migrations/pending/`, all present, no new file (59 files
total). Item 7's finding count (26) re-checked directly against
`supabase/catalogue-known-issues.json`'s `known` object, unchanged.
Item 15's stash count (32) re-checked with `git stash list`,
unchanged. All 15 items remain actions this file's own preamble
excludes an agent from taking alone; no phase 1 item available for
the queue task this cycle (M08-c61 result: BACKLOG EMPTY).

**Re-checked 2026-09-30 (M15-c61) against `git log 466ebc6fa..HEAD`:**
still 15 items, same order, no duplicate, no new item. Seventeen commits
landed since M08-c61's own check point (M16-c60..M18-c60, M01-c61..M14-c61);
only the `fast-xml-parser` patch bump (M04-c61, `package.json`+
`pnpm-lock.yaml`, dev-only) and this file's own re-check note touched a
tracked path — `git diff --stat 466ebc6fa..HEAD -- docs/BACKLOG.md
migrations/pending supabase/catalogue-known-issues.json src/ next.config.ts
next.config.mjs package.json pnpm-lock.yaml vercel.json supabase/` confirms
(`docs/BACKLOG.md` +20/-0 from M08-c61's own note, `package.json` +1/-1,
`pnpm-lock.yaml` +18/-18). Item 4's commit count changed again (207 -> 225,
`git rev-list --count a388118f1..HEAD`, git-only, production not re-probed
this item). Item 5's 18-file list re-checked directly against
`migrations/pending/`, all present, no new file (59 files total). Item 7's
finding count (26) re-checked directly against
`supabase/catalogue-known-issues.json`'s `known` object, unchanged. Item
12's `dns-watch.sh` process re-checked with `pgrep -fl`, still pid 957
under `caffeinate` pid 999, unchanged. Item 15's stash count (32)
re-checked with `git stash list`, unchanged. `type-check`, `lint` (12
gates) and `test` (610/610 files, 7296/7308) all re-run clean this item;
`build` not re-run — ~48 `next-server`/`pnpm start` processes were running
concurrently (~63MB RAM free, `vm_stat`), and the existing `.next`
(`BUILD_ID` `JvTmoHwdiXPpaSeOjzjaw`) was confirmed source-identical to HEAD
(`git diff --stat 8fd11aae4..HEAD -- next.config.ts next.config.js
middleware.ts vercel.json src/ package.json` returns empty).

**Re-checked 2026-09-30 (M08-c62) against `git log 2bb473ad4..HEAD`:**
still 15 items, same order, no duplicate, no new item. Nineteen commits
landed since M08-c61's own check point (M09-c61..M18-c61, M01-c62..M07-c62);
`git diff --stat 2bb473ad4..HEAD -- docs/BACKLOG.md migrations/pending
supabase/catalogue-known-issues.json src/ next.config.ts next.config.mjs
package.json pnpm-lock.yaml vercel.json supabase/` shows only two things:
this file's own re-check notes (M15-c61), and the `RecentlyViewedRail`
feature (M18-c61, PDP-only: `src/app/(store)/product/[slug]/page.tsx`,
`src/components/storefront/RecentlyViewedRail.tsx`,
`src/lib/recently-viewed/guest-storage.ts`,
`src/server/actions/recently-viewed.ts`,
`src/server/actions/auth-coverage.test.ts`) — a phase 1 item from a prior
cycle's queue, already shipped, not a `BACKLOG.md` entry. Counts
re-checked directly: `migrations/pending/*.sql` 59, `git stash list` 32,
`supabase/catalogue-known-issues.json`'s `known` object 26, `dns-watch.sh`
still pid 957 under `caffeinate` pid 999 — all unchanged from M08-c61. All
15 items remain actions this file's own preamble excludes an agent from
taking alone (DNS, Vercel env/secrets, production deploy/migration
approval, catalogue business decision, data deletion). No phase 1 item
available for the queue task this cycle (M08-c62 result: BACKLOG EMPTY).

**Re-checked 2026-09-30 (M15-c62) against `git log 947553fa0..HEAD`:**
still 15 items, same order, no duplicate, no new item. Six commits landed
since M08-c62's own check point (M09-c62..M14-c62); `git diff --stat
947553fa0..HEAD -- docs/BACKLOG.md migrations/pending
supabase/catalogue-known-issues.json src/ next.config.ts next.config.mjs
package.json pnpm-lock.yaml vercel.json supabase/` returns empty — none
touched a blocking line, a pending migration, or the catalogue ledger.
Item 4's commit count changed again (225 -> 245, `git rev-list --count
a388118f1..HEAD`, git-only, production not re-probed this item). Item
5's 18-file list re-checked directly against `migrations/pending/`, all
present, no new file (59 files total). Item 7's finding count (26)
re-checked directly against `supabase/catalogue-known-issues.json`'s
`known` object, unchanged. Item 12's `dns-watch.sh` process re-checked
with `pgrep -fl`, still pid 957 under `caffeinate` pid 999, unchanged.
Item 15's stash count (32) re-checked with `git stash list`, unchanged.
Small drift found and fixed elsewhere (not a `BACKLOG.md` item): `pnpm
lint`'s `docs-path-audit` gate moved from 152 to 154 known dangling
references back in M11-c62 (`docs/known-dangling-paths.json` updated in
`5e994b7c1`), but `docs/LAUNCH-READINESS.md` kept quoting 152 as
"unchanged since M15-c55" through M15-c61; corrected in this item.
`type-check`, `lint` (12 gates) and `test` (610/610 files, 7296/7308) all
re-run clean this item; `build` not re-run — the existing `.next`
(`BUILD_ID` `VMhGIoPRaTGiEQMEutFaQ`, from M14-c62's own fresh `pnpm
build`) was confirmed source-identical to HEAD (`git log -1 --
next.config.ts next.config.mjs middleware.ts vercel.json src/
package.json pnpm-lock.yaml` points at `fd820969f`, earlier than the
build).

**Re-checked 2026-09-30 (M08-c63) against `git log 947553fa0..HEAD`:**
still 15 items, same order, no duplicate, no new item. `git diff --stat
947553fa0..HEAD -- docs/BACKLOG.md migrations/pending
supabase/catalogue-known-issues.json src/ next.config.ts next.config.mjs
package.json pnpm-lock.yaml vercel.json supabase/ scripts/cron-jobs.json`
shows only four paths: this file's own re-check notes (M08-c62, M15-c62),
the `next`/`@next/mdx`/`next-intl`/`posthog-js` patch bump (M04-c63,
`package.json`+`pnpm-lock.yaml`), and the `RecentlyViewedRail`/wishlist
heart feature (M18-c62, `src/components/ProductCard.tsx`) — a prior
cycle's queue item, not a `BACKLOG.md` entry. None touched a blocking
line, a pending migration, or the catalogue ledger. Counts re-checked
directly: `migrations/pending/*.sql` 59, `git stash list` 32,
`supabase/catalogue-known-issues.json`'s `known` object 26, `dns-watch.sh`
still pid 957 under `caffeinate` pid 999 — all unchanged from M15-c62.
Item 4's commit count changed again (245 -> 256, `git rev-list --count
a388118f1..HEAD`, git-only, production not re-probed this item). All 15
items remain actions this file's own preamble excludes an agent from
taking alone (DNS, Vercel env/secrets, production deploy/migration
approval, catalogue business decision, data deletion). No phase 1 item
available for the queue task this cycle (M08-c63 result: BACKLOG EMPTY).

**Re-checked 2026-09-30 (M15-c63) against `git log 947553fa0..HEAD`:**
still 15 items, same order, no duplicate, no new item. Twenty commits
landed since M15-c62's own check point (M16-c62..M18-c62, M01-c63..M14-c63);
`git diff --stat 947553fa0..HEAD -- docs/BACKLOG.md migrations/pending
supabase/catalogue-known-issues.json src/ next.config.ts next.config.mjs
package.json pnpm-lock.yaml vercel.json supabase/` confirms only the same
three things M08-c63 already found (this file's own re-check notes, the
dependency patch bump, and the wishlist-heart feature) — none touched a
blocking line, a pending migration, or the catalogue ledger. Counts
re-checked directly: `migrations/pending/*.sql` 59, `git stash list` 32,
`supabase/catalogue-known-issues.json`'s `known` object 26,
`dns-watch.sh` still pid 957 under `caffeinate` pid 999 — all unchanged
from M08-c63. Item 4's commit count changed again (256 -> 263, `git
rev-list --count a388118f1..HEAD`, git-only, production not re-probed
this item). `type-check`, `lint` (12 gates, docs-path-audit 154,
docs-index 282) and `test` (610/610 files, 7296/7308) all re-run clean
this item; `build` not re-run — the existing `.next` (`BUILD_ID`
`D4-tHth7KvanPpP6tU41c`) was confirmed built after the last
build-relevant commit (`0428b4726`, M04-c63) by file mtime. All 15 items
remain actions this file's own preamble excludes an agent from taking
alone.

**Re-checked 2026-09-30 (M08-c64) against `git log 947553fa0..HEAD`:**
still 15 items, same order, no duplicate, no new item. Thirty-five
commits landed since M15-c63's own checkpoint; `git diff --stat
947553fa0..HEAD -- docs/BACKLOG.md migrations/pending
supabase/catalogue-known-issues.json src/ next.config.ts next.config.mjs
package.json pnpm-lock.yaml vercel.json supabase/
scripts/cron-jobs.json` shows only `docs/BACKLOG.md` (this file's own
re-check notes), the dependency patch bump (M04-c63,
`package.json`+`pnpm-lock.yaml`), and the star-rating-row feature
(M18-c63, `src/components/ProductCard.tsx`+`src/lib/related-products.ts`)
— a prior cycle's queue item, not a `BACKLOG.md` entry. None touched a
blocking line, a pending migration, or the catalogue ledger. Counts
re-checked directly: `migrations/pending/*.sql` 59, `git stash list` 32,
`supabase/catalogue-known-issues.json`'s `known` object 26,
`dns-watch.sh` still pid 957 under `caffeinate` pid 999 — all unchanged
from M15-c63. Item 4's commit count changed again (263 -> 274, `git
rev-list --count a388118f1..HEAD`, git-only, production not re-probed
this item). All 15 items remain actions this file's own preamble
excludes an agent from taking alone. No phase 1 item available for the
queue task this cycle (M08-c64 result: BACKLOG EMPTY).

**Re-checked 2026-10-01 (M15-c64) against `git log 8d3abea1e..HEAD`:**
still 15 items, same order, no duplicate, no new item. Six commits
landed since M08-c64's own checkpoint (M09-c64..M14-c64); `git diff
--stat 8d3abea1e..HEAD -- docs/BACKLOG.md migrations/pending
supabase/catalogue-known-issues.json src/ next.config.ts next.config.mjs
package.json pnpm-lock.yaml vercel.json supabase/ scripts/cron-jobs.json`
returns empty — none touched a blocking line, a pending migration, or
the catalogue ledger (all six were re-verification docs commits, each
its own DONE entry in `STATE.md`). Counts re-checked directly:
`migrations/pending/*.sql` 59, `git stash list` 32,
`supabase/catalogue-known-issues.json`'s `known` object 26,
`dns-watch.sh` still pid 957 under `caffeinate` pid 999 — all unchanged
from M08-c64. Item 4's commit count changed again (274 -> 281, `git
rev-list --count a388118f1..HEAD`, git-only, production not re-probed
this item). `type-check`, `lint` (12 gates, docs-path-audit 154,
docs-index 282, i18n 627) and `test` (610/610 files, 7296/7308) all
re-run clean this item; `build` not re-run — the existing `.next`
(`BUILD_ID` `SnN_M0tY4BUXd564swDgn`) was confirmed built after the last
build-relevant commit (`00587d376`, M18-c63) by file mtime. All 15
items remain actions this file's own preamble excludes an agent from
taking alone.

**Re-checked 2026-10-01 (M08-c65) against `git log 8d3abea1e..HEAD`:**
still 15 items, same order, no duplicate, no new item. Seven commits
landed since M15-c64's own checkpoint (M09-c64..M07-c65); `git diff
--stat 8d3abea1e..HEAD -- docs/BACKLOG.md migrations/pending
supabase/catalogue-known-issues.json src/ next.config.ts next.config.mjs
package.json pnpm-lock.yaml vercel.json supabase/ scripts/cron-jobs.json`
shows only this file's own re-check note (M15-c64) — none touched a
blocking line, a pending migration, or the catalogue ledger (all seven
were re-verification docs commits, each its own DONE entry in
`STATE.md`). Counts re-checked directly: `migrations/pending/*.sql` 59,
`git stash list` 32, `supabase/catalogue-known-issues.json`'s `known`
object 26 — all unchanged from M15-c64. `dns-watch.sh` still running
(pid 976, was 957 at M15-c64 — restarted between items at an unmeasured
point, still under `caffeinate`). Item 4's commit count changed again
(281 -> 292, `git rev-list --count a388118f1..HEAD`, git-only,
production not re-probed this item). `type-check`, `lint` (12 gates,
docs-path-audit 154, docs-index 282, i18n 627) and `test` (610/610
files, 7298/7310) all re-run clean this item; `build` re-run fresh
(`rm -rf .next && CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:3533 pnpm build`), exit 0. All 15
items remain actions this file's own preamble excludes an agent from
taking alone. No phase 1 item available for the queue task this cycle
(M08-c65 result: BACKLOG EMPTY).

**Re-checked 2026-10-01 (M15-c65) against `git log 97cd36b06..HEAD`:**
still 15 items, same order, no duplicate, no new item. Seventeen commits
landed since M08-c65's own checkpoint (M09-c65..M14-c65, M01-c65..M07-c65
already covered there — the new ones are M09-c65..M14-c65); `git diff
--stat 97cd36b06..HEAD -- docs/BACKLOG.md migrations/pending
supabase/catalogue-known-issues.json src/ next.config.ts next.config.mjs
package.json pnpm-lock.yaml vercel.json supabase/ scripts/cron-jobs.json`
shows only `STATE.md`/`docs/BACKLOG.md` (re-check notes) and the
star-rating-row feature (M18-c64, `ProductCard.tsx`, `ProductRail.tsx`,
`lib/homepage/rails.ts`, `lib/reviews/rating-summaries.ts`,
`lib/related-products.ts`) — a prior cycle's queue item, not a
`BACKLOG.md` entry. None touched a blocking line, a pending migration,
or the catalogue ledger. Counts re-checked directly: `migrations/pending/
*.sql` 59, `git stash list` 32, `supabase/catalogue-known-issues.json`'s
`known` object 26 — all unchanged from M08-c65. `dns-watch.sh` still
running, now pid 976 (confirmed again, was 976 already at M08-c65,
957 before that) under `caffeinate` pid 5220/5222 (PIDs rotate across
sessions, process is alive both times). Item 4's commit count changed
again (292 -> 299, `git rev-list --count a388118f1..HEAD`, git-only,
production not re-probed this item). `origin/main` is 673 behind HEAD
and 109 ahead (`git rev-list --count origin/main..HEAD` /
`HEAD..origin/main`, up from 655/109 at M15-c64). `type-check`, `lint`
(12 gates, docs-path-audit 154, docs-index 282, i18n 627) and `test`
(610/610 files, 7298/7310) all re-run clean this item; `build` not
re-run — the existing `.next` (`BUILD_ID` `aXUCoo7ksZar07MnhBJ43`,
mtime 01.10 08:36) was confirmed built after the last build-relevant
commit (`857a0deea`, M18-c64, 01.10 01:11) by file mtime. All 15 items
remain actions this file's own preamble excludes an agent from taking
alone.

**Re-checked 2026-10-01 (Q55) against `git diff --stat cad66a650..HEAD`:**
still 15 items, same order, no duplicate — **one new file, not a new
item**: `migrations/pending/248_supplier_storefront_public_columns_grant.sql`
(Q32, a grant only) folded into item 5's existing file list above (now 19
files, was 18). 43 commits landed since the M15-c65 checkpoint
(`cad66a650`); `git diff --stat cad66a650..HEAD -- docs/BACKLOG.md
migrations/pending supabase/catalogue-known-issues.json src/
next.config.ts next.config.mjs package.json pnpm-lock.yaml vercel.json
supabase/ scripts/cron-jobs.json` shows only this file's and `STATE.md`'s
own re-check notes, `.github/workflows/ci.yml` (Q54, CI wiring, not a
`BACKLOG.md` item), `248` and its README note. None touched a blocking
line or the catalogue ledger (re-checked directly, `known` object still
26). `migrations/pending/*.sql` count is 60 (was 59), the delta is 248.
Item 4's commit count changed again (299 -> 336, `git rev-list --count
a388118f1..HEAD`, git-only, production not re-probed this item). `origin/
main` is 710 behind HEAD and 109 ahead (up from 673/109 at M15-c65).
`type-check`, `lint` (12 gates, docs-path-audit 153) and `test` (614/614
files, 7335/7347) all re-run clean this item; `build` not re-run — 14
concurrent `next-server`/`pnpm` processes were running (~1.0GB free,
`vm_stat`) and the existing `.next` was confirmed source-identical to
HEAD by `git diff --stat` on every build-relevant path, empty. The parity
gate was also re-run this item (Q55 is `docs/LAUNCH-READINESS.md`'s own
queue item): home 380/768/1440 all PASS, 8.58%/9.01%/4.16%. All 15 items
remain actions this file's own preamble excludes an agent from taking
alone.

**Re-checked 2026-10-01 (M10-c66), item 5 only, against production
directly (not git):** queue item "Verify migrations/pending/ applied or
file blocker". Using the read-only CLI-keychain-token method against
Supabase's management API (`SELECT` only, no DDL), re-probed every
object the 19-file list creates: 218's `enforce_profile_privilege_columns`
still has no `profiles.supplier_id` to match against (still breaks every
profile UPDATE with `42703`), 223/224/247/248 still lack the
column/grant they add, 204/234/235/236/239/240/243/244 still have no
table, 242 still has no column, and 241 (data-only) still has `city IS
NULL` on its three target rows. All 19 confirmed unapplied, zero drift
from the 25.09 object-level scan. `migrations/pending/*.sql` count
re-checked at 60, unchanged from Q55. No migration applied, no code
change — this item was verification only.

**Re-checked 2026-10-02 (M10-c67), item 5 only, against git (not
production directly — already probed live one day prior in M10-c66):**
queue item "Verify migrations/pending/ applied or file blocker" recurred.
`git diff --stat 7f23dd82e..HEAD -- migrations/pending docs/BACKLOG.md
supabase/migrations src/ next.config.ts package.json pnpm-lock.yaml`
since M10-c66's direct probe shows only this file's own log entry plus
two unrelated files from M09-c67 (`HeroSlider.tsx`, `robots.ts`, no
schema/infra touch). `migrations/pending/*.sql` re-checked at 60,
unchanged; `git log -1 -- migrations/pending/` still points at
`48c8792dd` (248, Q32), older than M10-c66. Zero drift since the direct
production probe; the 19-file blocker stands unchanged. No migration
applied, no code change.

**Re-checked 2026-10-02 (M10-c68), item 5 only, against production
directly again (full per-file, not a sample this time):** queue item
"Verify migrations/pending/ applied or file blocker" recurred a second
time. Same read-only CLI-keychain-token method, but this run queried
every one of the 19 files' own target object individually instead of a
representative subset: 204/234/235/236/239/240/243/244 still have no
table; 218/223/242 still have no column; 224/247/248 still have no
grant (248: 0 of 2 column grants); 220's `fn_wallet_entries_block_mutation`
still has no `proconfig`; 245's three named `banners` policies still
don't exist; 241's three target rows (plus 43 more active products)
still have `city IS NULL`; 209 and 246 were checked at the policy-text
level, not just existence — `push_subscriptions_select_own` and
`cashback_ledger_owner_select` still read `auth.uid() = user_id`
unwrapped (209 §2 not applied), and `profiles_super_admin_mfa`'s qual
matches neither 209's nor 246's proposed rewrite (still the original
policy). All 19 confirmed unapplied, zero drift from M10-c66/M10-c67.
`migrations/pending/*.sql` count re-checked at 60, unchanged. No
migration applied, no code change.

**Re-checked 2026-10-02 (M10-c69), item 5 only, against git again (not
production directly — already probed live same day in M10-c68):** queue
item "Verify migrations/pending/ applied or file blocker" recurred a
third time. `git diff --stat 6a1f9caee..HEAD -- migrations/pending/`
since M10-c68's own direct per-file probe returns empty — zero files
changed, added, or removed. `migrations/pending/*.sql` re-checked at 60,
unchanged; `git log -1 -- migrations/pending/` still points at
`48c8792dd` (248, Q32), older than M10-c68. Because M10-c68's probe was
same-day (not one day prior, as M10-c67's base was), the git-diff-only
pattern from M10-c67 applies here a second time rather than re-running a
fresh production probe. The 19-file blocker (204, 209, 218, 220, 223,
224, 234, 235, 236, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248)
stands unchanged. No migration applied, no code change.

## ידני לאופיר, לפי סדר קריטיות

1. **DNS ברשם — RESOLVED (נמדד 29.09, M01-c52, שורת החסימה עודכנה ב-LAUNCH-READINESS.md ב-M15-c53).**
   ה-NS כבר `ns1.vercel-dns.com` / `ns2.vercel-dns.com`, הדומיין עונה 200 עם
   התוכן האמיתי. שום פעולה נוספת נדרשת מאופיר על הסעיף הזה. מקור: STATE.md
   חוסם 1 (עודכן), LAUNCH-READINESS.md שורה חוסמת 1 (עודכן ב-M15-c53).
2. **`CRON_SECRET` זהה ב-GitHub וב-Vercel.** כרגע 40/40 הרצות מתוזמנות
   נכשלות ב-401 (סוד שונה בכל צד), ו-`notification_outbox` מחזיקה הודעות
   ממתינות מ-10.09. לקרוא את הערך ב-Vercel (פרויקט `kenyonexpress`,
   Production) ולהדביק אותו ב-GitHub Settings > Secrets > Actions >
   `CRON_SECRET`. הריצה הבאה צריכה להראות `notifications -> 200`.
   מקור: STATE.md חוסם 10, LAUNCH-READINESS.md שורה חוסמת 3.
3. **סביבת Production ב-Vercel לפני כל פריסה.** להוסיף
   `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`
   (השמות שהקוד קורא בפועל; `CARDCOM_API_KEY`/`CLIENT_ID`/`MERCHANT_ID`
   הקיימים שם אינם נקראים) ולהסיר `ALLOW_INCOMPLETE_ENV`. בלעדיה
   `deploy-preflight` מסרב לכל build. מקור: STATE.md חוסם 2,
   LAUNCH-READINESS.md שורה חוסמת 4.
4. **אישור פריסת HEAD לפרודקשן**, אחרי סעיף 3. פרודקשן עדיין מגיש
   `a388118f1`, שהיה 22 קומיטים מאחורי ב-25.09, 47 קומיטים מאחורי ב-29.09
   המוקדם (M15-c51), 66 ב-M15-c52, 83 ב-M15-c53, 101 ב-M15-c54, 118
   ב-M15-c55, 122 ב-M01-c56, 136 ב-M15-c56, 153 ב-M15-c57, 171 ב-M15-c58,
   189 ב-M15-c59, 207 ב-M15-c60, 225 ב-M15-c61, 245 ב-M15-c62, 256
   ב-M08-c63, 263 ב-M15-c63, 274 ב-M08-c64, 281 ב-M15-c64, 292 ב-M08-c65,
299 ב-M15-c65, וכעת (01.10, Q55, `git rev-list --count a388118f1..HEAD`, git-only
   — לא נוסתה פריסה חוזרת בפריט הזה) **336** קומיטים מאחורי HEAD (וניסיונות פריסה חוזרים
   ב-M01-c54 וב-M01-c55 סורבו באותה סיבה בדיוק, פרודקשן נשאר על
   `a388118f1`).
   `POST /v13/deployments` עם `gitSource.sha`,
   `target=production`, לפי `docs/RUNBOOK.md`. מקור: STATE.md חוסם 2,
   LAUNCH-READINESS.md שורה חוסמת 4.
5. **החלת המיגרציות הממתינות**, לפי הסדר והתנאים המוקדמים ב-
   `migrations/pending/APPLY-ORDER.md` ו-`docs/RUNBOOK.md` — **לא** לפי
   סדר מספרי גרידא (218 חייב לקדום ל-217, למשל). האיחוד של שתי הרשימות
   שהיו כתובות בנפרד (STATE.md חוסם 3: 218, 245, 246, 204, 240-244;
   LAUNCH-READINESS.md שורה 5: 204, 223, 224, 234-236, 239-244), פלוס 209
   ו-220 שנזכרים כתלות של 245/246 באותה רשומה: **204, 209, 218, 220, 223,
   224, 234, 235, 236, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248**
   (19 קבצים, ‏247 בלי תלות בשום קובץ אחר; **248 נוסף 01.10, Q55/Q32** —
   גרנט `anon`/`authenticated` על `suppliers.opening_hours` ו-
   `google_reviews_url`, אחרי 232 ואחרי 242). אחרי ההחלה: `pnpm db:types` ו-commit.
6. **Cardcom אמיתי.** לבדוק את הערכים של `CARDCOM_API_KEY`/`CLIENT_ID`/
   `MERCHANT_ID` הקיימים בשם ב-Vercel, לקבוע `CARDCOM_USE_MOCK=false` ו-
   `CHECKOUT_ENABLED=true`, לפרוס מחדש (ה-CSP נאפה בזמן build, לא בזמן
   ריצה), ולבצע חיוב אמיתי אחד קטן וזיכוי דרכו. מקור: STATE.md חוסם 8,
   LAUNCH-READINESS.md שורה חוסמת 2. **חוסם גם את שני ה-`TODO(cardcom)`
   היחידים ב-`src/` (`src/lib/payments/cardcom.ts:254`, זיכוי לגאסי,
   ומ-`:319`, מסמכים) — אימות שם/שדה מדויק מול טרמינל חי, מתועד כבר
   ב-`docs/KNOWN-ISSUES.md` סעיף 2 ובקוד עצמו (`Tracked in #41`/`#42`),
   נבדק M07-c67: אין TODO/FIXME אחר ב-`src/` ישן משבעה ימים (שניהם
   מ-24.07/07.08.2026); `src/lib/whatsapp.test.ts:91` אינו סמן עבודה
   אלא מחרוזת ליטרלית `'TODO'` שבודקת דחיית מספר לא מוגדר.
7. **הכרעה על 26 שורות הקטלוג** ב-`supabase/catalogue-known-issues.json`
   (26, לא 25 — שורה `no-image` נוספה ל-`מזקקת וויסקי` ב-00375d705,
   09.09.2026, יחד עם ה-25 האחרות, ומספר הממצאים לא תוקן בשום מסמך מאז;
   תוקן כאן ב-M15-c53):
   אילו משתי ה-`עיסוי מאסטר` הכפולות היא האמיתית, מה המחיר שלה (₪9 או
   ₪108, לפי מה שה-slug של ארבע שורות טוען), מחיקת חמש שורות ה-`-copy`/
   `-העתק`/`-לדוגמא`, ובחירת תמונה ל-`מזקקת וויסקי` (מערך תמונות ריק, אין
   מקור לשחזר ממנו). שום דבר כאן אינו לתיקון אוטומטי — ראו `CLAUDE.md`
   §"מצב נוכחי" סעיף 1. **לא היה ברשימת STATE.md;** מקור:
   LAUNCH-READINESS.md שורה חוסמת 6, `CLAUDE.md`.
8. **רוטציית `SUPABASE_SECRET_KEY`, וגם `CARDCOM_WEBHOOK_SECRET`.** המפתח
   הראשון בשימוש נחשף בהתקנה; מסומן ב-`scripts/compromised-keys.mjs`,
   ו-`deploy-preflight` מסרב לבנות איתו. Vercel מסמן את שניהם
   `readable-secret` (נמדד M09-c55, `filter_project_envs` בקריאה בלבד).
   נוהל ב-`docs/RUNBOOK.md`. מקור: STATE.md חוסם 7, LAUNCH-READINESS.md
   שורה חוסמת 7.
9. **`RESEND_API_KEY` בפרודקשן.** השם קיים ב-target Production אך הערך לא
   נקרא; בלעדיו כל חמשת סוגי המייל נופלים בשקט ל-`skipped` ואיפוס סיסמה
   חוזר ל-SMTP של Supabase. **לא היה ברשימת הפעולות של STATE.md** (רק
   ברשימת החוסמים שלו); מקור: STATE.md חוסם 6.
10. **הפעלת R2 בדשבורד Cloudflare.** בלעדיה תמונות המוצר נופלות ל-Supabase
    Storage וגיבויי ה-DB החיצוניים לא נכתבים. מקור: STATE.md חוסם 4,
    LAUNCH-READINESS.md שורה חוסמת 8.
11. **`scripts/cron-jobs.json` ב-`main`** מכיל שבעה נתיבים שאינם קיימים
    ב-HEAD (`search-reindex`, `job-dlq`, `search-outbox`,
    `cashback-settlement`, `email-retry`, `expire-cashback`,
    `expire-coupons`); כל אחד עונה 404 גם אחרי שסעיף 2 נסגר. נפתר מעצמו
    כשהענף הזה יתמזג ל-`main` (PR, ארבע בדיקות). **לא היה ברשימת
    STATE.md;** מקור: LAUNCH-READINESS.md ידני 9.
12. **`scripts/dns-watch.sh` (pid 976 נכון ל-01.10, M15-c65; היה 957
    עד M08-c65)** עדיין רץ תחת `caffeinate` ומשגר סשן פריסה כשיופיעו NS של Cloudflare; המעבר
    ל-vercel-dns (סעיף 1) לא אמור להפעיל אותו, אבל לבדוק לפני שמפעילים
    משהו אחר. מקור: STATE.md ידני 8, LAUNCH-READINESS.md ידני 10.
13. **מספר עוסק/ח.פ לשורת המוכר** באישור הרכישה: עריכה אחת ב-
    `messages/he.json`, `purchaseConfirmation.sellerName`, ברגע שהערך
    מגיע מאופיר — הסוכן אינו מחזיק אותו. מקור: STATE.md חוסם 9,
    LAUNCH-READINESS.md ידני 11.
14. **כניסה בטלפון (Q17).** ספק SMS בהגדרות ה-auth של Supabase, ואז
    `PHONE_AUTH_ENABLED=true` ב-Vercel. בלעדיהם הכפתור מוסתר והשאר עובד.
    מקור: STATE.md ידני 10, LAUNCH-READINESS.md ידני 12.
15. **32 stash-ים לא נמחקו** (נמדד 29.09, M09-c54; היה רשום כ"עשרה", הרשימה
    המקורית תחת Q01 בארכיון תיארה מצב ישן יותר — `git stash list` מחזיר 32
    כרגע). כלל הפרויקט אוסר מחיקת נתונים בלי אישור מפורש, כך שההכרעה עצמה
    היא של אופיר, לא רק הביצוע. מקור: STATE.md ידני 9, LAUNCH-READINESS.md
    ידני 13.
16. **Meilisearch לא נגיש מפרודקשן, לא רק לא מוגדר** (נמדד 01.10.2026,
    M13-c66, ישירות מול `https://www.kenyonexpress.co.il/api/ready`, ארבע
    פעמים ברצף, יציב). `MEILISEARCH_HOST`/`MEILISEARCH_API_KEY` **קיימים**
    ב-Vercel Production (נבדק בקריאה-בלבד, `filter_project_envs`, אין ערך
    שנפתח) — ולכן `checkSearch` ב-`src/lib/health/checks.ts` מדווח `down`
    ולא `not_configured`, וה-API מחזיר `503` על `/api/ready` ("ok":false).
    **לא חוסם לקוח כרגע**: `/api/search?q=test` עונה `200` בפרודקשן ברגע
    המדידה, כלומר הנפילה ל-Postgres ILIKE עובדת כמתועד. **לא לתיקון
    אוטומטי**: הסוכן לא יכול לבדוק את מארח/מפתח Meilisearch בלי לפענח סוד,
    ואין לו גישה לדשבורד השירות החיצוני. אופיר: לבדוק שהאינסטנס של
    Meilisearch חי ושה-`MEILISEARCH_HOST`/`MEILISEARCH_API_KEY` ב-Vercel
    תואמים לו, אחרת `/api/ready` ימשיך לדווח `503` לכל מוניטור שמסתכל עליו.
    מקור: M13-c66 (אין רשומה קודמת בשום קובץ). **נמדד שוב ב-02.10.2026,
    M13-c67, אפס דריפט**: `/api/health` `200` (`database:"ok"`), `/api/ready`
    עדיין `503` עם `meilisearch:"down"` זהה, `redis:"ok"`,
    `r2`/`cardcom` עדיין `not_configured` (תואם חוסמים 4 ו-8 למעלה, לא ממצא
    חדש).
17. **`SENTRY_DSN` ו-`NEXT_PUBLIC_SENTRY_DSN` חסרים ב-Production של
    הפרויקט שמגיש את הדומיין** (נמדד 01.10.2026, M14-c66, `filter_project_envs`
    קריאה-בלבד על `kenyonexpress`/`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`). קיים
    שם רק `SENTRY_AUTH_TOKEN` (משרת העלאת source maps בזמן build בלבד).
    שלושת קובצי האתחול (`sentry.server.config.ts`, `sentry.edge.config.ts`,
    `instrumentation-client.ts`) קוראים `Sentry.init({ dsn:
    process.env.SENTRY_DSN, ... })` ישירות בלי שומר, כך שבלי הערך ה-SDK
    מאותחל עם `dsn: undefined` ואינו שולח שום אירוע. **לא ממצא חדש
    לגמרי**: תואם לזיכרון `sentry-is-live-and-unread` (נמדד 10.09: 203
    מתוך 206 אירועים ב-30 יום מתויגים `development`, אפס `production`),
    אבל לא היה רשום כפעולה בשום קובץ בריפו עד כה. כתוצאה מכך גם אי אפשר
    לדעת מה קורה בפועל בייצור בזמן אמת (שגיאה בצ'קאאוט, קריסת hydration),
    וגם `release` (מקושר ל-`VERCEL_GIT_COMMIT_SHA`) לעולם לא מגיע מפרודקשן,
    גם כשסעיף 4 (פריסת HEAD) ייסגר. להוסיף את שני המשתנים ב-Vercel
    Production (הערכים כבר ב-Sentry project `kenyonexpress-web`,
    `https://de.sentry.io`), ואז לפרוס מחדש (הערך נאפה בזמן build, לא
    runtime). מקור: M14-c66 (אין רשומה קודמת כפעולה בשום קובץ). **נמדד
    שוב ב-02.10.2026, M14-c67, אפס דריפט**: `filter_project_envs` על אותו
    פרויקט עדיין לא מחזיר `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`, רק
    `SENTRY_AUTH_TOKEN`; שלושת קובצי האתחול זהים (אין קומיט שנגע בהם
    מאז `db5999d33`); הפריסה החיה (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`)
    עדיין בנויה מ-`a388118f1`, עכשיו **370** קומיטים מאחורי HEAD
    (`6bd25c638`), לא 285. **נמדד שוב ב-02.10.2026, M14-c68, אפס דריפט**:
    אותה פריסה חיה בדיוק (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, עדיין
    `a388118f1`), `filter_project_envs` על אותו פרויקט עדיין לא מחזיר
    `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`, שלושת קובצי האתחול זהים
    (`git log db5999d33..HEAD` עליהם ריק). הפער גדל שוב: **388** קומיטים
    מאחורי HEAD (`c258defa0`). **נמדד שוב ב-02.10.2026, M14-c69, אפס
    דריפט**: אותה פריסה חיה בדיוק (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`,
    עדיין `a388118f1`), `filter_project_envs` על אותו פרויקט (רשימה מלאה,
    לא רק סינון) עדיין לא מחזיר `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`, רק
    `SENTRY_AUTH_TOKEN`; שלושת קובצי האתחול זהים (`git log db5999d33..HEAD`
    עליהם ריק). הפער גדל שוב: **406** קומיטים מאחורי HEAD (`75271d80d`).
    **נמדד שוב ב-02.10.2026, M14-c70, אפס דריפט**: אותה פריסה חיה בדיוק
    (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, `githubCommitSha=a388118f1`),
    `filter_project_envs` על אותו פרויקט (רשימה מלאה) עדיין לא מחזיר
    `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`, רק `SENTRY_AUTH_TOKEN`; שלושת
    קובצי האתחול זהים (`git log ac81a815f..HEAD` עליהם ריק, בסיס M14-c69).
    הפער גדל שוב: **425** קומיטים מאחורי HEAD (`61e7acb8e`).
    **נמדד שוב ב-02.10.2026, M14-c71, אפס דריפט**: אותה פריסה חיה בדיוק
    (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, `githubCommitSha=a388118f1`),
    `filter_project_envs` על אותו פרויקט (רשימה מלאה) עדיין לא מחזיר
    `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`, רק `SENTRY_AUTH_TOKEN`; שלושת
    קובצי האתחול זהים (`git log ac81a815f..HEAD` עליהם ריק, בסיס M14-c70).
    הפער גדל שוב: **443** קומיטים מאחורי HEAD (`c614b252b`).
18. **`scripts/compare.mjs` נותן PASS נמוך-כוזב כש"שלנו" ריק, לא FAIL גבוה.**
    נמדד 01.10.2026, M01-c67: שרת `pnpm start` ישן על פורט 3311 המשיך
    לרוץ אחרי ש-`.next` נבנה מחדש על ידו (או סשן מקביל), כך שה-HTML שהוא
    הגיש הצביע על chunk CSS (`0oqc5n8s89_s4.css`) שלא קיים יותר בדיסק —
    `404`/`500`, הדף נשלף בלי עיצוב. התוצאה לא הייתה FAIL גבוה אלא
    `0.77%` **PASS** (שורות `16:39`-`16:44` ב-`docs/UI-PARITY-REPORT.md`,
    מתוך `OVERALL 30.13%`, `ours blank 25.24%`): כש"שלנו" כמעט ריק כולו,
    אזור ה-"both painted" שבו הציון בפועל נמדד מצטמצם כמעט לאפס, והציון
    יוצא נמוך במקום גבוה. זה בדיוק הדפוס ש-`docs/PARITY-REFERENCE.md`
    כבר תיעד על הצד השני (דף מול עצמו מניב כמעט אפס) — "אף אחד לא חוקר
    PASS" — רק שכאן זה לא דף מול עצמו אלא build שבור מול ה-reference
    הקפוא. בנייה נקייה מחדש (`rm -rf .next && pnpm build`) ושרת טרי פתרו
    ונתנו את המספרים האמיתיים (14.11%/16.03%/15.45% overall, ציון בפועל
    8.58%/9.01%/4.16%, PASS אמיתי). **לא לתיקון אוטומטי**: זה דורש
    שינוי בלוגיקת הציון של `compare.mjs` עצמו (למשל סף מינימלי על אחוז
    ה-"both painted" מתוך גובה הדף, אחרת ריקנות אמיתית תמשיך לעבור PASS
    בלי שאיש יבדוק). מקור: M01-c67 (אין רשומה קודמת בשום קובץ).

## מה לא ברשימה, ולמה

`docs/MIGRATION-BACKLOG.md` ו-`docs/POST-LAUNCH-BACKLOG.md` הם קבצים
נפרדים, לא תורים פעילים (הראשון ריק לפי הבאנר שלו, השני "כל מה שנדחה
במכוון") — נבדק ונרשם ב-B02..M08-c1, בארכיון. הפריט הזה (M15-c51) אינו
נוגע בהם.
