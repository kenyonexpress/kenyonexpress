import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRIMARY_SERVICES } from '../lib/health/services'

/**
 * THE PER-COMPONENT RUNBOOKS ARE A CONTRACT, AND THIS IS WHAT HOLDS IT.
 *
 * `docs/runbooks/` exists so that somebody who did not build this finds the
 * rollback step in the same place in every file, at an hour when they are not
 * at their best. That only works while every file really has the same shape,
 * and a document directory has no compiler. So this test is the compiler.
 *
 * WHAT IT HOLDS:
 *  - every runbook carries the metadata table (component, on-call, health
 *    card) and the eight numbered sections, in order;
 *  - the on-call row names Ofir, because there is no rotation and no second
 *    person, and a runbook that says "escalate" without saying to whom is a
 *    runbook that stalls;
 *  - the rollback section has numbered steps, not prose;
 *  - every health check `/admin/health` can show (the six cards and the four
 *    table rows, read out of `checks.ts`) is claimed by exactly one runbook,
 *    so a new dependency cannot be added to the dashboard without a runbook
 *    for the night it goes red;
 *  - every scheduled job in `scripts/cron-jobs.json` appears in the
 *    scheduler runbook, the same drift the cron inventory test guards;
 *  - the README's escalation ladder exists, names the paging channel, and
 *    links every runbook, and nothing links to a file that is not there;
 *  - no em dash anywhere, per the house style for text shown to Ofir.
 *
 * WHAT IT DOES NOT DO: it cannot tell whether a rollback step is right. It
 * holds the shape, so that the content is at least where a reader looks.
 */

const ROOT = process.cwd()
const DIR = resolve(ROOT, 'docs/runbooks')
const README = 'README.md'

const SECTIONS = [
  '## 1. רדיוס פגיעה',
  '## 2. זיהוי',
  "## 3. טריאז'",
  '## 4. צעדי Rollback',
  '## 5. מה לא ניתן להחזיר',
  '## 6. מתי להסלים',
  '## 7. אימות אחרי',
  '## 8. מסמכים קשורים',
] as const

const ON_CALL_ROW = /^\| כונן \| אופיר \|$/m
const HEALTH_ROW = /^\| כרטיס ב-\/admin\/health \| (.+) \|$/m
const PAGING_TOPIC = 'ntfy.sh/kenyon-ofir-limit'

function read(name: string): string {
  return readFileSync(resolve(DIR, name), 'utf8')
}

function runbookFiles(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.md') && f !== README)
    .sort()
}

function backticked(cell: string): string[] {
  return [...cell.matchAll(/`([a-z_]+)`/g)].map((m) => m[1] as string)
}

/** The stable check names `checks.ts` can report, read from the source. */
function healthCheckNames(): string[] {
  const src = readFileSync(resolve(ROOT, 'src/lib/health/checks.ts'), 'utf8')
  return [...new Set([...src.matchAll(/^\s+name: '([a-z_]+)',$/gm)].map((m) => m[1] as string))]
}

