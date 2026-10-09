# release/v1.0 — the merge plan into main

Written 2026-09-02. `release/v1.0` is cut from `closeout/v1-final` at the tip
that includes the closeout work, the security and resilience commits, and the
`docs/v1-final` merge (170 documentation files).

## The premise this plan corrects

The task said: "main is 348 commits behind phase5/homepage; rebase main's 39
unique commits onto it." **The 348 is an artifact of a squash, not missing
work.** PR #6 squash-merged `phase5/homepage` into `main` on 2026-08-31, so the
CONTENT of those 348 commits is in main under one squash commit while the
commit OBJECTS are not ancestors -- `rev-list --count` sees 348 either way.
CLAUDE.md has said "main is the only branch" since that merge.

Verified content-wise, not by commit counting: `git diff phase5/homepage main`
shows main AHEAD (the closeout, guards, journal, resilience and types work),
plus one thing phase5 got afterwards: dependabot's patch-group bump (#10),
merged to phase5 the same day because the dependabot target-branch override
still pointed there. That override is deleted on this branch.

Rebasing main's commits onto the pre-squash lineage would resurrect the exact
history the squash closed and re-litigate its conflict resolutions. It is not
done, deliberately.

## What release/v1.0 contains beyond main

Every commit on `closeout/v1-final` since `9e76800c4` (the last state of main):
the gap audit, the payment journal, the refunds record and wallet machine,
migrations 147-150 (pending, dry-run-verified, none applied), Cardcom/Supabase
deadlines, the account deletion, the regenerated types and the two live bugs
they exposed, the above-fold 1:1 work, and the docs/v1-final merge.

## The route into main

1. PR `release/v1.0` -> `main` (PR #6 is MERGED and cannot be repointed; this
   is a NEW PR).
2. The four required checks must pass: Diff-scoped lint gates, Typecheck,
   Unit tests + money coverage floors, Build.
3. **Merging is a hard stop.** Ofir merges, nobody else.

## What merging does NOT do

Deploy anything. The Vercel project `kenyonexpress` has **no Git connection**
-- `vercel project inspect` shows no git section, and both production
deployments were CLI deploys. Until the repo is connected (Dashboard ->
Project -> Settings -> Git -> Connect, then set Production Branch = `main`),
pushes deploy nothing and the "production branch" setting does not exist.
