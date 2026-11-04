# S01 baseline

Measured 2026-11-04 on branch closeout/v1-final, from the repo root.

## Branch and tag

```
$ git fetch origin
$ git checkout closeout/v1-final
Already on 'closeout/v1-final'
Your branch is up to date with 'origin/closeout/v1-final'.
$ git reset --hard origin/closeout/v1-final
HEAD is now at 337d1a2a4 docs(m08-c113): seller line carries ח.פ 033798513 (#89)
$ git rev-parse HEAD origin/closeout/v1-final design-locked-2026-10-19^{commit}
337d1a2a47b9086638cf4a66dd6fc8b3809ea960
337d1a2a47b9086638cf4a66dd6fc8b3809ea960
337d1a2a47b9086638cf4a66dd6fc8b3809ea960
```

HEAD == origin/closeout/v1-final == design-locked-2026-10-19.

## pnpm install --frozen-lockfile

```
. prepare$ husky || true
. prepare: Done
Done in 9.9s using pnpm v11.1.2
EXIT=0
```

## pnpm tsc --noEmit

First run: exit 2, 316 errors, every one inside gitignored generated route
types (158 in `.next/types/validator.ts`, 158 in `.next/dev/types/validator.ts`),
pointing at routes that do not exist in this tree (for example
src/app/api/push/unsubscribe/route.js). Those files were left by builds of
another tree (stamped 03.11 and 04.11 12:40). Zero errors in source.

Fix, no tracked file touched:

- `pnpm next typegen` regenerated `.next/types` for this tree.
- `.next/dev/types` (only written by next dev, which typegen does not refresh)
  was moved aside to `.next/dev/types.stale-S01`, not deleted.

```
$ pnpm tsc --noEmit
EXIT=0
```

## pnpm vitest run

```
 RUN  v4.1.11 /Users/ofir/kenyonexpress-web/kenyonexpress

 Test Files  640 passed (640)
      Tests  7674 passed | 12 skipped (7686)
   Duration  64.22s
EXIT=0
```

## Design freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
(empty output, exit 0)
```

No frozen file differs from the tag. The only file this item adds is this
document plus its row in the docs index.
