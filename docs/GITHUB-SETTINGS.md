# GitHub settings that cannot be committed

Everything in this file is a setting in the GitHub web UI. None of it lives in
the repository, so none of it can be applied by a commit, a script, or an agent.
This is the list of steps to perform by hand, in order.

Why it matters here specifically: `main` currently accepts direct pushes, and
every push to it so far has reported

```
remote: Bypassed rule violations for refs/heads/main:
remote: - Changes must be made through a pull request.
```

A rule that announces it was bypassed is not enforcing anything. The steps below
turn that line into a refusal.

---

## 1. Which branch is production

Check this first, because step 2 changes what a push to it costs.

`Settings` > `General` > `Default branch`

The default branch today is `cursor/add-supabase-3c830`, not `main`. Vercel
follows the default branch for production deploys unless it was told otherwise,
so confirm which branch Vercel is actually building before protecting either:

`vercel.com` > the project > `Settings` > `Git` > `Production Branch`

Decide one branch to be both, and make the two agree. Leaving them different is
the reason it is currently unclear whether pushing `main` deploys anything.

---

## 2. Require a pull request into the protected branch

`Settings` > `Rules` > `Rulesets` > `New ruleset` > `New branch ruleset`

- **Ruleset Name**: `protect-main`
- **Enforcement status**: `Active` (not `Evaluate`; evaluate mode is what
  produces the "Bypassed rule violations" line instead of a block)
- **Target branches** > `Add target` > `Include default branch`, and add the
  branch from step 1 by name if it is not the default
- **Bypass list**: leave it EMPTY. An entry here is what let every push through.

Then tick, under `Branch rules`:

- [x] **Require a pull request before merging**
  - Required approvals: `0` if working solo. The value is not the point; the
    pull request is, because it is what gives the checks in step 3 something to
    attach to and block.
  - [x] Dismiss stale pull request approvals when new commits are pushed
- [x] **Block force pushes**
- [x] **Restrict deletions**

---

## 3. Require the CI checks to pass

Same ruleset, still under `Branch rules`:

- [x] **Require status checks to pass**
  - [x] Require branches to be up to date before merging
  - `Add checks`, and add these four **by the exact name in the `name:` field of
    `.github/workflows/ci.yml`**, not the job id:

    | Add this check                    | What it runs                          |
    | --------------------------------- | ------------------------------------- |
    | `Diff-scoped lint gates`          | biome + tsc on the diff, then repo-wide `pnpm lint` and `pnpm type-check`, both blocking |
    | `Typecheck (changed files)`       | `pnpm typecheck:changed`              |
    | `Unit tests + money coverage floors` | `pnpm test:coverage`               |
    | `Build`                           | `pnpm build`                          |
    | `Migration dry-run`               | SQL structural pass + APPLY-ORDER inventory |
    | `Secrets audit`                   | no secret values in tracked files     |
    | `Bundle gate (JS 180KB gz)`       | first-load JS ceiling + client bundle secret names |

A check only becomes selectable after it has reported on this repository at
least once. If a name does not appear in the picker, push any branch, let CI
run, and come back.

**Do not add `E2E (Playwright)` yet.** It skips itself when
`CI_SUPABASE_URL` is absent, and a required check that skips can never
report success, so the PR stays unmergeable forever. Add it after step 4.

**Add `Lighthouse product + checkout` after it has reported green once.** It
waits up to 12 minutes for the Vercel preview, so a required check that
times out on a missing preview would block every PR.

---

## 4. Repository secrets, which is what unblocks E2E

`Settings` > `Secrets and variables` > `Actions` > `New repository secret`

| Secret                     | Needed by                        |
| -------------------------- | -------------------------------- |
| `CI_SUPABASE_URL`          | E2E (not Build)                  |
| `CI_SUPABASE_ANON_KEY`     | E2E                              |
| `CI_SUPABASE_SECRET_KEY`   | E2E                              |
| `CI_SUPABASE_DB_URL`       | Migration dry-run live ROLLBACK (disposable DB only) |
| `SUPABASE_ACCESS_TOKEN`    | Preview Supabase branch          |
| `SUPABASE_PREVIEW_PROJECT_REF` | Preview Supabase branch (must not be `ixvwfbuvfxxsjiywhbbb`) |
| `SENTRY_ORG`               | source map upload (optional)     |
| `SENTRY_PROJECT`           | source map upload (optional)     |
| `SENTRY_AUTH_TOKEN`        | source map upload (optional)     |

Point `CI_SUPABASE_*` at a **disposable** project, never production. The E2E job
runs `pnpm seed:test`, which creates fixture users and catalogue rows.

Once these exist, run CI once, confirm `E2E (Playwright)` reports rather than
skips, then go back to step 3 and add it as a fifth required check.

---

## 5. Verify it actually blocks

The point of this step is that steps 2 to 4 all look identical whether they
worked or not until something is refused.

```bash
git checkout main
git commit --allow-empty -m "probe: confirm branch protection refuses a direct push"
git push origin main
```

Expected, and the whole objective of this file:

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: error: Changes must be made through a pull request.
```

If it pushes instead, one of these is true: `Enforcement status` is `Evaluate`
rather than `Active`, the bypass list is not empty, or the ruleset targets a
branch that is not the one being pushed.

Then undo the probe commit:

```bash
git reset --hard origin/main
```
