<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# `npm install` cannot work in this repo. Use `pnpm`.

Any `npm install`/`npm i <pkg>` run from the project root dies with:

```
npm error Cannot read properties of null (reading 'matches')
```

This is **not** a corrupt npm cache, and `npm cache clean --force` does not
change it. The package manager here is pnpm (`packageManager: pnpm@11.1.2`,
`pnpm-lock.yaml`, no `package-lock.json`). pnpm's virtual store,
`node_modules/.pnpm/**`, is a forest of symlinks. npm's arborist loads that
tree, builds `Link` nodes whose `target` resolves to `null`, and then
`Link.matches` dereferences it:

```
at Link.matches      (@npmcli/arborist/lib/node.js:1183:41)
at Link.canDedupe    (@npmcli/arborist/lib/node.js:1127:15)
at PlaceDep.pruneDedupable
```

Measured, not assumed: the identical `npm i -D playwright`, same npm 11.12.1
and same cache, succeeds in an empty directory and fails here. It also fails
**before any escape hatch npm offers** — a `preinstall` script and
`engine-strict` + a bogus `engines.npm` were both tried and neither fired,
because the crash is inside `buildIdealTree`, ahead of every lifecycle hook.
There is therefore no way to replace that message with a helpful one from
inside the repo. This section is the replacement.

Install with `pnpm add -D <pkg>`.

**`scripts/compare.mjs` never needed it.** It imports `@playwright/test`
(already a devDependency, 1.60.0), not `playwright`, and the browsers are in
`~/Library/Caches/ms-playwright/`. Run it against a built server:

```
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```
