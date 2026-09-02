# CI, branch protection and dependency automation

Applied 21.08.2026. What is enforced, what is deliberately not, and the two
things here that were dangerous rather than merely missing.

## The finding that mattered most

**The Build job had never been able to pass.** It read `secrets.CI_SUPABASE_*`
and this repository had no secrets at all, so every run failed identically:

```
⨯ Error: Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
Error: Failed to collect page data for /coupons/[id]
```

A required check that cannot pass is not a gate. It is a red light that teaches
people to walk past red lights, and it had been red long enough to be normal.

The fix is repository **variables**, not secrets, because that is what these two
values are: `NEXT_PUBLIC_*` is inlined into the client bundle, so both are
already served to every visitor. Verified before use rather than assumed - an
anon read of `/rest/v1/products` answered `200` for ref `ixvwfbuvfxxsjiywhbbb`.

| Name | Kind | Why |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | variable | public already |
| `PUBLIC_SUPABASE_ANON_KEY` | variable | public already |
| *(no service-role key)* | — | a real credential on a public repo, for no gain |

## The near miss

The first attempt set those values under the names the job already used,
`secrets.CI_SUPABASE_URL` and `CI_SUPABASE_ANON_KEY`. That name is also the E2E
job's skip guard:

```yaml
if [ -n "${{ secrets.CI_SUPABASE_URL }}" ]; then present=true
```

E2E had been skipping **only** because that secret was absent. Setting it would
have un-skipped the job, and its first step is:

```yaml
- name: Seed E2E fixtures (catalogue + auth users)
  run: pnpm seed:test
```

`seed:test` **writes** fixture users and catalogue rows into whatever database
the value points at, and the only database reachable from CI is production. The
secrets were removed before any run consumed them and the values moved to
non-secret names the E2E guard does not read. E2E still skips.

The general shape, which is worth more than this one incident: **a skip guard
keyed on a credential turns "configure the credential" into "start running a
destructive job", and the two look like unrelated actions.** If E2E is ever
enabled, it needs its own database and its own variable name, never the one the
build reads.

## What runs on every pull request

`.github/workflows/ci.yml`, triggers deliberately unfiltered.

| Job | Enforces |
|---|---|
| Diff-scoped lint gates | biome + tsc on changed files, hardcoded hex/px gate, then repo-wide `biome check .` and `tsc --noEmit` |
| Typecheck (changed files) | `tsc --strict` over the diff |
| Unit tests + money coverage floors | `vitest` with per-file coverage floors on the money path |
| Build | `pnpm build` (Turbopack) |
| Migration dry-run | Structural SQL + APPLY-ORDER. Live ROLLBACK skipped until `CI_SUPABASE_DB_URL` |
| Secrets audit | Tracked-tree secret values |
| Bundle gate (JS 180KB gz) | First-load JS ceiling after Build, plus `.next/static` secret names |
| Lighthouse product + checkout | SEO and a11y >95 against the preview or production host |
| E2E (Playwright) | **skips**, by design, until it has a database that is not production |

### Caching

`cache: pnpm` on `setup-node` already covered the pnpm store. The expensive half
was not cached at all, and now is:

```yaml
path: .next/cache
key: next-<os>-<lockfile hash>-<src hash>
restore-keys: next-<os>-<lockfile hash>- , next-<os>-
```

`restore-keys` is what makes a near-miss useful; with only an exact `key`, any
change is a full miss and the cache never pays for itself.

**Not `.next/` wholesale.** That is the build *output*, and restoring a stale
output is how a build "succeeds" while serving a previous commit. This repo has
already lived that once: Playwright served a server built from an older commit
for four cycles before it was caught.

### Turborepo was evaluated and not added

There is no `turbo.json`, no turbo dependency, and `pnpm-workspace.yaml` has no
`packages:` key at all - which means `apps/mobile` is not a workspace member
either. Turborepo's value is orchestrating and caching tasks *across* packages.
With one Next app and a mobile app sitting outside the workspace, it would add a
layer with nothing to orchestrate while routing every script through it.

The change that would make Turborepo mean something is making `apps/mobile` a
real workspace member. That is a separate change with its own blast radius, and
it is also what `apps/mobile` needs before Dependabot can update it at all.

### Known cost: two runs per pull request

