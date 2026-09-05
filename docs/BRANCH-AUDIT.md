# Branch audit

Measured 2026-09-06 against `closeout/v1-final` at `48ea88353`. Every number
below came from `git rev-list --left-right --count`, not from a branch name.

## The headline: `main` is not merely stale

`main` is **284 behind and 9 ahead**. The nine are not junk:

| commit | what |
|---|---|
| `1bbf68550` | dependabot: fast-uri 3.1.5 → 3.1.6 |
| `43f68f150` | vitest 3.2.4 → 3.2.7, **critical** GHSA-5xrq-8626-4rwp |
| `4acfd0583` | browserslist 4.28.2 → 4.28.8, two high advisories |
| `58c2f982f` | form-data 4.0.5 → 4.0.6, high GHSA-hmw2-7cc7-3qxx |
| `f24664fbb` | vite 7.3.3 → 7.3.6, high GHSA-fx2h-pf6j-xcff |
| `91da713bd` | ws 8.20.1 → 8.21.3, high GHSA-96hv-2xvq-fx4p |
| `cfc1ffab7` | @babel/core 7.29.0 → 7.29.7, low |
| `b8d33e7d9` | @esbuild-kit esbuild 0.18.20 → ^0.25.0, medium |
| `071e53b1f` | vite's esbuild 0.27.7 → ^0.28.1, low |

They touch three files only: `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`.

**This changes the merge instruction.** The goal says to resolve conflicts "in
favour of the newer measured work". Read literally against the lockfile that
would discard nine security fixes including a critical one, because
`closeout/v1-final`'s lockfile is older on exactly these packages. The
resolution used instead: **`closeout/v1-final` wins on every source file, and
the dependency bumps are kept**, because they are strictly newer versions of the
same packages and nothing in the UI work depends on the vulnerable ones.

`closeout/v1-final` is therefore the source of truth for the product and is
**missing security patches it should have**. It gets them in this merge too, so
the two branches end identical rather than each holding half.

## Every local branch

`ahead` / `behind` are relative to `closeout/v1-final`. "Contained" means ahead
= 0, so the branch has nothing that `closeout/v1-final` lacks.

| branch | last commit | ahead | behind | contained | remote |
|---|---|---:|---:|---|---|
| `arch/account-area` | 2026-08-01 | 1 | 1210 | no | on origin |
| `arch/checkout-cardcom-verification` | 2026-08-01 | 1 | 1210 | no | on origin |
| `arch/docs-batch-2` | 2026-08-12 | 815 | 349 | no | on origin |
| `arch/docs-queue` | 2026-08-12 | 44 | 1114 | no | on origin |
| `arch/notifications-v2` | 2026-08-01 | 1 | 1210 | no | on origin |
| `arch/seed-data` | 2026-08-01 | 1 | 805 | no | on origin |
| `arch/wp-migration` | 2026-08-01 | 1 | 1208 | no | on origin |
| `autopilot` | 2026-09-04 | 9 | 284 | no | on origin |
| `docs/final-pack` | 2026-08-03 | 10 | 1114 | no | on origin |
| `docs/final-pass` | 2026-09-01 | 1 | 314 | no | local only |
| `docs/ui-design-system` | 2026-09-04 | 3 | 24 | no | on origin |
| `docs/v1-final` | 2026-09-01 | 0 | 249 | **yes** | on origin |
| `feat/auth-hardening` | 2026-08-20 | 80 | 333 | no | on origin |
| `feat/auth-model` | 2026-08-19 | 52 | 333 | no | on origin |
| `feat/checkout-e2e` | 2026-08-20 | 78 | 333 | no | on origin |
| `feat/db-hardening-v2` | 2026-08-19 | 74 | 333 | no | local only |
| `feat/e2e-quality` | 2026-08-12 | 1 | 333 | no | on origin |
| `feat/monitoring-sentry` | 2026-08-20 | 78 | 333 | no | on origin |
| `feat/notifications-full` | 2026-08-20 | 76 | 333 | no | on origin |
| `feat/performance-seo` | 2026-08-20 | 77 | 333 | no | on origin |
| `feat/product-type` | 2026-08-19 | 74 | 333 | no | on origin |
| `feat/rate-limit-layer` | 2026-08-21 | 301 | 333 | no | on origin |
| `feat/search-meilisearch` | 2026-08-20 | 77 | 333 | no | on origin |
| `feat/ux-wave-final` | 2026-08-20 | 80 | 333 | no | local only |
| `main` | 2026-09-04 | 9 | 284 | no | on origin |
| `merge/supplier-and-arch-night` | 2026-08-19 | 43 | 333 | no | on origin |
| `release/v1.0` | 2026-09-02 | 0 | 219 | **yes** | on origin |
| `release/v1.1` | 2026-09-02 | 0 | 204 | **yes** | on origin |
| `release/v1.2` | 2026-09-02 | 0 | 197 | **yes** | on origin |
| `save/ke-visual-work` | 2026-07-28 | 17 | 939 | no | local only |

## Deletions: none

The rule is to delete only branches that are **both** fully contained in the
merged result **and** whose remote is gone.

Four branches are contained — `docs/v1-final`, `release/v1.0`, `release/v1.1`,
`release/v1.2` — and **all four still exist on origin**. Checked individually
with `git show-ref --verify refs/remotes/origin/<branch>`; every one resolved.

So nothing qualifies, and nothing was deleted. The three `release/*` branches
have no upstream *configured* locally, which is not the same thing as a remote
that is gone: origin has `release/v1.0` at `a066d2cd4`, `release/v1.1` at
`fe89a8c07` and `release/v1.2` at `16d7f5655`. Deleting them locally would
discard nothing, but it also satisfies no condition in the rule, so it was not
done.

The other 26 local branches all carry commits `closeout/v1-final` does not have
and are not deletion candidates by any reading. Several are far from it —
`arch/docs-batch-2` is 815 ahead, `feat/rate-limit-layer` 301 — which reflects
divergent history rather than pending work, but proving that one by one is a
separate job and this audit does not claim it.

103 remote branches exist against 31 local. Pruning origin is out of scope here
and would need the same containment proof per branch.