#!/usr/bin/env node
// db-doc.mjs
//
// Read-only database schema documentation generator.
// Connects to the Supabase Postgres database, introspects schema `public`
// via information_schema and pg_catalog, and writes docs/DB-SCHEMA.md.
//
// This script issues SELECT statements only. It never writes to the database.
//
// Connection: reads process.env.SUPABASE_DB_URL (the same variable documented
// in .env.example). This is the direct Postgres connection string, which is the
// simplest way to introspect the catalog with a read-only role. If you prefer to
// route through the service role instead, note that @supabase/supabase-js does
// not expose raw catalog queries without an RPC, so the direct SQL path below is
// used. No secret is hardcoded; the connection string comes from the environment.
//
// Usage:
//   SUPABASE_DB_URL=postgresql://... node scripts/db-doc.mjs
//
// The URL is typically loaded from your local .env by your shell or a tool such
// as `dotenv`; this script does not parse .env files itself.

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = resolve(__dirname, '..', 'docs', 'DB-SCHEMA.md')
const SCHEMA = 'public'

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('Missing SUPABASE_DB_URL. Set it in your environment (see .env.example) and retry.')
  process.exit(1)
}

// Guard: this script is read-only. We disable prepared statements and keep the
// pool tiny. Every query below is a SELECT against catalog views.
const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 5,
  prepare: false,
  // A belt-and-suspenders default: set the session to read only after connect.
  connection: { default_transaction_read_only: 'on' },
})

// Escape a value for safe inclusion inside a markdown table cell.
function cell(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

// Render a fenced value (default expressions, predicates) on a single line.
function inline(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
}

async function main() {
  // 1) Base tables in the target schema.
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ${SCHEMA} AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `

  // 2) Columns.
  const columns = await sql`
    SELECT
      table_name,
      column_name,
      ordinal_position,
      data_type,
      udt_name,
      character_maximum_length,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = ${SCHEMA}
    ORDER BY table_name, ordinal_position
  `

  // 3) Primary keys.
  const pks = await sql`
    SELECT tc.table_name,
           kcu.column_name,
           kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = ${SCHEMA}
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position
  `

  // 4) Foreign keys.
  const fks = await sql`
    SELECT tc.table_name,
           tc.constraint_name,
           kcu.column_name,
           ccu.table_name AS ref_table,
           ccu.column_name AS ref_column,
           rc.delete_rule,
           rc.update_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.table_schema = ccu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
     AND tc.constraint_schema = rc.constraint_schema
    WHERE tc.table_schema = ${SCHEMA}
      AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, kcu.column_name
  `

  // 5) Indexes.
  const indexes = await sql`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = ${SCHEMA}
    ORDER BY tablename, indexname
  `

  // 6) RLS policies.
  const policies = await sql`
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = ${SCHEMA}
    ORDER BY tablename, policyname
  `

  // 7) RLS enabled flag per table.
  const rls = await sql`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${SCHEMA} AND c.relkind = 'r'
  `

  // Index the results by table for grouped rendering.
  const byTable = (rows) => {
    const map = new Map()
    for (const r of rows) {
      const key = r.table_name ?? r.tablename
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    return map
  }

  const colsByTable = byTable(columns)
  const pkByTable = byTable(pks)
  const fkByTable = byTable(fks)
  const idxByTable = byTable(indexes)
  const polByTable = byTable(policies)
  const rlsByTable = new Map(rls.map((r) => [r.table_name, r.rls_enabled]))

  // Human readable type from information_schema row.
  const typeOf = (c) => {
    if (c.data_type === 'USER-DEFINED') return c.udt_name
    if (c.data_type === 'ARRAY') return c.udt_name
    if (c.data_type === 'character varying' && c.character_maximum_length)
      return `varchar(${c.character_maximum_length})`
    return c.data_type
  }

  const now = new Date().toISOString().slice(0, 10)
  const out = []

  out.push('# Database schema: `public`')
  out.push('')
  out.push(
    `Generated on ${now} by \`scripts/db-doc.mjs\` (read-only introspection of information_schema and pg_catalog).`,
  )
  out.push('')
  out.push(`Tables documented: ${tables.length}.`)
  out.push('')
  out.push('Regenerate with: `node scripts/db-doc.mjs` (requires SUPABASE_DB_URL).')
  out.push('')

  for (const { table_name } of tables) {
    out.push(`## ${table_name}`)
    out.push('')
    out.push(`RLS: ${rlsByTable.get(table_name) ? 'enabled' : 'disabled'}.`)
    out.push('')

    // Columns.
    out.push('### Columns')
    out.push('')
    out.push('| Column | Type | Nullable | Default |')
    out.push('| --- | --- | --- | --- |')
    for (const c of colsByTable.get(table_name) ?? []) {
      out.push(
        `| ${cell(c.column_name)} | ${cell(typeOf(c))} | ${
          c.is_nullable === 'YES' ? 'YES' : 'NO'
        } | ${cell(inline(c.column_default))} |`,
      )
    }
    out.push('')

    // Primary key.
    const pkCols = (pkByTable.get(table_name) ?? []).map((r) => r.column_name)
    out.push('### Primary key')
    out.push('')
    out.push(pkCols.length ? `- ${pkCols.join(', ')}` : '- (none)')
    out.push('')

    // Foreign keys.
    out.push('### Foreign keys')
    out.push('')
    const fkRows = fkByTable.get(table_name) ?? []
    if (fkRows.length === 0) {
      out.push('- (none)')
    } else {
      for (const f of fkRows) {
        out.push(
          `- ${cell(f.column_name)} references ${cell(f.ref_table)}.${cell(
            f.ref_column,
          )} (on delete ${cell(f.delete_rule)}, on update ${cell(f.update_rule)})`,
        )
      }
    }
    out.push('')

    // Indexes.
    out.push('### Indexes')
    out.push('')
    const idxRows = idxByTable.get(table_name) ?? []
    if (idxRows.length === 0) {
      out.push('- (none)')
    } else {
      for (const i of idxRows) {
        out.push(`- \`${inline(i.indexname)}\`: ${inline(i.indexdef)}`)
      }
    }
    out.push('')

    // RLS policies.
    out.push('### RLS policies')
    out.push('')
    const polRows = polByTable.get(table_name) ?? []
    if (polRows.length === 0) {
      out.push('- (none)')
    } else {
      out.push('| Policy | Command | Roles | Permissive | USING | WITH CHECK |')
      out.push('| --- | --- | --- | --- | --- | --- |')
      for (const p of polRows) {
        const roles = Array.isArray(p.roles) ? p.roles.join(', ') : cell(p.roles)
        out.push(
          `| ${cell(p.policyname)} | ${cell(p.cmd)} | ${cell(roles)} | ${
            p.permissive === 'PERMISSIVE' ? 'PERMISSIVE' : 'RESTRICTIVE'
          } | ${cell(inline(p.qual)) || '-'} | ${cell(inline(p.with_check)) || '-'} |`,
        )
      }
    }
    out.push('')
  }

  await writeFile(OUT_PATH, out.join('\n'), 'utf8')
  console.log(`Wrote ${OUT_PATH} (${tables.length} tables).`)
}

try {
  await main()
} catch (err) {
  console.error('db-doc failed:', err.message)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
