#!/usr/bin/env node
/**
 * Diff-scoped TypeScript gate (`tsc --strict --noEmit` on changed .ts/.tsx).
 *
 * Default range: HEAD~1..HEAD via git diff HEAD~1..HEAD --name-only.
 * Writes a temporary tsconfig in the repo root (not /tmp) so relative
 * `files` entries and `extends: ./tsconfig.json` resolve correctly, then
 * runs `tsc --strict -p` on only those roots. Imported modules are still
 * pulled in by the compiler; unrelated roots are not.
 *
 * Exit: 0 clean / no TS files, 1 tsc reported errors.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { changedFiles, resolveRange } from './ci-diff-files.mjs'

const TS_FILE = /\.(?:ts|tsx)$/
const TMP_CONFIG = 'tsconfig.ci-changed.json'
const range = resolveRange()
const files = changedFiles({
  range,
  includeWorkingTree: !process.env.CI,
  predicate: (file) =>
    TS_FILE.test(file) &&
    !file.endsWith('.d.ts') &&
    (file.startsWith('src/') || file.startsWith('e2e/') || file.startsWith('scripts/')),
})

if (files.length === 0) {
  console.log(`typecheck-changed: no TypeScript sources in ${range}`)
  process.exit(0)
}

console.log(`typecheck-changed: range ${range}`)
console.log(`typecheck-changed: ${files.length} file(s)`)
for (const file of files) console.log(`  ${file}`)

// Ambient roots. `include: []` below switches off tsconfig's own globs, so any
// file that only augments global types has to be named here or its
// declarations vanish. `vitest.setup.ts` imports @testing-library/jest-dom,
// which augments vitest's `Assertion` interface; without it every changed
// `.test.tsx` using `toBeDisabled`/`toBeInTheDocument` fails TS2339 while the
// full-project `tsc` passes. That is a gate failing on correct code, so it is
// worse than no gate: measured 2026-08-20, five false errors on one file.
const AMBIENT_ROOTS = ['next-env.d.ts', 'vitest.setup.ts']

const roots = AMBIENT_ROOTS.filter((root) => existsSync(root))
roots.push(...files.filter((file) => !roots.includes(file)))

const config = {
  extends: './tsconfig.json',
  compilerOptions: {
    strict: true,
    noEmit: true,
    incremental: false,
    plugins: [],
  },
  files: roots,
  include: [],
  exclude: ['node_modules'],
}

const configPath = join(process.cwd(), TMP_CONFIG)
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

let exitCode = 0
try {
  execFileSync('pnpm', ['exec', 'tsc', '--strict', '--noEmit', '-p', TMP_CONFIG], {
    stdio: 'inherit',
  })
  console.log('typecheck-changed: tsc --strict clean on changed files')
} catch {
  console.error('\ntypecheck-changed: tsc --strict failed on changed files.')
  exitCode = 1
} finally {
  rmSync(configPath, { force: true })
}

process.exit(exitCode)
