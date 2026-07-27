/**
 * Static analysis of the enum declarations in supabase/migrations.
 *
 * House rule: every migration is idempotent, and an enum is made idempotent with
 *
 *   DO $$ BEGIN CREATE TYPE ... AS ENUM (...); EXCEPTION WHEN duplicate_object THEN null; END $$;
 *
 * That guard cannot tell "already applied" from "a type of this name already
 * exists with DIFFERENT values". When a later migration re-declares an enum with
 * an extra value, the earlier declaration wins on every database built in order
 * and the extra value silently never exists. Writing it then raises 22P02 at
 * runtime, far away from the migration that thought it had added it.
 *
 * That is not hypothetical. payout_status was declared with four values in 026
 * and re-declared with five in 027; 'pending_approval' never existed, and
 * generate_payout_statement raised on its final UPDATE, which is one of the two
 * reasons the payout engine was dead code (see migration 083).
 *
 * The repair is always `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, which is what
 * `addedValues` looks for.
 */

export type EnumDeclaration = { file: string; values: string[]; supersedes: boolean }

const CREATE_ENUM = /CREATE TYPE\s+(?:public\.)?(\w+)\s+AS ENUM\s*\(([^)]*)\)/gi
const DROP_ENUM = /DROP TYPE\s+(?:IF EXISTS\s+)?(?:public\.)?(\w+)/gi
const ADD_VALUE = /ALTER TYPE\s+(?:public\.)?(\w+)\s+ADD VALUE(?:\s+IF NOT EXISTS)?\s+'([^']+)'/gi

export function parseEnumDeclarations(
  files: { name: string; sql: string }[],
): Map<string, EnumDeclaration[]> {
  const out = new Map<string, EnumDeclaration[]>()
  for (const { name, sql } of files) {
    const dropped = new Set<string>()
    DROP_ENUM.lastIndex = 0
    let drop = DROP_ENUM.exec(sql)
    while (drop) {
      dropped.add(drop[1] as string)
      drop = DROP_ENUM.exec(sql)
    }

    CREATE_ENUM.lastIndex = 0
    let match = CREATE_ENUM.exec(sql)
    while (match) {
      const typeName = match[1] as string
      const values = [...(match[2] as string).matchAll(/'([^']+)'/g)].map((m) => m[1] as string)
      const list = out.get(typeName) ?? []
      // A file that drops the type first is not shadowed by an earlier
      // declaration: 006, 007 and 008 all DROP TYPE IF EXISTS before their
      // CREATE, which is exactly why their value sets are the ones live
      // databases carry. 005 does not, so 001 wins over it.
      list.push({ file: name, values, supersedes: dropped.has(typeName) })
      out.set(typeName, list)
      match = CREATE_ENUM.exec(sql)
    }
  }
  return out
}

/** Values reachable through ALTER TYPE ... ADD VALUE, keyed by enum name. */
export function parseAddedValues(files: { name: string; sql: string }[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const { sql } of files) {
    ADD_VALUE.lastIndex = 0
    let match = ADD_VALUE.exec(sql)
    while (match) {
      const typeName = match[1] as string
      const set = out.get(typeName) ?? new Set<string>()
      set.add(match[2] as string)
      out.set(typeName, set)
      match = ADD_VALUE.exec(sql)
    }
  }
  return out
}

export type UnreachableValue = {
  enumName: string
  value: string
  declaredIn: string
  /** The declaration that actually wins, because it runs first. */
  shadowedBy: string
}

/**
 * Values a later CREATE TYPE introduces that the first declaration lacks and
 * that no ALTER TYPE ever adds. Each one is a literal the code may write and the
 * database will reject.
 */
export function unreachableEnumValues(files: { name: string; sql: string }[]): UnreachableValue[] {
  const declarations = parseEnumDeclarations(files)
  const added = parseAddedValues(files)
  const problems: UnreachableValue[] = []

  for (const [enumName, list] of declarations) {
    if (list.length < 2) continue
    // The declaration that survives is the last one that dropped the type
    // first, or the very first one if none did.
    let winnerIndex = 0
    for (let i = list.length - 1; i > 0; i--) {
      if ((list[i] as EnumDeclaration).supersedes) {
        winnerIndex = i
        break
      }
    }
    const winner = list[winnerIndex] as EnumDeclaration
    const reachable = new Set([...winner.values, ...(added.get(enumName) ?? [])])
    for (const later of list.slice(winnerIndex + 1)) {
      for (const value of later.values) {
        if (reachable.has(value)) continue
        problems.push({
          enumName,
          value,
          declaredIn: later.file,
          shadowedBy: winner.file,
        })
        reachable.add(value) // report each value once
      }
    }
  }
  return problems.sort(
    (a, b) => a.enumName.localeCompare(b.enumName) || a.value.localeCompare(b.value),
  )
}
