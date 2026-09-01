# What runs in CI, and what deliberately does not

Five workflows live here, and the absence of a sixth is a decision rather
than an oversight. This file records the decision so the next person does not add the
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

## `production-smoke.yml`

Two `curl`s a day against the live deployment, `/` and `/api/health`, and an
issue labelled `production-down` if either answers anything but 200. Both were
verified by hand before the file was written: `/` returned 200 and
`/api/health` returned 200 with `{"ok":true,"database":"ok","latency_ms":243}`.

It is a floor, not monitoring. A daily probe can miss most of an outage and
nothing here pages anyone; what it gives is a standing record that the site
still serves and can still reach its database. It opens **one** issue per
outage and comments on it thereafter, because seven issues about one week-long
outage is how a real alert gets scrolled past. It also fails the run, since an
issue is the record and a red run is what shows in the Actions list.

**It runs now.** GitHub fires `schedule`, and accepts `workflow_dispatch`, only
for workflows on the repository's default branch. While this file sat on
`phase5/homepage` it did neither: `gh workflow run production-smoke.yml --ref
phase5/homepage` answered `HTTP 404: workflow production-smoke.yml not found on
the default branch`, and `gh workflow list --all` returned only CI and
Dependabot Updates. PR #6 merged the branch into `main` and the probe started
with no change to the file. Measured 2026-09-01:

```
$ gh workflow list --all
CI  active   Commit Monitor  active   Dependabot auto-merge  active
Production smoke  active     Dependabot Updates  active
```

That is also why `cron.yml` needs its own off switch rather than relying on the
branch it lives on: on `main`, a scheduled workflow is live the moment it is
pushed.

It reads no secret it cannot do without. `vars.PRODUCTION_URL` overrides the
target and falls back to the known host with a notice rather than skipping, on
the grounds that a smoke test which quietly stops running is worse than one
aimed at a stale hostname. `secrets.PRODUCTION_SMOKE_HEADER` is optional and
only matters if the site is ever put behind Deployment Protection, at which
point an unauthenticated probe would read the SSO wall as a healthy 200.

## `cron.yml`

The ten scheduled jobs, moved out of `vercel.json` (see the section below) and
into Actions. It fires on the seven distinct cron expressions, passes
`github.event.schedule` to `scripts/run-cron-jobs.sh`, and the script looks the
due jobs up in `scripts/cron-jobs.json` and calls each one with the bearer
token. The schedule exists once, in that JSON;
`src/__tests__/cron-schedule-inventory.test.ts` checks the workflow, the doc and
`src/app/api/cron/` against it, both ways, so a job cannot be renamed or
rescheduled in one place alone.

**It is off until a repository variable says otherwise.** `CRON_SCHEDULER_ENABLED`
must be `true` and `secrets.CRON_SECRET` must hold the deployment's value.
Neither exists today - `gh secret list` returns nothing on this repository - so
merging this file starts nothing. The variable is checked in the job's `if`,
before a runner is allocated, so the schedules cost no minutes while it is off;
the secret is checked inside the run because the `secrets` context is not
available to a job-level `if`, and the script exits 0 with a notice rather than
firing ten 401s every five minutes.

It is a worse scheduler than the `cron-job.org` setup the doc also describes:
GitHub's cron is best effort, late by five to fifteen minutes under load, drops
runs, and switches itself off after 60 days without a commit. It is here because
it needs two settings instead of a person creating ten jobs in a browser, and
the four money-path and email jobs among the ten had been running nowhere at all
in the meantime. Turning `CRON_SCHEDULER_ENABLED` off is the whole rollback, and
it has to happen the day the other scheduler is set up: two schedulers means
every job runs twice.

## `commit-monitor.yml`

Half-hourly `git log --oneline -3` to the project's ntfy topic, so progress is
visible from a phone. It reads nothing, writes nothing and cannot fail a build.

## `dependabot-auto-merge.yml`

Enables GitHub's own auto-merge on patch-only Dependabot pull requests. It never
merges anything itself, and its safety depends on branch protection existing on
whatever branch `.github/dependabot.yml` names in `target-branch`. The file's
own header comment carries the full argument.

