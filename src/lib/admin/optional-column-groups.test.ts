import { describe, expect, it } from 'vitest'
import {
  type OptionalColumnGroup,
  missingColumnGroup,
  writeWithOptionalColumns,
} from './optional-column-groups'

const PGRST204 = (column: string) =>
  `Could not find the '${column}' column of 'products' in the schema cache`

function group(
  key: string,
  fields: Record<string, unknown>,
  atDefault: boolean,
): OptionalColumnGroup {
  return { key, columns: Object.keys(fields), fields, atDefault, notice: `apply ${key}` }
}

/** A fake database that knows only `known` columns. Records every attempt. */
function fakeDb(known: readonly string[]) {
  const attempts: Record<string, unknown>[] = []
  const run = async (extra: Record<string, unknown>) => {
    attempts.push(extra)
    const unknown = Object.keys(extra).find((c) => !known.includes(c))
    return unknown
      ? { data: null, error: { message: PGRST204(unknown), code: 'PGRST204' } }
      : { data: { id: 'p1' }, error: null }
  }
  return { run, attempts }
}

describe('missingColumnGroup', () => {
  it('finds the group whose column PostgREST reports as missing', () => {
    const a = group('a', { x: 1 }, true)
    const b = group('b', { y: 2 }, true)
    expect(missingColumnGroup(PGRST204('y'), [a, b])).toBe(b)
    expect(missingColumnGroup('column "x" does not exist', [a, b])).toBe(a)
  })

  it('leaves a real error about a real column alone', () => {
    // A CHECK named after the column mentions it and is not a missing column.
    const a = group('a', { x: 1 }, true)
    expect(missingColumnGroup('new row violates check constraint "products_x_len"', [a])).toBeNull()
    expect(missingColumnGroup(null, [a])).toBeNull()
    expect(missingColumnGroup('', [a])).toBeNull()
  })
})

describe('writeWithOptionalColumns', () => {
  it('costs one call on a migrated database and drops nothing', async () => {
    const db = fakeDb(['x', 'y'])
    const result = await writeWithOptionalColumns(
      [group('a', { x: 1 }, true), group('b', { y: 2 }, false)],
      db.run,
    )
    expect(result.error).toBeNull()
    expect(result.dropped).toEqual([])
    expect(db.attempts).toEqual([{ x: 1, y: 2 }])
  })

  it('drops a default group whose column is missing and retries, once per group', async () => {
    const db = fakeDb([])
    const result = await writeWithOptionalColumns(
      [group('a', { x: 1 }, true), group('b', { y: 2 }, true)],
      db.run,
    )
    expect(result.error).toBeNull()
    expect(result.dropped.sort()).toEqual(['a', 'b'])
    expect(db.attempts).toHaveLength(3)
    expect(db.attempts[2]).toEqual({})
  })

  it('refuses to drop a group the admin filled in, and names the migration', async () => {
    // The one direction that matters: a typed value must never be written
    // nowhere and reported as saved.
    const db = fakeDb(['x'])
    const result = await writeWithOptionalColumns(
      [group('a', { x: 1 }, true), group('b', { y: 2 }, false)],
      db.run,
    )
    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('apply b')
    expect(result.error?.code).toBe('PGRST204')
    expect(db.attempts).toHaveLength(1)
  })

  it('surfaces any other failure untouched', async () => {
    const run = async () => ({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "products_slug_key"' },
    })
    const result = await writeWithOptionalColumns([group('a', { x: 1 }, true)], run)
    expect(result.error?.message).toContain('duplicate key')
    expect(result.dropped).toEqual([])
  })

  it('ignores an empty group entirely', async () => {
    const db = fakeDb([])
    const result = await writeWithOptionalColumns([group('a', {}, true)], db.run)
    expect(result.error).toBeNull()
    expect(db.attempts).toEqual([{}])
  })
})
