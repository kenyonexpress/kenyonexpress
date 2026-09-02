# KenyonExpress: final report

Rewritten 2026-09-02 for MEGA BLOCK 6 (CI/CD + launch checklist). Earlier
revisions claimed `main` was ~300 commits behind and that PR #6 was unmerged.
Both stopped being true on 2026-09-01. They are corrected here rather than
quietly deleted.

## The one-line version

**NOT READY for production domain cutover. READY as a stage-1 codebase.**

The site is live at `kenyonexpress.vercel.app`, serving the real catalogue,
with no WordPress runtime. Stage 1 (the Next.js platform) is tagged
`v1.0.0-rc1`. Moving `kenyonexpress.co.il` onto that deployment is blocked by
scheduler, Cardcom, DNS, and nine pending SQL files. None of those four is
a missing page in the app.

## Architecture decisions (the ones that still bind)

1. **Platform, not warehouse.** Commission per product, snapshotted onto
   `order_items.platform_percent` at order time. No inventory to sell from
   the house account.
2. **Money is integer agorot.** Every calculation goes through
   `src/lib/money.ts`. `float` on the money path is a bug. Additive
   `_agorot` generated columns (138-141, 147) won over the in-place rewrite
   (142, parked).
3. **Cardcom, no HMAC.** The webhook authenticates with a shared secret
   header. There is no signature to verify. Inventing one would reject every
   real callback.
4. **Wallet is site credit.** Refunds that cannot reverse a Cardcom capture
   credit the wallet. Soft-launch catalogue is coupons.
5. **`db push` is forbidden.** Schema changes wait in `migrations/pending/`
   and are applied one file at a time. Sequence: `docs/APPLY-ORDER.md`.
6. **Vercel GitHub integration deploys. Actions does not.** A `deploy.yml`
   that called `vercel deploy` would race the production alias and would
   need a `VERCEL_TOKEN` on a public repo. Rollback is `git revert` of the
   live SHA, then APPLY-ORDER for any SQL that landed with it.
7. **Hobby cron is a lie.** Ten jobs in `vercel.json` silently became two.
   The handlers live under `/api/cron/*` and require `CRON_SECRET`. The
   scheduler is external (`docs/CRON-EXTERNAL.md`) or `cron.yml` once
   `CRON_SCHEDULER_ENABLED=true`.
8. **RTL Hebrew UI.** Comparison gate against
   `refs/ke_live_singlefile.html`, ceiling 11% on home.
9. **Customer DOM must not show `platform_percent`.**

## Trade-offs

| Choice | Cost | Why it stayed |
| --- | --- | --- |
| Additive agorot columns, not in-place rename | Dual representation until readers move | An in-place rename on 41 live numeric columns breaks every current reader in one apply |
| E2E skipped in CI without a disposable DB | No Playwright gate on PRs today | The only reachable database is production. Seeding it from CI is worse than a skip |
| Checkout disallowed in `robots.txt` | Lighthouse raw SEO ~69 | Indexing `/checkout` and `/cart` is a privacy bug. The CI SEO floor drops `is-crawlable` only on paths robots.txt already blocks |
| 180KB gz first-load ceiling | Will fail the build if the client graph grows | The number is the requirement. Raising it to match a fat bundle is not a gate |
| Print-only production rollback workflow | A human still types `git push` | A write token in GitHub Actions on this public repo is a worse incident than a slow rollback |
| Demo service key in the CI build | Prerender does not see real admin data | A real service_role key in a public repository, for a discarded build, is not a trade |

## Future waves (after the four blockers)

1. Turn on one scheduler. Paste the ten lines from `docs/CRON-EXTERNAL.md`
   or set `CRON_SCHEDULER_ENABLED` plus `CRON_SECRET`. Not both.
2. Cardcom production terminal. Swap sandbox for live. Keep
   `CARDCOM_SANDBOX` false. One real charge, one webhook, one voucher email.
3. Apply remaining SQL in APPLY-ORDER order, one file, then verify.
4. DNS cutover of `kenyonexpress.co.il` onto the Vercel project that
   actually serves `kenyonexpress.vercel.app`. Owner step.
5. Disposable CI database so E2E and live migration ROLLBACK stop skipping.
6. Move readers onto generated `_agorot` columns, then drop the numeric
   twins. That is the only remaining money dual-representation work.
7. Physical goods and recurring, which the schema is ready for and the
   soft-launch catalogue is not.

## What shipped in stage 1

- Next.js 16 App Router storefront, Hebrew RTL
- Cardcom checkout (Low Profile / token), mock provider for tests
- Coupon redeem, wallet credit refunds, supplier till (Expo app under
  `apps/mobile`)
- RLS on public tables, deny-all intent for server-only tables (122 still
  pending)
- CI: lint, types, unit tests with money coverage floors, build, migration
  dry-run, secrets audit, 180KB gz bundle gate, Lighthouse SEO/a11y on
  product and checkout, preview E2E (gated), ephemeral Supabase branch
  (gated)
- Legal pages, data export/delete routes, cookie consent
- Production smoke twice a day against `/` and `/api/health`

## What did not ship

- WordPress. Import only. No WP PHP in the runtime.
- A working cron scheduler
- Cardcom live credentials
- The `kenyonexpress.co.il` DNS cutover
- The nine remaining pending migrations

## Blunt verdict

**NOT READY.**

Tag `v1.0.0-rc1` means stage 1 of the software is complete and tested. It
does not mean take payment on the real domain tomorrow. Follow
`docs/LAUNCH-READINESS.md` and `docs/LAUNCH-RUNBOOK.md` for the owner
steps. Do not run DNS from an agent machine.
