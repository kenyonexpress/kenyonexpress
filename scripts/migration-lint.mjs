#!/usr/bin/env node
/**
 * Lints every file in migrations/pending/ for the properties an UNAPPLIED
 * migration must have in this repository:
 *
 *   1. idempotent DDL -- CREATE TABLE/INDEX carry IF NOT EXISTS, functions are
 *      OR REPLACE, policies are DROP POLICY IF EXISTS + CREATE (23505-on-rerun
 *      has bitten this repo before; see STATE 2026-08-20 03:20)
 *   2. a ROLLBACK note, because an apply that cannot name its undo is a plan
 *      with one direction
 *   3. the NOT APPLIED footer, so a file cannot pretend it ran
 *
 * Violations print per file; hard violations (non-idempotent CREATE) exit 1.
 *   node scripts/migration-lint.mjs
 *
 * THE ONE RULE THAT DECIDES WHETHER THIS GATE IS USABLE: structural checks read
 * the SQL with comments STRIPPED, and the two documentation checks read it with
 * comments INTACT. They are opposites on purpose.
 *
 * A `--` line cannot execute, so a CREATE INDEX inside one is prose, not DDL.
 * The ROLLBACK note and the NOT APPLIED footer, by contrast, are REQUIRED to be
 * comments -- stripping them before looking would fail every file in the
 * directory.
 *
 * This file already knew half of that. The policy check has stripped comments
 * since the day the first version "counted the words in its comments", and its
 * note called that a false positive that would have sent someone to fix a file
 * that was already idempotent. The DDL checks were left reading the raw text,
 * and on 2026-09-08 they did exactly the same thing to
 * 184_carts_one_row_per_owner.sql and preflight_184.sql -- both flagged HARD
 * for "CREATE INDEX without IF NOT EXISTS", both because a comment explains why
 * the migration does not use CONCURRENTLY. The migration's real DDL says
 * IF NOT EXISTS, and the preflight is read-only and creates nothing.
 *
 * A gate that a file cannot pass without deleting the paragraph explaining
 * itself is a gate that teaches people to stop explaining.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'migrations/pending'

/**
 * Comments removed, so a structural check reads statements only.
 *
 * Line-oriented rather than a SQL parser: every comment in this directory is a
 * whole `--` line, and a trailing-comment stripper would have to understand
 * string literals to avoid cutting a legitimate `--` inside one.
 */
export function stripSqlComments(sql) {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
}

/** @returns {{hard: boolean, msg: string}[]} */
export function lintSql(sql) {
  const problems = []
  const code = stripSqlComments(sql)

  if (/CREATE TABLE (?!IF NOT EXISTS)/i.test(code)) {
    problems.push({ hard: true, msg: 'CREATE TABLE without IF NOT EXISTS' })
  }
  if (/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/i.test(code)) {
    problems.push({ hard: true, msg: 'CREATE INDEX without IF NOT EXISTS' })
  }
  if (/CREATE FUNCTION/i.test(code) && !/CREATE OR REPLACE FUNCTION/i.test(code)) {
    problems.push({ hard: true, msg: 'CREATE FUNCTION without OR REPLACE' })
  }

  // Dynamic-EXECUTE blocks are not plain statements either. 122 creates its
  // policies inside a DO loop with its own duplicate_object guard.
  const createPolicies = (code.match(/^\s*CREATE POLICY/gim) ?? []).length
  const dropPolicies = (code.match(/DROP POLICY IF EXISTS/gi) ?? []).length
  const hasDoGuard = /duplicate_object/i.test(code) || /EXECUTE format\(/i.test(code)
  if (createPolicies > dropPolicies && !hasDoGuard) {
    problems.push({
      hard: true,
      msg: `${createPolicies} CREATE POLICY vs ${dropPolicies} DROP POLICY IF EXISTS`,
    })
  }

  // Deliberately against the RAW text: both of these live in comments.
  if (!/ROLLBACK/i.test(sql)) problems.push({ hard: false, msg: 'no ROLLBACK note' })
  if (!/NOT APPLIED/i.test(sql)) problems.push({ hard: false, msg: 'no NOT APPLIED footer' })

  return problems
}

export function lintDirectory(dir = DIR) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  let hard = 0
  let soft = 0

  for (const f of files) {
    const problems = lintSql(readFileSync(join(dir, f), 'utf8'))
    if (!problems.length) continue
    console.log(`\n${f}`)
    for (const p of problems) {
      console.log(`  ${p.hard ? 'HARD' : 'soft'}  ${p.msg}`)
      if (p.hard) hard++
      else soft++
    }
  }

  console.log(`\nmigration-lint: ${files.length} files, ${hard} hard, ${soft} soft`)
  return hard
}

// Only when run as a program. Importing this module must not scan or exit,
// because the tests import it.
if (process.argv[1]?.endsWith('migration-lint.mjs')) {
  process.exit(lintDirectory() > 0 ? 1 : 0)
}
