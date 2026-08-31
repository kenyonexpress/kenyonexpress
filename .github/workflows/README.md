# What runs in CI, and what deliberately does not

Two workflows live here, and the absence of a third is a decision rather than an
oversight. This file records the decision so the next person does not add the
missing file back.

## There is no `deploy.yml`, and there must not be one

**Vercel deploys this repository through its own GitHub integration.** That is
not an assumption; it is visible from outside Vercel entirely. Every commit on
`phase5/homepage` has a GitHub Deployment created by `vercel[bot]`, and each one
carries a status with an `environment_url`. Checked on 2026-09-01:

```
$ gh api repos/:owner/:repo/deployments --jq '.[0:3][] | {environment, creator: .creator.login}'
{"creator":"vercel[bot]","environment":"Production"}
{"creator":"vercel[bot]","environment":"Production"}
{"creator":"vercel[bot]","environment":"Production"}
```

A `deploy.yml` calling `vercel deploy` would therefore be the **second** thing
deploying the same commit. That is worse than redundant on three counts:

1. **Two deployments race for the same alias.** Whichever finishes last wins,
   and which one that is depends on runner queue time. The production alias
   would point at a build chosen by a coin flip.
2. **It needs a `VERCEL_TOKEN` this repository does not have and should not
   have.** A deploy token in a repository's secrets is a credential that can
   publish to production, held next to the code any contributor can propose
   changes to. The integration needs no such secret, because the authorization
   lives in the Vercel app installation instead.
3. **It would double the build minutes** for an output that is thrown away.

There is also no local project link to build one on: `.vercel/project.json` does
not exist in this checkout, and the CLI has no token. So a `deploy.yml` here
could not even be tested before being pushed.

**If deploys ever need to move into Actions** - a different platform, or a gate
Vercel cannot express - then the Vercel GitHub integration has to be
*disconnected first*, in the project's settings, in the same change. Adding the
workflow while the integration is live is what produces the race in (1).

## `ci.yml`

Five jobs. The first four block:

| Job | Blocks | What it proves |
| --- | --- | --- |
| `lint` | yes | Biome and `tsc` on the diff, **and** repo-wide `pnpm lint` + `pnpm type-check` |
| `typecheck` | yes | `tsc --strict` over the changed file set |
| `test` | yes | `pnpm test:coverage`, including the per-file money coverage floors |
| `build` | yes | `pnpm build` - a separate gate that tests and lint do not stand in for |
| `e2e` | skips | Playwright on a localhost production build. Skips until `CI_SUPABASE_URL` exists |
| `e2e-preview` | skips | Playwright against the pull request's Vercel preview. Same gate |

None of the first four carries `continue-on-error`, and none is conditional, so
a red one is a red check on the pull request.

The two E2E jobs are not duplicates. `e2e` is the gate on the **code**: it
builds here and drives `localhost`. `e2e-preview` is the gate on the
**deployment**: the platform's routing, caching, image optimizer and environment
variables sit in front of it, and that is where a green localhost run and a
broken preview come apart.

Both skip loudly rather than fail while `CI_SUPABASE_URL` is unset, because the
only database either could reach today is production. Each prints an annotation
saying so; a job that quietly does nothing is indistinguishable from a job that
passed. Promote either to a required check once the secret points at a
disposable project.

## `dependabot-auto-merge.yml`

Enables GitHub's own auto-merge on patch-only Dependabot pull requests. It never
merges anything itself, and its safety depends on branch protection existing on
whatever branch `.github/dependabot.yml` names in `target-branch`. The file's
own header comment carries the full argument.

## `vercel.json` has no `crons` key, on purpose

Ten scheduled jobs used to be declared there. Hobby runs two of them, at daily
granularity, and silently ignores the rest - so four money-path and email jobs
were believed to be scheduled and were not. They now run from `cron-job.org`;
see `docs/CRON-EXTERNAL.md`.

Nothing in the build reads that key. The route handlers under `src/app/api/cron/`
are ordinary route handlers, built and reachable either way; `crons` is consumed
by the platform at deploy time to register schedules and by nothing else. What
`vercel.json` still declares, and must keep declaring, is `framework: nextjs`
and `regions: ["fra1"]`.
