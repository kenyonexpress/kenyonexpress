# Release Process

Branch to production: who approves what, what the gates are, and how to roll
back.

`docs/DEPLOYMENT.md` describes the environments and the hosting configuration.
`docs/CI-AND-BRANCH-PROTECTION.md` records why the pipeline is shaped the way it
is. **This document is the procedure.**

Branch protection was read live from the GitHub API on **2026-09-01**, not
copied forward from a previous document.

---

## 0. Four facts that shape everything below

0. **The deploy half of this pipeline is not connected.** The Vercel project
   watches `kenyonexpress/kenyonexpress-web`, a different private repository
   last pushed 2026-05-29, and all 11 of its deployments are `ERROR` including
   the only production one. **Merging to `main` here deploys nothing and opens
   no preview.** §1 through §5 are real and enforced today; §6 onward describes
   what will happen once the project is relinked.
   `docs/THIRD-PARTY-DEPENDENCIES.md` §0.
1. **`main` is the default branch and the push target — and it is not the only
   live branch.** PR #6 merged `phase5/homepage` into it, and the two have since
   **diverged again**: 348 commits on `phase5/homepage` that `main` does not
   have, 39 on `main` that it does not, and commits on both on 2026-09-01.
   `main` is the protected release line; `phase5/homepage` is still being worked
   on. See §4.1.
2. **The repository is public.** No real credential belongs in it, in a
   workflow, or in a CI secret that a fork could reach.
3. **There is one maintainer.** Every "who approves" answer below is shaped by
   that, and each is marked with what changes the day there are two.
4. **There is no staging database.** Preview deployments point at production.
   That single fact is why both E2E jobs are disabled.

---

## 1. The path

```
feature branch  →  pull request  →  CI (4 required checks)  →  merge to main
                                                                    ↓
                                                       Vercel deploys production
```

There is no release branch, no tag gate, and no manual promotion step. **Merging
to `main` is the release.** Treat it that way.

---

## 2. Branch

```bash
git checkout main && git pull
git checkout -b feat/<short-name>
```

Prefixes in use: `feat/`, `fix/`, `docs/`, `arch/`. Nothing enforces them.

**Never commit directly to `main`.** Force pushes and deletions on `main` are
blocked at the API level, but direct pushes are not — `enforce_admins` is off
(§5.2), so the rule is a convention held by the person typing.

---

## 3. The gates

### 3.1 Local, before you push

```bash
pnpm test          # vitest, 246 test files
pnpm type-check    # tsc --noEmit
pnpm lint          # biome check .
pnpm build         # SEPARATE. See below.
```

**`pnpm build` is not implied by the other three.** `cacheComponents` rejects
uncached page reads that tests, `tsc` and Biome all pass. A change can be green
three ways and still not build.

A pre-commit hook runs `lint-staged` (`biome check --write` on changed files).
It does **not** run tests, deliberately — a hook slow enough to skip gets
skipped — so a clean commit says nothing about `pnpm test`.

### 3.2 CI, on every push and every pull request

`.github/workflows/ci.yml`. Triggers are **deliberately unfiltered**: an earlier
version listed branches, work happened on branches not in the list, and those
pushes got no CI at all. A gate that does not run on the branch under
development is not a gate.

| Job | What it enforces | Required |
|---|---|---|
| **Diff-scoped lint gates** | Biome + `tsc` on the diff, the hardcoded hex/px gate, then **repo-wide** `biome check .` and `tsc --noEmit` | **yes** |
| **Typecheck (changed files)** | `tsc --strict` over the diff | **yes** |
| **Unit tests + money coverage floors** | `vitest` with per-file coverage floors on the money path | **yes** |
| **Build** | `pnpm build`, needs the three above | **yes** |
| E2E (Playwright) | — | **no. It skips.** |
| E2E against the PR preview | — | **no. It skips.** |

Those four names are the literal required contexts on `main`, verified against
the API.

**The repo-wide steps are the ones that catch you.** `lint:changed` and
`typecheck:changed` resolve `HEAD~1..HEAD` on a push, so a push of five commits
gates the fifth and waves the other four through. They are fast feedback on a
diff, not a statement about the repository, and treating them as one is how a
repo-wide error survives a green run.

> `pnpm lint` was `biome lint .` until 2026-08-20, and that had exactly the hole
> this backstop exists to close: `biome lint` runs rules only, while
> `biome check` also runs the formatter and assists. Four repo-wide errors
> passed the backstop green while the pull-request run of the same commit failed
> on three of them.

### 3.3 Why E2E is excluded, and why that is correct

Both Playwright jobs are gated on the `CI_SUPABASE_URL` secret, which is unset.

That secret is this repository's switch for **"CI may touch a database"**, and
the only database available is production. The `e2e` job's first step is
`pnpm seed:test`, which **writes** fixture users and catalogue rows.

This nearly went wrong once, and the shape of the near-miss is worth more than
the incident. The Build job was permanently red for want of Supabase values. The
first fix set them under the names the job already used —
`secrets.CI_SUPABASE_URL` — which is *also* the E2E skip guard. Setting it would
have silently un-skipped a job whose first action is a destructive write against
production. The values were moved to non-secret names the E2E guard does not
read, and the secrets were removed before any run consumed them.