`on: push` and `on: pull_request` are both unfiltered, so a branch with an open
PR produces two runs of the same jobs. The unfiltered triggers are deliberate
and documented in the workflow: an earlier branch filter listed branches nobody
opened PRs against, so the branch all the work happened on got no CI at all.

The duplication is the price of that, and it is left in place rather than
"fixed" by collapsing the two into one concurrency group - that would have the
later run cancel the earlier, and a **cancelled** check run is not a passing
one, which would intermittently block PRs on the required checks below.

## Branch protection

Applied to `main` and to `phase5/homepage`, since the second is where work
actually happens (`main` is 301 commits behind).

| Setting | Value | Why |
|---|---|---|
| Required status checks | the four jobs above | E2E excluded: it currently passes by skipping, and a green check that asserts nothing is worse than no check |
| Strict (up to date before merge) | on | |
| Required approving reviews | **none** | One maintainer. Requiring an approval that only a second account can give is a lock with no key |
| Enforce for admins | **off** | So the eventual `phase5/homepage` → `main` merge is not blocked by its own protection, and so the autonomous session can still push directly |
| Force pushes / deletions | blocked | |
| Conversation resolution | required | |

`enforce_admins: false` is the honest trade-off to name: it means protection is
advisory for the repo owner. Verified after applying - a direct push to
`phase5/homepage` still succeeds. Turn it on the day a second maintainer exists,
along with required reviews and CODEOWNERS enforcement.

## CODEOWNERS

`.github/CODEOWNERS` claims the money path, migrations and RLS, the gates
themselves, and observability. It does **not** enable "require review from Code
Owners" - same reason as required reviews above. What it does today is put a
review request on the paths where a mistake is expensive, and it works
unchanged the day someone else joins.

## Dependency automation

**Secret scanning** was already on (free for public repos) with **push
protection** on. Two further options, `secret_scanning_non_provider_patterns`
and `secret_scanning_validity_checks`, were attempted twice: the API answers
`200 OK` and the setting stays `disabled`. They require GitHub Advanced
Security, which this account does not have. Not retried a third time.

**Dependabot** was fully off. Now enabled:

- `vulnerability-alerts` - on. It immediately surfaced **8 existing advisories**
  (1 critical, 3 high, 2 moderate, 2 low). Those predate this change and are
  listed at `/security/dependabot`; note that a previous audit found all of them
  in dev/build tooling rather than in code that runs in production, so read that
  list before treating the critical as a production incident.
- `automated-security-fixes` - on.
- `.github/dependabot.yml` - weekly npm + github-actions, grouped.

Two deliberate choices in that file:

**It targets `phase5/homepage`, not the default branch.** Dependabot opens
against the default branch, which is `main`, 301 commits behind. A bot PR there
would resolve a lockfile nobody runs. **This override must be deleted when
phase5 merges to main** - a `target-branch` naming a branch that no longer
exists makes Dependabot stop silently.

**`apps/mobile` is not listed.** It has a `package.json` but no lockfile and is
not a workspace member, so an entry would produce a run error rather than a PR.

### Auto-merge is patch-only, and never merges anything itself

`.github/workflows/dependabot-auto-merge.yml` calls `gh pr merge --auto`, which
asks GitHub to merge *if and when* required checks pass. A bad patch release
therefore leaves a red PR, not a merged regression. **That guarantee depends
entirely on the branch protection above existing on the target branch** - with
no required checks, auto-merge merges as soon as it can.

Minor bumps are grouped but left for a human. This repo has already been bitten
inside a minor: `pnpm-workspace.yaml` records a transitive `brace-expansion` bump
that turned every `minimatch@9` glob into a `TypeError` and still reported **all
tests passing**, because the crash was in coverage collection after the run.

## Not done: Vercel preview comment

Vercel posts preview-deployment comments through its own GitHub App, configured
on the Vercel side. It cannot be added from a workflow file, and this checkout
has no Vercel access at all: no `.vercel/`, no `vercel` CLI, no token, and the
Vercel MCP exposes no project-settings tool. See `docs/SENTRY-SETUP.md`, which
is blocked on the same missing link for its environment variables.

To finish it: Vercel dashboard → the project → Settings → Git → enable comments
on pull requests, with the GitHub integration installed on this repository.