## `vercel.json` has no `crons` key, on purpose

Ten scheduled jobs used to be declared there. Hobby runs two of them, at daily
granularity, and silently ignores the rest - so four money-path and email jobs
were believed to be scheduled and were not. `cron.yml` below is what calls them
now; `docs/CRON-EXTERNAL.md` is the full account.

Nothing in the build reads that key. The route handlers under `src/app/api/cron/`
are ordinary route handlers, built and reachable either way; `crons` is consumed
by the platform at deploy time to register schedules and by nothing else. What
`vercel.json` still declares, and must keep declaring, is `framework: nextjs`
and `regions: ["fra1"]`.

## The one red check on PR #6, and why it was not a defect

Checked 2026-09-01 on SHA `0164f98b7`. `gh pr checks 6` showed a single
failure, `Diff-scoped lint gates`, and the identical SHA passed the same job on
the push event. That split is the entire diagnosis: nothing about the code
differs between the two runs, only the diff range does.

`scripts/hardcoded-gate.mjs` counts hits by reading the **working tree**
(`readFileSync`), but loads its ledger with `git show <left side of range>`.
Pairing those two is the anti-laundering rule, and for a single commit it is
exactly right: a commit cannot add a hex and record it in
`docs/hardcoded-audit.md` in the same breath, because the ledger it is judged
against comes from its parent.

On a branch this old the same pairing cannot ever pass:

| | hits counted at | ledger read at | result |
| --- | --- | --- | --- |
| push, `HEAD~1..HEAD` | working tree | the parent commit | passes |
| pull_request, `origin/main...HEAD` | working tree | `origin/main`, 339 commits stale | fails |

`docs/hardcoded-audit.md` is 1838 lines on `main` and 2206 lines at `HEAD`, and
the values the gate reported as new are already recorded in the `HEAD` copy -
the coupons page alone appears nine times there and once on `main`. Every one
of those 339 commits already faced this gate on its own push event against a
ledger one commit old. The aggregate re-check therefore adds no enforcement
that did not already happen, and it cannot go green short of the merge it is
blocking.

Reproduced locally, same commit, same script, only the range changed:

```
$ CI=1 CI_DIFF_RANGE='origin/main...HEAD' node scripts/hardcoded-gate.mjs   # exit 1
$ CI=1 CI_DIFF_RANGE='HEAD~1..HEAD'       node scripts/hardcoded-gate.mjs   # exit 0
```

So it is an artifact of the stale base branch, not a finding. `ci.yml` now
gives this one gate its own range: a pull request carrying more than 25 commits
falls back to per-commit semantics and prints a `::warning` saying it did.
Ordinary pull requests keep `origin/base...HEAD`, because that is the range that
stops laundering, and a pull request that quietly updates the ledger alongside
the value it records is precisely what the rule exists to catch. The threshold
is a shape test rather than a severity dial: 25 sits far above any feature
branch here and far below this branch's 341.

### `HEAD~1..HEAD` is a trap on a pull_request event

The first attempt at that fallback used `HEAD~1..HEAD`, the same string the
push branch of the step uses, and it changed nothing. **On a `pull_request`
event the runner checks out the MERGE commit, not the branch tip, and that
merge commit's first parent is the base branch.** So `HEAD~1..HEAD` silently
resolves to `main..merge`: the entire 341-commit diff, which is the exact range
the fallback exists to escape.

It fails in the worst possible way, which is why it is written down here. Run
`33438594165` on `3e11ff1b8` printed

```
hardcoded-gate: range HEAD~1..HEAD
hardcoded-gate: 239 file(s), baseline from docs/hardcoded-audit.md at HEAD~1
```

The first line names the narrow range and the second reports the wide one, 239
files, identical to the aggregate run it was meant to replace. A local check
does not reproduce it either, because a local `HEAD` is the branch tip and its
`HEAD~1` is an ordinary parent.

The fallback therefore addresses `${{ github.event.pull_request.head.sha }}`
explicitly, and the commit-count shape test measures from the base to that SHA
rather than to `HEAD`.

**None of the values the gate listed were touched. They live in `src/`, and the
ledger lives in `docs/`.**
