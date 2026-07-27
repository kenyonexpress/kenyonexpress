import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAddedValues, parseEnumDeclarations, unreachableEnumValues } from './enum-declarations'

function migrations(): { name: string; sql: string }[] {
  const dir = resolve(process.cwd(), 'supabase/migrations')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }))
}

describe('enum declaration parsing', () => {
  it('collects every CREATE TYPE ... AS ENUM per type, in file order', () => {
    const parsed = parseEnumDeclarations([
      { name: '001.sql', sql: "CREATE TYPE public.thing AS ENUM ('a', 'b');" },
      { name: '002.sql', sql: "CREATE TYPE thing AS ENUM ('a', 'b', 'c');" },
    ])
    expect(parsed.get('thing')).toEqual([
      { file: '001.sql', values: ['a', 'b'], supersedes: false },
      { file: '002.sql', values: ['a', 'b', 'c'], supersedes: false },
    ])
  })

  it('collects ALTER TYPE ... ADD VALUE with and without IF NOT EXISTS', () => {
    const parsed = parseAddedValues([
      { name: '003.sql', sql: "ALTER TYPE public.thing ADD VALUE IF NOT EXISTS 'c';" },
      { name: '004.sql', sql: "ALTER TYPE thing ADD VALUE 'd' AFTER 'a';" },
    ])
    expect([...(parsed.get('thing') ?? [])].sort()).toEqual(['c', 'd'])
  })
})

describe('unreachableEnumValues', () => {
  it('flags a value a later CREATE TYPE adds that nothing ever ALTERs in', () => {
    const problems = unreachableEnumValues([
      { name: '026.sql', sql: "CREATE TYPE public.payout_status AS ENUM ('draft', 'approved');" },
      {
        name: '027.sql',
        sql: "CREATE TYPE public.payout_status AS ENUM ('draft', 'pending_approval', 'approved');",
      },
    ])
    expect(problems).toEqual([
      {
        enumName: 'payout_status',
        value: 'pending_approval',
        declaredIn: '027.sql',
        shadowedBy: '026.sql',
      },
    ])
  })

  it('clears the value once an ALTER TYPE adds it', () => {
    const problems = unreachableEnumValues([
      { name: '026.sql', sql: "CREATE TYPE public.payout_status AS ENUM ('draft', 'approved');" },
      {
        name: '027.sql',
        sql: "CREATE TYPE public.payout_status AS ENUM ('draft', 'pending_approval', 'approved');",
      },
      {
        name: '083.sql',
        sql: "ALTER TYPE public.payout_status ADD VALUE IF NOT EXISTS 'pending_approval';",
      },
    ])
    expect(problems).toEqual([])
  })

  it('lets a declaration that DROPs the type first win, which is how 006-008 do it', () => {
    expect(
      unreachableEnumValues([
        { name: '001.sql', sql: "CREATE TYPE public.s AS ENUM ('old');" },
        {
          name: '007.sql',
          sql: "DROP TYPE IF EXISTS public.s;\nCREATE TYPE public.s AS ENUM ('a', 'b');",
        },
      ]),
    ).toEqual([])
  })

  it('says nothing about an enum declared once', () => {
    expect(
      unreachableEnumValues([
        { name: '001.sql', sql: "CREATE TYPE public.thing AS ENUM ('a', 'b');" },
      ]),
    ).toEqual([])
  })

  it('ignores a re-declaration that only drops values, which costs nothing', () => {
    // 046 re-declares payment_status without 'cancelled'. The first declaration
    // wins and keeps it, so no literal becomes unwritable.
    expect(
      unreachableEnumValues([
        { name: '026.sql', sql: "CREATE TYPE public.s AS ENUM ('a', 'b', 'c');" },
        { name: '046.sql', sql: "CREATE TYPE public.s AS ENUM ('a', 'b');" },
      ]),
    ).toEqual([])
  })
})

describe('the real migration tree', () => {
  /**
   * The regression guard. Every value in here is a literal some migration
   * believes it declared and that no database built in order actually has, so
   * writing it raises 22P02 at runtime. payout_status.pending_approval sat in
   * this list until migration 083 and took the whole payout engine down with it.
   *
   * A new entry means: add `ALTER TYPE ... ADD VALUE IF NOT EXISTS` in a fresh
   * migration, not a value to this list.
   */
  /**
   * The one value that is unreachable on purpose. 066 added 'subscription' to
   * replace 'service', and 067 migrates legacy rows across while guarding on
   * pg_enum "because fresh databases build the enum without 'service' at all".
   * It is retired vocabulary, not a missing value, so restoring it would undo a
   * deliberate decision. src/types/database.ts and src/db/schema/commerce.ts
   * still name it, which is stale generated output, not a reason to add it back.
   */
  const RETIRED = new Set(['product_type.service'])

  it('has no enum value that a later CREATE TYPE adds and no ALTER TYPE ever reaches', () => {
    const problems = unreachableEnumValues(migrations()).filter(
      (p) => !RETIRED.has(`${p.enumName}.${p.value}`),
    )
    const described = problems.map(
      (p) => `${p.enumName}.${p.value} (declared in ${p.declaredIn}, shadowed by ${p.shadowedBy})`,
    )
    expect(described, `unwritable enum values:\n  ${described.join('\n  ')}`).toEqual([])
  })
})