> **A skip guard keyed on a credential turns "configure the credential" into
> "start running a destructive job", and the two look like unrelated actions.**

E2E is excluded from the required checks for a second reason: **it currently
passes by skipping**, and a green check that asserts nothing is worse than no
check.

**What this costs, stated plainly: no browser has ever loaded a change in CI.**
A green pipeline means lint, types, unit tests and build. If your change is
visual or touches checkout, drive it yourself before merging.

### 3.4 The hardcoded gate, and the one case it relaxes

`scripts/hardcoded-gate.mjs` counts hex colours and `px` literals in the working
tree and compares against the ledger in `docs/hardcoded-audit.md`. New,
unrecorded values fail; existing recorded debt does not.

On an ordinary pull request the range is `origin/<base>...HEAD`, which is what
stops a PR quietly growing the ledger alongside the hex.

On an **integration-sized** PR (more than 25 commits ahead, and only while the
base has moved no scannable `src/` file) it falls back to the branch tip and
**says so in the log**. The reason is mechanical: the gate counts hits at `HEAD`
while reading the ledger at `origin/<base>`, so on a long branch every row the
branch legitimately added reads back as an unrecorded hit. Measured twice on
2026-09-01 before the fallback was written: the same SHA failed on its
`pull_request` run and passed on the `push` run of the identical tree.

---

## 3.5 The queue nobody is emptying

Measured 2026-09-01:

| | |
|---|---|
| Pull requests open against `main` | **11**, oldest 2026-08-02 |
| Pull requests open against `phase5/homepage` | **6**, all Dependabot |

**PR #16, `feat(cron): מתזמן GitHub Actions לעשרת ה-jobs`, has been open since
2026-08-31.** It is the fix for the largest operational gap in the system —
nothing scheduled runs — and it is sitting in review. A backlog is a process
problem rather than a technical one, and this is the one item in it worth
naming individually.

**Dependabot still targets `phase5/homepage`.** `.github/dependabot.yml` says in
capitals that the `target-branch` override must be deleted the day phase5 merges
into main. It has not been, so dependency PRs open where the release line is
not. They cannot land on `main` as they stand.

---

## 4. Review

### 4.1 Which branch am I releasing from?

`main`. It is the default branch, it carries the protection settings in §5.2,
and the project rules name it as the standing push target.

`phase5/homepage` is also protected and also live. **Before branching, check
which line the work you are joining is on** — they have diverged once already
and have diverged again.

| | Today | The day there are two maintainers |
|---|---|---|
| Required approving reviews | **none** | 1 |
| CODEOWNERS review required | **no** | yes |
| `enforce_admins` | **off** | on |

**Required reviews are off because there is one maintainer.** Requiring an
approval that only a second account can give is a lock with no key.

`.github/CODEOWNERS` claims the money path, migrations and RLS, the gates
themselves, and observability. It is **not** enforced, for the same reason. What
it does today is put a review request on the paths where a mistake is expensive,
and it starts working unchanged the day someone joins.

### What still deserves a second pair of eyes even with no rule

- anything under `src/lib/money.ts`, `src/lib/commerce/`, `src/server/payments/`
- any migration
- any RLS policy or grant
- any change to `.github/workflows/`
- anything that adds a secret

---

## 5. Merge

### 5.1 Required before the button

- four checks green;
- branch up to date with `main` (**strict mode is on**);
- all conversations resolved (**required**).

### 5.2 What is enforced, exactly

Read from `repos/.../branches/main/protection` on 2026-09-01:

| Setting | Value |
|---|---|
| Required status checks | the four jobs, `strict: true` |
| Required approving reviews | none |
| `enforce_admins` | **false** |
| Force pushes | blocked |
| Deletions | blocked |
| Required conversation resolution | **true** |
| Required signatures | false |
| Linear history | false |

> **`enforce_admins: false` means protection is advisory for the repository
> owner.** A direct push to `main` succeeds. This is a deliberate trade — it is
> what lets an autonomous session push, and what kept the `phase5/homepage` →
> `main` merge from being blocked by its own protection — and it is the first
> setting to turn on the day a second maintainer exists.

### 5.3 Two runs per pull request is expected

`on: push` and `on: pull_request` are both unfiltered, so a branch with an open
PR runs the jobs twice. That is the price of the unfiltered triggers and it is
left in place rather than collapsed into one concurrency group: doing that would
have the later run cancel the earlier, and **a cancelled check run is not a
passing one**, which would intermittently block PRs on the required checks.

---

## 6. Deploy

> **Not connected today.** See §0. Merging to `main` in this repository
> currently triggers nothing. The rest of this section is what happens once the
> Vercel project is relinked to `kenyonexpress/kenyonexpress` and its Root
> Directory is cleared so `vercel.json` supplies the commands.

Merging to `main` triggers a Vercel production deployment. `vercel.json`:

