import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseApplyOrder, runDryRun } from '../../scripts/migration-dry-run.mjs'

const PENDING_DIR = 'migrations/pending'

describe('docs/APPLY-ORDER.md', () => {
  const text = readFileSync(resolve(process.cwd(), 'docs/APPLY-ORDER.md'), 'utf8')
  const order = parseApplyOrder(text)
  const onDisk = readdirSync(resolve(process.cwd(), PENDING_DIR))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  it('lists every pending SQL file as remaining or already applied', () => {
    const listed = [...order.remaining, ...order.applied].sort()
    expect(listed).toEqual(onDisk)
  })

  it('does not list a file twice', () => {
    const all = [...order.remaining, ...order.applied]
    expect(new Set(all).size).toBe(all.length)
  })

  it('keeps 122 then 125 through 147 in the remaining sequence, with no 148 yet', () => {
    expect(order.remaining[0]).toBe('122_deny_all_on_server_only_tables.sql')
    expect(order.remaining[1]).toBe('125_expire_vouchers_drop_escrow.sql')
    expect(order.remaining.at(-1)).toBe('147_money_agorot_remaining_twins.sql')
    expect(text).toContain('122 → 125 → 126 → 127 → 131 → 132 → 133 → 137 → 147')
    expect(text).not.toMatch(/148_[\w-]+\.sql/)
  })

  it('refuses the in-place money rewrite', () => {
    expect(text).toMatch(/142/)
    expect(text.toLowerCase()).toContain('never apply')
  })

  it('names git revert as the code rollback', () => {
    expect(text).toContain('git revert --no-edit')
  })
})

describe('migration dry-run against this tree', () => {
  it('passes structurally and does not open a live database', () => {
    const result = runDryRun({ live: false })
    expect(result.errors, result.errors.join('\n')).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.liveUrl).toBe('')
  })
})
