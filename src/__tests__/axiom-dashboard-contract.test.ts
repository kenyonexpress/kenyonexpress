import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A dashboard is a claim about what the code emits, and it is the one kind of
 * claim nothing here could previously falsify.
 *
 * `scripts/axiom/dashboards/*.json` is upserted by `scripts/axiom/setup.mjs`.
 * Axiom accepts any APL that parses: a query naming an event this codebase
 * never logs is accepted, drawn, and renders an empty panel that is
 * indistinguishable from a quiet hour. Rename an event and the panel does not
 * break -- it goes to zero, which reads as good news.
 *
 * So the events the dashboards query are checked against the events the code
 * actually emits, read out of the source. The inverse is deliberately NOT
 * asserted: plenty of events exist that no panel charts, and that is fine.
 *
 * One panel is exempt and named below, because its producer is not this
 * application.
 */

const REPO = resolve(__dirname, '../..')
const SRC = join(REPO, 'src')
const DASHBOARDS = join(REPO, 'scripts/axiom/dashboards')

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(path)) found.push(path)
  }
  return found
}

/** Every event name any `log.*()` call site passes, plus the scrubber's own. */
const emitted = new Set<string>()
for (const file of sourceFiles(SRC)) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\blog\.(?:debug|info|warn|error)\(\s*'([a-z0-9_.]+)'/g)) {
    if (match[1]) emitted.add(match[1])
  }
}

/**
 * Events produced outside the application process, which therefore cannot
 * appear in a `log.*()` call site. Each one names the producer, so an entry
 * here is a pointer rather than a hole.
 *
 *   synthetic.probe -- scripts/synthetic-probe.mjs, run by
 *                      .github/workflows/synthetic.yml from GitHub's runners,
 *                      not from a server that imports log.ts.
 */
const EXTERNAL_PRODUCERS: Record<string, string> = {
  'synthetic.probe': 'scripts/synthetic-probe.mjs',
}

type Dashboard = {
  name: string
  charts: { id: string; query: { apl: string } }[]
  layout: { i: string }[]
}

const dashboards = readdirSync(DASHBOARDS)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((file) => ({
    file,
    json: JSON.parse(readFileSync(join(DASHBOARDS, file), 'utf8')) as Dashboard,
  }))

describe('Axiom dashboards, as code', () => {
  it('found the call sites to compare against, so an empty scan cannot pass', () => {
    expect(emitted.size).toBeGreaterThan(200)
    expect(emitted.has('request.completed')).toBe(true)
    expect(dashboards.length).toBeGreaterThanOrEqual(4)
  })

  it.each(dashboards)('$file charts only events this code emits', ({ json }) => {
    const unknown: string[] = []
    for (const chart of json.charts) {
      for (const match of chart.query.apl.matchAll(/event\s*(?:==|in)\s*\(?\s*'([^']+)'/g)) {
        const name = match[1] ?? ''
        if (!emitted.has(name) && !(name in EXTERNAL_PRODUCERS)) {
          unknown.push(`${chart.id}: '${name}'`)
        }
      }
      // `in ('a', 'b', 'c')` -- the regex above catches the first name only.
      for (const list of chart.query.apl.matchAll(/event\s+in\s*\(([^)]*)\)/g)) {
        for (const quoted of (list[1] ?? '').matchAll(/'([^']+)'/g)) {
          const name = quoted[1] ?? ''
          if (!emitted.has(name) && !(name in EXTERNAL_PRODUCERS)) {
            unknown.push(`${chart.id}: '${name}'`)
          }
        }
      }
    }
    expect([...new Set(unknown)], 'charted but never logged').toEqual([])
  })

  it.each(dashboards)('$file places every chart it declares', ({ json }) => {
    const charted = json.charts.map((c) => c.id).sort()
    const placed = json.layout.map((l) => l.i).sort()
    expect(placed).toEqual(charted)
  })

  it.each(dashboards)('$file binds the dataset rather than hard-coding one', ({ json }) => {
    for (const chart of json.charts) {
      expect(chart.query.apl, `${chart.id} must read ['{{dataset}}']`).toContain("['{{dataset}}']")
    }
  })

  it('every external producer it exempts is a file that exists', () => {
    for (const [event, producer] of Object.entries(EXTERNAL_PRODUCERS)) {
      expect(
        statSync(join(REPO, producer)).isFile(),
        `${event} claims to come from ${producer}`,
      ).toBe(true)
    }
  })
})
