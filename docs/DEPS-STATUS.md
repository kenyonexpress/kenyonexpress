# Dependency Update Status

**Last Check:** 2026-10-21 22:02 UTC (MAINTENANCE_LOOP_2, fifteenth pass, HEAD 0a99e0978)  
**Status:** No patch-only updates available; the fourteenth pass's @marsidev/react-turnstile 1.6.3 remains the newest in its minor

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
- @anthropic-ai/sdk: 0.122.0 → 0.136.0
- lucide-react: 1.59.0 → 1.60.0 (inside the caret range, so `pnpm outdated --compatible` lists it, but it is a minor and stays skipped)

## Patch Version Updates (Applied)
- None this pass. The fourteenth pass's @marsidev/react-turnstile 1.6.3 (published 2026-10-21 19:24 UTC) is still the newest 1.6.x, and no other package has published inside its installed minor since.

## Assessment

No package has a newer patch inside its installed minor (66 direct dependencies checked against the registry, node-forge compared inside 1.4 as 1.4.1-0).  
Every `pnpm outdated` row is a minor or major version change and stays skipped.

**Goal Result:** Zero patches to apply. All quality gates passing.

## Pass log

| Date (UTC) | HEAD | Direct deps scanned | Patch bumps | Method |
|---|---|---|---|---|
| 2026-10-21 05:40 | 2dba324b8 | 66 | 0 | `pnpm outdated --format=json` (17 rows, all minor/major) plus `npm view <name> versions` per package for a newer patch inside the installed major.minor; `pnpm outdated --compatible` empty |
| 2026-10-21 10:36 | affd861c0 | 66 (65 registry, node-forge `github:` pin skipped) | 0 | `pnpm outdated` (18 rows, all minor/major) plus `npm view <name> versions` per package, filtered to the installed major.minor from `node_modules/<name>/package.json`; `pnpm outdated --compatible` shows only lucide-react 1.60.0 (minor) |
| 2026-10-21 13:30 | 7b870bb95 | 66 (65 registry, node-forge `github:` pin skipped) | 0 | `pnpm outdated` (18 rows, all minor/major) plus `npm view <name> versions` per package, filtered to the installed major.minor read from the `importers` block of `pnpm-lock.yaml` (66 of 66 resolved after fixing a quoted-scoped-name regex that first matched only 31); `pnpm outdated --compatible` shows only lucide-react 1.60.0 (minor) |
| 2026-10-21 14:51 | e98973c01 | 66 (65 registry, node-forge `github:` pin skipped) | 0 | `pnpm outdated --format json` (18 rows: 4 minor, 14 major, 0 patch, classified by script) plus `npm view <name> versions` per package, filtered to the installed major.minor read from `node_modules/<name>/package.json`; no newer patch inside any installed minor |
| 2026-10-21 17:35 | 5f4c3fe8f | 66 (65 registry, node-forge `github:` pin skipped) | 0 | `pnpm outdated --format json` (18 rows: 4 minor, 14 major, 0 patch) plus `npm view <name> versions` per package, filtered to the installed major.minor read from `node_modules/<name>/package.json`; no newer patch inside any installed minor; `pnpm install --frozen-lockfile --offline` already up to date |
| 2026-10-21 18:57 | 790572e7c | 66 (65 registry, node-forge `github:` pin skipped) | 0 | `pnpm outdated --format json` (18 rows: 4 minor, 14 major, 0 patch) plus `npm view <name> versions` per package, filtered to the installed major.minor read from `node_modules/<name>/package.json`; no newer patch inside any installed minor; `pnpm install --frozen-lockfile --offline` already up to date |
| 2026-10-21 20:37 | a7abb4904 | 66 (66 reached the registry; node-forge resolves to 1.4.1-0 and was compared inside 1.4) | 1 | `pnpm outdated` (18 rows: 4 minor, 14 major, 0 patch) plus `npm view <name> versions` per package, filtered to the installed major.minor read from `node_modules/<name>/package.json`; **one newer patch inside an installed minor: @marsidev/react-turnstile 1.6.2 → 1.6.3** (published 2026-10-21 19:24 UTC, after the thirteenth pass); bumped by editing the specifier to `^1.6.3` and running `pnpm install`, because `pnpm up <pkg>@1.6.3` also re-resolved rollup 4.64.10→4.64.12 and browserslist 4.29.3→4.29.4 for vite and webpack as duplicate lock entries (+300 lock lines) and that was reverted; final lock diff is 5 lines, the one package; published tarballs diffed: `package.json` version only, `dist/index.d.ts` namespace re-emit, `dist/index.js` bundler re-emit (`@__PURE__` annotations, if/else to ternary) plus one behaviour fix, the injected `<script>` `onerror` now deletes the `window` onload callback when the load fails instead of deleting it at setup time whenever an `onError` prop is passed |
| 2026-10-21 22:02 | 0a99e0978 | 66 (66 reached the registry; node-forge resolves to 1.4.1-0 and was compared inside 1.4) | 0 | `pnpm outdated --format json` (18 rows: 4 minor, 14 major, 0 patch) plus `npm view <name> versions` per package, filtered to the installed major.minor read from `pnpm list --json --depth 0`; no newer patch inside any installed minor; `pnpm outdated --compatible` shows only lucide-react 1.60.0 (minor); `pnpm install --frozen-lockfile --offline` already up to date; the package.json specifiers of six packages (@next/mdx ^16.3.4, two radix ^2.x, tailwind-merge ^2.6.0, jest-dom ^6.6.3, @types/node ^22.20.1) sit below their lock resolutions, which is caret drift and not a pending patch |
