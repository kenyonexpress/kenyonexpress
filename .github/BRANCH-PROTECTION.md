# Branch protection on `main`, as it actually is

Read live on **2026-09-01** from
`gh api repos/kenyonexpress/kenyonexpress/branches/main/protection`. This file
records the state; it changes nothing. Anything below that looks wrong is a
finding to act on deliberately, not something a CI change should quietly fix.

## The full ruleset

| Setting | Value |
| --- | --- |
| `required_status_checks.strict` | **true** (branch must be up to date with `main` before merging) |
| `required_status_checks.contexts` | `Diff-scoped lint gates`, `Typecheck (changed files)`, `Unit tests + money coverage floors`, `Build` |
| `required_status_checks.checks` | the same four, all pinned to `app_id: 15368` (GitHub Actions) |
| `required_pull_request_reviews.required_approving_review_count` | **1** |
| `required_pull_request_reviews.dismiss_stale_reviews` | false |
| `required_pull_request_reviews.require_code_owner_reviews` | false |
| `required_pull_request_reviews.require_last_push_approval` | false |
| `required_conversation_resolution` | **true** |
| `enforce_admins` | **false** |
| `required_signatures` | false |
| `required_linear_history` | false |
| `allow_force_pushes` | false |
| `allow_deletions` | false |
| `block_creations` | false |
| `lock_branch` | false |
| `allow_fork_syncing` | false |

## The check that always skips is NOT required, so nothing is blocked forever

Both E2E jobs skip on every run today, because `CI_SUPABASE_URL` is unset and
the only database a preview could reach is production. If either were in
`contexts` it would sit unfulfilled on every pull request and no PR into `main`
could ever merge.

Neither is. `contexts` names exactly the four jobs that block on their own
merits, and `E2E (Playwright)` and `E2E against the PR preview` are absent from
it. Checked against the live list above, not assumed. **This is the correct
configuration and it should stay this way** until the secret exists; the note in
`ci.yml` about promoting them to required checks is conditional on that, and the
condition has not been met.

## What does block, and it is worth knowing which is which

**`Build` reports `skipping` whenever `lint`, `typecheck` or `test` fails.** It
carries `needs: [lint, typecheck, test]`, so a red gate upstream leaves a
required check that never reaches a conclusion. On PR #6 right now that is
exactly what shows: one real failure in `Diff-scoped lint gates`, and `Build`
plus `E2E (Playwright)` reported as skipping behind it. That is the dependency
working as intended, not a second fault, and it clears when the upstream job
goes green.

**`required_approving_review_count: 1` is the standing blocker on this
repository**, and it is a closer match to the hazard the question was aimed at
than any status check is. GitHub does not let an author approve their own pull
request, and every pull request here is opened by the sole owner, so the
approval cannot be satisfied from inside the repo.

It is not literally permanent, and the reason is `enforce_admins: false`: an
administrator can merge past an unmet requirement. The practical effect is that
merging is an explicit admin action rather than something the checks alone can
authorize. Left as found, and written down so it is a decision on merge day
rather than a surprise.

**`strict: true` means PR #6 must be brought up to date first.** `main` carries
one commit that `phase5/homepage` does not (`688a90df0`, docs only), so the
branch is behind and GitHub will ask for an update before it will merge.

## `phase5/homepage` carries the identical ruleset

`.github/workflows/dependabot-auto-merge.yml` states that its safety depends on
branch protection with required status checks existing on whatever branch
`.github/dependabot.yml` targets, which is `phase5/homepage` and not `main`. So
that branch was read too, and the condition holds. Every value matches `main`:
the same four required contexts pinned to app 15368, `strict: true`,
`required_conversation_resolution: true`, `enforce_admins: false`, force pushes
and deletions off, and `required_approving_review_count: 1`.

Two consequences follow from that last one.

**The auto-merge workflow cannot merge unattended, and that is not a bug.**
`gh pr merge --auto` waits for every requirement, review included, so a
patch-only Dependabot PR will sit green and unmerged until a human approves it.
The workflow's own header argues its safety from the checks; the review
requirement is a second lock on top, so the real behaviour is more conservative
than the file claims, not less.

**Nothing on either branch merges on checks alone.** An author cannot approve
their own pull request and every pull request here is opened by the sole owner,
so the approval can only come from an admin merging past it, which
`enforce_admins: false` permits. Merging is therefore a deliberate admin action
on both branches. Left exactly as found.
