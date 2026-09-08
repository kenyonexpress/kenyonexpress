import { describe, expect, it } from 'vitest'
import { lintSql, stripSqlComments } from './migration-lint.mjs'

/**
 * THE GATE THAT FAILED CI FOR A PARAGRAPH.
 *
 * On 2026-09-08 this linter marked two files HARD for "CREATE INDEX without IF
 * NOT EXISTS". Neither was true. `184_carts_one_row_per_owner.sql` creates its
 * indexes WITH `IF NOT EXISTS` and carries a comment explaining why it does not
 * use CONCURRENTLY; `preflight_184.sql` is read-only and creates nothing at
 * all. Both were matched on their own prose.
 *
 * The rule these tests pin is the split: structural checks read the SQL with
 * comments stripped, the two documentation checks read it with comments intact.
 * Getting that backwards in either direction breaks the gate - one way it flags
 * every explanation, the other way it fails every file in the directory.
 */

const hard = (sql) =>
  lintSql(sql)
    .filter((p) => p.hard)
    .map((p) => p.msg)

describe('a comment is not a statement', () => {
  it('does not flag CREATE INDEX written inside a comment', () => {
    // The exact sentence that failed CI.
    const sql = `-- A plain CREATE INDEX takes SHARE on the table.
CREATE UNIQUE INDEX IF NOT EXISTS x ON public.t (c);`
    expect(hard(sql)).toEqual([])
  })

  it('does not flag a read-only preflight that only mentions the DDL', () => {
    const sql = `-- rewrite 184 with CREATE UNIQUE INDEX CONCURRENTLY
select count(*) from public.carts;`
    expect(hard(sql)).toEqual([])
  })

  it('does not flag CREATE TABLE or CREATE FUNCTION in prose', () => {
    expect(hard('-- CREATE TABLE t (id int);\nselect 1;')).toEqual([])
    expect(hard('-- CREATE FUNCTION f() ...\nselect 1;')).toEqual([])
  })
})

describe('real DDL is still caught, which is the point of the gate', () => {
  it('flags a bare CREATE INDEX', () => {
    expect(hard('CREATE INDEX x ON public.t (c);')).toEqual(['CREATE INDEX without IF NOT EXISTS'])
  })

  it('flags a bare CREATE UNIQUE INDEX', () => {
    expect(hard('CREATE UNIQUE INDEX x ON public.t (c);')).toEqual([
      'CREATE INDEX without IF NOT EXISTS',
    ])
  })

  it('flags a bare CREATE TABLE', () => {
    expect(hard('CREATE TABLE t (id int);')).toEqual(['CREATE TABLE without IF NOT EXISTS'])
  })

  it('flags CREATE FUNCTION without OR REPLACE, and accepts it with', () => {
    expect(hard('CREATE FUNCTION f() RETURNS int AS $$ select 1 $$ LANGUAGE sql;')).toEqual([
      'CREATE FUNCTION without OR REPLACE',
    ])
    expect(
      hard('CREATE OR REPLACE FUNCTION f() RETURNS int AS $$ select 1 $$ LANGUAGE sql;'),
    ).toEqual([])
  })

  it('accepts the idempotent forms', () => {
    expect(hard('CREATE TABLE IF NOT EXISTS t (id int);')).toEqual([])
    expect(hard('CREATE INDEX IF NOT EXISTS x ON public.t (c);')).toEqual([])
  })

  it('still counts unguarded CREATE POLICY, the rule that predates this fix', () => {
    expect(hard('CREATE POLICY p ON public.t FOR SELECT USING (true);')).toEqual([
      '1 CREATE POLICY vs 0 DROP POLICY IF EXISTS',
    ])
    expect(
      hard(`DROP POLICY IF EXISTS p ON public.t;
CREATE POLICY p ON public.t FOR SELECT USING (true);`),
    ).toEqual([])
  })
})

/**
 * The inverse half. These two markers are REQUIRED to be comments, so they must
 * be read before stripping. A future refactor that strips once and checks
 * everything against the stripped text would make every file in the directory
 * report both of these.
 */
describe('the documentation markers are read with comments intact', () => {
  const soft = (sql) =>
    lintSql(sql)
      .filter((p) => !p.hard)
      .map((p) => p.msg)

  it('accepts a ROLLBACK note and a NOT APPLIED footer written as comments', () => {
    const sql = `-- NOT APPLIED. Run preflight first.
select 1;
-- ROLLBACK
--   DROP INDEX IF EXISTS public.x;`
    expect(soft(sql)).toEqual([])
  })

  it('reports both when they are absent', () => {
    expect(soft('select 1;')).toEqual(['no ROLLBACK note', 'no NOT APPLIED footer'])
  })
})

describe('stripSqlComments', () => {
  it('drops whole comment lines and keeps statements', () => {
    expect(stripSqlComments('-- a\nselect 1;\n  -- b\nselect 2;')).toBe('select 1;\nselect 2;')
  })

  it('keeps a line whose comment marker is not at the start', () => {
    // Line-oriented on purpose: cutting mid-line would need to understand
    // string literals to avoid slicing a legitimate `--` inside one.
    expect(stripSqlComments("select '--x';")).toBe("select '--x';")
  })
})
