# Dependency Update Status

**Last Check:** 2026-10-21 14:51 UTC (MAINTENANCE_LOOP_2, eleventh pass, commit e98973c01)  
**Status:** No patch-only updates available

## Outdated Packages

### Major Version Updates (Skipped per goal)
- @biomejs/biome: 1.9.4 → 2.5.15
- @sentry/nextjs: 10.71.0 → 11.8.0
- @sentry/node: 10.71.0 → 11.8.0
- @simplewebauthn/browser: 13.3.0 → 14.0.0
- @simplewebauthn/server: 13.3.3 → 14.0.3
- @testing-library/jest-dom: 6.10.0 → 7.0.1
- @types/node: 22.20.5 → 26.6.5
- @vitejs/plugin-react: 4.7.0 → 6.1.2
- @vitest/coverage-v8: 3.2.7 → 5.0.5
- jsdom: 25.0.1 → 30.1.3
- tailwind-merge: 2.6.1 → 3.7.0
- typescript: 5.9.3 → 7.0.2
- vitest: 4.1.12 → 5.0.5
- zod: 3.25.76 → 4.6.7

### Minor Version Updates (Skipped per goal)
- react: 19.2.9 → 19.3.1
- react-dom: 19.2.9 → 19.3.1
- @anthropic-ai/sdk: 0.122.0 → 0.135.0
- lucide-react: 1.59.0 → 1.60.0 (inside the caret range, so `pnpm outdated --compatible` lists it, but it is a minor and stays skipped)

## Assessment

No packages have **patch-only** updates available (e.g., X.Y.Z → X.Y.W).  
All updates are either minor or major version changes.

**Goal Result:** No patches to apply. All quality gates passing.

## Pass log

| Date (UTC) | HEAD | Direct deps scanned | Patch bumps | Method |
|---|---|---|---|---|
| 2026-10-21 05:40 | 2dba324b8 | 66 | 0 | `pnpm outdated --format=json` (17 rows, all minor/major) plus `npm view <name> versions` per package for a newer patch inside the installed major.minor; `pnpm outdated --compatible` empty |
| 2026-10-21 10:36 | affd861c0 | 66 (65 registry, node-forge `github:` pin skipped) | 0 | `pnpm outdated` (18 rows, all minor/major) plus `npm view <name> versions` per package, filtered to the installed major.minor from `node_modules/<name>/package.json`; `pnpm outdated --compatible` shows only lucide-react 1.60.0 (minor) |
| 2026-10-21 13:30 | 7b870bb95 | 66 (65 registry, node-forge `github:` pin skipped) | 0 | `pnpm outdated` (18 rows, all minor/major) plus `npm view <name> versions` per package, filtered to the installed major.minor read from the `importers` block of `pnpm-lock.yaml` (66 of 66 resolved after fixing a quoted-scoped-name regex that first matched only 31); `pnpm outdated --compatible` shows only lucide-react 1.60.0 (minor) |
| 2026-10-21 14:51 | e98973c01 | 66 (65 registry, node-forge `github:` pin skipped) | 0 | `pnpm outdated --format json` (18 rows: 4 minor, 14 major, 0 patch, classified by script) plus `npm view <name> versions` per package, filtered to the installed major.minor read from `node_modules/<name>/package.json`; no newer patch inside any installed minor |