describe('docs/runbooks: one runbook per component, one shape for all of them', () => {
  const files = runbookFiles()

  it('has the twelve component runbooks and an index', () => {
    expect(files.length).toBeGreaterThanOrEqual(12)
    expect(existsSync(resolve(DIR, README))).toBe(true)
  })

  it.each(files)(
    '%s has the metadata table, Ofir on call, and the eight sections in order',
    (file) => {
      const text = read(file)
      expect(text.startsWith('# ')).toBe(true)
      expect(text).toMatch(/^\| רכיב \| .+ \|$/m)
      expect(text).toMatch(ON_CALL_ROW)
      expect(text).toMatch(HEALTH_ROW)
      expect(text).toMatch(/^\| סולם הסלמה \| .*README\.md.* \|$/m)

      const positions = SECTIONS.map((heading) => text.indexOf(`\n${heading}\n`))
      for (const [i, pos] of positions.entries()) {
        expect(pos, `${file} is missing "${SECTIONS[i]}"`).toBeGreaterThan(0)
        if (i > 0)
          expect(pos, `${file}: "${SECTIONS[i]}" is out of order`).toBeGreaterThan(
            positions[i - 1] as number,
          )
      }
      // Exactly these eight numbered sections, so a ninth cannot sneak in
      // between and shift the reader's expectations.
      const numbered = [...text.matchAll(/^## \d+\. /gm)]
      expect(numbered).toHaveLength(SECTIONS.length)
    },
  )

  it.each(files)(
    '%s rollback section is numbered steps and the first one is a brake or a reversal',
    (file) => {
      const text = read(file)
      const start = text.indexOf(`\n${SECTIONS[3]}\n`)
      const end = text.indexOf(`\n${SECTIONS[4]}\n`)
      const rollback = text.slice(start, end)
      const steps = [...rollback.matchAll(/^\d+\. \*\*/gm)]
      expect(
        steps.length,
        `${file}: rollback needs at least three numbered, bolded steps`,
      ).toBeGreaterThanOrEqual(3)
      expect(rollback).toMatch(/^1\. \*\*/m)
    },
  )

  it.each(files)('%s escalation section names Ofir', (file) => {
    const text = read(file)
    const start = text.indexOf(`\n${SECTIONS[5]}\n`)
    const end = text.indexOf(`\n${SECTIONS[6]}\n`)
    expect(text.slice(start, end)).toContain('אופיר')
  })

  it('every /admin/health check name is claimed by exactly one runbook', () => {
    const claims = new Map<string, string[]>()
    for (const file of files) {
      // Check names come first in the cell; anything in parentheses is commentary.
      const cell = (read(file).match(HEALTH_ROW)?.[1] ?? '').split('(')[0] as string
      for (const name of backticked(cell)) {
        claims.set(name, [...(claims.get(name) ?? []), file])
      }
    }
    const names = healthCheckNames()
    expect(names.length).toBeGreaterThanOrEqual(10)
    for (const name of names) {
      expect(claims.get(name), `health check "${name}" has no runbook`).toHaveLength(1)
    }
    for (const service of PRIMARY_SERVICES) {
      expect(claims.has(service.name), `card "${service.name}" has no runbook`).toBe(true)
    }
    // And nothing claims a check that does not exist.
    for (const claimed of claims.keys()) {
      expect(names, `runbook claims unknown health check "${claimed}"`).toContain(claimed)
    }
  })

  it('the scheduler runbook lists every job in scripts/cron-jobs.json', () => {
    const raw = JSON.parse(readFileSync(resolve(ROOT, 'scripts/cron-jobs.json'), 'utf8')) as
      | { name: string; cron: string }[]
      | { jobs: { name: string; cron: string }[] }
    const jobs = Array.isArray(raw) ? raw : raw.jobs
    const text = read('scheduler-cron.md')
    expect(jobs.length).toBeGreaterThan(0)
    for (const job of jobs) {
      expect(text, `cron job "${job.name}" is not in scheduler-cron.md`).toContain(
        `| \`${job.name}\` | \`${job.cron}\` |`,
      )
    }
  })

  it('README has the on-call contact, the paging channel, the escalation ladder and the four standing stops', () => {
    const readme = read(README)
    expect(readme).toContain('## מי הכונן')
    expect(readme).toContain(PAGING_TOPIC)
    expect(readme).toContain('## סולם ההסלמה')
    expect(readme).toContain('## רמות חומרה')
    for (const tier of ['| ‏0 |', '| ‏1 |', '| ‏2 |', '| ‏3 |']) expect(readme).toContain(tier)
    for (const sev of ['SEV1', 'SEV2', 'SEV3']) expect(readme).toContain(sev)
    // The four stop-and-ask situations from CLAUDE.md, restated for the ladder.
    expect(readme).toMatch(/deploy --prod/)
    expect(readme).toMatch(/מחיקת ‏?DB/)
    expect(readme).toMatch(/מיגרציה בפרודקשן/)
    expect(readme).toMatch(/סוכן קוד שני/)
  })

  it('README links every runbook and every link in the directory resolves', () => {
    const readme = read(README)
    for (const file of files) {
      expect(readme, `README does not link ${file}`).toContain(`[${file}](${file})`)
    }
    for (const file of [README, ...files]) {
      const text = read(file)
      for (const m of text.matchAll(/\]\(([^)#]+\.md)\)/g)) {
        const target = m[1] as string
        expect(existsSync(resolve(DIR, target)), `${file} links to missing ${target}`).toBe(true)
      }
      for (const m of text.matchAll(/`\.\.\/([A-Z0-9-]+\.md)`/g)) {
        const target = m[1] as string
        expect(
          existsSync(resolve(ROOT, 'docs', target)),
          `${file} names missing docs/${target}`,
        ).toBe(true)
      }
      for (const m of text.matchAll(/`(scripts\/[\w./-]+|src\/[\w./-]+|migrations\/[\w./-]+)`/g)) {
        const target = m[1] as string
        expect(existsSync(resolve(ROOT, target)), `${file} names missing ${target}`).toBe(true)
      }
    }
  })

  it('no em dash in any runbook', () => {
    for (const file of [README, ...files]) {
      expect(read(file).includes('—'), `${file} contains an em dash`).toBe(false)
    }
  })
})
