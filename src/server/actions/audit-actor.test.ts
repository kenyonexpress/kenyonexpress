import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every direct audit_log insert names its actor (marathon step 11).
 *
 * writeAuditLog (lib/admin/audit.ts) forces the question by signature; the
 * three sites that insert into audit_log DIRECTLY do not, and one of them --
 * the refund -- wrote `actor_id: null` for months while requireAdminSession
 * knew exactly who was refunding. The rule this pins:
 *
 *  - a HUMAN action writes the session's id (`actor_id: session...`);
 *  - a MACHINE action may write null, but then its metadata must name the
 *    machine (`source:` or `alarm:`), so the row still answers "who did
 *    this" -- with a system name instead of a person.
 *
 * A new direct insert site must appear in this list and satisfy the rule, or
 * use writeAuditLog and not appear at all.
 */

const DIRECT_WRITERS = [
  { file: 'src/server/actions/payments/refund.ts', kind: 'human' },
  { file: 'src/server/payments/finalize.ts', kind: 'machine' },
  { file: 'src/app/api/payments/cardcom/webhook/route.ts', kind: 'machine' },
] as const

/** The insert literal that follows each from('audit_log') call. */
function auditInserts(source: string): string[] {
  const blocks: string[] = []
  const marker = /from\('audit_log'\)\s*\.insert\(\{/g
  let m = marker.exec(source)
  while (m) {
    blocks.push(source.slice(m.index, source.indexOf('})', m.index) + 2))
    m = marker.exec(source)
  }
  return blocks
}

function filesTouchingAuditLog(): string[] {
  const found: string[] = []
  const cwd = process.cwd()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
        if (readFileSync(full, 'utf8').includes("from('audit_log')")) {
          found.push(relative(cwd, full).split('\\').join('/'))
        }
      }
    }
  }
  walk(resolve(cwd, 'src'))
  return found.sort()
}

describe('direct audit_log inserts name their actor', () => {
  it('the list matches the tree: a NEW direct writer must appear here or use writeAuditLog', () => {
    expect(filesTouchingAuditLog()).toEqual(
      [...DIRECT_WRITERS.map((w) => w.file), 'src/lib/admin/audit.ts'].sort(),
    )
  })

  for (const writer of DIRECT_WRITERS) {
    it(`${writer.file} (${writer.kind})`, () => {
      const source = readFileSync(resolve(process.cwd(), writer.file), 'utf8')
      const inserts = auditInserts(source)
      expect(inserts.length, `${writer.file} has no direct audit insert anymore?`).toBeGreaterThan(
        0,
      )
      for (const block of inserts) {
        if (writer.kind === 'human') {
          expect(block, 'a human action must write the session actor').toMatch(
            /actor_id:\s*session\./,
          )
          expect(block).not.toMatch(/actor_id:\s*null/)
        } else {
          // Machine: null actor is fine ONLY with a named source or alarm.
          expect(block, 'a machine action must name itself in metadata').toMatch(/source:|alarm:/)
        }
      }
    })
  }
})
