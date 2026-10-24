import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const manifest = JSON.parse(readFileSync(join(root, 'supabase/rls-manifest.json'), 'utf8')) as {
  tables: Array<{ table_name: string }>
}
const sql = readFileSync(join(root, 'tests/sql/rls_all_public_tables.test.sql'), 'utf8')

describe('pgTAP RLS suite covers every public table in the manifest', () => {
  it('asserts RLS and a policy for each table', () => {
    const missing = manifest.tables
      .map((t) => t.table_name)
      .filter(
        (name) =>
          !sql.includes(`'RLS is on for ${name}'`) ||
          !sql.includes(`'${name} has at least one policy'`),
      )
    expect(missing).toEqual([])
  })

  it('declares a plan that matches the assertions', () => {
    const planned = Number(/select plan\((\d+)\)/.exec(sql)?.[1])
    expect(planned).toBe(manifest.tables.length * 3 + 2)
  })
})
