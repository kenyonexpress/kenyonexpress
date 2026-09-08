import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CLIENT_EVENT_NAMES,
  type ClientEventName,
  REQUIRED_PROPS,
  SERVER_EVENT_NAMES,
} from './events'

/**
 * `docs/ANALYTICS-EVENTS.md` IS A VIEW OF THE TAXONOMY, AND THIS KEEPS IT ONE.
 *
 * Same shape as `rate-limit/docs-table.test.ts` and for the same reason: a
 * hand-maintained copy of the event list is a copy that goes stale, and a stale
 * taxonomy is read by whoever is deciding what an event is called before they
 * add an emitter for it. A name invented twice is two funnels.
 *
 * WHAT IS COMPARED: every client event with its required props, and every
 * server event, in both directions. The required props are included because
 * they are the part that changes without the name changing, and an emitter
 * written against a doc that lists the wrong required prop is rejected by
 * `fn_ingest_analytics_events` at runtime rather than at review.
 */

const DOC = 'docs/ANALYTICS-EVENTS.md'

type Row = { source: string; props: string }

function documentedRows(): Map<string, Row> {
  const text = readFileSync(resolve(process.cwd(), DOC), 'utf8')
  const rows = new Map<string, Row>()
  for (const match of text.matchAll(/^\| `([a-z_]+)` \| (לקוח|שרת) \| ([^|]+?) \|$/gm)) {
    rows.set(match[1] as string, {
      source: match[2] as string,
      props: (match[3] as string).trim(),
    })
  }
  return rows
}

/** How the document renders the required-props cell. */
function propsCell(name: ClientEventName): string {
  const required = REQUIRED_PROPS[name]
  return required.length === 0 ? '—' : required.map((p) => `\`${p}\``).join(', ')
}

describe('docs/ANALYTICS-EVENTS.md against the taxonomy', () => {
  const documented = documentedRows()

  it('parses the table at all, so a reformat cannot empty this test', () => {
    expect(documented.size).toBe(CLIENT_EVENT_NAMES.length + SERVER_EVENT_NAMES.length)
  })

  it('documents every client event with its required props', () => {
    const wrong: string[] = []
    for (const name of CLIENT_EVENT_NAMES) {
      const row = documented.get(name)
      if (!row) {
        wrong.push(`${name}: in the code, absent from ${DOC}`)
        continue
      }
      if (row.source !== 'לקוח')
        wrong.push(`${name}: doc calls it "${row.source}", not a client event`)
      const expected = propsCell(name)
      if (row.props !== expected) {
        wrong.push(`${name}: doc says props "${row.props}", code says "${expected}"`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('documents every server event, and as a server event', () => {
    const wrong: string[] = []
    for (const name of SERVER_EVENT_NAMES) {
      const row = documented.get(name)
      if (!row) wrong.push(`${name}: in the code, absent from ${DOC}`)
      else if (row.source !== 'שרת') wrong.push(`${name}: doc calls it "${row.source}"`)
    }
    expect(wrong).toEqual([])
  })

  it('documents no event that no longer exists', () => {
    const known = new Set<string>([...CLIENT_EVENT_NAMES, ...SERVER_EVENT_NAMES])
    expect([...documented.keys()].filter((name) => !known.has(name))).toEqual([])
  })
})
