# The accessibility gate, and what it does not cover

Measured 2026-09-09. `docs/A11Y-SWEEP-REPORT.md` is the 2026-08-19 sweep and is
marked historical; this file is about the gate that was left behind by it.

## The finding: the gate is excellent and it does not run

`e2e/a11y.spec.ts` runs axe-core with `wcag2a`, `wcag2aa`, `wcag21a` and
`wcag21aa` across **19 routes in two viewports**, plus keyboard-traversal tests
for the product page and the seeded checkout, an RTL/`lang` assertion, and a
consent-banner overlap check at several widths. It is a serious piece of work.

**It has never run in CI and cannot today.** Both jobs that would run it skip
themselves and report success:

| Job | Skips when | Measured 2026-09-09 |
| --- | --- | --- |
| `E2E (Playwright)` | `secrets.CI_SUPABASE_URL` is empty | secret not set; job absent from the run |
| `E2E against the PR preview` | not a `pull_request`, **or** the same secret is empty | reported `success` having run nothing |

A green checkmark on a job that ran nothing is the same failure this repository
has already paid for twice: `production-smoke` probing two routes old enough to
exist in any build, and `cron-schedule-inventory` comparing the repo to itself.

**And the secret is not simply missing by neglect.** The E2E job's first step is
`pnpm seed:test`, which **writes fixture rows to whatever database the secret
names**. Setting `CI_SUPABASE_*` to the production project would seed
production. That is a real hazard and it is why the value is empty. Enabling
this needs a separate database, not a secret.

## The consequence, found by looking for it

The gate's 19 routes are **all unauthenticated**: the storefront, the legal
pages, the auth screens and `/supplier/login`. There is no `/account`, no
`/admin`, no `/supplier` past the login, and no `/checkout` axe scan.

So the areas behind a session had no accessibility gate of any kind, and it
shows. Measured before this document:

| Layout | Repeated nav | Skip link | `<main id>` |
| --- | --- | --- | --- |
| `(store)` | yes | yes | yes |
| `(legal)` | yes | yes | yes |
| `(account)` | `SiteHeader` | **no** | **no** |
| `(main)` | `Header` + 2 sidebars | **no** | **no** |
| `(admin)` | header + `AdminSidebar` | **no** | **no** |
| `(supplier)` | header + `SupplierNav` | **no** | **no** |
| `(auth)` | none | n/a | n/a |

`SkipLink.tsx` was written, documented, unit-tested and rendered by two of the
six layouts that needed it. `(account)` renders **the same `SiteHeader`** whose
masthead, search bar, category menu and nav row that component's own comment
describes as the reason it exists.

WCAG 2.4.1 Bypass Blocks is Level A, and Israeli standard 5568 adopts WCAG 2.0
AA, so this was a Level A failure on four layouts including the supplier
redemption screen.

**Axe would not have caught it even if it had run.** A missing skip link is not
an automated check: axe can see that a landmark exists, not that a user can
reach it in one Tab.

## What was done

All four layouts now render `<SkipLink />` and give their `<main>`
`id="main-content"` and `tabIndex={-1}`.

`tabIndex={-1}` is load-bearing rather than tidy. Without it the browser scrolls
to the target and leaves **focus** on the link, so the next Tab returns to the
top of the navigation. The skip link then appears to work for a sighted tester
using a mouse and does nothing at all for the keyboard user it exists for.

`src/__tests__/skip-link-coverage.test.ts` holds it: any `layout.tsx` that
renders a `<header>`, a `<nav>`, or a component whose name ends in
`Header`/`Nav`/`Sidebar` must render `<SkipLink />` and carry a
`#main-content` target with `tabIndex={-1}`.

**It is a Vitest test and not a Playwright one on purpose.** The E2E suite is
where accessibility checks belong and it is the suite that does not run. A unit
test that reads the layout sources runs on every commit, in the `Unit tests`
job, which is one of the four checks branch protection actually requires.

`(auth)` is exempt, and the exemption is derived rather than listed: it renders
no nav, so 2.4.1 has no repeated block to bypass. Add a header there and the
test starts failing on it by itself.

## The rest of SECTIONS 17, measured

| Item | State |
| --- | --- |
| 44px touch targets | Covered by the axe sweep's target-size rule, on public routes only |
| Focus visible | Covered, same scope |
| Skip to content | **Fixed here**, and now gated in a suite that runs |
| ARIA Hebrew labels | Present; `lang`/`dir` asserted in the E2E suite |
| Form errors announced | 20 components use `aria-live` or `role="alert"` |
| Contrast on `#fed700` and `#E4002B` | Fixed in the 08-19 sweep, which measured the ratios |
| Keyboard full flow | Tested for product and seeded checkout, in the suite that does not run |
| Screen reader checkout | Keyboard traversal only; no axe scan of `/checkout` |
| IS 5568 statement page | `/accessibility` and `/legal/accessibility` both exist |

The pattern across that table is one thing, not nine: **almost every
accessibility guarantee this project has depends on a suite that is currently
inert.** Restoring it needs a database that is not production, and that is the
single highest-value accessibility action available. Adding routes to a spec
that does not run would not have been progress.
