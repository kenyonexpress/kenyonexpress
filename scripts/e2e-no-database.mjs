#!/usr/bin/env node
/**
 * Runs the browser specs that need no database.
 *
 * The spec list is `e2e/database-need.ts` and is NOT duplicated here: a second
 * copy is a second thing to forget, and `e2e-classification.test.ts` guards
 * that file rather than this one. Read with a regex instead of imported so this
 * stays a plain node script with no TypeScript loader.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve('e2e/database-need.ts'), 'utf8')
const block = source.slice(
  source.indexOf('export const NO_DATABASE_SPECS'),
  source.indexOf('export const NEEDS_DATABASE_SPECS'),
)
const specs = [...block.matchAll(/'([a-z0-9-]+\.spec\.ts)'/g)].map(([, name]) => `e2e/${name}`)

if (specs.length === 0) {
  console.error('e2e-no-database: found no specs in NO_DATABASE_SPECS. Refusing to report success.')
  process.exit(2)
}

console.log(`e2e-no-database: ${specs.length} spec file(s), no database required`)
execFileSync('pnpm', ['exec', 'playwright', 'test', ...specs, '--project=chromium'], {
  stdio: 'inherit',
})
