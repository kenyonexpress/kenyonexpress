import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every admin mutation file must call `writeAuditLog`. The helper is the only
 * writer of `audit_log` (RLS blocks authenticated inserts). A new action that
 * skips it is a write without actor/before/after/IP.
 */

const ADMIN_ACTIONS = join(process.cwd(), 'src/server/actions/admin')

const READ_ONLY = new Set(['quick-search.ts', 'upload.ts', 'images.ts'])

function actionFiles(): string[] {
  return readdirSync(ADMIN_ACTIONS)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .filter((name) => !READ_ONLY.has(name))
}

describe('admin mutations write an audit row', () => {
  it('calls writeAuditLog in every mutating admin action module', () => {
    const missing = actionFiles().filter((name) => {
      const source = readFileSync(join(ADMIN_ACTIONS, name), 'utf8')
      return !source.includes('writeAuditLog')
    })
    expect(missing).toEqual([])
  })
})
