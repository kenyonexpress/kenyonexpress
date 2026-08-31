import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Two gates were measured wrong on 2026-08-20, in opposite directions, and
 * both are pinned here because both regress with a one-line edit.
 */

const ROOT = resolve(__dirname, '..', '..')
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8')

/**
 * FALSE NEGATIVE. `package.json`'s `lint` was `biome lint .` while
 * `scripts/lint-changed.mjs` used `biome check`. `biome lint` runs rules only;
 * `biome check` also runs the formatter and the assists (organizeImports).
 * Four repo-wide errors - three organizeImports, one format - therefore passed
 * BOTH watched surfaces: `pnpm lint` locally, and CI's "Repo-wide lint" step,
 * which calls that same script. They surfaced only on a pull_request run, whose
 * CI_DIFF_RANGE widens to `origin/main...HEAD` instead of `HEAD~1..HEAD`.
 *
 * The failure is not lint debt. It is a gate whose green meant less than the
 * comment above it claimed.
 */
describe('lint gate scope', () => {
  it('runs `biome check` repo-wide, not the narrower `biome lint`', () => {
    const pkg = JSON.parse(read('package.json'))
    const lint: string = pkg.scripts.lint

    expect(lint).toContain('biome check')
    expect(lint).not.toMatch(/biome\s+lint\b/)
  })

  it('uses the same Biome subcommand in the diff-scoped gate', () => {
    const source = read('scripts', 'lint-changed.mjs')

    expect(source).toContain("'check'")
    expect(source).not.toMatch(/'biome',\s*'lint'/)
  })
})

/**
 * FALSE POSITIVE. `scripts/typecheck-changed.mjs` writes a temp tsconfig with
 * `include: []`, so tsconfig's own globs are off and only the files it names
 * are loaded. It named `next-env.d.ts` and the changed files, which drops every
 * global type augmentation that lives anywhere else. `vitest.setup.ts` imports
 * @testing-library/jest-dom, which augments vitest's `Assertion` interface, so
 * any changed `.test.tsx` calling `toBeDisabled` failed TS2339 while the
 * full-project `tsc --noEmit` passed on the identical file. Measured: five
 * false errors on one file, blocking CI on correct code.
 *
 * A gate that fails on correct code is worse than no gate: it teaches people to
 * re-run CI instead of reading it.
 */
describe('diff-scoped typecheck ambient roots', () => {
  const script = read('scripts', 'typecheck-changed.mjs')

  it('names the vitest setup file as an ambient root', () => {
    // Parse the array, do not grep the file. A plain `toContain` on the source
    // matched the prose in the comment above AMBIENT_ROOTS and stayed green
    // with the root deleted - a decorative assertion, verified as such.
    const declaration = script.match(/const AMBIENT_ROOTS = \[([^\]]*)\]/)
    expect(declaration).not.toBeNull()

    const roots = (declaration?.[1] ?? '').match(/'[^']+'/g)?.map((q) => q.slice(1, -1)) ?? []
    expect(roots).toContain('vitest.setup.ts')
  })

  it('still switches tsconfig globs off, which is why the root is needed', () => {
    expect(script).toMatch(/include:\s*\[\]/)
  })

  it('keeps the jest-dom augmentation in the file that root points at', () => {
    // If the import moves, the ambient root above is stale and the false
    // TS2339 comes straight back. This is the assertion that catches that.
    expect(read('vitest.setup.ts')).toContain('jest-dom')
  })
})
