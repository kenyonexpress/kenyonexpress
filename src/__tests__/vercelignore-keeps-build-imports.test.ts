import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * EVERY FILE src/ IMPORTS FROM OUTSIDE src/ MUST SURVIVE THE VERCEL UPLOAD.
 *
 * Measured 2026-11-03 (C192). `.vercelignore` had gained `/refs/` and `/docs/`
 * to shrink a 745 MB upload, and both directories hold a file the build
 * imports: `refs/electro-checkout-text.json` (checkout copy) and
 * `docs/redirects.map` (legacy WordPress redirects). Every deploy from then on
 * failed with module-not-found, while `pnpm build` stayed green locally because
 * the files are on disk. Production kept serving a day-old build and nothing
 * here noticed.
 *
 * This derives the list from the imports themselves, so a new cross-tree
 * import is covered without editing the test. The ignore rules are evaluated
 * by `git check-ignore` in an empty scratch repo, which applies the same
 * gitignore semantics Vercel uses, including the rule that a `/dir/` entry
 * cannot be un-ignored by a later `!` line.
 */
const root = process.cwd()
const src = resolve(root, 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

/** Repo-relative paths of every relative import that leaves src/. */
function crossTreeImports(): string[] {
  const found = new Set<string>()
  for (const file of sourceFiles(src)) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?:from|import)\s*\(?\s*['"](\.\.?\/[^'"]+)['"]/g)) {
      const target = resolve(dirname(file), match[1] as string)
      const rel = relative(root, target)
      if (!rel.startsWith('src/') && !rel.startsWith('..')) found.add(rel)
    }
  }
  return [...found].sort()
}

const scratch = mkdtempSync(join(tmpdir(), 'vercelignore-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

function ignored(paths: string[]): string[] {
  execFileSync('git', ['init', '-q'], { cwd: scratch })
  try {
    const out = execFileSync(
      'git',
      [
        '-c',
        `core.excludesFile=${resolve(root, '.vercelignore')}`,
        'check-ignore',
        '--no-index',
        ...paths,
      ],
      { cwd: scratch, encoding: 'utf8' },
    )
    return out.split('\n').filter(Boolean)
  } catch (error) {
    // Exit 1 means "none of these paths is ignored".
    if ((error as { status?: number }).status === 1) return []
    throw error
  }
}

describe('.vercelignore', () => {
  const imports = crossTreeImports()

  it('finds the known cross-tree imports, so the scan itself works', () => {
    expect(imports).toEqual(
      expect.arrayContaining(['refs/electro-checkout-text.json', 'docs/redirects.map']),
    )
  })

  it('does not strip any file the build imports from outside src/', () => {
    expect(ignored(imports)).toEqual([])
  })

  it('still strips the bulky working sets around them', () => {
    expect(ignored(['refs/ke_live_home.html', 'docs/RUNBOOK.md'])).toEqual([
      'refs/ke_live_home.html',
      'docs/RUNBOOK.md',
    ])
  })
})