```json
{ "framework": "nextjs",
  "installCommand": "pnpm install --no-frozen-lockfile",
  "buildCommand": "pnpm build",
  "outputDirectory": ".next",
  "regions": ["fra1"] }
```

`fra1` (Frankfurt) is the region, next to the Supabase project in `eu-north-1`.

**`vercel.json` declares no crons.** That is deliberate and is the single
largest operational gap in the system — §8, and `docs/FAILURE-MODES.md` §2.1.

### The approval boundary

**A production push to Vercel is one of the four stop-and-ask actions**, with
deleting a database or files, running a migration against production, and a
second code agent on the same repository. An autonomous session does not do it
without being told.

Note the tension and hold both halves: merging to `main` deploys, and deploying
requires approval. **The approval is for the merge.**

### Verifying a deploy

```bash
curl -s https://<host>/api/health | jq
curl -s https://<host>/api/cron/health -H "Authorization: Bearer $CRON_SECRET" | jq
```

The second reports seven dependencies with three possible statuses — `ok`,
`down`, `not_configured`. Read them as three, not two: `not_configured` is a
real answer and is the correct one for Meilisearch and Upstash today.

Then load the site. Hebrew, right to left, product cards, and a working search
box.

---

## 7. Rollback

### 7.1 Application: redeploy the previous build

In Vercel, promote the previous production deployment. This is the fast path and
it is complete for anything that is only code.

**It does not undo a migration**, and it does not undo anything the bad build
already wrote.

### 7.2 Database: there is no undo

Postgres has no undo for DDL. **Reversing a migration means writing and applying
a second, forward migration.** Before applying anything to production, have that
reverse migration already written.

The worked example is migration 137 (`docs/RUNBOOK.md` §5.3): three triggers and
three functions, with the drop order that matters — trigger before function, or
the `DROP FUNCTION` fails on the dependency — and the advice to prefer
`ALTER TABLE ... DISABLE TRIGGER` while still diagnosing, because it is one
statement, reversible by one statement, and leaves the function body readable.

### 7.3 What cannot be rolled back at all

| | Why |
|---|---|
| A Cardcom charge | A refund is a **new** payment row with `kind = 'refund'`, not an edit to the original. |
| A redeemed voucher | `redeemed` is terminal by design. There is no un-redeem. Restoring value is a wallet credit — a different money movement against a different table. |
| An email that was sent | |
| A deleted row | There is no point-in-time restore configured. |

### 7.4 Rolling back a secret

Both rotatable secrets have a `_PREVIOUS` companion —
`CARDCOM_WEBHOOK_SECRET_PREVIOUS`, `VOUCHER_QR_SECRET_PREVIOUS`. **Move the
value there before removing the old one**, not after. `docs/ENV-REFERENCE.md`
§4.

---

## 8. What the release process does not cover

Say these out loud before assuming a release is complete.

| Gap | Consequence |
|---|---|
| **No scheduler is deployed** | Ten cron routes exist; `vercel.json` declares none. Nothing expires, nothing reconciles, no voucher email is ever sent. Vercel's cron allowance is a plan feature, declaring ten anyway does not fail the build, and the platform silently runs only what the plan covers. Removing them was the honest choice. |
| **No browser tests a release** | §3.3. |
| **No RLS test suite** | 133 policies, `authenticated` holds DML on 56 relations, and no test attempts a forbidden write. A policy regression ships green. |
| **No staging database** | Previews point at production — when previews exist at all (§0). |
| **Vercel is on the Hobby plan** | Hobby prohibits commercial use, and caps cron at two daily jobs. A launch blocker, not a preference. |
| **No point-in-time restore configured** | §7.3. |
| **`enforce_admins` is off** | Protection is advisory for the owner. |
| **The pipeline stops at the merge** | Nothing downstream of it is wired up. §0. |

---

## 9. The release checklist

Copy this into the pull request.

```
Before merge
[ ] pnpm test / type-check / lint / build all green locally
[ ] four CI checks green (not skipped, not cancelled)
[ ] branch up to date with main
[ ] conversations resolved
[ ] loaded the change in a browser (CI did not)
[ ] no new secret; if there is, it is not NEXT_PUBLIC_*
[ ] money path, migration, RLS or workflow touched? second pair of eyes
[ ] migration in the PR? reverse migration written FIRST
[ ] production push approved (stop-and-ask #1)

After merge
[ ] Vercel deployment succeeded
[ ] /api/health returns ok
[ ] /api/cron/health: each dependency ok or knowingly not_configured
[ ] site loads, Hebrew RTL, search works
[ ] Sentry shows no new issue class against the release
[ ] docs/STATE.md updated
```

---

## Related

| You want | Read |
|---|---|
| Environments and hosting | `docs/DEPLOYMENT.md` |
| Why the pipeline is shaped this way | `docs/CI-AND-BRANCH-PROTECTION.md` |
| What the tests do and do not cover | `docs/TESTING.md` |
| When a release goes wrong | `docs/RUNBOOK.md`, `docs/INCIDENT-PLAYBOOKS.md` |
| Ranked risk | `docs/FAILURE-MODES.md` |
| Variables and rotation | `docs/ENV-REFERENCE.md` |
