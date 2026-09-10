import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE FILE THAT SAYS WHAT RUNS IN CI HAS TO BE RIGHT ABOUT WHAT RUNS IN CI.
 *
 * MEASURED 2026-09-10. `.github/workflows/README.md` opened with "Five
 * workflows live here" and gave a section to five of them. Ten workflow files
 * existed. `db-backup.yml`, `db-restore-drill.yml`, `load.yml`,
 * `nightly-health.yml` and `security.yml` were mentioned nowhere in it - not in
 * the count, not in a heading, not in passing - and two of those are scheduled
 * while a third is the repository's only secret scan.
 *
 * Nothing could have caught it. Adding a workflow is one commit; documenting it
 * is a second commit that no gate ever asked for, so the drift is the default
 * outcome rather than an accident. The root `README.md` had drifted the same way
 * in two numbers on the same day: "nine workflows" against ten on disk, and
 * "214 documents" against 258 that `scripts/docs-index-gate.mjs` already counts
 * on every `pnpm lint:docs`.
 *
 * WHAT THIS CANNOT DO. It cannot read GitHub's branch-protection settings, so it
 * cannot prove a red check blocks a merge. What it pins instead is the coupling
 * that makes that possible: protection requires four contexts BY NAME, and those
 * names live in `ci.yml`. Renaming a job there without updating Settings >
 * Branches leaves a required check that never reports again - the pull request
 * stays blocked forever, which is safe and unexplainable. This test is where the
 * measured list of required names is written down.
 */

const ROOT = resolve(__dirname, '..', '..')
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8')

const WORKFLOW_DIR = join(ROOT, '.github', 'workflows')
const workflowFiles = readdirSync(WORKFLOW_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort()

const workflowsReadme = read('.github', 'workflows', 'README.md')

/** Section headings of the form ``## `name.yml` ``, which is how this file documents one. */
const documented = [...workflowsReadme.matchAll(/^## `([\w.-]+\.ya?ml)`/gm)].map((m) => m[1]).sort()

describe('.github/workflows/README.md against the directory it describes', () => {
  it('gives every workflow file a section', () => {
    // Both directions in one assertion: a file with no section is a workflow
    // that runs undocumented, and a section with no file is a link to nothing.
    // `vercel.json` is discussed there too and is deliberately not matched -
    // the pattern requires a .yml name.
    expect(documented).toEqual(workflowFiles)
  })

  it('states the same number of workflow files as the directory holds', () => {
    const stated = workflowsReadme.match(/There are \*\*(\d+)\*\* workflow files here/)
    expect(stated).not.toBeNull()
    expect(Number(stated?.[1])).toBe(workflowFiles.length)
  })
})

describe('the root README against the tree', () => {
  it('states the workflow count that is on disk', () => {
    const stated = read('README.md').match(/(\d+) workflows ב-`\.github\/workflows\/`/)
    expect(stated).not.toBeNull()
    expect(Number(stated?.[1])).toBe(workflowFiles.length)
  })

  it('states the document count `scripts/docs-index-gate.mjs` counts', () => {
    // The same definition as the gate that already runs on every `pnpm
    // lint:docs`: every `.md` under `docs/`, recursively, except the index
    // itself. Two counts of the same thing that disagree is worse than one.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (entry.endsWith('.md')) out.push(p)
      }
      return out
    }
    const onDisk = walk(join(ROOT, 'docs')).filter((p) => !p.endsWith(join('docs', 'INDEX.md')))

    const stated = read('README.md').match(/(\d+) מסמכים/)
    expect(stated).not.toBeNull()
    expect(Number(stated?.[1])).toBe(onDisk.length)
  })
})

/**
 * Measured 2026-09-10, `gh api repos/:owner/:repo/branches/main/protection`:
 *
 *   required_status_checks.contexts = [
 *     "Diff-scoped lint gates",
 *     "Typecheck (changed files)",
 *     "Unit tests + money coverage floors",
 *     "Build",
 *   ]
 *   strict = true                     the branch must be up to date to merge
 *   enforce_admins = false            an admin can still push past all of it
 *   required_approving_review_count = 0
 *
 * The four names below are that list. They are asserted against `ci.yml`
 * because the workflow is the only half of the pairing this repository can see.
 */
const REQUIRED_CONTEXTS = [
  'Diff-scoped lint gates',
  'Typecheck (changed files)',
  'Unit tests + money coverage floors',
  'Build',
]

describe('the four required checks', () => {
  const ci = read('.github', 'workflows', 'ci.yml')

  /**
   * A deliberately small hand parser: jobs are the two-space keys under `jobs:`
   * and their own keys sit at four spaces. Comment lines are dropped first, so
   * prose about `continue-on-error` inside a comment cannot be read as the key.
   */
  type Job = { name?: string; hasIf: boolean; continueOnError: boolean }
  const jobs = (() => {
    const lines = ci.split('\n').filter((l) => !/^\s*#/.test(l))
    const out: Job[] = []
    let current: Job | null = null
    for (const line of lines) {
      if (/^ {2}[a-z][\w-]*:\s*$/.test(line)) {
        current = { hasIf: false, continueOnError: false }
        out.push(current)
        continue
      }
      if (!current) continue
      const name = line.match(/^ {4}name:\s*(.+?)\s*$/)
      if (name) current.name = name[1]
      if (/^ {4}if:/.test(line)) current.hasIf = true
      if (/^ {4}continue-on-error:\s*true/.test(line)) current.continueOnError = true
    }
    return out
  })()

  it('names all four in ci.yml, spelled exactly as branch protection requires', () => {
    const names = jobs.map((j) => j.name).filter((n): n is string => Boolean(n))
    for (const context of REQUIRED_CONTEXTS) expect(names).toContain(context)
  })

  it('leaves all four unconditional and blocking', () => {
    // A required check that is conditional or carries `continue-on-error: true`
    // is a green tick that proves nothing, and the protection list cannot tell
    // the difference.
    for (const context of REQUIRED_CONTEXTS) {
      const job = jobs.find((j) => j.name === context)
      expect(job, `no job named ${context}`).toBeDefined()
      expect(job?.continueOnError, `${context} carries continue-on-error`).toBe(false)
      expect(job?.hasIf, `${context} is conditional`).toBe(false)
    }
  })
})
