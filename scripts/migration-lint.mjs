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
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'migrations/pending'
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
let hard = 0
let soft = 0

for (const f of files) {
  const sql = readFileSync(join(DIR, f), 'utf8')
  const problems = []

  for (const m of sql.matchAll(/CREATE TABLE (?!IF NOT EXISTS)/gi)) {
    problems.push({ hard: true, msg: 'CREATE TABLE without IF NOT EXISTS' })
    void m
    break
  }
  for (const m of sql.matchAll(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/gi)) {
    problems.push({ hard: true, msg: 'CREATE INDEX without IF NOT EXISTS' })
    void m
    break
  }
  if (/CREATE FUNCTION/i.test(sql) && !/CREATE OR REPLACE FUNCTION/i.test(sql)) {
    problems.push({ hard: true, msg: 'CREATE FUNCTION without OR REPLACE' })
  }
  // Comments and dynamic-EXECUTE blocks are not statements. 122 creates its
  // policies inside a DO loop with its own duplicate_object guard, and the
  // first version of this linter counted the words in its comments -- a false
  // positive that would have sent someone to "fix" a file that is already
  // idempotent by a stronger mechanism.
  const code = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
  const createPolicies = (code.match(/^\s*CREATE POLICY/gim) ?? []).length
  const dropPolicies = (code.match(/DROP POLICY IF EXISTS/gi) ?? []).length
  const hasDoGuard = /duplicate_object/i.test(code) || /EXECUTE format\(/i.test(code)
  if (createPolicies > dropPolicies && !hasDoGuard) {
    problems.push({
      hard: true,
      msg: `${createPolicies} CREATE POLICY vs ${dropPolicies} DROP POLICY IF EXISTS`,
    })
  }
  if (!/ROLLBACK/i.test(sql)) problems.push({ hard: false, msg: 'no ROLLBACK note' })
  if (!/NOT APPLIED/i.test(sql)) problems.push({ hard: false, msg: 'no NOT APPLIED footer' })

  if (problems.length) {
    console.log(`\n${f}`)
    for (const p of problems) {
      console.log(`  ${p.hard ? 'HARD' : 'soft'}  ${p.msg}`)
      if (p.hard) hard++
      else soft++
    }
  }
}

console.log(`\nmigration-lint: ${files.length} files, ${hard} hard, ${soft} soft`)
process.exit(hard > 0 ? 1 : 0)
