#!/usr/bin/env node
/**
 * Diff-scoped TypeScript gate (`tsc --strict --noEmit` on changed .ts/.tsx).
 *
 * Default range: HEAD~1..HEAD. Builds a temporary tsconfig that extends the
 * repo tsconfig and lists only the changed TypeScript sources (plus
 * next-env.d.ts) so path aliases and strict settings stay identical to local
 * `pnpm type-check`, without typechecking the whole tree every time.
 *
 * Exit: 0 clean / no TS files, 1 tsc reported errors.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { changedFiles, resolveRange } from './ci-diff-files.mjs'

const TS_FILE = /\.(?:ts|tsx)$/
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

const tmpDir = mkdtempSync(join(tmpdir(), 'ke-tsc-changed-'))
const tmpConfig = join(tmpDir, 'tsconfig.changed.json')

const config = {
  extends: join(process.cwd(), 'tsconfig.json'),
  compilerOptions: {
    strict: true,
    noEmit: true,
    incremental: false,
    plugins: [],
  },
  files: ['next-env.d.ts', ...files],
  include: [],
  exclude: ['node_modules'],
}

writeFileSync(tmpConfig, `${JSON.stringify(config, null, 2)}\n`)

try {
  execFileSync('pnpm', ['exec', 'tsc', '--strict', '-p', tmpConfig], {
    stdio: 'inherit',
  })
  console.log('typecheck-changed: tsc --strict clean on changed files')
  process.exit(0)
} catch {
  console.error('\ntypecheck-changed: tsc --strict failed on changed files.')
  process.exit(1)
} finally {
  rmSync(tmpDir, { recursive: true, force: true })
}
