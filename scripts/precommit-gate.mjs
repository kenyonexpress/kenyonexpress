#!/usr/bin/env node
/**
 * Pre-commit: type-check and test what is being committed.
 *
 * `lint-staged` already runs Biome on the staged files. This adds the two
 * gates the PR template asks for and that used to run only in CI: `tsc` over
 * the staged TypeScript, and the Vitest files related to the staged sources.
 * Measured 22.09.2026 on this machine: a whole-project `tsc --noEmit` is 13 s
 * and `vitest related` on two files is 2.5 s, so the hook costs a coffee sip
 * and not a coffee.
 *
 * SCOPED TO THE INDEX, NOT THE WORKING TREE. Several sessions edit this
 * checkout at once, so "the tree compiles" is a question about other people's
 * work in progress. "What I am about to commit compiles" is the question a
 * hook can fairly ask. The temporary tsconfig lists the staged files as roots;
 * tsc still follows their imports, which is the point.
 *
 * Escape hatch: `git commit --no-verify` is git's own, and CI runs the same
 * three gates on the PR, so skipping here only moves the failure later.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'

const TS_FILE = /\.(?:ts|tsx)$/
const TMP_CONFIG = 'tsconfig.precommit.json'

/** Pure: which gates a set of staged paths needs. Tested in precommit-gate.test.mjs. */
export function planPrecommit(staged) {
  const ts = staged.filter(
    (file) =>
      TS_FILE.test(file) &&
      !file.endsWith('.d.ts') &&
      (file.startsWith('src/') || file.startsWith('e2e/') || file.startsWith('scripts/')),
  )
  const testable = staged.filter(
    (file) => TS_FILE.test(file) && file.startsWith('src/') && !file.endsWith('.d.ts'),
  )
  return { typecheck: ts, related: testable }
}

function stagedFiles() {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean).filter(existsSync)
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' })
  return result.status ?? 1
}

function main() {
  const plan = planPrecommit(stagedFiles())
  if (plan.typecheck.length === 0 && plan.related.length === 0) {
    console.log('precommit-gate: no TypeScript staged, nothing to check')
    return 0
  }

  if (plan.typecheck.length > 0) {
    const roots = ['next-env.d.ts', 'vitest.setup.ts'].filter(existsSync)
    for (const file of plan.typecheck) if (!roots.includes(file)) roots.push(file)
    writeFileSync(
      TMP_CONFIG,
      JSON.stringify(
        {
          extends: './tsconfig.json',
          compilerOptions: { noEmit: true, incremental: false, plugins: [] },
          files: roots,
          include: [],
        },
        null,
        2,
      ),
    )
    console.log(`precommit-gate: tsc on ${plan.typecheck.length} staged file(s)`)
    let status
    try {
      status = run('pnpm', ['exec', 'tsc', '-p', TMP_CONFIG])
    } finally {
      rmSync(TMP_CONFIG, { force: true })
    }
    if (status !== 0) {
      console.error(
        'precommit-gate: type errors in the staged files. Fix them or commit with --no-verify and let CI say it.',
      )
      return status
    }
  }

  if (plan.related.length > 0) {
    console.log(`precommit-gate: vitest related on ${plan.related.length} staged file(s)`)
    const status = run('pnpm', [
      'exec',
      'vitest',
      'related',
      '--run',
      '--passWithNoTests',
      ...plan.related,
    ])
    if (status !== 0) {
      console.error('precommit-gate: a test related to the staged files fails.')
      return status
    }
  }

  return 0
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  process.exit(main())
}
