import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RATE_LIMIT_POLICIES } from './policies'

/**
 * `docs/RATE-LIMITS.md` IS A VIEW OF THE TABLE, AND THIS IS WHAT KEEPS IT ONE.
 *
 * The document exists because the brief asked for a documented limits table.
 * A hand-maintained copy of forty numbers is a copy that goes stale, and a
 * stale limits table is worse than none: it is the thing somebody reads when
 * they are deciding whether a ceiling is too tight to ship against, and it
 * answers with numbers that are no longer deployed.
 *
 * So the document is generated from `RATE_LIMIT_POLICIES` and this test is the
 * drift guard. It fails on the commit that changes a limit without updating
 * the document, and on the commit that adds a policy the document does not
 * list — not on the day somebody notices.
 *
 * WHAT IS COMPARED: name, limit, window and the reason string, all four, for
 * every row in both directions. The reason is included on purpose. It is the
 * only part of a row that says what breaks when the number is wrong, and it is
 * the part most likely to be edited in the table and forgotten in the prose.
 */

const DOC = 'docs/RATE-LIMITS.md'

/** Must match the formatter the document was generated with. */
function windowLabel(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`
  if (seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds} s`
}

type DocRow = { limit: string; window: string; reason: string }

function documentedRows(): Map<string, DocRow> {
  const text = readFileSync(resolve(process.cwd(), DOC), 'utf8')
  const rows = new Map<string, DocRow>()
  // Only the policy table's rows start with a backticked name in cell one.
  for (const match of text.matchAll(/^\| `([a-z0-9_-]+)` \| (\d+) \| ([^|]+?) \| ([^|]+?) \|$/gm)) {
    rows.set(match[1] as string, {
      limit: match[2] as string,
      window: (match[3] as string).trim(),
      reason: (match[4] as string).trim(),
    })
  }
  return rows
}

describe('docs/RATE-LIMITS.md against the policy table', () => {
  const documented = documentedRows()

  it('parses the table at all, so a reformat cannot empty this test', () => {
    expect(documented.size).toBe(Object.keys(RATE_LIMIT_POLICIES).length)
  })

  it('documents every policy with the deployed limit, window and reason', () => {
    const wrong: string[] = []
    for (const [name, p] of Object.entries(RATE_LIMIT_POLICIES)) {
      const row = documented.get(name)
      if (!row) {
        wrong.push(`${name}: in the code, absent from ${DOC}`)
        continue
      }
      const expected = `${p.limit} | ${windowLabel(p.windowSeconds)} | ${p.reason}`
      const actual = `${row.limit} | ${row.window} | ${row.reason}`
      if (expected !== actual) wrong.push(`${name}: doc says "${actual}", code says "${expected}"`)
    }
    expect(wrong).toEqual([])
  })

  it('documents no policy that no longer exists', () => {
    const stale = [...documented.keys()].filter((name) => !(name in RATE_LIMIT_POLICIES))
    expect(stale).toEqual([])
  })
})
